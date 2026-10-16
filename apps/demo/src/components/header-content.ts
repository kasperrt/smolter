export interface HeaderAttributes {
  [name: string]: string | number;
}
export interface HeaderLinkProps {
  href: string;
  className?: string;
  key?: string;
}
type ElementFactory<T> = (
  tag: string,
  props: HeaderAttributes | null,
  ...children: (T | string)[]
) => T;
type LinkFactory<T> = (
  props: HeaderLinkProps,
  ...children: (T | string)[]
) => T;
/** One definition for React, Preact, and SSR. Preserves the original s. mark. */
export function headerContent<T>(
  element: ElementFactory<T>,
  link: LinkFactory<T> = (props, ...children) =>
    element("a", { ...props }, ...children),
) {
  return [
    link(
      { href: "/", className: "wordmark", key: "logo" },
      element("span", { "aria-hidden": "true" }, "s."),
      element(
        "b",
        { className: "wordmark-name" },
        "smolter",
        element("i", { "aria-hidden": "true" }, "_"),
      ),
    ),
    element(
      "nav",
      { "aria-label": "Main navigation", key: "navigation" },
      link({ href: "/about" }, "The idea"),
      element("a", { href: "https://github.com/kasperrt/smolter" }, "GitHub ↗"),
      element("span", { className: "version" }, "v0.1.1"),
    ),
  ];
}
