import { mountApplication, serverRoute } from "@kasperrt/smolter/preact/client";
import { Destination, Home, root } from "./owned-ownership-page.tsx";

declare const DEFERRED_TIMEOUT: number;

async function mount() {
  const router = await mountApplication(
    [
      serverRoute("/root-data", {}, { loader: true }),
      serverRoute("/", { default: Home }, { loader: true }),
      serverRoute("/destination", { default: Destination }, { loader: true }),
    ],
    root,
    { deferredTimeout: DEFERRED_TIMEOUT },
  );
  Object.assign(window, { ownershipRouter: router });
  document.documentElement.dataset.hydrated = "true";
}
void mount();
