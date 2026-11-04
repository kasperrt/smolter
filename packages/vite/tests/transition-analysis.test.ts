import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { analyzePrefetch } from "../src/prefetch-analysis.ts";

it.for([
  ["export const routes = [];", false],
  ["export function viewTransition(commit) { commit(); }", true],
  ["const route = {}; route[globalThis.name] = globalThis.handler;", true],
  ["Object.assign(globalThis.route, globalThis.options);", true],
  [
    'import * as router from "@kasperrt/smolter/preact"; console.log(router);',
    true,
  ],
  [
    'import { createDataRouter as make } from "@kasperrt/smolter/react"; make(globalThis.routes);',
    true,
  ],
  [
    'import { mountApplication as mount } from "@kasperrt/smolter/preact/client"; globalThis.mount = mount;',
    true,
  ],
  [
    'import routes from "virtual:smolter/routes"; import { mountApplication } from "@kasperrt/smolter/preact/client"; mountApplication(routes, {});',
    false,
  ],
  [
    'import { mountApplication } from "@kasperrt/smolter/preact/client"; export function example(mountApplication) { mountApplication([]); }',
    false,
  ],
] as const)(
  "retains transitions conservatively for %s",
  async ([source, expected], context) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-transition-analysis-"));
    context.onTestFinished(() => rm(root, { recursive: true, force: true }));
    await writeFile(join(root, "entry.ts"), source);
    let enabled = true;
    await analyzePrefetch(root, undefined, (value) => {
      enabled = value;
    });
    expect(enabled).toBe(expected);
  },
);
