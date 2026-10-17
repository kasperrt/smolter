import { ui } from "@smolter/ui/preact";

interface ErrorProps {
  error: Error;
}

export function ErrorBoundary({ error }: ErrorProps) {
  return ui.ErrorPanel(error);
}
