import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { expect, test } from "@playwright/test";
import { safeWrapAsync } from "@smolter/core";
import { build } from "vite";

for (const framework of ["react", "preact"]) {
  test(`${framework} production client loaders commit deferred data without blocking the shell`, async ({
    page,
  }) => {
    await mkdir("node_modules/.cache", { recursive: true });
    const directory = await mkdtemp(
      resolve("node_modules/.cache/client-deferred-"),
    );
    const runtime = framework === "react" ? "react" : "preact/compat";
    const source = `
import { createElement as h, Component, Suspense, use, useState } from "${runtime}";
import { Link, Outlet, useLoaderData, useRouter${framework === "preact" ? ", Await" : ""} } from "@kasperrt/smolter/${framework}";
import { Document, Scripts } from "@kasperrt/smolter/${framework}/document";
export function Home() { return h("h1", null, "Home"); }
export function Next() { return h("h1", null, "Next page"); }
function Value() { return h("p", null, use(useLoaderData().optional)); }
class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? h("p", { role: "alert" }, "Optional failed") : this.props.children; }
}
export function Deferred() {
  const data = useLoaderData();
  return h("section", null, h("h1", null, data.title),
    h(Boundary, null, h(Suspense, { fallback: h("p", null, "Optional pending") },
      ${framework === "preact" ? 'h(Await, { resolve: data.optional, errorElement: h("p", { role: "alert" }, "Optional failed"), children: value => h("p", null, value) })' : "h(Value)"})));
}
function Root() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  return h("main", null,
    h("input", { "aria-label": "Persistent input" }),
    h("button", { onClick: () => setCount(count + 1) }, "Count " + count),
    h(Link, { to: "/deferred", prefetch: "none" }, "Deferred"),
    h(Link, { to: "/next", prefetch: "none" }, "Next"),
    h(Link, { to: "/deferred?ignore=1", prefetch: "none" }, "Uncancelled"),
    h("button", { onClick: () => router.revalidate() }, "Refresh"),
    h(Outlet));
}
export const root = { default: Root, Layout: ({ children }) => h(Document, null,
  h("head", null, h("title", null, "Client deferred fixture")),
  h("body", null, children, h(Scripts))) };
export const routes = [
  { path: "/", default: Home },
  { path: "/next", default: Next },
  { path: "/deferred", default: Deferred, clientLoader: ({ signal, request }) => ({
    title: "Deferred ready", optional: readOptional(new URL(request.url).searchParams.has("ignore") ? undefined : signal)
  }) }
];
async function readOptional(signal) {
  const response = await fetch("/optional", { signal });
  if (!response.ok) throw new Error("Optional request failed");
  const value = await response.text();
  document.documentElement.dataset.optionalSettled = "true";
  return value;
}
`;
    await writeFile(join(directory, "page.js"), source);
    await writeFile(
      join(directory, "client.js"),
      `import { mountApplication } from "@kasperrt/smolter/${framework}/client"; import { routes, root } from "./page.js"; await mountApplication(routes, root); document.documentElement.dataset.hydrated = "true";`,
    );
    await writeFile(
      join(directory, "server.js"),
      `import { renderApplication } from "@kasperrt/smolter/${framework}/server"; import { routes, root } from "./page.js"; export default (request, entry) => renderApplication(request, routes, root, entry);`,
    );
    const client = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        outDir: join(directory, "client"),
        rollupOptions: { input: join(directory, "client.js") },
      },
    });
    if (!("output" in client)) throw new Error("Missing client build");
    const entry = client.output.find(
      (item) => item.type === "chunk" && item.isEntry,
    )!;
    await build({
      configFile: false,
      logLevel: "silent",
      build: {
        ssr: join(directory, "server.js"),
        outDir: join(directory, "server"),
        minify: true,
        rollupOptions: { output: { entryFileNames: "server.mjs" } },
      },
    });
    const serverModule = await import(
      pathToFileURL(join(directory, "server/server.mjs")).href
    );
    const handler = createRequestHandler({
      entry: `/${entry.fileName}`,
      build: serverModule,
    });
    let requests = 0;
    let release: (failure?: boolean) => void = () => {};
    const server = createServer(async (request, response) => {
      if (request.url === "/optional") {
        requests++;
        release = (failure = false) => {
          response.statusCode = failure ? 503 : 200;
          response.end("Optional resolved");
        };
        return;
      }
      if (request.url?.startsWith("/assets/")) {
        response.setHeader("Content-Type", "application/javascript");
        response.end(await readFile(join(directory, "client", request.url)));
        return;
      }
      void handler(request, response, (error) =>
        response.destroy(error as Error),
      );
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const { error } = await safeWrapAsync(async () => {
      for (const scenario of [
        "resolve",
        "reject",
        "leave",
        "late",
        "revalidate",
      ]) {
        const before = requests;
        await page.goto(`http://127.0.0.1:${address.port}/`);
        await expect(page.locator("html")).toHaveAttribute(
          "data-hydrated",
          "true",
        );
        await page.getByLabel("Persistent input").fill("Keep me");
        await page
          .getByRole("link", {
            name: scenario === "late" ? "Uncancelled" : "Deferred",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("heading", { name: "Deferred ready" }),
        ).toBeVisible();
        await expect(
          page.getByText("Optional pending", { exact: true }),
        ).toBeVisible();
        await expect.poll(() => requests).toBe(before + 1);
        await page.getByRole("button", { name: "Count 0" }).click();
        await expect(
          page.getByRole("button", { name: "Count 1" }),
        ).toBeVisible();
        if (["leave", "late"].includes(scenario)) {
          await page.getByRole("link", { name: "Next", exact: true }).click();
          await expect(
            page.getByRole("heading", { name: "Next page" }),
          ).toBeVisible();
        }
        if (scenario === "revalidate") {
          await page
            .getByRole("button", { name: "Refresh", exact: true })
            .click();
          await expect.poll(() => requests).toBe(before + 2);
        }
        release(scenario === "reject");
        if (scenario === "late") {
          await expect(page.locator("html")).toHaveAttribute(
            "data-optional-settled",
            "true",
          );
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              ),
          );
        }
        if (["leave", "late"].includes(scenario)) {
          await expect(
            page.getByText("Optional resolved", { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByText("Optional pending", { exact: true }),
          ).toHaveCount(0);
        } else if (scenario === "reject") {
          await expect(page.getByRole("alert")).toHaveText("Optional failed");
        } else {
          await expect(
            page.getByText("Optional resolved", { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText("Optional pending", { exact: true }),
          ).toHaveCount(0);
        }
        await expect(page.getByLabel("Persistent input")).toHaveValue(
          "Keep me",
        );
        await expect(
          page.getByRole("button", { name: "Count 1" }),
        ).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
    if (error) throw error.cause ?? error;
  });
}
