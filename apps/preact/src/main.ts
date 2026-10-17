import routes from "virtual:smolter/routes";
import { createDataRouter } from "@kasperrt/smolter/preact";
import { siteHistory, siteRoute } from "@smolter/ui/hosting";
import { render } from "preact";
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

if (root) render(app(router), root);
