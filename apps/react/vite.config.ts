import { fileRouter } from "@kasperrt/smolter/react/vite";
import { demoAssets } from "@smolter/ui/tooling/demo-assets";
import { hostedPages } from "@smolter/ui/tooling/hosted-pages";
import { splitDocumentation } from "@smolter/ui/tooling/split-documentation";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  ],
}));
