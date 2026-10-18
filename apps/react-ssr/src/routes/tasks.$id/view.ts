import { Link, useFetcher, useLoaderData } from "@kasperrt/smolter/react";
import { ui } from "@smolter/ui/react";
import { createElement as h } from "react";
import type { action } from "./action";
import type { loader } from "./loader";

export default function Task() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  return ui.TaskDetail({
    task: data,
    link: (href, children) => h(Link, { href: href }, children),
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
