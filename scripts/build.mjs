import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = resolve(root, "packages/smolter/src/internal");
const packages = [
  "core",
  "react",
  "preact",
  "client",
  "server",
  "files",
  "vite",
];

rmSync(target, { recursive: true, force: true });
rmSync(resolve(root, "packages/smolter/dist"), {
  recursive: true,
  force: true,
});

// Assemble portable source modules without publishing private workspace dependencies.
for (const name of packages) {
  const source = resolve(root, "packages", name, "src");

  for (const file of readdirSync(source, { recursive: true })) {
    if (!file.endsWith(".ts")) continue;

    const output = resolve(target, name, file);
    const contents = readFileSync(resolve(source, file), "utf8").replace(
      /"@smolter\/([\w-]+)"/g,
      (_, dependency) => {
        const path = relative(
          dirname(output),
          resolve(target, dependency, "index.ts"),
        );

        return JSON.stringify(path.startsWith(".") ? path : `./${path}`);
      },
    );

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, contents);
  }
}

execFileSync(
  "pnpm",
  ["exec", "tsc", "-p", "packages/smolter/tsconfig.build.json"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
