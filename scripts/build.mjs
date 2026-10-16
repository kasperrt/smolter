import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(new URL("../packages/smolter/dist", import.meta.url), {
  recursive: true,
  force: true,
});
execFileSync("pnpm", ["--filter", "smolter", "build"], { stdio: "inherit" });
