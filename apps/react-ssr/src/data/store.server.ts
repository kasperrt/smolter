import { namespace } from "@kasperrt/smolter/utils";
import type { Store } from "./types";

function initialStore(): Store {
  return {
    count: 0,
    reads: 0,
    tasks: [
      { id: "1", title: "Read the route" },
      { id: "2", title: "Edit a task" },
    ],
  };
}

const MAX_SESSIONS = 256;
const session = new RegExp(`(?:^|; )${namespace}-session=([\\w-]+)`);
const sessions = new Map<string, Store>();

export function readStore(request: Request): Store {
  const id = request.headers.get("cookie")?.match(session)?.[1] ?? "anonymous";
  const existing = sessions.get(id);
  if (existing) {
    sessions.delete(id);
    sessions.set(id, existing);
    return existing;
  }
  if (sessions.size >= MAX_SESSIONS)
    sessions.delete(sessions.keys().next().value!);
  const store = initialStore();
  sessions.set(id, store);
  return store;
}
