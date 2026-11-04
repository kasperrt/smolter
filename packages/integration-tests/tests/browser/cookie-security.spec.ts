import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { expect, test } from "@playwright/test";

let server: Server | undefined;
let mode: string | undefined;
test.beforeEach(() => {
  mode = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
});
test.afterEach(() => {
  if (mode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = mode;
  server?.closeAllConnections();
  server?.close();
});

test("adapter cookies retain HTTPS-only protection without NODE_ENV", async ({
  page,
  context,
}) => {
  const handler = createRequestHandler({
    entry: "/entry.js",
    build: {
      default: () =>
        new Response("cookie fixture", {
          headers: {
            "Set-Cookie":
              "session=synthetic-only; Secure; HttpOnly; SameSite=Lax; Path=/",
          },
        }),
      handleDataRequest: () => new Response(null),
    },
  });
  server = createServer((request, response) => {
    void handler(request, response, () => {
      response.statusCode = 500;
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const response = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
  );
  const cookie = response.headers.getSetCookie()[0];
  await response.text();
  // Fulfil a synthetic HTTPS origin locally: no external service or real credential.
  await context.route("https://session.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/html", "Set-Cookie": cookie },
      body: "<title>Cookie fixture</title>",
    });
  });
  await page.goto("https://session.test/");
  expect(await context.cookies("http://session.test/")).toEqual([]);
  expect(await context.cookies("https://session.test/")).toMatchObject([
    {
      name: "session",
      value: "synthetic-only",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});
