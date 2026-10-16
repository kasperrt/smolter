import { serverRoute } from "@kasperrt/smolter/react/client";
import { ErrorBoundary, HydrateFallback } from "./boundaries";
import Home from "./routes/_index/view";
import About from "./routes/about/route";
import { HydrateFallback as DocsFallback } from "./routes/docs.$page/fallback";
import Doc from "./routes/docs.$page/view";
import Tasks from "./routes/tasks._index/view";
import { clientAction } from "./routes/tasks.$id/client-action";
import { clientLoader } from "./routes/tasks.$id/client-loader";
import { shouldRevalidate } from "./routes/tasks.$id/should-revalidate";
import Task from "./routes/tasks.$id/view";
import Search from "./routes/tasks.search/view";

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
  serverRoute<typeof import("./routes/tasks.search/route")>("/tasks/search", {
    default: Search,
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
  serverRoute<typeof import("./routes/docs._index/route")>(
    "/docs",
    {
      default: Doc,
      ErrorBoundary,
      HydrateFallback: DocsFallback,
    },
    { loader: true },
  ),
  serverRoute<typeof import("./routes/docs.$page/route")>(
    "/docs/:page",
    {
      default: Doc,
      ErrorBoundary,
      HydrateFallback: DocsFallback,
    },
    { loader: true },
  ),
  serverRoute("/about", { default: About }, {}),
];
