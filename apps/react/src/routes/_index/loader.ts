import type { DataArgs } from "smolter/react";
import { readStore, saveStore } from "../../data/store";

export function clientLoader({ request }: DataArgs) {
  const store = readStore(request);

  store.reads++;
  saveStore(store);

  return { count: store.count, reads: store.reads };
}
