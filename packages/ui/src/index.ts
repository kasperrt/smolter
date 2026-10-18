import { createCode } from "./code";
import { createCounter } from "./counter";
import { createDocumentation } from "./documentation";
import { createPrimitives } from "./primitives";
import { createShell } from "./shell";
import { createTasks } from "./tasks";
import type { ElementFactory, LinkFactory } from "./types";

export type * from "./types";

/** Pure UI shared by both renderers; no routing, requests, or framework hooks. */
export function createUI<N>(h: ElementFactory<N>) {
  const link: LinkFactory<N> = (href, children, className) =>
    h("a", { href, className }, children);
  const primitives = createPrimitives(h);
  const code = createCode(h, primitives);
  const counter = createCounter(h, primitives);
  const tasks = createTasks(h, primitives);
  const shell = createShell(h, link);
  const Documentation = createDocumentation(h, code.CodeBlock, link);
  return {
    ...primitives,
    ...code,
    ...counter,
    ...tasks,
    ...shell,
    Documentation,
  };
}
