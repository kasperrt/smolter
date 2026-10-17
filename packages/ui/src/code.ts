import { highlight } from "./highlight";
import type { createPrimitives } from "./primitives";
import type { CodePanelProps, ElementFactory } from "./types";

type CodeControls<N> = Pick<
  ReturnType<typeof createPrimitives<N>>,
  "Button" | "WindowBar"
>;

export function createCode<N>(
  h: ElementFactory<N>,
  { Button, WindowBar }: CodeControls<N>,
) {
  function CodeBlock(source: string, label: string) {
    return h(
      "pre",
      { tabIndex: 0, "aria-label": label },
      h(
        "code",
        null,
        ...highlight(source).map((token, index) =>
          h(
            "span",
            { key: index, className: token.kind && `syntax-${token.kind}` },
            token.text,
          ),
        ),
      ),
    );
  }

  function CodePanel({ files, active, select }: CodePanelProps) {
    return h(
      "aside",
      { "data-testid": "source-panel" },
      WindowBar(active, "SOURCE"),
      h(
        "div",
        { className: "source-tabs" },
        ...Object.keys(files).map((file) =>
          Button(
            {
              key: file,
              onClick: () => select(file),
              "aria-pressed": file === active,
            },
            file,
          ),
        ),
      ),
      CodeBlock(files[active] ?? "", `${active} source code`),
      h(
        "div",
        { className: "code-footer" },
        h(
          "span",
          null,
          active === "Example"
            ? "Same behavior · styling omitted"
            : active.includes("routes")
              ? "Route registration · paths and modules"
              : "Actual route source",
        ),
        h("span", null, "TypeScript"),
      ),
    );
  }

  return { CodeBlock, CodePanel };
}
