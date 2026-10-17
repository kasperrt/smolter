import { mountApplication } from "@smolter/preact/client";
import { StreamingPage, streamingRoot } from "./streaming-page.tsx";

void mountApplication(
  [
    {
      path: "/",
      default: StreamingPage,
      loader: () => {
        throw new Error("Hydration reran the loader");
      },
    },
  ],
  streamingRoot,
);
