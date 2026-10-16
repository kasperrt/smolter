import { hydrateRoot } from "react-dom/client";
import { createRouter, RouterProvider, Routes } from "smolter";
import { routes } from "./ssr-routes";

const element = document.getElementById("root");
const data = document.getElementById("smolter-data");
if (element && data?.textContent) {
  const router = createRouter(routes, {
    browser: true,
    hydrationData: JSON.parse(data.textContent),
  });
  hydrateRoot(
    element,
    <RouterProvider router={router}>
      <Routes />
    </RouterProvider>,
  );
}
