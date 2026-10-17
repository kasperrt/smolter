import { matchRoutes, type NavigateOptions } from "@smolter/core";
import {
  handoffDocument,
  resolveApplicationURL,
} from "@smolter/core/environment";
import { navigationClick } from "@smolter/core/url";
import type { TargetedMouseEvent } from "preact";
import type { ComponentProps, ReactNode } from "preact/compat";
import { useRouter, useSnapshot } from "./context.ts";
import { useURLLocation } from "./route-hooks.tsx";
import type { AppRoute } from "./route-types.ts";
import { createElement } from "./runtime.ts";

export type { NavigateOptions } from "@smolter/core";

export type { NavigationType } from "@smolter/core/navigation";

export type NavigateFunction = (
  to: string | number | Partial<Pick<URL, "pathname" | "search" | "hash">>,
  options?: NavigateOptions,
) => void;

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
  prefetch?: string;
  state?: unknown;
  preventScrollReset?: boolean;
  viewTransition?: boolean;
  reloadDocument?: boolean;
}

export interface NavLinkRenderProps {
  isActive: boolean;
  isPending: boolean;
}

export interface NavLinkProps
  extends Omit<LinkProps, "className" | "children"> {
  end?: boolean;
  className?: string | ((state: NavLinkRenderProps) => string);
  children?: ReactNode | ((state: NavLinkRenderProps) => ReactNode);
}

export function Link(options: LinkProps): ReactNode {
  const {
    href: hrefProp,
    to = hrefProp ?? "/",
    replace,
    preventScrollReset,
    viewTransition,
    prefetch,
    state,
    reloadDocument,
    ...props
  } = options;
  const router = useRouter();
  const current = new URL(useSnapshot("url"));
  const destination = resolveApplicationURL(new URL(to, current));
  const internal = destination.origin === current.origin;
  const preload = () => {
    const route = matchRoutes(router.routes, destination.pathname)?.route as
      | AppRoute
      | undefined;

    void route?.preload?.().catch(() => {});
  };

  if (!reloadDocument && prefetch !== "none" && internal) {
    for (const name of ["onPointerEnter", "onFocus", "onTouchStart"] as const) {
      const handler = props[name] as ((event: Event) => void) | undefined;

      props[name] = (event) => {
        handler?.(event);
        preload();
      };
    }
  }

  return createElement("a", {
    ...props,
    href: destination.href,
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

export function NavLink({
  href,
  to = href ?? "/",
  end,
  className,
  children,
  ...props
}: NavLinkProps): ReactNode {
  const location = useURLLocation();
  const target = new URL(to, location.href).pathname;
  const isActive =
    location.pathname === target ||
    (!end && target !== "/" && location.pathname.startsWith(`${target}/`));
  const state = { isActive, isPending: false };

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
