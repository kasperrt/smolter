/** Reject unsupported methods and browser mutations from another origin. */
export function requestPolicy(
  request: Pick<Request, "method" | "url" | "headers">,
): Response | undefined {
  if (request.method === "GET" || request.method === "HEAD") return;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD, POST, PUT, PATCH, DELETE" },
    });
  const origin = request.headers.get("Origin");
  if (
    (origin !== null && origin !== new URL(request.url).origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return new Response("Cross-origin mutation forbidden", { status: 403 });
}
