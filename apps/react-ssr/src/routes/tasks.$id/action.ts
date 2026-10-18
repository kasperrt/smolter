import type { DataArgs } from "@kasperrt/smolter/react";
import { readStore } from "../../data/store.server";

export async function action({ request, params }: DataArgs) {
  const data = await request.formData();
  const store = readStore(request);
  const task = store.tasks.find((task) => task.id === params.id);
  if (!task) return new Error("Task not found");
  if (request.method === "DELETE") {
    store.tasks = store.tasks.filter((task) => task.id !== params.id);
    return new Response(null, { status: 303, headers: { Location: "/tasks" } });
  }
  if (request.method !== "PATCH")
    return new Error("Use PATCH to rename a task");
  const title = String(data.get("title") ?? "").trim();
  if (!title) return new Error("Enter a task title");
  const changed = task.title !== title;
  task.title = title;
  return {
    changed,
    message: changed ? "Task saved." : "No changes. Loader skipped.",
  };
}
