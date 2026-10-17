import { mountApplication, serverRoute } from "@kasperrt/smolter/preact/client";
import {
  OptionalDestination,
  OptionalHome,
  optionalRoot,
} from "./optional-page.tsx";

void mountApplication(
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
).then(() => {
  document.documentElement.dataset.hydrated = "true";
});
