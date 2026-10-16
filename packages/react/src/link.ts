/**
 * React components and typed data hooks. Import from smolter/react.
 * @module
 */

import { internalURL } from "@smolter/core";
import { useRouter } from "./context.ts";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "./runtime.ts";
import { createElement } from "./runtime.ts";

/** Anchor attributes with internal navigation and optional history replacement. */
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
}

/** Render an anchor that handles internal navigation and preserves native modified clicks. */
export function Link({
  href,
  replace,
  onClick,
  ...props
}: LinkProps): ReactNode {
  const router = useRouter();
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      props.download !== undefined ||
      (props.target && props.target !== "_self")
    )
      return;

    if (!internalURL(router.getSnapshot().url, href)) return;
    event.preventDefault();
    void router.navigate(href, { replace });
  };

  return createElement("a", { ...props, href, onClick: click });
}
