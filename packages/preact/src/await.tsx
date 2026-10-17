/** @jsxImportSource preact */
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

export function Await<T>(props: AwaitProps<T>): ComponentChildren {
  const app = useContext(Application);
  if (!(props.resolve instanceof Promise))
    return props.children(props.resolve as Awaited<T>);
  if (!("fallback" in props))
    return <SuspendedAwait {...props} resolve={props.resolve} />;
  if (app?.deferredBoundary)
    return app.deferredBoundary(
      <SuspendedAwait {...props} resolve={props.resolve} />,
      props.fallback,
    );
  return <AwaitFallback {...props} resolve={props.resolve} />;
}

function SuspendedAwait<T>({
  resolve,
  children,
  errorElement,
}: AwaitProps<T> & { resolve: Promise<T> }): ComponentChildren {
  let pending = resolutions.get(resolve);

  if (!pending) {
    pending = resolve.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    resolutions.set(resolve, pending);
  }

  const result = use(pending);

  if ("error" in result) {
    if (errorElement !== undefined) return errorElement;

    throw result.error;
  }

  return children(result.value as Awaited<T>);
}
