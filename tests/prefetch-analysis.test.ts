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

for (const framework of ["react", "preact"] as const) {
  it(`preserves resolved ${framework} aliases, re-exports and component wrappers`, async (context) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-prefetch-aliases-"));
    context.onTestFinished(() => rm(root, { recursive: true, force: true }));
    const adapter = `@kasperrt/smolter/${framework}`;
    await mkdir(join(root, framework));
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          paths: { [adapter]: [`./${framework}/navigation.d.ts`] },
        },
      }),
    );
    await writeFile(
      join(root, framework, "navigation.d.ts"),
      'interface LinkProps { prefetch?: "none" | "intent" | "viewport"; prefetchData?: boolean; } export declare function Link(props: LinkProps): unknown; export declare function NavLink(props: LinkProps): unknown;',
    );
    await writeFile(
      join(root, "links.d.ts"),
      `import {Link} from "${adapter}"; export {Link as RouteLink, NavLink as RouteNavLink} from "${adapter}"; export declare const Wrapped: typeof Link;`,
    );
    const cases: [string, boolean, boolean, boolean][] = [
      [
        `import {Link as RouteLink} from "${adapter}"; export const page = <RouteLink prefetch="viewport" />;`,
        false,
        true,
        false,
      ],
      [
        `import {NavLink as RouteNavLink} from "${adapter}"; export const page = <RouteNavLink prefetch="intent" prefetchData />;`,
        true,
        false,
        true,
      ],
      [
        'import * as Routes from "./links"; export const page = <Routes.RouteLink prefetch="viewport" />;',
        false,
        true,
        false,
      ],
      [
        'import * as Routes from "./links"; export const page = h(Routes.RouteNavLink, {prefetch: "viewport" as const, prefetchData: true as const});',
        false,
        true,
        true,
      ],
      [
        'import * as Routes from "./links"; export const page = <Routes.Wrapped prefetch="viewport" prefetchData />;',
        false,
        true,
        true,
      ],
      [
        `import {Link} from "${adapter}"; const LocalLink = Link; export const page = <LocalLink prefetch="viewport" />;`,
        true,
        true,
        true,
      ],
      [
        `import {Link as RouteLink} from "${adapter}"; export const page = <Layout component={RouteLink} />;`,
        true,
        true,
        true,
      ],
      [
        "function Link() { return null; } const values = {Link}; export const page = <Link />; export const selected = values.Link; export const result = Object.keys(values);",
        false,
        false,
        false,
      ],
    ];
    for (const [source, intent, viewport, data] of cases) {
      await writeFile(join(root, "entry.tsx"), source);
      expect(analyzePrefetch(root), source).toEqual({ intent, viewport, data });
    }
  }, 60_000);
}

it("watches later source dependencies after every capability is retained", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "smolter-prefetch-watch-"));
  context.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "app");
  const shared = join(directory, "shared");
  await mkdir(root);
  await mkdir(shared);
  const config = join(root, "tsconfig.json");
  const entry = join(root, "a-entry.tsx");
  const later = join(root, "z-entry.ts");
  const modes = join(shared, "modes.ts");
  await writeFile(config, '{"compilerOptions":{"strict":true}}');
  await writeFile(
    entry,
    'import {Link} from "@kasperrt/smolter/preact"; declare const props: Record<string, unknown>; export const page = <Link {...props} />;',
  );
  await writeFile(
    later,
    'import type {Mode} from "../shared/modes"; export const mode = "viewport" satisfies Mode;',
  );
  await writeFile(modes, 'export type Mode = "intent" | "viewport";');
  const watched: string[] = [];
  expect(analyzePrefetch(root, (file) => watched.push(file))).toEqual({
    intent: true,
    viewport: true,
    data: true,
  });
  expect(watched).toEqual(
    expect.arrayContaining([config, entry, later, modes]),
  );
  expect(watched.indexOf(modes)).toBeGreaterThan(watched.indexOf(entry));
});
