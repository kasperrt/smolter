import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";

const servers: Server[] = [];
test.afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

for (const framework of ["react", "preact"]) {
  test(`${framework} transport cannot exfiltrate form fields through paths or redirects`, async ({
    page,
  }) => {
    const received: string[] = [];
    const collector = createServer((request, response) => {
      received.push(request.url ?? "");
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Content-Type", "application/json");
      response.end("{}");
    });
    servers.push(collector);
    collector.listen(0, "127.0.0.1");
    await once(collector, "listening");
    const authority = `127.0.0.1:${(collector.address() as AddressInfo).port}`;
    const bundle = await build({
      stdin: {
        contents: `import {createDataRouter} from ${JSON.stringify(resolve(`dist/${framework}/index.js`))};
import {serverRoute} from ${JSON.stringify(resolve(`dist/${framework}/client.js`))};
async function run() {
  const body = new FormData();
  body.set("password", "SYNTHETIC_PRIVATE_VALUE");
  const router = createDataRouter([serverRoute("/*", {})], {url: location.origin + "/"});
  const results = [];
  for (const path of ["//${authority}/collect", "///${authority}/collect", "/redirect", "/safe"]) {
    const result = await router.submit(location.origin + path, body);
    results.push(Boolean(result.error));
  }
  router.dispose();
  document.querySelector("output").textContent = JSON.stringify(results);
}
void run();`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      minify: true,
      write: false,
      format: "iife",
    });
    let accepted = 0;
    const source = createServer((request, response) => {
      if (request.url === "/entry.js") {
        response.setHeader("Content-Type", "text/javascript");
        response.end(bundle.outputFiles[0].text);
        return;
      }
      if (request.url === "/redirect.__smolter") {
        response.writeHead(307, { Location: `http://${authority}/redirected` });
        response.end();
        return;
      }
      if (request.url === "/safe.__smolter") {
        if (request.method === "POST") accepted++;
        response.setHeader("Content-Type", "application/json");
        response.end("{}");
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.end('<output></output><script src="/entry.js"></script>');
    });
    servers.push(source);
    source.listen(0, "127.0.0.1");
    await once(source, "listening");
    await page.goto(
      `http://127.0.0.1:${(source.address() as AddressInfo).port}`,
    );
    await expect(page.locator("output")).toHaveText("[true,true,true,false]");
    expect(received).toEqual([]);
    expect(accepted).toBe(1);
  });
}
