import { defineRoute } from "@kasperrt/smolter/react";
import * as home from "./routes/_index/route";
import * as docs from "./routes/docs._index/route";
import * as doc from "./routes/docs.$page/route";

export const routes = [
  defineRoute("/", home),
  defineRoute("/docs", docs),
  defineRoute("/docs/:page", doc),
];
