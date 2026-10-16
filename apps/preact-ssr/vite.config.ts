import { fileRouter } from "@kasperrt/smolter/vite";
import { defineConfig } from "vite";
import { demoAssets } from "../../scripts/demo-assets.ts";
import { measuredSize } from "../../scripts/size-plugin.ts";
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

  plugins: [
    demoAssets(),
    sessions(),
    fileRouter(routing),
    measuredSize(),
    serverRendering(),
  ],
  ssr: { noExternal: ["@smolter/ui", "@kasperrt/smolter"] },
});
