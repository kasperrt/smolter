import { Link } from "@kasperrt/smolter/react";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/react";
import { createElement as h } from "react";

export default function Home() {
  return ui.Landing((href, children, className) =>
    h(Link, { href: siteHref(href), className }, children),
  );
}
