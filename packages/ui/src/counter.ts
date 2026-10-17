import type { createPrimitives } from "./primitives";
import type { CounterProps, ElementFactory } from "./types";

type CounterControls<N> = Pick<
  ReturnType<typeof createPrimitives<N>>,
  "Button" | "Panel"
>;

export function createCounter<N>(
  h: ElementFactory<N>,
  { Button, Panel }: CounterControls<N>,
) {
  function CounterPanel({
    data,
    state,
    message,
    form,
    revalidate,
  }: CounterProps<N>) {
    const busy = state !== "idle";

    return Panel(
      "counter.demo",
      h(
        "div",
        { className: "counter-body" },
        h(
          "div",
          { className: "counter-label" },
          h("h2", null, "Counter"),
          h("span", { className: "pill" }, state),
        ),
        h(
          "div",
          { className: "counter" },
          h("span", { "data-testid": "count" }, data?.count ?? 0),
        ),
        form([
          Button(
            {
              type: "submit",
              name: "intent",
              value: "increment",
              disabled: busy,
              "aria-busy": busy,
            },
            "Add one +",
          ),
          Button(
            {
              type: "submit",
              name: "intent",
              value: "reset",
              className: "secondary",
              disabled: busy,
              "aria-busy": busy,
            },
            "Reset",
          ),
        ]),
        h(
          "div",
          { className: "status" },
          h(
            "span",
            { role: "status" },
            message ?? "Route action → loader revalidation",
          ),
        ),
      ),
      h(
        "div",
        { className: "demo-footer" },
        h(
          "span",
          null,
          "Loader runs: ",
          h("strong", { "data-testid": "runs" }, data?.reads ?? 0),
        ),
        Button(
          { className: "text-button", onClick: revalidate, disabled: busy },
          "Revalidate ↻",
        ),
      ),
    );
  }

  function CounterFallback() {
    return CounterPanel({
      state: "loading",
      form: (children) => h("form", null, ...children),
    });
  }

  return { CounterPanel, CounterFallback };
}
