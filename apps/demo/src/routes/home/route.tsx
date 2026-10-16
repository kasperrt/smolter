import { ui } from "@smolter/ui/react";
import { createElement } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "smolter";
import type { clientAction } from "./action";
import type { clientLoader } from "./loader";

export { clientAction } from "./action";
export { ErrorBoundary } from "./components/error-boundary";
export { HydrateFallback } from "./components/hydrate-fallback";
export { clientLoader } from "./loader";
export default function Home() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();
  const revalidate = useRevalidator();
  return ui.CounterPanel({
    data,
    state: fetcher.state,
    message: fetcher.data?.message,
    form: (children) => createElement(fetcher.Form, null, ...children),
    revalidate: () => void revalidate(),
  });
}
