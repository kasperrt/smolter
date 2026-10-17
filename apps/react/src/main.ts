import routes from "virtual:smolter/routes";
import { createDataRouter } from "@kasperrt/smolter/react";
import { siteHistory, siteRoute } from "@smolter/ui/hosting";
import { createRoot } from "react-dom/client";
import { app } from "./app";
import "@smolter/ui/style.css";

const root = document.getElementById("root");
const router = createDataRouter(routes, {
  browser: !import.meta.env.VITE_HOSTED,
  ...(import.meta.env.VITE_HOSTED && {
    url: location.origin + siteRoute(import.meta.env.BASE_URL),
  }),
});

if (import.meta.env.VITE_HOSTED) siteHistory(router, import.meta.env.BASE_URL);

if (root) createRoot(root).render(app(router));
