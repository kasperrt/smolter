import type { Router } from "@smolter/core";

export function connectHashHistory(router: Router) {
  const read = router.getSnapshot;
  const navigate = router.navigate;
  router.navigate = async (url, options) => {
    const target = new URL(url, router.getSnapshot().url);
    const hash = `#${target.pathname}${target.search}${target.hash}`;
    history[options?.replace ? "replaceState" : "pushState"](null, "", hash);
    await navigate(url, options);
  };
  const unsubscribe = router.subscribe(() => {
    const target = new URL(read().url);
    const hash = `#${target.pathname}${target.search}${target.hash}`;

    // Redirects commit inside the router rather than through navigate().
    if (location.hash !== hash) history.replaceState(history.state, "", hash);
  });
  const onHashChange = () => void navigate(location.hash.slice(1) || "/");
  window.addEventListener("hashchange", onHashChange);
  const dispose = router.dispose;
  router.dispose = () => {
    unsubscribe();
    window.removeEventListener("hashchange", onHashChange);
    dispose();
  };
}
