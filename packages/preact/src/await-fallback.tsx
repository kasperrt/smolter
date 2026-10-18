/** @jsxImportSource preact */
import { safeWrapAsync } from "@smolter/core";
import { useEffect, useState } from "preact/hooks";

import type { AwaitProps } from "./await.tsx";

type Result<T> = { source: Promise<T> } & ({ value: T } | { error: unknown });

export function AwaitFallback<T>({
  resolve,
  fallback,
  errorElement,
  children,
}: AwaitProps<T> & { resolve: Promise<T> }) {
  const [result, setResult] = useState<Result<T>>();
  useEffect(() => {
    let current = true;
    const observe = async () => {
      const { data, error } = await safeWrapAsync(async () => ({
        value: await resolve,
      }));
      if (current)
        setResult(
          error
            ? { source: resolve, error: error.cause }
            : { source: resolve, value: data!.value },
        );
    };
    void observe();
    return () => {
      current = false;
    };
  }, [resolve]);
  if (!result || result.source !== resolve) return fallback;
  if ("value" in result) return children(result.value as Awaited<T>);
  if (errorElement !== undefined) return errorElement;
  throw result.error;
}
