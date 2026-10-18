/** @jsxImportSource preact */
import { safeWrapAsync } from "@smolter/core";
import type { ComponentChildren } from "preact";
import { use, useContext } from "preact/compat";
import { AwaitFallback } from "./await-fallback.tsx";
import { Application } from "./root-context.ts";

export interface AwaitProps<T> {
  resolve: T | Promise<T>;
  children: (value: Awaited<T>) => ComponentChildren;
  errorElement?: ComponentChildren;
  /** Component-owned pending content, safe during early hydration. Pass null to render nothing. */
  fallback?: ComponentChildren;
}

type Resolution = { value: unknown } | { error: unknown };

// Cache only the error-as-data adapter. Preact owns pending and resolved state.
const resolutions = new WeakMap<Promise<unknown>, Promise<Resolution>>();

/** Render a value or promise. An explicit fallback owns pending content during early hydration; errorElement handles rejection. */
export function Await<T>({
  resolve,
  ...props
}: AwaitProps<T>): ComponentChildren {
  const app = useContext(Application);
  if (!(resolve instanceof Promise))
    return <SuspendedAwait {...props} resolve={resolve} />;
  if (!("fallback" in props))
    return <SuspendedAwait {...props} resolve={resolve} />;
  if (app?.deferredBoundary)
    return app.deferredBoundary(
      <SuspendedAwait {...props} resolve={resolve} />,
      props.fallback,
    );
  return <AwaitFallback {...props} resolve={resolve} />;
}

function SuspendedAwait<T>({
  resolve,
  children,
  errorElement,
}: AwaitProps<T>): ComponentChildren {
  if (!(resolve instanceof Promise)) return children(resolve as Awaited<T>);
  let pending = resolutions.get(resolve);
  if (!pending) {
    const observe = async (): Promise<Resolution> => {
      const { data, error } = await safeWrapAsync(async () => ({
        value: await resolve,
      }));
      return error ? { error: error.cause } : data!;
    };
    pending = observe();
    resolutions.set(resolve, pending);
  }
  const result = use(pending);
  if ("error" in result) {
    if (errorElement !== undefined) return errorElement;
    throw result.error;
  }
  return children(result.value as Awaited<T>);
}
