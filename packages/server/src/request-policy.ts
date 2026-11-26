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
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  const referer = request.headers.get("Referer");
  if (
    (origin !== null && origin !== expected) ||
    (site !== null && site !== "same-origin" && site !== "none") ||
    (origin === null &&
      referer !== null &&
      (!URL.canParse(referer) || new URL(referer).origin !== expected))
  )
    return new Response("Cross-origin mutation forbidden", { status: 403 });
}
