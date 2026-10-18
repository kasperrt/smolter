import type { Router } from "@smolter/core";
import { navigationStore } from "@smolter/core/navigation";
import { useSyncExternalStore } from "./runtime.ts";

export function useNavigationSnapshot(router: Router) {
  const store = navigationStore(router);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
