# 13 — Version Delta: OSPOS 3.4.2 → 603b2c7 (post-3.4.3)

**Target:** `/home/yash/Desktop/yash/ospos-nextjs`
**Upstream:** `/home/yash/ospos`, HEAD `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`
**Range:** tag `3.4.2` → HEAD (`application_version` `3.4.2` → `3.4.4-dev`)
**Intermediate tag:** `3.4.3` = `35b68245a00bb66b40aea53e2be3478e4558854d`

Analysis only; no source modified. Paths are upstream-relative unless prefixed with the target root.

## 0. Method and status legend

The reference clone is shallow/grafted: `git log 3.4.2..HEAD -- app public tests composer.json
package.json` returns only `603b2c7`, `git rev-list --count 3.4.2..HEAD` is `1`, and
`git merge-base 3.4.2 HEAD` is empty. `git diff 3.4.2..HEAD` and `git diff 3.4.3..HEAD` work because
both trees exist, so **every conclusion below comes from diff content, not commit messages**.

| Range | Non-language files | Insertions | Deletions |
|---|---:|---:|---:|
| `3.4.2..HEAD` | 194 | 5,894 | 1,648 |
| `3.4.3..HEAD` | 123 | 2,381 | 698 |

Language files account for the remaining changed paths (the full stat is 1,320 files). The
3.4.2→3.4.3 language work is mostly quote style + alphabetical reordering + key parity, with a small
set of new English keys (Appendix B).

Two layers must be planned separately:

- **3.4.3 layer:** utf8mb4 migration, detailed item sales, item-search refactor, item-tax fixes,
  negative/Unicode validation, Appconfig batch cache fix, migration-helper hardening, AJAX 401,
  locale additions, tabular helper refactor, dependency bumps.
- **Post-3.4.3 layer (`3.4.4-dev`):** stock-location `is_default`/`sort_order` migration + model +
  config UI, gift-card refund credits, `Customer::saveCustomer` fix, `Item_taxes` table fix,
  `getMultipleInfo(null)`, item delete return simplification, explicit report-permission map,
  cashup refactor, receiving `reports_receivings` checks, migration lock, locale/version updates,
  language key-parity tests, PHP 8.5 constraint, npm `allowScripts`.

Status legend: **IMPLEMENTED** (equivalent behavior exists), **PARTIAL**, **ABSENT**, **N/A**
(stack-specific mechanism; functional outcome may still apply), **UNKNOWN**.

## 1. Executive summary (highest risk first)

1. **Stock locations gained default + sort order** (`is_default`, `sort_order`, unique index, dense
   0..N-1 range, two-phase CASE updates, permission-aware default lookup). This is new schema + model
   + config UI + tests and changes default location in item/sale/receiving flows. Target has none.
2. **Gift-card refunds now credit the card on completed returns**, skip suspended returns, and still
   reject empty card numbers. Target subtracts unconditionally and has no increment operation.
3. **Item search was rebuilt** around `SHOW_IN_SEARCH`, named attribute syntax, typed matching,
   attribute sorting, cross-location quantity sorting, and a low-inventory fix. Target still uses a
   single LIKE query and ignores `searchCustom`/`lowInventory`.
4. **Negative-value validation** for tax rates, item tax percents, CSV tax rows, and default config
   tax rates. Target accepts negatives and drops 0% tax rows due to truthiness.
5. **Receiving edit/delete/receipt/save require `reports_receivings`**. Target gates on `receivings`
   and has no edit/delete at all.
6. **Explicit report-permission map** replaces URL derivation and adds `detailed_item_sales` under
   `reports_sales`. Target registry mechanism is safe but missing the report and filters.
7. **Migration execution lock** (`GET_LOCK`) and login migration UX. Target `/api/migrate` is
   unauthenticated and runs `npm run db:migrate` without a lock.
8. **utf8mb4 conversion for MySQL 8.4** (39 tables), collision preflight, all-FK drop/recreate,
   people composite index.
9. **Appconfig batch writes are transactional with one post-commit cache refresh.** Target writes
   each key separately and mutates cache per key.
10. **New tests encode acceptance behavior** for search, stock locations, gift-card refunds, cashups,
    tax validation, config locations, query-failure degradation, and language key parity.

## 2. Sales

### S-1 Gift-card return credit — post-3.4.3, HIGH

**Old:** every gift-card payment called `decrementGiftcardValue($number, $amount)`. A return amount is
negative; the decrement rejects non-positive amounts, so the sale rolled back with
`INSUFFICIENT_GIFTCARD_BALANCE`. `[3.4.2] app/Models/Sale.php:585`, `[3.4.3] :583`.

**New:** `applyGiftcardPayment(?string $number, float $amount, int $saleType, string $saleStatus)`:
- `$isReturnCredit = saleType === SALE_TYPE_RETURN && amount < 0`
- return credit + status !== `COMPLETED` → `true` (no card change)
- empty number → `false`
- return credit → `incrementGiftcardValue(number, abs(amount))`
- otherwise → `decrementGiftcardValue(number, amount)`

Caller rolls back and returns `INSUFFICIENT_GIFTCARD_BALANCE` on `false`.
`[HEAD] app/Models/Sale.php:579-590`, `:702-719`.

**Target:** `src/lib/sale/sale-model.ts:95-103` does `value = gc.value - actualAmount` for every card
payment; no status guard, no empty check, no balance check, no increment. A suspended return credits
the card when it should not.

**Obligation:** implement all four branches with atomic increment/decrement, rollback on failure, and
an insufficient-balance sentinel surfaced to the register. New `SaleTest` cases (post-3.4.3) assert:
completed return +50 credit, suspended return unchanged, empty number fails without inserting a sale.

### S-2 `Giftcard::incrementGiftcardValue()` — post-3.4.3

```php
if ($amount <= 0.0) return false;
UPDATE giftcards SET value = value + <escaped amount>
 WHERE giftcard_number = ? AND deleted = 0;
return update() && affectedRows() > 0;
```
`[HEAD] app/Models/Giftcard.php:329-340`.

**Target:** no increment in `src/lib/giftcards/repository.ts`. **ABSENT.**
**Obligation:** positive-only, non-deleted-only, atomic SQL increment returning false when no row
changed. `tests/Models/GiftcardTest.php` (post) covers success, deleted, negative, zero.

### S-3 Customer discount sets `discount_type` — 3.4.3

New: `$item['discount_type'] = $discount_type;` in `Sale_lib::apply_customer_discount()`.
`[HEAD] app/Libraries/Sale_lib.php:1494-1500`.
**Target:** `src/lib/sale/sale-lib.ts:423-436` already sets `line.discountType`. **IMPLEMENTED.**

### S-4 `sort_and_filter_cart` → `sortAndFilterCart` + empty guard — 3.4.3

Old ran `array_multisort()` on a possibly empty filtered cart; new returns early when empty and
renames method/locals. `[3.4.2] app/Libraries/Sale_lib.php:190`, `[HEAD] :190-249`.
**Target:** `src/lib/sale/sale-lib.ts:681-692` uses filter/sort and is empty-safe. **IMPLEMENTED
equivalent.**

### S-5 Method renames

`get_info`→`getInfo`, `get_sale_items`→`getSaleItems`, `get_sale_payments`→`getSalePayments`
(`[HEAD] app/Models/Sale.php:43`, `:877`, `:943`). **Target:** `getSale`, `getSaleItems`,
`getSalePayments` (`src/lib/sale/sale-model.ts:289`, `294`, `304`). **IMPLEMENTED.**

### S-6 Temp-table GROUP BY qualification — 3.4.3

- `sales_items_taxes_temp`: qualified `sales_items_taxes.{sale_id,item_id,line}`
- `sales_payments_temp`: `payments.sale_id`
- main sale temp: `sales.sale_id, items.item_id, sales_items.line, sales_items.discount_type`
  (adds `discount_type`)

`[3.4.2] app/Models/Sale.php:1091`, `:1177`; `[HEAD] :1116`, `:1135`, `:1202`.

**Target:** no temp tables; report SQL is hand-written. **N/A mechanically**, but the grouping rules
are acceptance conditions for the detailed item sales report and cashup aggregation.

### S-7 Register `error_message` alert

New danger alert for `$error_message` (`[HEAD] app/Views/sales/register.php:52-54`).
**Target:** no error-message concept; `sale-model.ts` returns only a positive ID and has no
`INSUFFICIENT_*` constants. **ABSENT.** Obligation: surface gift-card/reward failures instead of
generic errors or silent success.

### S-8 `get_all_suspended` degrades to `[]` — 3.4.3

`return $query ? $query->getResultArray() : [];` (`[HEAD] app/Models/Sale.php:1219`).
**Target:** direct Drizzle query throws. **ABSENT.** New test (3.4.3) covers default, `NEW_ENTRY`,
and numeric customer branches.

### S-9 Item delete return semantics — post-3.4.3

Old ANDed update/inventory results; new returns only transaction status and narrows to `bool`
(`[HEAD] app/Models/Item.php:826-843`, `:865-886`). Target `deleteItem()` returns `void`
(`src/lib/items/repository.ts:384-400`). **PARTIAL**, low priority.

## 3. Items and search

### I-1 Search rewrite: one aggregate query → Phase A/Phase B — 3.4.3, HIGH

**Old** (`[3.4.2] app/Models/Item.php:145-286`): one builder with 30+ `MAX(...)` display selects,
mandatory `inventory` join and mandatory `BETWEEN` date filter, `GROUP_CONCAT` attribute selects,
`HAVING LIKE` for `search_custom`, and `COUNT(DISTINCT items.item_id)` for counts.

**New** (`[HEAD] app/Models/Item.php:314-570`):
1. Phase A `$idBuilder` selects only `items.item_id`, applies all filters/joins/group/sort/limit.
2. `countOnly` returns `$idBuilder->countAllResults()` before Phase B.
3. Phase B re-joins display tables scoped by `whereIn('items.item_id', $itemIds)` and re-applies the
   sort because `WHERE IN` + `GROUP BY` does not preserve order.
4. No IDs → `SELECT ... WHERE 1 = 0`.

Embedded fixes:
- **Low inventory:** only when `stock_location_id > -1`, and compare to the column:
  `where('item_quantities.quantity <=', new RawSql('items.reorder_level'))` (`:421-423`). Old used a
  string literal `'reorder_level'`.
- **Optional date range:** applied only when both dates are non-empty (`:336-351`, `:403`, `:595`).
- **Supplier `deleted` alias:** `MAX(suppliers.deleted) AS supplier_deleted` (`:563`).
- **Attribute GROUP_CONCAT:** prefix-qualified and scoped to the same definition IDs (`:598-606`).
- **Quantity sort across locations:** derived `SUM(quantity) GROUP BY item_id` joined before ordering
  by `MAX(total_quantity)`, avoiding multiplication by inventory rows (`:454-471`, `:570-593`).

**Target:** `src/lib/items/repository.ts:53-203` is one LIKE query with `orderBy(desc(items.itemId))`,
post-loads quantities/taxes/attributes, and a separate `count(*)`. It has no Phase A/B, no attribute
search, no low-inventory filter, no quantity sort, and no attribute sort.

**Obligation:** at minimum port the correctness fixes (location-scoped low-inventory as a column
comparison; default exclusion of `ITEM_TEMP`; optional date range; empty-result safety). Implement
cross-location quantity sort without multiplying by inventory rows (test expects 15 for 10+5 across
two locations with three inventory rows). Keep `foundRows === count(rows)`.

### I-2 Named attribute search + `SHOW_IN_SEARCH` — 3.4.3, HIGH

New `Attribute::SHOW_IN_SEARCH = 8` (`[HEAD] app/Models/Attribute.php:44`) and
`Item::parseAttributeSearch()` (`[HEAD] app/Models/Item.php:151-179`):

```php
$pattern = '/([[:alpha:]][[:alnum:] _-]*?)\s*:\s*([0-9]+,[0-9]+|[^\s,]+)(?:\s*,\s*|\s+(?:AND|OR)\s+)?/iu';
```

Supports `color:blue size:large`, `AND`/`OR`, and comma separators. `applyNamedAttributeSearch()`
(`:193-264`) maps lowercased definition names to IDs, accepts only allowed definition IDs, joins one
attribute pair per name, and matches:
- DECIMAL → `parse_decimals()` then `attribute_decimal`
- DATE → `DateTime::createFromFormat($config['dateformat'])` then `attribute_date`
- otherwise → `attribute_value`

Unconsumed `name:value` tokens become free text. With `search_custom`, free text matches attribute
value/date/decimal only (not item name/category). `Items::getSearch()` expands `definition_ids` to
`getDefinitionsByFlags(SHOW_IN_ITEMS | SHOW_IN_SEARCH)` when `search_custom` is set
(`[HEAD] app/Controllers/Items.php:135-139`); `Item::search()` resolves definitions with the same
union (`:354-355`).

**Target:** constants are only 1/2/4 (`src/lib/attributes/repository.ts:8-10`); `searchCustom` is
accepted but unused (`src/lib/items/repository.ts:42`); no parser; no search filter UI; no definition
IDs passed. **ABSENT.**

**Obligation:** add flag 8 to constants, form (`src/components/attributes/attribute-form.tsx:71-73`),
action map (`src/app/(secure)/attributes/actions.ts:26-28`), and table labels
(`src/components/attributes/attribute-table.tsx:8-13`). Fix `getDefinitionsByFlags()` semantics: target
uses all-bits `(flags & requested) = requested`, upstream uses any-bit truthy `definition_flags &
flags` and always excludes `GROUP`. With all-bits, a `1|8` union is wrong. Implement parser + typed
matching + unknown-attribute no-match + free-text fallback. Tests cover comma separators, date,
decimal, de_DE comma decimals, unknown names, and combined named/free-text search.

### I-3 Attribute sorting and numeric-key-safe allowlist — 3.4.3

New `itemSortColumns()` appends numeric definition IDs; attribute headers become sortable;
`sanitizeSortColumn()` flattens `array_key_first()` and compares strings because `array_merge()`
renumbers numeric keys; `Item::search()` treats a numeric sort as an attribute definition and applies
type-aware `MAX(...)` ordering.
`[HEAD] app/Helpers/tabular_helper.php:410-450`; `[HEAD] app/Controllers/Secure_Controller.php:76-88`;
`[HEAD] app/Models/Item.php:267-311`, `:458-465`, `:554-558`.

**Target:** no server sort; fixed `desc(items.itemId)` (`src/lib/items/repository.ts:111`), static
headers (`src/components/items/items-table.tsx:99-117`). **ABSENT.** If sorting is added, preserve
numeric definition IDs and never pass raw input to `orderBy`.

### I-4 `getItemDataRow()` signature / per-row query removal — 3.4.3

New `getItemDataRow(object $item, array $definitionNames, array $taxPercentsByItemId)`
(`[HEAD] app/Helpers/tabular_helper.php:453-530`). `Items::buildTaxPercentsByItem()` handles the
destination-tax path once and bulk-loads `Item_taxes::getInfoMultiple()` otherwise
(`[HEAD] app/Controllers/Items.php:168-213`). Missing item ID → `'-'`.

**Target:** `searchItems()` already bulk-loads taxes/attributes and stores `taxPercents` /
`attributeValues` (`src/lib/items/repository.ts:136-199`); table renders them. **IMPLEMENTED
equivalent** for the list. Barcode/item-row uses per-ID `getItemById` (`src/app/(secure)/items/actions.ts:261`),
functionally fine.

Tests (`GetItemDataRowTest`, 3.4.3): passed map is used without query; missing key → `'-'`; attribute
expansion; multi-pack name append.

### I-5 `Item_taxes` table name + `getInfoMultiple()` — post-3.4.3 / 3.4.3

Old model `$table = 'item_taxes'` (nonexistent; actual `items_taxes`). New `$table = 'items_taxes'`
plus bulk grouping (`[HEAD] app/Models/Item_taxes.php:12`, `:36-51`).
**Target:** table already `items_taxes` (`src/db/schema/items.ts:28`), and search bulk-groups taxes
(`src/lib/items/repository.ts:136-153`). **IMPLEMENTED equivalent.**

### I-6 `getMultipleInfo()` nullable location — post-3.4.3

New signature `getMultipleInfo(array $itemIds, ?int $locationId)`; null returns an empty result
(`items WHERE item_id = -1`). `[HEAD] app/Models/Item.php:698-705`; callers `Items.php:338-350`,
`:562-566`; `Item_lib.php:29-40`.
**Target:** returns all rows even when location is undefined
(`src/lib/items/repository.ts:503-512`), and is currently unused. **PARTIAL.** Decide null contract
before wiring it in.

### I-7 Attribute `getDefinitionNames(false)` group exclusion — post-3.4.3

`whereNotIn('definition_type', [GROUP])` instead of a bare string (`[HEAD] app/Models/Attribute.php:300-314`).
**Target:** no group filter parameter; returns all definitions (`src/lib/attributes/repository.ts:183-188`).
No upstream caller passes `false`, so **low impact**. Exclude GROUP when adding selectable attributes.

### I-8 Item tax validation: negative/zero/blank — 3.4.3 + post-3.4.3

Rules: `tax_names.* => permit_empty|max_length[255]|unicode_alpha_numeric_punct`,
`tax_percents.* => permit_empty|nonNegativeDecimal` (`[HEAD] app/Controllers/Items.php:701-756`).
Save only when name exists, trimmed name non-empty, percent numeric (`:854-865`).
CSV `save_tax_data()` returns false for a negative percent and saves zero when named (`:1479-1503`).
`nonNegativeDecimal('')` returns true (`[HEAD] app/Config/Validation/OSPOSRules.php:145-156`).

**Target:** Zod `percent: z.coerce.number()` with no min (`src/app/(secure)/items/actions.ts:43-46`);
save uses `if (t.name && t.percent)` so 0% is dropped (`src/lib/items/repository.ts:332-338`); CSV
uses truthiness and accepts negatives (`src/app/api/items/csv-import/route.ts` tax block); bulk update
has no tax fields (`actions.ts:139-143`).

**Obligation:** reject negative on save/bulk/CSV; persist 0% when named; allow blank name+blank
percent; skip blank name+percent; add max-length/punctuation validation. Acceptance tests:
`testPostSave_RejectsNegativeTaxPercent`, `_AcceptsZeroTaxPercent`,
`testPostBulkUpdate_RejectsNegativeTaxPercent`, `testSaveTaxData_RejectsNegativePercent`.

### I-9 Default stock location in inventory/count views — post-3.4.3

Controllers pass `$data['stock_location'] = getDefaultLocationId();`; views preselect it and its
quantity, falling back to `current(...)`.
`[HEAD] app/Controllers/Items.php:509-524`, `:538-553`; `form_inventory.php:64-80`;
`form_count_details.php:63-78`, `:103-106`.
**Target:** `InventoryForm` selects `locations[0]` (`src/components/items/inventory-form.tsx:14`);
no default. **ABSENT.** Depends on stock-location model work (SL-2/SL-4).

### I-10 Renames

`get_info`→`getInfo`, `get_multiple_info`→`getMultipleInfo`; `change_cost_price()` uses `getInfo()`.
**Target:** `getItemById`, `getMultipleInfo`, `changeCostPrice`. **IMPLEMENTED.**

## 4. Receiving

### R-1 `reports_receivings` required for edit/delete/receipt/save — post-3.4.3, HIGH

New checks in `getEdit`, `postDelete`, `getReceipt`, `postSave`:
`!$this->employee->has_grant('reports_receivings', $personId)` → redirect to
`no_access/receivings/reports_receivings` (GET) or 403 JSON (POST).
`[HEAD] app/Controllers/Receivings.php:235-244`, `:294-301`, `:424-433`, `:518-527`.
New key `Receivings.not_authorized`.

**Target:** all receiving pages use `requirePermission("receivings")`
(`src/app/(secure)/receivings/manage/page.tsx:8`, `receipt/[id]/page.tsx:9`,
`register/page.tsx:10`); no receiving edit/delete; `cancelReceiving` uses the module grant
(`actions.ts:132-136`). **ABSENT.**
**Obligation:** gate receipt viewing, cancellation/delete, and any save-over-existing on
`reports_receivings`; seed the grant; fail closed.

### R-2 Nullable default stock source/destination

New returns `?int`/`?string`; only sets session when non-null
(`[HEAD] app/Libraries/Receiving_lib.php:132-145`, `:234-248`). Same in `Item_lib`/`Sale_lib`.
**Target:** `src/lib/items/item-lib.ts:27-34` falls back to location 1 and ignores grants/default/sort.
**PARTIAL.** Make lookup permission-aware and nullable.

### R-3 Renames

`getInfo`/`getLocationName` on receiving paths. **Target:** equivalent. **IMPLEMENTED.**

## 5. Tax

### T-1 Negative tax rates — 3.4.3

New: `if (is_numeric($tax_rate) && $tax_rate < 0) return JSON failure`
(`[HEAD] app/Controllers/Taxes.php:373-380`), key `Taxes.tax_rate_non_negative`.
**Target:** `src/app/(secure)/taxes/actions.ts:10-23` and
`tax_jurisdictions/actions.ts:18` accept negatives; forms have no `min`
(`src/components/taxes/tax-rate-form.tsx:55`, `tax-jurisdiction-form.tsx:39`). **ABSENT.**
**Obligation:** reject negative in tax rate/jurisdiction/code-link saves, accept zero, add `min="0"`.

### T-2 Unicode/punctuation validation for tax names — 3.4.3

Tax codes, jurisdictions, and categories validate `max_length[255]|unicode_alpha_numeric_punct`
(`[HEAD] app/Controllers/Taxes.php:439-467`, `:489-521`, `:554-585`). Allowlist:
`~ ! # $ % & * - _ + = | : . space ' , / ( )` plus Unicode letters/marks/digits; `<`/`>` excluded
(`[HEAD] app/Config/Validation/OSPOSRules.php:212-235`).
**Target:** actions trim and write with no validation. **ABSENT.**
**Obligation:** same policy; accept accented/CJK/`/`/`()`/apostrophe/comma/space, reject angle
brackets/control chars. Tests: malicious rejected; `Impôt, incl.`, `GST/HST`, `VAT (20%)`, blank
tax-code name, `消費税` accepted.

### T-3 `nonNegativeDecimal` blank handling + punctuation — 3.4.3/post

Blank returns true (`[HEAD] app/Config/Validation/OSPOSRules.php:145-156`); `/`, `(` , `)` added to
the punctuation set. **Target:** no validator layer; `parseFloat('') || 0` treats blank as zero.
**ABSENT.** Treat empty optional input as valid; use the same punctuation set.

### T-4 Query-failure degradation — 3.4.3

`Tax::get_taxes()`, `Inventory_low::getData()`, `Sale::get_all_suspended()` return `[]` when the
query is `false` (`[HEAD] app/Models/Tax.php:130`; `Reports/Inventory_low.php:50`; `Sale.php:1219`).
**Target:** Drizzle queries throw; `runReport()` has no guard (`src/lib/reports/registry.ts:24-30`).
**ABSENT.** Tests `Inventory_lowTest`, `TaxTest`, `SaleTest::testGetAllSuspended...` expect empty
arrays. Decide empty-array vs thrown error; port tests only with degradation.

### T-5 Renames

`Tax_lib` uses `Customer::getInfo()`; **IMPLEMENTED** via direct lookups.

## 6. Attributes

### A-1 `SHOW_IN_SEARCH` — 3.4.3

Constants/model covered in I-2. UI contract: four visibility flags in the form, default all four for
new definitions, stored flags for existing, four labels in the table.
`[HEAD] app/Controllers/Attributes.php:255-286`; `[HEAD] app/Models/Attribute.php:44`.
**Target:** three flags (`attribute-form.tsx:71-73`, `attribute-table.tsx:8-13`,
`attributes/actions.ts:26-28`). **ABSENT.** Add flag to constants/form/action/table.

### A-2 Group exclusion and `whereNotIn`

Covered in I-7; upstream always excludes `GROUP` in `getDefinitionsByFlags()`, target does not.
Fix when adding search unions.

## 7. Reports

### RP-1 `Detailed_item_sales` — 3.4.3, HIGH

New model `app/Models/Reports/Detailed_item_sales.php`:
- `create($inputs)` → `Sale::create_temp_table($inputs)`
- columns: date, sale_id, sold_to, item, category, item_number, quantity, unit_price, discount,
  subtotal, tax, total, cost, profit, sold_by, payment_type, comments
- `getData()` from `sales_items_temp`, filters, order `sale_time, sale_id, line`
- `getSummaryData()` sums qty/subtotal/tax/total/cost/profit
- filter switch:
  - `complete` = COMPLETED + (POS|INVOICE|RETURN)
  - `quotes` = SUSPENDED + QUOTE
  - `work_orders` = SUSPENDED + WORK_ORDER
  - `canceled` = CANCELED
  - `returns` = COMPLETED + RETURN
  - `sales`/default = COMPLETED + (POS|INVOICE)
  - `location_id !== 'all'` → `item_location`
  - `discount_type !== 'all'` → `discount_type`
`[HEAD] app/Models/Reports/Detailed_item_sales.php:1-137`.

Routes: `reports/detailed_item_sales` → `dateInputItemSales`; 5-segment route →
`detailedItemSales` (`[HEAD] app/Config/Routes.php:32-33`).
Controller: `dateInputItemSales()` supplies locations + sale types + discount types and defaults
`sales`/`all` (`[HEAD] app/Controllers/Reports.php:730-744`); `detailedItemSales()` validates inputs,
creates temp data, formats rows, renders tabular with title `Reports.detailed_item_sales_report`
(`:1934-1988`). Listing inserts the link under `reports_sales`
(`[HEAD] app/Views/reports/listing.php:78-85`).

**Target:** no registry key (`grep -c detailed_item_sales src/lib/reports/registry.ts` = 0); report
filters are date-only (`src/components/reports/report-view.tsx:55-90`); no temp-table layer.
**ABSENT.**
**Obligation:** add report with line + summary output under `reports_sales`; implement sale-type,
location, and discount-type filters with exact status/type semantics (`complete` includes returns,
`sales` does not); group by sale/item/line/discount_type; add index link and export support.

### RP-2 Explicit permission map — post-3.4.3, HIGH

Old derived `$submoduleId` from URL segments with regexes, which had allowed double-decoded report
names to bypass grants (`[3.4.2] app/Controllers/Reports.php:82-92`). New map covers summary,
detailed, inventory, and specific reports, strips `graphical_` and `_graph`/`_row`, uses the grant
verbatim, and redirects to `no_access/reports/<grant>`.
`[HEAD] app/Controllers/Reports.php:84-121`.

Key new entry: `detailed_item_sales => reports_sales`.

**Target:** derives subpermission from the fixed registry definition
(`src/app/(secure)/reports/[key]/page.tsx:11-18`;
`export/route.ts:10-17`). Structurally safe; **IMPLEMENTED equivalent** for existing reports,
**PARTIAL** because the new report is missing and the index does not filter links by grants.
**Obligation:** add report with `permission: "reports_sales"`; never derive permission from
`params.key`; consider hiding unavailable report links.

### RP-3 Report input defaults/filters

New date input honors `$selected_sale_type` and `$selected_discount_type`
(`[HEAD] app/Views/reports/date_input.php:29-70`).
**Target:** no sale-type/location/discount filters; `sale-type-options` endpoint returns numeric IDs
unused by reports. **ABSENT.** Extend the filter model for the new report.

### RP-4 Summary/report GROUP BY qualification — 3.4.3

Qualified/complete groupings:
`Summary_report.php:61`, `:79`; `Summary_payments.php:153`, `:167`, `:187`;
`Sale.php:1116`, `:1135`, `:1202` (includes `discount_type`).
**Target:** no temp tables; grouping rules are acceptance conditions for RP-1 and cashups.

### RP-5 Loading feedback — 3.4.3

`loadingTemplate` spinner + `loadingFontSize` in `manage_tables.js:256-260`, `tabular.php:71-76`,
`tabular_details.php:65-70`, CSS `ospos.css:178-193`. **N/A/cosmetic** for TanStack.

## 8. Cashups

### C-1 Controller refactor + typed amounts — post-3.4.3

New `CashupAmounts` readonly object (open, transfer, closed cash, due, card, check)
(`[HEAD] app/TransferObjects/Cashups/CashupAmounts.php`). `Cashups.php` split into
`buildEmployeeLookup`, `normalizeCashupInfo`, `initializeNewCashup`, `isPendingClose`, `closeCashup`,
`buildReportDateRangeInputs`, `applyPaymentTotals`, `subtractCashExpenses`, `parseCashupDate`,
`getCashupAmountsFromPost`, `buildCashupSaveData`, `buildSaveResponse`, `calculateTotal`
(`[HEAD] app/Controllers/Cashups.php:79-400`).

Behavioral invariants asserted by post-3.4.3 tests:
1. Server recomputes total; client tampering ignored.
2. `open_employee_id`/`close_employee_id` forced to logged-in user.
3. New cashup prefills dates.
4. Closed cashup view does not recalculate.
5. Pending close aggregates summary payments by cash/due/card/check, starts cash at open+transfer,
   subtracts cash expenses, total = closed_cash − open − transfer + due + card + check.
6. AJAX total uses the same arithmetic formatted with `to_currency_no_money`.

**Target:** schema has only open/transfer/closed cash, note, single `employee_id`
(`src/db/schema/cashups.ts:5-14`); repository `calculateTotal` exists but is never called
(`src/lib/cashups/repository.ts:44-46`); save action parses only cash and a posted `employeeId`, never
recomputes or forces owner (`src/app/(secure)/cashups/actions.ts:10-35`); edit page has no aggregation
(`cashups/new/[id]/page.tsx`); form lacks due/card/check/total/description
(`src/components/cashups/cashup-form.tsx:1-90`). **ABSENT.**
**Obligation:** full schema + save/view logic above. Acceptance suite: six new
`CashupControllerTest` cases (tampered total, owner forcing, AJAX total, prefill, closed no-recalc,
payment/expense aggregation).

### C-2 Cashup dependencies

Upstream close path uses `Summary_payments::getData()` and `Expense::get_payments_summary()`, with
`date_or_time_format` deciding date truncation. **Target:** neither exists. **ABSENT.** Build an
equivalent aggregation returning `trans_group`/`trans_type`/`trans_amount` plus cash-expense
subtraction.

### C-3 Note escaping

Cashup note header `escape => false` (`[HEAD] app/Helpers/tabular_helper.php:876`). Target React
escapes. **N/A**; do not introduce raw HTML.

### C-4 Cashup list filters

Manage view refreshes on filter/daterangepicker changes (`[HEAD] app/Views/cashups/manage.php:16-27`).
**Target:** no filters (`src/app/(secure)/cashups/page.tsx`). **PARTIAL**, optional.

## 9. Stock locations and config

### SL-1 New `is_default` / `sort_order` — post-3.4.3, HIGH

New migration `20261023000000_AddStockLocationDefaultAndSortOrder`:
- `is_default TINYINT NOT NULL DEFAULT 0 AFTER deleted`
- `sort_order TINYINT UNSIGNED NULL DEFAULT NULL AFTER is_default`
- MySQL `@rank` backfill alphabetically (`location_name, location_id`) for `deleted = 0`
- `sort_order = NULL` for deleted rows
- oldest non-deleted location becomes default
- unique key on `sort_order`

`[HEAD] app/Database/Migrations/20261023000000_AddStockLocationDefaultAndSortOrder.php:13-58`;
down drops both (`:64-67`).

Invariants: active rows dense `0..N-1`; deleted rows NULL; unique index permits multiple NULLs but no
duplicate active position; upgrade order is alphabetical; oldest location is initial default.

**Target:** `src/db/schema/auth.ts:36-40` and `src/db/schema/mysql/index.ts:45-49` have only
id/name/deleted; no migration adds the columns; repository has no concepts. **ABSENT.**
**Obligation:** add columns + unique index in both dialects; backfill with a window function (SQLite)
or `@rank` (MySQL); NULL deleted; seed oldest default. Do not copy MySQL variables into SQLite.

### SL-2 `Stock_location` model contract — post-3.4.3, HIGH

| Method | Behavior | Ref |
|---|---|---|
| `getAll` | deleted=0, order `sort_order` | `Stock_location.php:55-62` |
| `getUndeletedAll($module)` | permission-scoped, order `sort_order` | `:68-80` |
| `getDefaultLocationId($module)` | permission join, order `is_default DESC, sort_order ASC LIMIT 1`, `?int` | `:138-156` |
| `setDefaultLocation` | validate non-deleted, transaction clear all then set one | `:160-186` |
| `saveSortOrder` | two-phase temp-offset CASE updates | `:192-215` |
| `runSortOrderCaseUpdate` | parameterized CASE + IN | `:217-243` |
| `saveValue` | insert: `COUNT(*) ... FOR UPDATE`, `sort_order = count`, 3 permissions, seed quantities; rename refreshes permissions | `:256-337` |
| `delete` | deleted=1, `sort_order=NULL`, compact survivors, delete permissions | `:354-391` |

Old `get_default_location_id()` ordered by nothing and fataled on no row; old `save_value()` had no
sort; old `delete()` only set deleted and removed permissions.

**Target:** `src/lib/stock_locations/repository.ts` orders by name (`:12-16`), default = lowest ID
with fallback 1 (`:27-33`), saveValue has no permissions/sort (`:38-48`), delete only sets deleted
(`:51-54`), no set-default/reorder/compaction. **ABSENT.**
**Obligation:** port full contract; permissions are required for permission-scoped defaults; two
passes are required to avoid unique-index collisions on rotation; `FOR UPDATE` or SQLite
serialization for next sort order.

Acceptance suite: `tests/Models/Stock_locationTest.php` (300 lines): default precedence, fallback,
null, set-default clears others, exact reorder, reverse rotation without collision, delete clears,
delete compacts dense range, delete after reorder, insert next sort.

### SL-3 Config stock-location manager — post-3.4.3, HIGH

New `Config::postSaveLocations()`:
1. Read `stock_location` (existing, keyed by ID) + `stock_location_new` (new rows).
2. Reject non-array/both-empty.
3. Keep numeric keys, trim names.
4. Transaction.
5. **Delete removed first** (reused name/permission collision).
6. Save existing (blank name keeps row unchanged), then new (real IDs).
7. Resolve `stock_location_order` tokens (`new-<n>` → inserted IDs), intersect survivors, append
   missing, call `saveSortOrder`.
8. Set default only if the ID survives.
9. Complete and return success.

`[HEAD] app/Controllers/Config.php:771-899`; views `stock_config.php:11-150`,
`partial/stock_locations.php:1-40`.

**Target:** static `stock` tab has only average price (`src/lib/config/tabs.ts:195-200`);
`saveLocationsAction()` targets nonexistent `stock_locations` tab (`config/actions.ts:48`) and
throws; no UI/create/delete/reorder/default. **ABSENT.**
**Obligation:** dedicated dynamic stock-location manager implementing the sequence above; acceptance
suite is ten `ConfigControllerTest` location cases (non-array, empty, add with 3 permissions,
rename, remove, blank keep, new-token reorder, valid default, ignore deleted default).

### SL-4 Default-location consumers — post-3.4.3

New nullable lookups in `Item_lib`, `Receiving_lib`, `Sale_lib`
(`[HEAD] app/Libraries/Item_lib.php:29-40`; `Receiving_lib.php:132-145`, `:234-248`;
`Sale_lib.php:926-941`).
**Target:** `src/lib/items/item-lib.ts:10`, `:27`, `:30-34` return numbers, ignore `kind`, fall back
to 1. **PARTIAL/ABSENT.** Need one permission-aware lookup per module and null handling.

### SL-5 Stock-location UI

Rows have drag handle, default radio, ID-keyed input, add/remove; new rows use
`stock_location_new[]` + `new-<n>`; jQuery sortable updates hidden `stock_location_order`; first
existing row auto-defaults; new rows cannot be default; validation keyed by `stock_location[<id>]`.
`[HEAD] app/Views/configs/stock_config.php:32-150`; `partial/stock_locations.php:10-35`.
**Target:** none. **ABSENT.** Part of SL-3.

## 10. Config, auth, security

### CFG-1 OSPOS default settings — 3.4.3

Adds `invoice_enable => '1'`, `work_order_enable => '0'` to the fallback defaults
(`[HEAD] app/Config/OSPOS.php:59-69`; test `tests/Config/OSPOSTest.php`).
**Target:** seed has invoice (`src/db/seed.ts:66`) but no `work_order_enable`; no default map.
**PARTIAL.** Add the key/default map; sale-type option logic should use them.

### CFG-2 `Appconfig::batch_save()` transactional + one refresh — 3.4.3

Old looped `$this->save([$key=>$value])`, which refreshed cache per key inside the transaction. New
loops `parent::save(['key'=>..., 'value'=>...])`, completes the transaction, and only on success
calls `config(OSPOS::class)->update_settings()`.
`[HEAD] app/Models/Appconfig.php:100-122`.

**Target:** `setConfig()` upserts one key and mutates cache immediately
(`src/lib/config/index.ts:47-54`); config actions loop fields (`config/actions.ts:9-32`), no
transaction, partial saves persist. **PARTIAL.**
**Obligation:** transactional tab save; cache refresh only after commit; rollback all on failure.
`tests/Models/AppconfigTest.php` asserts all keys persist and cache sees them.

### CFG-3 Negative default tax rates — 3.4.3

`Config::postSaveTax()` rejects numeric negatives with `Config.default_tax_rate_non_negative`
(`[HEAD] app/Controllers/Config.php:951-979`).
**Target:** generic tab save, no validation (`config/actions.ts`; tax inputs no min
`src/lib/config/tabs.ts:68-79`). **ABSENT.** Reject negative, accept zero. Tests:
`testSaveTax_RejectsNegativeDefaultTaxRate`, `_RejectsNegativeDefaultTaxRate2`,
`_AcceptsZeroDefaultTaxRate`.

### AUTH-1 AJAX session expiry 401 JSON — 3.4.3

`IsLoggedIn::before()` returns `401 {"success":false,"message":"Session expired..."}` for AJAX
instead of redirecting (`[HEAD] app/Filters/IsLoggedIn.php:13-30`).
**Target:** many API routes return 401, but no global client handler exists (`grep` for
`status === 401` in client code returns nothing). **PARTIAL.**
**Obligation:** central client response wrapper → redirect `/login` (preserve path); consistent 401
JSON from APIs.

### AUTH-2 Global `ajaxError` 401 redirect — 3.4.3

`$(document).ajaxError` redirects on 401 (`[HEAD] app/Views/partial/header_js.php:67-71`).
**Target:** no global fetch handler. **ABSENT.** Covered by AUTH-1.

### AUTH-3 Filter order — 3.4.3

Globals order changed to `honeypot, isLoggedIn, csrf, invalidchars`
(`[HEAD] app/Config/Filters.php:78-82`; `[3.4.2] :75-80`). Effect: expired session is not reported as
a CSRF failure. **N/A mechanically**, preserve the outcome.

### AUTH-4 Migration lock + login UX — post-3.4.3, HIGH

`MY_Migration::runLocked()` uses `GET_LOCK('ospos_migrations_'.md5(dbName), 0)`, throws on
non-1, runs `migrateToCI4()` + `latest()`, releases in `finally`
(`[HEAD] app/Libraries/MY_Migration.php:66-90`). Login HTML POST and JSON `migrate()` use it; lock
failure becomes validation error `Login.migration_running` or HTTP 202 with that message
(`[HEAD] app/Controllers/Login.php:60-85`, `:127-155`).

**Target:** `/api/migrate` runs `execSync("npm run db:migrate")` with no lock and is explicitly
exempt from auth (`src/app/api/migrate/route.ts:6-14`; `src/lib/auth/options.ts:61`);
`src/db/migrate.ts` has no guard; login has no migration-state check. **ABSENT.**
**Obligation:** serialize migrations (MySQL `GET_LOCK`; SQLite file/advisory lock or
`BEGIN IMMEDIATE`); return distinguishable "already in progress" (202/UI state); require admin
credentials unless confirmed empty new install; add login migration-state detection; do not abort on
client disconnect.

### AUTH-5 `sanitizeSortColumn` numeric keys — 3.4.3

Covered in I-3. Security property: only allowlisted columns reach `ORDER BY`.

### AUTH-6 Receiving/report authorization

Covered in R-1 and RP-2.

## 11. Migrations and database

### DB-1 utf8mb4 conversion — 3.4.3, HIGH

`up()`: collision preflight → `dropAllForeignKeyConstraints()` (all FKs) → drop `people.first_name`
index if present → execute 39-statement SQL → add composite
`people(first_name(191), last_name(191), email(191), phone_number(191))` → on throwable log FKs,
attempt restore, rethrow → on success restore FKs. `down()` is intentionally empty.
`[HEAD] app/Database/Migrations/20260405000000_Mysql84Utf8mb4Conversion.php:9-46`.

Collision preflight selects single-column unique indexes on char/varchar/text columns and groups
`CONVERT(col USING utf8mb4) COLLATE utf8mb4_unicode_520_ci` with count > 1, throwing an actionable
list (invisible Unicode characters such as U+200E can otherwise abort an `ALTER` mid-run)
(`:60-105`).

SQL: 39 `ALTER TABLE ... CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci`, hardcoded
`ospos_` prefix: `app_config, attribute_definitions, attribute_links, attribute_values, cash_up,
customers, customers_packages, customers_points, dinner_tables, employees, expenses,
expense_categories, giftcards, grants, inventory, items, items_taxes, item_kits, item_kit_items,
item_quantities, migrations, modules, people, permissions, receivings, receivings_items, sales,
sales_items, sales_items_taxes, sales_payments, sales_reward_points, sales_taxes, sessions,
stock_locations, suppliers, tax_categories, tax_codes, tax_jurisdictions, tax_rates`.
`[HEAD] app/Database/Migrations/sqlscripts/3.4.3_mysql84_utf8mb4_conversion.sql:1-41`.

**Target:** no collation declarations in `drizzle/`, `src/lib/db`, or `drizzle.config.mysql.ts`;
MySQL DDL uses defaults. Default runtime is SQLite and `getDbSync()` throws for MySQL
(`src/lib/db/index.ts:7-30`). **ABSENT for MySQL; N/A for SQLite.**
**Obligation if MySQL is in scope:** convert all target tables (including `cart_sessions`) to
utf8mb4/utf8mb4_unicode_520_ci; collision preflight; FK drop/recreate; composite people index; no
lossy rollback. If not in scope, record it explicitly.

**Unknowns:** desired collation; target-only tables; handling of generated
`attribute_links.generated_unique_column`; async MySQL support.

### DB-2 `fix_keys_for_db_upgrade` no longer re-adds FK

Removed re-add of `ospos_sales_items_taxes_ibfk_1`
(`[HEAD] app/Database/Migrations/20240630000001_fix_keys_for_db_upgrade.php:54-61`).
**Target:** no equivalent history. **N/A**; if importing an OSPOS MySQL DB, ensure this FK is absent.

### DB-3 Migration helper hardening — 3.4.3

Optional `BaseConnection $db` on `executeScript`, `overridePrefix`, `dropAllForeignKeyConstraints`,
`indexExists`, `primaryKeyExists` (`[HEAD] app/Helpers/migration_helper.php:14`, `:88`, `:137`,
`:270`, `:306`); all migrations pass `$this->db` (post-3.4.3 plumbing only).

`dropAllForeignKeyConstraints()`:
- no args → all FKs in schema (used by utf8mb4)
- query-builder scoped subquery instead of interpolation
- `ORDINAL_POSITION` composite FK support (column arrays)
- **throws `DatabaseException` on metadata-query failure** instead of treating it as "no FKs"
- `try/finally` restores DB prefix
- `indexExists`/`primaryKeyExists` likewise throw

`[HEAD] app/Helpers/migration_helper.php:137-249`, `:270-326`, `:348-405`.
**Target:** Drizzle, **N/A mechanically**; mirror the failure contract in any TS metadata helper.
Test `migration_helperTest` (3.4.3) expects `DatabaseException` from all three.

### DB-4 Seeder docblock typo

`dataCache['table_names'']` → `dataCache['table_names']`, no behavior
(`[HEAD] app/Database/Seeds/TestDatabaseBootstrapSeeder.php:36`). **N/A.**

## 12. UI, views, JavaScript

Most view diffs are responsive-grid classes, `label.required` → `text-danger required`, textarea
`resize: vertical`, `<b>` → `<strong>`, and nested-label → `<p>` fixes. Functional/UI-contract items:

| ID | Delta | Ref | Target / status |
|---|---|---|---|
| UI-1 | Tables refresh on filter/daterangepicker change; daterangepicker binds `apply` (presets do not fire `change`) | `items/manage.php:28-42`, `expenses/manage.php:16-26`, `cashups/manage.php:16-27`, `partial/daterangepicker.php:109-116`, `:220-227` | Items checkboxes navigate; expenses/cashups lack filters; no items date range — PARTIAL |
| UI-2 | Month arrays use `Calendar.mayl` (full month), not `Calendar.may` (abbrev.) | `datepicker_locale.php:60`, `daterangepicker.php:92`, `:201` | Native date inputs — N/A |
| UI-3 | Inventory/count views preselect default location + quantity | `form_inventory.php:64-80`, `form_count_details.php:63-78`, `:103-106` | First location only (`inventory-form.tsx:14`) — ABSENT |
| UI-4 | Stock-location config drag/default/add/remove/order field | `stock_config.php:32-150`, `partial/stock_locations.php:10-35` | None — ABSENT |
| UI-5 | System-info rewrite: copy notify, timezone comparison, extension status, bug-report link; keys `system_info_copy*` | `system_info.php:1-225` | No page/clipboard — ABSENT (low) |
| UI-6 | Branding hardcoded to OSPOS; `powered_by` takes `{app}`/`{version}`; footer literal copyright | `login.php:23-62`, `:159-170`, `:185-200`; `partial/header.php:19`; `partial/footer.php:12-20` | Custom Next branding — N/A |
| UI-7 | Config layout/required markers; `<p>` instead of nested `<label>`; `rel="noopener"`; swapped `print_delay` messages; removed `label.required` CSS | all layout-only `configs/*`; `ospos.css:146-193` | Tailwind — N/A (message fix applies) |
| UI-8 | Sales register alert for `error_message` | `sales/register.php:52-54` | No error path — ABSENT (S-7) |
| UI-9 | Invoice/quote email CSS inlined; item-kit duplicate message key; system-config tab title; config debug inject comments; loading spinner; `clipboard.min.js` deleted | `invoice_email.php:25`, `quote_email.php:22`, `item_kits/form.php:288`, `system_config.php:1-8`, `configs/manage.php:1-9`, `manage_tables.js:256-260`, `tabular.php:71-76` | React PDF/TanStack/custom UI — N/A |

## 13. Tests and dependencies

### 13.1 Acceptance tests (upstream)

| Test | Layer | Behavior encoded | Target |
|---|---|---|---|
| `tests/Models/ItemSearchTest.php` | 3.4.3; bootstrap post | Name/id/category search, deleted/temp filters, location filter, pagination, order after Phase B, empty result, cross-location quantity sum, named attributes (space/comma/free-text/decimal/date/locale/unknown) | ABSENT |
| `tests/Models/ItemTaxesMultipleTest.php` | 3.4.3; bootstrap post | Taxes grouped by item; omitted item absent; empty input `[]` | PARTIAL |
| `tests/Helpers/GetItemDataRowTest.php` | 3.4.3 | Passed tax map, dash fallback, attribute expansion, pack-name append | PARTIAL |
| `tests/LanguageFilesTest.php` | 3.4.3; key parity/order/dup post | Parse, exact English key parity, alphabetical order (Calendar exempt), no duplicates, locales match dirs, `get_languages()` match dirs | ABSENT |
| `tests/Config/OSPOSTest.php` | 3.4.3 | Defaults include `invoice_enable`, `work_order_enable` | PARTIAL |
| `tests/Models/AppconfigTest.php` | 3.4.3 | Batch save persists all + refreshes cache; single save refreshes | PARTIAL |
| `tests/Controllers/TaxesControllerTest.php` | 3.4.3 | Tax code/category/jurisdiction XSS rejection; Unicode/slash/parens/blank acceptance; negative rate rejection | ABSENT |
| `tests/Controllers/ItemsControllerTest.php` | 3.4.3 + post | Negative item/bulk percent rejected; zero accepted; CSV negative fails row | ABSENT/PARTIAL |
| `tests/Models/Reports/Inventory_lowTest.php` | 3.4.3 | `getData()` returns `[]` on query failure | ABSENT |
| `tests/Models/TaxTest.php` | 3.4.3 | `get_taxes()` returns `[]` on query failure | ABSENT |
| `tests/Models/SaleTest.php` | base + 3.4.3 + post | Gift-card sentinels, stock, delete restore, `get_all_suspended` `[]` on failure (3.4.3); return credit/suspended skip/empty number (post) | ABSENT |
| `tests/Models/GiftcardTest.php` | post | Increment success; deleted/negative/zero fail | ABSENT |
| `tests/Models/Stock_locationTest.php` | post | Default precedence/fallback/null, set-default clears others, reorder, rotation collision, delete clears/compacts, insert next sort | ABSENT |
| `tests/Models/ItemTest.php` | base + post | Null location empty; matching location row | PARTIAL |
| `tests/Controllers/CashupControllerTest.php` | base + post | Server total, owner forcing, AJAX total, prefill, closed no-recalc, payment/expense aggregation | ABSENT |
| `tests/Controllers/ConfigControllerTest.php` | renamed + post | Existing mailpath/theme validation; negative tax; location CRUD/reorder/default | ABSENT/PARTIAL |
| `tests/Helpers/migration_helperTest.php` | 3.4.3 | Metadata query failure throws `DatabaseException` | N/A (mirror in TS) |
| `tests/Helpers/{UrlHelperTest,LocaleHelperTest}.php`, `tests/helpers/security_helperTest.php`, `tests/Libraries/CI3SecretConverterTest.php` | moved/namespaced | No production delta in range | N/A |
| `tests/Support/*` | 3.4.2/3.4.3/post | Admin auth, DB reset, cashup/expense/item/sale/tax fixtures, failing query, OSPOS config injection | ABSENT (target bootstrap differs) |

Bootstrap-only changes (no behavior): `CustomersCsvImportTest`, `EmployeesControllerTest`, `HomeTest`,
`ItemKitsControllerTest`, `ReportsControllerTest`, `SalesControllerTest`, `Sale_libPaymentTest`,
`CustomerRewardPointsTest`, `ItemBulkUpdateTest`, `ItemQuantityTest`, `Summary_taxes_test`,
`OSPOSRulesTest`; they replace per-class seeders with `resetDatabaseOnce()` and hand-built OSPOS mocks
with `OsposConfigFixtureTrait`.

### 13.2 Test-infrastructure obligations

If test parity is gated: add one-time DB reset per file, admin/employee grant fixtures,
item/attribute/quantity/sale/payment/expense/cashup/tax fixtures, a failing-query wrapper, and an
OSPOS-config injection helper (config cache is module-global).

### 13.3 composer.json

No change to `codeigniter4/framework` (4.7.4), `dompdf/dompdf` (^3.1.6), or
`picqer/php-barcode-generator` (^2.4.0). PHP constraint becomes
`>=8.2.35 <8.3 || >=8.3.36 <8.4 || >=8.4.27 <8.5 || >=8.5.12 <8.6` (8.5 added post-3.4.3).
`ezyang/htmlpurifier` ^4.17→^4.19. Removed: `laminas/laminas-escaper`,
`paragonie/random_compat`, dev `fakerphp/faker`, `mikey179/vfsstream`, `predis/predis`. Dev bumps:
`codeigniter/coding-standard` ^1.8→^1.9, `friendsofphp/php-cs-fixer` ^3.47.1→^3.95,
`nexusphp/cs-config` ^3.6→^3.29. Autoload adds `Config\ => app/Config/`.
`[HEAD] composer.json:23-52`. **Target:** no Composer; **N/A**.

### 13.4 package.json

Version `3.4.2`→`3.4.4-dev`; node engine `>=20`→`>=22`. Bumps: `bootstrap-table` ^1.23.5→^1.27.3,
`dompurify` ^3.4.13→^3.4.17, `jquery-ui-dist` ^1.12.1→^1.13.3, `jquery-validation` ^1.19.5→^1.22.1,
`jspdf-autotable` ^5.0.7→^5.0.9. Removed: `coffeescript`, `es6-promise`, `gulp-clean`,
`gulp-debug`, `gulp-gzip`, `gulp-header`, `gulp-rename`, `gulp-run`, `readable-stream`,
`stream-series`. Added post-3.4.3: `allowScripts: {"core-js@3.50.0": true}`. `clipboard ^2.0.11`
remains despite the vendored file deletion. `[HEAD] package.json:1-82`. **Target:** Next 16/React 19/
TanStack/Drizzle; **N/A** for direct porting; confirm Node engine and avoid removed build packages.

## 14. Critical algorithm excerpts

### 14.1 Item search old → new

Old (`[3.4.2] app/Models/Item.php:145-286`, abridged):

```php
$builder = $this->db->table('items AS items');
if ($count_only) $builder->select('COUNT(DISTINCT items.item_id) AS count');
else { $builder->select('MAX(items.item_id) AS item_id'); /* 30+ MAX selects */ }
$builder->join('suppliers AS suppliers', 'suppliers.person_id = items.supplier_id', 'left');
$builder->join('inventory AS inventory', 'inventory.trans_items = items.item_id');
$where = empty($config['date_or_time_format'])
    ? 'DATE_FORMAT(trans_date, "%Y-%m-%d") BETWEEN ' . $this->db->escape($filters['start_date']) . ' AND ' . $this->db->escape($filters['end_date'])
    : 'trans_date BETWEEN ...';
$builder->where($where);
if ($attributes_enabled) { $builder->select("GROUP_CONCAT(...)"); /* attribute joins */ }
if ($filters['low_inventory']) $builder->where('quantity <=', 'reorder_level');
if ($count_only) return $builder->get()->getRow()->count;
$builder->groupBy('items.item_id'); $builder->orderBy($sort, $order);
```

New (`[HEAD] app/Models/Item.php:314-570`, abridged):

```php
$applyTransDateRange = function ($builder) use (...) {
    if (!$hasTransDateRange) return;
    $column = $dateFormatEnabled ? 'DATE_FORMAT(trans_date, "%Y-%m-%d")' : 'trans_date';
    $builder->groupStart(); $builder->where("$column >=", $rangeStart);
    $builder->where("$column <=", $rangeEnd); $builder->groupEnd();
};
$idBuilder = $this->db->table('items AS items');
$idBuilder->select('items.item_id');
if ($customAttributeSearch) { /* attribute joins scoped by definition_ids */ }
/* filters, group by items.item_id, sort, limit */
if ($countOnly) return $idBuilder->countAllResults();
$itemIds = array_column($idBuilder->get()->getResultArray(), 'item_id');
if (empty($itemIds)) return $this->db->table('items AS items')->where('1 = 0')->get();
$builder = $this->db->table('items AS items');
/* display selects, joins, optional date range, attribute GROUP_CONCAT */
$builder->whereIn('items.item_id', $itemIds);
$builder->groupBy('items.item_id');
/* re-apply order because WHERE IN + GROUP BY does not preserve Phase A order */
return $builder->get();
```

### 14.2 Stock location default/reorder/delete

`[HEAD] app/Models/Stock_location.php:146-155`:

```php
$builder->orderBy('stock_locations.is_default', 'DESC');
$builder->orderBy('stock_locations.sort_order', 'ASC');
$builder->limit(1);
return $builder->get()->getRow()?->location_id;
```

Old `[3.4.2] :134-150` ordered by nothing and dereferenced null.

Reorder (`:192-243`):

```php
$tempOffset = count($orderedLocationIds);
$this->db->transStart();
$this->runSortOrderCaseUpdate($table, $orderedLocationIds, $tempOffset);
$this->runSortOrderCaseUpdate($table, $orderedLocationIds, 0);
$this->db->transComplete();
```

`runSortOrderCaseUpdate()` binds `CASE location_id WHEN ? THEN ? ... END` plus `IN` placeholders; two
passes avoid unique-index collisions on reverse rotations.

Insert (`:263-270`): `SELECT COUNT(*) ... WHERE deleted = 0 FOR UPDATE`, then
`sort_order = count`. Delete (`:360-381`): `deleted=1, sort_order=NULL`, compact survivors through
the same two-pass update, delete permissions.

### 14.3 utf8mb4 migration

`[HEAD] app/Database/Migrations/20260405000000_Mysql84Utf8mb4Conversion.php:11-46`:

```php
$this->assertNoCollationCollisions();
$foreignKeys = dropAllForeignKeyConstraints();
try {
  if (indexExists('people', 'first_name')) $this->db->query('ALTER TABLE ... DROP INDEX first_name');
  $script = APPPATH . 'Database/Migrations/sqlscripts/3.4.3_mysql84_utf8mb4_conversion.sql';
  if (!executeScript($script, false, $this->db)) throw new RuntimeException('... failed ...');
  if (!$this->db->query('ALTER TABLE ... ADD INDEX(`first_name`(191), `last_name`(191), `email`(191), `phone_number`(191))'))
    throw new RuntimeException('Failed to add composite index on people table');
} catch (\Throwable $e) {
  log_message('error', 'utf8mb4 conversion failed; recovering dropped foreign keys: ' . json_encode($foreignKeys));
  try { recreateForeignKeyConstraints($foreignKeys); } catch (\Throwable $r) { log_message('error', ...); }
  throw $e;
}
recreateForeignKeyConstraints($foreignKeys);
```

Collision preflight groups converted values under `utf8mb4_unicode_520_ci` and throws an actionable
list before altering (`:60-105`). SQL is 39 `ALTER TABLE ... CONVERT` statements, hardcoded `ospos_`.

## 15. Target implementation checklist (relative to target root)

- **Items/search:** `src/lib/items/repository.ts`, `src/app/(secure)/items/page.tsx`,
  `src/components/items/items-table.tsx`, `src/app/(secure)/items/actions.ts`,
  `src/app/api/items/csv-import/route.ts`, `src/components/items/item-form.tsx`,
  `inventory-form.tsx`, `items/[id]/inventory/page.tsx`.
- **Attributes:** `src/lib/attributes/repository.ts`, `components/attributes/attribute-form.tsx`,
  `attribute-table.tsx`, `src/app/(secure)/attributes/actions.ts`.
- **Sales/gift cards:** `src/lib/sale/sale-model.ts`, `src/lib/giftcards/repository.ts`,
  `src/lib/sale/sale-lib.ts`, `src/app/(secure)/sales/actions.ts` + register components.
- **Receiving:** `src/app/(secure)/receivings/actions.ts`, `manage/page.tsx`,
  `receipt/[id]/page.tsx`, `register/page.tsx`, `src/lib/receiving/receiving-lib.ts`,
  `src/lib/items/item-lib.ts`.
- **Tax:** `src/app/(secure)/{taxes,tax_jurisdictions,tax_codes,tax_categories}/actions.ts`,
  `src/lib/taxes/repository.ts`, `src/lib/tax/index.ts`, `src/components/taxes/*`.
- **Reports:** `src/lib/reports/registry.ts`, `src/components/reports/report-view.tsx`,
  `src/app/(secure)/reports/{page.tsx,[key]/page.tsx,[key]/export/route.ts}`,
  `src/app/api/reports/sale-type-options/route.ts`.
- **Cashups:** `src/db/schema/cashups.ts`, `src/lib/cashups/repository.ts`,
  `src/app/(secure)/cashups/actions.ts`, `cashups/new/[id]/page.tsx`,
  `src/components/cashups/{cashup-form,cashups-table}.tsx`, new migrations.
- **Stock/config:** `src/db/schema/auth.ts`, `src/db/schema/mysql/index.ts`,
  `src/lib/stock_locations/repository.ts`, `src/lib/items/item-lib.ts`,
  `src/lib/config/tabs.ts`, `src/app/(secure)/config/{actions.ts,page.tsx}`,
  `src/components/config/config-tabs.tsx`, new stock-location manager/migrations.
- **Config/auth/migrations:** `src/lib/config/index.ts`, `src/db/seed.ts`,
  `src/lib/auth/{options.ts,with-permission.ts}`, `src/app/api/migrate/route.ts`,
  `src/db/migrate.ts`, client API wrapper, `src/lib/i18n/index.ts`, `src/messages/`.
- **Tests:** `src/lib/items/repository.test.ts`; new stock-location/giftcard/cashup/config/tax tests;
  `e2e/{items,reports,cashups,config,receivings,giftcards,attributes}.spec.ts`.

## 16. Unknowns / plan decisions

1. **MySQL scope:** SQLite-first; `getDbSync()` throws for MySQL (`src/lib/db/index.ts:29-34`).
   Decide whether utf8mb4 and an async MySQL repository path are in scope.
2. **Table prefix:** upstream SQL hardcodes `ospos_`; target tables are unprefixed + `cart_sessions`.
3. **SQLite sort order:** `@rank` is MySQL-only; use `ROW_NUMBER()` or a JS migration. Choose plain
   unique + NULL vs partial unique index for active rows.
4. **Cashup schema:** target has one `employee_id`; upstream has open/close employee IDs. Choose
   rename/backfill vs additive columns.
5. **Report architecture:** SQL templates vs temp-table service; semantics fixed, mechanism free.
6. **Permission naming:** target report keys/permissions differ from upstream; decide normalize vs
   preserve. `detailed_item_sales` must use `reports_sales`.
7. **`reports_receivings` grant:** may not exist in target seed/RBAC; add it or non-admins lose
   receipt access.
8. **i18n:** messages are empty `{}`, `locales = ["en"]`; target has `bn` (not upstream) and
   `hr-HR` (upstream `hr`). Decide whether key-parity tests are portable.
9. **Config tab model:** static `CONFIG_TABS` cannot host dynamic location rows; choose dedicated
   page vs new row-list type. `saveLocationsAction()` is already broken.
10. **`getDefinitionsByFlags()` semantics:** all-bits → any-bits affects callers; audit and add a
    union helper.
11. **Tax punctuation policy:** React escaping changes XSS outcome; decide whether to enforce the
    upstream allowlist at write time.
12. **Error degradation:** upstream returns `[]`; Next error boundaries throw. Port tests only with
    empty-array behavior, or mark divergence.
13. **Location persistence:** target stores per-person location in `app_config`; upstream uses
    session. Adapt nullable default without losing persistence.
14. **SQLite migration lock:** choose a lock file/advisory lock and test concurrent invocation.
15. **System-info/clipboard/version:** use native Clipboard API if added; upstream version is
    `3.4.4-dev`, target exposes no version constant.

## Appendix A — English language keys

New functional keys:

| File | Keys |
|---|---|
| `Attributes.php` | `show_in_search`, `show_in_search_visibility` |
| `Config.php` | `default_tax_rate_non_negative`, `stock_location_default`, `stock_location_default_header`, `stock_location_name_header`, `system_info_copy`, `system_info_copy_error`, `system_info_copy_success` |
| Other files | `Employees.unauthorized_modify`, `Items.tax_percent_non_negative`, `Receivings.not_authorized`, `Reports.detailed_item_sales_report`, `Taxes.jurisdiction_id`, `Taxes.tax_rate_non_negative` |

Removed keys (no remaining `lang()` call sites in `app/`):

| File | Keys |
|---|---|
| `Common.php` | `copyrights`, `logout`, `migration_needed`, `phone_number_required`, `software_short`, `software_title`, `website` |
| `Item_kits.php` | `item_number`, `item_number_duplicate` |
| `Sales.php` | `cash_1`, `cash_2`, `cash_3`, `cash_4`, `close`, `complete`, `current_table`, `customers_available_points`, `customer_total_spent`, `daily_sales`, `date_type`, `delete_entire_sale`, `discard_quote`, `discount_short`, `edit_sale`, `giftcard_filter`, `invoice_update`, `mc`, `no_filter`, `remove_discount`, `rewards_balance`, `sale_by_invoice`, `sale_for_customer`, `sales_total`, `service_charge`, `show_due`, `visa`, `wholesale` |

Message semantics:

- `Common.powered_by`: `Powered by` → `Powered by {app} {version}`.
- `Config.print_delay_autoreturn_number`/`_required`: swapped; number now "must be a number",
  required now "required field".
- Locale registry: `hr-HR` → `hr`; add `ka`, `sw-KE`, `sw-TZ` to `Config\App::$supportedLocales`;
  `get_languages()` adds Georgian and renames Croatian.
- All language files reformatted (double→single quotes, alphabetical); post-3.4.3
  `LanguageFilesTest` enforces exact key parity, order, and no duplicates.
*End of report.*

