const suffix = ".__smolter";

/** Internal transport encoding preserves the complete route pathname and query. */
export function dataURL(url: URL, endpoint?: string): string {
  return endpoint
    ? `${endpoint}?url=${encodeURIComponent(url.pathname + url.search)}`
    : `${url.pathname}${suffix}${url.search}`;
}

/** Normalize before dispatch; legacy endpoints are accepted only when configured. */
export function dataTarget(
  url: URL,
  endpoint?: string,
): string | Error | undefined {
  const legacy = endpoint !== undefined && url.pathname === endpoint;
  if (!legacy && !url.pathname.endsWith(suffix)) return;
  if (legacy && url.searchParams.getAll("url").length !== 1)
    return new Error("Invalid route URL");
  const target = legacy
    ? url.searchParams.get("url")
    : url.pathname.slice(0, -suffix.length) + url.search;
  if (
    !target?.startsWith("/") ||
    target.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(target)
  )
    return new Error("Invalid route URL");
  const normalized = new URL(target, url.origin);
  if (normalized.origin !== url.origin || normalized.hash)
    return new Error("Invalid route URL");
  return normalized.pathname + normalized.search;
}
