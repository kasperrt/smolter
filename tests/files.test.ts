import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { flatRoutes } from "../packages/smolter/src/files";

const directories: string[] = [];

async function fixture(names: string[]) {
  const root = await mkdtemp(join(tmpdir(), "smolter-flat-"));

  directories.push(root);

  for (const name of names) {
    await mkdir(join(root, name), { recursive: true });
    await writeFile(
      join(root, name, "route.ts"),
      "export const loader = () => null;",
    );
    await writeFile(
      join(root, name, "loader.ts"),
      "export const ignored = true;",
    );
  }

  return root;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

it("discovers only flat route modules with index, groups, params, and splats", async () => {
  const root = await fixture([
    "_index",
    "_private",
    "_private.tasks._index",
    "_private.tasks.$id",
    "tasks.new",
    "files.$",
    "$",
  ]);

  await mkdir(join(root, "helpers"));
  await writeFile(join(root, "types.d.ts"), "export interface RouteData {}");
  await writeFile(join(root, "helpers", "view.ts"), "export default 1;");
  await writeFile(
    join(root, "about.tsx"),
    "export default function About() {};",
  );

  const result = await flatRoutes(root);

  expect(result).not.toBeInstanceOf(Error);

  if (result instanceof Error) return;

  const paths = result.map((route) => route.path);

  expect([...paths].sort()).toEqual(
    [
      "/",
      "/about",
      "/files/*",
      "/tasks/new",
      "/tasks",
      "/tasks/:id",
      "/*",
    ].sort(),
  );

  expect(paths.indexOf("/tasks/new")).toBeLessThan(paths.indexOf("/tasks/:id"));

  expect(paths.at(-1)).toBe("/*");

  expect(result.every((route) => route.file.startsWith(root))).toBe(true);
});

for (const name of ["tasks..detail", "tasks._index.detail", "tasks.$.detail"]) {
  it(`rejects the invalid flat route ${name}`, async () => {
    expect(await flatRoutes(await fixture([name]))).toBeInstanceOf(Error);
  });
}

it("rejects conflicting params instead of relying on filesystem enumeration order", async () => {
  const result = await flatRoutes(await fixture(["tasks.$id", "tasks.$slug"]));

  expect(result).toBeInstanceOf(Error);

  expect((result as Error).message).toContain("Conflicting");
});

it("rejects unsupported syntax and ambiguous route files", async () => {
  expect(await flatRoutes(await fixture(["tasks.($id)"]))).toBeInstanceOf(
    Error,
  );

  const root = await fixture(["tasks"]);

  await writeFile(join(root, "tasks", "route.tsx"), "export default 1;");

  expect(await flatRoutes(root)).toBeInstanceOf(Error);
});
