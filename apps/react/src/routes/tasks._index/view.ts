import { Link, useFetcher, useLoaderData } from "@kasperrt/smolter/react";
import { ui } from "@smolter/ui/react";
import { createElement as h } from "react";
import { siteHref } from "../../../../../scripts/site-history";
import type { clientLoader as taskLoader } from "../tasks.$id/loader";
import type { clientAction } from "./action";
import type { clientLoader } from "./loader";

export default function Tasks() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();
  const preview = useFetcher<typeof taskLoader>();

  return ui.TaskList({
    preview: ui.TaskPreview({
      task: preview.data,
      state: preview.state,
      load: () => void preview.load("/tasks/1"),
    }),
    tasks: data?.tasks ?? [],
    state: fetcher.state,
    message: fetcher.error?.message ?? fetcher.data?.message,
    link: (href, children) => h(Link, { href: siteHref(href) }, children),
    form: (children) =>
      h(fetcher.Form, { action: "/tasks", method: "post" }, ...children),
  });
}
