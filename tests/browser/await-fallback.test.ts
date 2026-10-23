import { safeWrapAsync } from "@smolter/core";
import { createElement, hydrate, render } from "preact";
import { Suspense } from "preact/compat";
import { useErrorBoundary } from "preact/hooks";
import { expect, it, vi } from "vitest";
import {
  type DeferredWindow,
  readHydration,
} from "../../packages/client/src/hydration.ts";
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
  void safeWrapAsync(() => rejected);
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

it("treats resolved errors and empty values as data with an owned fallback", async (context) => {
  const container = document.createElement("div");
  context.onTestFinished(() => render(null, container));
  for (const value of [new Error("resolved data"), undefined, null, false, 0]) {
    render(
      createElement(Await, {
        resolve: Promise.resolve(value),
        fallback: "pending",
        errorElement: "rejected",
        children: (data) => String(data),
      }),
      container,
    );
    await expect.poll(() => container.textContent).toBe(String(value));
  }
});

for (const failure of ["packet", "interruption"]) {
  it(`applies error attributes after late hydration ${failure}`, async (context) => {
    const state = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    const container = document.createElement("div");
    container.innerHTML = "<p>pending</p>";
    Reflect.deleteProperty(window, "__smolterDeferred");
    const initial = readHydration('{"pending":{"__smolterPending":0}}');
    context.onTestFinished(() => {
      render(null, container);
      initial.dispose();
      state.mockRestore();
    });
    hydrate(
      createElement(
        Suspense,
        { fallback: createElement("p", null, "pending") },
        createElement(Await<string>, {
          resolve: initial.hydration.pending,
          errorElement: createElement(
            "p",
            {
              role: "alert",
              "aria-live": "assertive",
              style: { color: "rgb(255, 0, 0)" },
            },
            "failed",
          ),
          children: (value) => createElement("p", null, value),
        }),
      ),
      container,
    );
    expect(container.textContent).toBe("pending");
    if (failure === "packet")
      (window as DeferredWindow).__smolterDeferred!.push([0, null, "failed"]);
    else initial.dispose();
    await expect
      .poll(() => container.querySelector("[role=alert]")?.textContent)
      .toBe("failed");
    const alert = container.querySelector("p")!;
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.style.color).toBe("rgb(255, 0, 0)");
  });
}

for (const source of ["promise", "serialized", "buffered"]) {
  it(`preserves existing server error input with ${source} rejection`, async (context) => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div><input aria-label="Error details"><span>failed</span></div>';
    document.body.append(container);
    const input = container.querySelector("input")!;
    input.value = "typed before hydration";
    input.focus();
    const error = new Error("failed");
    (window as DeferredWindow).__smolterDeferred =
      source === "buffered" ? [[0, null, "failed"]] : [];
    const initial =
      source === "promise"
        ? undefined
        : readHydration(
            source === "serialized"
              ? '{"pending":{"__smolterRejected":{"message":"failed"}}}'
              : '{"pending":{"__smolterPending":0}}',
          );
    const pending = initial?.hydration.pending ?? Promise.reject(error);
    context.onTestFinished(() => {
      render(null, container);
      container.remove();
      initial?.dispose();
    });
    hydrate(
      createElement(
        Suspense,
        { fallback: createElement("p", null, "pending") },
        createElement(Await<string>, {
          resolve: pending,
          errorElement: createElement(
            "div",
            null,
            createElement("input", { "aria-label": "Error details" }),
            createElement("span", null, "failed"),
          ),
          children: (value) => createElement("p", null, value),
        }),
      ),
      container,
    );
    await expect
      .poll(() => container.querySelector("span")?.textContent)
      .toBe("failed");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed before hydration");
    expect(document.activeElement).toBe(input);
    if (source === "promise") {
      const result = await safeWrapAsync(() => pending);
      expect(result.error?.cause).toBe(error);
    }
  });
}
