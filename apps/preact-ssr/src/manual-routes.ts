import { defineRoute } from "@kasperrt/smolter/preact";
import * as home from "./routes/_index/route";
import * as docs from "./routes/docs._index/route";
import * as doc from "./routes/docs.$page/route";
import * as counter from "./routes/examples.counter/route";
import * as tasks from "./routes/tasks._index/route";
import * as task from "./routes/tasks.$id/route";
import * as search from "./routes/tasks.search/route";

export const routes = [
  defineRoute("/", home),
  defineRoute("/tasks", tasks),
  defineRoute("/tasks/search", search),
  defineRoute("/tasks/:id", task),
  defineRoute("/examples/counter", counter),
  defineRoute("/docs", docs),
  defineRoute("/docs/:page", doc),
];
