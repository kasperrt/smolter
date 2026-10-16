import routes from "virtual:smolter/routes";
import { hydrate } from "preact";
import { deserialize } from "smolter/client";
import { createRouter } from "smolter/preact";
import { app } from "./app";
import "@smolter/ui/style.css";

const root = document.getElementById("root");
const data = document.getElementById("smolter-data");
const router = createRouter(routes, {
  browser: true,
  hydrationData: data?.textContent ? deserialize(data.textContent) : undefined,
});

if (root) {
  hydrate(app(router), root);
  root.inert = false;
}
