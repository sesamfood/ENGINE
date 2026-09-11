# Set up the e-conomic integration

Connect one chain agreement by default, then map its department or dimension values to the app's locations. Separate agreements are also supported.

## Prepare the deployment

1. Create an app in an [e-conomic developer agreement](https://www.e-conomic.com/developer/connect). Keep its `AppSecretToken` on the backend.
2. Generate a random, 32-byte encryption key encoded as unpadded base64url. Store the key in your secret manager.

   ```bash
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
   ```

3. Set both variables on the intended Convex deployment. These commands prompt for the values.

   ```bash
   bunx convex env set ECONOMIC_APP_SECRET_TOKEN
   bunx convex env set ECONOMIC_ENCRYPTION_KEY
   ```

   Use `--prod` only when configuring production. Frontend `.env.local` values do not configure the Convex backend. Keep the encryption key stable: changing it makes existing encrypted grants unreadable, so those agreements must be connected again.

4. Have an accounting user open the app's Installation URL while signed into the intended accounting agreement. Copy the resulting `AgreementGrantToken` into **Administration → Integrationer → e-conomic**. Repeat this grant step for each additional agreement. The app and accounting user need access to accounts, booked entries, accounting periods, and any budget or dimension data selected in the setup. [e-conomic's connection guide](https://www.e-conomic.com/developer/connect) describes the grant process.

The backend encrypts agreement grants with AES-GCM. Grants are never returned by settings queries. Managing connections requires `integrations.manage` and access to all locations.

## Map locations and accounts

For one shared agreement, select the dimension that represents the locations, then map each dimension value to one **Lokation**. A provider department remains an **Afdeling**. The integration expands e-conomic distributions using their percentages. It never assigns an unallocated amount automatically. Missing mappings make the affected financial category unavailable.

For separate agreements, add each agreement and select **Hele aftalen til én lokation**. This mode works without the dimensions module. Each location can belong to one agreement, and each whole agreement maps to exactly one location. Multiple agreements may also use dimensions.

Map profit-and-loss accounts to net sales, COGS, labour, rent, utilities, or other operating costs. Each account has one category. Location currency must match the agreement's base currency; the report does not convert currencies.

Confirm **Vareforbruget er lagerreguleret og godkendt** only after checking stock adjustments and Transfer treatment in the mapped COGS accounts. Without that confirmation, use a manually approved COGS amount in the monthly report. Even with confirmation, ledger COGS remains provisional until that month's amount is approved.

## Choose and approve the monthly figures

Select **Manuelt** for locally entered budgets, or **e-conomic** for live budget figures on the mapped accounts. e-conomic budgets use the same location allocation as actuals. Enter provider budgets within one calendar month. Figures spanning months remain unavailable; the integration does not invent a monthly split.

In the monthly report, select one location to approve reconciled e-conomic actuals or budgets. Supply a source reference. Approval refetches the figures and checks their fingerprints before saving. Changed amounts, source versions, or configuration invalidate the old approval. The database stores approval fingerprints and audit history, without a copy of the provider figures. e-conomic budgets require approval before use.

Use **Godkend månedstal** for approved stock-adjusted COGS and recorded Waste. Waste is already part of COGS and is not deducted again in EBITDA. POS net revenue supplies the sales denominator; ledger sales accounts supply the e-conomic sales budget. Approved ledger payroll replaces the Workfeed labour estimate for each location and month.

Financial views require `dashboard.view`, `dashboard.viewFinancials`, detailed data access, and access to the selected locations. Approval and manual figures also require `dashboard.manageBudgets`. Financial widgets cannot be publicly shared.

## Read and verify the results

Reports read e-conomic on opening or refreshing. Provider responses exist only during the backend read; computed figures stay in the current view. There is no persisted accounting cache, scheduled accounting sync, or stored widget summary. Existing POS and Workfeed data remain local. Financial viewers can refresh e-conomic without permission to run those integrations' sync jobs.

Actuals cover completed days, the previous month, and year to date. Budgets cover the full selected month. Financial widgets support the current calendar month or a complete custom month. Other ranges show an explicit unavailable state.

The reader uses cursor pagination and stops on invalid data, changed duplicate rows, missing pages, or resource limits. Per agreement, limits are 150 seconds, 750 requests, 30,000 combined rows, 12 MB total response data, and 100,000 expanded allocation parts. A page may contain at most 1,000 rows and 2 MB. Agreement reads run sequentially within a shared report deadline. A failed agreement produces unavailable figures, not a successful partial total.

Before accepting the KPI issues as reconciled, compare real monthly reports with finance-approved source reports. Check VAT and refunds in POS net sales, debit and credit signs, dimension distributions, unassigned costs, stock adjustments, Transfers, payroll accruals, monthly budgets, and both agreement setups. Public demo API checks do not validate a real tenant's accounting.

Historical Google guest scores remain a dependency. The existing Google Maps widget supplies a current rating, without the review history needed for monthly comparisons. The monthly report keeps that row unavailable until the required access and permitted historical reporting are resolved.

## Code generation behavior

With the installed Convex CLI 1.45.0, `bunx convex codegen` uploads bundled functions to the selected backend for analysis and type generation. It calls `start_push` but does not call `finish_push`, so it does not replace the running deployment. The message `Uploading functions to Convex...` is expected; this command is not local-only. See `node_modules/convex/src/cli/codegen.ts` and `node_modules/convex/src/cli/lib/components.ts` when upgrading the CLI.
