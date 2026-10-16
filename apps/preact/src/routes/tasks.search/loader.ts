import type { DataArgs } from "@kasperrt/smolter/preact";
import { readStore } from "../../data/store";

export function clientLoader({ request }: DataArgs) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const store = readStore(request);
  const tasks = store.tasks.filter((task) =>
    task.title.toLowerCase().includes(query.toLowerCase()),
  );

  return { query, tasks };
}
