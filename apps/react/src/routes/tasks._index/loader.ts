import type { DataArgs } from "smolter/react";
import { readStore } from "../../data/store";

export function clientLoader({ request }: DataArgs) {
  const store = readStore(request);

  return { tasks: store.tasks };
}
