# REST API architecture

## Public use

Clients call explicit `/api/v1` resources with an organization-owned API key:

```http
POST /api/v1/locations HTTP/1.1
Authorization: Bearer eng_...
Content-Type: application/json
Idempotency-Key: import-location-2026-08-23-001

{"name":"Central"}
```

Authenticated responses use English fields and errors, include a request ID,
and set `Cache-Control: private, no-store`. Public OpenAPI 3.1 and HTML docs
live at `/api/v1/openapi.json` and `/api/v1/docs`.

## Runtime boundary

Use explicit Next route files over one shared request executor.

```text
API client
  -> explicit Next /api/v1 route
  -> shared request executor
       -> strict request parsing
       -> Better Auth API-key verification
       -> 30-second RS256 service JWT
       -> request-local Convex client
  -> explicit convex/rest function
       -> current API-key policy
       -> role, permission, and location guards
       -> domain rules, idempotency, and audit
  -> public DTO or RFC 9457 problem response
```

Route files name the supported HTTP operations. They do not parse credentials
or select Convex functions from request data. One descriptor list supplies
request schemas, response schemas, operation metadata, and OpenAPI generation;
Next's route tree remains the runtime allowlist.

## Authentication and authorization

Better Auth owns API-key generation, hashing, organization ownership, expiry,
enabled state, credential rate limiting, and last-use metadata. Convex owns an
application policy for each Better Auth key ID:

- one organization;
- one existing role;
- a subset of the role's current permissions;
- explicit `all`, `selected`, or `operator` location access;
- lifecycle and audit metadata.

Next verifies the key on every request and signs a short-lived service token.
The token identifies the key and verified organization; it does not carry
authoritative permissions. Convex reloads the current policy, intersects its
grant with the current role, resolves location access, and fails closed when
the policy is missing, revoked, expired, or malformed.

The existing human JWT provider remains unchanged. A second Convex provider
uses application ID `rest-api-v1`. Shared authorization has a discriminated
`user | apiKey` principal. Machine operations never fabricate a Better Auth
user or session.

## Module ownership

```text
app/api/v1/**/route.ts
  explicit HTTP entry points

lib/api/v1/
  executor, request parsing, key verification, JWT signing, problems,
  pagination, descriptors, public schemas, DTO mapping, OpenAPI, and docs

convex/rest/
  named REST-safe queries and mutations with explicit validators

convex/apiKeys.ts
  human-only key lifecycle and policy administration

convex/lib/auth.ts
  human and API-key principal resolution

convex/lib/idempotency.ts
  transaction-local claim, replay, conflict, and completion
```

Public schemas do not import Convex documents. Convex functions do not return
`_creationTime`, organization IDs, storage IDs, Better Auth rows, or provider
payloads.

## Writes and retries

Resource-creating and side-effecting `POST` operations require an
`Idempotency-Key`. The validated request is canonicalized and hashed. Convex
claims the organization/key/operation/idempotency tuple, performs the domain
write, and stores the safe response in one transaction. An identical replay
returns the original response. Reusing the key for another request returns
`409`. Records expire after 24 hours.

Existing domain behavior remains authoritative. Location deletion keeps its
dependency checks. Product updates keep stock and recipe effects. Unit merge
remains a named command. REST `PATCH` adapters merge partial input inside the
authorized Convex transaction before invoking full domain behavior.

## Key lifecycle

Key administration is a human-session feature guarded by `apiKeys.manage`.
The Danish page lives at `/organization/api`.

Creation is coordinated but not cross-system transactional: create the Better
Auth credential, insert the fail-closed Convex policy, then return the raw
secret once. If policy insertion fails, disable the credential and return no
secret. Rotation creates a replacement first and leaves an intentional overlap.
Revocation denies the Convex policy and disables the Better Auth credential;
partial failures remain safe and visible for repair.

## Phase boundaries

Phase 1 publishes locations and opening hours, products, categories, units,
markets, legal entities, and operators. Product image upload stays private
until uploads are bound to an organization and API key. Complete cursor pages
are the first synchronization contract; `updatedAfter` is not supported until
the affected tables have reliable timestamps and indexes.

Later phases add Transfers, dashboards, sales, and machine-safe workflow
operations. Better Auth members, invitations, accounts, passwords, sessions,
and API-key administration remain human-only in v1.

## Rationale

Explicit route files are easier to audit in this Next 16 app than a custom
catch-all matcher. The shared executor still hides transport complexity, while
descriptor-driven documentation prevents a second hand-maintained contract.
Named Convex functions keep organization checks and business effects inside
the database boundary. The extra policy lookup and lifecycle compensation buy
immediate authorization changes without turning an API key into a user.
