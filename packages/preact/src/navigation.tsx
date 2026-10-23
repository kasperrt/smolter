import type { NavigateOptions, Router } from "@smolter/core";
import {
  handoffDocument,
  resolveApplicationURL,
} from "@smolter/core/environment";
import { intentPrefetch } from "@smolter/core/intent";
import { type PrefetchMode, prefetchLink } from "@smolter/core/link-prefetch";
import { pendingLocation } from "@smolter/core/presentation";
import { matchesLocation, navigationClick } from "@smolter/core/url";
import { viewportPrefetch } from "@smolter/core/viewport";
import type { TargetedMouseEvent } from "preact";
import type { ComponentProps, ReactNode } from "preact/compat";
import { useRouter, useSnapshot } from "./context.ts";
import { createElement, useMemo } from "./runtime.ts";

export type { NavigateOptions } from "@smolter/core";

export type { NavigationType } from "@smolter/core/navigation";

/** Navigate to a URL or move through browser history using a numeric offset. */
export type NavigateFunction = (
  to: string | number | Partial<Pick<URL, "pathname" | "search" | "hash">>,
  options?: NavigateOptions,
) => void;

/** Anchor properties and router navigation options, including document reload and prefetch controls. */
export interface LinkProps extends Omit<ComponentProps<"a">, "href" | "role"> {
  to?: string;
  href?: string;
  replace?: boolean;
  role?:
    | "link"
    | "button"
    | "checkbox"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "option"
    | "radio"
    | "switch"
    | "tab"
    | "treeitem"
    | "doc-backlink"
    | "doc-biblioref"
    | "doc-glossref"
    | "doc-noteref";
  prefetch?: PrefetchMode;
  /** Also prefetch loader data. Opt in only for safe, speculative GET reads. */
  prefetchData?: boolean;
  state?: unknown;
  preventScrollReset?: boolean;
  viewTransition?: boolean;
  reloadDocument?: boolean;
}

/** Active and pending flags supplied to NavLink render callbacks. */
export interface NavLinkRenderProps {
  isActive: boolean;
  isPending: boolean;
}

/** Link options with matching rules and state-aware class or children callbacks. */
export interface NavLinkProps
  extends Omit<LinkProps, "className" | "children"> {
  end?: boolean;
  className?: string | ((state: NavLinkRenderProps) => string);
  children?: ReactNode | ((state: NavLinkRenderProps) => ReactNode);
}

/** Render an anchor with same-origin router navigation and intent or viewport prefetching. */
export function Link(options: LinkProps): ReactNode {
  const {
    href: hrefProp,
    to = hrefProp ?? "/",
    replace,
    preventScrollReset,
    viewTransition,
    prefetch = "intent",
    prefetchData = false,
    state,
    reloadDocument,
    ...props
  } = options;
  const router = useRouter();
  const current = new URL(useSnapshot("url"));
  const destination = resolveApplicationURL(new URL(to, current));
  const internal = destination.origin === current.origin;
  const preload = () => prefetchLink(router, destination, prefetchData);
  const forwarded = "ref" in props ? props.ref : undefined;
  const observe = useMemo(
    () =>
      prefetch === "viewport" && typeof viewportPrefetch === "function"
        ? viewportPrefetch(preload, forwarded)
        : undefined,
    [router, destination.href, prefetchData, forwarded, prefetch],
  );
  if (
    !reloadDocument &&
    prefetch === "intent" &&
    internal &&
    typeof intentPrefetch === "function"
  )
    intentPrefetch(props, preload);
  return createElement("a", {
    ...props,
    href: destination.href,
    ...(prefetch === "viewport" &&
      !reloadDocument &&
      internal && { ref: observe }),
    onClick(event: TargetedMouseEvent<HTMLAnchorElement>) {
      props.onClick?.(event);
      if (reloadDocument || !navigationClick(event, event.currentTarget))
        return;
      if (!internal) {
        handoffDocument(event, destination);
        return;
      }
      event.preventDefault();
      void router.navigate(destination.href, options);
    },
  });
}

/** Render a Link with active-route state and aria-current for the matching destination. */
export function NavLink({
  href,
  to = href ?? "/",
  end,
  className,
  children,
  ...props
}: NavLinkProps): ReactNode {
  const router = useRouter<Router>();
  const location = new URL(useSnapshot().url);
  const destination = resolveApplicationURL(new URL(to, location.href));
  const isActive = matchesLocation(location, destination, end);
  const isPending = matchesLocation(pendingLocation(router), destination, end);
  const state = { isActive, isPending };
  return createElement(Link, {
    ...props,
    to,
    className: typeof className === "function" ? className(state) : className,
    ...(isActive && { "aria-current": "page" }),
    children: typeof children === "function" ? children(state) : children,
  });
}

export {
  useNavigate,
  useNavigationType,
  useSearchParams,
  useURLLocation,
} from "./route-hooks.tsx";
