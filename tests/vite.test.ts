import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { fileRouter } from "../packages/smolter/src/vite";

it("refreshes server transport when route handler exports change", async (context) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "smolter-vite-")));
  const directory = join(root, "src/routes");
  const route = join(directory, "_index.ts");
  const view = "export default function View() { return null; }\n";

  context.onTestFinished(() => rm(root, { recursive: true, force: true }));

  await mkdir(directory, { recursive: true });
  await writeFile(route, view);
  await writeFile(
    join(root, "handlers.ts"),
    "export const loader = () => 1; export const action = () => 2;",
  );

  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [fileRouter()],
    resolve: {
      alias: { "smolter/client": resolve("packages/smolter/src/client.ts") },
    },
    server: { port: 0, watch: { usePolling: true, interval: 20 } },
  });

  context.onTestFinished(() => server.close());

  await server.listen();

  const source = async () =>
    (await server.transformRequest("virtual:smolter/routes"))?.code ?? "";

  expect(await source()).not.toContain("serverRoute(");

  await writeFile(
    route,
    `${view}export { loader, action } from "../../handlers.ts";\n`,
  );

  await expect.poll(source).toContain("serverRoute(");

  await writeFile(route, view);

  await expect.poll(source).not.toContain("serverRoute(");
});
