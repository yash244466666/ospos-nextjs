# 00 — Target repository inventory and parity status

Analysis-only inventory of `/home/yash/Desktop/yash/ospos-nextjs` against upstream
`/home/yash/ospos` at commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`.

This report was produced by the main analysis after the originally assigned inventory
agent hit a concurrency rate limit. It is deliberately conservative: where a module's
status was not verified line-by-line, it says `UNVERIFIED` rather than guessing. The
per-module appendices (`01`–`13`) are authoritative for behavior.

---

## 1. Repository shape

| Item | Count |
|---|---|
| TypeScript/TSX files under `src` | 274 |
| TypeScript/TSX lines under `src` | 16,956 |
| Page routes (`page.tsx`) | 54 |
| API route handlers (`route.ts`) | 22 |
| Server-action files (`actions.ts`) | 22 |
| Exported server actions | ~200 |
| Drizzle schema files | 13 + MySQL mirror |
| Drizzle migrations | SQLite 3, MySQL 2 |
| Unit test files | 4 (`rbac`, `items/repository`, `sale/sale-lib`, `tax`) |
| Playwright specs | 23 |
| Locale directories | 47 |
| Locale message files | 1 per locale (`common.json`) |
| Locale keys | `en`: 0 (empty `{}`); `bn`: 57; all other locales: 0 |
| Actual SQLite databases | `sqlite.db`, `ospos.db` (stale relative to schema/seed) |

The target is a scaffold with broad page coverage and shallow business logic, not a
faithful port. The most reliable statement is: **pages and action names exist; the
underlying contracts do not match upstream.**

---

## 2. Page route inventory

Route groups `(auth)` and `(secure)` are transparent. Dynamic segments in brackets.

```
/                                   (redirects into secure shell)
/login
/change-password
/home
/office
/config
/items
/items/new
/items/[id]
/items/[id]/inventory
/items/csv-import
/items/generate-barcodes
/item_kits
/item_kits/new/[id]
/attributes
/attributes/new/[id]
/customers
/customers/new/[id]
/suppliers
/suppliers/new/[id]
/employees
/employees/new/[id]
/giftcards
/giftcards/new/[id]
/rewards
/rewards/new/[id]
/dinner_tables
/dinner_tables/new/[id]
/expenses
/expenses/new/[id]
/expenses_categories
/expenses_categories/new/[id]
/cashups
/cashups/new/[id]
/messages
/taxes
/taxes/new/[id]
/tax_categories
/tax_categories/new/[id]
/tax_codes
/tax_codes/new/[id]
/tax_jurisdictions
/tax_jurisdictions/new/[id]
/sales/register
/sales/manage
/sales/suspended
/sales/receipt/[id]
/sales/invoice/[id]
/receivings/register
/receivings/manage
/receivings/receipt/[id]
/reports
/reports/[key]
/no_access/[module]/[submodule]
```

### Missing upstream page surfaces (confirmed)

- `/sales/edit/[id]` — edit-sale form (`app/Controllers/Sales.php:1469-1522`).
- `/sales/quote/[id]` and `/sales/work_order/[id]` — HTML document pages; only PDF
  route files exist. `completeSaleAction` redirects to these non-existent pages
  (`src/app/(secure)/sales/actions.ts:204-206`).
- `/receivings/edit/[id]` — receiving edit form (`Receivings.php:235-272`); only
  `receivings/manage` exists.
- `/messages/view/[person_id]` — per-person SMS form (`Messages.php:33-44`).
- `/items/[id]/count-details` — count-details modal/view (`Items.php:531-560`).
- `/items/bulk-edit` — bulk edit UI (`Items.php:661-764`); the action exists but no
  page.
- `/customers/csv-import` — customer CSV import (`Customers.php:395-493`); absent.
- `/reports` input pages — every report currently executes immediately; upstream
  renders a filter form first (`date_input`, `specific_*_input`, etc.).
- `/no_access/[module]` without a submodule — upstream supports both one and two
  segments (`Routes.php:16-17`); target requires both.

---

## 3. API route inventory

Actual paths (the `src/app/api` prefix maps to `/api`):

```
/api/auth/[...nextauth]
/api/customers/suggest
/api/giftcards/suggest
/api/items/suggest
/api/items/category-suggest
/api/items/kits-suggest
/api/items/location-suggest
/api/items/low-sell-suggest
/api/items/csv-import
/api/items/csv-template
/api/items/barcodes-pdf
/api/items/pic-thumb/[file]
/api/migrate
/api/reports/payment-type
/api/reports/sale-type-options
/api/reports/[key]/detailed-sales-row
/api/reports/[key]/detailed-receivings-row
/reports/[key]/export                        (route inside the secure group)
```

Missing AJAX endpoints required by upstream workflows (non-exhaustive):
`sales/row`, `sales/search`, `sales/itemSearch`, `sales/sendPdf`, `sales/sendReceipt`,
`sales/checkInvoiceNumber`, `sales/changeItemNumber/Name/Description`;
`receivings/itemSearch`, `receivings/stockItemSearch`, `receivings/edit`,
`receivings/delete`, `receivings/save`; `items/countDetails`,
`items/bulkEdit`, `items/generateCsvFile`, `items/attributes`,
`items/saveInventory`; `customers/csv`, `customers/csvImport`;
`employees/checkUsername`; `taxes/ajax_*`; `config/stockLocations`,
`config/dinnerTables`, `config/customerRewards`; `reports/get_*_row`;
`sales/salesKeyboardHelp`.

---

## 4. Server-action inventory (by module)

The following files export actions. Names are listed in the source; the table is a
map, not a parity claim.

| Action file | Exported actions |
|---|---|
| `(secure)/attributes/actions.ts` | `saveAttributeAction`, `deleteAttributeAction`, `searchAttributesAction`, `getAttributeRowAction`, `getAttributeValuesAction`, `saveAttributeValueAction`, `deleteAttributeValueAction`, `getAttributesByItemAction` |
| `(secure)/cashups/actions.ts` | `saveCashupAction`, `deleteCashupAction`, `searchCashupsAction`, `getCashupRowAction`, `getCashupTotalRowsAction` |
| `(secure)/change-password/actions.ts` | `changePasswordAction` |
| `(secure)/config/actions.ts` | `saveConfigTabAction`, `testEmailAction`, `saveInfoAction`, `saveGeneralAction`, `saveLocaleAction`, `saveEmailAction`, `saveMessageAction`, `saveMailchimpAction`, `saveTaxAction`, `saveLocationsAction`, `saveTablesAction`, `saveRewardsAction`, `saveBarcodeAction`, `saveReceiptAction`, `saveInvoiceAction`, `saveShortcutsAction`, `removeLogoAction`, `checkMailchimpApiKeyAction`, `checkNumberLocaleAction` |
| `(secure)/customers/actions.ts` | `saveCustomerAction`, `deleteCustomerAction`, `searchCustomersAction`, `getCustomerRowAction`, `suggestCustomersAction`, `checkEmailAction`, `checkAccountNumberAction` |
| `(secure)/dinner_tables/actions.ts` | `saveDinnerTableAction`, `deleteDinnerTableAction`, `searchDinnerTablesAction`, `getDinnerTableRowAction`, `isTableOccupiedAction` |
| `(secure)/employees/actions.ts` | `saveEmployeeAction`, `deleteEmployeeAction`, `searchEmployeesAction`, `getEmployeeRowAction`, `checkUsernameAction`, `changePasswordAction` |
| `(secure)/expenses/actions.ts` | `saveExpenseAction`, `deleteExpenseAction`, `listExpensesAction`, `searchExpensesAction`, `getExpenseRowAction`, `getExpenseTotalRowsAction` |
| `(secure)/expenses_categories/actions.ts` | `saveCategoryAction`, `deleteCategoryAction`, `searchCategoriesAction`, `getCategoryRowAction`, `getCategoryTotalRowsAction` |
| `(secure)/giftcards/actions.ts` | `saveGiftcardAction`, `deleteGiftcardAction`, `searchGiftcardsAction`, `suggestGiftcardsAction`, `getGiftcardRowAction`, `getGiftcardTotalRowsAction` |
| `(secure)/home/actions.ts` | `changePasswordAction`, `getHomeStatsAction` |
| `(secure)/item_kits/actions.ts` | `saveItemKitAction`, `deleteItemKitAction`, `listItemsForSelectAction`, `searchItemKitsAction`, `getItemKitRowAction`, `getItemKitTotalRowsAction` |
| `(secure)/items/actions.ts` | `saveItemAction`, `deleteItemAction`, `adjustInventoryAction`, `bulkUpdateAction`, `searchItemsAction`, `getItemRowAction`, `getItemByNumberOrIdAction`, `getItemInfoAction`, `getInventoryAction`, `suggestItemsAction`, `suggestLowSellAction`, `suggestKitsAction`, `suggestCategoryAction`, `suggestLocationAction`, `checkItemNumberAction`, `changeItemNumberAction`, `changeItemNameAction`, `changeItemDescriptionAction`, `undeleteItemAction`, `getAttributesAction`, `saveAttributesAction`, `generateBarcodesAction`, `getStockLocationsAction`, `getTaxCategoriesAction`, `getItemTotalRowsAction` |
| `(secure)/messages/actions.ts` | `sendSmsAction`, `getMessageHistoryAction` (stub returning `[]`) |
| `(secure)/receivings/actions.ts` | `getReceivingCartAction`, `addItemAction`, `editItemAction`, `deleteItemAction`, `selectSupplierAction`, `removeSupplierAction`, `setCommentAction`, `setInvoiceNumberAction`, `setReferenceAction`, `setLocationAction`, `changeModeAction`, `completeReceivingAction`, `searchReceivingsAction`, `getReceivingRowAction`, `itemSearchAction`, `stockItemSearchAction`, `addItemKitAction`, `returnEntireReceivingAction`, `copyEntireReceivingAction`, `cancelReceivingAction` |
| `(secure)/rewards/actions.ts` | `saveRewardAction`, `deleteRewardAction`, `getRewardRowAction`, `getRewardPointsPercentAction` |
| `(secure)/sales/actions.ts` | `getCartAction`, `suggestItemsAction`, `addItemAction`, `editItemAction`, `deleteItemAction`, `selectCustomerAction`, `removeCustomerAction`, `changeModeAction`, `addPaymentAction`, `deletePaymentAction`, `setCommentAction`, `setInvoiceNumberAction`, `setPrintAfterSaleAction`, `setEmailReceiptAction`, `setPriceWorkOrdersAction`, `setLocationAction`, `setDinnerTableAction`, `getGiftcardAction`, `showKeyboardShortcutsAction`, `suspendAction`, `unsuspendAction`, `cancelSaleAction`, `completeSaleAction`, `returnEntireSaleAction`, `sendPdfAction`, `checkInvoiceNumberAction`, `discardSuspendedSaleAction`, `getSuspendedSaleInfoAction`, `setEmployeeAction` |
| `(secure)/suppliers/actions.ts` | `saveSupplierAction`, `deleteSupplierAction` |
| `(secure)/tax_categories/actions.ts` | `saveTaxCategoryAction`, `deleteTaxCategoryAction`, `suggestTaxCategoriesAction`, `getTaxCategoryRowAction` |
| `(secure)/tax_codes/actions.ts` | `saveTaxCodeAction`, `deleteTaxCodeAction`, `suggestTaxCodesAction`, `getTaxCodeRowAction`, `getTaxCodeLinksAction`, `saveTaxCodeWithLinksAction` |
| `(secure)/tax_jurisdictions/actions.ts` | `saveTaxJurisdictionAction`, `deleteTaxJurisdictionAction`, `getJurisdictionRowAction`, `saveJurisdictionAction` |
| `(secure)/taxes/actions.ts` | `saveTaxRateAction`, `deleteTaxRateAction` |

Many actions are unreferenced by any page/component or lack a `requirePermission`
call. The per-module appendices identify the dead/incorrect ones.

---

## 5. Module status matrix

Status vocabulary: `IMPLEMENTED` (behavior verified against upstream), `PARTIAL`
(some behavior present, gaps documented), `STUB` (surface only), `MISSING`.

| Module | Pages | Actions/API | Lib/repository | Schema | Tests | Status |
|---|---|---|---|---|---|---|
| Login/auth | `/login` | NextAuth | `lib/auth/*` | `auth.ts` | `rbac.test.ts` | PARTIAL — login works; RBAC/CSRF/session wrong |
| Home/office | `/home`, `/office` | home stats | — | — | `home.spec.ts` | PARTIAL — hard-coded, not grant-driven |
| Items | 6 pages | items actions + 7 API | `lib/items/*` | `items.ts` | `repository.test.ts` + 2 e2e | PARTIAL — search/save/CSV/images/barcode/cost gaps |
| Item kits | 2 pages | item_kits actions | `lib/item_kits/*` | `items.ts` | e2e | PARTIAL — no linked item/totals/price options |
| Inventory | `/items/[id]/inventory` | adjust action | `lib/inventory/*` | `items.ts` | — | PARTIAL — append-only but no count details/history layout |
| Attributes | 2 pages | attribute actions | `lib/attributes/*` | `attributes.ts` | e2e | PARTIAL — no conversion/cleanup/checkbox shared values |
| Customers | 2 pages | customer actions | `lib/persons/*` | `customers.ts` | e2e | PARTIAL — no CSV, no package, gender/tax fields |
| Suppliers | 2 pages | supplier actions | `lib/suppliers/*` | `customers.ts` | e2e | PARTIAL — no CSV (absent upstream), tax_id/category |
| Employees | 2 pages | employee actions | `lib/employees/*` | `auth.ts` | e2e | PARTIAL — no menu_group UI, language/deleted fields |
| Giftcards | 2 pages | giftcard actions | `lib/giftcards/*` | `giftcards.ts` | e2e | PARTIAL — number/value/refund validation |
| Rewards | 2 pages | reward actions | `lib/rewards/*`, `lib/customer_rewards/*` | wrong tables | e2e | REWRITE — upstream packages/points/ledger |
| Dinner tables | 2 pages | dinner actions | `lib/dinner_tables/*` | `customers.ts` | e2e | PARTIAL — status rules/seed |
| Expenses | 2 pages | expense actions | `lib/expenses/*` | `expenses.ts` | e2e | REWRITE — field names/supplier/tax |
| Expense categories | 2 pages | category actions | `lib/expenses_categories/*` | `expenses.ts` | e2e | PARTIAL — field names |
| Cashups | 2 pages | cashup actions | `lib/cashups/*` | wrong table | e2e | REWRITE — schema/open-close math |
| Messages/SMS | 1 page | messages actions | `lib/sms/*` | — | e2e | PARTIAL — Twilio deviation, no per-person form |
| Taxes | 4 list + 4 form pages | tax actions + suggest API | `lib/tax/*`, `lib/taxes/*` | `taxes.ts` | `tax.test.ts` + e2e | REWRITE — algorithm/schema/ordering |
| Sales | 5 pages | 29 actions | `lib/sale/*`, `lib/token`, `lib/pdf` | `sales.ts` | `sale-lib.test.ts` + e2e | REWRITE — persistence/returns/refunds/rewards/tokens |
| Receivings | 3 pages | 20 actions | `lib/receiving/*` | `receivings.ts` | e2e | REWRITE — requisition/quantity/cost |
| Reports | 2 pages | registry + 4 APIs | `lib/reports/registry.ts` | — | e2e | REWRITE — 20 reports/filters/pagination |
| Config | 1 page | 19 actions | `lib/config/*` | `config.ts` | e2e | REWRITE — 12 tabs vs ~20, 90 keys vs 138 |
| i18n | — | — | `lib/i18n` | — | — | MISSING — all locales empty except 57 bn keys |
| Documents | PDF pages/routes | — | `lib/pdf/*`, `lib/email` | — | e2e | REWRITE — math/flags/templates |
| Barcodes | page + API | action | `lib/barcode/*` | — | e2e | PARTIAL — tokens/types/sheet |
| No access | 1 page | — | — | — | e2e | PARTIAL — requires both segments |
| Migrate | `/api/migrate` | — | — | — | — | STUB/UNVERIFIED |

---

## 6. Confirmed stubs and structural defects

These are confirmed in source, not inferred from the older gap analysis.

### 6.1 Stubs / dead code

- `src/app/(secure)/messages/actions.ts` — `getMessageHistoryAction` returns `[]`
  with a comment that no messages table exists.
- `src/lib/sale/sale-model.ts:168-175` — inserts `attributeLinks` with
  `definitionId: 0, attributeId: null`, wrapped in a swallowed `try/catch`; SQLite
  foreign keys are on, so it always fails.
- `src/lib/sale/sale-lib.ts` — `addItemKit`, `applyCustomerDiscount`,
  `getTotals`, `editPayment`, `removeTempItems`, `getAttributesByItem` are present
  but unreachable from the register flow.
- `src/lib/items/actions.ts` — `getAttributesAction`, `saveAttributesAction`,
  `changeItemName/Number/DescriptionAction`, `undeleteItemAction`,
  `getItemTotalRowsAction` are unreferenced or partial.
- `src/lib/reports/registry.ts` — `LIMIT 500` on most reports; `summary_taxes`
  selects non-existent `sales_taxes.name/amount`.
- `src/lib/sms/index.ts` — Twilio implementation, while the UI says the provider is
  stubbed; upstream `Sms_lib` performs no network call.
- `src/components/messages/messages-form.tsx:30` — explicitly says “SMS provider is
  stubbed.”
- `src/app/(secure)/sales/actions.ts:147-150` — `showKeyboardShortcutsAction` is a
  no-op.
- `src/lib/config/tabs.ts` — 12 tabs; several actions reference tab keys that do not
  exist (`stock_locations`, `dinner_tables`, `shortcuts`, `info`).
- `src/lib/pdf/data.ts` — `buildReceiptData` computes `unitPrice * abs(quantity)`
  and ignores discounts, taxes, refunds, and flags.
- `src/lib/email/index.tsx` — `sendSaleEmail` passes raw DB context to components
  typed as `ReceiptData`.

### 6.2 Schema/seed defects

See `11-database.md` D1–D14. Highest-impact:
- Missing `customers_packages`, `customers_points`, `sales_reward_points`.
- `cash_up` reduced to `cashups` with 7 missing columns.
- Missing PKs on `sales_items`, `sales_payments`, `items_taxes`, `item_kit_items`,
  `item_quantities`, `receivings_items`, SQLite `grants`.
- `sales_taxes`/`sales_items_taxes` missing 7/6 upstream columns.
- `attribute_links` unique expression wrong; missing `uq1`/`uq2`.
- FK cascades on financial rows where upstream blocks.
- `sessions` PK/type wrong; `migrations` shape wrong.
- Seed: 90 config keys vs 138; 18 modules with display labels/sort 0; 37 permission
  defs vs 36 (two missing, three invented); all grants `both`; location permissions
  inserted with NULL location; no dinner tables/packages.
- Actual `sqlite.db`/`ospos.db` are stale: 28 permissions/grants, 0 dinner tables,
  3 orphan people, `ospos.db` missing migration 0002.

### 6.3 Money/date defects

- No decimal library; all money/tax/quantity math uses JS `Number`.
- Epoch integers for timestamps (`sale_time`, `receiving_time`, `trans_date`,
  `expense_time`, `open_date`, `close_date`, `payment_time`).
- `roundNumber` HALF_DOWN/HALF_UP negative behavior and HALF_FIVE semantics differ
  from PHP (`src/lib/tax/index.ts:37-70`).
- Fixed-line discounts subtract the discount once instead of `quantity * discount`
  (`src/lib/sale/types.ts:77-82`).
- `getTotal` adds included taxes as well as excluded (`src/lib/sale/sale-lib.ts:453-457`).

### 6.4 Auth/security defects

- `requirePermission` uses OR instead of module AND submodule
  (`src/lib/auth/with-permission.ts:14`).
- `hasModuleGrant` single-grant branch differs from PHP
  (`src/lib/auth/rbac.ts:60-63`).
- No CSRF token for server actions beyond Next.js action protection.
- No `ALLOWED_HOSTNAMES` enforcement.
- `getAllowedModules` filters modules with `sort = 0` and treats all non-home/office
  as home modules (`src/lib/auth/rbac.ts:85-87`).
- Sidebar is hard-coded and does not use module language keys or office visibility
  (`src/components/shared/sidebar.tsx`).
- Raw SQL interpolation in items/cashups (`IN (${ids.join(",")})`).
- No upload validation parity; `pic-thumb` uses `path.basename` (good) but image
  save path is incomplete.

### 6.5 i18n defects

- `src/messages/en/common.json` is `{}`.
- All locales except `bn` are `{}`; `bn` has 57 keys.
- Upstream has 24 language files and thousands of keys per locale.
- Locale set mismatch: upstream `hr` vs target `hr-HR`; target adds `bn`; target
  omits upstream `Language code definition`.

---

## 7. Test inventory

### 7.1 Unit tests (Vitest)

- `src/lib/auth/rbac.test.ts` — 67 lines; tests current (buggy) semantics.
- `src/lib/items/repository.test.ts` — 51 lines; likely only weighted-average.
- `src/lib/sale/sale-lib.test.ts` — 237 lines; 6 tests, encodes target deviations
  (entry-time cash refund, sibling deletion, etc.).
- `src/lib/tax/tax.test.ts` — 203 lines; encodes target tax deviations (default
  fallback, etc.).

### 7.2 E2E tests (Playwright)

23 specs, ~1,085 lines: attributes, auth, cashups, config, customers, dinner tables,
employees, expense categories, expenses, giftcards, home, item kits, items,
items-barcodes, messages, navigation, office, receivings, reports, rewards, sales,
suppliers, taxes.

Most are shallow: page renders, a create form, or a list assertion. They do not
verify upstream totals, DB state, permissions, receipts, or report rows.

### 7.3 Missing test categories

- Differential tests against the PHP app (none).
- Schema/seed/config/permission/locale/route parity tests (none).
- Report fixtures (none).
- Receipt/PDF text snapshots (none).
- Tax/rounding fixtures from upstream (target tests encode wrong behavior).
- Permission negative tests per action (almost none).
- Concurrency tests (none).

---

## 8. Top gaps (ranked for implementation order)

1. Schema/seed/date/money foundation (`11-database.md`, `04-taxes.md`).
2. Tax algorithm rewrite (`04-taxes.md`).
3. Sale persistence/returns/payments/rewards (`01-sales.md`).
4. Receiving persistence/requisition/cost (`03-receivings.md`).
5. Item search/save/CSV/images/barcode/cost (`02-items.md`).
6. Attribute EAV (`05-attributes.md`).
7. Rewards/cashup/expense schema/math (`07-ancillary.md`).
8. Reports engine + 20 reports (`08-reports.md`).
9. Config tabs/keys (`09-config-auth-install.md`).
10. RBAC/session/CSRF/host enforcement (`06-people.md`, `09-config-auth-install.md`).
11. Documents/PDF/email/tokens/barcodes (`10-receipts-tokens-barcode-email.md`).
12. i18n conversion (all locales empty).
13. Shared UI/table/shortcut behavior (`12-ui-views-assets.md`).
14. Differential harness and parity gates.

---

## 9. Unknowns

- Whether the target's actual `sqlite.db`/`ospos.db` are meant to be committed
  fixtures or disposable local state. They are stale; the plan treats them as
  disposable and requires a rebuild from seed.
- Whether the project intends SQLite as production or dev-only (see ADR/open
  questions).
- Whether the target's extra `bn` locale and `hr-HR` naming are intentional; the
  plan keeps `bn` as an addition and normalizes `hr`.
- Whether any target-only modules (e.g. `/rewards` as a standalone CRUD) should be
  retained as extensions. The plan recommends retiring them in favor of the upstream
  Config→Rewards tab, but records the decision as open.

---

*End of target inventory.*
