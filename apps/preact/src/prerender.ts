import { createDataRouter } from "@kasperrt/smolter/preact";
import { serialize } from "@kasperrt/smolter/preact/server";
import { docs } from "@smolter/ui/docs";
import { renderToString } from "preact-render-to-string";
import { app } from "./app";
import { routes } from "./manual-routes";

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

  const page = docs.find((item) => path === `/docs/${item.slug}`);
  const title = page
    ? `${page.title} · smolter`
    : "smolter · Typed routing for React and Preact";

  return { html, data, title };
}
