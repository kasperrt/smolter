import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const target = resolve(root, ".generated");
const packages = [
  "core",
  "react",
  "preact",
  "client",
  "server",
  "files",
  "vite",
];

export function portableSources(): Plugin {
  return {
    name: "smolter-portable-sources",
    buildStart() {
      rmSync(target, { recursive: true, force: true });

      // Assemble portable source modules without publishing private workspace dependencies.
      for (const name of packages) {
        const source = resolve(root, "packages", name, "src");

        for (const file of readdirSync(source, {
          recursive: true,
          encoding: "utf8",
        })) {
          if (!/\.tsx?$/.test(file)) continue;

          const output = resolve(target, name, file);
          const contents = readFileSync(resolve(source, file), "utf8")
            .replace(/"(\.[^" ]+\.tsx?)"/g, (match, specifier) => {
              const resolved = resolve(
                dirname(resolve(source, file)),
                specifier,
              );
              const local = relative(resolve(root, "packages"), resolved).match(
                /^([^/]+)\/src\/(.+)$/,
              );
              if (!local) return match;
              const path = relative(
                dirname(output),
                resolve(target, local[1], local[2]),
              );
              return JSON.stringify(path.startsWith(".") ? path : `./${path}`);
            })
            .replace(
              /"@smolter\/([\w-]+)(?:\/([^" ]+))?"/g,
              (_: string, dependency: string, subpath = "index") => {
                const extension = existsSync(
                  resolve(
                    root,
                    "packages",
                    dependency,
                    "src",
                    `${subpath}.tsx`,
                  ),
                )
                  ? ".tsx"
                  : ".ts";
                const path = relative(
                  dirname(output),
                  resolve(target, dependency, subpath + extension),
                );

                return JSON.stringify(
                  path.startsWith(".") ? path : `./${path}`,
                );
              },
            );

          mkdirSync(dirname(output), { recursive: true });
          writeFileSync(output, contents);
        }
      }
    },
  };
}
