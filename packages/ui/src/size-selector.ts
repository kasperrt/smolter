import measurements from "./size-combinations.json";
import type { ElementFactory } from "./types";

type UseState = <T>(initial: T) => [T, (value: T) => void];
const features = [
  {
    bit: 1,
    title: "Load and save data",
    description: "Loaders, actions, forms and fetchers.",
  },
  {
    bit: 2,
    title: "Server-rendered pages",
    description:
      "Hydration, documents and lazy file routes. Requires data routing.",
  },
  {
    bit: 4,
    title: "Prefetch on intent",
    description: "Prepare links on hover, focus or touch.",
  },
  {
    bit: 8,
    title: "Prefetch in view",
    description: "Prepare links as they enter the viewport.",
  },
  {
    bit: 16,
    title: "Prefetch route data",
    description:
      "Reuse speculative loader reads. Requires data routing and a prefetch mode.",
  },
  {
    bit: 32,
    title: "Deployment recovery helpers",
    description:
      "Explicit recovery APIs. Hydration already shares recovery code.",
  },
];

export function createSizeSelector<N>(
  h: ElementFactory<N>,
  useState: UseState,
) {
  return function SizeSelector() {
    const [selection, select] = useState(5);
    const [framework, setFramework] = useState<"react" | "preact">("preact");
    const table: Record<string, number[]> = measurements[framework];
    const [raw, gzip, brotli] = table[selection];
    const toggle = (bit: number) => {
      let next = selection ^ bit;
      if (next & 2) next |= 1;
      else next &= ~32;
      if (!(next & 1) || !(next & 12)) next &= ~16;
      select(next);
    };
    return h(
      "section",
      { className: "size-selector", "aria-label": "Build your bundle" },
      h(
        "div",
        { className: "size-options" },
        h("h3", null, "Your features. Your footprint."),
        h("p", null, "Start with navigation. Add only what your app needs."),
        h(
          "label",
          { className: "size-option size-baseline" },
          h("input", { type: "checkbox", checked: true, disabled: true }),
          h(
            "span",
            null,
            h("strong", null, "Paths, links & history"),
            h("small", null, "Always included · the routing baseline"),
          ),
        ),
        ...features.map(({ bit, title, description }) => {
          const disabled =
            (bit === 1 && Boolean(selection & 2)) ||
            (bit === 16 && (!(selection & 1) || !(selection & 12))) ||
            (bit === 32 && !(selection & 2));
          return h(
            "label",
            { className: "size-option", key: bit },
            h("input", {
              type: "checkbox",
              checked: Boolean(selection & bit),
              disabled,
              onChange: () => toggle(bit),
            }),
            h(
              "span",
              null,
              h("strong", null, title),
              h("small", null, description),
            ),
          );
        }),
      ),
      h(
        "div",
        { className: "size-result" },
        h(
          "fieldset",
          { className: "size-framework" },
          h("legend", null, "Framework"),
          ...(["preact", "react"] as const).map((value) =>
            h(
              "label",
              { key: value },
              h("input", {
                type: "radio",
                name: "bundle-framework",
                value,
                checked: value === framework,
                onChange: () => setFramework(value),
              }),
              value === "preact" ? "Preact" : "React",
            ),
          ),
        ),
        h("p", { className: "size-eyebrow" }, "Combined browser bundle"),
        h(
          "output",
          {
            className: "size-total",
            "aria-live": "polite",
            "aria-atomic": true,
          },
          h("strong", null, gzip.toLocaleString("en-US")),
          " B",
          h("small", null, "gzip"),
        ),
        h(
          "dl",
          { className: "size-compression" },
          h(
            "div",
            null,
            h("dt", null, "Brotli"),
            h("dd", null, `${brotli.toLocaleString("en-US")} B`),
          ),
          h(
            "div",
            null,
            h("dt", null, "Minified"),
            h("dd", null, `${raw.toLocaleString("en-US")} B`),
          ),
        ),
        h(
          "p",
          { className: "size-method" },
          "Measured together, including shared code. Production Vite fixture; framework runtime and your app code excluded. Your build may differ.",
        ),
        h(
          "p",
          { className: "size-method" },
          "Unchecked prefetch modes are removed by Smolter’s Vite plugin when usage is statically known. Dynamic spreads retain possible modes. Other features follow named-import tree shaking.",
        ),
      ),
    );
  };
}
