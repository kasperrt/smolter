import { type ComponentChildren, h } from "preact";
import { useState } from "preact/hooks";
import { createUI } from "./index";
import { createSizeSelector } from "./size-selector";
import type { ElementFactory } from "./types";

const element: ElementFactory<ComponentChildren> = (tag, props, ...children) =>
  h(tag, props, ...children);
const SizeSelector = createSizeSelector(element, useState);
export const ui = createUI(element, () => h(SizeSelector, {}));
