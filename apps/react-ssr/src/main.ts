import routes from "virtual:smolter/routes";
import { createDataRouter } from "@kasperrt/smolter/react";
import { deserialize } from "@kasperrt/smolter/react/client";
import { namespace } from "@kasperrt/smolter/utils";
import { hydrateRoot } from "react-dom/client";
import { app } from "./app";
import "@smolter/ui/style.css";

const root = document.getElementById("root");
const data = document.querySelector(
  `script#${namespace}-data[type="application/json"]`,
);
const router = createDataRouter(routes, {
  browser: true,
  hydrationData: data?.textContent ? deserialize(data.textContent) : undefined,
});

if (root) {
  hydrateRoot(root, app(router));
  root.inert = false;
}
