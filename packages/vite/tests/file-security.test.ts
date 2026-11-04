import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileRouter } from "@smolter/vite";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { viteFixture } from "../../integration-tests/tests/helpers/vite.ts";

it("retains Vite's secret-file and outside-root protections with Smolter transport installed", async (context) => {
  const secret = "SYNTHETIC_SECRET_DO_NOT_SERVE";
  const source = `API_KEY="${secret}"`;
  const { root, server } = await viteFixture(
    context,
    'export const loader = () => "public data";',
    { dataEndpoint: "/_smolter" },
    undefined,
    { ".env": source, ".env.local": source },
  );
  const outside = await mkdtemp(join(tmpdir(), "smolter-outside-"));
  context.onTestFinished(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, "private.txt"), secret);
  await writeFile(
    join(outside, "private.ts"),
    `export const secret = "${secret}";`,
  );
  await symlink(
    join(outside, "private.ts"),
    join(root, "src/routes/private.ts"),
  );
  await mkdir(join(root, "src/routes/escaped"));
  await symlink(
    join(outside, "private.ts"),
    join(root, "src/routes/escaped/route.ts"),
  );
  const base = server.resolvedUrls!.local[0];
  expect((await fetch(`${base}.__smolter`)).status).toBe(200);
  for (const path of [
    ".env?smolter-client",
    ".env.local?smolter-client",
    `@fs${root}/.env?smolter-client`,
    `@fs${outside}/private.ts?smolter-client`,
    "src/routes/private.ts?smolter-client",
    "handlers.ts?smolter-client",
    "src/routes/escaped/route.ts?smolter-client",
    ".env",
    ".env.local",
    "%2eenv",
    ".env?raw",
    ".env?url",
    ".env?import",
    `@fs${root}/.env`,
    `@fs${root}/.env?raw`,
    `@fs${outside}/private.txt`,
    ".env.__smolter",
    "_smolter?url=%2F.env",
    "_smolter?url=%2F..%2F.env",
  ]) {
    const response = await fetch(`${base}${path}`);
    expect(response.status, path).not.toBe(200);
    expect(await response.text(), path).not.toContain(secret);
  }
});

it("enforces deny rules and canonical containment when symlink preservation is enabled", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "smolter-symlink-security-"));
  const outside = await mkdtemp(join(tmpdir(), "smolter-private-"));
  context.onTestFinished(() => rm(root, { recursive: true, force: true }));
  context.onTestFinished(() => rm(outside, { recursive: true, force: true }));
  await mkdir(join(root, "src/routes"), { recursive: true });
  const secret = "SYNTHETIC_PRIVATE_MODULE";
  await writeFile(join(outside, "route.ts"), `export default "${secret}";`);
  await symlink(join(outside, "route.ts"), join(root, "src/routes/escape.ts"));
  await writeFile(
    join(root, "src/routes/blocked.ts"),
    `export default "${secret}";`,
  );
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [fileRouter()],
    resolve: { preserveSymlinks: true },
    server: { port: 0, fs: { deny: ["**/blocked.ts"] } },
  });
  context.onTestFinished(() => server.close());
  await server.listen();
  for (const path of ["escape", "blocked"]) {
    const response = await fetch(
      `${server.resolvedUrls!.local[0]}src/routes/${path}.ts?smolter-client`,
    );
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain(secret);
  }
});
