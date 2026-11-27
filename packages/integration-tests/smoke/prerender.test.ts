import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  applicationPlugins,
  deploymentPlugin,
  prerenderPlugin,
} from "@kasperrt/smolter/preact/vite";
import { type Alias, build, preview } from "vite";
import { expect } from "vitest";
import manifest from "../../../package.json";
import { test } from "../tests/helpers/browser.ts";

// Resolve the built public entries, including the private worker module it loads.
const alias: Alias[] = Object.entries(manifest.exports).map(
  ([name, entry]) => ({
    find: new RegExp(`^@kasperrt/smolter/${name.slice(2)}$`),
    replacement: resolve(entry.import),
  }),
);

test("prerendered production pages hydrate with a custom namespace and extensionless manifest", async ({
  page,
  onTestFinished,
}) => {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), "smolter-prerender-browser-")),
  );
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "src/routes"), { recursive: true });
  await symlink(resolve("node_modules"), resolve(root, "node_modules"), "dir");
  await writeFile(resolve(root, "package.json"), '{"type":"module"}');
  await writeFile(
    resolve(root, "src/root.ts"),
    `import { h } from 'preact'; import { Outlet } from '@kasperrt/smolter/preact'; import { Document, Scripts } from '@kasperrt/smolter/preact/document'; export default { default: Outlet, Layout: ({children}) => h(Document, null, h('head', null), h('body', null, children, h(Scripts, null))) };`,
  );
  await writeFile(
    resolve(root, "src/routes/_index.ts"),
    `import { h } from 'preact'; import { useState } from 'preact/hooks'; export default function Page() { const [count, setCount] = useState(0); return h('button', { onClick: () => setCount(count + 1) }, 'Count ' + count); }`,
  );
  await writeFile(
    resolve(root, "src/routes/posts.$slug.ts"),
    `import { h } from 'preact'; import { useLoaderData } from '@kasperrt/smolter/preact'; export { loader } from '../post-loader'; export default function Post() { return h('h1', null, useLoaderData()); }`,
  );
  await writeFile(
    resolve(root, "src/post-loader.ts"),
    "export function loader({ params }) { return params.slug; }",
  );
  await writeFile(
    resolve(root, "src/entry.client.tsx"),
    `import routes from 'virtual:smolter/routes'; import root from './root'; import { mountApplication } from '@kasperrt/smolter/preact/client'; await mountApplication(routes, root);`,
  );
  await writeFile(
    resolve(root, "src/entry.server.ts"),
    `import routes from 'virtual:smolter/routes'; import root from './root'; import { renderApplication } from '@kasperrt/smolter/preact/server'; setInterval(() => {}, 1000); export default (request, entry) => renderApplication(request, routes, root, entry);`,
  );
  for (const ssr of [false, true])
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      resolve: { alias },
      plugins: [
        ...applicationPlugins({ namespace: "__app" }),
        deploymentPlugin({ manifestFile: "__appm" }),
        prerenderPlugin({ paths: ["/", "/posts/hello"] }),
      ],
      build: {
        outDir: ssr ? "dist/server" : "dist/client",
        ...(ssr && { ssr: "src/entry.server.ts" }),
        rollupOptions: {
          input: ssr ? "src/entry.server.ts" : "src/entry.client.tsx",
        },
      },
    });
  expect(
    await readFile(resolve(root, "dist/client/index.html"), "utf8"),
  ).toContain('id="__app-data"');
  expect(
    JSON.parse(await readFile(resolve(root, "dist/client/__appm"), "utf8")),
  ).toHaveProperty("version");
  const server = await preview({
    root,
    configFile: false,
    logLevel: "silent",
    build: { outDir: "dist/client" },
    preview: { port: 0 },
  });
  onTestFinished(() => server.close());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = server.resolvedUrls!.local[0];
  await page.goto(origin);
  await page.getByRole("button", { name: "Count 0" }).click();
  await expect
    .poll(() => page.getByRole("button", { name: "Count 1" }).count())
    .toBe(1);
  await page.goto(new URL("posts/hello/", origin).href);
  await expect
    .poll(() => page.getByRole("heading", { name: "hello" }).count())
    .toBe(1);
  expect(errors).toEqual([]);
});
