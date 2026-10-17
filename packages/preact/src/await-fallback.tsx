/** @jsxImportSource preact */
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
    void resolve.then(
      (value) => {
        if (current) setResult({ source: resolve, value });
      },
      (error: unknown) => {
        if (current) setResult({ source: resolve, error });
      },
    );
    return () => {
      current = false;
    };
  }, [resolve]);
  if (!result || result.source !== resolve) return fallback;
  if ("value" in result) return children(result.value as Awaited<T>);
  if (errorElement !== undefined) return errorElement;
  throw result.error;
}
