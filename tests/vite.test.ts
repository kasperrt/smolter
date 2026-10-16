import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { viteFixture } from "./helpers/vite";

it("refreshes server transport when route handler exports change", async (context) => {
  const view = "export default function View() { return null; }\n";
  const { route, server } = await viteFixture(context, view);

  const source = async () =>
    (await server.transformRequest("virtual:smolter/routes"))?.code ?? "";

  expect(await source()).not.toContain("serverRoute(");

  await writeFile(
    route,
    `${view}export { loader, action } from "../../handlers.ts";\n`,
  );

  await expect.poll(source, { timeout: 3000 }).toContain("serverRoute(");

  await writeFile(route, view);

  await expect.poll(source, { timeout: 3000 }).not.toContain("serverRoute(");
});
