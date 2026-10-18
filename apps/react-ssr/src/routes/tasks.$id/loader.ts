import type { DataArgs } from "@kasperrt/smolter/react";
import { readStore } from "../../data/store.server";

export function loader({ request, params }: DataArgs) {
  const store = readStore(request);
  const task = store.tasks.find((task) => task.id === params.id);
  return task ?? new Error("Task not found");
}
