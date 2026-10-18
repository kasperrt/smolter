import { safeWrapAsync } from "@smolter/core";

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
  const queue = ((window as DeferredWindow).__smolterDeferred ??= []);
  function revive(_key: string, value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    if ("__smolterUndefined" in value) return undefined;
    if (
      "__smolterPending" in value &&
      typeof value.__smolterPending === "number"
    ) {
      const id = value.__smolterPending;
      const existing = pending.get(id);
      if (existing) return existing.promise;
      let resolve!: PendingValue["resolve"];
      let reject!: PendingValue["reject"];
      const promise = new Promise((accept, fail) => {
        resolve = accept;
        reject = fail;
      });
      void safeWrapAsync(() => promise);
      pending.set(id, { promise, resolve, reject });
      return promise;
    }
    if ("__smolterRejected" in value) {
      const failure = value.__smolterRejected as { message: string };
      const rejected = Promise.reject(
        Object.assign(new Error(failure.message), failure),
      );
      void safeWrapAsync(() => rejected);
      return rejected;
    }
    return value;
  }
  const hydration = JSON.parse(json, revive);
  const dispose = () => {
    clearTimeout(deadline);
    window.removeEventListener("DOMContentLoaded", dispose);
    for (const target of pending.values())
      target.reject(new Error("Hydration stream closed"));
    pending.clear();
    queue.push = () => 0;
  };
  const deadline = pending.size
    ? setTimeout(() => {
        for (const target of pending.values())
          target.reject(new Error("Hydration stream timed out"));
        dispose();
      }, timeout)
    : undefined;
  const receive = (packet: Settlement) => {
    const [id, value, error] = packet;
    if (id === -1) return dispose();
    const target = pending.get(id);
    if (!target) return;
    if (error === null)
      target.resolve(JSON.parse(JSON.stringify(value), revive));
    else target.reject(new Error(error));
  };
  const buffered = queue.splice(0);
  queue.push = (...packets) => {
    packets.forEach(receive);
    return 0;
  };
  window.addEventListener("DOMContentLoaded", dispose, { once: true });
  buffered.forEach(receive);
  if (document.readyState !== "loading") dispose();
  return { hydration, dispose };
}
