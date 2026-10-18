import { safeWrapAsync } from "@smolter/core";
import type { ViteDevServer } from "vite";
import {
  analyzePrefetch,
  type PrefetchCapabilities,
} from "./prefetch-analysis.ts";

// Shared by file routing and application routing, including manual route arrays.
export function prefetchSelection() {
  let root: string;
  let watcher: ViteDevServer["watcher"] | undefined;
  const analyze = () => analyzePrefetch(root, (file) => watcher?.add(file));
  let selected: PrefetchCapabilities | undefined;
  const ids = new Set<string>();
  return {
    configure(directory: string) {
      root = directory;
    },
    transform(code: string, id: string): string | undefined {
      const match = /\/core\/(?:src\/)?(intent|viewport|prefetch)\.[jt]s$/.exec(
        id,
      );
      if (!match) return;
      const name =
        match[1] === "prefetch" ? "data" : (match[1] as "intent" | "viewport");
      const marker = `/*! @smolter/prefetch:${name} */`;
      if (!code.includes(marker)) return;
      ids.add(id);
      selected ??= analyze();
      if (selected[name]) return code.replace(marker, "");
      return `export const ${name}Prefetch = undefined;`;
    },
    watch(server: ViteDevServer) {
      watcher = server.watcher;
      const refresh = (file: string) => {
        if (
          !selected ||
          !/\.[cm]?[jt]sx?$|(?:^|\/)tsconfig[^/]*\.json$/.test(file) ||
          file.includes("/node_modules/")
        )
          return;
        void safeWrapAsync(analyze).then(({ data: next, error }) => {
          if (error) {
            server.ws.send({
              type: "error",
              err: { message: error.message, stack: "" },
            });
            return;
          }
          if (JSON.stringify(next) === JSON.stringify(selected)) return;
          selected = next;
          for (const environment of Object.values(server.environments)) {
            for (const id of ids) {
              const module = environment.moduleGraph.getModuleById(id);
              if (module) environment.moduleGraph.invalidateModule(module);
            }
          }
          // Newly required capabilities must also reach existing router instances.
          server.ws.send({ type: "full-reload" });
        });
      };
      for (const event of ["add", "change", "unlink"] as const)
        server.watcher.on(event, refresh);
      server.httpServer?.once("close", () => {
        for (const event of ["add", "change", "unlink"] as const)
          server.watcher.off(event, refresh);
      });
    },
  };
}
