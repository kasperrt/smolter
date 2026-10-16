import { serverRoute } from "smolter/client";
import { ErrorBoundary, HydrateFallback } from "./boundaries";
import Home from "./routes/_index/view";
import About from "./routes/about/route";
import Tasks from "./routes/tasks._index/view";
import { clientAction } from "./routes/tasks.$id/client-action";
import { clientLoader } from "./routes/tasks.$id/client-loader";
import { shouldRevalidate } from "./routes/tasks.$id/should-revalidate";
import Task from "./routes/tasks.$id/view";

export const routes = [
  serverRoute<typeof import("./routes/_index/route")>("/", {
    default: Home,
    ErrorBoundary,
    HydrateFallback,
  }),
  serverRoute<typeof import("./routes/tasks._index/route")>("/tasks", {
    default: Tasks,
    ErrorBoundary,
    HydrateFallback,
  }),
  serverRoute<typeof import("./routes/tasks.$id/route")>("/tasks/:id", {
    default: Task,
    clientLoader,
    clientAction,
    shouldRevalidate,
    ErrorBoundary,
    HydrateFallback,
  }),
  serverRoute("/about", { default: About }, {}),
];
