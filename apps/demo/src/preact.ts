import { h, render } from "preact";
import {
  createRouter,
  defineRoute,
  RouterProvider,
  Routes,
  useFetcher,
  useLoaderData,
} from "smolter/preact";
import { action } from "./routes/home/action";
import { loader } from "./routes/home/loader";
import "./style.css";

function Counter() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  return h(
    "main",
    null,
    h("a", { href: "/", className: "wordmark" }, "smolter ✳"),
    h("h1", null, "Same router.", h("br", {}), "Hello, Preact."),
    h(
      "section",
      { className: "playground" },
      h("span", { className: "pill" }, "Preact adapter · no React runtime"),
      h(
        "h2",
        null,
        "Things counted: ",
        h("span", { "data-testid": "count" }, data?.count ?? 0),
      ),
      h(
        fetcher.Form,
        null,
        h(
          "button",
          { type: "submit", disabled: fetcher.state !== "idle" },
          fetcher.state === "idle" ? "Add one ↗" : "Saving…",
        ),
      ),
      h(
        "p",
        { role: "status" },
        fetcher.data?.message ?? "Ready when you are.",
      ),
    ),
  );
}
const router = createRouter(
  [defineRoute("/preact.html", { default: Counter, loader, action })],
  { browser: true },
);
const root = document.getElementById("root");
if (root)
  render(h(RouterProvider, { router }, h(Routes, { fallback: null })), root);
