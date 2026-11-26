import { fileRouter } from "@kasperrt/smolter/preact/vite";
import { demoAssets } from "@smolter/ui/tooling/demo-assets";
import { splitDocumentation } from "@smolter/ui/tooling/split-documentation";
import { defineConfig } from "vite";
import { serverRendering } from "./server/render-plugin.ts";
import { sessions } from "./server/session.ts";

// Rename every client-visible Smolter identifier, including the example session cookie.
const namespace = "smolter";

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
    splitDocumentation(),
    demoAssets(),
    sessions(namespace),
    fileRouter({ ...routing, namespace }),
    serverRendering(namespace),
  ],
  ssr: { noExternal: ["@smolter/ui", "@kasperrt/smolter"] },
});
