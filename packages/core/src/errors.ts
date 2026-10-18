import type { Result } from "./types.ts";

/** Resolve returned or rejected errors into Error values without losing their cause. */
export async function safeWrapAsync<T>(
  work: () => T | Promise<T>,
): Promise<Result<T>> {
  const [result] = await Promise.allSettled([
    (async () => {
      await undefined;
      return work();
    })(),
  ]);
  if (result.status === "rejected")
    return { error: Error(String(result.reason), { cause: result.reason }) };
  return result.value instanceof Error
    ? { error: result.value }
    : { data: result.value };
}
