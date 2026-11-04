import { pageMetadata, siteOrigin } from "@smolter/ui/metadata";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Static tags are available to crawlers and link previews without JavaScript. */
export function metadataTags(meta: ReturnType<typeof pageMetadata>) {
  const image = `${siteOrigin}/smolter/social.png`;
  const fields = [
    ["name", "description", meta.description],
    ["name", "robots", meta.robots],
    ["name", "author", "Kasper Rynning-Tønnesen"],
    ["name", "theme-color", "#ded3ef"],
    ["name", "color-scheme", "light"],
    ["property", "og:type", "website"],
    ["property", "og:site_name", "smolter"],
    ["property", "og:locale", "en_US"],
    ["property", "og:title", meta.title],
    ["property", "og:description", meta.description],
    ["property", "og:url", meta.canonical],
    ["property", "og:image", image],
    ["property", "og:image:type", "image/png"],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    [
      "property",
      "og:image:alt",
      "smolter — typed routing for React and Preact",
    ],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", meta.title],
    ["name", "twitter:description", meta.description],
    ["name", "twitter:image", image],
    [
      "name",
      "twitter:image:alt",
      "smolter — typed routing for React and Preact",
    ],
  ];
  const structured = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "@kasperrt/smolter",
    description: "A small typed router for React and Preact.",
    codeRepository: "https://github.com/kasperrt/smolter",
    url: `${siteOrigin}/smolter/`,
    programmingLanguage: "TypeScript",
    license: "https://github.com/kasperrt/smolter/blob/main/LICENSE",
  };
  return `<title>${escape(meta.title)}</title><link rel="canonical" href="${escape(meta.canonical)}"><link rel="apple-touch-icon" sizes="180x180" href="${siteOrigin}/smolter/apple-touch-icon.png"><link rel="sitemap" type="application/xml" href="${siteOrigin}/smolter/sitemap.xml">${fields.map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escape(value)}">`).join("")}<script type="application/ld+json">${JSON.stringify(structured)}</script>`;
}
