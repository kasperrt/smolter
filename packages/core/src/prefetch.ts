import { safeWrapAsync } from "./errors.ts";
import { callRoute, matchRoutes } from "./match.ts";
import type { Result, Route } from "./types.ts";
import { internalURL } from "./url.ts";

const MAX_ENTRIES = 16;
const MAX_AGE = 30_000;

interface Entry {
  controller: AbortController;
  expires: number;
  result: Promise<Result>;
}

/** Enable bounded speculative loader reads without adding a cache to ordinary routers.
 * @smolter/prefetch:data
 */
export function dataPrefetch(
  routes: readonly Route[],
  current: () => string,
): DataPrefetch {
  const entries = new Map<string, Entry>();
  let mutations = 0;
  const remove = (key: string) => {
    entries.get(key)?.controller.abort();
    entries.delete(key);
  };
  const keyFor = (url: URL) => `${url.origin}${url.pathname}${url.search}`;
  const clear = () => {
    for (const key of entries.keys()) remove(key);
  };
  return {
    clear,
    load(href: string): Promise<Result> {
      if (mutations) return Promise.resolve({});
      const url = internalURL(current(), href);
      const match = url && matchRoutes(routes, url.pathname);
      if (!match || !url) return Promise.resolve({});
      const key = keyFor(url);
      const existing = entries.get(key);
      if (existing && existing.expires > Date.now()) return existing.result;
      remove(key);
      if (entries.size >= MAX_ENTRIES) remove(entries.keys().next().value!);
      const controller = new AbortController();
      const { signal } = controller;
      const entry: Entry = {
        controller,
        expires: Date.now() + MAX_AGE,
        result: new Promise((resolve) => {
          const cancel = () => resolve({});
          signal.addEventListener("abort", cancel, { once: true });
          const finish = async () => {
            const result = await safeWrapAsync(() => {
              if (!signal.aborted)
                return callRoute(match, url, signal, "prefetch");
            });
            signal.removeEventListener("abort", cancel);
            resolve(result);
            if (
              (result.error || result.data instanceof Response) &&
              entries.get(key) === entry
            )
              remove(key);
          };
          void finish();
        }),
      };
      entries.set(key, entry);
      return entry.result;
    },
    async navigate(url, signal, load) {
      const key = keyFor(url);
      const entry = entries.get(key);
      if (!entry) return load();
      if (entry.expires <= Date.now()) {
        remove(key);
        return load();
      }
      const result = await entry.result;
      if (signal.aborted) return;
      // Membership is the invalidation token; consume without another await.
      if (entries.get(key) === entry) {
        entries.delete(key);
        signal.addEventListener("abort", () => entry.controller.abort(), {
          once: true,
        });
        return result.data;
      }
      return load();
    },
    async submit(work) {
      mutations++;
      clear();
      const { data, error } = await safeWrapAsync(work, true);
      mutations--;
      clear();
      if (error) throw error.cause;
      return data!;
    },
  };
}

interface DataPrefetch {
  clear: () => void;
  load: (href: string) => Promise<Result>;
  navigate: (url: URL, signal: AbortSignal, load: () => unknown) => unknown;
  submit: (work: () => Promise<Result>) => Promise<Result>;
}
