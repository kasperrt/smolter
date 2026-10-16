import { fileRouter } from "smolter/vite";
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
  optimizeDeps: { include: ["react", "react-dom/client"] },

  plugins: [demoAssets(), fileRouter(routing), measuredSize()],
});
