import { Form, Link, useLoaderData } from "@kasperrt/smolter/preact";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import type { clientLoader } from "./clientLoader";

export default function SearchTasks() {
  const data = useLoaderData<typeof clientLoader>();
  return ui.TaskSearch({
    query: data?.query ?? "",
    tasks: data?.tasks ?? [],
    link: (href, children) => h(Link, { href: siteHref(href) }, children),
    form: (children) =>
      h(Form, { action: "/tasks/search", method: "get" }, ...children),
  });
}
