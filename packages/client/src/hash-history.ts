import type { Router } from "@smolter/core";

const hashFor = (url: string, base: string) => {
  const target = new URL(url, base);
  return `#${target.pathname}${target.search}${target.hash}`;
};

export function connectHashHistory(router: Router) {
  const read = router.getSnapshot;
  const navigate = router.navigate;
  router.navigate = async (url, options) => {
    const hash = hashFor(url, router.getSnapshot().url);
    history[options?.replace ? "replaceState" : "pushState"](null, "", hash);
    await navigate(url, options);
  };
  const unsubscribe = router.subscribe(() => {
    const hash = hashFor(read().url, read().url);
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
