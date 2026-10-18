import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { applicationPlugins } from "../packages/vite/src/application/vite.ts";

for (const framework of ["react", "preact"] as const) {
  it(`${framework} serves SSR documents and scoped transport`, async (context) => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "smolter-app-vite-")),
    );
    context.onTestFinished(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "src/routes"), { recursive: true });
    await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
    await writeFile(
      join(root, "src/routes/_index.ts"),
      'export { loader } from "../../loader.ts"; export default function Home() { return null; }',
    );
    await writeFile(
      join(root, "loader.ts"),
      `
    export function loader({ request }) {
      const headers = new Headers();
      headers.append("Set-Cookie", "first=1; Path=/");
      headers.append("Set-Cookie", "second=2; Path=/");

      return Response.json({ path: new URL(request.url).pathname }, { headers });
    }
  `,
    );
    await writeFile(
      join(root, "src/entry.server.tsx"),
      `
    export default function render(request: Request, entry: string) {
      if (new URL(request.url).pathname === "/robots.txt") {
        return new Response("User-agent: *", { headers: { "Content-Type": "text/plain" } });
      }

      return new Response(
        '<!doctype html><html><head><title>SSR</title></head><body><main>Ready</main></body></html>',
        { status: 202, headers: { "Content-Type": "text/html", "X-Entry": entry } },
      );
    }
  `,
    );
    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      resolve: {
        alias: {
          [`@kasperrt/smolter/${framework}/server`]: resolve(
            `packages/server/src/${framework}.ts`,
          ),
        },
      },
      plugins: applicationPlugins({
        framework,
        dataEndpoint: "/app/_smolter",
        resourceRequest: (url) => url === "/robots.txt",
      }),
      server: { port: 0 },
    });
    context.onTestFinished(() => server.close());
    await server.listen();
    const origin = server.resolvedUrls!.local[0];
    const response = await fetch(origin, { headers: { Accept: "text/html" } });
    const html = await response.text();
    expect(response.status).toBe(202);
    expect(response.headers.get("X-Entry")).toBe("/src/entry.client.tsx");
    expect(html).toContain("<head><title>SSR</title></head>");
    expect(html).toMatch(
      /<main>Ready<\/main>\s*<script[^>]*src="\/@vite\/client"[^>]*><\/script><\/body>/,
    );
    const unrelated = await fetch(new URL("/unhandled", origin), {
      headers: { Accept: "application/json" },
    });
    expect(unrelated.status).toBe(404);
    expect(unrelated.headers.get("X-Entry")).toBeNull();
    const resource = await fetch(new URL("/robots.txt", origin));
    expect(resource.headers.get("Content-Type")).toContain("text/plain");
    expect(await resource.text()).toBe("User-agent: *");
    const data = await fetch(new URL("/app/_smolter?url=%2F", origin));
    expect(data.status).toBe(200);
    expect(await data.json()).toEqual({ path: "/" });
    expect(data.headers.getSetCookie()).toEqual([
      "first=1; Path=/",
      "second=2; Path=/",
    ]);
    for (const target of [
      "",
      "https://outside.test/",
      "//outside.test/",
      "/\\outside.test/",
      "/x#fragment",
    ]) {
      const invalid = await fetch(
        new URL(`/app/_smolter?url=${encodeURIComponent(target)}`, origin),
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.text()).toBe("Invalid route URL");
    }
  });
}
