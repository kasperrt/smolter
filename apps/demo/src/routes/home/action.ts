import type { DataArgs } from "smolter";
import { store } from "./store";
export async function action({ request }: DataArgs) {
  const data = await request.formData();
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (data.get("intent") === "reset") {
    store.count = 0;
    return { message: "Counter reset." };
  }
  store.count += 1;
  return { message: "Saved. Loader data is fresh." };
}
export type ActionData = Awaited<ReturnType<typeof action>>;
