import {
  createDataRouter,
  defineRoute,
  NavLink,
  RouterProvider,
} from "@smolter/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

it("updates navigation links across exact, descendant, and unrelated paths", async (context) => {
  const router = createDataRouter([
    defineRoute("/", {}),
    defineRoute("/tasks", {}),
    defineRoute("/tasks/:id", {}),
    defineRoute("/tasks-other", {}),
  ]);
  const container = document.createElement("div");
  const root = createRoot(container);

  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
  });

  await router.navigate("/tasks/42");
  root.render(
    createElement(
      RouterProvider,
      { router },
      createElement(NavLink, {
        to: "/tasks",
        className: ({ isActive }) => (isActive ? "active" : "inactive"),
        children: ({ isActive }) => (isActive ? "Current tasks" : "Tasks"),
      }),
      createElement(NavLink, {
        href: "/tasks",
        end: true,
        className: "exact",
        children: "Task index",
      }),
      createElement(NavLink, { to: "/", children: "Home" }),
    ),
  );

  const activeLabels = () =>
    [...container.querySelectorAll('[aria-current="page"]')].map(
      (anchor) => anchor.textContent,
    );

  await expect.poll(activeLabels).toEqual(["Current tasks"]);
  expect(container.querySelector("a")?.className).toBe("active");

  await router.navigate("/tasks");
  await expect.poll(activeLabels).toEqual(["Current tasks", "Task index"]);
  expect(container.querySelectorAll("a")[1].className).toBe("exact");

  await router.navigate("/tasks-other");
  await expect.poll(activeLabels).toEqual([]);
  expect(container.querySelector("a")?.textContent).toBe("Tasks");
  expect(container.querySelector("a")?.className).toBe("inactive");

  await router.navigate("/");
  await expect.poll(activeLabels).toEqual(["Home"]);
});
