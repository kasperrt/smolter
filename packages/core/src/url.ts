/** Resolve an internal URL; external links remain the browser's responsibility. */
export function internalURL(base: string, href: string): URL | undefined {
  const url = new URL(href, base);

  if (url.origin === new URL(base).origin) return url;
}
