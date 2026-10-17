import { version } from "../../../package.json";
import sizes from "./size.json";
import type { ElementFactory, LinkFactory, ShellProps } from "./types";

export function createShell<N>(h: ElementFactory<N>, link: LinkFactory<N>) {
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
