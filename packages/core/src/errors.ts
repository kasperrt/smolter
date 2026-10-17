import type { Result } from "./types.ts";

/** Resolve returned or rejected errors into Error values without losing their cause. */
export function safeWrapAsync<T>(
  work: () => T | Promise<T>,
): Promise<Result<T>> {
  return Promise.resolve()
    .then(work)
    .then(
      (data) => (data instanceof Error ? { error: data } : { data }),
      (cause: unknown) => ({ error: Error(String(cause), { cause }) }),
    );
}
