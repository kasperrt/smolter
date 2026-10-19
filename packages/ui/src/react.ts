import { createElement as h, type ReactNode, useState } from "react";
import { createUI } from "./index";
import { createSizeSelector } from "./size-selector";
import type { ElementFactory } from "./types";

const element: ElementFactory<ReactNode> = (tag, props, ...children) =>
  h(tag, props, ...children);
const SizeSelector = createSizeSelector(element, useState);
export const ui = createUI(element, () => h(SizeSelector, {}));
