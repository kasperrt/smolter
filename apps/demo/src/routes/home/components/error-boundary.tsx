import type { ErrorProps } from "smolter";
export function ErrorBoundary({ error }: ErrorProps) {
  return <p role="alert">{error.message}</p>;
}
