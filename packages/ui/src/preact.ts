import { type ComponentChildren, h } from "preact";
import { createUI } from "./index";
export const ui = createUI<ComponentChildren>((tag, props, ...children) =>
  h(tag, props, ...children),
);
