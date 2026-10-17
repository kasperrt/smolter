import { Link } from "@kasperrt/smolter/preact";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/preact";
import { createElement as h } from "preact";

export default function Home() {
  return ui.Landing((href, children, className) =>
    h(Link, { href: siteHref(href), className }, children),
  );
}
