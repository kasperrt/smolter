import { HydrationError } from "@smolter/client/hydration";
import type { ComponentChildren } from "preact";
import { use } from "preact/compat";
import { useLayoutEffect, useState } from "preact/hooks";
import { AwaitFallback, resolveAwait } from "./await-fallback.tsx";
import { Application } from "./root-context.ts";
import { createElement, useContext } from "./runtime.ts";

export interface AwaitProps<T> {
  resolve: T | Promise<T>;
  children: (value: Awaited<T>) => ComponentChildren;
  errorElement?: ComponentChildren;
  /** Component-owned pending content, safe during early hydration. Pass null to render nothing. */
  fallback?: ComponentChildren;
}

/** Render a value or promise. An explicit fallback owns pending content during early hydration; errorElement handles rejection. */
export function Await<T>({
  resolve,
  ...props
}: AwaitProps<T>): ComponentChildren {
  const app = useContext(Application);
  if (!(resolve instanceof Promise) || !("fallback" in props))
    return createElement(SuspendedAwait<T>, { ...props, resolve });
  if (app?.deferredBoundary)
    return app.deferredBoundary(
      createElement(SuspendedAwait<T>, { ...props, resolve }),
      props.fallback,
    );
  return createElement(AwaitFallback<T>, { ...props, resolve });
}

function SuspendedAwait<T>({
  resolve,
  children,
  errorElement,
}: AwaitProps<T>): ComponentChildren {
  if (!(resolve instanceof Promise)) return children(resolve as Awaited<T>);
  const result = use(resolveAwait(resolve));
  if (result.error) {
    if (errorElement !== undefined)
      return result.error.cause instanceof HydrationError
        ? createElement(AwaitError, { children: errorElement })
        : errorElement;
    throw result.error.cause;
  }
  return children(result.data!.value as Awaited<T>);
}

interface AwaitErrorProps {
  children: ComponentChildren;
}

// Late stream errors replace pending server markup; finish that hydration pass
// before mounting their attributes. Existing server-rendered errors hydrate directly.
function AwaitError({ children }: AwaitErrorProps): ComponentChildren {
  const [ready, setReady] = useState(typeof document === "undefined");
  useLayoutEffect(() => setReady(true), []);
  return ready ? children : null;
}
