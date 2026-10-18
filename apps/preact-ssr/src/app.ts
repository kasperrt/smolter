import {
  Link,
  type Router,
  RouterProvider,
  Routes,
  useLocation,
} from "@kasperrt/smolter/preact";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";

import { Source } from "./source";

export function app(router: Router) {
  return h(RouterProvider, { router }, h(Example, {}));
}

function Example() {
  const [routePath] = useLocation();
  return ui.Shell({
    source: h(Source, {}),
    routePath,
    hosted: Boolean(import.meta.env.VITE_HOSTED),
    mode: "Preact SSR",
    basePort: Number(import.meta.env.VITE_EXAMPLE_BASE_PORT ?? 5173),
    link: (href, children, className) => h(Link, { href, className }, children),
    content: h(Routes, { fallback: ui.LoadingPanel("Loading…") }),
  });
}
