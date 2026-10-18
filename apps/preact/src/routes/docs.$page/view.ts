import { Link, useLoaderData, useRouter } from "@kasperrt/smolter/preact";
import { safeWrapAsync } from "@smolter/core";
import { docs, readDoc } from "@smolter/ui/docs";
import { siteHref } from "@smolter/ui/hosting";
import { ui } from "@smolter/ui/preact";
import { h } from "preact";
import { useSyncExternalStore } from "preact/compat";
import { useEffect } from "preact/hooks";
import type { clientLoader } from "./clientLoader";

export default function Documentation() {
  const page = useLoaderData<typeof clientLoader>();
  const router = useRouter();
  const pending = useSyncExternalStore(
    router.subscribe,
    () => router.getSnapshot().state === "loading",
  );
  useEffect(() => {
    if (!page) return;
    document
      .querySelector<HTMLElement>(".docs-article h1")
      ?.focus({ preventScroll: true });
    if (!location.hash) scrollTo(0, 0);
  }, [page]);
  return (
    page &&
    ui.Documentation({
      page,
      pending,
      pages: docs,
      link: (href, children, className) => {
        const preload = () => {
          if (!href.startsWith("/docs/")) return;
          const slug = href.slice(6).split(/[?#]/)[0];
          if (slug === page.slug) return;
          void safeWrapAsync(() => readDoc(slug));
        };
        return h(
          Link,
          {
            href: siteHref(href),
            className,
            onPointerEnter: preload,
            onFocus: preload,
            onTouchStart: preload,
          },
          children,
        );
      },
    })
  );
}
