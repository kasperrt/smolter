import {
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "@kasperrt/smolter/preact";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import type { clientAction } from "./clientAction";
import type { clientLoader } from "./clientLoader";

export default function Counter() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();
  const revalidate = useRevalidator();

  return ui.CounterPanel({
    data,
    state: fetcher.state,
    message: fetcher.error?.message ?? fetcher.data?.message,
    form: (children) =>
      h(
        fetcher.Form,
        { action: "/examples/counter", method: "post" },
        ...children,
      ),
    revalidate: () => void revalidate(),
  });
}
