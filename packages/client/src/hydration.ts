import { safeWrapAsync } from "@smolter/core";
import { namespace } from "@smolter/core/namespace";

// Late stream failures have no matching server-rendered error content.
export class HydrationError extends Error {}

type Settlement = [number, unknown, string | null];

interface PendingValue {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/** Window settlement queue under the default namespace. */
export interface DeferredWindow extends Window {
  __smolterDeferred?: Settlement[];
}

const deferredGlobal = `__${namespace}Deferred`;
const literalTag = `__${namespace}Literal`;
const undefinedTag = `__${namespace}Undefined`;
const pendingTag = `__${namespace}Pending`;
const rejectedTag = `__${namespace}Rejected`;
// Untrusted markup can carry the same id; only Smolter's JSON script element is a payload.
const hydrationSelector = `script#${namespace}-data[type="application/json"]`;

/** Read the hydration payload without trusting other elements that share its id. */
export function hydrationPayload(): string | undefined {
  return document.querySelector(hydrationSelector)?.textContent ?? undefined;
}

// Named elements can shadow this global; only an array is a settlement queue.
function deferredQueue(): Settlement[] {
  const queue: unknown = Reflect.get(window, deferredGlobal);
  if (Array.isArray(queue)) return queue;
  const created: Settlement[] = [];
  Reflect.set(window, deferredGlobal, created);
  return created;
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
    const field = record[tag];
    if (tag === literalTag && Array.isArray(field)) {
      const [name, inner] = field;
      if (typeof name === "string")
        return Object.defineProperty({}, name, {
          value: inner,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    if (tag === undefinedTag && field === true) return undefined;
    let promise: Promise<unknown> | undefined;
    if (
      tag === pendingTag &&
      typeof field === "number" &&
      Number.isInteger(field) &&
      field >= 0
    ) {
      const id = field;
      const existing = pending.get(id);
      if (existing) return existing.promise;
      let resolve!: PendingValue["resolve"];
      let reject!: PendingValue["reject"];
      promise = new Promise((accept, fail) => {
        resolve = accept;
        reject = fail;
      });
      pending.set(id, { promise, resolve, reject });
    }
    if (
      tag === rejectedTag &&
      field &&
      typeof field === "object" &&
      typeof (field as { message?: unknown }).message === "string"
    ) {
      const failure = field as Record<string, unknown>;
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
    }
    if (!promise) return value;
    void safeWrapAsync(() => promise);
    return promise;
  }
  // An encoded key may spell a hydration tag with Unicode escapes.
  const hydration = JSON.parse(json, /"__|\\u/.test(json) ? revive : undefined);
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
  function reviveValue(value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(reviveValue);
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record))
      record[key] = reviveValue(record[key]);
    return revive("", record);
  }
  const receive = ([id, value, error]: Settlement) => {
    if (id === -1) return dispose();
    const target = pending.get(id);
    if (!target) return;
    if (error === null) return target.resolve(reviveValue(value));
    target.reject(new (live ? HydrationError : Error)(error));
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
