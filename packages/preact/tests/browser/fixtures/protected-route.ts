import { useLoaderData } from "@smolter/preact";
import { createElement } from "preact";

export function clientLoader() {
  return "Protected page";
}

export default function Protected() {
  return createElement("output", null, useLoaderData<string>());
}
