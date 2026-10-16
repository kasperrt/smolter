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

const key = "smolter-preact";

export function readStore(_request: Request): Store {
  const saved = localStorage.getItem(key);

  return saved ? (JSON.parse(saved) as Store) : initialStore();
}

export function saveStore(store: Store) {
  localStorage.setItem(key, JSON.stringify(store));
}
