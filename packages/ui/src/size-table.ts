import sizes from "./size.json";
import type { ElementFactory } from "./types";

export function createSizeTable<N>(h: ElementFactory<N>) {
  return function SizeTable(
    label: string,
    headings: string[],
    rows: (string | number)[][],
  ) {
    return h(
      "div",
      { className: "size-table-scroll", tabIndex: 0, "aria-label": label },
      h(
        "table",
        { className: "size-table" },
        h("caption", null, label),
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ...headings.map((heading) => h("th", { scope: "col" }, heading)),
          ),
        ),
        h(
          "tbody",
          null,
          ...rows.map(([name, ...values]) =>
            h(
              "tr",
              null,
              h("th", { scope: "row" }, name),
              ...values.map((value) => h("td", null, value)),
            ),
          ),
        ),
      ),
    );
  };
}

export const comparisonRows: (string | number)[][] = [
  ["smolter routing-only", sizes.reactRouting, sizes.preactRouting],
  ["wouter routing subset", sizes.wouterRouting, sizes.wouterPreactRouting],
  [
    "React Router declarative routing subset",
    sizes.reactRouterRouting,
    "React API",
  ],
  ["smolter common routing + data", sizes.reactCommon, sizes.preactCommon],
  ["React Router data routing subset", sizes.reactRouterData, "React API"],
];
