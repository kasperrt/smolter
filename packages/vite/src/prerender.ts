import { constants } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { safeWrapAsync } from "@smolter/core";
import { flatRoutes } from "@smolter/files";
import type { Plugin, ResolvedConfig } from "vite";

/** Opt-in HTML generation after the client build and then the SSR build. */
export interface PrerenderOptions {
  /** Client output directory relative to Vite root. Defaults to dist/client. */
  clientOutDir?: string;
  /** Client entry key in the Vite manifest. Defaults to src/entry.client.tsx. */
  clientEntry?: string;
  /** Route directory relative to Vite root. Defaults to src/routes. */
  directory?: string;
  /** Filter static routes and add concrete dynamic paths, without the Vite base. */
  paths: string[] | ((staticPaths: string[]) => string[] | Promise<string[]>);
  /** Origin for build-time requests. Defaults to https://prerender.invalid. */
  origin?: string;
  /** Maximum worker lifetime in milliseconds. Defaults to 60000. */
  timeout?: number;
}

interface ClientManifestEntry {
  file: string;
  isEntry?: boolean;
}

type ClientManifest = Record<string, ClientManifestEntry>;

interface RenderOptions {
  serverEntry: string;
  clientEntry: string;
  outDir: string;
  origin: string;
  base: string;
  paths: string[];
}

interface ServerEntry {
  default: (request: Request, entry: string) => Response | Promise<Response>;
}

/** Internal worker entry; kept separate from the public Vite exports. */
export async function renderPaths(options: RenderOptions): Promise<void> {
  const entry: ServerEntry = await import(
    pathToFileURL(options.serverEntry).href
  );
  const root = await realpath(options.outDir);
  const expectedOrigin = new URL(options.origin).origin;
  for (const path of options.paths) {
    const { error } = await safeWrapAsync(async () => {
      if (
        !path.startsWith("/") ||
        path.startsWith("//") ||
        /[?#\\\u0000-\u0020]/.test(path)
      )
        throw new Error(
          "Expected an absolute URL pathname without a query or fragment",
        );
      const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
      if (
        segments.some(
          (segment) =>
            segment === "." ||
            segment === ".." ||
            /[\\/\u0000-\u001f\u007f:]/.test(segment),
        )
      )
        throw new Error("Unsafe output pathname");
      const url = new URL(
        `${options.base.replace(/\/$/, "")}${path}`,
        options.origin,
      );
      if (url.origin !== expectedOrigin)
        throw new Error("Unsafe output pathname");
      const response = await entry.default(
        new Request(url, { headers: { Accept: "text/html" } }),
        options.clientEntry,
      );
      if (response.status >= 300 && response.status < 400) return;
      if (!response.ok)
        throw new Error(`Render returned HTTP ${response.status}`);
      if (
        !/^text\/html(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")
      )
        return;
      const html = await response.text();
      let target = root;
      for (const segment of segments) {
        const directory = resolve(target, segment);
        await mkdir(directory, { recursive: true });
        target = await realpath(directory);
        const destination = relative(root, target);
        if (destination.startsWith("..") || isAbsolute(destination))
          throw new Error("Output directory escapes client output");
      }
      await writeFile(resolve(target, "index.html"), html, {
        flag:
          constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_TRUNC |
          constants.O_NOFOLLOW,
      });
    });
    if (error)
      throw new Error(`Prerender failed for ${path}: ${error.message}`, {
        cause: error,
      });
  }
}

async function renderInWorker(
  options: RenderOptions,
  timeout: number,
): Promise<void> {
  const source = `import { workerData, parentPort } from "node:worker_threads";
import { renderPaths } from ${JSON.stringify(import.meta.url)};
await renderPaths(workerData);
parentPort.postMessage("complete");`;
  const worker = new Worker(
    new URL(`data:text/javascript,${encodeURIComponent(source)}`),
    { workerData: options },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const { error } = await safeWrapAsync(
    () =>
      new Promise<void>((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Prerender timed out after ${timeout}ms`)),
          timeout,
        );
        worker.once("message", () => resolve());
        worker.once("error", reject);
        worker.once("exit", (code) =>
          reject(
            new Error(`Prerender worker exited before completion (${code})`),
          ),
        );
      }),
  );
  clearTimeout(timer);
  await worker.terminate();
  if (error) throw error;
}

/** Render static HTML through the built default SSR export in an isolated worker. */
export function prerenderPlugin(options: PrerenderOptions): Plugin {
  let config: ResolvedConfig;
  let serverEntry: string | undefined;
  return {
    name: "smolter-prerender",
    apply: "build",
    config(value, environment) {
      if (environment.isSsrBuild && (value.base === "" || value.base === "./"))
        throw new Error("Prerender requires an absolute Vite base path or URL");
      return environment.isSsrBuild ? undefined : { build: { manifest: true } };
    },
    configResolved(value) {
      config = value;
    },
    writeBundle(_, bundle) {
      if (!config.build.ssr) return;
      const entries = Object.values(bundle).filter(
        (chunk) => chunk.type === "chunk" && chunk.isEntry,
      );
      if (entries.length !== 1)
        throw new Error("Prerender requires exactly one SSR entry");
      serverEntry = resolve(
        config.root,
        config.build.outDir,
        entries[0].fileName,
      );
    },
    async closeBundle() {
      if (!config.build.ssr || !serverEntry) return;
      let paths = options.paths;
      if (typeof paths === "function") {
        const routes = await flatRoutes(
          resolve(config.root, options.directory ?? "src/routes"),
        );
        if (routes instanceof Error) throw routes;
        paths = await paths(
          routes
            .filter((route) => !/[:*]/.test(route.path))
            .map((route) => route.path),
        );
      }
      if (!paths.length) return;
      const outDir = resolve(
        config.root,
        options.clientOutDir ?? "dist/client",
      );
      const manifest: ClientManifest = JSON.parse(
        await readFile(resolve(outDir, ".vite/manifest.json"), "utf8"),
      );
      const entryKey = options.clientEntry ?? "src/entry.client.tsx";
      const clientEntry = Object.hasOwn(manifest, entryKey)
        ? manifest[entryKey]
        : undefined;
      if (!clientEntry?.isEntry)
        throw new Error(
          "Prerender client entry is missing from the Vite manifest; build the client first",
        );
      const base = new URL(config.base, "https://prerender.invalid").pathname;
      const rawOrigin = options.origin ?? "https://prerender.invalid";
      if (!URL.canParse(rawOrigin))
        throw new Error("Prerender origin must be an http or https origin");
      const parsedOrigin = new URL(rawOrigin);
      if (
        (parsedOrigin.protocol !== "http:" &&
          parsedOrigin.protocol !== "https:") ||
        parsedOrigin.origin !== rawOrigin.replace(/\/$/, "")
      )
        throw new Error("Prerender origin must be an http or https origin");
      const timeout = options.timeout ?? 60_000;
      if (!Number.isFinite(timeout) || timeout <= 0)
        throw new Error("Prerender timeout must be positive");
      await renderInWorker(
        {
          serverEntry,
          outDir,
          paths: [...new Set(paths)],
          base,
          origin: parsedOrigin.origin,
          clientEntry: `${config.base}${clientEntry.file}`,
        },
        timeout,
      );
    },
  };
}
