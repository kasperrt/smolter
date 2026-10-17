import type { DocPage } from "./docs";
import { documentationGroups } from "./docs/navigation";
import { pageSupport } from "./docs/support";
import type { ElementFactory, LinkFactory } from "./types";

export interface DocumentationProps<N> {
  page: DocPage;
  pending?: boolean;
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
    pending = false,
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
        h(
          "p",
          { className: "docs-support-key" },
          "R React · P Preact · S SSR; dotted = partial, struck = unavailable",
        ),
        h(
          "span",
          { className: "docs-loading", role: "status" },
          pending ? "Loading guide…" : "",
        ),
        ...documentationGroups(pages).map((group) =>
          h(
            "section",
            { key: group.title },
            h("h2", null, group.title),
            h("p", { className: "docs-group-description" }, group.description),
            ...group.pages.map((item) =>
              renderLink(
                `/docs/${item.slug}`,
                h(
                  "span",
                  { className: "docs-nav-label" },
                  h("span", null, item.title),
                  h(
                    "span",
                    { className: "docs-support-mini", "aria-hidden": true },
                    ...pageSupport(item).map((support) =>
                      h(
                        "abbr",
                        {
                          key: support.short,
                          className: `support-${support.level}`,
                          title: `${support.label}: ${support.detail}`,
                        },
                        support.short,
                      ),
                    ),
                  ),
                ),
                item.slug === page.slug ? "active" : undefined,
              ),
            ),
          ),
        ),
      ),
      h(
        "article",
        { className: "docs-article", "aria-busy": pending },
        h("span", { className: "docs-kind" }, page.kind),
        h("h1", { tabIndex: -1 }, page.title),
        h("p", { className: "docs-summary" }, page.summary),
        h(
          "section",
          { className: "docs-support", "aria-label": "Compatibility" },
          h("h2", null, "Compatibility"),
          ...pageSupport(page).map((support) =>
            h(
              "div",
              { key: support.short },
              h(
                "strong",
                { className: `support-${support.level}` },
                support.label,
              ),
              h("span", null, support.detail),
            ),
          ),
        ),
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
            ...(section.links ?? []).map(({ href, label }) =>
              h("p", { key: href }, renderLink(href, label)),
            ),
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
                    { key: field.name, id: `field-${sectionId(field.name)}` },
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
        ...page.sections.flatMap((section, index) => [
          ...(section.group && section.group !== page.sections[index - 1]?.group
            ? [h("h3", { className: "docs-outline-group" }, section.group)]
            : []),
          link(
            `#${sectionId(section.title)}`,
            section.title,
            section.group ? "docs-outline-child" : undefined,
          ),
        ]),
        ...(page.fields?.length
          ? [
              link("#fields", "Fields"),
              h(
                "div",
                { className: "docs-outline-children" },
                ...page.fields.map((field) =>
                  link(`#field-${sectionId(field.name)}`, field.name),
                ),
              ),
            ]
          : []),
      ),
    );
  }

  return Documentation;
}
