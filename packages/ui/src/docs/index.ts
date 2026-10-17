import sizes from "../size.json";
import reference from "./reference.json";

export interface DocSection {
  title: string;
  body: string;
  code: string;
  links?: { href: string; label: string }[];
}

export interface DocPage {
  slug: string;
  title: string;
  summary: string;
  kind: string;
  sections: DocSection[];
  entries?: string[];
  signature?: string;
  fields?: { name: string; signature: string; summary: string }[];
  source?: string;
}

const authored = Object.values(
  import.meta.glob<DocPage>("./pages/*.json", {
    eager: true,
    import: "default",
  }),
);

const sizeGuide = authored.find((page) => page.slug === "bundle-size")!;
sizeGuide.sections[1].code = [
  `React routing only: ${sizes.reactRouting} B gzip`,
  `Preact routing only: ${sizes.preactRouting} B gzip`,
  `React common routing/data: ${sizes.reactCommon} B gzip`,
  `Preact common routing/data: ${sizes.preactCommon} B gzip`,
  `wouter routing subset: ${sizes.wouterRouting} B gzip`,
  `wouter-preact routing subset: ${sizes.wouterPreactRouting} B gzip`,
  `React complete entry: ${sizes.react} B gzip`,
  `Preact complete entry: ${sizes.preact} B gzip`,
  `React + server transport: ${sizes.reactServer} B gzip`,
  `Preact + server transport: ${sizes.preactServer} B gzip`,
  `React optional resource API: ${sizes.reactData} B gzip`,
  `Preact + client + document: ${sizes.preactApplication} B gzip`,
  `Preact + client + document + lazy routes: ${sizes.preactLazyApplication} B gzip`,
].join("\n");

export const docs: DocPage[] = [
  ...[
    "getting-started",
    "migration-0.3",
    "routing",
    "bundle-size",
    "data-flow",
    "loaders",
    "actions",
    "forms",
    "fetchers",
    "revalidation",
    "types",
    "errors",
    "server-rendering",
    "virtual-routes",
    "express",
  ].map((slug) => authored.find((page) => page.slug === slug)!),
  ...reference.map((entry) => ({
    ...entry,
    sections: authored.find((page) => page.slug === entry.slug)?.sections ?? [],
    summary:
      authored.find((page) => page.slug === entry.slug)?.summary ||
      entry.summary,
  })),
];

export function readDoc(slug = "getting-started"): DocPage | Error {
  return (
    docs.find((page) => page.slug === slug) ??
    new Error("Documentation page not found")
  );
}
