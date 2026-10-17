import { build, createServer, type Plugin } from "vite";
import { expect, it } from "vitest";
import { deploymentPlugin } from "../packages/vite/src/deployment.ts";

const entry: Plugin = {
  name: "deployment-test-entry",
  resolveId(id) {
    if (id === "entry") return "\0entry";
  },
  load(id) {
    if (id === "\0entry")
      return 'import deployment from "virtual:smolter/deployment"; console.log(deployment);';
  },
};

async function compile(ssr = false, manifestURL?: string) {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    base: "/app/",
    plugins: [entry, deploymentPlugin({ manifestURL })],
    build: {
      ssr,
      write: false,
      minify: false,
      rollupOptions: { input: "entry" },
    },
  });

  if (!("output" in result)) throw new Error("Expected build output");

  const file = result.output.find(
    (item) => item.fileName === "smolter-manifest.json",
  );
  const code = result.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");

  return { file, code };
}

it("emits a fresh build identity matching the browser module and respects the base URL", async () => {
  const first = await compile();
  const second = await compile(false, "https://assets.test/current.json");
  expect(first.file?.type).toBe("asset");
  expect(second.file?.type).toBe("asset");

  if (first.file?.type !== "asset" || second.file?.type !== "asset") return;

  const before = JSON.parse(String(first.file.source));
  const after = JSON.parse(String(second.file.source));
  expect(before.version).not.toBe(after.version);
  expect(first.code).toContain(before.version);
  expect(first.code).toContain("/app/smolter-manifest.json");
  expect(second.code).toContain("https://assets.test/current.json");
});

it("does not emit or poll deployments during SSR or development", async (context) => {
  const serverBuild = await compile(true);
  expect(serverBuild.file).toBeUndefined();
  expect(serverBuild.code).toContain("null");
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [deploymentPlugin()],
  });
  context.onTestFinished(() => server.close());
  const module = await server.transformRequest("virtual:smolter/deployment");
  expect(module?.code).toContain("export default null");
});
