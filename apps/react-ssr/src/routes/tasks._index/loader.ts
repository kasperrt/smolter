import type { DataArgs } from "smolter/react";
import { readStore } from "../../data/store.server";

export function loader({ request }: DataArgs) {
  const store = readStore(request);

  return { tasks: store.tasks };
}
