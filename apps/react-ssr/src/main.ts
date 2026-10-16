import routes from "virtual:smolter/routes";
import { createRouter } from "@kasperrt/smolter/react";
import { deserialize } from "@kasperrt/smolter/react/client";
import { hydrateRoot } from "react-dom/client";
import { app } from "./app";
import "@smolter/ui/style.css";

const root = document.getElementById("root");
const data = document.getElementById("smolter-data");
const router = createRouter(routes, {
  browser: true,
  hydrationData: data?.textContent ? deserialize(data.textContent) : undefined,
});

if (root) {
  hydrateRoot(root, app(router));
  root.inert = false;
}
