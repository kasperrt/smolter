import { Form, Link, useLoaderData } from "@kasperrt/smolter/react";
import { ui } from "@smolter/ui/react";
import { createElement as h } from "react";

import type { loader } from "./loader";

export default function SearchTasks() {
  const data = useLoaderData<typeof loader>();
  return ui.TaskSearch({
    query: data?.query ?? "",
    tasks: data?.tasks ?? [],
    link: (href, children) => h(Link, { href: href }, children),
    form: (children) =>
      h(Form, { action: "/tasks/search", method: "get" }, ...children),
  });
}
