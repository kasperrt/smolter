import { mountApplication, serverRoute } from "@kasperrt/smolter/react/client";
import { Destination, Home, root } from "./react-streaming-page.tsx";

void mountApplication(
  [
    serverRoute("/", { default: Home, shouldRevalidate: () => false }),
    { path: "/destination", default: Destination },
    serverRoute("/save", {}, { action: true }),
    serverRoute("/session", {}, { loader: true }),
  ],
  root,
);
