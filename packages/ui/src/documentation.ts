import type { DocPage } from "./docs";
import type { ElementFactory, LinkFactory } from "./index";

export interface DocumentationProps<N> {
  page: DocPage;
  pages: DocPage[];
  link: LinkFactory<N>;
}

type CodeRenderer<N> = (source: string, label: string) => N;

export function createDocumentation<N>(
  h: ElementFactory<N>,
  CodeBlock: CodeRenderer<N>,
  link: LinkFactory<N>,
) {
  function Documentation({
    page,
    pages,
    link: renderLink,
  }: DocumentationProps<N>) {
    const sectionId = (title: string) =>
      title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const related = pages.filter(
      (item) =>
        item.slug !== page.slug &&
        new RegExp(`\\b${item.slug}\\b`).test(
          [
            page.signature,
            ...page.sections.map((section) => section.code),
          ].join("\n"),
        ),
    );

    return h(
      "div",
      { className: "documentation" },
      h(
        "nav",
        { className: "docs-sidebar", "aria-label": "Documentation" },
        ...["Guides", "API", "Types"].map((group) =>
          h(
            "section",
            { key: group },
            h("h2", null, group),
            ...pages
              .filter((item) => item.kind === group)
              .map((item) =>
                renderLink(
                  `/docs/${item.slug}`,
                  item.title,
                  item.slug === page.slug ? "active" : undefined,
                ),
              ),
          ),
        ),
      ),
      h(
        "article",
        { className: "docs-article" },
        h("span", { className: "docs-kind" }, page.kind),
        h("h1", { tabIndex: -1 }, page.title),
        h("p", { className: "docs-summary" }, page.summary),
        ...(page.entries
          ? [
              h(
                "p",
                null,
                "Import from ",
                ...page.entries.map((entry) =>
                  h("code", { key: entry }, `@kasperrt/smolter/${entry} `),
                ),
              ),
            ]
          : []),
        ...(page.signature
          ? [
              h(
                "section",
                { id: "signature" },
                h("h2", null, "Signature"),
                CodeBlock(page.signature, `${page.title} signature`),
              ),
            ]
          : []),
        ...page.sections.map((section) =>
          h(
            "section",
            { key: section.title, id: sectionId(section.title) },
            h("h2", null, section.title),
            h("p", null, section.body),
            ...(section.code
              ? [CodeBlock(section.code, `${section.title} example`)]
              : []),
          ),
        ),
        ...(page.fields?.length
          ? [
              h(
                "section",
                { id: "fields" },
                h("h2", null, "Fields"),
                ...page.fields.map((field) =>
                  h(
                    "section",
                    { key: field.name },
                    h("h3", null, field.name),
                    CodeBlock(field.signature, `${field.name} field`),
                    ...(field.summary ? [h("p", null, field.summary)] : []),
                  ),
                ),
              ),
            ]
          : []),
        ...(related.length
          ? [
              h(
                "section",
                { className: "docs-related" },
                h("h2", null, "Related reference"),
                ...related.map((item) =>
                  renderLink(`/docs/${item.slug}`, item.title),
                ),
              ),
            ]
          : []),
        ...(page.source
          ? [
              link(
                `https://github.com/kasperrt/smolter/blob/main/${page.source}`,
                "View implementation ↗",
              ),
            ]
          : []),
      ),
      h(
        "nav",
        { className: "docs-outline", "aria-label": "On this page" },
        h("h2", null, "On this page"),
        ...(page.signature ? [link("#signature", "Signature")] : []),
        ...page.sections.map((section) =>
          link(`#${sectionId(section.title)}`, section.title),
        ),
        ...(page.fields?.length ? [link("#fields", "Fields")] : []),
      ),
    );
  }

  return Documentation;
}
