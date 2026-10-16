import { defineRoute } from "smolter/react";
import * as home from "./routes/_index/route";
import * as about from "./routes/about/route";
import * as tasks from "./routes/tasks._index/route";
import * as task from "./routes/tasks.$id/route";

export const routes = [
  defineRoute("/", home),
  defineRoute("/tasks", tasks),
  defineRoute("/tasks/:id", task),
  defineRoute("/about", about),
];
