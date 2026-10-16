export interface Attributes {
  [key: string]: unknown;
}
export type ElementFactory<N> = (
  tag: string,
  props: Attributes | null,
  ...children: (N | string | number)[]
) => N;
export type LinkFactory<N> = (
  href: string,
  children: N | string,
  className?: string,
) => N;
export interface CounterProps<N> {
  data?: { count: number; reads: number };
  state: string;
  message?: string;
  form: (children: N[]) => N;
  revalidate?: () => void;
}
export interface ShellProps<N> {
  mode: "React" | "Preact" | "SSR";
  content: N;
  link?: LinkFactory<N>;
}
export interface ArticleProps {
  title: string;
  paragraphs: string[];
}
/** Pure UI shared by both renderers; no routing, requests, or framework hooks. */
export function createUI<N>(h: ElementFactory<N>) {
  const link: LinkFactory<N> = (href, children, className) =>
    h("a", { href, className }, children);
  function Button(props: Attributes, label: string) {
    return h("button", { type: "button", ...props }, label);
  }
  function WindowBar(title: string, detail: string) {
    return h(
      "div",
      { className: "window-bar" },
      h("span", null, title),
      h("span", null, detail),
    );
  }
  function Panel(title: string, ...children: N[]) {
    return h(
      "section",
      { className: "playground" },
      WindowBar(title, "↗"),
      ...children,
    );
  }
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
  function Header(renderLink = link) {
    return h(
      "header",
      null,
      Brand(renderLink),
      h(
        "nav",
        { "aria-label": "Main navigation" },
        renderLink("/about", "The idea"),
        link("https://github.com/kasperrt/smolter", "GitHub ↗"),
        h("span", { className: "version" }, "v0.0.1"),
      ),
    );
  }
  function CounterPanel({
    data,
    state,
    message,
    form,
    revalidate,
  }: CounterProps<N>) {
    const busy = state !== "idle";
    return Panel(
      "counter.demo",
      h(
        "div",
        { className: "counter-body" },
        h(
          "div",
          { className: "counter-label" },
          h("h2", null, "Counter"),
          h("span", { className: "pill" }, state),
        ),
        h(
          "div",
          { className: "counter" },
          h("span", { "data-testid": "count" }, data?.count ?? 0),
        ),
        form([
          Button(
            {
              type: "submit",
              name: "intent",
              value: "increment",
              disabled: busy,
              "aria-busy": busy,
            },
            "Add one +",
          ),
          Button(
            {
              type: "submit",
              name: "intent",
              value: "reset",
              className: "secondary",
              disabled: busy,
              "aria-busy": busy,
            },
            "Reset",
          ),
        ]),
        h(
          "div",
          { className: "status" },
          h(
            "span",
            { role: "status" },
            message ?? "POST /api/counter → GET /api/counter",
          ),
        ),
      ),
      h(
        "div",
        { className: "demo-footer" },
        h(
          "span",
          null,
          "Loader runs: ",
          h("strong", { "data-testid": "runs" }, data?.reads ?? 0),
        ),
        Button(
          { className: "text-button", onClick: revalidate, disabled: busy },
          "Revalidate ↻",
        ),
      ),
    );
  }
  function CounterFallback() {
    return CounterPanel({
      state: "loading",
      form: (children) => h("form", null, ...children),
    });
  }
  function Article({ title, paragraphs }: ArticleProps) {
    return Panel(
      "the-idea.txt",
      h(
        "div",
        { className: "about-body" },
        h("h2", null, title),
        ...paragraphs.map((text) => h("p", { key: text }, text)),
      ),
    );
  }
  function ErrorPanel(error: Error) {
    return Panel(
      "error",
      h("div", { className: "about-body", role: "alert" }, error.message),
    );
  }
  function CodePanel() {
    return h(
      "aside",
      null,
      WindowBar("route.tsx", "TSX"),
      h(
        "pre",
        null,
        h(
          "code",
          null,
          `export { clientLoader } from "./loader";
export { clientAction } from "./action";

export default function Counter() {
  const data = useLoaderData<
    typeof clientLoader
  >();
  const fetcher = useFetcher<
    typeof clientAction
  >();

  return <fetcher.Form>
    <button>{data?.count}</button>
  </fetcher.Form>;
}`,
        ),
      ),
      h(
        "div",
        { className: "code-footer" },
        h("span", null, "TypeScript"),
        h("span", null, "UTF-8"),
      ),
    );
  }
  function Shell({ mode, content, link: renderLink = link }: ShellProps<N>) {
    return h(
      "div",
      { className: "app-shell" },
      Header(renderLink),
      h(
        "main",
        null,
        h(
          "div",
          { className: "intro" },
          h(
            "div",
            null,
            h("h1", null, "smolter", h("span", { "aria-hidden": true }, "_")),
            h("p", null, "A tiny router with loaders, actions & fetchers."),
          ),
          h(
            "div",
            { className: "specs" },
            h("span", null, h("strong", null, "2.4 kB"), " gzip"),
            h("span", null, h("strong", null, "0"), " dependencies"),
            h("span", null, "React + Preact"),
          ),
        ),
        h(
          "div",
          { className: "workspace" },
          h(
            "div",
            { className: "demo-column" },
            h(
              "div",
              { className: "panel-tabs" },
              ...(
                [
                  ["React", "/"],
                  ["Preact", "/preact.html"],
                  ["SSR", "/ssr"],
                ] as const
              ).map(([label, href]) =>
                h(
                  "a",
                  {
                    key: label,
                    href,
                    "aria-current": mode === label ? "page" : undefined,
                  },
                  label,
                ),
              ),
            ),
            content,
          ),
          CodePanel(),
        ),
      ),
      h(
        "footer",
        null,
        h("span", null, "Load → act → revalidate."),
        link("https://github.com/kasperrt/smolter#readme", "Read the docs ↗"),
      ),
    );
  }
  return {
    Button,
    WindowBar,
    Panel,
    Brand,
    Header,
    CounterPanel,
    CounterFallback,
    Article,
    ErrorPanel,
    CodePanel,
    Shell,
  };
}
