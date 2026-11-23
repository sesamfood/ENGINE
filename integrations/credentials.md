# Organization credentials

Each organization supplies its own provider credentials. e-conomic credentials and new Wolt credentials, OAuth codes, and tokens use the `v3` storage format. Convex generates a private key per organization in `integrationSecrets`; no application environment variable supplies that key. Public settings queries return connection metadata and whether secrets exist, never their values or the organization key.

The key and encrypted values live in the same Convex database. Access control and Convex storage encryption protect them. This arrangement does not protect secrets against someone who can read the entire database.

## Existing deployments

Keep the existing `BETTER_AUTH_SECRET` value unchanged while old Wolt credentials migrate. Legacy credential decryption reads it, and the application's authentication system may also need it. `ECONOMIC_ENCRYPTION_KEY` is no longer read; organizations reconnect e-conomic with new keys.

Wolt replaces stored `v2` client and webhook secrets when the integration uses them, and writes `v3` access and refresh tokens on the next token refresh or reconnection. Existing OAuth codes keep their old format until consumed or expired. Disabled integrations keep their stored credentials until enabled again.

Do not remove the legacy encryption value until all credentials that must remain usable have migrated, including disabled connections. If the old encryption value is already unavailable, the organization must enter its credentials again and reconnect affected Wolt locations. New organizations and new connections do not need it.

`SITE_URL` and Convex's own site URL remain ordinary application routing settings for OAuth callbacks.
