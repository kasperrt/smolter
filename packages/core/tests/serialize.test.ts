import { serializeData } from "@smolter/core/serialize";
import { expect, it } from "vitest";

it("escapes HTML and line-separator characters in a single pass", () => {
  expect(serializeData({ clean: "ok" })).toBe('{"clean":"ok"}');
  expect(serializeData("</script>\u2028\u2029")).toBe(
    '"\\u003c/script>\\u2028\\u2029"',
  );
});
