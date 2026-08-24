# REST API operations

## Required configuration

Set these variables on the Next.js deployment:

- `NEXT_PUBLIC_SITE_URL`: the deployment's public origin, without a path.
- `NEXT_PUBLIC_CONVEX_URL`: the Convex deployment URL.
- `REST_API_JWT_KEY_ID`: a stable identifier for the active signing key.
- `REST_API_JWT_PRIVATE_KEY`: the active PKCS#8 RSA private key in PEM format.
- `REST_API_JWT_PUBLIC_KEY`: the matching SPKI RSA public key in PEM format.
- `REST_API_SUPPORT_EMAIL`: the public API support address.

Set `SITE_URL` on the Convex deployment to the same public origin as
`NEXT_PUBLIC_SITE_URL`. Convex fetches the public key set from
`/.well-known/rest-api-jwks.json`; the private key stays in the Next.js
deployment.

Generate a 3072-bit pair with OpenSSL:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out rest-api-private.pem
openssl pkey -in rest-api-private.pem -pubout -out rest-api-public.pem
```

Store the PEM values as secrets. Do not commit either generated file. A hosted
Convex deployment cannot fetch JWKS from `localhost`; use a public
non-production deployment or a trusted tunnel for an end-to-end local test.

## Signing-key rotation

1. Generate a new pair and choose a new key ID.
2. Keep the current public key in `REST_API_JWT_PREVIOUS_PUBLIC_KEY` and its ID
   in `REST_API_JWT_PREVIOUS_KEY_ID`.
3. Deploy the new active private key, public key, and key ID.
4. Confirm that the JWKS endpoint exposes both public keys and that
   `/api/v1/me` succeeds.
5. Wait longer than the 30-second token lifetime and the five-minute JWKS cache
   window.
6. Remove the previous public key and ID, then deploy again.

Never place a private key in Convex, the browser bundle, logs, documentation,
or a support ticket.

## Provider-owned data

Sales, employees, and scheduled shifts are read-only API resources. Their GET
operations read the organization-scoped Convex tables and never call OnlinePOS,
Workfeed, or another provider. Sales ranges accept at most 31 days and return
money in integer minor units. Date ranges include `from` and exclude `to`.

`POST /api/v1/employees/sync` requires `integrations.manage`, all-location
access, and an `Idempotency-Key`. It queues a Workfeed employee refresh; a
successful employee snapshot also queues the scheduled-shift refresh. The
command does not return or persist a raw provider payload.

## API-key incidents

Revoke a compromised organization key in **Administration → API**. Convex
denies the policy before Better Auth disables the credential, so a partial
revocation still fails closed. If the UI reports that the credential could not
be disabled, keep the policy revoked and repair the Better Auth record before
closing the incident.

Use the response's `X-Request-Id`, UTC timestamp, method, path, and status for
support correlation. Never ask a client to send its key secret.

## Release policy

The deployed OpenAPI document at `/api/v1/openapi.json` is the public source of
truth. `/api/v1/docs` renders that document as an interactive Scalar reference.
General authentication, pagination, idempotency, error, limit, compatibility,
and support guidance belongs in the OpenAPI document.

Changes within `/api/v1` are additive. Breaking changes use a new major URL.
Before removing a published operation, give at least 12 months' notice and add
`Deprecation`, `Sunset`, and documentation `Link` headers.

Roll out a new domain in this order:

1. Preserve its existing Convex authorization and business rules in a named
   REST-safe function.
2. Add strict public input and response schemas.
3. Add an explicit Next.js route and operation descriptor.
4. Confirm that every route and response appears in OpenAPI.
5. Exercise a complete paginated sync, guarded CRUD, foreign references,
   location restrictions, retries, and revocation in non-production.
6. Pilot with one organization before general availability.
