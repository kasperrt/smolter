import { Link, useFetcher, useLoaderData } from "@kasperrt/smolter/preact";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import type { clientAction } from "./clientAction";
import type { clientLoader } from "./clientLoader";

export default function Task() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();
  return ui.TaskDetail({
    task: data,
    link: (href, children) => h(Link, { href: siteHref(href) }, children),
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
