import { expect, it } from "vitest";
import { viteFixture } from "../../integration-tests/tests/helpers/vite.ts";
import { routerPlugin as preactRouter } from "../src/preact.ts";
import { routerPlugin as reactRouter } from "../src/react.ts";

for (const [framework, plugin] of [
  ["react", reactRouter],
  ["preact", preactRouter],
] as const) {
  it(`uses the ${framework} adapter for browser transport and server routes`, async (context) => {
    const { server } = await viteFixture(
      context,
      'export { loader } from "../../handlers.ts"; export const clientLoader = () => "client";',
      { framework: framework === "react" ? "preact" : "react" },
      plugin,
    );
    const resolved = await server.pluginContainer.resolveId(
      "virtual:smolter/routes",
    );
    const loaded = await server.pluginContainer.load(resolved!.id);
    const code = typeof loaded === "string" ? loaded : loaded?.code;
    expect(code).toContain(`@kasperrt/smolter/${framework}/client`);
    const rendered = await server.ssrLoadModule("virtual:smolter/routes");
    expect(rendered.default[0].path).toBe("/");
    expect(await rendered.default[0].loader()).toBe(1);
    expect(await rendered.default[0].clientLoader()).toBe("client");
  });
}
