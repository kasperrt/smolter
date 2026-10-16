import reference from "./reference.json";

export interface DocSection {
  title: string;
  body: string;
  code: string;
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

export const docs: DocPage[] = [
  ...[
    "getting-started",
    "routing",
    "data-flow",
    "loaders",
    "actions",
    "forms",
    "fetchers",
    "revalidation",
    "types",
    "errors",
    "server-rendering",
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
