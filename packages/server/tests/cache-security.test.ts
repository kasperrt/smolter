import { data } from "@smolter/core/responses";
import { dispatchRoute, handleRequest } from "@smolter/server";
import { expect, it } from "vitest";
import { renderApplication as renderPreact } from "../src/preact.ts";
import { renderApplication as renderReact } from "../src/react.ts";

for (const dispatch of [
  dispatchRoute,
  (request: Request, routes: Parameters<typeof handleRequest>[0]) =>
    handleRequest(routes, request),
]) {
  it("prevents targeted CDN directives from overriding private data caching", async () => {
    const response = await dispatch(
      new Request("https://app.example/account"),
      [
        {
          path: "/account",
          loader: () =>
            Response.json(
              { session: "SYNTHETIC_PRIVATE_VALUE" },
              {
                headers: {
                  "Cache-Control": "public, max-age=3600",
                  "CDN-Cache-Control": "public, max-age=3600",
                  "Cloudflare-CDN-Cache-Control": "public, max-age=3600",
                  "Vercel-CDN-Cache-Control": "public, max-age=3600",
                  "Surrogate-Control": "max-age=3600",
                  "X-Application": "preserved",
                },
              },
            ),
        },
      ],
    );
    for (const header of [
      "Cache-Control",
      "CDN-Cache-Control",
      "Cloudflare-CDN-Cache-Control",
      "Vercel-CDN-Cache-Control",
      "Surrogate-Control",
    ])
      expect(response.headers.get(header)).toBe("private, no-store");
    expect(response.headers.get("X-Application")).toBe("preserved");
    expect(await response.json()).toEqual({
      session: "SYNTHETIC_PRIVATE_VALUE",
    });
  });
}

for (const render of [renderReact, renderPreact]) {
  it("keeps SSR root and route cache metadata private", async () => {
    const response = await render(
      new Request("https://app.example/account"),
      [
        {
          path: "/account",
          default: () => null,
          loader: () =>
            data(
              {},
              {
                headers: {
                  "CDN-Cache-Control": "max-age=3600",
                  "Surrogate-Control": "max-age=3600",
                },
              },
            ),
        },
      ],
      {
        Layout: () => null,
        default: () => null,
        loader: () =>
          data(
            {},
            { headers: { "Cloudflare-CDN-Cache-Control": "max-age=3600" } },
          ),
      },
      "/entry.js",
    );
    for (const header of [
      "Cache-Control",
      "CDN-Cache-Control",
      "Cloudflare-CDN-Cache-Control",
      "Surrogate-Control",
    ])
      expect(response.headers.get(header)).toBe("private, no-store");
    await response.text();
  });
}
