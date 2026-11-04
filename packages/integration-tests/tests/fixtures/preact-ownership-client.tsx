/** @jsxImportSource preact */
import { hydrate } from "preact";
import { PreactRoot } from "./preact-ownership.tsx";

const optional = new Promise<string>((resolve) => {
  window.addEventListener(
    "settle-test",
    () => resolve("Old resolved content"),
    { once: true },
  );
});
const entry = document.getElementById("entry")!.getAttribute("src")!;
hydrate(<PreactRoot optional={optional} entry={entry} />, document);
document.documentElement.dataset.hydrated = "true";
