import { createDataRouter } from "@kasperrt/smolter/react";
import { serialize } from "@kasperrt/smolter/react/server";
import { docs } from "@smolter/ui/docs";
import { pageMetadata } from "@smolter/ui/metadata";
import { renderToString } from "react-dom/server";
import { app } from "./app";
import { routes } from "./site-routes";

export const paths = ["", "docs", ...docs.map((page) => `docs/${page.slug}`)];

export async function prerender(path: string) {
  const router = createDataRouter(routes, {
    url: `https://kasperrt.github.io${path}`,
  });
  await router.navigate(path);
  const snapshot = router.getSnapshot();
  const html = renderToString(app(router));
  const data = serialize(snapshot);
  router.dispose();
  return { html, data, metadata: pageMetadata(path, snapshot.data) };
}
