export interface RouteError extends Error {
  status: number;
  statusText: string;
  data?: unknown;
}

export interface DataResponse<T> {
  value: T;
  init: ResponseInit;
  __routeData: true;
}

export function data<T>(value: T, init: ResponseInit = {}): DataResponse<T> {
  return { value, init, __routeData: true };
}

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

export function isRouteErrorResponse(value: unknown): value is RouteError {
  return value instanceof Error && "status" in value;
}

export async function normalizeResult(value: unknown): Promise<unknown> {
  if (value && typeof value === "object" && "__routeError" in value) {
    const error = value.__routeError as {
      message: string;
      status?: number;
      statusText?: string;
    };

    return Object.assign(Error(error.message), error);
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

  if (value && typeof value === "object" && "__routeData" in value)
    return resolveData((value as DataResponse<unknown>).value);

  return resolveData(value);
}

// Smolter transfers JSON snapshots. Resolve deferred fields before serialization.
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
