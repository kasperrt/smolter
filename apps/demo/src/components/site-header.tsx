import { createElement, type ReactNode } from "react";
import { Link } from "smolter";
import { headerContent } from "./header-content";

interface SiteHeaderProps {
  spa?: boolean;
}
export function SiteHeader({ spa }: SiteHeaderProps) {
  const link = spa
    ? (props: Parameters<typeof Link>[0], ...children: ReactNode[]) =>
        createElement(Link, props, ...children)
    : undefined;
  return <header>{headerContent<ReactNode>(createElement, link)}</header>;
}
