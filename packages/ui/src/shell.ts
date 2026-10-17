import { version } from "../../../package.json";
import sizes from "./size.json";
import { comparisonRows, createSizeTable, entryRows } from "./size-table";
import type { ElementFactory, LinkFactory, ShellProps } from "./types";

export function createShell<N>(h: ElementFactory<N>, link: LinkFactory<N>) {
  const SizeTable = createSizeTable(h);

  function Brand(renderLink = link) {
    return renderLink(
      "/",
      h(
        "span",
        { className: "brand-content" },
        h("span", { className: "brand-mark", "aria-hidden": true }, "s_"),
        h(
          "b",
          { className: "wordmark-name" },
          "smolter",
          h("i", { "aria-hidden": true }, "_"),
        ),
      ),
      "wordmark",
    );
  }

  function Header(renderLink = link, routePath = "/") {
    return h(
      "header",
      null,
      Brand(renderLink),
      h(
        "nav",
        { "aria-label": "Main navigation" },
        renderLink(
          "/docs",
          "Docs",
          routePath.startsWith("/docs") ? "active" : undefined,
        ),
        link("https://github.com/kasperrt/smolter", "GitHub ↗"),
        h("span", { className: "version" }, `v${version}`),
      ),
    );
  }

  function Landing(renderLink = link) {
    return h(
      "section",
      { className: "landing", "aria-label": "Why smolter" },
      h("h2", null, "Data flow you can follow."),
      h(
        "p",
        null,
        "Keep requests out of deeply nested components. Loaders read data, actions change it, and your components render the result.",
      ),
      h(
        "p",
        null,
        "Typed data, forms without page reloads, and revalidation you control. For React and Preact, in the browser or on the server.",
      ),
      renderLink("/docs/getting-started", "Get started →", "landing-link"),
      h("h3", null, "Choose what you ship."),
      h(
        "p",
        null,
        "Import from @kasperrt/smolter/react or /preact. createRouter keeps navigation lean; createDataRouter adds loaders, actions and fetchers.",
      ),
      SizeTable(
        "Entry points · gzip bytes",
        ["Browser bundle", "React", "Preact"],
        entryRows,
      ),
      h(
        "p",
        null,
        "Optional /client handles browser transport or hydration; /document and /lazy-route add application features. /server and /vite belong in server and build code, not the browser.",
      ),
      SizeTable(
        "Same measurement tools · gzip bytes",
        ["Selected API", "React", "Preact"],
        comparisonRows,
      ),
      h(
        "p",
        { className: "size-method" },
        "Production ESM, esbuild + Terser, gzip level 9. Framework runtimes excluded; library dependencies included. Rows overlap and are not additive. API capabilities differ; React Router has no dedicated Preact entry.",
      ),
      renderLink(
        "/docs/bundle-size",
        "Exports, versions & measurement method →",
        "landing-link",
      ),
    );
  }

  function Shell({
    mode,
    content,
    source,
    basePort = 5173,
    routePath = "/",
    hosted = false,
    link: renderLink = link,
  }: ShellProps<N>) {
    const documentation = routePath.startsWith("/docs");
    const landing = routePath.split(/[?#]/)[0] === "/";
    const size = mode.startsWith("Preact")
      ? mode.includes("SSR")
        ? sizes.preactServer
        : sizes.preact
      : mode.includes("SSR")
        ? sizes.reactServer
        : sizes.react;

    return h(
      "div",
      { className: "app-shell" },
      Header(renderLink, routePath),
      h(
        "main",
        null,
        h(
          "div",
          { className: "intro", hidden: documentation },
          h(
            "div",
            null,
            h("h1", null, "smolter", h("span", { "aria-hidden": true }, "_")),
            h("p", null, "Loaders. Actions. Less component clutter."),
          ),
          h(
            "div",
            { className: "specs" },
            h(
              "span",
              {
                title: mode.includes("SSR")
                  ? "Browser router + server request transport; framework excluded"
                  : "All browser router exports; framework excluded",
                "data-testid": "gzip-size",
              },
              h("strong", null, `${size} B`),
              " gzip",
            ),
            h("span", null, h("strong", null, "0"), " dependencies"),
            h("span", null, "React + Preact"),
            renderLink("/docs/bundle-size", "Routing-only sizes ↗"),
          ),
        ),
        h(
          "div",
          {
            className: documentation
              ? "docs-workspace"
              : landing
                ? "landing-workspace"
                : "workspace",
          },
          h(
            "div",
            { className: "demo-column" },
            h(
              "div",
              { className: "panel-tabs", hidden: documentation || landing },
              ...(
                [
                  ["React", `http://127.0.0.1:${basePort}/`],
                  ["Preact", `http://127.0.0.1:${basePort + 1}/`],
                  ["React SSR", `http://127.0.0.1:${basePort + 2}/`],
                  ["Preact SSR", `http://127.0.0.1:${basePort + 3}/`],
                ] as const
              ).map(([label, href]) =>
                h(
                  "a",
                  {
                    key: label,
                    href: hosted
                      ? label.includes("SSR")
                        ? `https://github.com/kasperrt/smolter/tree/main/apps/${label.toLowerCase().replace(" ", "-")}`
                        : `/smolter/${label.toLowerCase()}${routePath}`
                      : new URL(routePath, href).href,
                    title:
                      hosted && label.includes("SSR")
                        ? "Standalone server example · run with Node"
                        : undefined,
                    "aria-current": mode === label ? "page" : undefined,
                  },
                  label,
                ),
              ),
            ),
            h(
              "div",
              {
                className: "route-address",
                "aria-label": "Current route",
                hidden: documentation || landing,
              },
              h("span", null, "URL"),
              h("code", null, routePath),
            ),
            content,
          ),
          ...(source && !documentation && !landing ? [source] : []),
        ),
      ),
      h(
        "footer",
        null,
        h("span", null, "Load → act → revalidate."),
        renderLink("/docs", "Read the docs →"),
      ),
    );
  }

  return { Brand, Header, Landing, Shell };
}
