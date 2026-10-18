/*! @smolter/prefetch:data */
import { safeWrapAsync } from "./errors.ts";
import { matchRoutes } from "./match.ts";
import type { DataFunction, Result, Route } from "./types.ts";
import { internalURL } from "./url.ts";

const MAX_ENTRIES = 16;
const MAX_AGE = 30_000;

interface Entry {
  controller: AbortController;
  expires: number;
  result: Promise<Result>;
}

// Router-local, single-use navigation reads. No timers or background refreshes.
function prefetchCache(routes: readonly Route[], current: () => string) {
  const entries = new Map<string, Entry>();
  const remove = (key: string) => {
    entries.get(key)?.controller.abort();
    entries.delete(key);
  };
  const keyFor = (url: URL) => `${url.origin}${url.pathname}${url.search}`;
  return {
    clear() {
      for (const key of entries.keys()) remove(key);
    },
    load(href: string): Promise<Result> {
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
        result: safeWrapAsync(() => {
          if (signal.aborted) return;
          const loader = match.route.clientLoader ?? match.route.loader;
          return (loader as DataFunction | undefined)?.({
            request: new Request(url, { signal }),
            params: match.params,
            signal,
            reason: "prefetch",
          });
        }),
      };
      const pending = entry.result;
      entry.result = new Promise((resolve) => {
        const cancel = () => resolve({});
        signal.addEventListener("abort", cancel, { once: true });
        const finish = async () => {
          const result = await pending;
          signal.removeEventListener("abort", cancel);
          resolve(result);
          if (
            (result.error || result.data instanceof Response) &&
            entries.get(key) === entry
          )
            remove(key);
        };
        void finish();
      });
      entries.set(key, entry);
      return entry.result;
    },
    take(
      url: URL,
      signal: AbortSignal,
    ): Promise<Result | undefined> | undefined {
      const key = keyFor(url);
      const entry = entries.get(key);
      if (!entry) return;
      if (entry.expires <= Date.now()) {
        remove(key);
        return;
      }
      const consume = async () => {
        const result = await entry.result;
        if (signal.aborted || entries.get(key) !== entry) return;
        entries.delete(key);
        return result;
      };
      return consume();
    },
  };
}

/** Enable bounded speculative loader reads without adding a cache to ordinary routers. */
export function dataPrefetch(
  routes: readonly Route[],
  current: () => string,
): DataPrefetch {
  const cache = prefetchCache(routes, current);
  let mutations = 0;
  let revision = 0;
  const clear = () => {
    revision++;
    cache.clear();
  };
  return {
    clear,
    load: (href) => (mutations ? Promise.resolve({}) : cache.load(href)),
    async navigate(url, signal, load) {
      if (mutations) return load();
      const version = revision;
      const pending = cache.take(url, signal);
      if (!pending) return load();
      const cached = await pending;
      if (signal.aborted) return;
      if (cached && !mutations && version === revision) return cached.data;
      return load();
    },
    async submit(work) {
      mutations++;
      clear();
      const { data, error } = await safeWrapAsync(async () => ({
        value: await work(),
      }));
      mutations--;
      clear();
      if (error) throw error.cause;
      return data!.value;
    },
  };
}

interface DataPrefetch {
  clear: () => void;
  load: (href: string) => Promise<Result>;
  navigate: (url: URL, signal: AbortSignal, load: () => unknown) => unknown;
  submit: <T>(work: () => Promise<T>) => Promise<T>;
}
