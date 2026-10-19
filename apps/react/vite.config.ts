import { fileRouter } from "@kasperrt/smolter/react/vite";
import react from "@vitejs/plugin-react";
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

export default defineConfig(({ mode }) => ({
  optimizeDeps: { include: ["react", "react-dom/client"] },

  plugins: [
    hostedPages("react"),
    splitDocumentation(),
    react({
      compiler: true,
      include: /\/apps\/react(?:-ssr)?\/src\/.*\.[jt]sx?(?:\?.*)?$/,
    }),
    demoAssets(),
    fileRouter(
      mode === "hosted"
        ? {
            clientRoutes: "src/site-routes.ts",
            serverRoutes: "src/site-routes.ts",
          }
        : routing,
    ),
    measuredSize(),
  ],
}));
