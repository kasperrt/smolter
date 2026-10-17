import { serverRoute } from "@kasperrt/smolter/react/client";
import { ErrorBoundary } from "./ErrorBoundary";
import { HydrateFallback } from "./HydrateFallback";
import Home from "./routes/_index/route";
import { HydrateFallback as DocsFallback } from "./routes/docs.$page/HydrateFallback";
import Doc from "./routes/docs.$page/view";
import { HydrateFallback as CounterFallback } from "./routes/examples.counter/HydrateFallback";
import Counter from "./routes/examples.counter/view";
import Tasks from "./routes/tasks._index/view";
import { clientAction } from "./routes/tasks.$id/clientAction";
import { clientLoader } from "./routes/tasks.$id/clientLoader";
import { shouldRevalidate } from "./routes/tasks.$id/shouldRevalidate";
import Task from "./routes/tasks.$id/view";
import Search from "./routes/tasks.search/view";

export const routes = [
  serverRoute<typeof import("./routes/examples.counter/route")>(
    "/examples/counter",
    {
      default: Counter,
      ErrorBoundary,
      HydrateFallback: CounterFallback,
    },
  ),
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
  serverRoute("/", { default: Home }, {}),
];
