import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { viteFixture } from "../../integration-tests/tests/helpers/vite.ts";

it("retains Vite's secret-file and outside-root protections with Smolter transport installed", async (context) => {
  const secret = "SYNTHETIC_SECRET_DO_NOT_SERVE";
  const { root, server } = await viteFixture(
    context,
    'export const loader = () => "public data";',
    { dataEndpoint: "/_smolter" },
    undefined,
    { ".env": secret, ".env.local": secret },
  );
  const outside = await mkdtemp(join(tmpdir(), "smolter-outside-"));
  context.onTestFinished(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, "private.txt"), secret);
  const base = server.resolvedUrls!.local[0];
  expect((await fetch(`${base}.__smolter`)).status).toBe(200);
  for (const path of [
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
