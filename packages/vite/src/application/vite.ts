import { send, webRequest } from "@smolter/server/http";
import { routerPlugin } from "@smolter/vite";
import type { Plugin, UserConfig } from "vite";
import { browserBoundary } from "./browser-boundary.ts";
import { lazyFiles } from "./lazy-files.ts";

export interface ApplicationOptions {
  directory?: string;
  dataEndpoint?: string;
  ssr?: boolean;
  splitRoutes?: boolean;
  resourceRequest?: (url: string) => boolean;
}
export const preactConfig: UserConfig = {
  resolve: {
    alias: [
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: "preact/jsx-dev-runtime",
      },
      { find: /^react\/jsx-runtime$/, replacement: "preact/jsx-runtime" },
      { find: /^react-dom\/client$/, replacement: "preact/compat/client" },
      { find: /^react-dom\/server$/, replacement: "preact-render-to-string" },
      { find: /^react-dom$/, replacement: "preact/compat" },
      { find: /^react$/, replacement: "preact/compat" },
    ],
    dedupe: ["preact", "@kasperrt/smolter"],
  },
  ssr: {
    noExternal: ["@kasperrt/smolter"],
  },
  optimizeDeps: {
    include: [
      "preact",
      "preact/hooks",
      "preact/compat",
      "preact/jsx-runtime",
      "@kasperrt/smolter/preact",
      "@kasperrt/smolter/preact/lazy-route",
    ],
  },
};

export function applicationPlugins({
  directory = "src/routes",
  dataEndpoint = "/_smolter",
  ssr = true,
  splitRoutes = true,
  resourceRequest,
}: ApplicationOptions = {}): Plugin[] {
  const application: Plugin = {
    name: "smolter-application",
    enforce: "pre",
    config: () => preactConfig,
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (!context.server || !ssr) return html;

        // Vite prepends its client ahead of the SSR head. That shifts Preact's
        // hydration order and detaches loaded stylesheets while moving nodes.
        // Keep development-only scripts after the application document instead.
        const client = html.match(
          /\s*<script\b[^>]*src="[^"]*\/@vite\/client"[^>]*><\/script>\s*/,
        )?.[0];

        if (!client) return html;

        return html
          .replace(client, "")
          .replace("</body>", `${client.trim()}</body>`);
      },
    },
    configureServer(server) {
      // Own the HTTP adapter so redirects retain authentication cookies.
      server.middlewares.use((incoming, outgoing, next) => {
        if (!incoming.url?.startsWith(`${dataEndpoint}?`)) return next();

        outgoing.setHeader("Cache-Control", "private, no-store");

        const run = async () => {
          const target = new URL(
            incoming.url!,
            "http://local",
          ).searchParams.get("url");

          if (!target?.startsWith("/") || target.startsWith("//"))
            return send(
              new Response("Invalid route URL", { status: 400 }),
              outgoing,
            );

          const request = await webRequest(incoming, outgoing, target);
          const [{ default: routes }, { dispatchRoute }] = await Promise.all([
            server.ssrLoadModule("virtual:smolter/routes"),
            server.ssrLoadModule("@kasperrt/smolter/preact/server"),
          ]);
          await send(await dispatchRoute(request, routes), outgoing);
        };
        void run().catch(next);
      });

      if (!ssr) return;

      return () => {
        server.middlewares.use((incoming, outgoing, next) => {
          if (
            !incoming.headers.accept?.includes("text/html") &&
            !resourceRequest?.(incoming.originalUrl ?? incoming.url ?? "")
          )
            return next();

          outgoing.setHeader("Cache-Control", "private, no-store");

          const run = async () => {
            const request = await webRequest(incoming, outgoing);
            const entry = await server.ssrLoadModule("/src/entry.server.tsx");
            const response: Response = await entry.default(
              request,
              "/src/entry.client.tsx",
            );

            if (!response.headers.get("Content-Type")?.includes("text/html"))
              return send(response, outgoing);

            const html = await server.transformIndexHtml(
              incoming.url!,
              await response.text(),
            );
            await send(
              new Response(html, {
                status: response.status,
                headers: response.headers,
              }),
              outgoing,
            );
          };
          void run().catch(next);
        });
      };
    },
  };

  return [
    application,
    browserBoundary(),
    ...(splitRoutes ? [lazyFiles(directory, dataEndpoint)] : []),
    routerPlugin({ directory, framework: "preact", dataEndpoint }),
  ];
}
