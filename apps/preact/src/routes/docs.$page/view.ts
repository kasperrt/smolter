import { Link, useLoaderData } from "@kasperrt/smolter/preact";
import { docs } from "@smolter/ui/docs";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import { useEffect } from "preact/hooks";
import type { clientLoader } from "./clientLoader";

export default function Documentation() {
  const page = useLoaderData<typeof clientLoader>();

  useEffect(() => {
    if (!page) return;

    const previousTitle = document.title;

    document.title = `${page.title} · smolter docs`;
    document
      .querySelector<HTMLElement>(".docs-article h1")
      ?.focus({ preventScroll: true });

    if (!location.hash) scrollTo(0, 0);

    return () => {
      document.title = previousTitle;
    };
  }, [page]);

  return (
    page &&
    ui.Documentation({
      page,
      pages: docs,
      link: (href, children, className) =>
        h(Link, { href: siteHref(href), className }, children),
    })
  );
}
