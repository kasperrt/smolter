import { fileRouter } from "@kasperrt/smolter/preact/vite";
import { defineConfig } from "vite";
import { demoAssets } from "../../tooling/vite/demo-assets.ts";
import { hostedPages } from "../../tooling/vite/hosted-pages.ts";
import { measuredSize } from "../../tooling/vite/size-plugin.ts";
import { splitDocumentation } from "../../tooling/vite/split-documentation.ts";

const routing =
  process.env.SMOLTER_ROUTES === "manual"
    ? {
        clientRoutes: "src/manual-routes.ts",
        serverRoutes: "src/manual-routes.ts",
      }
    : {};

export default defineConfig({
  resolve: { dedupe: ["preact"] },
  optimizeDeps: { include: ["preact", "preact/hooks", "preact/compat"] },

  plugins: [
    hostedPages("preact"),
    splitDocumentation(),
    demoAssets(),
    fileRouter(routing),
    measuredSize(),
  ],
});
