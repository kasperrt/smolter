import { ui } from "@smolter/ui/react";

interface ErrorProps {
  error: Error;
}
export function ErrorBoundary({ error }: ErrorProps) {
  return ui.ErrorPanel(error);
}
