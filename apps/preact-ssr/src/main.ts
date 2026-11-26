import routes from "virtual:smolter/routes";
import { createDataRouter } from "@kasperrt/smolter/preact";
import { deserialize } from "@kasperrt/smolter/preact/client";
import { hydrate } from "preact";
import { app } from "./app";
import "@smolter/ui/style.css";

const root = document.getElementById("root");
const data = document.querySelector(
  'script#smolter-data[type="application/json"]',
);
const router = createDataRouter(routes, {
  browser: true,
  hydrationData: data?.textContent ? deserialize(data.textContent) : undefined,
});

if (root) {
  hydrate(app(router), root);
  root.inert = false;
}
