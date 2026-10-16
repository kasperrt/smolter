import { version } from "../../smolter/package.json";
import { createDocumentation } from "./documentation";
import { highlight } from "./highlight";
import sizes from "./size.json";

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
  mode: "React" | "Preact" | "SSR" | "React SSR" | "Preact SSR";
  basePort?: number;
  routePath?: string;
  hosted?: boolean;
  source?: N;
  content: N;
  link?: LinkFactory<N>;
}

export interface CodePanelProps {
  files: Record<string, string>;
  active: string;
  select: (file: string) => void;
}

export interface ArticleProps {
  title: string;
  paragraphs: string[];
}

export interface TaskData {
  id: string;
  title: string;
}

export interface TaskProps<N> {
  state: string;
  message?: string;
  form: (children: N[]) => N;
}

export interface TaskListProps<N> extends TaskProps<N> {
  tasks: TaskData[];
  preview?: N;
  link: LinkFactory<N>;
}

export interface TaskPreviewProps {
  task?: TaskData;
  state: string;
  load: () => void;
}

export interface TaskSearchProps<N> {
  query: string;
  tasks: TaskData[];
  form: (children: N[]) => N;
  link: LinkFactory<N>;
}

export interface TaskDetailProps<N> extends TaskProps<N> {
  link: LinkFactory<N>;
  task?: TaskData;
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

  function TaskList({
    tasks,
    state,
    message,
    form,
    preview,
    link: renderLink,
  }: TaskListProps<N>) {
    return Panel(
      "tasks._index/route.ts",
      h(
        "div",
        { className: "task-body" },
        h("h2", null, "Tasks"),
        h(
          "ul",
          { className: "task-list" },
          ...tasks.map((task) =>
            h(
              "li",
              { key: task.id },
              renderLink(`/tasks/${task.id}`, task.title),
            ),
          ),
        ),
        form([
          h(
            "label",
            null,
            "New task",
            h("input", {
              name: "title",
              required: true,
              placeholder: "Task title",
            }),
          ),
          Button({ type: "submit", disabled: state !== "idle" }, "Create task"),
        ]),
        h("p", { role: "status" }, message ?? "POST /tasks"),
        ...(preview ? [preview] : []),
      ),
    );
  }

  function TaskPreview({ task, state, load }: TaskPreviewProps) {
    return h(
      "section",
      { className: "fetcher-preview" },
      h("h2", null, "Fetcher data"),
      Button({ onClick: load, disabled: state !== "idle" }, "Fetch task 1"),
      h(
        "p",
        { "data-testid": "fetcher-data" },
        task?.title ?? "Nothing fetched yet.",
      ),
    );
  }

  function TaskDetail({
    task,
    state,
    message,
    form,
    link: renderLink,
  }: TaskDetailProps<N>) {
    return Panel(
      "tasks.$id/route.ts",
      h(
        "div",
        { className: "task-body" },
        h("h2", null, "Edit task"),
        form([
          h(
            "label",
            null,
            "Title",
            h("input", {
              key: task?.id,
              name: "title",
              defaultValue: task?.title,
              required: true,
            }),
          ),
          Button({ type: "submit", disabled: state !== "idle" }, "Save task"),
          Button(
            {
              type: "submit",
              formMethod: "delete",
              formNoValidate: true,
              className: "secondary",
              disabled: state !== "idle",
            },
            "Delete task",
          ),
        ]),
        h("p", { role: "status" }, message ?? `PATCH /tasks/${task?.id ?? ""}`),
        renderLink("/tasks", "← All tasks"),
      ),
    );
  }

  function TaskSearch({
    query,
    tasks,
    form,
    link: renderLink,
  }: TaskSearchProps<N>) {
    return Panel(
      "tasks.search/route.ts",
      h(
        "div",
        { className: "task-body" },
        h("h2", null, "Search tasks"),
        h(
          "p",
          null,
          "A GET form updates the URL. The route loader filters the results.",
        ),
        form([
          h(
            "label",
            null,
            "Search query",
            h("input", {
              key: query,
              name: "q",
              defaultValue: query,
              placeholder: "Try edit",
            }),
          ),
          Button({ type: "submit" }, "Search tasks"),
        ]),
        h("p", { role: "status" }, `${tasks.length} results`),
        h(
          "ul",
          { className: "task-list" },
          ...tasks.map((task) =>
            h(
              "li",
              { key: task.id },
              renderLink(`/tasks/${task.id}`, task.title),
            ),
          ),
        ),
        renderLink("/tasks", "← All tasks"),
      ),
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

  function Header(renderLink = link, routePath = "/") {
    return h(
      "header",
      null,
      Brand(renderLink),
      h(
        "nav",
        { "aria-label": "Main navigation" },
        renderLink("/", "Counter", routePath === "/" ? "active" : undefined),
        renderLink(
          "/tasks",
          "Tasks",
          routePath === "/tasks" ? "active" : undefined,
        ),
        renderLink(
          "/tasks/search",
          "Search",
          routePath.startsWith("/tasks/search") ? "active" : undefined,
        ),
        renderLink(
          "/about",
          "The idea",
          routePath === "/about" ? "active" : undefined,
        ),
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
            message ?? "Route action → loader revalidation",
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

  function LoadingPanel(label: string) {
    return Panel(
      "loading",
      h("div", { className: "about-body", role: "status" }, label),
    );
  }

  function ErrorPanel(error: Error) {
    return Panel(
      "error",
      h("div", { className: "about-body", role: "alert" }, error.message),
    );
  }

  function CodeBlock(source: string, label: string) {
    return h(
      "pre",
      { tabIndex: 0, "aria-label": label },
      h(
        "code",
        null,
        ...highlight(source).map((token, index) =>
          h(
            "span",
            { key: index, className: token.kind && `syntax-${token.kind}` },
            token.text,
          ),
        ),
      ),
    );
  }

  function CodePanel({ files, active, select }: CodePanelProps) {
    return h(
      "aside",
      { "data-testid": "source-panel" },
      WindowBar(active, "SOURCE"),
      h(
        "div",
        { className: "source-tabs" },
        ...Object.keys(files).map((file) =>
          Button(
            {
              key: file,
              onClick: () => select(file),
              "aria-pressed": file === active,
            },
            file,
          ),
        ),
      ),
      CodeBlock(files[active] ?? "", `${active} source code`),
      h(
        "div",
        { className: "code-footer" },
        h(
          "span",
          null,
          active === "Example"
            ? "Same behavior · styling omitted"
            : active.includes("routes")
              ? "Route registration · paths and modules"
              : "Actual route source",
        ),
        h("span", null, "TypeScript"),
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
            h("p", null, "A tiny router with loaders, actions & fetchers."),
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
          ),
        ),
        h(
          "div",
          { className: documentation ? "docs-workspace" : "workspace" },
          h(
            "div",
            { className: "demo-column" },
            h(
              "div",
              { className: "panel-tabs", hidden: documentation },
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
                hidden: documentation,
              },
              h("span", null, "URL"),
              h("code", null, routePath),
            ),
            content,
          ),
          ...(source && !documentation ? [source] : []),
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

  const Documentation = createDocumentation(h, CodeBlock, link);

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
    LoadingPanel,
    CodePanel,
    CodeBlock,
    Documentation,
    Shell,
    TaskList,
    TaskPreview,
    TaskDetail,
    TaskSearch,
  };
}
