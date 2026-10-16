import type { DataArgs } from "smolter";
export interface CounterData {
  count: number;
  reads: number;
}
export async function clientLoader({ signal }: DataArgs) {
  const response = await fetch("/api/counter", { signal });
  if (!response.ok)
    return new Error(`Counter request failed (${response.status})`);
  return (await response.json()) as CounterData;
}
export type LoaderData = Awaited<ReturnType<typeof clientLoader>>;
