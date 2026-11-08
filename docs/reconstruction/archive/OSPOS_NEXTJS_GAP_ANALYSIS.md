# OSPOS Next.js Port — Gap Analysis Report

**Source of truth:** `/home/yash/ospos` (CodeIgniter 4, OSPOS 3.4.2)  
**Port target:** `/home/yash/ospos-nextjs` (Next.js 16 + Drizzle ORM + React 19)  
**Analysis date:** 2026-06-29  
**Goal:** 100% faithful rewrite of PHP functionality.

This document lists every significant functionality gap found by comparing the PHP codebase against the Next.js implementation. Gaps are grouped by area and rated by severity.

---

## Executive Summary

The Next.js port has broad surface coverage: most modules exist as routes, server actions, repositories, and schema files. However, several **core business-logic behaviors** are simplified or incomplete, and a few **database tables/columns** from the PHP migrations are missing entirely. The highest-risk gaps are:

1. Tax computation parity (default taxes, destination-based matching, compound/cascade taxes).
2. Sale return / refund flow (negative totals, cash refunds, `sale_type = RETURN`).
3. Weighted-average cost price calculation on receivings.
4. Rewards points schema mismatch (`customers_packages` / `customers_points` / `sales_reward_points` missing).
5. Cashup schema missing card/check/total and open/close employee columns.

---

## 1. Database Schema Gaps

| PHP Table / Column | Status in Next.js | Severity | Notes / PHP Reference |
|---|---|---|---|
| `ospos_customers_packages` | **Missing** | High | PHP `Customer_rewards.php` is built entirely around packages. `app/Database/Migrations/sqlscripts/3.0.2_to_3.1.1.sql:79-92`. |
| `ospos_customers_points` | **Missing** | High | Tracks points earned per package per sale. `3.0.2_to_3.1.1.sql:98-105`. |
| `ospos_sales_reward_points` | **Missing** | High | `Rewards.php` table; stores `earned`/`used` per sale. `3.0.2_to_3.1.1.sql:111-117`. |
| `ospos_cash_up` extra columns | Partial | High | Next.js `cashups` table lacks `closed_amount_card`, `closed_amount_check`, `closed_amount_total`, `closed_amount_due`, `description`, `open_employee_id`, `close_employee_id`. `Cashup.php:27-32`. |
| `ospos_tax_codes.tax_code_type` | **Missing column** | Medium | Used by `Tax_code.php` for code classification. |
| `ospos_tax_code_rates` / `ospos_tax_rates` | Remapped | Medium | PHP has two separate rate tables across migrations; Next.js merged into `tax_code_links` with surrogate key. Must verify compound/cascade semantics. |
| `ospos_attribute_links` unique constraint | Missing | Medium | CLAUDE.md notes partial unique index (SQLite) / generated column (MySQL). Current schema has no unique constraint on `(attribute_id, definition_id, item_id, sale_id, receiving_id)`. |
| `ospos_sales_suspended_*` tables | Not needed | OK | PHP itself no longer uses these (uses `sale_status = SUSPENDED`). Next.js matches this design. |

### Recommended schema actions

1. Add `customers_packages`, `customers_points`, `sales_reward_points` to schema (or deliberately replace with new design and document deviation).
2. Extend `cashups` table with missing financial/employee columns.
3. Add `tax_code_type` to `tax_codes`.
4. Add proper unique index for `attribute_links` per CLAUDE.md gotcha #4.
5. Regenerate both SQLite and MySQL migrations after changes (`npm run db:generate:sqlite` and `npm run db:generate:mysql`).

---

## 2. Core Business Logic Gaps

### 2.1 Sales / Cart (`src/lib/sale/*` vs `app/Libraries/Sale_lib.php`, `app/Models/Sale.php`)

| Feature | Status | Notes |
|---|---|---|
| Return mode (`postComplete` for returns) | Incomplete | `returnEntireSale` loads prior sale lines but does **not** flip quantities/totals negative or set `sale_type = RETURN` on persist. PHP `Sales.php:691-930`. |
| Cash refund handling | Incomplete | `sales_payments.cash_refund` exists but refund flows do not populate it per PHP semantics. |
| Customer rewards integration | Mismatched | Uses `use_customer_rewards` config and a different `rewards`/`customer_rewards` design; PHP uses `customer_reward_enable` + `customers_packages`. |
| Attributes on sale lines | Stub | `saveSale` inserts `attributeLinks` with `definitionId = 0`; real attribute values are not attached to sale lines. |
| Cash adjustment deletion | Over-broad | `deletePayment` strips **all** `cash_adjustment` rows, not just the sibling created for the deleted payment. |
| Dinner table release | Partial | Releases table on `COMPLETED`; PHP also releases on `CANCELED`. |
| Edit saved sale | Minimal | `update()` exists but does not reverse prior inventory before re-saving, unlike PHP `Sale::save_value`. |
| Suspended sale quotes/work orders | Present | Correctly uses `sale_status = SUSPENDED` with `sale_type = QUOTE/WORK_ORDER`. |
| Low-sell self-reference | Correct | `items.low_sell_item_id` set to inserted id. `repository.ts:259`. |
| Item-number-vs-id guard | Correct | `isItemId` rejects leading-zero numeric strings. |
| Inventory append-only | Correct | Always inserts deltas into `inventory`. |

### 2.2 Tax (`src/lib/tax/index.ts` vs `app/Libraries/Tax_lib.php`)

| Feature | Status | Notes |
|---|---|---|
| Default tax fallback | Missing | When item has no taxes, PHP applies `default_tax_1_*` / `default_tax_2_*`. Next.js returns empty rate list. |
| Destination-based code matching | Missing | PHP matches customer `city`/`state` against `tax_codes`. Next.js `applyDestinationTax` always uses `default_tax_code`. |
| Compound/cascade tax | Partial | CLAUDE.md gotcha #5: when `cascade_sequence` changes, prior tax should be added to basis. Next.js adds tax to basis if `cascadeSequence > 0`, but resets `cumulativeBasis` per line item instead of per tax-group change. |
| Customer tax exemption | Not used | `isCustomerTaxable` exists but `getTaxes` does not consult it. |
| Included tax | Partial | `getIncludedTax` helper exists but `getTaxes` recomputes included tax differently from PHP. |
| Rounding modes | Mostly correct | All 7 modes implemented. |

### 2.3 Items (`src/lib/items/repository.ts` vs `app/Models/Item.php`)

| Feature | Status | Notes |
|---|---|---|
| `changeCostPrice` weighted average | **Wrong** | Next.js uses `totalQty = itemsReceived` and `totalUnits = totalQty * 2`, which is mathematically incorrect. PHP computes true weighted average from current stock across non-deleted locations: `Item.php:1068-1088`. |
| Bulk edit (`postBulkUpdate`) | Minimal | Only updates `items` fields; PHP also updates quantities, taxes, and attributes. |
| CSV export | **Missing** | PHP `Items::getGenerateCsvFile`. Next.js only has CSV import. |
| Count details modal | Unclear | Route `/items/[id]` exists; count-details modal not verified. |
| Item logo remove | Partial | `removeLogoAction` exists in config, not item-specific. |
| Item image upload | Minimal | `api/items/pic-thumb/[file]/route.ts` exists but full upload flow is thin. |
| Save tax data | Partial | Limits to 2 taxes, does not handle `default_tax_*` fallback or destination-based skip. |

### 2.4 Receivings (`src/lib/receiving/*` vs `app/Controllers/Receivings.php`, `app/Models/Receiving.php`)

| Feature | Status | Notes |
|---|---|---|
| Requisition / transfer complete | **Missing** | PHP `postRequisitionComplete` for stock transfers is not ported. |
| Cancel receiving | Partial | `cancelReceivingAction` exists; verify inventory restoration matches PHP. |
| Edit saved receiving | Minimal | `/receivings/manage` exists but edit flow is not fully ported. |
| Average cost update | Buggy | Uses sum of `item_quantities` **after** inserting the new line, which can double-count the received quantity. PHP uses pre-update total. |
| Return entire receiving | Present | `returnEntireReceiving` loads prior receiving. |
| Copy receiving | Present | `copyEntireReceiving` implemented. |

### 2.5 Cashups (`src/lib/cashups/repository.ts` vs `app/Models/Cashup.php`)

- Missing columns noted in schema section cause functional gaps:
  - No separate open/close employee tracking.
  - No card/check/total amounts or due amount.
  - `_calculate_total` private helper logic not fully reproduced.
- Search filters (date range, deleted) are minimal compared to PHP `Cashup::search`.

### 2.6 Giftcards / Rewards / Expenses / Suppliers / Customers

| Feature | Status | Notes |
|---|---|---|
| Giftcard value validation | Minimal | Basic CRUD; PHP has stricter number uniqueness and value checks. |
| Rewards packages | Mismatched | See schema gaps above. |
| Customer CSV import/export | **Missing** | PHP `Customers::getCsv` / `postImportCsvFile`. |
| Supplier CSV import/export | **Missing** | PHP `Suppliers::getCsv` / `postImportCsvFile`. |
| Expenses search/filter | Minimal | PHP `Expense::search` has more filter options. |
| Customer account number uniqueness | Correct | `accountNumberExists` checks both customers and suppliers. |

---

## 3. Route / Controller Gaps

| PHP Controller / Method | Next.js Status | Notes |
|---|---|---|
| `Customers::getCsv` / `postImportCsvFile` | **Missing** | Only items CSV import exists. |
| `Suppliers::getCsv` / `postImportCsvFile` | **Missing** | No supplier CSV at all. |
| `Items::getGenerateCsvFile` | **Missing** | Export not implemented. |
| `Items::getCountDetails` | Unclear | Verify UI. |
| `Items::getAttributes` / `postAttributes` | Partial | Action exists; EAV behavior may diverge. |
| `Config::postSave*` family | Mostly present | Many individual config keys still missing from tabs. |
| `Secure_Controller::getCheckNumeric` | **Missing** | AJAX numeric check endpoint. |
| `No_access::getIndex($module_id, $permission_id)` | Partial | Page exists but does not accept params. |
| `Messages` SMS gateway | Partial | Twilio only; PHP `Sms_lib` supports multiple gateways. |
| `Attributes` definition/value management | Present | Actions exist; verify dropdown orphan cleanup. |

---

## 4. Application Configuration Gaps

The following config keys are referenced by PHP but are **not exposed as editable fields** in `src/lib/config/tabs.ts` (some are seeded in `src/db/seed.ts`):

### Sales / Register
- `default_sales_discount_type`
- `default_receivings_discount`
- `default_receivings_discount_type`
- `default_register_mode`
- `line_sequence`
- `derive_sale_quantity`
- `multi_pack_enabled` (seeded, no UI)
- `work_order_enable`
- `work_order_format`
- `sales_quote_format`
- `quote_default_comments`

### Tax
- `default_tax_jurisdiction`
- `default_tax_1_cumulative` (partially present)
- `default_tax_2_cumulative`

### Rewards
- `customer_reward_enable` (seeded but UI uses different key)
- `use_customer_rewards` (used in code but not in seed/tabs)

### Barcode
- `barcode_formats` (JSON regex list; used by token barcode parser)
- `allow_duplicate_barcodes`

### Security / System
- `gcaptcha_enable`, `gcaptcha_site_key`, `gcaptcha_secret_key`
- `theme`
- `hostname`
- `enforce_privacy`

### Images
- `image_allowed_types`
- `image_max_height`
- `image_max_width`
- `image_max_size`

### Receipt / Print
- `print_delay_autoreturn`
- `print_receipt_check_behaviour`
- `email_receipt_check_behaviour`
- `receipt_font_size`
- `receipt_show_company_name`
- `receipt_show_tax_ind`

### UI Suggestions
- `suggestions_first_column`
- `suggestions_second_column`
- `suggestions_third_column`
- `category_dropdown`
- `notify_horizontal_position`
- `notify_vertical_position`

### Locale / Misc
- `date_or_time_format`
- `financial_year`
- `currency_code`
- `tax_id`

### Recommended action
Add these fields to the appropriate config tabs, or explicitly document any intentional removals from the port.

---

## 5. Reports Gaps

| Feature | Status | Notes |
|---|---|---|
| Specific-entity reports | Incomplete | `specific_customer`, `specific_employee`, `specific_supplier`, `specific_discount` exist but lack the entity-selection filter. PHP reports require choosing a customer/employee/etc. |
| Graphical reports | Stub | Registry creates graphical twins with `chart` field, but no chart rendering component uses it. |
| Pagination | Missing | Reports are hard-limited to 500 rows with no pagination. PHP `Report.php` paginates. |
| Filter UIs | Missing | PHP has dedicated views: `date_input.php`, `specific_customer_input.php`, `inventory_summary_input.php`. Next.js uses a generic date filter only. |
| Detailed row expansion | Partial | API endpoints exist for detailed sales/receivings rows; UI integration not verified. |
| Subtitle / header helpers | Missing | PHP `_get_subtitle_report` builds dynamic subtitles. |

---

## 6. Token / Barcode / PDF Gaps

| Feature | Status | Notes |
|---|---|---|
| Barcode tokens | **Missing** | PHP `Token_barcode_price`, `Token_barcode_weight`, `Token_barcode_ean` are absent. Only document tokens exist. |
| Strftime token support | Partial | Many PHP date/time formatters are missing from `applyStrftime`. |
| `CO` token semantics | Possibly off | Counts sales with `invoice_number IS NOT NULL`; verify against PHP `Sale::get_invoice_count`. |
| PDF templates | Partial | Documents exist but may not honor all `receipt_*` config flags or template variations (short/default). |
| Barcode font listing | Present | `listFonts` and `getFontName` exist. |

---

## 7. Auth / RBAC Gaps

| Feature | Status | Notes |
|---|---|---|
| `has_module_grant` prefix matching | Needs verify | `src/lib/auth/rbac.ts` exists; must confirm it reproduces PHP `Employee.php:423-440` exactly (trailing-space `LIKE`, leaf-permission check). |
| `menu_group` per grant | Missing UI | Employee form shows permission checkboxes but does not allow choosing `home`/`office`/`both` per grant. |
| Subpermission seed | Possibly incomplete | PHP seeds many subpermissions (e.g., `items_add`, `items_delete`). Next.js seeds only top-level + a few `reports_*`. |
| `canModifyEmployee` / `isAdmin` | Verify | Need to confirm logic matches PHP `Employee.php`. |

---

## 8. i18n / Localization

- Next.js includes a `bn` (Bengali) locale pack that is **not present** in upstream PHP. This is an addition, not a gap.
- Coverage of the other 47 locale packs should be verified against new UI strings added during the port.

---

## 9. Recommended Implementation Priority

To move toward a 100% faithful rewrite, address gaps in this order:

1. **Tax parity** — default tax fallback, destination-based matching, compound/cascade logic, customer exemption. (`src/lib/tax/index.ts`)
2. **Fix `changeCostPrice`** — implement true weighted-average from pre-update stock. (`src/lib/items/repository.ts`)
3. **Complete sale return/refund flow** — negative totals, `sale_type = RETURN`, cash refunds, sibling cash adjustment removal. (`src/lib/sale/sale-lib.ts`, `sale-model.ts`)
4. **Rewards schema decision** — either add `customers_packages`/`customers_points`/`sales_reward_points` or fully document the replacement design.
5. **Cashup schema + logic** — add missing columns and totals calculation.
6. **CSV import/export** — customers, suppliers, and items export.
7. **Config UI completeness** — add all missing keys to `src/lib/config/tabs.ts`.
8. **RBAC `menu_group` and subpermissions** — verify and extend seed/UI.
9. **Barcode tokens + strftime completeness** — `src/lib/token/index.ts`.
10. **Report filters, pagination, and charts** — `src/lib/reports/registry.ts` + UI.

---

## 10. Verification Commands

Useful commands for ongoing parity checks:

```bash
# Find a PHP controller method
grep -n "function postSave" /home/yash/ospos/app/Controllers/Items.php

# Find all tables touched by a PHP model
grep -nE "(\$this->|protected \$table|FROM ospos_)" /home/yash/ospos/app/Models/Sale.php

# List all config keys referenced in PHP
grep -rohE "(config|settings)\['[a-z_0-9]+'\]" /home/yash/ospos/app/ | sed "s/.*\['//;s/'\].*//" | sort -u

# Compare schema tables
find /home/yash/ospos-nextjs/src/db/schema -type f | sort
find /home/yash/ospos/app/Database/Migrations/sqlscripts -type f | sort
```

---

---

## 11. Second-Pass Deep-Dive Additions

The following gaps were found during a second, file-level comparison of the React components, server actions, schema files, and auth layer.

---

### 11.1 MySQL schema is not a faithful mirror of SQLite / PHP

`src/db/schema/mysql/index.ts` claims to mirror the SQLite schema but diverges in column names, missing columns, and missing tables. Running `DB_DRIVER=mysql` will fail or silently corrupt data.

| Area | SQLite / PHP expectation | Current MySQL schema | Severity |
|---|---|---|---|
| `people` | `address1`, `address2`, `gender`, `deleted` | single `address` column, no `deleted` | High |
| `modules` | `name_lang_key`, `desc_lang_key`, `sort` | `module_icon`, `module_lang_key`, `sort` — different column set | High |
| `grants` | `(permission_id, person_id, menu_group)` | no `menu_group` column at all | High |
| `employees` | `deleted` flag | no `deleted` flag | High |
| `cart_sessions` | `session_id`, `person_id`, `data`, `updated_at` | no `person_id` | High |
| `sales` | `sale_location`, `sale_cash_adjustment`, `sale_cash_refund` | `location_id` instead of `sale_location`; missing cash columns | High |
| `sales_items` | `discount`, `discount_type`, `item_location`, `print_option` | only `discount_percent`, `line`, and price columns | High |
| `sales_items_taxes` | exists in SQLite/PHP | **missing table** in MySQL | High |
| `receivings` | `payment_type`, `receiving_ref`, `receiving_location`, `transfer_item_location` | `receiving_type`, `reference`, `location_id` — different semantics | High |
| `cashups` | `closed_amount_card/check/total/due`, `description`, `open_employee_id`, `close_employee_id` | only cash columns + note + employee_id | High |
| `tax_codes` | `tax_code_type` | missing column in both schemas; MySQL also lacks it | Medium |
| `attribute_links` | generated unique column for MySQL unique constraint | `generatedUniqueColumn` is an empty-string placeholder with no index | Medium |
| `customers` | PHP base is `discount_percent`; rewards packages live in `customers_packages` | `package_policy` added, `discount` naming differs from PHP | Medium |
| `suppliers` | no `tax_id` in initial PHP (added later in some migrations) | MySQL has `tax_id`, SQLite does not; form exposes neither | Low |

**Recommended action:** rewrite `mysql/index.ts` to be column-for-column identical to the SQLite schema (with appropriate MySQL types), then regenerate MySQL migrations.

---

### 11.2 RBAC and permission model bugs

| Issue | Location | Notes |
|---|---|---|
| `hasModuleGrant` LIKE is wrong | `src/lib/auth/rbac.ts:50` | Uses `like(grants.permissionId, \`${moduleId} %\`)` (space). PHP `Employee.php:426` uses CI4 `like('permission_id', $permission_id, 'after')`, producing `LIKE 'reports%'`, which matches `reports_sales`. The space means subpermission grants are never found. |
| `requirePermission` misuses module grant | `src/lib/auth/with-permission.ts:14` | Calls `hasModuleGrant(target, ...)` for exact permissions (e.g. `items_stock`). It should call `hasGrant(target, ...)` for exact permission checks. |
| `isAdmin` too permissive | `src/lib/auth/rbac.ts:18` | Treats any employee granted all `ADMIN_MODULES` as admin; PHP only considers `person_id === 1`. |
| `menu_group` lost in MySQL | `src/db/schema/mysql/index.ts:58-63` | `grants` table has no `menu_group`, breaking `getAllowedModules` and sidebar filtering under MySQL. |
| No `menu_group` UI | `src/components/employees/employee-form.tsx` | Grants shown as flat checkboxes; no `home`/`office`/`both` selector per grant. |
| Incomplete permission seed | `src/db/seed.ts:125-154` | Missing PHP permissions: `sales_delete`, `sales_change_price`, `items_stock`, `sales_stock`, `receivings_stock`, `reports_categories`, `office`, `home`, `module_home`. Also seeds every grant with `menuGroup: "both"`, ignoring PHP's `home`/`office`/`--` values. |

---

### 11.3 Config tabs / actions mismatch

- Several `save*Action` helpers in `src/app/(secure)/config/actions.ts` reference tab keys that do **not exist** in `src/lib/config/tabs.ts`: `stock_locations`, `dinner_tables`, `shortcuts`, `info`. Calling them will throw "Unknown tab".
- Many config keys referenced by code are still not seeded or exposed (see §4). Notable examples confirmed in code:
  - `use_customer_rewards` — used in `src/lib/sale/sale-model.ts:219` but not seeded, so rewards are always disabled.
  - `default_sales_discount_type`, `default_receivings_discount`, `default_receivings_discount_type`, `default_register_mode`, `line_sequence`, `derive_sale_quantity`, `multi_pack_enabled`, `work_order_enable`, `work_order_format`, `sales_quote_format`, `quote_default_comments`.
  - `default_tax_jurisdiction`, `default_tax_2_cumulative`, `barcode_formats`, `allow_duplicate_barcodes`.
  - `gcaptcha_enable`, `theme`, `hostname`, `enforce_privacy`, image size keys, receipt/print behavior keys, suggestion keys, `date_or_time_format`, `financial_year`, `currency_code`, `tax_id`.

---

### 11.4 UI / form simplifications

| Form | Missing / simplified vs PHP |
|---|---|
| `item-form.tsx` | `item_type` and `stock_type` are hidden/default fields (no selectors for ITEM/ITEM_KIT/AMOUNT_ENTRY/TEMP or stock type). Attributes are read-only; no inline attribute editing. No low-sell item selector. No `deleted` restore. Picture upload field is present but `saveItemAction` does not handle the file. Tax 1/2 UI is hard-coded to two taxes. |
| `customer-form.tsx` | Lacks gender field. Has `points` field but no rewards package selector (schema mismatch). No CSV import/export UI. |
| `supplier-form.tsx` | No CSV import/export UI. `tax_id` not exposed. |
| `employee-form.tsx` | No `deleted` toggle, no `hash_version`, no language dropdown, no `menu_group` selector per grant. |
| `cashup-form.tsx` | Missing card/check/total/due fields and open/close employee fields matching the missing schema columns. |
| `tax-code-form.tsx` | Missing `tax_code_type` field. |
| `tax-jurisdiction-form.tsx` | `tax_type` is a free text input instead of a dropdown of jurisdiction types. |
| `messages-form.tsx` | SMS is a Twilio stub only; PHP `Sms_lib` supports multiple gateways. |
| `giftcard-form.tsx` | No value uniqueness / range validation, no auto-number generation. |
| `dinner-tables-form.tsx` | No `status` management (relies on code, acceptable). |

---

### 11.5 Route / server action gaps

| PHP capability | Next.js status | Notes |
|---|---|---|
| Items CSV export | Missing | Only CSV import exists. |
| Items count details | Missing | No route equivalent to `Items::getCountDetails`. |
| Items bulk update taxes/qty/attributes | Missing | `bulkUpdateAction` only updates item table fields. |
| Item picture upload | Partial | Form has file input; `saveItemAction` does not persist the uploaded file. |
| `Secure_Controller::getCheckNumeric` | Missing | No numeric validation endpoint. |
| Customer CSV import/export | Missing | No actions or UI. |
| Supplier CSV import/export | Missing | No actions or UI. |
| Sale return flow | Incomplete | `returnEntireSaleAction` loads lines but does not flip totals negative or set `sale_type = RETURN`. |
| Sale cash refund column | Incomplete | `sales_payments.cash_refund` exists but refund flows do not populate it. |
| Edit saved sale | Minimal | No reverse-and-re-save inventory logic. |
| Requisition / transfer receiving | Missing | `completeReceivingAction` assumes a normal receive; no `postRequisitionComplete`. |
| Config `stock_locations` / `dinner_tables` / `shortcuts` tabs | Missing actions/tabs | Actions call non-existent tabs. |
| `No_access::getIndex($module_id, $permission_id)` | Partial | Route exists at `/no_access/[module]/[submodule]` but requires both segments; optional submodule not handled, and `withPermission` may redirect to a path the route does not match. |

---

### 11.6 Token, PDF, and reports

- **Token library** (`src/lib/token/index.ts`)
  - Only document tokens implemented; PHP barcode tokens `Token_barcode_price`, `Token_barcode_weight`, `Token_barcode_ean` are missing.
  - `applyStrftime` is incomplete: missing `Z`, `L`, `c`, `r`, `U`.
- **PDF / receipt data** (`src/lib/pdf/data.ts`)
  - `buildReceiptData` computes total as `itemUnitPrice * abs(quantityPurchased)`, ignoring line discounts, taxes, and the `receipt_show_*` config flags. It does not choose between `receipt_default` and `receipt_short` templates.
- **Reports** (`src/components/reports/report-view.tsx`)
  - Only a generic date filter. No entity picker for `specific_customer` / `specific_employee` / `specific_supplier` / `specific_discount` reports, no pagination, no dynamic subtitle helper, no detailed row expansion UI.

---

### 11.7 Data-layer correctness issues

| Issue | Location | Notes |
|---|---|---|
| Weighted-average cost bug | `src/lib/items/repository.ts:446-462` | `totalQty = itemsReceived` and `totalUnits = totalQty * 2` produce a nonsensical average. Must use pre-update stock total per PHP `Item.php:1068-1088`. |
| Raw SQL injection risk | `src/lib/items/repository.ts:116`, `437-438` | Builds `IN (...)` clauses by joining IDs into SQL strings. IDs are internal today, but this should be parameterised. |
| Receiving average cost double-counts | `src/lib/receiving/receiving-model.ts` | Uses sum of `item_quantities` after inserting the new line, double-counting the received quantity. PHP uses the pre-update total. |
| `use_customer_rewards` not seeded | `src/db/seed.ts`, `src/lib/sale/sale-model.ts:219` | Rewards code checks this key, but it is never inserted, so rewards are disabled. |
| Attribute unique constraint missing | `src/db/schema/attributes.ts:21-27` | No partial unique index or generated column; orphan dropdown values not protected. |

---

## 12. Updated Implementation Priority

1. Fix MySQL schema drift (it is currently non-functional).
2. Fix `hasModuleGrant` LIKE pattern and `requirePermission` semantics.
3. Fix `changeCostPrice` weighted-average formula.
4. Complete sale return / refund flow (negative totals, `sale_type = RETURN`, cash refunds).
5. Add rewards schema or fully document the replacement design; seed `use_customer_rewards`.
6. Extend `cashups` schema and form with card/check/total/due and open/close employee columns.
7. Align config tabs with PHP (add missing keys, remove references to non-existent tabs).
8. Implement customer / supplier / items CSV export and customer/supplier CSV import.
9. Add missing barcode tokens and strftime completeness.
10. Build report entity filters, pagination, and detailed-row UI.

---

---

## 13. Third-Pass Deep-Dive Additions

The following gaps were confirmed by reading the PHP source-of-truth files side-by-side with the Next.js implementation (`Tax_lib.php`, `Sale_lib.php`, `Sale.php`, `Receiving.php`, `Receivings.php`, `Item.php`, `Attribute.php`, `Token_lib.php`, `Barcode_lib.php`, `Stock_location.php`, and the Next.js counterparts).

### 13.1 Tax computation — verified gaps

| Gap | PHP behavior | Next.js behavior | Severity |
|---|---|---|---|
| Default tax fallback | `Tax_lib::get_taxes`: when `use_destination_based_tax` is false and an item has no `items_taxes`, it falls back to `default_tax_1_*` / `default_tax_2_*` config. | `getTaxes` reads `itemsTaxes` only; if none, returns empty rates. | High |
| Customer taxable check | PHP skips tax entirely when a customer exists and `taxable=false`. | `isCustomerTaxable` exists in `sale-lib.ts` but `getTaxes` never consults it. | High |
| Destination code lookup | `get_applicable_tax_code`: for non-`sale` register modes it uses the customer's `sales_tax_code_id`, else looks up `city`/`state` in `tax_codes`, then falls back to `default_tax_code`. | `applyDestinationTax` always uses `default_tax_code`; customer city/state and assigned tax code are ignored. | High |
| Compound/cascade grouping | When `cascade_sequence` changes between definitions, PHP adds prior accumulated tax to the basis and resets per group via `last_cascade_sequence`. | Next.js adds tax to `cumulativeBasis` only if `cascadeSequence > 0`, resetting per line rather than per sequence change. | High |
| Excluded tax basis | PHP uses `tax_basis` which includes prior cascade only when the sequence changed. | Next.js always starts from the line basis and may accumulate differently. | Medium |
| `apply_invoice_taxing` | PHP recalculates group tax after totals are final (used by the original sales-tax migration path). | Not implemented. | Low |
| Tax group identity / metadata | PHP group key is `clean('X' + rate + '% ' + tax_group)` and stores `print_sequence`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id`. | Next.js key is `X{rate}% {name}` only; no print-sequence sorting; extra ids not stored. | Medium |

### 13.2 Sales register / cart — verified gaps

| Gap | PHP behavior | Next.js behavior | Severity |
|---|---|---|---|
| Return line totals | Return-mode lines have negative quantity and negative total; `sale_type = RETURN`. | `returnEntireSale` sets positive `quantity`/`total` and only flips `saleType=RETURN`; `saveSale` negates the DB quantity but the cart totals remain positive. | High |
| Cash refund column | Non-cash refunds become negative payments of that type; cash refunds are recorded in `sales_payments.cash_refund`. | `cashRefund` column exists but refund flows do not populate it. | High |
| Sibling cash adjustment removal | `delete_payment` removes only the `cash_adjustment` row created for the deleted cash payment. | `deletePayment` removes **all** `CASH_ADJUSTMENT_PAYMENT_TYPE` rows. | Medium |
| Dinner table on cancel | PHP releases the dinner table on `CANCELED` (as well as `COMPLETED`). | `cancelSale` sets `CANCELED` but never updates `dinnerTables`. | Medium |
| Edit saved sale | PHP `Sale::save_value` for an existing sale reverses inventory, deletes old lines/payments/taxes, then re-inserts everything. | `update()` in `sale-model.ts` only updates sale fields and merges payments; no inventory reversal or line replacement. | High |
| Rewards schema mismatch | PHP uses `customers_packages`, `customers_points`, `sales_reward_points`, and config key `customer_reward_enable`. | Next.js uses `customer_rewards`/`rewards` tables and checks `use_customer_rewards`, which is not seeded. | High |

### 13.3 Receivings — verified gaps

| Gap | PHP behavior | Next.js behavior | Severity |
|---|---|---|---|
| Requisition / transfer | `postRequisitionComplete` re-adds cart lines against destination and source locations, then completes. | No requisition mode or `postRequisitionComplete` equivalent exists. | High |
| `receiving_quantity` handling | PHP stores `receiving_quantity` per line; `items_received = quantity * receiving_quantity`. | Next.js stores `receivingQuantity: 1` always; delta is just signed `line.quantity`. | High |
| Average cost timing | PHP calls `change_cost_price` **before** updating `item_quantities`, using the pre-update stock total. | `completeReceiving` updates quantities first, then sums `item_quantities`, double-counting the received quantity. | High |
| Cancel/delete receiving | PHP reverses `quantity_purchased * receiving_quantity` per line and deletes the receiving. | `cancelReceiving` subtracts `quantityPurchased` only; `delete_list` not implemented; no `receiving_quantity` multiplier. | Medium |
| Receipt parsing | `is_valid_receipt` accepts `RECV #`, `KIT #`, or a matching `reference`. | `isValidReceipt` only accepts `RECV #` / `KIT #`. | Low |

### 13.4 Items — verified gaps

| Gap | PHP behavior | Next.js behavior | Severity |
|---|---|---|---|
| `changeCostPrice` formula | Weighted average = `(items_received * new_price + old_total_qty * old_price) / (old_total_qty + items_received)`. | Uses `totalQty = itemsReceived` and `totalUnits = totalQty * 2`, producing a mathematically wrong average. | High |
| Bulk edit fields | `ALLOWED_BULK_EDIT_FIELDS` includes category, supplier, cost/unit price, taxes, `allow_alt_description`, `is_serialized`, etc. | `bulkUpdate` only updates `category`, `supplierId`, `costPrice`, `unitPrice`; no taxes/quantities/attributes. | High |
| Item CSV export | `getGenerateCsvFile` builds an import template with location and attribute columns. | No export/generate CSV action. | High |
| Count details | `getCountDetails` renders a modal with quantities per location. | No route/modal equivalent; only inventory history exists. | Medium |
| Image upload | `upload_image` validates size/type/dimensions and moves the file to `uploads/item_pics/`. | The form input is named `picture`, but the schema expects `picFilename` as a string; the uploaded file is not persisted. | High |
| Barcode auto-number | `getGenerateBarcodes` generates an `item_number` if empty and `barcode_generate_if_empty` is enabled. | `generateBarcodesAction` uses the existing `itemNumber` only. | Medium |
| Suggestions config | Suggestion columns and multi-pack name appending are driven by config. | `suggestItems` hard-codes name/category/item_number. | Low |
| Raw SQL injection risk | N/A (parameterised) | `IN (${ids.join(",")})` in `searchItems`, `getMultipleInfo`, and `getAllItems`. | Medium |

### 13.5 Attributes — verified gaps

| Gap | PHP behavior | Next.js behavior | Severity |
|---|---|---|---|
| Definition type conversion | On type change, PHP validates existing values, converts them, updates links, deletes orphaned dropdown links, and reuses checkbox 0/1 rows. | Next.js updates the definition row only; no conversion or cleanup. | High |
| Dropdown option deletion | `deleteDropdownAttributeValue` removes the dropdown link and orphan value. | No API to delete individual dropdown options; `deleteDefinition` wipes all links. | Medium |
| Attribute value case update | `saveAttributeValue` updates stored value capitalization when only case changed. | Not implemented. | Low |
| Checkbox shared values | Creates shared `0`/`1` rows in `attribute_values`. | Each save creates a new `attribute_values` row, violating the shared-value design. | Medium |
| Inline item attribute editor | `getAttributes`/`postAttributes` views support dropdown/text/date/decimal/checkbox inline. | `item-form.tsx` lists attributes read-only; a separate save UI exists but is not fully equivalent. | Medium |

### 13.6 Token / Barcode — verified gaps

| Gap | PHP behavior | Next.js behavior | Severity |
|---|---|---|---|
| Barcode tokens | `Token_barcode_price`, `Token_barcode_weight`, `Token_barcode_ean` are used by `parse_barcode`. | Only document tokens exist; no barcode tokens. | High |
| Barcode parser config | `barcode_formats` JSON regex list is parsed via the token engine. | `parseBarcode` has an ad-hoc regex list but ignores the token engine and supports only `{id,qty,price}`. | Medium |
| Strftime formats | Supports `%Z`, `%L`, `%c`, `%r`, `%U`, etc. | Missing `Z`, `L`, `c`, `r`, `U`; the regex only matches single-letter tokens inside `{ }`. | Medium |
| Barcode display rows | Supports `company_name`, `item_code`, and localized labels. | Supports only `id`, `name`, `category`, `unit_price`, `cost_price`. | Low |
| Barcode config values | `barcode_content` values: `id`, `item_number`, `name`; `barcode_type` values are uppercase keys (`C128`, `C39`, etc.). | Config tab option value for number is `number` instead of `item_number`; `barcode_type` options are lowercase (`code128`, `code39`, etc.), breaking lookup. | Medium |

### 13.7 Stock locations / permissions — verified gaps

| Gap | PHP behavior | Next.js behavior | Severity |
|---|---|---|---|
| Permission-scoped locations | `Stock_location` joins `permissions` and `grants` to return only locations the employee is granted for a module; `is_allowed_location` enforces it. | `getAll` returns every non-deleted location; no permission scoping; default location is the first by id. | High |
| Creating a location | Inserts `permissions` rows for items/sales/receivings, grants every employee with the module's `menu_group`, and inserts zero `item_quantities` for all items. | `saveValue` only inserts the `stock_locations` row. | High |
| Deleting a location | Soft-deletes and removes related `permissions` rows. | Only soft-deletes; permissions become stale. | Medium |

### 13.8 Config tab / value mismatches

- `barcode_content` select option value is `number` but the code expects `item_number` (and PHP uses `item_number`). Selecting it breaks barcode generation.
- `barcode_type` select options are lowercase (`code39`, `code128`, `ean13`, `upca`) while the seed and the barcode lookup table expect uppercase keys (`C39`, `C128`, `EAN13`, `UPCA`).
- Many config keys referenced in PHP and in code are still not exposed as editable fields (full list is in §4); newly confirmed additions include `default_sales_discount_type`, `default_receivings_discount`, `default_receivings_discount_type`, `default_register_mode`, `line_sequence`, `derive_sale_quantity`, `work_order_enable`, `work_order_format`, `sales_quote_format`, `quote_default_comments`, `default_tax_jurisdiction`, `default_tax_2_cumulative`, `barcode_formats`, `allow_duplicate_barcodes`, `image_*`, `theme`, `hostname`, `enforce_privacy`, `gcaptcha_*`, `date_or_time_format`, `financial_year`, `currency_code`, `tax_id`, suggestion columns, and receipt/print-behavior keys.

### 13.9 RBAC enforcement gap

`requirePermission` checks `hasModuleGrant(moduleId)` and `hasModuleGrant(target)`. Because `hasModuleGrant` uses `LIKE '${moduleId} %'` with a literal space, it never matches PHP-style subpermissions such as `reports_sales`. Exact permission checks (e.g., `items_stock`, `sales_delete`) are therefore effectively ignored when the user already has the parent module grant, making subpermission enforcement broken.

---

*End of report.*
