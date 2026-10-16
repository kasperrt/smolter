import routes from "virtual:smolter/routes";
import { hydrateRoot } from "react-dom/client";
import { createRouter } from "smolter/react";
import { app } from "./app";
import "@smolter/ui/style.css";

const root = document.getElementById("root");
const data = document.getElementById("smolter-data");
const router = createRouter(routes, {
  browser: true,
  hydrationData: data?.textContent ? JSON.parse(data.textContent) : undefined,
});

if (root) {
  hydrateRoot(root, app(router));
  root.inert = false;
}
