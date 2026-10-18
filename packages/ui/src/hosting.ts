import type { Router } from "@smolter/core";

/** Keep native links inside the example's directory on GitHub Pages. */
export function siteHref(href: string): string {
  return import.meta.env.VITE_HOSTED
    ? import.meta.env.BASE_URL.slice(0, -1) + href
    : href;
}

export function siteRoute(base: string): string {
  const restored = new URLSearchParams(location.search).get("__route");
  if (restored?.startsWith("/") && !restored.startsWith("//")) {
    history.replaceState(null, "", base.slice(0, -1) + restored);
    return restored;
  }
  const path =
    location.pathname.slice(base.length - 1).replace(/\/$/, "") || "/";
  return path + location.search + location.hash;
}

/** Map a standalone example's route URLs into its static hosting directory. */
export function siteHistory(router: Router, base: string): void {
  const navigate = router.navigate;
  router.navigate = (href, options) => {
    const url = new URL(href, location.href);
    const local =
      url.origin === location.origin && url.pathname.startsWith(base);
    return navigate(
      local
        ? url.pathname.slice(base.length - 1) + url.search + url.hash
        : href,
      options,
    );
  };
  const current = () =>
    location.pathname.slice(base.length - 1) + location.search + location.hash;
  const pop = () => {
    void router.navigate(current());
  };
  router.subscribe(() => {
    const url = new URL(router.getSnapshot().url);
    const next = base.slice(0, -1) + url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash) {
      history.pushState(null, "", next);
    }
  });
  addEventListener("popstate", pop);
  document.addEventListener("click", (event) => {
    const anchor = (event.target as Element).closest("a");
    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      !anchor ||
      anchor.target ||
      anchor.hasAttribute("download")
    )
      return;
    const href = anchor.getAttribute("href");
    if (
      !href?.startsWith("/") ||
      href.startsWith(base.split("/").slice(0, -2).join("/") + "/")
    )
      return;
    event.preventDefault();
    void router.navigate(href);
  });
}
