import type { Snapshot } from "./types.ts";

/** Safe inside a script element. Data must be JSON serializable; error stacks and causes are omitted. */
export function serialize(snapshot: Snapshot): string {
  return JSON.stringify({
    ...snapshot,
    error: snapshot.error && {
      name: snapshot.error.name,
      message: snapshot.error.message,
    },
  })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
