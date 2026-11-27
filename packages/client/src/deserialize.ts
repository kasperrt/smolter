import type { Snapshot } from "@smolter/core";

/** Restore a trusted snapshot produced by @kasperrt/smolter/server serialize, including its route error. */
export function deserialize(json: string): Snapshot {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new TypeError("Invalid serialized snapshot");
  const snapshot = parsed as Snapshot;
  const error: unknown = snapshot.error;
  if (error) {
    const record =
      typeof error === "object"
        ? (error as Record<string, unknown>)
        : undefined;
    const restored = new Error(
      typeof record?.message === "string" ? record.message : String(error),
    );
    if (typeof record?.name === "string") restored.name = record.name;
    snapshot.error = restored;
  }
  return snapshot;
}
