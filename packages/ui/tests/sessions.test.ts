import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { expect, it } from "vitest";
import { createSessionHandler } from "../tooling/sessions.ts";

it("retains an issued session and replaces ambiguous or malformed session cookies", () => {
  const ensureSession = createSessionHandler("__app");
  function request(cookie: string) {
    const incoming = new IncomingMessage(new Socket());
    incoming.headers.cookie = cookie;
    const outgoing = new ServerResponse(incoming);
    ensureSession(incoming, outgoing);
    return {
      cookie: incoming.headers.cookie,
      issued: outgoing.getHeader("set-cookie"),
    };
  }
  const first = request("theme=dark");
  const session = first.cookie.split("; ")[1];
  expect(first.issued).toContain(session);
  expect(request(`theme=dark;${session}`).issued).toBeUndefined();
  for (const cookie of [`${session}; ${session}`, `${session}!`]) {
    const next = request(`theme=dark; ${cookie}`);
    expect(next.issued).toBeDefined();
    expect(next.cookie.split("; ")).toHaveLength(2);
    expect(next.cookie).toContain("theme=dark");
    expect(next.cookie).not.toContain(session);
  }
});
