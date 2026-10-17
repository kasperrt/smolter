import type { DocPage } from "./index";

const guideGroups = [
  {
    title: "Start here",
    description: "Install, choose an entry, add routes",
    slugs: ["getting-started", "routing", "bundle-size"],
  },
  {
    title: "Data flow",
    description: "Read, mutate and refresh",
    slugs: [
      "data-flow",
      "loaders",
      "actions",
      "forms",
      "fetchers",
      "revalidation",
      "types",
      "errors",
    ],
  },
  {
    title: "Server & build",
    description: "SSR, file routes and hosting",
    slugs: ["server-rendering", "virtual-routes", "express", "deployments"],
  },
];

export function documentationGroups(pages: DocPage[]) {
  return [
    ...guideGroups.map((group) => ({
      ...group,
      pages: pages.filter((page) => group.slugs.includes(page.slug)),
    })),
    {
      title: "API reference",
      description: "Functions, hooks and components",
      pages: pages.filter((page) => page.kind === "API"),
    },
    {
      title: "Type reference",
      description: "Options, results and contracts",
      pages: pages.filter((page) => page.kind === "Types"),
    },
  ];
}
