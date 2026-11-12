import type { NavigationRouter } from "./navigation-router.ts";
import { leaveTransition } from "./view-transition.ts";

/** Application base URLs, navigation handoff and document-transition settings shared by browser integrations. */
export interface ApplicationEnvironment {
  resolveURL?: (url: URL) => URL;
  isDocumentHandoff?: (from: URL, to: URL) => boolean;
  leaveDocument?: (destination: URL) => void;
  entryScript?: string;
}

// An absent configuration lets bundlers remove unused deployment callbacks.
export let applicationEnvironment: ApplicationEnvironment | undefined;

/** Configure deployment-specific navigation before rendering or mounting. */
export function configureApplication(
  environment: ApplicationEnvironment,
): void {
  applicationEnvironment = environment;
}

export function resolveApplicationURL(url: URL): URL {
  return navigationTarget(applicationEnvironment?.resolveURL?.(url) ?? url);
}

export function handoffDocument(
  event: MouseEvent,
  destination: URL,
  router?: NavigationRouter,
): void {
  if (
    !applicationEnvironment?.isDocumentHandoff?.(
      new URL(location.href),
      destination,
    )
  )
    return;
  event.preventDefault();
  leaveDocument(destination, router);
}

// With a router, the current route's viewTransition presents the departure.
export function leaveDocument(
  destination: URL,
  router?: NavigationRouter,
): void {
  navigationTarget(destination);
  const leave = () => {
    if (applicationEnvironment?.leaveDocument) {
      applicationEnvironment.leaveDocument(destination);
      return;
    }
    location.assign(destination.href);
  };
  if (router && leaveTransition?.(router, destination, leave)) return;
  leave();
}

export function navigationTarget(url: URL): URL {
  if (url.protocol === "javascript:")
    throw new TypeError("JavaScript navigation is not allowed");
  return url;
}
