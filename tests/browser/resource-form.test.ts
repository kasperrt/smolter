import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  createResourceRouter,
  Resource,
  ResourceForm,
  ResourceProvider,
  type ResourceRouteModule,
  useResourceActionData,
  useResourceData,
  useResourceSubmit,
} from "../../packages/react/src/data.ts";

it("submits form defaults and overrides to the current resource parameters", async (context) => {
  const loads: string[] = [];
  const route: ResourceRouteModule = {
    default: Editor,
    loader: async ({ params }) => {
      loads.push(params.id);

      return { data: params.id, error: "" };
    },
    action: async ({ input, params }) => ({
      data: { input, id: params.id },
      error: "",
    }),
    shouldRevalidate: () => false,
  };
  const router = createResourceRouter(new Map([["edit", route]]));
  const container = document.createElement("div");
  const root = createRoot(container);
  const initialMatches = [
    { routeId: "edit", params: { id: "one", scope: "all" } },
  ];
  const render = (id: string) =>
    root.render(
      h(
        ResourceProvider,
        { router, initialMatches },
        h(Resource, {
          routeId: "edit",
          persistent: true,
          params: { scope: "all", id },
        }),
      ),
    );

  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
  });

  render("one");
  await expect
    .poll(() => container.querySelector("output")?.textContent)
    .toContain('"data":"one"');
  expect(loads).toEqual(["one"]);

  container.querySelectorAll("button")[0].click();
  await expect
    .poll(() => container.querySelector("output")?.textContent)
    .toContain('"input":"default"');
  expect(
    router.getSnapshot("edit", { id: "one", scope: "all" }).actionData,
  ).toEqual({ input: "default", id: "one" });

  container.querySelectorAll("button")[1].click();
  await expect
    .poll(() => container.querySelector("output")?.textContent)
    .toContain('"input":"override"');
  expect(loads).toEqual(["one"]);

  render("two");
  await expect
    .poll(() => container.querySelector("output")?.textContent)
    .toContain('"data":"two"');
  container.querySelectorAll("button")[0].click();
  await expect
    .poll(
      () => router.getSnapshot("edit", { id: "two", scope: "all" }).actionData,
    )
    .toEqual({ input: "default", id: "two" });
  expect(loads).toEqual(["one", "two"]);
});

function Editor() {
  const data = useResourceData<string>();
  const action = useResourceActionData();

  return h(
    ResourceForm,
    { input: "default" },
    h("output", null, JSON.stringify({ data, action })),
    h(SubmitButtons),
  );
}

function SubmitButtons() {
  const submit = useResourceSubmit();

  return h(
    "div",
    null,
    h("button", { onClick: () => void submit() }, "Default"),
    h("button", { onClick: () => void submit("override") }, "Override"),
  );
}
