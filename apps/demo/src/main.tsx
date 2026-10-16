import { ui } from "@smolter/ui/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  createRouter,
  defineRoute,
  Link,
  RouterProvider,
  Routes,
} from "smolter";
import { About } from "./routes/about";
import * as home from "./routes/home/route";
import "./style.css";

const router = createRouter(
  [defineRoute("/", home), defineRoute("/about", { default: About })],
  { browser: true },
);
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    createElement(
      RouterProvider,
      { router },
      ui.Shell({
        mode: "React",
        link: (href, children, className) =>
          createElement(Link, { href, className }, children),
        content: createElement(Routes, { fallback: ui.CounterFallback() }),
      }),
    ),
  );
