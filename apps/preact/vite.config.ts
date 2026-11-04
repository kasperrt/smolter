import { fileRouter } from "@kasperrt/smolter/preact/vite";
import { demoAssets } from "@smolter/ui/tooling/demo-assets";
import { hostedPages } from "@smolter/ui/tooling/hosted-pages";
import { splitDocumentation } from "@smolter/ui/tooling/split-documentation";
import { defineConfig } from "vite";

const routing =
  process.env.SMOLTER_ROUTES === "manual"
    ? {
        clientRoutes: "src/manual-routes.ts",
        serverRoutes: "src/manual-routes.ts",
      }
    : {};

export default defineConfig(({ mode }) => ({
  resolve: { dedupe: ["preact"] },
  optimizeDeps: { include: ["preact", "preact/hooks", "preact/compat"] },

  plugins: [
    hostedPages("preact"),
    splitDocumentation(),
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
