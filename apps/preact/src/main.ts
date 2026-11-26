import routes from "virtual:smolter/routes";
import { createDataRouter } from "@kasperrt/smolter/preact";
import { deserialize } from "@kasperrt/smolter/preact/client";
import { namespace } from "@kasperrt/smolter/utils";
import { retainRoute } from "@smolter/core/presentation";
import { siteHistory, siteRoute } from "@smolter/ui/hosting";
import { watchMetadata } from "@smolter/ui/metadata";
import { hydrate, render } from "preact";
import { flushSync } from "preact/compat";
import { app } from "./app";
import "@smolter/ui/style.css";

const root = document.getElementById("root");
const data = document.querySelector(
  `script#${namespace}-data[type="application/json"]`,
);
let hydrationData = data?.textContent
  ? deserialize(data.textContent)
  : undefined;

if (hydrationData && import.meta.env.VITE_HOSTED) {
  const url = location.origin + siteRoute(import.meta.env.BASE_URL);
  const renderedPath =
    new URL(hydrationData.url).pathname.replace(/\/$/, "") || "/";
  const requestedPath = new URL(url).pathname.replace(/\/$/, "") || "/";
  if (renderedPath !== requestedPath) {
    hydrationData = undefined;
    root?.replaceChildren();
  }
  if (hydrationData) hydrationData.url = url;
}

const router = createDataRouter(routes, {
  browser: !import.meta.env.VITE_HOSTED,
  hydrationData,
  ...(import.meta.env.VITE_HOSTED && {
    url: location.origin + siteRoute(import.meta.env.BASE_URL),
  }),
});

if (import.meta.env.VITE_HOSTED) {
  siteHistory(router, import.meta.env.BASE_URL);
}
retainRoute(router, flushSync);
watchMetadata(router);

const mount = hydrationData ? hydrate : render;
if (root) mount(app(router), root);
