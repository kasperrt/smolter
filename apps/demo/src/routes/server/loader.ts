export function loader() {
  return {
    message: "Rendered on the server",
    runs: typeof window === "undefined" ? 1 : 2,
  };
}
