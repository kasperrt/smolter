/** Keep targeted CDN policies from overriding the private response policy. */
export function privateHeaders(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store");
  for (const name of headers.keys())
    if (name.endsWith("-cache-control") || name === "surrogate-control")
      headers.set(name, "private, no-store");
}

/** Transport data must not be cached by shared intermediaries or the browser. */
export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  privateHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
