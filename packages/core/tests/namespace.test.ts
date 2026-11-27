import { describe, expect, it } from "vitest";
import { validNamespace } from "../src/namespace.ts";

describe("namespace validation", () => {
  it.each([
    "app",
    "a1",
    "_app",
    "__app",
    "__enf",
    "a".repeat(32),
    `${"_".repeat(31)}a`,
    `__${"a".repeat(30)}`,
  ])("accepts %s", (name) => {
    expect(validNamespace(name)).toBe(name);
  });
  it.each([
    "",
    "_",
    "__",
    "1app",
    "_1app",
    "App",
    "__App",
    "a_b",
    "app_",
    "a-b",
    "a.b",
    "a/b",
    'x"y',
    "</script>",
    "app\n",
    "__app\r\n",
    "åpp",
    "a".repeat(33),
    `__${"a".repeat(31)}`,
    `${"_".repeat(32)}a`,
  ])("rejects %j", (name) => {
    expect(() => validNamespace(name)).toThrow(TypeError);
  });
});
