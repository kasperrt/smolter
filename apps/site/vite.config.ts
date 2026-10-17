import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  base: "/smolter/",
  build: { outDir: "../../site", emptyOutDir: true },
});
