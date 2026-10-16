import type { DataArgs } from "@kasperrt/smolter/preact";
import { readStore } from "../../data/store.server";

export function loader({ request }: DataArgs) {
  const store = readStore(request);

  store.reads++;

  return { count: store.count, reads: store.reads };
}
