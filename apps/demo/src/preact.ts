import { type ComponentChildren, h, render } from "preact";
import {
  createRouter,
  defineRoute,
  RouterProvider,
  Routes,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "smolter/preact";
import { headerContent } from "./components/header-content";
import { clientAction } from "./routes/home/action";
import { clientLoader } from "./routes/home/loader";
import "./style.css";

function Counter() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();
  const revalidate = useRevalidator();
  return h(
    "div",
    null,
    h(
      "main",
      null,
      h(
        "div",
        { className: "intro" },
        h(
          "div",
          null,
          h("h1", null, "smolter", h("span", null, "_")),
          h("p", null, "Same data flow. Preact adapter."),
        ),
      ),
      h(
        "div",
        { className: "panel-tabs" },
        h("a", { href: "/" }, "React ↗"),
        h("a", { href: "/preact.html", "aria-current": "page" }, "Preact"),
        h("a", { href: "/ssr" }, "SSR ↗"),
      ),
      h(
        "section",
        { className: "playground preact-playground" },
        h(
          "div",
          { className: "window-bar" },
          h("span", null, "counter.demo"),
          h("span", { className: "live-indicator" }, "Live"),
        ),
        h(
          "div",
          { className: "counter-body" },
          h(
            "div",
            { className: "counter-label" },
            h("h2", null, "Counter"),
            h("span", { className: "pill" }, fetcher.state),
          ),
          h(
            "div",
            { className: "counter" },
            h("span", { "data-testid": "count" }, data?.count ?? 0),
          ),
          h(
            fetcher.Form,
            null,
            h(
              "button",
              {
                type: "submit",
                name: "intent",
                value: "increment",
                disabled: fetcher.state !== "idle",
              },
              "Add one +",
            ),
            h(
              "button",
              {
                type: "submit",
                name: "intent",
                value: "reset",
                className: "secondary",
                disabled: fetcher.state !== "idle",
              },
              "Reset",
            ),
          ),
          h(
            "div",
            { className: "status" },
            h(
              "span",
              { role: "status" },
              fetcher.data?.message ?? "POST /api/counter → GET /api/counter",
            ),
          ),
        ),
        h(
          "div",
          { className: "demo-footer" },
          h("span", null, `Loader runs: ${data?.reads ?? 0}`),
          h(
            "button",
            {
              type: "button",
              className: "text-button",
              onClick: () => void revalidate(),
            },
            "Revalidate ↻",
          ),
        ),
      ),
    ),
  );
}
const router = createRouter(
  [
    defineRoute("/preact.html", {
      default: Counter,
      clientLoader,
      clientAction,
    }),
  ],
  { browser: true },
);
const root = document.getElementById("root");
if (root)
  render(
    h(
      RouterProvider,
      { router },
      h("header", null, ...headerContent<ComponentChildren>(h)),
      h(Routes, { fallback: null }),
      h("footer", null, "Preact · zero runtime dependencies"),
    ),
    root,
  );
