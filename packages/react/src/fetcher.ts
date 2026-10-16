/**
 * React components and typed data hooks. Import from @kasperrt/smolter/react.
 * @module
 */

import type {
  AnyDataFunction,
  DataFunction,
  DataOf,
  FetcherSnapshot,
  Result,
  Route as RouteDefinition,
  RouteModule,
  SubmitOptions,
} from "@smolter/core";
import { useRouter } from "./context.ts";
import { Form, type FormProps } from "./form.ts";
import type { ComponentType } from "./runtime.ts";
import {
  createElement,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "./runtime.ts";

/** Action method and optional explicit route URL for a fetcher submission. */
export interface FetcherSubmitOptions extends SubmitOptions {
  action?: string;
}

/** Typed independent request state, methods, and a bound Form component. */
export interface TypedFetcher<T> extends Omit<FetcherSnapshot, "data"> {
  data?: T;
  Form: ComponentType<FormProps>;
  load: (url?: string) => Promise<Result>;
  submit: (body: FormData, options?: FetcherSubmitOptions) => Promise<Result>;
}

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher<T extends RouteModule>(
  route: RouteDefinition<T>,
): TypedFetcher<
  | DataOf<Extract<T["action"] | T["clientAction"], AnyDataFunction>>
  | DataOf<Extract<T["loader"] | T["clientLoader"], AnyDataFunction>>
>;

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher<
  T extends AnyDataFunction = DataFunction,
>(): TypedFetcher<DataOf<T>>;

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher(route?: RouteDefinition): TypedFetcher<unknown> {
  const router = useRouter();
  const path = route?.path;
  const fetcher = useMemo(() => {
    const store = router.createFetcher();
    const target = () => {
      const snapshot = router.getSnapshot();

      return path === undefined || path === snapshot.path ? snapshot.url : path;
    };

    return {
      ...store,
      Form: (props: FormProps) =>
        createElement(Form, { action: target(), ...props, fetcher: store }),
      load: (url?: string) => store.load(url ?? target()),
      submit: (body: FormData, options?: FetcherSubmitOptions) =>
        store.submit(options?.action ?? target(), body, options),
    };
  }, [router, path]);

  useEffect(() => fetcher.dispose, [fetcher]);

  const state = useSyncExternalStore(
    fetcher.subscribe,
    fetcher.getSnapshot,
    fetcher.getSnapshot,
  );

  return { ...fetcher, ...state };
}
