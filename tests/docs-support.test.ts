import { expect, it } from "vitest";
import { pageSupport } from "../packages/ui/src/docs/support";

const page = {
  slug: "Document",
  title: "Document",
  summary: "",
  kind: "API",
  sections: [],
};
it("distinguishes renderer, browser, server and partial integration support", () => {
  expect(
    pageSupport({ ...page, entries: ["preact/document"] }).map((s) => s.level),
  ).toEqual(["alternative", "alternative", "yes", "yes"]);
  expect(
    pageSupport({
      ...page,
      slug: "renderApplication",
      entries: ["preact/server"],
    }).map((s) => s.level),
  ).toEqual(["no", "no", "no", "yes"]);
  expect(
    pageSupport({ ...page, entries: ["react", "preact"] }).every(
      (s) => s.level === "yes",
    ),
  ).toBe(true);
  expect(
    pageSupport({ ...page, entries: ["react/client", "preact/client"] }).map(
      (s) => s.level,
    ),
  ).toEqual(["yes", "partial", "yes", "partial"]);
  expect(pageSupport({ ...page, slug: "server-rendering" })[1].level).toBe(
    "yes",
  );
});

it("explains framework alternatives without claiming router APIs are built into React", () => {
  const awaitSupport = pageSupport({
    ...page,
    slug: "Await",
    entries: ["preact"],
  });
  expect(awaitSupport[0].short).toBe("R*");
  expect(awaitSupport[1].short).toBe("RS*");
  expect(awaitSupport[0].detail).toContain("React 19+");
  expect(awaitSupport[0].detail).toContain("revives streamed loader promises");
  expect(awaitSupport[0].reference?.href).toBe(
    "https://react.dev/reference/react/use",
  );
  const navigation = pageSupport({
    ...page,
    slug: "useNavigation",
    entries: ["react", "preact"],
  });
  expect(navigation[0].level).toBe("yes");
  expect(navigation[1].level).toBe("yes");
  expect(navigation[0].reference).toBeUndefined();
  const mount = pageSupport({
    ...page,
    slug: "mountApplication",
    entries: ["react/client", "preact/client"],
  });
  expect(mount[0].level).toBe("yes");
  expect(mount[1].level).toBe("partial");
});
