import type { DataArgs } from "smolter";
export interface CounterActionData {
  message: string;
}
export async function clientAction({ request, signal }: DataArgs) {
  const data = await request.formData();
  const response = await fetch("/api/counter", {
    method: "POST",
    signal,
    body: new URLSearchParams({
      intent: String(data.get("intent") ?? "increment"),
    }),
  });
  if (!response.ok)
    return new Error(`Counter update failed (${response.status})`);
  return (await response.json()) as CounterActionData;
}
export type ActionData = Awaited<ReturnType<typeof clientAction>>;
