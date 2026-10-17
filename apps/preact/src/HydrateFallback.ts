import { ui } from "@smolter/ui/preact";

export function HydrateFallback() {
  return ui.LoadingPanel("Loading route…");
}
