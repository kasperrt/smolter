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
      "React 19+ provides use(promise) with Suspense and an error boundary. Use a stable promise. This replaces promise rendering, not Smolter's Preact deferred-data transport.",
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

const reactReasons: Record<string, string> = {
  useNavigation:
    "Smolter's React adapter has no equivalent page-navigation hook. React does not provide router pending state; useTransition is not a substitute for it.",
  useNavigate:
    "Use the navigate function returned by Smolter's React useLocation for URL navigation. This Preact hook also supports history offsets; React itself has no routing hook.",
  NavLink:
    "Use Smolter's React Link and useLocation to derive active styling. React itself does not provide NavLink.",
  mountApplication:
    "Preact-only application bootstrap. React requires explicit router setup and React DOM hydration; hydrateRoot alone does not install Smolter transport or recovery.",
  renderApplication:
    "Preact-only integrated document renderer. React uses loadRouter and its own server renderer; it does not implement Smolter's Preact deferred-data protocol.",
  RouterApplication:
    "Preact-only root document and route composition. React applications compose RouterProvider and Routes or Outlet themselves.",
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
        ? (reactReasons[page.slug] ??
          "Preact application API; Smolter has no React export for it. It is not a built-in React API.")
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
    const mixedGuide =
      !entries.length &&
      ["server-rendering", "express", "virtual-routes"].includes(page.slug);
    const partialSSR =
      available && (clientOnly || (mixedGuide && framework === "react"));
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
              : mixedGuide && framework === "react"
                ? "Manual SSR integration. Integrated documents and early deferred hydration are Preact-only."
                : "Available to this renderer's SSR integration; browser event handlers run after hydration.",
      },
    ] as Support[];
  });
}
