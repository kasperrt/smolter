import { ui } from "@smolter/ui/preact";
import { h, render } from "preact";
import {
  createRouter,
  defineRoute,
  RouterProvider,
  Routes,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "smolter/preact";
import { clientAction } from "./routes/home/action";
import { clientLoader } from "./routes/home/loader";
import "./style.css";

function Counter() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();
  const revalidate = useRevalidator();
  return ui.CounterPanel({
    data,
    state: fetcher.state,
    message: fetcher.data?.message,
    form: (children) => h(fetcher.Form, null, ...children),
    revalidate: () => void revalidate(),
  });
}
const router = createRouter(
  [
    defineRoute("/preact.html", {
      default: Counter,
      clientLoader,
      clientAction,
      HydrateFallback: ui.CounterFallback,
    }),
  ],
  { browser: true },
);
const root = document.getElementById("root");
if (root)
  render(
    h(
      RouterProvider,
      { router },
      ui.Shell({
        mode: "Preact",
        content: h(Routes, { fallback: ui.CounterFallback() }),
      }),
    ),
    root,
  );
