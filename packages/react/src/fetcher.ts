/**
 * React components and typed data hooks. Import from @kasperrt/smolter/react.
 * @module
 */

import {
  type AnyDataFunction,
  type DataFunction,
  type DataOf,
  type FetcherSnapshot,
  type Result,
  type Route as RouteDefinition,
  type RouteModule,
  type Router,
  type SubmitOptions,
} from "@smolter/core";
import {
  type Submission,
  type SubmissionOptions,
  submissionBody,
  submissionSearch,
} from "@smolter/core/submission";
import { useRouter } from "./context.ts";
import { Form, type FormProps } from "./form.ts";
import type { RouteData } from "./route-types.ts";

import {
  type ComponentType,
  createElement,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "./runtime.ts";

/** Action method and optional explicit route URL for a fetcher submission. */
export interface FetcherSubmitOptions extends SubmissionOptions {
  action?: string;
}

/** Typed independent request state, methods, and a bound Form component. */
export interface TypedFetcher<T> extends Omit<FetcherSnapshot, "data"> {
  data?: T;
  Form: ComponentType<FormProps>;
  load: (url?: string) => Promise<Result>;
  submit: (body: Submission, options?: FetcherSubmitOptions) => Promise<Result>;
}

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher<T extends RouteModule>(
  route: RouteDefinition<T>,
): TypedFetcher<
  | DataOf<Extract<T["action"] | T["clientAction"], AnyDataFunction>>
  | DataOf<Extract<T["loader"] | T["clientLoader"], AnyDataFunction>>
>;

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher<T = DataFunction>(): TypedFetcher<RouteData<T>>;

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher(route?: RouteDefinition): TypedFetcher<unknown> {
  const router = useRouter<Router>();
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
      submit: (body: Submission, options: FetcherSubmitOptions = {}) => {
        const action = options.action ?? target();
        const data = submissionBody(body, options.encType);
        const method = options.method?.toUpperCase();

        if (method === "GET") {
          const url = new URL(action, router.getSnapshot().url);
          url.search = submissionSearch(data);

          return store.load(url.href);
        }

        return store.submit(action, data, {
          method: method as SubmitOptions["method"],
        });
      },
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

/** A fetcher with a bound form and inferred result data. */
export type FetcherWithComponents<T> = TypedFetcher<RouteData<T>>;
