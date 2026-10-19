import measurements from "./size-combinations.json";
import type { ElementFactory } from "./types";

type UseState = <T>(initial: T) => [T, (value: T) => void];
type UseEffect = (
  effect: () => (() => void) | undefined,
  dependencies: readonly unknown[],
) => void;
type UseRef = <T>(initial: T) => { current: T };
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
  useEffect: UseEffect,
  useRef: UseRef,
) {
  return function SizeSelector() {
    const [selection, select] = useState(5);
    const [framework, setFramework] = useState<"react" | "preact">("preact");
    const table: Record<string, number[]> = measurements[framework];
    const target = table[selection];
    const [values, setValues] = useState(target);
    const current = useRef(target);
    useEffect(() => {
      if (current.current === target) return;
      const motion = matchMedia("(prefers-reduced-motion: reduce)");
      const from = current.current;
      const started = performance.now();
      let frame = 0;
      const finish = () => {
        cancelAnimationFrame(frame);
        current.current = target;
        setValues(target);
      };
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / 280);
        const eased = 1 - (1 - progress) ** 3;
        current.current = target.map((value, index) =>
          Math.round(from[index] + (value - from[index]) * eased),
        );
        setValues(current.current);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      if (motion.matches) finish();
      else frame = requestAnimationFrame(tick);
      motion.addEventListener("change", finish);
      return () => {
        cancelAnimationFrame(frame);
        motion.removeEventListener("change", finish);
      };
    }, [target]);
    const [raw, gzip, brotli] = values;
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
          h(
            "span",
            { className: "size-announcement" },
            `${target[1].toLocaleString("en-US")} bytes gzip`,
          ),
          h("strong", { "aria-hidden": true }, gzip.toLocaleString("en-US")),
          h("span", { "aria-hidden": true }, " B"),
          h("small", { "aria-hidden": true }, "gzip"),
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
