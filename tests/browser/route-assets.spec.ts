import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { safeWrapAsync } from "@smolter/core";
import { routePreloads } from "../../packages/server/src/assets.ts";

test("reuses cross-origin stylesheet hints when Vite applies the matched route CSS", async ({
  page,
}) => {
  const requests: Array<string | undefined> = [];
  let assets = "";
  const server = createServer((request, response) => {
    if (request.url === "/route.css") {
      requests.push(request.headers.origin);
      response.writeHead(200, {
        "Content-Type": "text/css",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=600",
      });
      response.end("body { color: rgb(20, 30, 40); }");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html",
      Link: routePreloads(
        [{ path: "/", files: [], styles: ["route.css"] }],
        "/",
        assets,
      ),
    });
    response.end(`<!doctype html><html><head><title>Route assets</title></head><body>
      <button id="apply">Apply route styles</button>
      <script>
        document.getElementById("apply").onclick = () => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.crossOrigin = "";
          link.href = "${assets}/route.css";
          document.head.appendChild(link);
        };
      </script>
    </body></html>`);
  });
  await new Promise<void>((done) => server.listen(0, done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  assets = `http://127.0.0.1:${address.port}`;
  const origin = `http://localhost:${address.port}`;
  const { error: testError } = await safeWrapAsync(async () => {
    await page.goto(origin);
    await expect.poll(() => requests.length).toBe(1);
    expect(requests).toEqual([origin]);
    await page.getByRole("button", { name: "Apply route styles" }).click();
    await expect(page.locator("body")).toHaveCSS("color", "rgb(20, 30, 40)");
    expect(requests).toEqual([origin]);
  });
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  if (testError) throw testError.cause ?? testError;
});
