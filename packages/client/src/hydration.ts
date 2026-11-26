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

// Untrusted markup can carry the same id; only Smolter's JSON script element is a payload.
const hydrationSelector = 'script#smolter-data[type="application/json"]';

/** Read the hydration payload without trusting other elements that share its id. */
export function hydrationPayload(): string | undefined {
  return document.querySelector(hydrationSelector)?.textContent ?? undefined;
}

// Named elements can shadow this global; only an array is a settlement queue.
function deferredQueue(): Settlement[] {
  const target = window as DeferredWindow;
  if (!Array.isArray(target.__smolterDeferred)) target.__smolterDeferred = [];
  return target.__smolterDeferred;
}

/** Restore promise identity before hydrating Suspense boundaries. */
export function readHydration(json: string, timeout = 8_000) {
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2_147_483_647)
    throw new RangeError(
      "deferredTimeout must be an integer between 1 and 2147483647 ms",
    );
  const pending = new Map<number, PendingValue>();
  let live = false;
  const queue = deferredQueue();
  function revive(_key: string, value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value;
    const keys = Object.keys(value);
    if (keys.length !== 1) return value;
    const tag = keys[0];
    const record = value as Record<string, unknown>;
    if (tag === "__smolterLiteral" && Array.isArray(record.__smolterLiteral)) {
      const [field, inner] = record.__smolterLiteral;
      if (typeof field === "string")
        return Object.defineProperty({}, field, {
          value: inner,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    if (tag === "__smolterUndefined" && record.__smolterUndefined === true)
      return undefined;
    let promise: Promise<unknown>;
    if (
      tag === "__smolterPending" &&
      typeof record.__smolterPending === "number" &&
      Number.isInteger(record.__smolterPending) &&
      record.__smolterPending >= 0
    ) {
      const id = record.__smolterPending;
      const existing = pending.get(id);
      if (existing) return existing.promise;
      let resolve!: PendingValue["resolve"];
      let reject!: PendingValue["reject"];
      promise = new Promise((accept, fail) => {
        resolve = accept;
        reject = fail;
      });
      pending.set(id, { promise, resolve, reject });
    } else if (
      tag === "__smolterRejected" &&
      record.__smolterRejected &&
      typeof record.__smolterRejected === "object" &&
      typeof (record.__smolterRejected as { message?: unknown }).message ===
        "string"
    ) {
      const failure = record.__smolterRejected as Record<string, unknown>;
      const error = new Error(failure.message as string);
      if (typeof failure.name === "string") error.name = failure.name;
      if (typeof failure.status === "number")
        Object.assign(error, {
          status: failure.status,
          ...(typeof failure.statusText === "string" && {
            statusText: failure.statusText,
          }),
          ...(Object.hasOwn(failure, "data") && { data: failure.data }),
        });
      promise = Promise.reject(error);
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
