import { createElement, render } from "preact";
import { useErrorBoundary } from "preact/hooks";
import { expect, it } from "vitest";
import { Await } from "../../packages/preact/src/await.tsx";

it("keeps current values when an abandoned promise settles", async (context) => {
  const container = document.createElement("div");
  let release!: (value: string) => void;
  const old = new Promise<string>((done) => {
    release = done;
  });
  context.onTestFinished(() => render(null, container));
  const view = (resolve: Promise<string>) =>
    createElement(Await<string>, {
      resolve,
      fallback: "pending",
      children: (value) => value,
    });
  render(view(old), container);
  expect(container.textContent).toBe("pending");
  render(view(Promise.resolve("current")), container);
  await expect.poll(() => container.textContent).toBe("current");
  release("abandoned");
  await Promise.resolve();
  expect(container.textContent).toBe("current");
});

it("renders local errors and forwards unhandled deferred errors to the boundary", async (context) => {
  const container = document.createElement("div");
  const rejected = Promise.reject(new Error("owned failure"));
  void rejected.catch(() => {});
  context.onTestFinished(() => render(null, container));
  render(
    createElement(Await<string>, {
      resolve: rejected,
      fallback: "pending",
      errorElement: "local error",
      children: (value) => value,
    }),
    container,
  );
  await expect.poll(() => container.textContent).toBe("local error");
  render(null, container);
  function Boundary() {
    const [error] = useErrorBoundary();
    if (error) return "boundary error";
    return createElement(Await<string>, {
      resolve: rejected,
      fallback: null,
      children: (value) => value,
    });
  }
  render(createElement(Boundary, {}), container);
  await expect.poll(() => container.textContent).toBe("boundary error");
});
