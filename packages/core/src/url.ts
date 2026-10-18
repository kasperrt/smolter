/** Resolve an internal URL; external links remain the browser's responsibility. */
export function internalURL(base: string, href = base): URL | undefined {
  const url = new URL(href, base);
  if (url.origin === new URL(base).origin) return url;
}

/** Browser and framework event fields used by navigation interception. */
type NavigationClickEvent = Pick<
  MouseEvent,
  "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/** Whether an anchor click should use router navigation. */
export function navigationClick(
  event: NavigationClickEvent,
  anchor: HTMLAnchorElement,
): boolean {
  return !(
    event.defaultPrevented ||
    event.button ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  );
}
