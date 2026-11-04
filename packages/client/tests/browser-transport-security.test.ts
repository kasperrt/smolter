import { createDataRouter } from "@smolter/core";
import { expect, it, vi } from "vitest";
import { serverRoute } from "../src/index.ts";

it("rejects authority-like route paths before transmitting form fields", async (context) => {
  const fetch = vi.fn(async () => Response.json({ saved: true }));
  vi.stubGlobal("fetch", fetch);
  context.onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const router = createDataRouter([serverRoute("/*", {})], {
    url: "https://app.example/",
  });
  context.onTestFinished(() => router.dispose());
  const body = new FormData();
  body.set("password", "SYNTHETIC_PRIVATE_VALUE");
  for (const path of [
    "//attacker.example/upload",
    "///attacker.example/upload",
  ]) {
    const result = await router.submit(`https://app.example${path}`, body);
    expect(result.error).toBeInstanceOf(Error);
  }
  expect(fetch).not.toHaveBeenCalled();
});
