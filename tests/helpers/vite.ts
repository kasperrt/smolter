import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type FileRouterOptions, fileRouter } from "@smolter/vite";
import { createServer } from "vite";
import type { TestContext } from "vitest";

export async function viteFixture(
  context: TestContext,
  source: string,
  options: FileRouterOptions = {},
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "smolter-vite-")));
  const directory = join(root, "src/routes");
  const route = join(directory, "_index.ts");

  context.onTestFinished(() => rm(root, { recursive: true, force: true }));

  await mkdir(directory, { recursive: true });
  await writeFile(route, source);
  await writeFile(
    join(root, "handlers.ts"),
    "export const loader = () => 1; export const action = () => 2;",
  );

  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [fileRouter(options)],
    resolve: {
      alias: {
        "@kasperrt/smolter/react/client": resolve(
          "packages/client/src/index.ts",
        ),
        "@kasperrt/smolter/react/server": resolve(
          "packages/server/src/index.ts",
        ),
      },
    },
    // Keep separate edits outside the watcher's 100 ms change-event throttle.
    server: { port: 0, watch: { usePolling: true, interval: 150 } },
  });

  context.onTestFinished(() => server.close());

  await server.listen();

  return { root, route, server };
}
