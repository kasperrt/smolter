import { createElement, type ReactNode } from "react";
import { createUI } from "./index";
export const ui = createUI<ReactNode>((tag, props, ...children) =>
  createElement(tag, props, ...children),
);
