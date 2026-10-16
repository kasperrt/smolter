import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import { useFetcher, useLoaderData } from "smolter/preact";
import type { action } from "./action";
import type { loader } from "./loader";

export default function Task() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  return ui.TaskDetail({
    task: data,
    state: fetcher.state,
    message:
      fetcher.error?.message ??
      (fetcher.data && "message" in fetcher.data
        ? fetcher.data.message
        : undefined),
    form: (children) =>
      h(
        fetcher.Form,
        { action: `/tasks/${data?.id}`, method: "patch" },
        ...children,
      ),
  });
}
