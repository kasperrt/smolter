import react from "@vitejs/plugin-react";
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

  plugins: [
    react({
      compiler: true,
      include: /\/apps\/react(?:-ssr)?\/src\/.*\.[jt]sx?(?:\?.*)?$/,
    }),
    demoAssets(),
    fileRouter(routing),
    measuredSize(),
  ],
});
