import { defaultNamespace, validNamespace } from "@smolter/core/namespace";
import type { ResolvedConfig, UserConfig } from "vite";

const key = "__SMOLTER_NAMESPACE__";

/** Compile the namespace into browser and SSR modules, including Smolter's own. */
export function namespaceConfig(namespace?: string): UserConfig {
  if (namespace === undefined) return {};
  return { define: { [key]: JSON.stringify(validNamespace(namespace)) } };
}

/** Read the effective namespace from the resolved define, so every plugin agrees. */
export function configuredNamespace(config: ResolvedConfig): string {
  const value: unknown = config.define?.[key];
  if (value === undefined) return defaultNamespace;
  return validNamespace(
    String(typeof value === "string" ? JSON.parse(value) : value),
  );
}
