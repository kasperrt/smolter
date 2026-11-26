import routes from "virtual:smolter/routes";
import {
  handleRequest,
  loadRouter,
  serialize,
} from "@kasperrt/smolter/react/server";
import { namespace } from "@kasperrt/smolter/utils";
import { renderToString } from "react-dom/server";
import { app } from "./app";

export { namespace };

export async function render(request: Request, template: string) {
  const router = await loadRouter(routes, request);
  const html = renderToString(app(router));
  const data = serialize(router.getSnapshot());
  return template
    .replace("<!--app-->", () => html)
    .replace(
      "<!--data-->",
      () =>
        `<script id="${namespace}-data" type="application/json">${data}</script>`,
    );
}

export function data(request: Request) {
  return handleRequest(routes, request);
}
