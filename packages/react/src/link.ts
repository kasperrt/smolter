/**
 * React components and typed data hooks. Import from @kasperrt/smolter/react.
 * @module
 */

import { internalURL, navigationClick } from "@smolter/core/url";
import { useRouter } from "./context.ts";

import {
  type AnchorHTMLAttributes,
  createElement,
  type MouseEvent,
  type ReactNode,
} from "./runtime.ts";

/** Anchor attributes with internal navigation and optional history replacement. */
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
}

/** Render an anchor that handles internal navigation and preserves native modified clicks. */
export function Link(options: LinkProps): ReactNode {
  const { href, replace, onClick, ...props } = options;
  const router = useRouter();
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (!navigationClick(event, event.currentTarget)) return;

    if (!internalURL(router.getSnapshot().url, href)) return;

    event.preventDefault();
    void router.navigate(href, options);
  };

  return createElement("a", { ...props, href, onClick: click });
}
