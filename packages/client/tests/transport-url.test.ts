import { dataTarget, dataURL } from "@smolter/core/transport";
import { expect, it } from "vitest";

it("roundtrips suffix routes without consuming application query parameters", () => {
  for (const path of [
    "/",
    "/users",
    "/users/",
    "/robots.txt",
    "/users/a%2Fb",
    "/x?url=%2Fother&url=two&q=a%2Bb",
  ]) {
    const url = new URL(path, "https://app.test");
    const transport = new URL(dataURL(url), url);
    expect(dataTarget(transport)).toBe(url.pathname + url.search);
  }
  expect(dataURL(new URL("https://app.test/users/"))).toBe("/users/.__smolter");
  expect(dataTarget(new URL("https://app.test/users"))).toBeUndefined();
  expect(
    dataTarget(new URL("https://app.test/_smolter?url=/private")),
  ).toBeUndefined();
});

it("rejects ambiguous legacy targets with the same parser used by dev and production", () => {
  for (const target of [
    "",
    "https://evil.test/",
    "//evil.test/",
    "/\\evil.test/",
    "/\n/evil.test/",
    "/x#fragment",
  ]) {
    const url = new URL(
      `https://app.test/_smolter?url=${encodeURIComponent(target)}`,
    );
    expect(dataTarget(url, "/_smolter")).toBeInstanceOf(Error);
  }
  expect(
    dataTarget(new URL("https://app.test//evil.__smolter")),
  ).toBeInstanceOf(Error);
  expect(
    dataTarget(
      new URL(
        "https://app.test/admin/_smolter?url=%2Fadmin%2Fusers%3Fpage%3D2",
      ),
      "/admin/_smolter",
    ),
  ).toBe("/admin/users?page=2");
});

it("rejects ambiguous legacy transport selectors without rejecting ordinary duplicate queries", () => {
  expect(
    dataTarget(new URL("https://app.test/_smolter?url=/a&url=/b"), "/_smolter"),
  ).toBeInstanceOf(Error);
  expect(
    dataTarget(new URL("https://app.test/_smolter"), "/_smolter"),
  ).toBeInstanceOf(Error);
});
