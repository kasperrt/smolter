import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { writeBuildOutput } from "../src/build-output.ts";

vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, rename: vi.fn(original.rename) };
});

it("keeps the previous output and removes the temporary file if replacement fails", async (context) => {
  const root = await fs.mkdtemp(join(tmpdir(), "smolter-output-test-"));
  context.onTestFinished(() => fs.rm(root, { recursive: true, force: true }));
  const path = join(root, "index.html");
  await fs.writeFile(path, "previous");
  vi.mocked(fs.rename).mockRejectedValueOnce(new Error("replacement failed"));
  await expect(writeBuildOutput(path, "new")).rejects.toThrow(
    "replacement failed",
  );
  expect(await fs.readFile(path, "utf8")).toBe("previous");
  expect(await fs.readdir(root)).toEqual(["index.html"]);
});
