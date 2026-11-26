import type { Snapshot } from "./types.ts";

/** Safe inside a script element. Data must be JSON serializable; error stacks and causes are omitted. */
export function serialize(snapshot: Snapshot): string {
  return serializeData({
    ...snapshot,
    error: snapshot.error && {
      name: snapshot.error.name,
      message: snapshot.error.message,
    },
  });
}

/** Encode JSON for embedding inside an HTML script element. */
export function serializeData(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
