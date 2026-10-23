import { safeWrapAsync } from "@smolter/core";

// Late stream failures have no matching server-rendered error content.
export class HydrationError extends Error {}

type Settlement = [number, unknown, string | null];

interface PendingValue {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export interface DeferredWindow extends Window {
  __smolterDeferred?: Settlement[];
}

/** Restore promise identity before hydrating Suspense boundaries. */
export function readHydration(json: string, timeout = 8_000) {
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2_147_483_647)
    throw new RangeError(
      "deferredTimeout must be an integer between 1 and 2147483647 ms",
    );
  const pending = new Map<number, PendingValue>();
  let live = false;
  const queue = ((window as DeferredWindow).__smolterDeferred ??= []);
  function revive(_key: string, value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    if ("__smolterUndefined" in value) return undefined;
    let promise: Promise<unknown>;
    if (
      "__smolterPending" in value &&
      typeof value.__smolterPending === "number"
    ) {
      const id = value.__smolterPending;
      const existing = pending.get(id);
      if (existing) return existing.promise;
      let resolve!: PendingValue["resolve"];
      let reject!: PendingValue["reject"];
      promise = new Promise((accept, fail) => {
        resolve = accept;
        reject = fail;
      });
      pending.set(id, { promise, resolve, reject });
    } else if ("__smolterRejected" in value) {
      const failure = value.__smolterRejected as { message: string };
      promise = Promise.reject(
        Object.assign(new Error(failure.message), failure),
      );
    } else return value;
    void safeWrapAsync(() => promise);
    return promise;
  }
  const hydration = JSON.parse(json, revive);
  const dispose = () => {
    clearTimeout(deadline);
    window.removeEventListener("DOMContentLoaded", dispose);
    for (const target of pending.values())
      target.reject(new HydrationError("Hydration stream closed"));
    pending.clear();
    queue.push = () => 0;
  };
  const deadline = pending.size
    ? setTimeout(() => {
        for (const target of pending.values())
          target.reject(new HydrationError("Hydration stream timed out"));
        dispose();
      }, timeout)
    : undefined;
  const receive = ([id, value, error]: Settlement) => {
    if (id === -1) return dispose();
    const target = pending.get(id);
    if (!target) return;
    if (error === null)
      target.resolve(JSON.parse(JSON.stringify(value), revive));
    else target.reject(new (live ? HydrationError : Error)(error));
  };
  const buffered = queue.splice(0);
  queue.push = (...packets) => {
    packets.forEach(receive);
    return 0;
  };
  window.addEventListener("DOMContentLoaded", dispose, { once: true });
  buffered.forEach(receive);
  live = true;
  if (document.readyState !== "loading") dispose();
  return { hydration, dispose };
}
