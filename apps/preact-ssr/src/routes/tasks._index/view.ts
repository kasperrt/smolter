import { Link, useFetcher, useLoaderData } from "@kasperrt/smolter/preact";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import type { loader as taskLoader } from "../tasks.$id/loader";
import type { action } from "./action";
import type { loader } from "./loader";

export default function Tasks() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
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
    link: (href, children) => h(Link, { href }, children),
    form: (children) =>
      h(fetcher.Form, { action: "/tasks", method: "post" }, ...children),
  });
}
