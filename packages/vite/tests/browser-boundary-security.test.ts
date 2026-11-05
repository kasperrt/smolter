import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";
import { applicationPlugins } from "../src/application/vite.ts";

for (const framework of ["react", "preact"] as const) {
  it.for([
    "config.server.ts",
    "lib/auth.server.js",
    "src/auth.server.ts",
    "lib/auth.server.ts?raw",
    "lib/auth.server.ts?url",
    "lib/auth.server.ts?raw&inline",
  ])(
    `${framework} rejects server-marked browser imports: %s`,
    async (specifier, context) => {
      const root = await mkdtemp(join(tmpdir(), "smolter-browser-security-"));
      context.onTestFinished(() => rm(root, { recursive: true, force: true }));
      const file = join(root, specifier.split("?")[0]);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, 'export default "SYNTHETIC_SERVER_CREDENTIAL";');
      await writeFile(
        join(root, "entry.ts"),
        `import secret from ${JSON.stringify(`./${specifier}`)}; console.log(secret);`,
      );
      await expect(
        build({
          root,
          configFile: false,
          logLevel: "silent",
          plugins: applicationPlugins({ framework, ssr: false }),
          build: {
            write: false,
            minify: true,
            rollupOptions: { input: join(root, "entry.ts") },
          },
        }),
      ).rejects.toThrow("Unexpected browser module");
    },
  );
}

it.for(["react", "preact"] as const)(
  "%s keeps server-marked modules available to SSR builds",
  async (framework, context) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-server-boundary-"));
    context.onTestFinished(() => rm(root, { recursive: true, force: true }));
    await writeFile(
      join(root, "config.server.ts"),
      'export default "SYNTHETIC_SERVER_CREDENTIAL";',
    );
    const entry = join(root, "entry.ts");
    await writeFile(entry, 'export { default } from "./config.server.ts";');
    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: applicationPlugins({ framework }),
      build: { write: false, minify: true, ssr: entry },
    });
    expect(result).toHaveProperty("output");
    if (!("output" in result)) return;
    expect(
      result.output.some(
        (item) =>
          item.type === "chunk" &&
          item.code.includes("SYNTHETIC_SERVER_CREDENTIAL"),
      ),
    ).toBe(true);
  },
);
