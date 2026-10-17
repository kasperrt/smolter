import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import manifest from "./package.json";
import { portableSources } from "./tooling/vite/portable-sources.ts";

const source = resolve(".generated");
const entries = Object.fromEntries(
  Object.values(manifest.exports).map((entry) => {
    const name = entry.import.replace("./dist/", "").replace(/\.js$/, "");
    const [owner, ...module] = name.split("/");
    const extension = existsSync(
      resolve("packages", owner, "src", `${module.join("/")}.tsx`),
    )
      ? ".tsx"
      : ".ts";

    return [name, resolve(source, name + extension)];
  }),
);

export default defineConfig({
  plugins: [portableSources()],
  build: {
    outDir: "dist",
    lib: { entry: entries, formats: ["es"] },
    minify: false,
    target: "es2022",
    rolldownOptions: {
      external: (id) =>
        !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
      output: {
        preserveModules: true,
        preserveModulesRoot: source,
        entryFileNames: "[name].js",
      },
    },
  },
});
