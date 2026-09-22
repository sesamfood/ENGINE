Before/after screenshots

116 page pairs. Each page has one final after screenshot, taken after all code changes.

Captured with Playwright at a 1440 × 1000 viewport using full-page images. Before: commit bbd84e2. After: [e4bea03](https://github.com/sesamfood/ENGINE/commit/e4bea036512974ac7811fc46372e051be5c07775). Images are stored on this branch for PR review.

92 pairs are pixel-identical. 19 have only raster differences of at most 4/255 per color channel. 5 have larger differences; see the comparison notes below.

All 74 authenticated pages matched geometry and computed styles in the settled comparison, apart from the rotation of the Count loading icon. Final screenshots were also checked for pixel differences. Live data and timestamps can change between captures.

Coverage limits:

- Onboarding redirects this existing organization member to /transfers; no onboarding form capture.
- There are no pending invitations; no valid invitation page capture.
- There are no dashboard sharing links; the shared route shows its unavailable-link state.
- Disabled features are shown in their current unavailable state. No features were enabled and no sample records were created for capture.
- Appearance shows an existing next/image error because the stored logo hostname is not allowed. Waste report shows an existing Convex multiple-pagination error. Both fail in the original and updated app, so their normal contents could not be compared.
- /, /dashboard and /help/[feature] are redirects; their destination pages are included.
- Receipt detail shows an already received transfer; no pending receipt was available. Dynamic detail pages use one existing record each. Screenshots cover the default page view, not every dialog, viewport or permission state.

[Coverage details](./coverage.json) · [Pixel comparisons](./pixels.json)

| Page | Before | After | State |
| --- | --- | --- | --- |
| /administration | [Before](./before/administration.png) | [After](./after/administration.png) | — |
| /administration/api | [Before](./before/administration--api.png) | [After](./after/administration--api.png) | — |
| /administration/appearance | [Before](./before/administration--appearance.png) | [After](./after/administration--appearance.png) | Existing error state |
| /administration/categories | [Before](./before/administration--categories.png) | [After](./after/administration--categories.png) | — |
| /administration/count | [Before](./before/administration--count.png) | [After](./after/administration--count.png) | — |
| /administration/dashboard | [Before](./before/administration--dashboard.png) | [After](./after/administration--dashboard.png) | — |
| /administration/date-labels | [Before](./before/administration--date-labels.png) | [After](./after/administration--date-labels.png) | — |
| /administration/expenses | [Before](./before/administration--expenses.png) | [After](./after/administration--expenses.png) | — |
| /administration/feedback | [Before](./before/administration--feedback.png) | [After](./after/administration--feedback.png) | — |
| /administration/goods-receipts | [Before](./before/administration--goods-receipts.png) | [After](./after/administration--goods-receipts.png) | — |
| /administration/integrations | [Before](./before/administration--integrations.png) | [After](./after/administration--integrations.png) | — |
| /administration/integrations/economic | [Before](./before/administration--integrations--economic.png) | [After](./after/administration--integrations--economic.png) | — |
| /administration/integrations/onlinepos | [Before](./before/administration--integrations--onlinepos.png) | [After](./after/administration--integrations--onlinepos.png) | — |
| /administration/integrations/wolt | [Before](./before/administration--integrations--wolt.png) | [After](./after/administration--integrations--wolt.png) | — |
| /administration/integrations/workfeed | [Before](./before/administration--integrations--workfeed.png) | [After](./after/administration--integrations--workfeed.png) | — |
| /administration/invoices | [Before](./before/administration--invoices.png) | [After](./after/administration--invoices.png) | — |
| /administration/kiosk | [Before](./before/administration--kiosk.png) | [After](./after/administration--kiosk.png) | — |
| /administration/locations | [Before](./before/administration--locations.png) | [After](./after/administration--locations.png) | — |
| /administration/menus | [Before](./before/administration--menus.png) | [After](./after/administration--menus.png) | — |
| /administration/metrics | [Before](./before/administration--metrics.png) | [After](./after/administration--metrics.png) | — |
| /administration/ordering | [Before](./before/administration--ordering.png) | [After](./after/administration--ordering.png) | — |
| /administration/own-checks | [Before](./before/administration--own-checks.png) | [After](./after/administration--own-checks.png) | — |
| /administration/products | [Before](./before/administration--products.png) | [After](./after/administration--products.png) | — |
| /administration/products/[productId] | [Before](./before/product--detail.png) | [After](./after/product--detail.png) | One existing record |
| /administration/products/new | [Before](./before/administration--products--new.png) | [After](./after/administration--products--new.png) | — |
| /administration/schedule | [Before](./before/administration--schedule.png) | [After](./after/administration--schedule.png) | — |
| /administration/sidebar | [Before](./before/administration--sidebar.png) | [After](./after/administration--sidebar.png) | — |
| /administration/staff-food | [Before](./before/administration--staff-food.png) | [After](./after/administration--staff-food.png) | — |
| /administration/transfers | [Before](./before/administration--transfers.png) | [After](./after/administration--transfers.png) | — |
| /administration/units | [Before](./before/administration--units.png) | [After](./after/administration--units.png) | — |
| /administration/users | [Before](./before/administration--users.png) | [After](./after/administration--users.png) | — |
| /administration/users/roles | [Before](./before/administration--users--roles.png) | [After](./after/administration--users--roles.png) | — |
| /administration/waste | [Before](./before/administration--waste.png) | [After](./after/administration--waste.png) | — |
| /administration/wolt-orders | [Before](./before/administration--wolt-orders.png) | [After](./after/administration--wolt-orders.png) | Feature unavailable for this account |
| /count | [Before](./before/count.png) | [After](./after/count.png) | — |
| /count/stock | [Before](./before/count--stock.png) | [After](./after/count--stock.png) | — |
| /dashboard/[dashboardId] | [Before](./before/dashboard--detail.png) | [After](./after/dashboard--detail.png) | One existing record |
| /dashboard/monthly | [Before](./before/dashboard--monthly.png) | [After](./after/dashboard--monthly.png) | Existing error state |
| /date-labels | [Before](./before/date-labels.png) | [After](./after/date-labels.png) | — |
| /employees | [Before](./before/employees.png) | [After](./after/employees.png) | — |
| /employees/directory | [Before](./before/employees--directory.png) | [After](./after/employees--directory.png) | — |
| /expenses | [Before](./before/expenses.png) | [After](./after/expenses.png) | — |
| /expenses/history | [Before](./before/expenses--history.png) | [After](./after/expenses--history.png) | — |
| /forgot-password | [Before](./before/forgot-password.png) | [After](./after/forgot-password.png) | — |
| /goods-receipts | [Before](./before/goods-receipts.png) | [After](./after/goods-receipts.png) | — |
| /goods-receipts/[transferId] | [Before](./before/receipt--detail.png) | [After](./after/receipt--detail.png) | Transfer already received |
| /goods-receipts/manual | [Before](./before/goods-receipts--manual.png) | [After](./after/goods-receipts--manual.png) | — |
| /help | [Before](./before/help.png) | [After](./after/help.png) | — |
| /help/adgang-og-profil/brugere-og-roller | [Before](./before/help--adgang-og-profil--brugere-og-roller.png) | [After](./after/help--adgang-og-profil--brugere-og-roller.png) | — |
| /help/adgang-og-profil/kiosk | [Before](./before/help--adgang-og-profil--kiosk.png) | [After](./after/help--adgang-og-profil--kiosk.png) | — |
| /help/adgang-og-profil/overblik | [Before](./before/help--adgang-og-profil--overblik.png) | [After](./after/help--adgang-og-profil--overblik.png) | — |
| /help/adgang-og-profil/profil-og-login | [Before](./before/help--adgang-og-profil--profil-og-login.png) | [After](./after/help--adgang-og-profil--profil-og-login.png) | — |
| /help/administration/api | [Before](./before/help--administration--api.png) | [After](./after/help--administration--api.png) | — |
| /help/administration/lokationer | [Before](./before/help--administration--lokationer.png) | [After](./after/help--administration--lokationer.png) | — |
| /help/administration/overblik | [Before](./before/help--administration--overblik.png) | [After](./after/help--administration--overblik.png) | — |
| /help/administration/produkter | [Before](./before/help--administration--produkter.png) | [After](./after/help--administration--produkter.png) | — |
| /help/administration/udseende-og-sidemenu | [Before](./before/help--administration--udseende-og-sidemenu.png) | [After](./after/help--administration--udseende-og-sidemenu.png) | — |
| /help/bestilling/forslag | [Before](./before/help--bestilling--forslag.png) | [After](./after/help--bestilling--forslag.png) | — |
| /help/bestilling/overblik | [Before](./before/help--bestilling--overblik.png) | [After](./after/help--bestilling--overblik.png) | — |
| /help/count/lager-og-rapport | [Before](./before/help--count--lager-og-rapport.png) | [After](./after/help--count--lager-og-rapport.png) | — |
| /help/count/overblik | [Before](./before/help--count--overblik.png) | [After](./after/help--count--overblik.png) | — |
| /help/count/udfoer | [Before](./before/help--count--udfoer.png) | [After](./after/help--count--udfoer.png) | — |
| /help/dashboard/datapunkter | [Before](./before/help--dashboard--datapunkter.png) | [After](./after/help--dashboard--datapunkter.png) | — |
| /help/dashboard/deling | [Before](./before/help--dashboard--deling.png) | [After](./after/help--dashboard--deling.png) | — |
| /help/dashboard/overblik | [Before](./before/help--dashboard--overblik.png) | [After](./after/help--dashboard--overblik.png) | — |
| /help/dashboard/widgets | [Before](./before/help--dashboard--widgets.png) | [After](./after/help--dashboard--widgets.png) | — |
| /help/egenkontrol/dokumentation | [Before](./before/help--egenkontrol--dokumentation.png) | [After](./after/help--egenkontrol--dokumentation.png) | — |
| /help/egenkontrol/opfoelgning | [Before](./before/help--egenkontrol--opfoelgning.png) | [After](./after/help--egenkontrol--opfoelgning.png) | — |
| /help/egenkontrol/overblik | [Before](./before/help--egenkontrol--overblik.png) | [After](./after/help--egenkontrol--overblik.png) | — |
| /help/egenkontrol/udfoer | [Before](./before/help--egenkontrol--udfoer.png) | [After](./after/help--egenkontrol--udfoer.png) | — |
| /help/integrationer/onlinepos | [Before](./before/help--integrationer--onlinepos.png) | [After](./after/help--integrationer--onlinepos.png) | — |
| /help/integrationer/onlinepos/forbindelser | [Before](./before/help--integrationer--onlinepos--forbindelser.png) | [After](./after/help--integrationer--onlinepos--forbindelser.png) | — |
| /help/integrationer/onlinepos/lager | [Before](./before/help--integrationer--onlinepos--lager.png) | [After](./after/help--integrationer--onlinepos--lager.png) | — |
| /help/integrationer/onlinepos/produktkoblinger | [Before](./before/help--integrationer--onlinepos--produktkoblinger.png) | [After](./after/help--integrationer--onlinepos--produktkoblinger.png) | — |
| /help/integrationer/onlinepos/salg | [Before](./before/help--integrationer--onlinepos--salg.png) | [After](./after/help--integrationer--onlinepos--salg.png) | — |
| /help/integrationer/onlinepos/vedligeholdelse | [Before](./before/help--integrationer--onlinepos--vedligeholdelse.png) | [After](./after/help--integrationer--onlinepos--vedligeholdelse.png) | — |
| /help/integrationer/overblik | [Before](./before/help--integrationer--overblik.png) | [After](./after/help--integrationer--overblik.png) | — |
| /help/integrationer/wolt | [Before](./before/help--integrationer--wolt.png) | [After](./after/help--integrationer--wolt.png) | Feature unavailable for this account |
| /help/integrationer/wolt/ordrer | [Before](./before/help--integrationer--wolt--ordrer.png) | [After](./after/help--integrationer--wolt--ordrer.png) | Feature unavailable for this account |
| /help/integrationer/workfeed | [Before](./before/help--integrationer--workfeed.png) | [After](./after/help--integrationer--workfeed.png) | — |
| /help/medarbejdere/overblik | [Before](./before/help--medarbejdere--overblik.png) | [After](./after/help--medarbejdere--overblik.png) | — |
| /help/medarbejdere/vagtplan | [Before](./before/help--medarbejdere--vagtplan.png) | [After](./after/help--medarbejdere--vagtplan.png) | — |
| /help/staff-food/overblik | [Before](./before/help--staff-food--overblik.png) | [After](./after/help--staff-food--overblik.png) | — |
| /help/staff-food/registrering | [Before](./before/help--staff-food--registrering.png) | [After](./after/help--staff-food--registrering.png) | — |
| /help/transfer/historik | [Before](./before/help--transfer--historik.png) | [After](./after/help--transfer--historik.png) | — |
| /help/transfer/opret | [Before](./before/help--transfer--opret.png) | [After](./after/help--transfer--opret.png) | — |
| /help/transfer/overblik | [Before](./before/help--transfer--overblik.png) | [After](./after/help--transfer--overblik.png) | — |
| /help/varemodtagelse/manuel | [Before](./before/help--varemodtagelse--manuel.png) | [After](./after/help--varemodtagelse--manuel.png) | — |
| /help/varemodtagelse/overblik | [Before](./before/help--varemodtagelse--overblik.png) | [After](./after/help--varemodtagelse--overblik.png) | — |
| /help/varemodtagelse/transfer | [Before](./before/help--varemodtagelse--transfer.png) | [After](./after/help--varemodtagelse--transfer.png) | — |
| /help/waste/daarlig-levering | [Before](./before/help--waste--daarlig-levering.png) | [After](./after/help--waste--daarlig-levering.png) | — |
| /help/waste/overblik | [Before](./before/help--waste--overblik.png) | [After](./after/help--waste--overblik.png) | — |
| /help/waste/rapport | [Before](./before/help--waste--rapport.png) | [After](./after/help--waste--rapport.png) | — |
| /help/waste/registrering | [Before](./before/help--waste--registrering.png) | [After](./after/help--waste--registrering.png) | — |
| /invoices | [Before](./before/invoices.png) | [After](./after/invoices.png) | — |
| /invoices/history | [Before](./before/invoices--history.png) | [After](./after/invoices--history.png) | — |
| /login | [Before](./before/login.png) | [After](./after/login.png) | — |
| /ordering | [Before](./before/ordering.png) | [After](./after/ordering.png) | — |
| /own-checks | [Before](./before/own-checks.png) | [After](./after/own-checks.png) | — |
| /own-checks/check/[templateId] | [Before](./before/check--detail.png) | [After](./after/check--detail.png) | One existing record |
| /own-checks/documentation | [Before](./before/own-checks--documentation.png) | [After](./after/own-checks--documentation.png) | — |
| /own-checks/guidance | [Before](./before/own-checks--guidance.png) | [After](./after/own-checks--guidance.png) | — |
| /own-checks/overview | [Before](./before/own-checks--overview.png) | [After](./after/own-checks--overview.png) | — |
| /profile | [Before](./before/profile.png) | [After](./after/profile.png) | — |
| /reset-password | [Before](./before/reset-password.png) | [After](./after/reset-password.png) | — |
| /share/[token] — unavailable link | [Before](./before/share--visual-check-unavailable.png) | [After](./after/share--visual-check-unavailable.png) | No existing sharing link |
| /signup | [Before](./before/signup.png) | [After](./after/signup.png) | — |
| /staff-food | [Before](./before/staff-food.png) | [After](./after/staff-food.png) | — |
| /transfers | [Before](./before/transfers.png) | [After](./after/transfers.png) | — |
| /transfers/history | [Before](./before/transfers--history.png) | [After](./after/transfers--history.png) | — |
| /verify-email | [Before](./before/verify-email.png) | [After](./after/verify-email.png) | — |
| /waste | [Before](./before/waste.png) | [After](./after/waste.png) | — |
| /waste/bad-delivery | [Before](./before/waste--bad-delivery.png) | [After](./after/waste--bad-delivery.png) | — |
| /waste/report | [Before](./before/waste--report.png) | [After](./after/waste--report.png) | Existing error state |
| /wolt-orders | [Before](./before/wolt-orders.png) | [After](./after/wolt-orders.png) | Feature unavailable for this account |
| 404 page | [Before](./before/not-found.png) | [After](./after/not-found.png) | — |

Comparison notes

- goods-receipts--manual.png: Only the default timestamp changed between captures.
- invoices.png: Only the default timestamp changed between captures.
- transfers.png: Only the default timestamp changed between captures.
- check--detail.png: Only the default timestamp changed between captures.
- dashboard--detail.png: Small chart raster differences (maximum channel delta 12/255); geometry and computed styles match.
