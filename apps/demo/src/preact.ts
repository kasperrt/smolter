import { h, render } from "preact";
import {
  createRouter,
  defineRoute,
  RouterProvider,
  Routes,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "smolter/preact";
import { action } from "./routes/home/action";
import { loader } from "./routes/home/loader";
import "./style.css";

function Counter() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidate = useRevalidator();
  return h(
    "div",
    null,
    h(
      "header",
      null,
      h(
        "a",
        { href: "/", className: "wordmark" },
        h("span", null, "s."),
        "smolter",
      ),
      h(
        "nav",
        null,
        h("a", { href: "https://github.com/kasperrt/smolter" }, "GitHub ↗"),
      ),
    ),
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
              fetcher.state === "idle" ? "Add one +" : "Saving…",
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
              fetcher.data?.message ?? "Submit to update the loader.",
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
    h("footer", null, h("span", null, "Preact · zero runtime dependencies")),
  );
}
const router = createRouter(
  [defineRoute("/preact.html", { default: Counter, loader, action })],
  { browser: true },
);
const root = document.getElementById("root");
if (root)
  render(h(RouterProvider, { router }, h(Routes, { fallback: null })), root);
