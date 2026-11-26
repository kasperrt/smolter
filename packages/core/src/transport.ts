import { dataSuffix } from "./namespace.ts";

/** Parse an origin-form Node request target without accepting absolute-form or malformed URLs. */
export function requestURL(target: string | undefined): URL | Error {
  const value = target ?? "/";
  const href = `http://local${value}`;
  if (!value.startsWith("/") || !URL.canParse(href))
    return new Error("Bad request");
  return new URL(href);
}

/** Internal transport encoding preserves the complete route pathname and query. */
export function dataURL(url: URL, endpoint?: string): string {
  if (url.pathname.startsWith("//")) throw new TypeError("Invalid route URL");
  return endpoint
    ? `${endpoint}?url=${encodeURIComponent(url.pathname + url.search)}`
    : `${url.pathname}${dataSuffix()}${url.search}`;
}

/** Normalize before dispatch; legacy endpoints are accepted only when configured. */
export function dataTarget(
  url: URL,
  endpoint?: string,
  suffix: string = dataSuffix(),
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
