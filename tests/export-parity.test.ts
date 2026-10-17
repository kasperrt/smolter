import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { expect, it } from "vitest";
import * as preactDocument from "../packages/preact/src/document.tsx";
import * as reactDocument from "../packages/react/src/document.tsx";
import * as preactServer from "../packages/server/src/preact.ts";
import * as reactServer from "../packages/server/src/react.ts";

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
