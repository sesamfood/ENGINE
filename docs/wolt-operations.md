# Operate the Wolt integration

Use this guide to configure, verify, monitor, and disable the read-only Wolt integration. Complete the test-deployment checks before you add production credentials.

## Configure a deployment

Set these values in the target Convex deployment. Use separate values for test and production.

- `WOLT_ENVIRONMENT`: `development` or `production`.
- `WOLT_CLIENT_ID`: the Wolt integration client ID.
- `WOLT_CLIENT_SECRET`: the Wolt integration client secret.
- `WOLT_WEBHOOK_SECRET`: the webhook signing secret. Use at least 16 bytes.
- `WOLT_WIO_API_KEY`: the API key that protects the WIO endpoint. Use at least 32 characters.
- `WOLT_WIO_REDIRECT_URIS`: a comma-separated allowlist of exact WIO `redirect_url` values. Add no more than 10 URLs.
- `WOLT_ENCRYPTION_KEY`: a base64url-encoded 256-bit key for tokens and authorization codes.
- `WOLT_OAUTH_REDIRECT_URI`: the exact SSIO callback URL.
- `SITE_URL`: the application origin used after the SSIO callback.

Generate an encryption key once. Store it in the deployment secret manager.

```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

Do not rotate `WOLT_ENCRYPTION_KEY` until all stored Wolt credentials have been replaced. The application cannot decrypt credentials that use an old key.

## Register the HTTP routes

Register these routes on the Convex site URL for the target deployment:

- Webhook: `POST /wolt/webhook`
- SSIO callback: `GET /wolt/oauth/callback`
- WIO onboarding: `POST /wolt/onboarding`

Wolt must send `WOLT-SIGNATURE` to the webhook. Wolt must send `X-API-Key` to the WIO endpoint.

## Prove the test contract

Use a test client, one SSIO venue, and one WIO venue. Record the result outside source control.

1. Complete SSIO for one test lokation.
2. Complete WIO for one mapped `partner_venue_id`.
3. Receive a signed order event and confirm that the webhook returns `200` after the inbox write.
4. Confirm that the worker fetches `GET /v2/orders/{orderId}` and that the Wolt order appears at `/wolt-orders`.
5. Confirm that a modified body, a wrong secret, malformed hex, a missing signature, and an oversized body are rejected.
6. Confirm that a duplicate event creates one inbox row.
7. Exercise delivered, canceled, out-of-order, and preorder events.
8. Exercise access-token refresh and a lost refresh-token commit.
9. Confirm with Wolt whether replay, refund details, Menu API access, and rate guidance are available for these credentials.

The current revenue rule uses the delivered basket total after discounts. It does not subtract a refund unless Wolt adds an auditable refund amount to the read response.

## Monitor a connected venue

Use **Administration > Integrationer > Wolt** to inspect each lokation. The panel shows the last webhook, the last successful fetch, the queue, dead letters, token expiry, and the last bounded error.

Configure deployment alerts for these conditions:

- repeated webhook signature failures;
- a signed event for an unknown venue;
- the oldest pending event exceeds the agreed freshness target;
- any dead-letter event;
- repeated `401` responses, refresh-lease failures, or `reauthorizationRequired`;
- no webhook or successful fetch for a connected venue during its expected activity window.

Route every alert to a named integration owner and a backup owner. Do not include request bodies, tokens, authorization codes, or provider responses in an alert.

## Recover a failed venue

For a correctable order-fetch failure, fix the cause and select **Prøv fejlede events igen**. The action retries at most 100 dead letters for the lokation at a time.

For `reauthorizationRequired`, start SSIO again or repeat WIO. A lost rotating refresh token cannot be recovered from Convex.

For an unknown WIO `partner_venue_id`, save the exact partner venue mapping before the one-hour authorization code expires. The integration adopts the quarantined onboarding event after the mapping is saved.

## Disable or roll back

To stop one venue, select **Afbryd forbindelse**. The action clears its credentials and stops new order fetches. Orders, items, events, and daily totals remain available for their retention period.

To roll back the application:

1. Disconnect the active Wolt venues.
2. Deploy the last application version without the Wolt routes, source choices, and scheduled jobs.
3. Keep the isolated Wolt tables for diagnosis and a later resume.
4. Do not delete generic sales rows or change old dashboard widget defaults.

Detailed Wolt orders, items, and events expire after 400 days. Daily Wolt totals remain indefinitely. Disabled connection metadata expires after the same 400-day window.

## Production release gate

Do not enable production venues until all of these conditions are true:

- Wolt accepts the relevant integration test cases.
- The test evidence above is recorded.
- Alert delivery reaches both owners.
- The rollback procedure has been rehearsed.
- A PII audit confirms that consumer fields and raw payloads are absent.
- One internal production organization remains current through the agreed observation window.

