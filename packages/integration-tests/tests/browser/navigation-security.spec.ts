import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";

let server: Server | undefined;
test.afterEach(() => {
  server?.closeAllConnections();
  server?.close();
});

test("minified browser navigation never executes a JavaScript destination", async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      contents: `import {createDataRouter} from ${JSON.stringify(resolve("dist/core/router.js"))};
import {connectNavigation} from ${JSON.stringify(resolve("dist/core/navigation.js"))};
import {safeWrapAsync} from ${JSON.stringify(resolve("dist/core/errors.js"))};
const router = createDataRouter([{path:"/"}], {url:location.href});
connectNavigation(router);
const button = document.querySelector("button");
button.onclick = async () => {
  const {error} = await safeWrapAsync(() => router.navigate("java\\nscript:document.title='EXECUTED';void 0"));
  document.querySelector("output").textContent = error ? "blocked" : "allowed";
};`,
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
      request.url === "/probe.js" ? "text/javascript" : "text/html",
    );
    response.end(
      request.url === "/probe.js"
        ? bundle.outputFiles[0].text
        : '<title>Safe page</title><button>Navigate</button><output></output><script src="/probe.js"></script>',
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  await page.getByRole("button", { name: "Navigate" }).click();
  await expect(page.locator("output")).toHaveText("blocked");
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await expect(page).toHaveTitle("Safe page");
});
