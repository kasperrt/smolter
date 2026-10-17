import { mountApplication, serverRoute } from "@kasperrt/smolter/preact/client";
import { Destination, Home, root } from "./ownership-page.tsx";

void mountApplication(
  [
    serverRoute("/root-data", {}, { loader: true }),
    serverRoute("/", { default: Home }, { loader: true }),
    serverRoute("/destination", { default: Destination }, { loader: true }),
  ],
  root,
).then(() => {
  document.documentElement.dataset.hydrated = "true";
});
