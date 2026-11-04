import { fileRouter } from "@kasperrt/smolter/preact/vite";
import { demoAssets } from "@smolter/ui/tooling/demo-assets";
import { defineConfig } from "vite";
import { serverRendering } from "./server/render-plugin.ts";
import { sessions } from "./server/session.ts";

const routing =
  process.env.SMOLTER_ROUTES === "manual"
    ? {
        clientRoutes: "src/manual-browser-routes.ts",
        serverRoutes: "src/manual-routes.ts",
      }
    : {};

export default defineConfig({
  appType: "custom",
  resolve: { dedupe: ["preact"] },
  optimizeDeps: { include: ["preact", "preact/hooks", "preact/compat"] },

  plugins: [demoAssets(), sessions(), fileRouter(routing), serverRendering()],
  ssr: { noExternal: ["@smolter/ui", "@kasperrt/smolter"] },
});
