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
  return applicationEnvironment?.resolveURL?.(url) ?? url;
}

export function handoffDocument(event: MouseEvent, destination: URL): void {
  if (
    !applicationEnvironment?.isDocumentHandoff?.(
      new URL(location.href),
      destination,
    )
  )
    return;
  event.preventDefault();
  leaveDocument(destination);
}

export function leaveDocument(destination: URL): void {
  if (applicationEnvironment?.leaveDocument) {
    applicationEnvironment.leaveDocument(destination);
    return;
  }
  location.assign(destination.href);
}
