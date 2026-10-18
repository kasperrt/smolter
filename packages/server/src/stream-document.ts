import { safeWrapAsync } from "@smolter/core";
import { serializeData } from "@smolter/core/serialize";

// Deferred failures must remain rejected promises after hydration so Await's
// errorElement has the same behavior on the server and in the browser.
export async function resolveHydration(value: unknown): Promise<unknown> {
  if (value instanceof Promise) {
    const { data, error } = await safeWrapAsync(async () => ({
      value: await value,
    }));
    if (!error) return resolveHydration(data!.value);
    const cause = error.cause;
    return {
      __smolterRejected: {
        message: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }
  if (Array.isArray(value)) return Promise.all(value.map(resolveHydration));
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, field]) => [
        key,
        await resolveHydration(field),
      ]),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export interface StreamDocumentOptions {
  hydration: Promise<unknown>;
  nonce?: string;
  signal: AbortSignal;
  dispose: () => void;
}

/** Stream the shell immediately, then finalize the JSON snapshot before module scripts execute. */
export function streamDocument(
  source: ReadableStream<Uint8Array>,
  options: StreamDocumentOptions,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let suffix = "";
  let first = true;
  let cancelled = false;
  let finish!: () => void;
  const interrupted = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const abort = () => {
    finish();
    void safeWrapAsync(() => reader.cancel());
  };
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  function dispose() {
    options.signal.removeEventListener("abort", abort);
    options.dispose();
  }
  return new ReadableStream({
    async pull(controller) {
      const { data: result, error } = await safeWrapAsync(() => reader.read());
      if (error) {
        dispose();
        controller.error(error.cause ?? error);
        return;
      }
      if (result!.done) {
        if (!options.signal.aborted) {
          const value = await Promise.race([options.hydration, interrupted]);
          if (cancelled) return;
          if (options.signal.aborted) {
            dispose();
            controller.close();
            return;
          }
          const hydration = serializeData(value);
          const nonce = options.nonce
            ? ` nonce="${options.nonce.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")}"`
            : "";
          controller.enqueue(
            encoder.encode(
              `<script type="application/json"${nonce}>${hydration}</script><script${nonce}>(function(){var script=document.currentScript,payload=script.previousElementSibling,data=document.getElementById("smolter-data");if(data)data.textContent=payload.textContent;payload.remove();script.remove()})()</script>${suffix}`,
            ),
          );
        }
        dispose();
        controller.close();
        return;
      }
      let chunk = decoder.decode(result!.value, { stream: true });
      if (first && !/^<!doctype/i.test(chunk))
        chunk = `<!doctype html>${chunk}`;
      first = false;
      const closing = chunk.lastIndexOf("</body>");
      if (closing !== -1) {
        suffix = chunk.slice(closing);
        chunk = chunk.slice(0, closing);
      }
      controller.enqueue(encoder.encode(chunk));
    },
    async cancel() {
      cancelled = true;
      finish();
      dispose();
      await reader.cancel();
    },
  });
}
