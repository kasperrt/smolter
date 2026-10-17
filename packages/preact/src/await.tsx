import type { ComponentChildren } from "preact";
import { use } from "preact/compat";

export interface AwaitProps<T> {
  resolve: T | Promise<T>;
  children: (value: Awaited<T>) => ComponentChildren;
  errorElement?: ComponentChildren;
}

type Resolution = { value: unknown } | { error: unknown };

// Cache only the error-as-data adapter. Preact owns pending and resolved state.
const resolutions = new WeakMap<Promise<unknown>, Promise<Resolution>>();

export function Await<T>({
  resolve,
  children,
  errorElement,
}: AwaitProps<T>): ComponentChildren {
  if (!(resolve instanceof Promise)) return children(resolve as Awaited<T>);

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
