import type { RevalidationArgs } from "@kasperrt/smolter/preact";

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: RevalidationArgs) {
  if (
    actionResult &&
    typeof actionResult === "object" &&
    "changed" in actionResult
  ) {
    return actionResult.changed !== false;
  }

  return defaultShouldRevalidate;
}
