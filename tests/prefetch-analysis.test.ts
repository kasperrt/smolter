import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { analyzePrefetch } from "../packages/vite/src/prefetch-analysis.ts";

it("infers literals, imported spread types, unions and overriding attributes without changing runtime semantics", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "smolter-prefetch-types-"));
  context.onTestFinished(() => rm(root, { recursive: true, force: true }));
  expect(analyzePrefetch(root)).toEqual({
    intent: true,
    viewport: true,
    data: true,
  });
  await mkdir(join(root, "src"));
  await writeFile(
    join(root, "tsconfig.json"),
    '{"compilerOptions":{"strict":true}}',
  );
  await writeFile(
    join(root, "src/types.ts"),
    'export type Modes = {prefetch: "intent" | "viewport", prefetchData?: boolean};',
  );
  const cases: [string, boolean, boolean, boolean][] = [
    ["export const page = <div />;", false, false, false],
    ["export const page = <Link />;", true, false, false],
    [
      'export const page = <Link prefetch="none" prefetchData />;',
      false,
      false,
      false,
    ],
    ['export const page = <Link prefetch="viewport" />;', false, true, false],
    [
      'export const page = <Link prefetch="intent" prefetchData />;',
      true,
      false,
      true,
    ],
    [
      'const props = { prefetch: "viewport", prefetchData: false } as const; export const page = <Link {...props} />;',
      false,
      true,
      false,
    ],
    [
      "declare const props: Modes; export const page = <Link {...props} />;",
      true,
      true,
      true,
    ],
    [
      'declare const props: { prefetch: "viewport" } | {}; export const page = <Link {...props} />;',
      true,
      true,
      false,
    ],
    [
      'declare const props: { prefetch?: "viewport" }; export const page = <Link prefetch="none" {...props} />;',
      true,
      true,
      false,
    ],
    [
      'declare const props: Modes; export const page = <Link {...props} prefetch="none" />;',
      false,
      false,
      false,
    ],
    [
      "declare const props: Record<string, unknown>; export const page = <Link {...props} />;",
      true,
      true,
      true,
    ],
    [
      "declare const props: unknown; export const page = <Link {...props} />;",
      true,
      true,
      true,
    ],
    [
      "declare const mode: never; export const page = <Link prefetch={mode} />;",
      false,
      false,
      false,
    ],
    [
      "declare const mode: string; export const page = <Link prefetch={mode} />;",
      true,
      true,
      false,
    ],
    [
      'export const page = h(Link, {prefetch: "viewport" as const, prefetchData: true as const});',
      false,
      true,
      true,
    ],
    ["export const page = h(Link);", true, false, false],
    [
      'export const page = <Adapter.NavLink prefetch="viewport" />;',
      false,
      true,
      false,
    ],
    ["export const page = <Layout link={Link} />;", true, true, true],
    ['router.prefetch("/items");', false, false, true],
    [
      "declare const router: {prefetch(url: string): Promise<void>}; export const warm = router.prefetch;",
      false,
      false,
      true,
    ],
    [
      "declare const router: {prefetch(url: string): Promise<void>}; const {prefetch: warm} = router;",
      false,
      false,
      true,
    ],
  ];
  for (const [source, intent, viewport, data] of cases) {
    await writeFile(
      join(root, "src/entry.tsx"),
      `import {Link} from "@kasperrt/smolter/preact"; import * as Adapter from "@kasperrt/smolter/preact"; import type {Modes} from "./types"; ${source}`,
    );
    expect(analyzePrefetch(root), source).toEqual({ intent, viewport, data });
  }
}, 60_000);
