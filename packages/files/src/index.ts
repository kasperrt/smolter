/**
 * Build-time discovery of flat file routes.
 * @module
 */

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { safeWrapAsync } from "@smolter/core";

/** A discovered flat route pattern and its module file path. */
export interface RouteFile {
  path: string;
  file: string;
  id?: string;
  parentId?: string;
  index?: boolean;
  pathless?: boolean;
}

const routeFile = /^route\.[jt]sx?$/;
const flatFile = /\.[jt]sx?$/;

/** Read only flat files and immediate route folders. Colocated helpers are ignored. */
export async function flatRoutes(
  directory: string,
  nested = false,
): Promise<RouteFile[] | Error> {
  const result = await safeWrapAsync(async () => {
    const entries = await readdir(directory, { withFileTypes: true });
    const routes: RouteFile[] = [];
    const patterns = new Set<string>();
    for (const entry of entries) {
      let name = entry.name;
      let file = resolve(directory, name);
      if (entry.isDirectory()) {
        const candidates = (await readdir(file)).filter((name) =>
          routeFile.test(name),
        );
        if (candidates.length > 1)
          return new Error(`Multiple route files in ${file}`);
        if (!candidates.length) continue;
        file = resolve(file, candidates[0]);
      } else {
        if (!entry.isFile() || !flatFile.test(name) || name.endsWith(".d.ts"))
          continue;
        name = name.replace(flatFile, "");
      }
      const escaped = name.replaceAll("[.]", "\0");
      if (/[()[\]:*?]/.test(escaped))
        return new Error(`Unsupported flat route name: ${name}`);
      const segments = escaped.split(".");
      const parts: string[] = [];
      for (const [index, segment] of segments.entries()) {
        if (!segment) return new Error(`Empty route segment: ${name}`);
        if (segment === "_index" && index !== segments.length - 1)
          return new Error(`_index must be last: ${name}`);
        if (segment === "$" && index !== segments.length - 1)
          return new Error(`Splat must be last: ${name}`);
        if (segment.startsWith("_")) continue;
        const part = segment.replace(/_$/, "").replaceAll("\0", ".");
        parts.push(part === "$" ? "*" : part.replace(/^\$/, ":"));
      }
      // Pathless grouping modules are not nested layouts in a flat router.
      if (
        !nested &&
        segments.at(-1)?.startsWith("_") &&
        segments.at(-1) !== "_index"
      )
        continue;
      const path = `/${parts.join("/")}`;
      const pattern = path.replace(/:[^/]+/g, ":");
      if (!nested && patterns.has(pattern))
        return new Error(`Conflicting flat route: ${path}`);
      patterns.add(pattern);
      routes.push({
        path,
        file,
        ...(nested && {
          id: `routes/${name}`,
          index: segments.at(-1) === "_index",
          pathless:
            segments.at(-1)!.startsWith("_") && segments.at(-1) !== "_index",
        }),
      });
    }
    if (nested) {
      const ids = new Set(routes.map((route) => route.id!));
      for (const route of routes) {
        const lastSeparator = route.id!.lastIndexOf(".");
        if (lastSeparator < 0) continue;
        let parent = route.id!.slice(0, lastSeparator);
        while (parent.startsWith("routes/")) {
          if (ids.has(parent)) {
            route.parentId = parent;
            break;
          }
          const separator = parent.lastIndexOf(".");
          if (separator < 0) break;
          parent = parent.slice(0, separator);
        }
      }
    }
    if (nested) {
      const leaves = new Set<string>();
      for (const route of routes) {
        if (
          route.pathless ||
          routes.some((child) => child.parentId === route.id && child.index)
        )
          continue;
        const pattern = route.path.replace(/:[^/]+/g, ":");
        if (leaves.has(pattern))
          return new Error(`Conflicting nested route: ${route.path}`);
        leaves.add(pattern);
      }
    }
    return routes.sort((a, b) => {
      const left = a.path.split("/");
      const right = b.path.split("/");
      const rank = (part: string | undefined) =>
        part === "*"
          ? 0
          : part?.startsWith(":")
            ? 1
            : part === undefined
              ? 2
              : 3;
      for (
        let index = 0;
        index < Math.max(left.length, right.length);
        index++
      ) {
        const difference = rank(right[index]) - rank(left[index]);
        if (difference) return difference;
      }
      return (
        a.path.localeCompare(b.path) ||
        Number(b.index ?? false) - Number(a.index ?? false)
      );
    });
  });
  return result.error ?? result.data!;
}
