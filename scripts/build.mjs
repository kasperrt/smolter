import { execFileSync } from "node:child_process";

execFileSync("pnpm", ["--filter", "smolter", "build"], { stdio: "inherit" });
