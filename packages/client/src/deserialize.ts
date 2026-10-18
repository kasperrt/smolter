import type { Snapshot } from "@smolter/core";

/** Restore a trusted snapshot produced by @kasperrt/smolter/server serialize, including its route error. */
export function deserialize(json: string): Snapshot {
  const snapshot: Snapshot = JSON.parse(json);
  const error = snapshot.error;
  if (error) {
    snapshot.error = Object.assign(new Error(error.message), {
      name: error.name,
    });
  }
  return snapshot;
}
