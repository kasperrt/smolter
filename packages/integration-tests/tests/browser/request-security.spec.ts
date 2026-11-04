import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dispatchRoute } from "@kasperrt/smolter/preact/server";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { expect, test } from "@playwright/test";

const servers: Server[] = [];
test.afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

test("same-site foreign-origin forms cannot execute authenticated document or data actions", async ({
  page,
}) => {
  let mutations = 0;
  const routes = [
    {
      path: "/account",
      action: () => {
        mutations++;
        return { saved: true };
      },
    },
  ];
  const handler = createRequestHandler({
    entry: "/entry.js",
    build: {
      default: (request) => dispatchRoute(request, routes, true),
      handleDataRequest: (request) => dispatchRoute(request, routes),
    },
  });
  const victim = createServer((request, response) => {
    if (request.url === "/") {
      response.setHeader(
        "Set-Cookie",
        "session=synthetic; HttpOnly; SameSite=Lax; Path=/",
      );
      response.end("fixture");
      return;
    }
    void handler(request, response, () => {
      response.statusCode = 500;
      response.end();
    });
  });
  servers.push(victim);
  victim.listen(0, "127.0.0.1");
  await once(victim, "listening");
  const target = `http://127.0.0.1:${(victim.address() as AddressInfo).port}`;
  const attacker = createServer((request, response) => {
    const path = request.url === "/data" ? "/account.__smolter" : "/account";
    response.setHeader("Content-Type", "text/html");
    response.end(
      `<form method="post" action="${target}${path}"><input name="value" value="changed"><button>Submit</button></form>`,
    );
  });
  servers.push(attacker);
  attacker.listen(0, "127.0.0.1");
  await once(attacker, "listening");
  const source = `http://127.0.0.1:${(attacker.address() as AddressInfo).port}`;
  await page.goto(target);
  expect(
    (await page.context().cookies(target)).some(
      (cookie) => cookie.name === "session",
    ),
  ).toBe(true);
  for (const path of ["/document", "/data"]) {
    await page.goto(source + path);
    const response = page.waitForResponse((response) =>
      response.url().startsWith(`${target}/account`),
    );
    await page.getByRole("button", { name: "Submit" }).click();
    expect((await response).status()).toBe(403);
    await expect(
      page.getByText("Cross-origin mutation forbidden"),
    ).toBeVisible();
  }
  expect(mutations).toBe(0);
});
