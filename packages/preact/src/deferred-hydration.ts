type Settlement = [number, unknown, string | null];

interface PendingValue {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

declare global {
  interface Window {
    __smolterDeferred?: Settlement[];
  }
}

/** Restore promise identity before hydrating Suspense boundaries. */
export function readHydration(json: string) {
  const pending = new Map<number, PendingValue>();
  const queue = (window.__smolterDeferred ??= []);

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
      void promise.catch(() => {});
      pending.set(id, { promise, resolve, reject });

      return promise;
    }

    if ("__smolterRejected" in value) {
      const failure = value.__smolterRejected as { message: string };
      const rejected = Promise.reject(
        Object.assign(new Error(failure.message), failure),
      );
      void rejected.catch(() => {});

      return rejected;
    }

    return value;
  }

  const hydration = JSON.parse(json, revive);
  const dispose = () => {
    window.removeEventListener("DOMContentLoaded", dispose);
    for (const target of pending.values())
      target.reject(new Error("Hydration stream closed"));
    pending.clear();
    queue.push = () => 0;
  };
  const receive = (packet: Settlement) => {
    const [id, value, error] = packet;
    if (id === -1) return dispose();

    const target = pending.get(id);
    if (!target) return;

    if (error !== null) target.reject(new Error(error));
    if (error === null)
      target.resolve(JSON.parse(JSON.stringify(value), revive));
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
