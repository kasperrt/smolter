import type { Router } from "@smolter/core";

export const siteOrigin = "https://kasperrt.github.io";
export const siteDescription =
  "Small, typed routing for React and Preact. Choose navigation alone or add loaders, actions, forms, SSR and file-based routes.";

export function pageMetadata(path: string, data?: unknown) {
  const route = path.split(/[?#]/)[0].replace(/\/$/, "");
  const article =
    route.startsWith("/docs") &&
    data &&
    typeof data === "object" &&
    "title" in data &&
    "summary" in data;
  const title = article
    ? `${data.title} · smolter docs`
    : "smolter · Typed routing for React and Preact";
  const description = article ? String(data.summary) : siteDescription;
  const canonicalPath = route === "/docs" ? "/docs/getting-started" : route;
  return {
    title,
    description,
    canonical: `${siteOrigin}/smolter${canonicalPath}/`,
    robots:
      !route || route.startsWith("/docs") ? "index,follow" : "noindex,follow",
  };
}

/** Keep the prerendered head current after client-side navigation. */
export function watchMetadata(router: Router) {
  const update = () => {
    const snapshot = router.getSnapshot();
    if (snapshot.state !== "idle") return;
    const meta = pageMetadata(new URL(snapshot.url).pathname, snapshot.data);
    document.title = meta.title;
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", meta.canonical);
    for (const [selector, content] of [
      ['meta[name="description"]', meta.description],
      ['meta[name="robots"]', snapshot.error ? "noindex,follow" : meta.robots],
      ['meta[property="og:title"]', meta.title],
      ['meta[property="og:description"]', meta.description],
      ['meta[property="og:url"]', meta.canonical],
      ['meta[name="twitter:title"]', meta.title],
      ['meta[name="twitter:description"]', meta.description],
    ])
      document.querySelector(selector)?.setAttribute("content", content);
  };
  update();
  return router.subscribe(update);
}
