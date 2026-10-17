import { fileRouter } from "@kasperrt/smolter/react/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { demoAssets } from "../../tooling/vite/demo-assets.ts";
import { measuredSize } from "../../tooling/vite/size-plugin.ts";
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
  optimizeDeps: { include: ["react", "react-dom/client"] },

  plugins: [
    react({
      compiler: true,
      include: /\/apps\/react(?:-ssr)?\/src\/.*\.[jt]sx?(?:\?.*)?$/,
    }),
    demoAssets(),
    sessions(),
    fileRouter(routing),
    measuredSize(),
    serverRendering(),
  ],
  ssr: { noExternal: ["@smolter/ui", "@kasperrt/smolter"] },
});
