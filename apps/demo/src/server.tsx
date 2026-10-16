import { renderToString } from "react-dom/server";
import { RouterProvider, Routes } from "smolter";
import { loadRouter, serialize } from "smolter/server";
import { routes } from "./ssr-routes";
export async function render(url: string) {
  const router = await loadRouter(routes, url);
  const html = renderToString(
    <RouterProvider router={router}>
      <Routes />
    </RouterProvider>,
  );
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><title>smolter · SSR</title><meta name="viewport" content="width=device-width, initial-scale=1.0"/><link rel="stylesheet" href="/src/style.css"/></head><body><div id="root">${html}</div><script id="smolter-data" type="application/json">${serialize(router.getSnapshot())}</script><script type="module" src="/src/hydrate.tsx"></script></body></html>`;
}
