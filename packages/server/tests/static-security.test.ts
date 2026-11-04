import { fork } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";

it.each(["react", "preact"])(
  "%s production assets cannot expose hidden files or escape the asset directory",
  async (framework) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-static-security-"));
    onTestFinished(() => rm(root, { recursive: true, force: true }));
    await Promise.all(
      [
        "server",
        "dist/server",
        "dist/assets/nested",
        "dist/assets/.git",
        "dist/assets-private",
      ].map((path) => mkdir(join(root, path), { recursive: true })),
    );
    const secret = "SYNTHETIC_SECRET_DO_NOT_SERVE";
    await Promise.all([
      writeFile(join(root, "package.json"), '{"type":"module"}'),
      writeFile(join(root, "dist/index.html"), "SSR template"),
      writeFile(
        join(root, "dist/server/server.js"),
        'export const data = () => Response.json(null); export const render = () => "SSR response";',
      ),
      writeFile(join(root, "dist/assets/app.js"), "public asset"),
      ...[
        ".env",
        "dist/.env",
        "dist/assets/.env",
        "dist/assets/.env.production",
        "dist/assets/nested/.env",
        "dist/assets/.git/config",
        "dist/assets-private/secret.js",
        "secret.js",
      ].map((path) => writeFile(join(root, path), secret)),
    ]);
    await symlink(join(root, "secret.js"), join(root, "dist/assets/linked.js"));
    await symlink(
      join(root, "dist/assets-private"),
      join(root, "dist/assets/linked"),
    );
    await symlink(
      join(root, "dist/assets/.env"),
      join(root, "dist/assets/hidden-link.js"),
    );
    const source = await readFile(
      `apps/${framework}-ssr/server/start.mjs`,
      "utf8",
    );
    const entry = join(root, "server/start.mjs");
    await writeFile(
      entry,
      `${source
        .replace(
          "@kasperrt/smolter/utils/http",
          new URL("../../../dist/server/node.js", import.meta.url).href,
        )
        .replace(
          "@smolter/core",
          new URL("../../../dist/core/errors.js", import.meta.url).href,
        )
        .replace(
          "createServer(async (incoming",
          "const server = createServer(async (incoming",
        )}\nserver.on("listening", () => process.send(server.address().port));\n`,
    );
    const child = fork(entry, {
      env: { ...process.env, PORT: "0" },
      silent: true,
    });
    onTestFinished(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill();
      await exited;
    });
    const [port] = await once(child, "message");
    const request = (path: string) =>
      new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          get({ hostname: "127.0.0.1", port, path }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              body += chunk;
            });
            response.on("end", () =>
              resolve({ status: response.statusCode, body }),
            );
            response.on("error", reject);
          }).on("error", reject);
        },
      );
    expect(await request("/assets/app.js")).toEqual({
      status: 200,
      body: "public asset",
    });
    for (const path of [
      "/.env",
      "/assets/.env",
      "/assets/.env.production",
      "/assets/nested/.env",
      "/assets/.git/config",
      "/assets/../.env",
      "/assets/%2e%2e/.env",
      "/assets/%2e%2e%2f.env",
      "/assets/%252e%252e%252f.env",
      "/assets/%2eenv",
      "/assets/nested%2f.env",
      "/assets/%2e%2e%5c.env",
      "/assets/..\\.env",
      "/assets/../../.env",
      "/assets/../assets-private/secret.js",
      "/assets/linked.js",
      "/assets/hidden-link.js",
      "/assets/linked/secret.js",
      "/assets/%00.env",
      "/assets/%zz",
      "/assets/missing.js",
    ]) {
      const result = await request(path);
      expect.soft(result.body, path).not.toContain(secret);
      if (new URL(path, "http://local").pathname.startsWith("/assets/"))
        expect.soft(result.status, path).not.toBe(200);
    }
  },
);
