import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { viteFixture } from "./helpers/vite.ts";

const isReload = (message: unknown) =>
  typeof message === "object" &&
  message !== null &&
  "type" in message &&
  message.type === "full-reload";

it("updates inferred capabilities in client and SSR graphs without restarting Vite", async (context) => {
  const { root, server } = await viteFixture(
    context,
    "export default function Home() { return null; }",
  );
  server.config.server.fs.allow.push(resolve("."));
  const entry = join(root, "src/entry.tsx");
  const source = (mode: string) =>
    `import {Link} from "@kasperrt/smolter/preact"; export const Page = () => <Link prefetch="${mode}" />;`;
  await writeFile(entry, source("viewport"));
  server.watcher.add(entry);
  const intent = resolve("packages/core/src/intent.ts");
  const viewport = resolve("packages/core/src/viewport.ts");
  const transformed = () => server.transformRequest(`/@fs/${intent}`);
  expect((await transformed())?.code).toContain("intentPrefetch = undefined");
  expect((await server.ssrLoadModule(intent)).intentPrefetch).toBeUndefined();
  await server.transformRequest(`/@fs/${viewport}`);
  const send = vi.spyOn(server.ws, "send");
  await writeFile(entry, source("intent"));
  await expect
    .poll(() => send.mock.calls.some(([message]) => isReload(message)))
    .toBe(true);
  expect((await transformed())?.code).toContain("function intentPrefetch");
  expect((await server.ssrLoadModule(intent)).intentPrefetch).toBeTypeOf(
    "function",
  );
  expect((await server.transformRequest(`/@fs/${viewport}`))?.code).toContain(
    "viewportPrefetch = undefined",
  );
  send.mockClear();
  await writeFile(entry, source("intent") + "\n");
  await expect
    .poll(async () => (await transformed())?.code)
    .toContain("function intentPrefetch");
  // The capability set is unchanged; ordinary source HMR owns this edit.
  expect(send.mock.calls.some(([message]) => isReload(message))).toBe(false);
  const shared = join(root, "shared");
  await mkdir(shared);
  const types = join(shared, "modes.ts");
  await writeFile(types, 'export type Mode = "intent";');
  await writeFile(
    entry,
    'import {Link} from "@kasperrt/smolter/preact"; import type {Mode} from "../shared/modes"; declare const props: {prefetch: Mode}; export const Page = () => <Link {...props} />;',
  );
  await expect
    .poll(() => server.watcher.getWatched()[shared]?.includes("modes.ts"))
    .toBe(true);
  send.mockClear();
  await writeFile(types, 'export type Mode = "intent" | "viewport";');
  await expect
    .poll(() => send.mock.calls.some(([message]) => isReload(message)))
    .toBe(true);
  expect((await server.transformRequest(`/@fs/${viewport}`))?.code).toContain(
    "function viewportPrefetch",
  );
  send.mockClear();
  await writeFile(join(root, "tsconfig.json"), "{ invalid");
  server.watcher.emit("change", entry);
  await expect
    .poll(() =>
      send.mock.calls.some(([message]) => {
        const event: unknown = message;
        return (
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "error"
        );
      }),
    )
    .toBe(true);
  await writeFile(join(root, "tsconfig.json"), "{}");
}, 30_000);
