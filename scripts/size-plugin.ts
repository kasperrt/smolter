import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function measuredSize(): Plugin {
  const root = resolve(import.meta.dirname, "..");
  const update = () => {
    execFileSync(
      process.execPath,
      [resolve(root, "scripts/size.mjs"), "--write-only"],
      { cwd: root },
    );
  };

  return {
    name: "measured-router-size",
    buildStart: update,

    configureServer(server) {
      server.watcher.add(resolve(root, "packages/smolter/src"));
      server.watcher.on("change", (file) => {
        if (file.startsWith(resolve(root, "packages/smolter/src"))) update();
      });
    },
  };
}
