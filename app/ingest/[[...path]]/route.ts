async function forward(request: Request) {
  const incoming = new URL(request.url);
  const pathname = incoming.pathname.slice("/ingest".length) || "/";
  const upstream = new URL(
    pathname.startsWith("/static/") || pathname.startsWith("/array/")
      ? "https://eu-assets.i.posthog.com"
      : "https://eu.i.posthog.com",
  );
  // Assign the path separately so even a double slash cannot change the host.
  upstream.pathname = pathname;
  upstream.search = incoming.search;

  const headers = new Headers();
  for (const name of ["accept", "content-type", "content-encoding", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control", "etag", "last-modified", "retry-after"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export {
  forward as GET,
  forward as HEAD,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
  forward as OPTIONS,
};
