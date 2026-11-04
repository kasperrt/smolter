import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileRouter } from "@smolter/vite";
import { build } from "vite";
import { expect, it } from "vitest";
import { viteFixture } from "../../integration-tests/tests/helpers/vite";

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
  'export const [...loader] = ["SYNTHETIC_SERVER_SECRET"];',
  'export const { loader } = { loader: () => "SYNTHETIC_SERVER_SECRET" };',
  'export const { nested: { action } } = { nested: { action: () => "SYNTHETIC_SERVER_SECRET" } };',
  'export const [loader] = [() => "SYNTHETIC_SERVER_SECRET"];',
  'export const { value: loader = () => "SYNTHETIC_SERVER_SECRET" } = {};',
  'export const { ...action } = { secret: "SYNTHETIC_SERVER_SECRET" };',
  'export class loader { static secret = "SYNTHETIC_SERVER_SECRET"; }',
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

for (const maxBodySize of [undefined, 16]) {
  it(`limits development transport bodies (${maxBodySize ?? "default"})`, async (context) => {
    const { server } = await viteFixture(
      context,
      'export { action } from "../../handlers.ts";',
      { maxBodySize },
    );
    const endpoint = `${server.resolvedUrls!.local[0]}.__smolter`;
    const oversized = await fetch(endpoint, {
      method: "POST",
      body: "x".repeat((maxBodySize ?? 1_048_576) + 1),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.text()).toBe("Request body too large");
    const accepted = await fetch(endpoint, {
      method: "POST",
      body: "x".repeat(16),
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toBe(2);
  });
}

it.for(["react", "preact"] as const)(
  "%s production builds reject destructured server exports before emitting browser assets",
  async (framework, context) => {
    const { root } = await viteFixture(
      context,
      'export const { loader } = { loader: () => "SYNTHETIC_SERVER_SECRET" };',
      { framework },
    );
    await expect(
      build({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [fileRouter({ framework })],
        build: {
          write: false,
          minify: true,
          rollupOptions: {
            input: join(root, "src/routes/_index.ts?smolter-client"),
          },
        },
      }),
    ).rejects.toThrow("Re-export loader/action");
  },
);

it("allows destructured client exports without mistaking property names for server bindings", async (context) => {
  const { server } = await viteFixture(
    context,
    'export const { loader: clientLoader, nested: { action: clientAction }, ...handle } = { loader: () => 1, nested: { action: () => 2 } }; export const [, label = "public", ...items] = []; export class View {}',
  );
  const result = await server.transformRequest(
    "/src/routes/_index.ts?smolter-client",
  );
  expect(result?.code).toContain("clientLoader");
  expect(result?.code).toContain("clientAction");
});

it.for(["react", "preact"] as const)(
  "preserves %s session revocation alongside other development response cookies",
  async (framework, context) => {
    const { root, server } = await viteFixture(
      context,
      'export { action } from "../../handlers.ts";',
      { framework },
    );
    await writeFile(
      join(root, "handlers.ts"),
      `export function action() {
    const headers = new Headers();
    headers.append("Set-Cookie", "session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
    headers.append("Set-Cookie", "theme=dark; Path=/; SameSite=Lax");
    return Response.json({ signedOut: true }, { headers });
  }`,
    );
    const response = await fetch(`${server.resolvedUrls!.local[0]}.__smolter`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedOut: true });
    expect(response.headers.getSetCookie()).toEqual([
      "session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      "theme=dark; Path=/; SameSite=Lax",
    ]);
  },
);
