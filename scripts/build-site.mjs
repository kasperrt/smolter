import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

rmSync("site", { recursive: true, force: true });
mkdirSync("site");

for (const framework of ["react", "preact"]) {
  execFileSync(
    "pnpm",
    [
      "--filter",
      `@smolter/${framework}`,
      "build",
      "--base",
      `/smolter/${framework}/`,
    ],
    {
      env: { ...process.env, VITE_HOSTED: "true" },
      stdio: "inherit",
    },
  );

  cpSync(`apps/${framework}/dist`, `site/${framework}`, { recursive: true });

  const html = readFileSync(`site/${framework}/index.html`, "utf8");

  for (const route of ["tasks", "tasks/1", "about"]) {
    mkdirSync(`site/${framework}/${route}`, { recursive: true });
    writeFileSync(`site/${framework}/${route}/index.html`, html);
  }
}

cpSync("scripts/site-404.html", "site/404.html");
writeFileSync("site/.nojekyll", "");
writeFileSync(
  "site/index.html",
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0;url=./react/">\n<title>smolter _</title>\n</head>\n<body><a href="./react/">Open smolter</a></body>\n</html>\n',
);
