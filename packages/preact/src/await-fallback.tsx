/** @jsxImportSource preact */
import { type Result, safeWrapAsync } from "@smolter/core";
import { useState } from "preact/hooks";
import type { AwaitProps } from "./await.tsx";
import { useEffect } from "./runtime.ts";

type Resolution<T> = { source: Promise<T> } & Result<{ value: T }>;

// Promise results are shared; each boundary retains its own rendering ownership.
const resolutions = new WeakMap<
  Promise<unknown>,
  Promise<Result<{ value: unknown }>>
>();

export function resolveAwait<T>(resolve: Promise<T>) {
  let pending = resolutions.get(resolve) as
    | Promise<Result<{ value: T }>>
    | undefined;
  if (!pending) {
    pending = safeWrapAsync(async () => ({ value: await resolve }));
    resolutions.set(resolve, pending);
  }
  return pending;
}

export function AwaitFallback<T>({
  resolve,
  fallback,
  errorElement,
  children,
}: AwaitProps<T> & { resolve: Promise<T> }) {
  const [result, setResult] = useState<Resolution<T>>();
  useEffect(() => {
    let current = true;
    const observe = async () => {
      const result = await resolveAwait(resolve);
      if (current) setResult({ source: resolve, ...result });
    };
    void observe();
    return () => {
      current = false;
    };
  }, [resolve]);
  if (!result || result.source !== resolve) return fallback;
  if (!result.error) return children(result.data!.value as Awaited<T>);
  if (errorElement !== undefined) return errorElement;
  throw result.error.cause;
}
