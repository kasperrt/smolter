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

const sessions = new Map<string, Store>();

export function readStore(request: Request): Store {
  const id =
    request.headers
      .get("cookie")
      ?.match(/(?:^|; )smolter-session=([\w-]+)/)?.[1] ?? "anonymous";
  const store = sessions.get(id) ?? initialStore();
  sessions.set(id, store);
  return store;
}
