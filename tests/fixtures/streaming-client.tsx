import { mountApplication } from "@smolter/preact/client";
import { StreamingPage, streamingRoot } from "./streaming-page.tsx";

void mountApplication(
  [
    {
      path: "/",
      default: StreamingPage,
      shouldRevalidate: () => false,
      clientAction: async ({ signal }) => {
        const response = await fetch("/mutation", { method: "POST", signal });
        return response.json();
      },
      loader: () => {
        throw new Error("Hydration reran the loader");
      },
    },
    {
      path: "/other",
      default: StreamingPage,
      loader: () => ({ detail: "New route detail" }),
    },
  ],
  streamingRoot,
).then(() => {
  document.documentElement.dataset.hydrated = "true";
});
