import type { Result } from "./types.ts";

/** Resolve returned or rejected errors into Error values without losing their cause. Returned errors never appear as data. */
export async function safeWrapAsync<T>(
  work: () => T | Promise<T>,
  immediate?: boolean,
): Promise<Result<Exclude<T, Error>>> {
  const [result] = await Promise.allSettled([
    (async () => {
      if (!immediate) await undefined;
      return work();
    })(),
  ]);
  if (result.status === "rejected")
    return { error: Error(String(result.reason), { cause: result.reason }) };
  return result.value instanceof Error
    ? { error: result.value }
    : { data: result.value as Exclude<T, Error> };
}

// Only explicit route-error data is public; client-library config and causes are not.
export function errorData(error: Error) {
  return {
    name: error.name,
    message: error.message,
    ...("status" in error &&
      typeof error.status === "number" && {
        status: error.status,
        ...("statusText" in error &&
          typeof error.statusText === "string" && {
            statusText: error.statusText,
          }),
        ...("data" in error && { data: error.data }),
      }),
  };
}
