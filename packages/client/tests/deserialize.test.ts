import { expect, it } from "vitest";
import { deserialize } from "../src/deserialize.ts";

it("restores snapshots and normalizes valid and malformed error payloads", () => {
  const ok = deserialize(
    JSON.stringify({
      url: "https://app.example/",
      params: {},
      state: "idle",
      loaded: true,
    }),
  );
  expect(ok.error).toBeUndefined();
  const named = deserialize(
    JSON.stringify({
      url: "https://app.example/",
      params: {},
      state: "idle",
      loaded: false,
      error: { name: "RouteError", message: "Missing" },
    }),
  );
  expect(named.error).toBeInstanceOf(Error);
  expect(named.error?.name).toBe("RouteError");
  expect(named.error?.message).toBe("Missing");
  const primitiveError = deserialize(
    JSON.stringify({
      url: "https://app.example/",
      params: {},
      state: "idle",
      loaded: false,
      error: "boom",
    }),
  );
  expect(primitiveError.error).toBeInstanceOf(Error);
  expect(primitiveError.error?.message).toBe("boom");
  const unnamedError = deserialize(
    JSON.stringify({
      url: "https://app.example/",
      params: {},
      state: "idle",
      loaded: false,
      error: { message: 123, name: 456 },
    }),
  );
  expect(unnamedError.error).toBeInstanceOf(Error);
  expect(unnamedError.error?.name).toBe("Error");
  for (const invalid of ["null", "[]", '"text"', "42"])
    expect(() => deserialize(invalid)).toThrow(TypeError);
});
