import type { DataArgs } from "smolter";
import type { CounterData } from "../home/loader";
export async function loader({ request, signal }: DataArgs) {
  const response = await fetch(new URL("/api/counter", request.url), {
    signal,
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  if (!response.ok) return new Error("Could not load the counter.");
  return (await response.json()) as CounterData;
}
