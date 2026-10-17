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

export const entryRows: (string | number)[][] = [
  ["Routing-only named imports", sizes.reactRouting, sizes.preactRouting],
  ["Common routing + data imports", sizes.reactCommon, sizes.preactCommon],
  ["Complete /react or /preact entry", sizes.react, sizes.preact],
  [
    "Complete entry + server request transport",
    sizes.reactServer,
    sizes.preactServer,
  ],
  [
    "Application: adapter + /client + /document",
    sizes.reactApplication,
    sizes.preactApplication,
  ],
  [
    "Application + /lazy-route",
    sizes.reactLazyApplication,
    sizes.preactLazyApplication,
  ],
];

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

export function createSizeCards<N>(h: ElementFactory<N>) {
  return function SizeCards() {
    return h(
      "div",
      { className: "size-cards" },
      ...[
        {
          title: "Navigation",
          api: "createRouter",
          description: "Paths, links and history.",
          react: sizes.reactRouting,
          preact: sizes.preactRouting,
        },
        {
          title: "Routing + data",
          api: "createDataRouter",
          description: "Loaders, actions, forms and fetchers.",
          react: sizes.reactCommon,
          preact: sizes.preactCommon,
        },
      ].map((tier) =>
        h(
          "section",
          { className: "size-card", key: tier.api },
          h("h4", null, tier.title),
          h("code", null, tier.api),
          h("p", null, tier.description),
          h(
            "dl",
            null,
            ...[
              ["React", tier.react],
              ["Preact", tier.preact],
            ].map(([name, bytes]) =>
              h(
                "div",
                { key: name },
                h("dt", null, name),
                h(
                  "dd",
                  null,
                  h("strong", null, bytes),
                  " B",
                  h("small", null, "gzip"),
                ),
              ),
            ),
          ),
          h(
            "span",
            { className: "size-card-note" },
            "Named imports · framework excluded",
          ),
        ),
      ),
    );
  };
}
