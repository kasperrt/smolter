/**
 * HTTP response helpers and loader result normalization.
 *
 * @module
 */
import { namespace } from "./namespace.ts";

/** Normalized route failure with an HTTP status, status text and optional response data. */
export interface RouteError extends Error {
  status: number;
  statusText: string;
  data?: unknown;
}

/** Loader value paired with HTTP response metadata. */
export interface DataResponse<T> {
  value: T;
  init: ResponseInit;
  __routeData: true;
}

const routeDataMarker = Symbol.for(`${namespace}.routeData`);

function isRouteData(value: unknown): value is DataResponse<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Reflect.get(value, routeDataMarker) === true,
  );
}

/** Wrap loader data with HTTP status and headers without creating a Response body. */
export function data<T>(value: T, init: ResponseInit = {}): DataResponse<T> {
  return Object.defineProperty(
    { value, init, __routeData: true } as DataResponse<T>,
    routeDataMarker,
    { value: true },
  );
}

/** Create an empty redirect Response with a Location header; defaults to HTTP 302. */
export function redirect(
  location: string,
  init: number | ResponseInit = 302,
): Response {
  const options = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(options.headers);
  headers.set("Location", location);
  return new Response(null, {
    ...options,
    status: options.status ?? 302,
    headers,
  });
}

/** Identify normalized Error objects carrying an HTTP status. */
export function isRouteErrorResponse(value: unknown): value is RouteError {
  return value instanceof Error && "status" in value;
}

/** Normalize transport responses and wrapped data, optionally resolving nested deferred values. */
export async function normalizeResult(
  value: unknown,
  resolveDeferred = true,
): Promise<unknown> {
  if (
    value &&
    typeof value === "object" &&
    Object.hasOwn(value, "__routeError") &&
    Object.keys(value).length === 1
  ) {
    const raw = (value as { __routeError: unknown }).__routeError;
    if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as { message?: unknown }).message === "string"
    ) {
      const source = raw as Record<string, unknown>;
      const error = Error(source.message as string);
      if (typeof source.name === "string") error.name = source.name;
      if (typeof source.status === "number")
        Object.assign(error, {
          status: source.status,
          ...(typeof source.statusText === "string" && {
            statusText: source.statusText,
          }),
          ...(Object.hasOwn(source, "data") && { data: source.data }),
        });
      return error;
    }
  }
  if (value instanceof Response) {
    if (value.headers.has("Location")) return value;
    if (!value.ok)
      return Object.assign(Error(await value.text()), {
        status: value.status,
        statusText: value.statusText,
      });
    return value.json();
  }
  if (isRouteData(value)) value = value.value;
  return resolveDeferred ? resolveData(value) : value;
}

// Smolter transfers JSON snapshots. Resolve deferred fields before serialization.
/** Recursively resolve promises in arrays and plain objects before JSON serialization. */
export async function resolveData(value: unknown): Promise<unknown> {
  const resolved = await value;
  if (Array.isArray(resolved)) return Promise.all(resolved.map(resolveData));
  if (
    resolved &&
    typeof resolved === "object" &&
    Object.getPrototypeOf(resolved) === Object.prototype
  ) {
    const entries = await Promise.all(
      Object.entries(resolved).map(
        async ([key, field]) => [key, await resolveData(field)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }
  return resolved;
}
