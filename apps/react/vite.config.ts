import { fileRouter } from "@kasperrt/smolter/react/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { demoAssets } from "../../tooling/vite/demo-assets.ts";
import { hostedPages } from "../../tooling/vite/hosted-pages.ts";
import { measuredSize } from "../../tooling/vite/size-plugin.ts";

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
    hostedPages("react"),
    react({
      compiler: true,
      include: /\/apps\/react(?:-ssr)?\/src\/.*\.[jt]sx?(?:\?.*)?$/,
    }),
    demoAssets(),
    fileRouter(routing),
    measuredSize(),
  ],
});
