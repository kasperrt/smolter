import {
  Link,
  type Router,
  RouterProvider,
  Routes,
  useLocation,
} from "@kasperrt/smolter/react";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/react";
import { createElement as h, lazy, Suspense } from "react";

const Source = lazy(() => import("./source"));

export function app(router: Router) {
  return h(RouterProvider, { router }, h(Example, {}));
}

function Example() {
  const [routePath] = useLocation();
  return ui.Shell({
    source: h(Suspense, { fallback: null }, h(Source, {})),
    routePath,
    hosted: Boolean(import.meta.env.VITE_HOSTED),
    mode: "React",
    basePort: Number(import.meta.env.VITE_EXAMPLE_BASE_PORT ?? 5173),
    link: (href, children, className) =>
      h(Link, { href: siteHref(href), className }, children),
    content: h(Routes, { fallback: ui.LoadingPanel("Loading…") }),
  });
}
