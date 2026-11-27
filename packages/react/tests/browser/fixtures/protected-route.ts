import { useLoaderData } from "@smolter/react";
import { createElement } from "react";

export function clientLoader() {
  return "Protected page";
}

export default function Protected() {
  return createElement("output", null, useLoaderData<string>());
}
