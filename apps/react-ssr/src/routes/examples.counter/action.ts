import type { DataArgs } from "@kasperrt/smolter/react";
import { readStore } from "../../data/store.server";

export async function action({ request }: DataArgs) {
  const data = await request.formData();
  const store = readStore(request);
  store.count = data.get("intent") === "reset" ? 0 : store.count + 1;
  return { changed: true, message: "Saved. Loader refreshed." };
}
