// Vite replaces this with the configured namespace; other hosts keep the default.
declare const __SMOLTER_NAMESPACE__: string | undefined;

/** Leading underscores, lowercase letters and digits keep every derived HTML, header, URL and script name valid. */
const namespacePattern = /^_*[a-z][a-z0-9]*$/;

/** Prefix used when no namespace is configured. */
export const defaultNamespace = "smolter";

/** Client-visible prefix for transport, hydration and deployment identifiers. */
export const namespace: string =
  typeof __SMOLTER_NAMESPACE__ === "string"
    ? __SMOLTER_NAMESPACE__
    : defaultNamespace;

/** Reject names that could break out of the identifiers derived from them. */
export function validNamespace(value: string): string {
  if (value.length > 32 || !namespacePattern.test(value))
    throw new TypeError(
      "namespace must start with optional underscores followed by a lowercase letter, contain only lowercase letters or digits after that, and be at most 32 characters",
    );
  return value;
}

/** Route data transport suffix, for example /tasks.__smolter. */
export function dataSuffix(name: string = namespace): string {
  return `.__${name}`;
}
