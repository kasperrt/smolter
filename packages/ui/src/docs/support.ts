import type { DocPage } from "./index";

type Level = "yes" | "partial" | "no";
export interface Support {
  label: string;
  short: string;
  level: Level;
  detail: string;
}

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
    const mixedGuide =
      !entries.length &&
      ["server-rendering", "express", "virtual-routes"].includes(page.slug);
    const partialSSR =
      available && (clientOnly || (mixedGuide && framework === "react"));
    return [
      {
        label,
        short,
        level: available && !serverOnly ? "yes" : "no",
        detail: serverOnly
          ? "Server/build API, not a browser import."
          : available
            ? "Available in this renderer's browser integration."
            : "Not exported for this renderer.",
      },
      {
        label: `${label} SSR`,
        short: `${short}S`,
        level: !available ? "no" : partialSSR ? "partial" : "yes",
        detail: !available
          ? "Not exported for this renderer."
          : clientOnly
            ? "Client-side setup for an SSR application; do not execute on the server."
            : mixedGuide && framework === "react"
              ? "Manual SSR integration. Integrated documents and early deferred hydration are Preact-only."
              : "Available to this renderer's SSR integration; browser event handlers run after hydration.",
      },
    ] as Support[];
  });
}
