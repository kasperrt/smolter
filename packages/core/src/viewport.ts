/*! @smolter/prefetch:viewport */
/** Opt into one viewport observation per mounted link, released on entry or unmount. */
export function viewportPrefetch(
  load: () => void,
  forwarded?: unknown,
): (element: HTMLAnchorElement | null) => void {
  let cleanup: (() => void) | undefined;
  return (element: HTMLAnchorElement | null) => {
    cleanup?.();
    cleanup = undefined;
    if (!element) return;
    const set = (node: HTMLAnchorElement | null) => {
      if (typeof forwarded === "function") return forwarded(node);
      if (forwarded && typeof forwarded === "object" && "current" in forwarded)
        forwarded.current = node;
    };
    const release = set(element);
    let active = true;
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            if (!active || !entries.some((entry) => entry.isIntersecting))
              return;
            active = false;
            observer?.disconnect();
            load();
          })
        : undefined;
    observer?.observe(element);
    cleanup = () => {
      active = false;
      observer?.disconnect();
      if (typeof release === "function") release();
      else set(null);
    };
  };
}
