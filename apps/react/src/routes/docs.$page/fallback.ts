import { ui } from "@smolter/ui/react";

export function HydrateFallback() {
  return ui.LoadingPanel("Loading documentation…");
}
