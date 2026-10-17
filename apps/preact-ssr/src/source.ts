import { useLocation } from "@kasperrt/smolter/preact";
import { ui } from "@smolter/ui/preact";
import { useState } from "preact/hooks";
import fileRoutes from "./examples/routes.tsx.txt?raw";
import manualRoutes from "./manual-routes.ts?raw";

const examples = import.meta.glob<string>("./examples/*.tsx.txt", {
  eager: true,
  query: "?raw",
  import: "default",
});
const sources = import.meta.glob<string>("./routes/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

export function Source() {
  const [url] = useLocation();
  const [selected, select] = useState("Example");
  const path = url.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  const route = routeName(path);
  const prefix = `./routes/${route}/`;
  const files = Object.fromEntries(
    Object.entries(sources)
      .filter(([file]) => file.startsWith(prefix) && !file.endsWith("/view.ts"))
      .map(([file, source]) => [file.slice(prefix.length), source]),
  );
  const displayed = {
    Example: examples[`./examples/${route}.tsx.txt`],
    "Manual routes": manualRoutes,
    "File routes": fileRoutes,
    ...files,
  };

  return ui.CodePanel({
    files: displayed,
    active: selected in displayed ? selected : "Example",
    select,
  });
}

function routeName(path: string) {
  if (path === "/examples/counter") return "examples.counter";

  if (path === "/tasks") return "tasks._index";

  if (path === "/tasks/search") return "tasks.search";

  if (path.startsWith("/tasks/")) return "tasks.$id";

  return "_index";
}
