import { ui } from "@smolter/ui/react";
import { createElement as h } from "react";
import { useFetcher, useLoaderData } from "smolter/react";
import type { clientAction } from "./action";
import type { clientLoader } from "./loader";

export default function Task() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();

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
