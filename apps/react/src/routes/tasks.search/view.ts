import { Form, Link, useLoaderData } from "@kasperrt/smolter/react";
import { ui } from "@smolter/ui/react";
import { createElement as h } from "react";
import { siteHref } from "../../../../../scripts/site-history";
import type { clientLoader } from "./loader";

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
