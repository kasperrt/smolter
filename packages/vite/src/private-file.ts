import { mkdir, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { safeWrapAsync } from "@smolter/core";
import { writeBuildOutput } from "./build-output.ts";

/** Whether file is directory itself or inside it. */
export function within(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

async function assertPrivateDirectory(
  directory: string,
  publicDirectories: readonly string[],
  label: string,
): Promise<void> {
  for (const candidate of publicDirectories) {
    const { data } = await safeWrapAsync(() => realpath(candidate));
    if (data && within(data, directory))
      throw new Error(`${label} resolves inside a public directory`);
  }
}

/** Write a build artifact that must never be publicly served, refusing symlinked escapes into public output. */
export async function writePrivateFile(
  file: string,
  contents: string,
  publicDirectories: readonly string[],
  label: string,
): Promise<void> {
  const missing: string[] = [];
  let current = dirname(file);
  let resolved = await safeWrapAsync(() => realpath(current));
  while (resolved.error && dirname(current) !== current) {
    missing.unshift(basename(current));
    current = dirname(current);
    resolved = await safeWrapAsync(() => realpath(current));
  }
  // The walk ends at the filesystem root, which always resolves.
  let parent = resolved.data!;
  await assertPrivateDirectory(parent, publicDirectories, label);
  for (const segment of missing) {
    const next = resolve(parent, segment);
    await mkdir(next, { recursive: true });
    parent = await realpath(next);
    await assertPrivateDirectory(parent, publicDirectories, label);
  }
  // Owner-only and written by rename, so a hard link cannot expose or change it.
  await writeBuildOutput(resolve(parent, basename(file)), contents, 0o600);
}
