import type { DataArgs } from "@kasperrt/smolter/react";
import { readStore, saveStore } from "../../data/store";

export async function clientAction({ request }: DataArgs) {
  const data = await request.formData();
  const store = readStore(request);
  if (request.method !== "POST") return new Error("Use POST to create a task");
  const title = String(data.get("title") ?? "").trim();
  if (!title) return new Error("Enter a task title");
  store.tasks.push({ id: crypto.randomUUID(), title });
  saveStore(store);
  return { changed: true, message: "Task created." };
}
