import { serializeData } from "@smolter/core/serialize";

/** Encode deferred values without delaying the initial document snapshot. */
export function deferredHydration(value: unknown, nonce?: string) {
  const promises = new Map<Promise<unknown>, number>();
  let pending = 0;
  let closed = false;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const attribute = nonce
    ? ` nonce="${nonce.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")}"`
    : "";
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel() {
      closed = true;
    },
  });

  function encode(value: unknown): unknown {
    if (value instanceof Promise) {
      const existing = promises.get(value);
      if (existing !== undefined) return { __smolterPending: existing };

      const id = promises.size;
      promises.set(value, id);
      pending++;
      void value
        .then((result) => settle(id, encode(result)))
        .catch((error: unknown) =>
          settle(
            id,
            null,
            error instanceof Error ? error.message : String(error),
          ),
        );

      return { __smolterPending: id };
    }

    if (Array.isArray(value)) return value.map(encode);

    if (
      value &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype
    )
      return Object.fromEntries(
        Object.entries(value).map(([key, field]) => [key, encode(field)]),
      );

    return value;
  }

  function settle(id: number, value: unknown, error?: string) {
    if (closed) return;

    const packet = serializeData([id, value, error]);
    controller.enqueue(
      encoder.encode(
        `<script${attribute}>(window.__smolterDeferred??=[]).push(${packet});document.currentScript.remove()</script>`,
      ),
    );
    pending--;
    if (!pending) {
      closed = true;
      controller.enqueue(
        encoder.encode(
          `<script${attribute}>(window.__smolterDeferred??=[]).push([-1,null,null]);document.currentScript.remove()</script>`,
        ),
      );
      controller.close();
    }
  }

  const initial = serializeData(encode(value));
  if (!pending) {
    closed = true;
    controller.close();
  }

  return { initial, stream };
}
