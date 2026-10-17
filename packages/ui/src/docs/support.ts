import type { DocPage } from "./index";

type Level = "yes" | "partial" | "alternative" | "no";
export interface Support {
  label: string;
  short: string;
  level: Level;
  detail: string;
  reference?: { href: string; label: string };
}

// These are framework primitives, not drop-in Smolter application APIs.
const reactAlternatives: Record<
  string,
  { detail: string; reference: { href: string; label: string } }
> = {
  Await: {
    detail:
      "React 19+ provides use(promise) with Suspense and an error boundary. Use a stable promise. Smolter's React application integration revives streamed loader promises before hydration.",
    reference: {
      href: "https://react.dev/reference/react/use",
      label: "React use + Suspense",
    },
  },
  Meta: {
    detail:
      "React 19+ renders title and meta elements into the document head. Select route metadata in your application; React does not read Smolter's meta exports.",
    reference: {
      href: "https://react.dev/reference/react-dom/components/title",
      label: "React document metadata",
    },
  },
  Links: {
    detail:
      "Render link elements with React. Root-module descriptor selection remains application code; React does not read Smolter's links export.",
    reference: {
      href: "https://react.dev/reference/react-dom/components/link",
      label: "React link elements",
    },
  },
  Document: {
    detail:
      "React DOM can hydrate a full html document with hydrateRoot(document, ...). Match server markup yourself; this does not include Smolter's Preact theme-class preservation.",
    reference: {
      href: "https://react.dev/reference/react-dom/client/hydrateRoot",
      label: "React document hydration",
    },
  },
};

/** Entries describe actual exports; guides may discuss several integration levels. */
export function pageSupport(page: DocPage): Support[] {
  const entries = page.entries ?? [];
  return ["react", "preact"].flatMap((framework) => {
    const label = framework === "react" ? "React" : "Preact";
    const short = framework === "react" ? "R" : "P";
    const available =
      !entries.length ||
      entries.some(
        (entry) =>
          entry.startsWith("utils") ||
          entry === framework ||
          entry.startsWith(`${framework}/`),
      );
    const alternative =
      !available && framework === "react"
        ? reactAlternatives[page.slug]
        : undefined;
    const unavailable =
      framework === "react"
        ? "Renderer-specific API; check the documented import for this renderer."
        : "Not implemented by Smolter for Preact; no framework replacement is implied.";
    const serverOnly =
      entries.length > 0 &&
      entries.every(
        (entry) =>
          /\/(server|vite)$/.test(entry) ||
          entry === "utils/http" ||
          entry === "utils/assets",
      );
    const clientOnly =
      entries.length > 0 && entries.every((entry) => entry.endsWith("/client"));
    const partialSSR = available && clientOnly;
    return [
      {
        label,
        short: alternative ? `${short}*` : short,
        level: alternative
          ? "alternative"
          : available && !serverOnly
            ? "yes"
            : "no",
        ...(alternative && { reference: alternative.reference }),
        detail: alternative
          ? alternative.detail
          : !available
            ? unavailable
            : serverOnly
              ? "Server/build API, not a browser import."
              : available
                ? "Available in this renderer's browser integration."
                : unavailable,
      },
      {
        label: `${label} SSR`,
        short: `${short}S${alternative ? "*" : ""}`,
        level: alternative
          ? "alternative"
          : !available
            ? "no"
            : partialSSR
              ? "partial"
              : "yes",
        ...(alternative && { reference: alternative.reference }),
        detail: alternative
          ? alternative.detail
          : !available
            ? unavailable
            : clientOnly
              ? "Client-side setup for an SSR application; do not execute on the server."
              : "Available to this renderer's SSR integration; browser event handlers run after hydration.",
      },
    ] as Support[];
  });
}
