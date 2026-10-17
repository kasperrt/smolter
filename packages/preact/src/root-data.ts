import type { Router } from "@smolter/core";
import type { RootModule } from "./route-types.ts";

export { createStore as createRootStore } from "@smolter/core/store";

import { createStore } from "@smolter/core/store";

export function attachRootData(
  router: Router,
  initial: unknown,
  rootModule?: RootModule,
) {
  const store = createStore(initial);
  const loaderPath = rootModule?.loaderPath;

  if (!rootModule || !loaderPath) return store;

  let pending: ReturnType<Router["createFetcher"]> | undefined;
  const unregister = router.registerRevalidator(
    rootModule.id ?? "root",
    async (args) => {
      if (rootModule.shouldRevalidate?.(args) === false) return;

      pending?.dispose();
      const fetcher = router.createFetcher();
      pending = fetcher;
      const result = await fetcher.load(loaderPath);

      if (pending === fetcher && !result.error) store.update(result.data);

      fetcher.dispose();

      if (pending === fetcher) pending = undefined;
    },
  );
  const dispose = router.dispose;
  router.dispose = () => {
    pending?.dispose();
    pending = undefined;
    unregister();
    dispose();
  };

  return store;
}
