import { operationList } from "./contract";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createDeveloperDocsHtml() {
  const supportEmail = process.env.REST_API_SUPPORT_EMAIL?.trim();
  const problemTypes = [
    ["bad-request", "400", "The request syntax or a required control header is invalid."],
    ["authentication", "401", "The API key is missing, invalid, expired, disabled, or revoked."],
    ["authorization", "403", "The key lacks the required permission or location access."],
    ["not-found", "404", "The route or organization-owned resource was not found."],
    ["method-not-allowed", "405", "The route does not support the HTTP method."],
    ["conflict", "409", "The request conflicts with current state or an idempotency record."],
    ["precondition-failed", "412", "The resource changed after the supplied version was read."],
    ["request-too-large", "413", "The JSON request body exceeds 1 MB."],
    ["unsupported-media-type", "415", "A JSON operation did not receive application/json."],
    ["validation", "422", "Valid JSON failed field, reference, or resource-limit validation."],
    ["precondition-required", "428", "A required If-Match header is missing."],
    ["rate-limit", "429", "The key request or mutation limit was exceeded."],
    ["internal-error", "500", "The server could not safely complete the request."],
    ["unavailable", "503", "API-key authentication is temporarily unavailable."],
  ]
    .map(
      ([fragment, status, description]) =>
        `<article class="card" id="problem-${fragment}"><h3>${status}</h3><p>${escapeHtml(description)}</p></article>`,
    )
    .join("");
  const operations = operationList
    .map(
      (operation) => `
        <article class="operation" id="${escapeHtml(operation.id)}">
          <div class="operation-title">
            <code class="method ${operation.method.toLowerCase()}">${operation.method}</code>
            <code>${escapeHtml(operation.path)}</code>
          </div>
          <h3>${escapeHtml(operation.summary)}</h3>
          <p>${escapeHtml(operation.description)}</p>
          <dl>
            <div><dt>Permission</dt><dd><code>${escapeHtml(operation.permission ?? "authenticated key")}</code></dd></div>
            <div><dt>Location access</dt><dd>${escapeHtml(operation.locationBehavior)}</dd></div>
            <div><dt>Idempotency</dt><dd>${operation.idempotencyRequired ? "Required" : "Not required"}</dd></div>
            <div><dt>Concurrency</dt><dd>${operation.ifMatchRequired ? "Current quoted version required in If-Match" : "No version precondition"}</dd></div>
          </dl>
        </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>REST API developer guide</title>
  <style>
    :root { color-scheme: light dark; --bg:#f7f7f5; --surface:#fff; --text:#171714; --muted:#66665f; --line:#deded8; --accent:#185b45; --code:#f0f0ec; }
    @media (prefers-color-scheme:dark) { :root { --bg:#11110f; --surface:#191917; --text:#f3f3ed; --muted:#aaa99f; --line:#35352f; --accent:#83d2b4; --code:#242421; } }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 ui-sans-serif,system-ui,sans-serif; }
    main { width:min(74rem, calc(100% - 2rem)); margin:0 auto; padding:4rem 0 7rem; }
    header { max-width:52rem; margin-bottom:3rem; }
    h1 { margin:.2rem 0 1rem; font-size:clamp(2.4rem,7vw,5rem); line-height:1; letter-spacing:-.05em; }
    h2 { margin:3.5rem 0 1rem; font-size:1.65rem; letter-spacing:-.02em; }
    h3 { margin:.8rem 0 .3rem; font-size:1.05rem; }
    p { margin:.4rem 0 1rem; }
    a { color:var(--accent); }
    code { padding:.15rem .4rem; border-radius:.35rem; background:var(--code); font: .9em/1.45 ui-monospace,SFMono-Regular,monospace; }
    pre { overflow:auto; padding:1rem; border:1px solid var(--line); border-radius:.65rem; background:var(--code); }
    pre code { padding:0; background:transparent; }
    .eyebrow { color:var(--accent); font-weight:700; text-transform:uppercase; letter-spacing:.12em; }
    .lead { color:var(--muted); font-size:1.15rem; }
    .links { display:flex; flex-wrap:wrap; gap:1rem; margin-top:1.5rem; }
    .links a { padding:.65rem .9rem; border:1px solid var(--line); border-radius:.5rem; background:var(--surface); font-weight:650; text-decoration:none; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(18rem,1fr)); gap:1rem; }
    .card,.operation { padding:1.2rem; border:1px solid var(--line); border-radius:.75rem; background:var(--surface); }
    .operation { margin-bottom:.8rem; }
    .operation-title { display:flex; flex-wrap:wrap; align-items:center; gap:.65rem; }
    .method { color:#fff; background:#245c46; font-weight:800; }
    .method.post { background:#285c92; }.method.patch,.method.put { background:#7b5716; }.method.delete { background:#9a3434; }
    dl { margin:.8rem 0 0; font-size:.9rem; }
    dl div { display:grid; grid-template-columns:8rem 1fr; gap:.8rem; padding:.35rem 0; border-top:1px solid var(--line); }
    dt { color:var(--muted); } dd { margin:0; }
    nav { position:sticky; top:0; z-index:1; padding:.7rem 0; background:color-mix(in srgb,var(--bg) 92%,transparent); backdrop-filter:blur(10px); }
    nav a { margin-right:1rem; font-size:.9rem; }
  </style>
</head>
<body>
<main>
  <nav aria-label="Developer guide"><a href="#start">Start</a><a href="#contract">Contract</a><a href="#errors">Errors</a><a href="#operations">Operations</a><a href="#support">Support</a></nav>
  <header id="start">
    <p class="eyebrow">Public version 1</p>
    <h1>REST API</h1>
    <p class="lead">Organization-scoped, permission-aware CRUD for supported resources. The deployed OpenAPI 3.1 document is the source of truth.</p>
    <div class="links"><a href="/api/v1/openapi.json">OpenAPI JSON</a><a href="/api/v1/me">Capability endpoint</a></div>
  </header>

  <section>
    <h2>Quick start</h2>
    <p>Create an API key in <strong>Administration → API</strong>. Copy the secret when it is shown; it cannot be retrieved later.</p>
    <pre><code>curl https://your-deployment.example/api/v1/me \\
  -H 'Authorization: Bearer eng_…'</code></pre>
    <p>Keys belong to one organization and carry a role, a reduced permission set, a location policy, and an expiry. Revocation and policy changes apply to the next request. Keep keys in server-side secret storage; never embed them in browser or mobile application code.</p>
  </section>

  <section id="contract">
    <h2>Request and response contract</h2>
    <div class="grid">
      <article class="card"><h3>JSON</h3><p>Send <code>Content-Type: application/json</code>. Bodies are limited to 1 MB. Unknown fields are rejected.</p></article>
      <article class="card"><h3>Pagination</h3><p>Collections use opaque cursors, default to 50 records, and accept at most 100. Follow <code>page.nextCursor</code> until <code>hasMore</code> is false.</p></article>
      <article class="card"><h3>Retries</h3><p>Creating and side-effecting POST operations require <code>Idempotency-Key</code>. Identical retries replay the first response for 24 hours; changed input returns 409.</p></article>
      <article class="card"><h3>Errors</h3><p>Failures use <code>application/problem+json</code> with a stable <code>code</code> and <code>requestId</code>. Include the request ID in support reports.</p></article>
      <article class="card"><h3>Rate limit</h3><p>Organization keys allow 120 requests per 60-second key window and 30 mutations per minute. Successful responses include limit, remaining-count, and reset-time headers. A 429 response includes <code>Retry-After</code>.</p></article>
      <article class="card"><h3>Synchronization</h3><p>Use full cursor reconciliation. <code>updatedAfter</code> is not supported until each resource has a reliable indexed update timestamp.</p></article>
      <article class="card"><h3>Concurrent edits</h3><p>Product updates, archive, restore, and deletion require <code>If-Match</code> with the current quoted <code>version</code>. A stale version returns 412; a missing header returns 428.</p></article>
    </div>
  </section>

  <section id="errors">
    <h2>Problem types</h2>
    <p>The <code>type</code> identifies the broad failure class. Use the stable <code>code</code> for program logic and the <code>requestId</code> for support.</p>
    <div class="grid">${problemTypes}</div>
  </section>

  <section>
    <h2>Compatibility policy</h2>
    <p>Version 1 receives additive endpoints and optional fields. Breaking request or response changes move to a new major URL. A published operation receives at least 12 months' deprecation notice before removal, with <code>Deprecation</code>, <code>Sunset</code>, and documentation <code>Link</code> headers.</p>
  </section>

  <section id="operations"><h2>Published operations</h2>${operations}</section>

  <section id="support">
    <h2>Support and incidents</h2>
    <p>${supportEmail ? `Contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>` : "Contact your deployment's API support channel"} with the UTC timestamp, HTTP method and path, response status, and <code>X-Request-Id</code>. Never send the API key secret.</p>
    <p>Changelog: <strong>1.0.0</strong> — capability endpoint and Phase 1 master-data CRUD.</p>
  </section>
</main>
</body>
</html>`;
}
