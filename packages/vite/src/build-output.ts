import { lstatSync } from "node:fs";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { safeWrapAsync } from "@smolter/core";

/** Replace the directory entry so another hard link cannot expose or change its contents. */
export async function writeBuildOutput(
  path: string,
  contents: string,
  mode?: number,
) {
  const existing = lstatSync(path, { throwIfNoEntry: false });
  if (existing && !existing.isFile())
    throw new Error(`Expected a regular output file at ${path}`);
  const temporary = await mkdtemp(join(dirname(path), ".smolter-output-"));
  const file = join(temporary, "output");
  const { error } = await safeWrapAsync(async () => {
    await writeFile(file, contents, {
      mode: mode ?? (existing && existing.mode & 0o777),
      flag: "wx",
    });
    await rename(file, path);
  });
  await rm(temporary, { recursive: true, force: true });
  if (error) throw error;
}
