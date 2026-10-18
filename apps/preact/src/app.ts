import {
  Link,
  type Router,
  RouterProvider,
  Routes,
  useLocation,
} from "@kasperrt/smolter/preact";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import { lazy, Suspense } from "preact/compat";

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
    mode: "Preact",
    basePort: Number(import.meta.env.VITE_EXAMPLE_BASE_PORT ?? 5173),
    link: (href, children, className) =>
      h(Link, { href: siteHref(href), className }, children),
    content: h(Routes, { fallback: ui.LoadingPanel("Loading…") }),
  });
}
