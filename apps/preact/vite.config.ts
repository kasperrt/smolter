import { fileRouter } from "@kasperrt/smolter/vite";
import { defineConfig } from "vite";
import { demoAssets } from "../../scripts/demo-assets.ts";
import { measuredSize } from "../../scripts/size-plugin.ts";

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

  plugins: [demoAssets(), fileRouter(routing), measuredSize()],
});
