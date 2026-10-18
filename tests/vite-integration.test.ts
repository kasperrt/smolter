import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { viteFixture } from "./helpers/vite";

it("keeps client handlers in browser route modules", async (context) => {
  const { server } = await viteFixture(
    context,
    'export const clientLoader = () => "Browser data";',
  );
  const result = await server.transformRequest(
    "/src/routes/_index.ts?smolter-client",
  );

  expect(result?.code).toContain("clientLoader");
  expect(result?.code).toContain("Browser data");
});

it("dispatches HTTP reads and mutations to server route exports", async (context) => {
  const { root, server } = await viteFixture(
    context,
    'export { loader, action } from "../../handlers.ts";',
  );

  await writeFile(
    join(root, "handlers.ts"),
    `
    export const loader = ({ request }) => ({ cookie: request.headers.get("cookie") });

    export const action = async ({ request }) => ({
      method: request.method,
      amount: (await request.formData()).get("amount"),
    });
  `,
  );

  const base = server.resolvedUrls!.local[0];
  const endpoint = `${base}.__smolter`;
  const read = await fetch(endpoint, { headers: { cookie: "session=test" } });

  expect(await read.json()).toEqual({ cookie: "session=test" });

  const body = new FormData();

  body.set("amount", "3");

  const mutation = await fetch(endpoint, { method: "PATCH", body });

  expect(await mutation.json()).toEqual({ method: "PATCH", amount: "3" });
  expect((await fetch(`${base}/evil.__smolter`)).status).toBe(400);
  expect((await fetch(`${base}unhandled`)).status).toBe(404);
});

it("loads separate manual route tables for browser and server", async (context) => {
  const { root, server } = await viteFixture(context, "export default null;", {
    clientRoutes: "client-table.ts",
    serverRoutes: "server-table.ts",
  });

  await writeFile(
    join(root, "client-table.ts"),
    'export const routes = [{ path: "/client" }];',
  );
  await writeFile(
    join(root, "server-table.ts"),
    'export const routes = [{ path: "/server" }];',
  );

  const browser = await server.transformRequest("virtual:smolter/routes");
  const rendered = await server.ssrLoadModule("virtual:smolter/routes");

  expect(browser?.code).toContain("client-table.ts");
  expect(rendered.default).toEqual([{ path: "/server" }]);
});

it("rejects an incomplete manual route configuration", async (context) => {
  const { server } = await viteFixture(context, "export default null;", {
    clientRoutes: "client-table.ts",
  });

  await expect(
    server.transformRequest("virtual:smolter/routes"),
  ).rejects.toThrow("Specify both");
});

it("reports invalid flat route filenames during discovery", async (context) => {
  const { root, server } = await viteFixture(context, "export default null;");

  await writeFile(
    join(root, "src/routes/tasks..detail.ts"),
    "export default null;",
  );

  await expect(
    server.transformRequest("virtual:smolter/routes"),
  ).rejects.toThrow("Empty route segment");
});

for (const source of [
  'export * from "../../handlers.ts";',
  "export function loader() { return 1; }",
  "export const action = () => 1;",
  "const loader = () => 1; export { loader };",
  'export { loader, view } from "../../handlers.ts";',
]) {
  it(`rejects an unsafe browser route module: ${source}`, async (context) => {
    const { server } = await viteFixture(context, source);

    await expect(
      server.transformRequest("/src/routes/_index.ts?smolter-client"),
    ).rejects.toThrow(/exports|Re-export|separate export/);
  });
}
