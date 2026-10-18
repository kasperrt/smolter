import type { DataArgs } from "@kasperrt/smolter/preact";
import { readStore, saveStore } from "../../data/store";

export async function clientAction({ request }: DataArgs) {
  const data = await request.formData();
  const store = readStore(request);
  store.count = data.get("intent") === "reset" ? 0 : store.count + 1;
  saveStore(store);
  return { changed: true, message: "Saved. Loader refreshed." };
}
