import { safeWrapAsync } from "@smolter/core";

interface ProgressiveDocumentOptions {
  signal: AbortSignal;
  dispose: () => void;
}

/** Interleave deferred settlements with complete HTML chunks, respecting backpressure. */
export function progressiveDocument(
  source: ReadableStream<Uint8Array>,
  settlements: ReadableStream<Uint8Array>,
  options: ProgressiveDocumentOptions,
): ReadableStream<Uint8Array> {
  const html = source.getReader();
  const data = settlements.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let stopped = false;
  let cancelled = false;
  let first = true;
  let suffix = "";
  const read = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    html: boolean,
  ) => {
    const { data, error } = await safeWrapAsync(() => reader.read());
    return error ? { error: error.cause } : { ...data!, html };
  };
  const readHTML = () => read(html, true);
  const readData = () => read(data, false);
  let nextHTML: ReturnType<typeof readHTML> | undefined;
  let nextData: ReturnType<typeof readData> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    options.signal.removeEventListener("abort", stop);
    options.dispose();
    void safeWrapAsync(() => html.cancel());
    void safeWrapAsync(() => data.cancel());
  };
  options.signal.addEventListener("abort", stop, { once: true });
  if (options.signal.aborted) stop();
  return new ReadableStream({
    async pull(controller) {
      const work = async () => {
        if (first && !stopped) nextHTML = readHTML();
        while (!stopped && (nextHTML || nextData)) {
          const reads = [nextHTML, nextData].filter(
            (value) => value !== undefined,
          );
          const result = await Promise.race(reads);
          if (stopped) break;
          if ("error" in result) return Promise.reject(result.error);
          if (result.html) nextHTML = result.done ? undefined : readHTML();
          if (!result.html) nextData = result.done ? undefined : readData();
          if (first) nextData = readData();
          if (result.done) {
            first = false;
            continue;
          }
          if (!result.html) {
            controller.enqueue(result.value);
            return;
          }
          let chunk = decoder.decode(result.value, { stream: true });
          if (chunk === "<div hidden>")
            chunk = "<div hidden data-smolter-stream>";
          if (first && !/^<!doctype/i.test(chunk))
            chunk = `<!doctype html>${chunk}`;
          first = false;
          const closing = chunk.lastIndexOf("</body>");
          if (closing !== -1) {
            suffix = chunk.slice(closing);
            chunk = chunk.slice(0, closing);
          }
          controller.enqueue(encoder.encode(chunk));
          return;
        }
        if (cancelled) return;
        if (!stopped) controller.enqueue(encoder.encode(suffix));
        stop();
        controller.close();
      };
      const { error } = await safeWrapAsync(work);
      if (error) {
        stop();
        controller.error(error.cause ?? error);
      }
    },
    cancel() {
      cancelled = true;
      stop();
    },
  });
}
