import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { Scripts } from "@kasperrt/smolter/preact/document";
import { renderApplication } from "@kasperrt/smolter/preact/server";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { type ComponentChildren, h } from "preact";

let server: Server | undefined;
test.afterEach(() => {
  server?.closeAllConnections();
  server?.close();
});

test("streamed JSON keys remain data before and after minified hydration", async ({
  page,
}) => {
  const payload = JSON.parse(
    '{"__proto__":{"injected":true},"constructor":{"prototype":{"injected":true}},"text":"</script><script>document.title=\\"EXECUTED\\"</script><!--"}',
  );
  const rendered = await renderApplication(
    new Request("http://fixture.test/"),
    [{ path: "/", default: () => null }],
    {
      loader: () => ({ value: Promise.resolve(payload) }),
      default: () => h("output", null),
      Layout: ({ children }: { children: ComponentChildren }) =>
        h(
          "html",
          null,
          h("head", null, h("title", null, "Safe page")),
          h("body", null, children, h(Scripts, null)),
        ),
    },
    "/entry.js",
    { earlyHydration: true },
  );
  const html = await rendered.text();
  const bundle = await build({
    stdin: {
      contents: `import {readHydration} from ${JSON.stringify(resolve("dist/client/hydration.js"))};
async function check() {
  const packet = window.__smolterDeferred[0][1];
  const plain = Object.getPrototypeOf(packet) === Object.prototype;
  const own = Object.hasOwn(packet, "__proto__");
  const injected = packet.injected === true;
  const {hydration, dispose} = readHydration(document.getElementById("smolter-data").textContent);
  const value = await hydration.root.value;
  dispose();
  document.querySelector("output").textContent = JSON.stringify({plain,own,injected,value,global:({}).injected === true});
}
void check();`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    minify: true,
    write: false,
    format: "iife",
  });
  server = createServer((request, response) => {
    response.setHeader(
      "Content-Type",
      request.url === "/entry.js" ? "text/javascript" : "text/html",
    );
    response.end(
      request.url === "/entry.js" ? bundle.outputFiles[0].text : html,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  await expect(page.locator("output")).not.toBeEmpty();
  expect(JSON.parse(await page.locator("output").innerText())).toEqual({
    plain: true,
    own: true,
    injected: false,
    value: payload,
    global: false,
  });
  await expect(page).toHaveTitle("Safe page");
  expect(errors).toEqual([]);
});
