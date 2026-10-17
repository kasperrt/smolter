import {
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "@kasperrt/smolter/react";
import { ui } from "@smolter/ui/react";
import { createElement as h } from "react";
import type { action } from "./action";
import type { loader } from "./loader";

export default function Counter() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
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
