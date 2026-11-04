import * as utils from "@kasperrt/smolter/utils";
import * as core from "@smolter/core";
import * as preact from "@smolter/preact";
import * as preactDocument from "@smolter/preact/document";
import * as react from "@smolter/react";
import * as reactDocument from "@smolter/react/document";
import * as preactServer from "@smolter/server/preact";
import * as reactServer from "@smolter/server/react";
import { expect, it } from "vitest";

it("keeps adapter implementation helpers out of public utilities", () => {
  expect(Object.keys(utils).sort()).toEqual([
    "defineRoute",
    "internalURL",
    "matchRoutes",
    "navigationClick",
    "serialize",
    "serializeData",
  ]);
});

it("keeps internal helpers out of the core barrel used by adapter type exports", () => {
  expect(core).not.toHaveProperty("callRoute");
  expect(core).not.toHaveProperty("matchesLocation");
  expect(core).toHaveProperty("defineRoute");
  expect(core).toHaveProperty("matchRoutes");
  expect(core).toHaveProperty("internalURL");
  expect(core).toHaveProperty("navigationClick");
});

it("keeps routing hooks and server/document exports in parity", () => {
  expect(Object.keys(react).sort()).toEqual(
    Object.keys(preact)
      .filter((name) => name !== "Await")
      .sort(),
  );
  expect(Object.keys(reactServer).sort()).toEqual(
    Object.keys(preactServer).sort(),
  );
  expect(Object.keys(reactDocument).sort()).toEqual(
    Object.keys(preactDocument).sort(),
  );
});
