import { mountApplication, serverRoute } from "@kasperrt/smolter/preact/client";
import {
  OptionalDestination,
  OptionalHome,
  optionalRoot,
} from "./optional-page.tsx";

async function mount() {
  await mountApplication(
    [
      serverRoute(
        "/",
        {
          default: OptionalHome,
          shouldRevalidate: ({ reason }) => reason === "navigation",
        },
        { loader: true },
      ),
      serverRoute(
        "/destination",
        { default: OptionalDestination },
        { loader: true },
      ),
      serverRoute("/profile", {}, { action: true }),
    ],
    optionalRoot,
    {
      deployment: { version: "experiment", manifestURL: "/manifest.json" },
    },
  );
  document.documentElement.dataset.hydrated = "true";
}
void mount();
