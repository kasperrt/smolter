/** Small observable value shared by layout data and navigation state. */
export function createStore<T>(initial: T): {
  getSnapshot: () => T;
  subscribe(listener: () => void): () => void;
  update(next: T): void;
} {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(next: T) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
