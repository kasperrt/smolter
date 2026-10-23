import type { Snapshot } from "@smolter/core";

/** Restore a trusted snapshot produced by @kasperrt/smolter/server serialize, including its route error. */
export function deserialize(json: string): Snapshot {
  const snapshot: Snapshot = JSON.parse(json);
  const error = snapshot.error;
  if (error) {
    snapshot.error = new Error(error.message);
    snapshot.error.name = error.name;
  }
  return snapshot;
}
