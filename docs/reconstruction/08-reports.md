# 08 — Reports subsystem: upstream reconstruction and target parity analysis

Analysis agent I. Scope: the entire reports subsystem of OSPOS 3.4.3 (upstream) and the
corresponding surface in `ospos-nextjs` (target). Analysis only; no source files were modified.
Every claim below is cited to a file and line. Upstream root is `/home/yash/ospos`
(commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`); target root is
`/home/yash/Desktop/yash/ospos-nextjs`.

Terminology: "report key" means the URL method suffix used by upstream
(`summary_sales`, `graphical_summary_sales`, `detailed_sales`, `specific_customers`, …), which is
also the value matched against the permission map in `app/Controllers/Reports.php:85-106`.

---

## 1. Method and scope

Files read in full:

| Upstream path | Lines | Role |
|---|---|---|
| `app/Controllers/Reports.php` | 2241 | all report routes and controller methods |
| `app/Models/Reports/Report.php` | 35 | abstract report contract |
| `app/Models/Reports/Summary_report.php` | 235 | shared summary query builder + temp tables |
| `app/Models/Reports/Summary_sales.php` | 49 | summary by day |
| `app/Models/Reports/Summary_categories.php` | 60 | summary by item category |
| `app/Models/Reports/Summary_expenses_categories.php` | 70 | expenses by category |
| `app/Models/Reports/Summary_customers.php` | 60 | summary by customer |
| `app/Models/Reports/Summary_suppliers.php` | 60 | summary by item supplier |
| `app/Models/Reports/Summary_items.php` | 64 | summary by item |
| `app/Models/Reports/Summary_employees.php` | 60 | summary by employee |
| `app/Models/Reports/Summary_taxes.php` | 126 | summary by tax name+percent |
| `app/Models/Reports/Summary_sales_taxes.php` | 75 | sales-tax jurisdiction report |
| `app/Models/Reports/Summary_discounts.php` | 49 | discount histogram |
| `app/Models/Reports/Summary_payments.php` | 191 | payment / transaction grouping |
| `app/Models/Reports/Inventory_low.php` | 61 | low-stock list |
| `app/Models/Reports/Inventory_summary.php` | 117 | inventory valuation |
| `app/Models/Reports/Detailed_item_sales.php` | 137 | flat item-line sales |
| `app/Models/Reports/Detailed_receivings.php` | 181 | receivings with details |
| `app/Models/Reports/Detailed_sales.php` | 265 | sales with per-sale details |
| `app/Models/Reports/Specific_customer.php` | 222 | per-customer sales |
| `app/Models/Reports/Specific_discount.php` | 203 | per-discount sales |
| `app/Models/Reports/Specific_employee.php` | 198 | per-employee sales |
| `app/Models/Reports/Specific_supplier.php` | 176 | per-supplier sales |
| `app/Views/reports/date_input.php` | 99 | shared date-range input page |
| `app/Views/reports/graphical.php` | 40 | chart shell |
| `app/Views/reports/graphs/{bar,hbar,line,pie}.php` | 118/121/188/84 | Chartist renderers |
| `app/Views/reports/inventory_summary_input.php` | 56 | inventory input page |
| `app/Views/reports/listing.php` | 110 | report index |
| `app/Views/reports/specific_customer_input.php` | 75 | customer input page |
| `app/Views/reports/specific_input.php` | 110 | employee/discount/supplier input page |
| `app/Views/reports/tabular.php` | 81 | tabular shell |
| `app/Views/reports/tabular_details.php` | 99 | expandable-details shell |
| `app/Helpers/report_helper.php` | 51 | link generation + permission filter |
| `app/Helpers/tabular_helper.php` (`transform_*`, `expand_attribute_values`) | 18-59, 646-675 | header JSON and attribute expansion |
| `app/Helpers/locale_helper.php` | 299-450, 565+ | currency/quantity/date formatting |
| `app/Config/Routes.php` | 16-42 | report route table |
| `app/Models/Sale.php` (`create_temp_table`) | 1065-1200 | sales temp tables |
| `app/Models/Receiving.php` (`create_temp_table`) | 306-380 | receivings temp table |
| `app/Views/partial/visibility_js.php` | 1-98 | column visibility, cost/profit toggle, row endpoint wiring |
| `public/js/manage_tables.js` (`submit_handler`) | 291-320 | post-edit row refresh contract |
| `tests/Controllers/ReportsControllerTest.php` | 208 | permission tests |
| `tests/Models/Reports/{Inventory_lowTest,Summary_discounts_test,Summary_taxes_test}.php` | 33/51/287 | model tests |
| `app/Language/en/Reports.php` | 151 | labels |
| `app/Database/Migrations/sqlscripts/initial_schema.sql`, `3.1.1_to_3.2.0.sql`, `3.3.0_indiagst.sql` | permissions, expense and tax schema | |

Target files read in full:

| Target path | Lines |
|---|---|
| `src/lib/reports/registry.ts` | 492 |
| `src/app/(secure)/reports/page.tsx` | 19 |
| `src/app/(secure)/reports/[key]/page.tsx` | 29 |
| `src/app/(secure)/reports/[key]/export/route.ts` | 27 |
| `src/components/reports/report-view.tsx` | 106 |
| `src/components/reports/charts.tsx` | 99 |
| `src/app/api/reports/[key]/detailed-sales-row/route.ts` | 20 |
| `src/app/api/reports/[key]/detailed-receivings-row/route.ts` | 20 |
| `src/app/api/reports/payment-type/route.ts` | 8 |
| `src/app/api/reports/sale-type-options/route.ts` | 13 |
| `src/db/schema/{sales,receivings,items,expenses,customers,taxes,cashups,giftcards,attributes,auth}.ts` | 62/30/66/22/42/42/14/10/27/… |
| `src/lib/constants.ts`, `src/lib/auth/rbac.ts`, `src/lib/auth/with-permission.ts`, `src/lib/db/index.ts`, `src/lib/config/index.ts`, `src/db/seed.ts` | |
| `e2e/reports.spec.ts` | 26 |

Also inspected: `src/lib/sale/sale-model.ts` (sale loaders and `getPaymentOptions`),
`src/lib/persons/repository.ts`, `src/lib/employees/repository.ts`,
`src/lib/items/repository.ts` (`getItemName`), `src/lib/receiving/receiving-model.ts`.

Count correction: the task brief says "21 report classes"; the directory contains **20 concrete
report classes** plus two abstract bases (`Report`, `Summary_report`) = 22 files. The 20 concrete
classes are listed in §5.

---

## 2. Executive summary

1. **The target is not a port of this subsystem; it is a separate, much smaller reporting
   prototype.** `src/lib/reports/registry.ts` defines 23 executable report keys
   (lines 31-461) of which several do not correspond to any upstream report
   (`detailed_payments`, `summary_expenses`, `summary_cashups`, `summary_giftcards`) and four
   upstream reports are absent or renamed (`detailed_item_sales`, `specific_customers`,
   `specific_employees`, `specific_discounts`, `specific_suppliers` — plural upstream, singular in
   target).
2. **No input pages exist in the target.** Upstream every report has a landing URL that renders
   only a filter form (`Reports::date_input`, `date_input_only`, `date_input_sales`,
   `date_input_recv`, `dateInputItemSales`, `summary_discounts_input`, `specific_*_input`,
   `inventory_summary_input`). The target `/reports/[key]` immediately executes SQL with only
   optional `start`/`end` query parameters (`src/app/(secure)/reports/[key]/page.tsx:19-20`).
3. **No sale-type, location, discount-type, customer, employee, supplier or payment-type filter is
   modelled anywhere in the target.** `runReport` accepts only `{start,end}` (`registry.ts:23-29`);
   the four filter APIs under `src/app/api/reports/` are unintegrated and, for sale types, return
   the wrong enumeration (`sale-type-options/route.ts:6-12` returns POS/Invoice/Work Order/Quote/Return,
   not the report options Complete/Completed Sales/Quotes/Work Orders/Canceled/Returns from
   `Reports.php:1799-1813`).
4. **`summary_taxes` is broken at runtime in the target**: `registry.ts:255-261` selects
   `st.name` and `SUM(st.amount)` from `sales_taxes`, but the target table has neither column
   (`src/db/schema/sales.ts:46-53`).
5. **All total/summary rows are missing.** Upstream renders a `#report_summary` block from
   `getSummaryData()` (`app/Views/reports/tabular.php:34-46`); the target never calls any summary
   query and renders only rows (`report-view.tsx:83-104`).
6. **No pagination, no sort, no search, no column visibility, no detail expansion.** Upstream uses
   bootstrap-table client-side pagination at `config.lines_per_page` (`tabular.php:61-72`,
   `tabular_details.php:52-93`). The target renders every returned row in a plain table and most
   queries append `LIMIT 500` (`registry.ts:74,111,133,149,165,185,205,225,332,346,364,382,400,419,441`),
   silently truncating.
7. **Charts do not plot the upstream metric.** `ChartFor` picks `columns[0]` as label and the
   first other column as value (`report-view.tsx:35-42`). For `summary_sales` that is `count`, not
   `total`; upstream plots `total` (`Reports.php:832-836`). Chart types also diverge: upstream
   employees and suppliers are pies (`Reports.php:1022,978`), the target renders `hbar`
   (`registry.ts:470-471`); upstream `graphical_summary_items` and
   `graphical_summary_sales_taxes` are missing from `GRAPHICAL_TWINS` (`registry.ts:465-477`).
8. **Permissions diverge from the upstream map.** `Reports.php:85-106` is the authoritative map.
   Target: `summary_categories` → `reports_items` (should be `reports_categories`,
   `Reports.php:90`), both expense reports → `reports_expenses` (upstream key is
   `reports_expenses_categories`, `Reports.php:87`; no `reports_expenses` permission exists upstream,
   see the 13 permissions in the SQL scripts), `summary_sales_taxes` → `reports_taxes` (should be
   `reports_sales_taxes`, `Reports.php:96`). `src/db/seed.ts:135-148` seeds `reports_expenses`,
   `reports_cashups`, `reports_giftcards` and omits `reports_expenses_categories` and
   `reports_sales_taxes`.
9. **Base-grant escalation exists in the target**: `hasModuleGrant("reports")` returns `true` when
   the only grant is the module itself (`src/lib/auth/rbac.ts:60-63`); upstream
   `Employee::has_module_grant()` returns `has_subpermissions('reports')`, which is `false` because
   sub-permissions exist (`app/Models/Employee.php:444-467`). A user holding only `reports` can read
   every sub-report in the target; upstream would deny.
10. **SQL is SQLite-only and MySQL-unsafe**: `date(s.sale_time,'unixepoch')` and `||` concatenation
    in `registry.ts:42,177`; `getDbSync()` throws when `DB_DRIVER=mysql`
    (`src/lib/db/index.ts:32-36`), so the whole reports subsystem cannot serve a MySQL deployment.
11. **Detail expansion and its row API are not integrated.** The two route handlers exist
    (`src/app/api/reports/[key]/detailed-sales-row/route.ts`, `…detailed-receivings-row/route.ts`)
    but grep finds no client or page caller; their URL shape (`/api/reports/{saleId}/…`), payload
    shape (`{sale, items, payments, taxes, customer}`) and permission model (session only) differ
    from the upstream row contract `{[sale_id]: formatted_summary_row}` used by
    `table_support.submit_handler` (`public/js/manage_tables.js:291-320`,
    `app/Views/partial/visibility_js.php:93-98`).
12. **Column keys do not match the SQL aliases in three reports**, producing blank columns:
    `detailed_sales` declares `quantity`/`unit_price` but selects `quantity_purchased`/`item_unit_price`
    (`registry.ts:62-63` vs `67`), `summary_discounts` declares `discount_percent` but selects
    `discount` (`registry.ts:269` vs `273`), `specific_discount` declares `discount_percent` but
    selects `discount` (`registry.ts:409` vs `412`).

Severity ordering used in §8: **P0** = wrong data or missing report; **P1** = missing filter,
permission or aggregate that changes the answer; **P2** = presentation/contract drift.

---

## 3. Complete upstream route map

All report routes are literal rules at the top of `app/Config/Routes.php:16-42`. Auto-routing is
enabled (`app/Config/Routing.php:97`, improved auto-routing `app/Config/Feature.php:15`), which is
how the row endpoints and the public helper methods are reachable.

### 3.1 Route table

| # | URL pattern | Dispatch | Method signature (params) | Input page? |
|---|---|---|---|---|
| 1 | `reports/summary_(:any)/(:any)/(:any)` | `Reports::Summary_$1/$2/$3/$4` (`Routes.php:16`) | `summary_<name>(start, end, sale_type, location_id='all')` | no |
| 2 | `reports/summary_expenses_categories` | `Reports::date_input_only` (`:17`) | `date_input_only()` | yes |
| 3 | `reports/summary_payments` | `Reports::date_input_only` (`:18`) | `date_input_only()` | yes |
| 4 | `reports/summary_discounts` | `Reports::summary_discounts_input` (`:19`) | `summary_discounts_input()` | yes |
| 5 | `reports/summary_(:any)` | `Reports::date_input` (`:20`) | `date_input()` | yes |
| 6 | `reports/graphical_(:any)/(:any)/(:any)` | `Reports::Graphical_$1/$2/$3/$4` (`:22`) | `graphical_summary_<name>(start, end, sale_type, location_id='all')` | no |
| 7 | `reports/graphical_summary_expenses_categories` | `Reports::date_input_only` (`:23`) | `date_input_only()` | yes |
| 8 | `reports/graphical_summary_discounts` | `Reports::summary_discounts_input` (`:24`) | `summary_discounts_input()` | yes |
| 9 | `reports/graphical_(:any)` | `Reports::date_input` (`:25`) | `date_input()` | yes |
| 10 | `reports/inventory_(:any)/(:any)` | `Reports::Inventory_$1/$2` (`:27`) | `inventory_<name>(location_id, item_count)` | no |
| 11 | `reports/inventory_low` | `Reports::inventory_low` (`:28`) | `inventory_low()` | no (runs directly) |
| 12 | `reports/inventory_summary` | `Reports::inventory_summary_input` (`:29`) | `inventory_summary_input()` | yes |
| 13 | `reports/inventory_summary/(:any)/(:any)/(:any)` | `Reports::inventory_summary/$1/$2/$3` (`:30`) | `inventory_summary(location_id='all', item_count='all')` | no |
| 14 | `reports/detailed_item_sales` | `Reports::dateInputItemSales` (`:32`) | `dateInputItemSales()` | yes |
| 15 | `reports/detailed_item_sales/(:segment)/(:segment)/(:segment)/(:segment)/(:segment)` | `Reports::detailedItemSales/$1/$2/$3/$4/$5` (`:33`) | `detailedItemSales(start, end, sale_type='sales', location_id='all', discount_type='all')` | no |
| 16 | `reports/detailed_(:any)/(:any)/(:any)/(:any)` | `Reports::Detailed_$1/$2/$3/$4` (`:34`) | `detailed_<name>(start, end, type, location_id='all')` | no |
| 17 | `reports/detailed_sales` | `Reports::date_input_sales` (`:35`) | `date_input_sales()` | yes |
| 18 | `reports/detailed_receivings` | `Reports::date_input_recv` (`:36`) | `date_input_recv()` | yes |
| 19 | `reports/specific_(:any)/(:any)/(:any)/(:any)` | `Reports::Specific_$1/$2/$3/$4` (`:38`) | `specific_<name>(start, end, entity_id, arg4)` + optional 5th | no |
| 20 | `reports/specific_customers` | `Reports::specific_customer_input` (`:39`) | `specific_customer_input()` | yes |
| 21 | `reports/specific_employees` | `Reports::specific_employee_input` (`:40`) | `specific_employee_input()` | yes |
| 22 | `reports/specific_discounts` | `Reports::specific_discount_input` (`:41`) | `specific_discount_input()` | yes |
| 23 | `reports/specific_suppliers` | `Reports::specific_supplier_input` (`:42`) | `specific_supplier_input()` | yes |

There is **no explicit route** for `reports`, `reports/index`, `reports/get_detailed_sales_row`,
`reports/get_detailed_receivings_row`, `reports/get_payment_type` or
`reports/get_sale_type_options`; these resolve through auto-routing. `Reports::index()` calls
`getIndex()` (`Reports.php:128-150`). The row endpoints are declared as
`getGet_detailed_sales_row(string $sale_id)` (`Reports.php:1672`) and
`getGet_detailed_receivings_row(string $receiving_id)` (`Reports.php:1997`) — the doubled `get` is
the auto-route HTTP-verb prefix plus the URI segment `Get_detailed_…`.

### 3.2 How trailing segments become parameters

`(:any)` in CI4 expands to a greedy `(.*)` placeholder. The view JavaScript does not send the
parameter count the method signature suggests: it appends **five** values after the current URL
for every date-based report:

```js
window.location = [window.location, start_date, end_date,
                   $("#input_type").val() || 0,
                   $("#location_id").val() || 'all',
                   $("#discount_type_id").val() || 0].join("/");
```

(`app/Views/reports/date_input.php:96`; the specific-customer page appends
`start/end/customer_id/sale_type/payment_type` at `specific_customer_input.php:71`; the
specific-input page appends `start/end/value/sale_type/discount_type` at `specific_input.php:95`;
the inventory page appends only `location_id/item_count` at `inventory_summary_input.php:53`.)

Because the regex is greedy, a URL such as
`/reports/summary_sales/2024-01-01/2024-01-31/complete/all/0` is captured as
`$1="sales/2024-01-01/2024-01-31/complete"`, `$2="all"`, `$3="0"`, and the substituted handler
`Reports::Summary_sales/2024-01-01/2024-01-31/complete/all/0` still resolves to method
`Summary_sales` with parameters `(2024-01-01, 2024-01-31, complete, all, 0)`; the surplus argument
is ignored by PHP. The same mechanism explains why the four-capture `detailed_` and `specific_`
rules accept five value segments. Practical consequences to preserve:

* `/reports/summary_sales` (one segment) matches rule 5 and renders the input page; it does **not**
  run the report.
* `/reports/summary_sales/<start>/<end>` reaches `summary_sales` with `sale_type` omitted; PHP 8
  raises `ArgumentCountError` for the required third parameter, so a two-value URL is a 500. In
  normal UI flow the sale-type segment is always present.
* `/reports/detailed_sales/.../.../.../.../...` (five values) reaches
  `detailed_sales(start,end,sale_type,location_id)`; the fifth (`discount_type`, always `0` here)
  is ignored.
* `/reports/specific_customers/<start>/<end>/<id>/<sale_type>/<payment_type>` reaches
  `specific_customers(start,end,customer_id,sale_type,payment_type)`.
* `/reports/inventory_summary/<location>/<item_count>` is normally matched by rule 10
  (`Reports::Inventory_$1/$2`) before rule 13; both produce the same call.
* Encoded names are decoded twice by CI4. The controller compensates by
  `urldecode($request->getUri()->getSegment(2))` (`Reports.php:61`); without it,
  `/reports/summary%255Fcustomers` bypassed the grant check (regression documented in
  `tests/Controllers/ReportsControllerTest.php:12-22,127-161`).

### 3.3 Report-key normalisation for permissions

`Reports::__construct()` (`Reports.php:57-123`) computes a permission key from **segment 2 only**:

```php
$methodName = urldecode($request->getUri()->getSegment(2));
$reportName = $methodName;
if (str_starts_with($reportName, 'graphical_')) { $reportName = substr($reportName, 10); }
$reportName = preg_replace('/_(graph|row)$/', '', $reportName);
$submoduleId = $reportPermissions[$reportName] ?? null;
if ($submoduleId !== null && !$this->employee->has_grant($submoduleId, …)) {
    throw new RedirectException('no_access/reports/' . $submoduleId);
}
```

Consequences:

* `graphical_summary_sales` → `summary_sales` → `reports_sales`.
* `get_detailed_sales_row` → strips `_row` → `get_detailed_sales` → **not in the map** → only the
  base `reports` grant is enforced. Same for `get_detailed_receivings_row`.
* Input-page method names (`date_input`, `date_input_only`, `date_input_sales`, `date_input_recv`,
  `dateInputItemSales`, `summary_discounts_input`, `specific_customer_input`,
  `specific_employee_input`, `specific_discount_input`, `specific_supplier_input`,
  `inventory_summary_input`) are not keys in the map, so input pages require only the base
  `reports` grant.
* `get_payment_type` and `get_sale_type_options` are public methods, reachable by auto-route, and
  likewise require only the base grant.
* Base `reports` itself is enforced by `Secure_Controller::__construct('reports')`
  (`Reports.php:59`, `app/Controllers/Secure_Controller.php:43-49`), using
  `Employee::has_module_grant()` (`app/Models/Employee.php:444-456`), which denies a lone
  `reports` grant when sub-permissions exist (`has_subpermissions()` lines 461-467).

### 3.4 Input-page matrix

| Input page method | URL | Mode passed | Controls rendered |
|---|---|---|---|
| `date_input` (`:684-695`) | `/reports/summary_<x>` and `/reports/graphical_<x>` | `sale` | date range, sale type, stock location, submit; no discount type |
| `date_input_only` (`:703-709`) | `summary_expenses_categories`, `summary_payments`, `graphical_*` equivalents | none | date range only |
| `date_input_sales` (`:717-728`) | `/reports/detailed_sales` | `sale` | date range, sale type, stock location (allowed for `sales`) |
| `dateInputItemSales` (`:730-744`) | `/reports/detailed_item_sales` | `sale` | date range, sale type (`sales` preselected), location, discount type (`all` preselected) |
| `date_input_recv` (`:752-760`) | `/reports/detailed_receivings` | `receiving` | date range, receiving type (`all`/`receiving`/`returns`/`requisitions`), locations allowed for `receivings` |
| `summary_discounts_input` (`:566-578`) | `/reports/summary_discounts`, `/reports/graphical_summary_discounts` | `sale` | date range, sale type, location, discount type (`0` percent, `1` fixed) |
| `specific_customer_input` (`:1267-1286`) | `/reports/specific_customers` | n/a | date range, customer select, sale type, payment type |
| `specific_employee_input` (`:1417-1432`) | `/reports/specific_employees` | n/a | date range, employee select, sale type |
| `specific_discount_input` (`:1540-1556`) | `/reports/specific_discounts` | n/a | date range, discount select (0..100 step 10), sale type, discount type |
| `specific_supplier_input` (`:1724-1739`) | `/reports/specific_suppliers` | n/a | date range, supplier select, sale type |
| `inventory_summary_input` (`:2160-2172`) | `/reports/inventory_summary` | n/a | location, item-count filter |

### 3.5 Stock-location dropdown sources

* Sales reports: `Stock_location::get_allowed_locations('sales')` (`Reports.php:570,688,721,734`).
  That function joins `permissions.location_id = stock_locations.location_id`,
  `grants.permission_id = permissions.permission_id`, filters the logged-in person and
  `permission_id LIKE 'sales%'`, `deleted = 0` (`app/Models/Stock_location.php:68-79`).
* Receivings: same with module `receivings` (`Reports.php:754`).
* Inventory summary: `get_allowed_locations()` with the default module `items`
  (`Reports.php:2167`, `Stock_location.php:104-118`).
* The sentinel `all` is appended and the array is reversed so `All` appears first
  (`Reports.php:571,689,722,735,755,2168-2169`).
* Sales reports filter `sales_items.item_location`, **not** `sales.sale_location`
  (`Summary_report.php:123-125`, `Detailed_sales.php:122-124`, `Detailed_receivings.php:100-102`).
* The posted location is not re-validated against the allowed list server-side; a crafted URL can
  read another location. This is an upstream trust gap to decide on during the port.

### 3.6 Graphical URL family

Eleven `graphical_summary_*` methods exist and are reachable both as
`/reports/graphical_summary_<x>/…` (rule 6) and, by listing links, as the exact strings
`graphical_summary_expenses_categories` and `graphical_summary_discounts` (rules 7-8):

`graphical_summary_expenses_categories` (`:771`), `graphical_summary_sales` (`:816`),
`graphical_summary_items` (`:862`), `graphical_summary_categories` (`:909`),
`graphical_summary_suppliers` (`:952`), `graphical_summary_employees` (`:997`),
`graphical_summary_taxes` (`:1041`), `graphical_summary_sales_taxes` (`:1085`),
`graphical_summary_customers` (`:1129`), `graphical_summary_discounts` (`:1177`),
`graphical_summary_payments` (`:1224`).

There is no `graphical_summary_items` route quirk (rule 5/6 both work) and no graphical variant for
expenses-by-category beyond the one above. No graphical variant exists for inventory, detailed or
specific reports.

---

## 4. Report framework

### 4.1 Class contract

`App\Models\Reports\Report` (`Report.php:14-34`) is a `CodeIgniter\Model` with three abstract
methods:

```php
abstract public function getDataColumns(): array;   // column descriptors for the view
abstract public function getData(array $inputs): array;      // rows
abstract public function getSummaryData(array $inputs): array; // key=>value totals
```

`Summary_report` (`Summary_report.php:8-235`) implements those for sale-line reports and adds the
protected extension points `_get_data_columns()`, `_select()`, `_from()`, `_where()`,
`_group_order()` (`:157-192`). The base `getData()` (`:209-219`) is:

```php
$builder = $this->db->table('sales_items AS sales_items');
$this->_select($inputs, $builder);   // common select first, then subclass select
$this->_from($builder);
$this->_where($inputs, $builder);
$this->_group_order($builder);
return $builder->get()->getResultArray();
```

`getSummaryData()` (`:225-234`) calls **only** `__common_select`, `__common_from` and the
(possibly overridden) `_where`; it never calls the subclass `_select`, `_from` or `_group_order`.
Therefore the summary row is always the sale-line grand total for the filters, independent of the
report's grouping — including for `Summary_discounts` and `Summary_payments`, whose summaries are
therefore *sales* totals, not discount/payment totals (§5.10, §5.11).

### 4.2 Temporary tables created for every summary query

`__common_select()` creates two MySQL `TEMPORARY TABLE … ENGINE=MEMORY` objects on every call
(`Summary_report.php:45-81`). Verbatim (with `{prefix}` for `db->prefixTable()` and `D` for
`totals_decimals()`):

```sql
CREATE TEMPORARY TABLE IF NOT EXISTS {prefix}sales_items_taxes_temp
  (INDEX(sale_id), INDEX(item_id)) ENGINE=MEMORY
(
  SELECT sales_items_taxes.sale_id AS sale_id,
         sales_items_taxes.item_id AS item_id,
         sales_items_taxes.line    AS line,
         SUM(ROUND(sales_items_taxes.item_tax_amount, D)) AS tax,
         SUM(ROUND(CASE WHEN sales_items_taxes.tax_type = 0
                        THEN sales_items_taxes.item_tax_amount ELSE 0 END, D)) AS internal_tax,
         SUM(ROUND(CASE WHEN sales_items_taxes.tax_type = 1
                        THEN sales_items_taxes.item_tax_amount ELSE 0 END, D)) AS sales_tax
  FROM {prefix}sales_items_taxes AS sales_items_taxes
  INNER JOIN {prefix}sales AS sales ON sales.sale_id = sales_items_taxes.sale_id
  INNER JOIN {prefix}sales_items AS sales_items
     ON sales_items.sale_id = sales_items_taxes.sale_id
    AND sales_items.line    = sales_items_taxes.line
  WHERE [date predicate]
  GROUP BY sales_items_taxes.sale_id, sales_items_taxes.item_id, sales_items_taxes.line
);

CREATE TEMPORARY TABLE IF NOT EXISTS {prefix}sales_report_payments_temp
  (PRIMARY KEY(sale_id), INDEX(sale_id)) ENGINE=MEMORY
(
  SELECT payments.sale_id AS sale_id,
         SUM(CASE WHEN payments.cash_adjustment = 0 THEN payments.payment_amount ELSE 0 END) AS sale_payment_amount,
         SUM(CASE WHEN payments.cash_adjustment = 1 THEN payments.payment_amount ELSE 0 END) AS sale_cash_adjustment,
         SUM(payments.cash_refund) AS sale_cash_refund,
         GROUP_CONCAT(CONCAT(payments.payment_type, " ", (payments.payment_amount - payments.cash_refund)) SEPARATOR ", ") AS payment_type,
         GROUP_CONCAT(NULLIF(payments.reference_code, "") SEPARATOR ", ") AS reference_code
  FROM {prefix}sales_payments AS payments
  INNER JOIN {prefix}sales AS sales ON sales.sale_id = payments.sale_id
  WHERE [date predicate]
  GROUP BY payments.sale_id
);
```

Notes and hazards to preserve or consciously change:

* `IF NOT EXISTS` means a second call in the same request with a *different* date range would reuse
  stale data. In practice each controller method calls `getData()` then `getSummaryData()` with the
  same inputs, so the data is consistent within a request.
* The predicate is the raw date predicate, not `sales.sale_status`/`sale_type`/location. Status and
  type filtering happens on the outer query (§4.3).
* `sales_items_taxes.tax_type` and `item_tax_amount` are required columns; they are added by
  `20200202000000_taxamount.php` and the tax migration, not present in the 3.0 initial schema.
  The target schema has `item_tax_amount` but **not** `tax_type` (`src/db/schema/sales.ts:37-44`).
* `sales_payments.reference_code` exists upstream but not in the target
  (`src/db/schema/sales.ts:55-63`).
* `ENGINE=MEMORY`, `GROUP_CONCAT`, `TEMPORARY` are MySQL-only; SQLite uses `GROUP_CONCAT` with
  different syntax and no engine clause. Any port needs a rewrite (CTE/subquery), not a transliteration.

The detailed/specific reports use a different set of temp tables built by
`Sale::create_temp_table()` (`app/Models/Sale.php:1065-1200`) and
`Receiving::create_temp_table()` (`app/Models/Receiving.php:306-380`). The sales temp table is
`{prefix}sales_items_temp` with one row per sale line, carrying pre-computed line-level `subtotal`,
`tax`, `total`, `cost`, `profit` plus denormalised `customer_name`, `employee_name`, `payment_type`,
`supplier_id`, `item_location`, `sale_status`, `sale_type`, `comment`, `discount`, `discount_type`
and the item name/number/category. The receivings temp table is `{prefix}receivings_items_temp`.

The exact sale-line formulas in `Sale::create_temp_table()` differ from `Summary_report` in the
tax-included case (compare `Summary_report.php:36-42` with `Sale.php:1101-1108`):

```php
// Summary_report (all summary_* reports)
if tax_included:
    sale_total    = ROUND(SUM(sale_price), D) + cash_adjustment
    sale_subtotal = sale_total - IFNULL(SUM(sales_items_taxes.tax), 0)   // all tax
else:
    sale_subtotal = ROUND(SUM(sale_price), D) + cash_adjustment
    sale_total    = ROUND(SUM(sale_price), D) + IFNULL(SUM(sales_items_taxes.tax),0) + cash_adjustment

// Sale::create_temp_table (detailed/specific reports)
if tax_included:
    sale_total    = ROUND(SUM(sale_price), D) + cash_adjustment
    sale_subtotal = sale_total - internal_tax          // tax_type = 0 only
else:
    sale_subtotal = ROUND(SUM(sale_price), D) - internal_tax + cash_adjustment
    sale_total    = ROUND(SUM(sale_price), D) + sales_tax + cash_adjustment   // tax_type = 1 only
```

This is a real upstream inconsistency: the same sale can show a different subtotal/tax split in
`summary_sales` and `detailed_sales` when `tax_included` is on or when internal taxes exist. A
faithful port must keep both behaviours unless the divergence is explicitly accepted.

### 4.3 Common SQL fragments (expansion key used throughout §5)

Expanded once, referenced as `[SUBTOTAL]`, `[TAX]`, `[TOTAL]`, `[COST]`, `[PROFIT]`, `[SALE_PRICE]`,
`[DATE]`, `[LOC]`, `[SALETYPE]`, `[COMMON_FROM]`. Source: `Summary_report.php:19-42`, `83-89`,
`96-105`, `112-152`.

```text
D = totals_decimals()   // config currency_decimals, default 2

[SALE_PRICE] =
  CASE WHEN sales_items.discount_type = 0
       THEN sales_items.quantity_purchased * sales_items.item_unit_price
            - ROUND(sales_items.quantity_purchased * sales_items.item_unit_price
                    * sales_items.discount / 100, D)
       ELSE sales_items.quantity_purchased
            * (sales_items.item_unit_price - sales_items.discount)
  END

[COST]  = SUM(sales_items.item_cost_price * sales_items.quantity_purchased)
[TAX]   = IFNULL(SUM(sales_items_taxes.tax), 0)
[CASH]  = IFNULL(SUM(payments.sale_cash_adjustment), 0)

if tax_included:
   [TOTAL]    = ROUND(SUM([SALE_PRICE]), D) + [CASH]
   [SUBTOTAL] = [TOTAL] - [TAX]
else:
   [SUBTOTAL] = ROUND(SUM([SALE_PRICE]), D) + [CASH]
   [TOTAL]    = ROUND(SUM([SALE_PRICE]), D) + [TAX] + [CASH]

[PROFIT] = (IFNULL([SUBTOTAL], [TOTAL]) - [COST])

Select list (always, before report-specific columns):
  IFNULL([SUBTOTAL], [TOTAL]) AS subtotal,
  [TAX] AS tax,
  IFNULL([TOTAL], [SUBTOTAL]) AS total,
  [COST] AS cost,
  [PROFIT] AS profit

[COMMON_FROM] =
  FROM sales_items AS sales_items
  INNER JOIN sales AS sales
          ON sales_items.sale_id = sales.sale_id
  LEFT OUTER JOIN sales_items_taxes_temp AS sales_items_taxes
          ON sales_items.sale_id = sales_items_taxes.sale_id
         AND sales_items.item_id = sales_items_taxes.item_id
         AND sales_items.line    = sales_items_taxes.line
  LEFT OUTER JOIN sales_report_payments_temp AS payments
          ON sales.sale_id = payments.sale_id

[DATE] =
  date_or_time_format = 0:  DATE(sales.sale_time) BETWEEN '<start_date>' AND '<end_date>'
  date_or_time_format = 1:  sales.sale_time BETWEEN '<rawurldecode(start)>' AND '<rawurldecode(end)>'

[LOC] (only when inputs.location_id != 'all'):
  sales_items.item_location = '<location_id>'

[SALETYPE] (from Summary_report.php:127-151):
  'complete'    : sales.sale_status = 0 AND (sales.sale_type = 0 OR 1 OR 4)
  'sales'       : sales.sale_status = 0 AND (sales.sale_type = 0 OR 1)
  'quotes'      : sales.sale_status = 1 AND sales.sale_type = 3
  'work_orders' : sales.sale_status = 1 AND sales.sale_type = 2
  'canceled'    : sales.sale_status = 2
  'returns'     : sales.sale_status = 0 AND sales.sale_type = 4
  anything else : no status/type predicate (all rows)
```

Where a report's `_where` is overridden, `[DATE]/[LOC]/[SALETYPE]` are replaced; this is called
out per report.

### 4.4 Tabular output contract

`app/Views/reports/tabular.php`:

* title and subtitle in `#page_title` / `#page_subtitle` (`:18-20`);
* `#toolbar` with the cost/profit toggle button (`:22-28`);
* empty `<table id="table">` (`:30-32`);
* `#report_summary` block: for each `summary_data` key it prints
  `lang("Reports.$key") . ': ' . to_currency($value)`, except `total_quantity`, which is printed raw
  (`:34-46`);
* bootstrap-table initialisation (`:48-79`): `columns: applyColumnVisibility(transform_headers(esc($headers), true, false))`,
  `pageSize: config.lines_per_page`, `sortable: true`, `showExport: true`,
  `exportDataType: 'all'`, `exportTypes: ['json','xml','csv','txt','sql','xlsx','pdf']`,
  `pagination: true`, `showColumns: true`, `data: json_encode($data)`, `escape: true`,
  `search: true`, sticky header.

`transform_headers($headers, true, false)` (`tabular_helper.php:32-59`) emits one JSON object per
column with `field`, `title`, `switchable`, `escape`, `sortable`, `checkbox`, `class`, `sorter`.
The `sorter` value (`number_sorter`) is carried but never used server-side. `transform_headers_readonly`
(`:18-27`) emits `field`/`title`/`sortable`/`switchable` only and is used for detail tables.

`app/Views/reports/tabular_details.php` adds:

* overall summary block (`:32-36`), same `lang("Reports.$key") . ': ' . to_currency($value)` rule;
* reward-details table only when `config.customer_reward_enable` **and** `details_data_rewards`
  is non-empty (`:43-45`, `:85-91`);
* `detailView: true`, `uniqueId: 'id'` (`:60,71`);
* `onExpandRow` renders the detail table with `details_data[row.id]` and, if enabled, the rewards
  table with `details_data_rewards[row.id]` (`:78-92`);
* `onPageChange: init_dialog` and `onPostBody: dialog_support.init(...)` (`:74-77`).

Upstream has **no server-side sort, search, pagination or export parameters**. `Reports.php`
contains no `sort`, `limit`, `offset`, `$_GET` or `$_POST` access (grep: only `getGet_*` method
names). Everything is client-side over the full result set. `clearCache()` (`Reports.php:2233-2240`)
sets `Pragma: no-cache`, `Last-Modified`, `Cache-Control: no-store, no-cache, must-revalidate` on
every report action.

### 4.5 Detail-row JSON contract

`getGet_detailed_sales_row` (`Reports.php:1672-1716`) and
`getGet_detailed_receivings_row` (`:1997-2028`):

1. `create(['sale_id' => $sale_id])` (resp. `receiving_id`) rebuilds the temp tables filtered to the
   single record (`Reports.php:1678`, `:2001`);
2. `getDataBySaleId()` / `getDataByReceivingId()` aggregates the temp table
   (`Detailed_sales.php:71-90`, `Detailed_receivings.php:58-78`);
3. the controller formats the aggregate and adds an `edit` anchor (modal dialog, delete/restore
   button) and returns `{ "<id>": { …formatted summary row… } }`
   (`Reports.php:1690-1715`, `:2005-2027`).

Client contract: `table_support.submit_handler(url)` GETs `url + "/" + id` and calls
`table().updateByUniqueId({id: id, row: response[id] || response})`
(`public/js/manage_tables.js:291-320`; URL wiring in `visibility_js.php:93-98` builds
`reports/get_detailed_{sales|receivings}_row`). The sale-row payload contains
`sale_id, sale_time, quantity, employee_name, customer_name, subtotal, tax, total, cost, profit,
payment_type, comment, edit` — note it omits `id` and `type_code`, which the summary table's column
list includes; `updateByUniqueId` merges, so the row keeps its previous `type_code` and gains an
extra `sale_id` field. This drift is upstream behaviour.

### 4.6 Subtitle and date formatting

`_get_subtitle_report()` (`Reports.php:2217-2228`):

```php
if (empty($this->config['date_or_time_format'])) {
    $subtitle = date($config['dateformat'], strtotime($start)) . ' - ' . date($config['dateformat'], strtotime($end));
} else {
    $subtitle = date($config['dateformat'].' '.$config['timeformat'], strtotime(rawurldecode($start)))
              . ' - '
              . date($config['dateformat'].' '.$config['timeformat'], strtotime(rawurldecode($end)));
}
```

Inventory reports pass `'subtitle' => ''` explicitly (`Reports.php:2145`, `:2205`). The subtitle is
HTML-escaped in both shells (`tabular.php:20`, `tabular_details.php:17`, `graphical.php:18`).

Date-input semantics: with `date_or_time_format = 0` the picker sends `YYYY-MM-DD` and the SQL uses
`DATE(column) BETWEEN`; with `date_or_time_format = 1` the picker sends locale-formatted datetime
strings (partial `daterangepicker.php:7-…`; the time branch enables `timePicker: true` and formats
via `dateformat . ' ' . timeformat`), which are `rawurldecode`d before escaping. Report SQL always
uses the raw query string, not a parsed date.

### 4.7 Locale and currency formatting

From `app/Helpers/locale_helper.php`:

| Function | Line | Behaviour |
|---|---|---|
| `totals_decimals()` | 322-326 | `config.currency_decimals ?? 0`; used as `D` in all SQL rounding |
| `to_date(int)` | 350-357 | `date(config.dateformat, ts)` |
| `to_datetime(int)` | 360-367 | `date(config.dateformat . ' ' . config.timeformat, ts)` |
| `to_currency(?string)` | 370-373 | `NumberFormatter(config.number_locale, CURRENCY)` with `currency_decimals`, grouping separator from `config.thousands_separator`, symbol `config.currency_symbol` |
| `to_currency_tax(?string)` | 388-396 | `tax_decimals` when `tax_included`, otherwise `currency_decimals` |
| `to_quantity_decimals(?string)` | 423-426 | `quantity_decimals` |
| `is_right_side_currency_symbol()` | 299-309 | whether the locale pattern puts the symbol after the amount; used by all chart views |
| `dateformat_mysql()` | 565+ | PHP dateformat → MySQL `DATE_FORMAT` pattern; used for attribute DATE values |

`to_decimals()` (the shared implementation, `:…`) sets both MIN and MAX fraction digits, removes the
grouping separator when `config.thousands_separator` is empty, and sets the currency symbol.

Every report value is a formatted **string** at the controller boundary; the raw SQL numbers are
never sent to the browser for tabular reports. (Charts, by contrast, receive raw numbers in
`series_data_1` and format only on the axes/tooltips.)

### 4.8 Link generation and the listing page

`get_report_link($report_name, $report_prefix = '', $lang_key = '')` (`report_helper.php:9-30`):

```
path = 'reports/' + ($prefix ? $prefix + '_' : '') + str_replace('reports_', '', $report_name)
label = lang($lang_key ?: 'Reports.' + stripped_name)
```

`can_show_report($permission_id, $restrict_views)` (`:38-51`) returns false unless the id contains
`reports_` and does not contain any restricted substring.

`listing.php` renders four panels:

* **Graphical Reports** (`:30-48`): every granted permission except those containing `inventory`
  or `receiving`, prefixed `graphical_summary`.
* **Summary Reports** (`:50-67`): same list prefixed `summary`.
* **Detailed Reports** (`:69-90`): fixed map `reports_sales→detailed`, `reports_receivings→detailed`,
  `reports_customers→specific`, `reports_discounts→specific`, `reports_employees→specific`,
  `reports_suppliers→specific` (`:8-15`); only granted entries are shown; under `reports_sales` an
  extra link `get_report_link('reports_item_sales','detailed','Reports.detailed_item_sales_report')`
  → `/reports/detailed_item_sales` (`:80-84`). `reports_item_sales` is a pseudo-permission that
  never exists in the permissions table; the link is gated by `reports_sales`.
* **Inventory Reports** (`:92-106`): gated by `reports_inventory`; links
  `/reports/inventory_low` (label `Reports.inventory_low`) and `/reports/inventory_summary`
  (label `Reports.inventory_summary`).

`Reports::getIndex()` (`Reports.php:137-150`) passes `person_id`, `grants` and
`permission_ids` (the `permission_id` column of the employee's grants).

### 4.9 Chart data shapes

`graphical.php` renders `view($chart_type)` (`:31`), then the summary block
`lang("Reports.$name") . ': ' . esc(to_currency($value))` for every summary key (`:33-37`), and
loads `js/hide_cost_profit.js` (`:39`).

The four renderers consume:

| View | Expected series | Details |
|---|---|---|
| `graphs/bar.php` | `series_data_1` = numbers | `labels_1` array; Chartist.Bar; axis titles; optional currency prefix/suffix; `ctBarLabels` + `ctPointLabels` (`:14-20`, `:117`) |
| `graphs/hbar.php` | numbers | same plus `horizontalBars: true`; currency applied to X axis (`:37-64`, `:120`) |
| `graphs/line.php` | `[{meta, value}]` | X-axis date labels; Y currency; `tooltip` reads `ct:meta`; point replacement at `:171-187` |
| `graphs/pie.php` | `[{meta, value}]` | labels outside; random slice colours; tooltip currency (`:12-15`, `:70-83`) |

Per-report payloads (all built in `Reports.php`):

| Report | Chart | labels_1 | series_data_1 |
|---|---|---|---|
| expenses categories (`:784-801`) | pie | `category_name` | `[{meta: "<cat> <pct>%", value: total_amount}]`, pct over `summary.expenses_total_amount` |
| sales (`:830-847`) | line | formatted date per `sale_date` | `[{meta: date, value: total}]` |
| items (`:877-894`) | hbar | `name` | `total` numbers |
| categories (`:923-937`) | pie | `category` | `[{meta: "<cat> <pct>%", value: total}]`, pct over `summary.total` |
| suppliers (`:967-982`) | pie | `supplier` | `[{meta, value: total}]` |
| employees (`:1011-1026`) | pie | `employee` | `[{meta, value: total}]` |
| taxes (`:1055-1070`) | pie | `percent` (string like `10%`) | `[{meta: "<percent> <pct>%", value: total}]` |
| sales taxes (`:1099-1114`) | pie | `jurisdiction_name` | `[{meta: "<tax_rate>%", value: tax}]` |
| customers (`:1143-1160`) | hbar | `customer` | `total` numbers |
| discounts (`:1192-1209`) | bar | `discount` (e.g. `10%` or `$5`) | `count` numbers |
| payments (`:1238-1255`) | pie | `trans_type` for rows in group `Reports.trans_payments` with non-empty `trans_amount` | `[{meta: "<type> <pct>%", value: trans_amount}]`, pct over `summary.total` (sales total, not payment total) |

`show_currency` is `false` only for discounts (`:1209`); the rest are `true`.

---

## 5. Report catalog

Common facts for all `summary_*` reports:

* Permission map entry and class file are cited per report.
* `getData()` returns rows for the tabular table; `getSummaryData()` returns one associative row.
* Columns are declared as `[key => label]` (order preserved) with optional `sorter`; the key is the
  bootstrap-table field, so it must equal the SQL alias.
* The controller formats each value with `to_currency` / `to_currency_tax` / `to_quantity_decimals`
  and passes the raw summary row straight to the view (unformatted; the view applies `to_currency`
  to every value except `total_quantity`).
* `clearCache()` is called by every controller method (`Reports.php:162,209,254,…`).

### 5.1 `summary_sales` — Summary Sales (by day)

* Class: `app/Models/Reports/Summary_sales.php`. Controller: `Reports.php:160-197`.
  Permission: `reports_sales` (`Reports.php:86`).
* Title: `lang('Reports.sales_summary_report')` → "Transactions Summary Report"
  (`app/Language/en/Reports.php:109`).
* Inputs: `start_date`, `end_date`, `sale_type`, `location_id` (default `all`).
* SQL:

```sql
SELECT
    IFNULL([SUBTOTAL], [TOTAL]) AS subtotal,
    [TAX] AS tax,
    IFNULL([TOTAL], [SUBTOTAL]) AS total,
    [COST] AS cost,
    [PROFIT] AS profit,
    DATE(sales.sale_time) AS sale_date,
    SUM(sales_items.quantity_purchased) AS quantity_purchased,
    COUNT(DISTINCT sales.sale_id) AS sales
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
LEFT OUTER JOIN sales_items_taxes_temp AS sales_items_taxes ON <line keys>
LEFT OUTER JOIN sales_report_payments_temp AS payments ON sales.sale_id = payments.sale_id
WHERE [DATE] [AND [LOC]] [AND [SALETYPE]]
GROUP BY sale_date
ORDER BY sale_date
```

* Columns (`Summary_sales.php:10-22`): `sale_date`→Reports.date (sortable=false), `sales`→Reports.sales
  (number_sorter), `quantity`→Reports.quantity, `subtotal`, `tax`, `total`, `cost`, `profit`.
* Row mapping (`Reports.php:176-185`): `sale_date = to_date(strtotime(row.sale_date))`,
  `sales = to_quantity_decimals`, `quantity = to_quantity_decimals(quantity_purchased)`,
  `subtotal/total/cost/profit = to_currency`, `tax = to_currency_tax`.
* Summary keys: `subtotal,tax,total,cost,profit` (from `[COMMON]`), rendered with `Reports.*` labels;
  `cost` label is "Wholesale", `profit` "Profit" (`Reports.php:23,82`).
* Graphical: `graphical_summary_sales` (`Reports.php:816-851`), line chart, title same as tabular,
  `yaxis_title = Reports.revenue`, `xaxis_title = Reports.date`.
* Edge cases: date grouping uses server-local `DATE()`. Returns are negative rows and are included
  only when `sale_type` is `complete`/`returns`; canceled sales only for `canceled`; suspended
  quotes/work orders excluded unless selected. Zero rows in range → empty table and an
  all-NULL summary row (see §5.20 note on `getSummaryData`).

### 5.2 `summary_categories` — Categories Summary

* Class: `Summary_categories.php`. Controller: `Reports.php:207-243`.
  Permission: `reports_categories` (`Reports.php:90`).
* Title: `Reports.categories_summary_report` → "Categories Summary Report".
* Inputs: same four as `summary_sales`.
* SQL: common select plus (`Summary_categories.php:32-36`, `:42-47`, `:53-57`):

```sql
SELECT [COMMON SELECT],
       items.category AS category,
       SUM(sales_items.quantity_purchased) AS quantity_purchased
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
LEFT OUTER JOIN sales_items_taxes_temp AS sales_items_taxes ON <line keys>
LEFT OUTER JOIN sales_report_payments_temp AS payments ON sales.sale_id = payments.sale_id
INNER JOIN items AS items ON sales_items.item_id = items.item_id
WHERE [DATE] [AND [LOC]] [AND [SALETYPE]]
GROUP BY category
ORDER BY category
```

* Columns (`:10-21`): `category`,`quantity`,`subtotal`,`tax`,`total`,`cost`,`profit`.
* Mapping (`Reports.php:223-231`): category raw, quantity `to_quantity_decimals`, money via
  `to_currency`, tax via `to_currency_tax`.
* Summary: `subtotal,tax,total,cost,profit` (no category join in the summary query — see §4.1).
* Graphical: `graphical_summary_categories` (`Reports.php:909-941`), pie; percentage over
  `summary.total`.
* Edge case: inner join to `items` drops sale lines whose item row disappeared. Category is the
  free-text `items.category`; items are not filtered by `deleted`, so deleted items still count.

### 5.3 `summary_expenses_categories` — Expenses by Category

* Class: `Summary_expenses_categories.php` (overrides both data and summary; does **not** use the
  Summary_report machinery). Controller: `Reports.php:252-280`.
  Permission: `reports_expenses_categories` (`Reports.php:87`).
* Title: `Reports.expenses_categories_summary_report` → "Expense Categories Summary Report".
* Inputs: `start_date`, `end_date`, `sale_type` (the third value is present in the URL but ignored by
  this report; the input page is `date_input_only`, whose JS still appends `0/all/0`).
* SQL data (`:26-47`):

```sql
SELECT expense_categories.category_name AS category_name,
       COUNT(expenses.expense_id) AS count,
       SUM(expenses.amount) AS total_amount,
       SUM(expenses.tax_amount) AS total_tax_amount
FROM expenses AS expenses
LEFT JOIN expense_categories AS expense_categories
       ON expense_categories.expense_category_id = expenses.expense_category_id
WHERE DATE(expenses.date) BETWEEN '<start>' AND '<end>'      -- or expenses.date BETWEEN … when date_or_time_format
  AND expenses.deleted = 0
GROUP BY expense_categories.category_name
ORDER BY expense_categories.category_name
```

* SQL summary (`:53-69`):

```sql
SELECT SUM(expenses.amount) AS expenses_total_amount,
       SUM(expenses.tax_amount) AS expenses_total_tax_amount
FROM expenses AS expenses
WHERE <same date predicate> AND expenses.deleted = 0
```

* Columns (`:12-20`): `category_name`→Reports.expenses_category, `count`→Reports.count,
  `total_amount`→Reports.expenses_amount, `total_tax_amount`→Reports.expenses_tax_amount.
* Mapping (`Reports.php:263-268`): category/count raw, amounts `to_currency`.
* Summary keys: `expenses_total_amount`, `expenses_total_tax_amount`, both rendered by
  `to_currency` and labelled `Reports.expenses_total_amount` / `Reports.expenses_total_tax_amount`.
* Graphical: `graphical_summary_expenses_categories` (`Reports.php:771-805`), pie; percentage
  denominator `summary.expenses_total_amount`.
* Edge cases: LEFT JOIN yields a `NULL` category bucket for expenses with a missing/deleted
  category. `expenses.tax_amount` must exist (added in `3.1.1_to_3.2.0.sql:199`); the target schema
  omits it (`src/db/schema/expenses.ts:4-13`). The date column is `expenses.date` upstream and
  `expense_time` (unix int) in the target.

### 5.4 `summary_customers` — Customers Summary

* Class: `Summary_customers.php`. Controller: `Reports.php:290-328`.
  Permission: `reports_customers` (`Reports.php:91`).
* Title: `Reports.customers_summary_report` → "Customers Summary Report".
* SQL (`Summary_customers.php:33-37`, `:44-49`, `:55-59`):

```sql
SELECT [COMMON SELECT],
       MAX(CONCAT(customer_p.first_name, " ", customer_p.last_name)) AS customer,
       SUM(sales_items.quantity_purchased) AS quantity_purchased,
       COUNT(DISTINCT sales.sale_id) AS sales
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
LEFT OUTER JOIN sales_items_taxes_temp AS sales_items_taxes ON <line keys>
LEFT OUTER JOIN sales_report_payments_temp AS payments ON sales.sale_id = payments.sale_id
INNER JOIN people AS customer_p ON sales.customer_id = customer_p.person_id
WHERE [DATE] [AND [LOC]] [AND [SALETYPE]]
GROUP BY sales.customer_id
ORDER BY customer_p.last_name
```

* Columns (`:10-22`): `customer_name`,`sales`,`quantity`,`subtotal`,`tax`,`total`,`cost`,`profit`.
* Mapping (`Reports.php:307-315`) mirrors `summary_sales` with `customer_name = row.customer`.
* Summary: `subtotal,tax,total,cost,profit`.
* Graphical: `graphical_summary_customers` (`Reports.php:1129-1164`), hbar, `yaxis_title=Reports.customers`,
  `xaxis_title=Reports.revenue`.
* Edge cases: `INNER JOIN people` drops sales with `customer_id` NULL/0 (walk-in sales never appear).
  `GROUP BY sales.customer_id` with `MAX(name)` means a renamed customer shows one name.
  Deleted customers/people still appear (no `deleted` filter).

### 5.5 `summary_suppliers` — Suppliers Summary

* Class: `Summary_suppliers.php`. Controller: `Reports.php:338-374`.
  Permission: `reports_suppliers` (`Reports.php:93`).
* Title: `Reports.suppliers_summary_report` → "Suppliers Summary Report".
* SQL (`Summary_suppliers.php:32-36`, `:42-49`, `:55-59`):

```sql
SELECT [COMMON SELECT],
       MAX(CONCAT(supplier_c.company_name, " (", supplier_p.first_name, " ", supplier_p.last_name, ")")) AS supplier,
       SUM(sales_items.quantity_purchased) AS quantity_purchased
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
LEFT OUTER JOIN sales_items_taxes_temp AS sales_items_taxes ON <line keys>
LEFT OUTER JOIN sales_report_payments_temp AS payments ON sales.sale_id = payments.sale_id
INNER JOIN items AS items ON sales_items.item_id = items.item_id
INNER JOIN suppliers AS supplier_c ON items.supplier_id = supplier_c.person_id
INNER JOIN people AS supplier_p ON items.supplier_id = supplier_p.person_id
WHERE [DATE] [AND [LOC]] [AND [SALETYPE]]
GROUP BY items.supplier_id
ORDER BY MAX(CONCAT(supplier_c.company_name, " (", supplier_p.first_name, " ", supplier_p.last_name, ")"))
```

* Columns (`:10-21`): `supplier_name`,`quantity`,`subtotal`,`tax`,`total`,`cost`,`profit`.
* Mapping (`Reports.php:354-361`): `supplier_name = row.supplier`.
* Summary: `subtotal,tax,total,cost,profit`.
* Graphical: `graphical_summary_suppliers` (`Reports.php:952-986`), pie.
* Edge cases: **this report is sales by the item's supplier**, not receivings by supplier. Items
  with no supplier and sale lines whose item disappeared are dropped by the inner joins. Grouping
  by `items.supplier_id` means a supplier's sales are attributed through the item master, not
  through any purchase history.

### 5.6 `summary_items` — Items Summary

* Class: `Summary_items.php`. Controller: `Reports.php:384-424`.
  Permission: `reports_items` (`Reports.php:92`).
* Title: `Reports.items_summary_report` → "Items Summary Report".
* SQL (`Summary_items.php:35-41`, `:48-53`, `:59-63`):

```sql
SELECT [COMMON SELECT],
       MAX(items.name) AS name,
       MAX(items.category) AS category,
       MAX(items.cost_price) AS cost_price,
       MAX(items.unit_price) AS unit_price,
       SUM(sales_items.quantity_purchased) AS quantity_purchased
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
LEFT OUTER JOIN sales_items_taxes_temp AS sales_items_taxes ON <line keys>
LEFT OUTER JOIN sales_report_payments_temp AS payments ON sales.sale_id = payments.sale_id
INNER JOIN items AS items ON sales_items.item_id = items.item_id
WHERE [DATE] [AND [LOC]] [AND [SALETYPE]]
GROUP BY items.item_id
ORDER BY name
```

* Columns (`:10-24`): `item_name`,`category`,`cost_price`,`unit_price`,`quantity`,`subtotal`,`tax`,
  `total`,`cost`,`profit`.
* Mapping (`Reports.php:401-411`): `item_name = row.name`; `cost_price` and `unit_price` are passed
  **unformatted** (`$row['cost_price']`, `$row['unit_price']`), unlike every other money column —
  they render as raw DB decimals; quantity `to_quantity_decimals`.
* Summary: `subtotal,tax,total,cost,profit` (no item join).
* Graphical: `graphical_summary_items` (`Reports.php:862-898`), hbar, `yaxis_title=Reports.items`,
  `xaxis_title=Reports.revenue`; note its series is plain numbers, not `{meta,value}`.
* Edge cases: `MAX(items.cost_price)`/`MAX(items.unit_price)` are the **current** item master values,
  not the historical sale prices; an item whose price changed shows its latest price against all
  historical sales. Item name uses `items.name` only (multi-pack naming not applied here, unlike
  inventory reports which use `Item::get_item_name()`).

### 5.7 `summary_employees` — Employees Summary

* Class: `Summary_employees.php`. Controller: `Reports.php:434-472`.
  Permission: `reports_employees` (`Reports.php:94`).
* Title: `Reports.employees_summary_report` → "Employees Summary Report".
* SQL (`Summary_employees.php:33-37`, `:44-49`, `:55-59`):

```sql
SELECT [COMMON SELECT],
       MAX(CONCAT(employee_p.first_name, " ", employee_p.last_name)) AS employee,
       SUM(sales_items.quantity_purchased) AS quantity_purchased,
       COUNT(DISTINCT sales.sale_id) AS sales
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
LEFT OUTER JOIN sales_items_taxes_temp AS sales_items_taxes ON <line keys>
LEFT OUTER JOIN sales_report_payments_temp AS payments ON sales.sale_id = payments.sale_id
INNER JOIN people AS employee_p ON sales.employee_id = employee_p.person_id
WHERE [DATE] [AND [LOC]] [AND [SALETYPE]]
GROUP BY sales.employee_id
ORDER BY employee_p.last_name
```

* Columns (`:10-22`): `employee_name`,`sales`,`quantity`,`subtotal`,`tax`,`total`,`cost`,`profit`.
* Mapping (`Reports.php:451-459`): `employee_name = row.employee`.
* Summary: `subtotal,tax,total,cost,profit`.
* Graphical: `graphical_summary_employees` (`Reports.php:997-1030`), **pie**.
* Edge cases: employees deleted from `people` disappear only if the person row is gone; the
  `employees` table's `deleted` flag is not consulted, so terminated employees still appear if they
  made sales.

### 5.8 `summary_taxes` — Taxes Summary

* Class: `Summary_taxes.php`. Controller: `Reports.php:482-518`.
  Permission: `reports_taxes` (`Reports.php:95`).
* Title: `Reports.taxes_summary_report` → "Taxes Summary Report".
* Inputs: four standard, but **`location_id` and `sale_type` are ignored** by this report.
* SQL (`Summary_taxes.php:40-100`), verbatim structure:

```sql
SELECT name, percent,
       COUNT(DISTINCT sale_id) AS count,
       ROUND(SUM(subtotal), D) AS subtotal,
       ROUND(SUM(tax), D)      AS tax,
       ROUND(SUM(total), D)    AS total
FROM (
    SELECT sales_items_taxes.name AS name,
           CONCAT(IFNULL(ROUND(sales_items_taxes.percent, D), 0), '%') AS percent,
           sales.sale_id AS sale_id,
           ROUND([SALE_AMOUNT] - [SALE_TAX], D) AS subtotal,   -- when tax_included
           ROUND([SALE_TAX], D) AS tax,
           (subtotal + tax) AS total
    FROM sales_items
    INNER JOIN sales ON sales_items.sale_id = sales.sale_id
    LEFT OUTER JOIN sales_items_taxes
            ON sales_items.sale_id = sales_items_taxes.sale_id
           AND sales_items.item_id = sales_items_taxes.item_id
           AND sales_items.line    = sales_items_taxes.line
    WHERE sales.sale_status = 0
      AND DATE(sales.sale_time) BETWEEN '<start>' AND '<end>'    -- or raw timestamp compare
) AS temp_taxes
GROUP BY percent, name
```

  where, inside the subquery (`:45-57`):
  `SALE_AMOUNT = CASE WHEN sales_items.discount_type = 0 THEN quantity*unit_price - ROUND(quantity*unit_price*discount/100, D) ELSE quantity*(unit_price-discount) END`
  and `SALE_TAX = IFNULL(sales_items_taxes.item_tax_amount, 0)`; when `tax_included` is false,
  `subtotal = ROUND(SALE_AMOUNT, D)`; `total = subtotal + ROUND(SALE_TAX, D)`.
* Columns (`:17-27`): `tax_name`→Reports.tax_name (sortable=false), `tax_percent`→Reports.tax_percent,
  `report_count`→Reports.sales, `subtotal`,`tax`,`total`.
* Mapping (`Reports.php:499-505`): `tax_name = name`, `tax_percent = percent` (already a string such
  as `10%`), `report_count = count` raw, money via `to_currency`, tax via `to_currency_tax`.
* Summary (`:102-125`) is computed in PHP by summing the rows: returns
  `['subtotal'=>round(sum), 'tax'=>round(sum), 'total'=>round(sum), 'count'=>(int)sum]`.
* Graphical: `graphical_summary_taxes` (`Reports.php:1041-1074`), pie, labels = `percent`,
  meta = `"<percent> <pct>%"`, value = `total`; percentage denominator `summary.total`.
* Edge cases: a sale with no tax rows yields `name = NULL`, `percent = "0%"` and contributes its
  full amount to a NULL-named bucket. `COUNT(DISTINCT sale_id)` means the same sale counts once per
  name+percent bucket. The overridden `_where()` (`:29-38`) that would filter `COMPLETED` is **dead
  code** — `getData()` is fully overridden and never calls it; the `sale_status = 0` predicate is
  hard-coded in the subquery instead. Location and sale type are indeed absent.
  The summary block renders `count` with `to_currency` (because it is not `total_quantity`), so the
  sales count is displayed as an amount.

### 5.9 `summary_sales_taxes` — Sales Taxes Summary

* Class: `Summary_sales_taxes.php`. Controller: `Reports.php:524-558`.
  Permission: `reports_sales_taxes` (`Reports.php:96`).
* Title: `Reports.sales_taxes_summary_report` → "Sales Taxes Summary Report".
* SQL (`:53-74`):

```sql
SELECT reporting_authority, jurisdiction_name, tax_category, tax_rate, SUM(sale_tax_amount) AS tax
FROM sales_taxes
LEFT JOIN sales            ON sales_taxes.sale_id = sales.sale_id
LEFT JOIN tax_categories   ON sales_taxes.tax_category_id = tax_categories.tax_category_id
LEFT JOIN tax_jurisdictions ON sales_taxes.jurisdiction_id = tax_jurisdictions.jurisdiction_id
WHERE DATE(sales.sale_time) >= '<start>'
  AND DATE(sales.sale_time) <= '<end>'      -- or raw compare on sales.sale_time
GROUP BY reporting_authority, jurisdiction_name, tax_category, tax_rate
```

* Columns (`:20-29`): `reporting_authority`→Reports.authority, `jurisdiction_name`→Reports.jurisdiction,
  `tax_category`→Reports.tax_category, `tax_rate`→Reports.tax_rate, `tax`→Reports.tax.
* Mapping (`Reports.php:540-546`): authority/jurisdiction/category/rate raw, tax
  `to_currency_tax`.
* Summary: inherited base summary (`subtotal,tax,total,cost,profit`) — **not** a tax total. It does
  not use this report's rows at all. This is why the graphical view's summary block shows sales
  totals for a tax report.
* Graphical: `graphical_summary_sales_taxes` (`Reports.php:1085-1118`), pie, labels
  `jurisdiction_name`, meta `"<tax_rate>%"`, value `tax`; no percentage in meta.
* Edge cases: unlike Summary_taxes, the overridden `_where()` (`:36-47`, which would set
  `sales.sale_status = COMPLETED`) is **never called** — this report includes tax rows attached to
  canceled/suspended sales as long as `sales.sale_time` is in range (and includes orphan
  `sales_taxes` rows with NULL `sales.sale_time`, which fail the BETWEEN and are excluded).
  Location and sale type are ignored. `sale_tax_amount` sums all tax types (included and excluded).

### 5.10 `summary_discounts` — Discounts Summary

* Class: `Summary_discounts.php` (data only; summary is inherited). Controller:
  `Reports.php:584-617`; input: `:566-578`.
  Permission: `reports_discounts` (`Reports.php:89`).
* Title: `Reports.discounts_summary_report` → "Discounts Summary Report".
* Inputs: `start_date`, `end_date`, `sale_type`, `location_id`, `discount_type` (int, default 0).
* SQL (`:25-48`):

```sql
-- discount_type = 1 (FIXED)
SELECT SUM(sales_items.discount) AS total,
       MAX(CONCAT('<currency_symbol>', sales_items.discount)) AS discount,
       count(*) AS count
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
WHERE discount_type = 1
  AND discount > 0
  [AND [DATE] AND [LOC] AND [SALETYPE]]     -- base _where
GROUP BY sales_items.discount
ORDER BY sales_items.discount

-- discount_type = 0 (PERCENT)
SELECT SUM(item_unit_price) * sales_items.discount / 100.0 AS total,
       MAX(CONCAT(sales_items.discount, "%")) AS discount,
       count(*) AS count
FROM sales_items AS sales_items
INNER JOIN sales AS sales ON sales_items.sale_id = sales.sale_id
WHERE discount_type = 0
  AND discount > 0
  [AND [DATE] AND [LOC] AND [SALETYPE]]
GROUP BY sales_items.discount
ORDER BY sales_items.discount
```

  (The `currency_symbol` is escaped with `$this->db->escape($config['currency_symbol'])` at `:31`,
  which is the subject of the SQL-injection regression test `Summary_discounts_test.php:10-50`.)
* Columns (`:12-19`): `discount`→Reports.discount, `count`→Reports.count, `total`→Reports.total.
* Mapping (`Reports.php:601-605`): `total = to_currency(row.total)`, `discount` raw (already a
  display string), `count` raw.
* Summary: inherited sales totals (`subtotal,tax,total,cost,profit`), not a discount total.
* Graphical: `graphical_summary_discounts` (`Reports.php:1177-1213`), bar; labels = discount string,
  series = count; `show_currency = false`; axes `Reports.count` / `Reports.discount`.
* Edge cases and defects to preserve or consciously fix:
  - Percent total formula multiplies `SUM(item_unit_price)` by the discount rate but **not** by
    `quantity_purchased`; it also averages across all lines in the group via the non-aggregated
    `sales_items.discount` under `ONLY_FULL_GROUP_BY`-permissive MySQL.
  - Fixed total sums per-line fixed discount amounts, not `discount * quantity`.
  - `discount_type` is typed `int` in the controller (`Reports.php:584`); the input page posts `0`/`1`.
  - `WHERE discount > 0` excludes zero-discount lines, unlike `summary_sales`.
  - Grouping is by raw discount value only (percent and fixed are separated by the preceding filter).

### 5.11 `summary_payments` — Payments Summary

* Class: `Summary_payments.php`. Controller: `Reports.php:623-676`; input `date_input_only`.
  Permission: `reports_payments` (`Reports.php:88`).
* Title: `Reports.payments_summary_report` → "Payments Summary Report".
* Inputs: `start_date`, `end_date` only; the controller hardcodes `sale_type='complete'` and
  `location_id='all'` (`Reports.php:627-632`). Those values are then used by `_where` on the outer
  queries (`:71,97`) but **not** in the temp tables.
* Temp tables (`:135-190`):

```sql
CREATE TEMPORARY TABLE IF NOT EXISTS {prefix}sumpay_taxes_temp (INDEX(sale_id)) ENGINE=MEMORY (
  SELECT sales.sale_id, SUM(sales_taxes.sale_tax_amount) AS total_taxes
  FROM {prefix}sales AS sales
  LEFT OUTER JOIN {prefix}sales_taxes AS sales_taxes ON sales.sale_id = sales_taxes.sale_id
  WHERE <date predicate> AND sales_taxes.tax_type = '1'
  GROUP BY sales.sale_id
);
CREATE TEMPORARY TABLE IF NOT EXISTS {prefix}sumpay_items_temp (INDEX(sale_id)) ENGINE=MEMORY (
  SELECT sales.sale_id, SUM(CASE WHEN sales_items.discount_type = 0
        THEN sales_items.quantity_purchased * sales_items.item_unit_price
             - ROUND(sales_items.quantity_purchased * sales_items.item_unit_price * sales_items.discount / 100, D)
        ELSE sales_items.quantity_purchased * (sales_items.item_unit_price - sales_items.discount) END) AS trans_amount
  FROM {prefix}sales AS sales
  LEFT OUTER JOIN {prefix}sales_items AS sales_items ON sales.sale_id = sales_items.sale_id
  LEFT OUTER JOIN {prefix}sumpay_taxes_temp AS sumpay_taxes ON sales.sale_id = sumpay_taxes.sale_id
  WHERE <date predicate>
  GROUP BY sales.sale_id
);
UPDATE {prefix}sumpay_items_temp AS sumpay_items
   SET trans_amount = trans_amount + IFNULL((SELECT total_taxes FROM {prefix}sumpay_taxes_temp AS sumpay_taxes
                                             WHERE sumpay_items.sale_id = sumpay_taxes.sale_id), 0);
CREATE TEMPORARY TABLE IF NOT EXISTS {prefix}sumpay_payments_temp (INDEX(sale_id)) ENGINE=MEMORY (
  SELECT sales.sale_id, COUNT(sales.sale_id) AS number_payments,
         SUM(CASE WHEN sales_payments.cash_adjustment = 0 THEN sales_payments.payment_amount ELSE 0 END) AS total_payments,
         SUM(CASE WHEN sales_payments.cash_adjustment = 1 THEN sales_payments.payment_amount ELSE 0 END) AS total_cash_adjustment,
         SUM(sales_payments.cash_refund) AS total_cash_refund
  FROM {prefix}sales AS sales
  LEFT OUTER JOIN {prefix}sales_payments AS sales_payments ON sales.sale_id = sales_payments.sale_id
  WHERE <date predicate>
  GROUP BY sales.sale_id
);
```

* Transaction-group query (`:55-75`):

```sql
SELECT 'Reports.trans_sales' AS trans_group,
       (CASE sale_type WHEN 0 THEN 'POS' WHEN 1 THEN 'INV' WHEN 4 THEN 'RET' END) AS trans_type,
       COUNT(sales.sale_id) AS trans_sales,
       SUM(sumpay_items.trans_amount) AS trans_amount,
       IFNULL(SUM(sumpay_payments.total_payments),0) AS trans_payments,
       IFNULL(SUM(sumpay_payments.total_cash_refund),0) AS trans_refunded,
       SUM(CASE WHEN sumpay_items.trans_amount - IFNULL(sumpay_payments.total_payments,0) > 0
                THEN sumpay_items.trans_amount - IFNULL(sumpay_payments.total_payments,0) ELSE 0 END) AS trans_due
FROM ospos_sales AS sales
LEFT OUTER JOIN sumpay_items_temp AS sumpay_items ON sales.sale_id = sumpay_items.sale_id
LEFT OUTER JOIN sumpay_payments_temp AS sumpay_payments ON sales.sale_id = sumpay_payments.sale_id
WHERE sales.sale_status = 0 AND [DATE]        -- _where also applies location/sale_type
GROUP BY trans_type
```

  Note the literal `ospos_sales` and unprefixed `sumpay_*` names (`:66-69`) — this breaks any
  non-default table prefix. `$payments` uses `sales_payments.payment_type` and
  `SUM(payment_amount - cash_refund) AS trans_amount, SUM(payment_amount) AS trans_payments,
  SUM(cash_refund) AS trans_refunded, 0 AS trans_due` (`:85-101`).
* Merge order (`:128`): `array_merge($sales, $separator, $payments)`. `$separator` is one
  `trans_group = '<HR>'` sentinel row (labels are blank).
* Gift cards (`:103-126`): rows whose `trans_type` contains `lang('Sales.giftcard')` are removed,
  summed, and re-appended as one `Gift Card` row with `trans_payments = trans_amount`, refunded 0,
  due 0.
* Controller mapping (`Reports.php:639-665`): a `<HR>` row renders all seven cells as `--`;
  empty `trans_type` is replaced with `lang('Reports.trans_nopay_sales')` ("Sales with no payment");
  `trans_sales`/`trans_group`/`trans_type` raw; the four money columns `to_currency`.
* Columns (`:12-23`): `trans_group`,`trans_type`,`trans_sales`,`trans_amount`,`trans_payments`,
  `trans_refunded`,`trans_due`.
* Summary: inherited sales totals (`subtotal,tax,total,cost,profit`), rendered under the payment
  table. `$cash_payment = lang('Sales.cash')` at `:31` and `$total_cash_refund` at `:78-83` are
  computed and never used.
* Graphical: `graphical_summary_payments` (`Reports.php:1224-1259`), pie; only rows with
  `trans_group == lang('Reports.trans_payments')` and non-empty `trans_amount`; percentage over
  `summary.total` (sales total).
* Edge cases: suspended/canceled sales excluded by `sale_status = 0`; refunds are assumed to be
  cash; `trans_due` ignores refunds; `trans_payments` does not subtract refunds; the transaction
  group's `trans_amount` adds the sales-tax total unconditionally (regardless of `tax_included`),
  while line amounts already include tax when `tax_included` is on.

### 5.12 `inventory_low` — Low Inventory Report

* Class: `Inventory_low.php`. Controller: `Reports.php:2122-2152`. Permission: `reports_inventory`
  (`Reports.php:101`). No inputs.
* Title: `Reports.inventory_low_report` → "Low Inventory Report"; subtitle `''`.
* SQL (`Inventory_low.php:33-51`):

```sql
SELECT <Item::get_item_name('name')>,           -- items.name, or CONCAT(items.name,' | ',items.pack_name) when multi_pack_enabled
       items.item_number,
       item_quantities.quantity,
       items.reorder_level,
       stock_locations.location_name
FROM {prefix}items AS items
JOIN {prefix}item_quantities AS item_quantities ON items.item_id = item_quantities.item_id
JOIN {prefix}stock_locations AS stock_locations ON item_quantities.location_id = stock_locations.location_id
WHERE items.deleted = 0
  AND items.stock_type = 0
  AND item_quantities.quantity <= items.reorder_level
  AND stock_locations.deleted = 0
ORDER BY items.name
```

  `get_item_name()` is `Item.php:1471-1488`; it uses `config.multi_pack_enabled` and
  `NAME_SEPARATOR = ' | '` (`app/Config/Constants.php:131`).
* Columns (`:18-27`): `item_name`,`item_number`,`quantity`,`reorder_level`,`location_name`.
* Mapping (`Reports.php:2134-2140`): quantity and reorder level `to_quantity_decimals`, others raw.
* Summary: `[]` (`:57-60`) — no summary rows.
* Graphical: none.
* Edge cases: a failed query returns `[]` rather than throwing, by design
  (`Inventory_low.php:50`, regression test `tests/Models/Reports/Inventory_low_test.php:28-33`).
  Only stock items (`stock_type = 0`) and undeleted locations. Items with no quantity row at all do
  not appear (inner joins).

### 5.13 `inventory_summary` — Inventory Summary

* Class: `Inventory_summary.php`. Controller: `Reports.php:2179-2212`; input page `:2160-2172`.
  Permission: `reports_inventory` (`Reports.php:100`).
* Title: `Reports.inventory_summary_report` → "Inventory Summary Report"; subtitle `''`.
* Inputs: `location_id` (default `all`), `item_count` (default `all`, options
  `all`/`zero_and_less`/`more_than_zero` from `getItemCountDropdownArray()`, `:109-116`).
* SQL (`:38-76`):

```sql
SELECT <Item::get_item_name('name')>,
       items.item_number,
       items.category,
       item_quantities.quantity,
       (item_quantities.quantity * items.qty_per_pack) AS low_sell_quantity,
       items.reorder_level,
       stock_locations.location_name,
       items.cost_price,
       items.unit_price,
       (items.cost_price * item_quantities.quantity) AS sub_total_value
FROM {prefix}items AS items
JOIN {prefix}item_quantities AS item_quantities ON items.item_id = item_quantities.item_id
JOIN {prefix}stock_locations AS stock_locations ON item_quantities.location_id = stock_locations.location_id
WHERE items.deleted = 0
  AND items.stock_type = 0
  AND stock_locations.deleted = 0
  [AND item_quantities.quantity <= 0]   -- item_count = 'zero_and_less'
  [AND item_quantities.quantity > 0]    -- item_count = 'more_than_zero'
  [AND stock_locations.location_id = '<location_id>']
ORDER BY items.name, items.qty_per_pack
```

* Columns (`:18-32`): `item_name`,`item_number`,`category`,`quantity`,`low_sell_quantity`,
  `reorder_level`,`location_name`,`cost_price`,`unit_price`,`subtotal`.
* Mapping (`Reports.php:2189-2200`): quantity/low_sell/reorder `to_quantity_decimals`; cost, unit
  price and `sub_total_value` `to_currency`; rest raw.
* Summary (`:85-102`) is computed in PHP over the result rows, **not** over the inputs:
  `total_inventory_value` = Σ`sub_total_value`; `total_quantity` = Σ`quantity`;
  `total_low_sell_quantity` = Σ`low_sell_quantity`; `total_retail` = Σ(`unit_price * quantity`).
  Keys render via `lang('Reports.total_inventory_value')` etc.; `total_quantity` is printed raw,
  the others with `to_currency`.
* Graphical: none.
* Edge cases: one row per item × location. `low_sell_quantity` multiplies by `qty_per_pack`, which
  is 1 unless multi-pack is in use. `item_count` filter is applied before the summary, so the totals
  describe the filtered set. Items with no stock row are excluded. `stock_type` excludes services
  and amount-entry items.

### 5.14 `detailed_item_sales` — Detailed Item Sales Report

* Class: `Detailed_item_sales.php`. Controller: `Reports.php:1934-1988`; input `:730-744`.
  Permission: `reports_sales` (`Reports.php:97`).
* Title: `Reports.detailed_item_sales_report` → "Detailed Item Sales Report".
* Inputs: `startDate`, `endDate`, `saleType` (default `sales`), `locationId` (default `all`),
  `discountType` (default `all`). The controller sanitises
  (`Reports.php:1938-1940`): sale type must be a key of `get_sale_type_options()`, else `sales`;
  location must be all digits, else `all`; discount type must be one of `all`, `0`, `1`, else `all`.
* `create()` delegates to `Sale::create_temp_table($inputs)` (`Detailed_item_sales.php:9-13`).
* SQL (`:38-69`, `:88-136`):

```sql
SELECT sale_time, sale_id, customer_name, name AS item_name, category, item_number,
       quantity_purchased, item_unit_price, discount, discount_type,
       subtotal, tax, total, cost, profit, employee_name, payment_type, comment, item_location
FROM sales_items_temp
WHERE <sale-type predicate>            -- same six branches as [SALETYPE], applied to temp columns
  [AND item_location = '<location>']
  [AND discount_type = <0|1>]          -- only when discountType != 'all'
ORDER BY sale_time, sale_id, line
```

  Summary query (`:71-86`): `SUM(quantity_purchased) AS total_quantity, SUM(subtotal) AS subtotal,
  SUM(tax) AS tax, SUM(total) AS total, SUM(cost) AS cost, SUM(profit) AS profit` with the same
  filters.
* Columns (`:15-36`): 17 columns — `sale_time`(Reports.date), `sale_id`(Reports.sale_id),
  `customer_name`(Reports.sold_to), `item_name`(Reports.item), `category`, `item_number`,
  `quantity`, `unit_price`, `discount`, `subtotal`, `tax`, `total`, `cost`, `profit`,
  `employee_name`(Reports.sold_by), `payment_type`, `comment`.
* Mapping (`Reports.php:1957-1976`): datetime via `to_datetime(strtotime())`, quantity
  `to_quantity_decimals`, unit price/subtotal/total/cost/profit `to_currency`, tax
  `to_currency_tax`, discount rendered as `"<value>%"` when `discount_type = PERCENT` else
  `to_currency`, `sale_id`/customer/item/category/number/employee/payment/comment raw.
* Summary keys: `total_quantity, subtotal, tax, total, cost, profit`; `total_quantity` printed raw.
* Graphical: none.
* Edge cases: one row per sale line (not per sale); returns appear as negative rows; suspended
  quotes/work orders only when the corresponding sale type is selected; `discount_type = all` means
  no discount filter. There is no detail expansion for this report.

### 5.15 `detailed_receivings` — Detailed Receivings Report

* Class: `Detailed_receivings.php`. Controller: `Reports.php:2037-2117`; input `:752-760`.
  Permission: `reports_receivings` (`Reports.php:99`).
* Title: `Reports.detailed_receivings_report` → "Detailed Receivings Report".
* Inputs: `start_date`, `end_date`, `receiving_type` (`all`/`receiving`/`returns`/`requisitions`,
  default `all` from the view), `location_id` (default `all`).
* `create()` → `Receiving::create_temp_table($inputs)` (`Detailed_receivings.php:19-24`).
* Summary query (`:84-117`):

```sql
SELECT receiving_id,
       MAX(receiving_time) AS receiving_time,
       SUM(quantity_purchased) AS items_purchased,
       MAX(CONCAT(employee.first_name," ",employee.last_name)) AS employee_name,
       MAX(supplier.company_name) AS supplier_name,
       SUM(total) AS total,
       SUM(profit) AS profit,
       MAX(payment_type) AS payment_type,
       MAX(comment) AS comment,
       MAX(reference) AS reference
FROM receivings_items_temp AS receivings_items_temp
INNER JOIN people AS employee ON receivings_items_temp.employee_id = employee.person_id
LEFT JOIN suppliers AS supplier ON receivings_items_temp.supplier_id = supplier.person_id
WHERE [item_location = '<location>']
  [AND quantity_purchased > 0]     -- receiving
  [AND quantity_purchased < 0]     -- returns
  [HAVING items_purchased = 0]     -- requisitions
GROUP BY receiving_id, receiving_time
ORDER BY MAX(receiving_id)
```

* Detail query per summary row (`:119-147`):

```sql
SELECT MAX(name) AS name, MAX(item_number) AS item_number, MAX(category) AS category,
       MAX(quantity_purchased) AS quantity_purchased, MAX(serialnumber) AS serialnumber,
       MAX(total) AS total, MAX(discount) AS discount, MAX(discount_type) AS discount_type,
       MAX(item_location) AS item_location, MAX(item_receiving_quantity) AS receiving_quantity
       [, attribute GROUP_CONCATs when definition_ids non-empty]
FROM receivings_items_temp
INNER JOIN items ON receivings_items_temp.item_id = items.item_id
[LEFT JOIN attribute_links … AND attribute_links.receiving_id = … AND definition_id IN (…)]
[LEFT JOIN attribute_values …]
WHERE receivings_items_temp.receiving_id = <id>
GROUP BY receivings_items_temp.receiving_id, receivings_items_temp.item_id
```

* Summary-only totals (`:156-180`): `SUM(total) AS total` with the same location/receiving-type
  filters.
* Columns (`:29-52`): summary = `id`(Reports.receiving_id), `receiving_time`(Reports.date,
  sortable=false), `quantity`(Reports.quantity), `employee_name`(Reports.received_by),
  `supplier_name`(Reports.supplied_by), `total`, `payment_type`, `comment`,
  `reference`(Reports… actually `Receivings.reference`); details = `item_number`,`name`,`category`,
  `quantity`,`total`,`discount` — six positional headers.
* Controller mapping (`Reports.php:2063-2104`): summary rows format datetime, quantity, total,
  profit, and build the edit anchor to `receivings/edit/<id>`; detail row is
  `[item_number, name, category, quantity, total, discount, …attribute values]` where quantity is
  `"<qty> x <receiving_quantity>"` when receiving quantity > 1 and gets ` [location name]` appended
  when `Stock_location::multipleLocations()` (`:2088-2091`); discount is percent-formatted or
  currency. Attributes appended via `expand_attribute_values()` (`:2093`).
* Summary keys in `tabular_details`: only `total` (`:2113`), rendered `lang('Reports.total')`.
* Edge cases: `requisitions` uses `HAVING items_purchased = 0` while the summary-totals query uses
  `WHERE quantity_purchased = 0` — these are different predicates (a receiving with +1 and −1
  lines is a requisition in the list but contributes nothing to the totals query, which is arguably
  the intent). `receiving_quantity` > 1 multiplies the line total in `Receiving::create_temp_table`
  (`Receiving.php:349-352`), so totals are pack-extended. Reference is `MAX(reference)`, one string
  per receiving.

### 5.16 `detailed_sales` — Detailed Transactions Report

* Class: `Detailed_sales.php`. Controller: `Reports.php:1822-1932`; input `date_input_sales`
  (`:717-728`). Permission: `reports_sales` (`Reports.php:98`).
* Title: `Reports.detailed_sales_report` → "Detailed Transactions Report".
* Inputs: `start_date`, `end_date`, `sale_type`, `location_id` (default `all`); plus
  `definition_ids` = keys of `Attribute::getDefinitionsByFlags(Attribute::SHOW_IN_SALES, true)`
  (`Reports.php:1826,1833`, `app/Models/Attribute.php:270-292`).
* `create()` → `Sale::create_temp_table()` (`Detailed_sales.php:19-24`).
* Summary query (`:96-170`) — per sale, from `sales_items_temp`:

```sql
SELECT sale_id,
       MAX(CASE
         WHEN sale_type = 0 AND sale_status = 0 THEN 'POS'
         WHEN sale_type = 1 AND sale_status = 0 THEN 'INV'
         WHEN sale_type = 2 AND sale_status = 1 THEN 'W/O'
         WHEN sale_type = 3 AND sale_status = 1 THEN 'Q'
         WHEN sale_type = 4 AND sale_status = 0 THEN 'RET'
         WHEN sale_status = 2 THEN 'CNL'
         ELSE '' END) AS type_code,
       MAX(sale_status) AS sale_status,
       MAX(sale_time) AS sale_time,
       SUM(quantity_purchased) AS items_purchased,
       MAX(employee_name) AS employee_name,
       MAX(customer_name) AS customer_name,
       SUM(subtotal) AS subtotal, SUM(tax) AS tax, SUM(total) AS total,
       SUM(cost) AS cost, SUM(profit) AS profit,
       MAX(payment_type) AS payment_type,
       MAX(comment) AS comment
FROM sales_items_temp
WHERE [item_location = '<location>']
  AND <sale-type predicate on sale_status/sale_type>
GROUP BY sale_id
ORDER BY MAX(sale_time)
```

  (The `type_code` labels are the `Reports.code_*` language keys: POS/INV/W/O/Q/RET/CNL,
  `Reports.php:10-16`.)
* Detail query per sale (`:172-207`):

```sql
SELECT MAX(name) AS name, MAX(category) AS category, MAX(quantity_purchased) AS quantity_purchased,
       MAX(item_location) AS item_location, MAX(item_number) AS item_number,
       MAX(description) AS description, MAX(subtotal) AS subtotal, MAX(tax) AS tax,
       MAX(total) AS total, MAX(cost) AS cost, MAX(profit) AS profit,
       MAX(discount) AS discount, MAX(discount_type) AS discount_type,
       MAX(sale_status) AS sale_status
       [, attribute GROUP_CONCATs]
FROM sales_items_temp
[LEFT JOIN attribute_links ON attribute_links.item_id = sales_items_temp.item_id
                          AND attribute_links.sale_id  = sales_items_temp.sale_id
                          AND definition_id IN (…)]
[LEFT JOIN attribute_values ON attribute_values.attribute_id = attribute_links.attribute_id]
WHERE sales_items_temp.sale_id = <id>
GROUP BY sales_items_temp.sale_id, sales_items_temp.item_id, sales_items_temp.sale_id
```

  Rewards: `SELECT used, earned FROM sales_reward_points WHERE sale_id = <id>` (`:203-206`).
* Overall summary (`:216-264`): `SUM(subtotal), SUM(tax), SUM(total), SUM(cost), SUM(profit)` with
  the location and sale-type filters.
* Columns (`:29-65`): summary = `id, type_code, sale_time, quantity, employee_name, customer_name,
  subtotal, tax, total, cost, profit, payment_type, comment`; details = 11 positional headers
  `name, category, item_number, description, quantity, subtotal, tax, total, cost, profit, discount`;
  attribute definition names are appended (`Reports.php:1840-1846`); details_rewards =
  `used, earned`.
* Controller mapping (`Reports.php:1856-1919`): summary datetime/quantity/money/anchors as in
  §5.15; detail quantity gets ` [location]` when multiple locations; attributes appended via
  `expand_attribute_values()`; the edit anchor carries delete/restore depending on `sale_status`.
* Graphical: none.
* Edge cases: `type_code` uses `MAX(CASE …)` over lines, so mixed-status lines (should not occur)
  resolve by MySQL's max string. `MAX(comment)` takes the lexicographically largest comment when a
  sale has multiple lines with different comments (comments are sale-level, so normally identical).
  Deleted items are not filtered. Attributes are joined by `item_id AND sale_id`, so an attribute
  shared by two lines duplicates the row unless `DISTINCT` in the GROUP_CONCAT (it is `DISTINCT`).
  Rewards rows are always queried even when the reward feature is disabled; the view hides them.

### 5.17 `specific_customers` — per-customer report

* Class: `Specific_customer.php`. Controller: `Reports.php:1317-1409`; input `:1267-1286`.
  Permission: `reports_customers` (`Reports.php:102`).
* Title: `"<first> <last> " . lang('Reports.report')` (`Reports.php:1398`).
* Inputs: `start_date`, `end_date`, `customer_id`, `sale_type`, `payment_type`.
  `payment_type` values (`Reports.php:1291-1304`): `all` (label `Common.none_selected_text`), `cash`,
  `due`, `check`, `credit`, `debit`, `bank_transfer`, `wallet`, `invoices`.
* `create()` → `Sale::create_temp_table()` (`Specific_customer.php:19-24`).
* Summary query (`:70-163`):

```sql
SELECT sale_id,
       MAX(CASE … type_code …) AS type_code,
       MAX(sale_status) AS sale_status,
       MAX(sale_time) AS sale_time,
       SUM(quantity_purchased) AS items_purchased,
       MAX(employee_name) AS employee_name,
       SUM(subtotal) AS subtotal, SUM(tax) AS tax, SUM(total) AS total,
       SUM(cost) AS cost, SUM(profit) AS profit,
       MAX(payment_type) AS payment_type,
       MAX(comment) AS comment
FROM sales_items_temp
WHERE customer_id = '<customer_id>'
  [AND sale_type = 1]                              -- payment_type = 'invoices'
  [OR payment_type LIKE '%<lang('Sales.<payment_type>')>%']  -- otherwise, when != 'all'
  AND <sale-type predicate>
GROUP BY sale_id
ORDER BY MAX(sale_time)
```

  The payment filter is `$builder->like('payment_type', lang('Sales.' . $inputs['payment_type']))`
  (`:101`, `:179`), i.e. a substring match against the `GROUP_CONCAT`-produced
  `payment_type` string from the temp table (e.g. `"Cash 10.00, Credit Card 5.00"`).
* Detail rows (`:150-160`): `SELECT name, category, item_number, description, quantity_purchased,
  subtotal, tax, total, cost, profit, discount, discount_type FROM sales_items_temp WHERE sale_id = <id>`
  (no grouping — one row per line). Rewards: `SELECT used, earned FROM sales_reward_points WHERE sale_id = <id>`.
* Overall summary (`:169-221`): same filters as the summary query, `SUM(subtotal/tax/total/cost/profit)`.
* Columns (`:29-64`): summary = `id, type_code, sale_time, quantity, employee_name, subtotal, tax,
  total, cost, profit, payment_type, comment` (no customer column, because the report is for one
  customer); details = 11; rewards = 2.
* Controller mapping (`Reports.php:1334-1389`): sale time `to_datetime`, quantity
  `to_quantity_decimals`, money, `edit` anchor to `sales/edit/<id>` (delete or restore depending on
  status), detail rows positional, rewards `[used, earned]`.
* Graphical: none.
* Edge cases: `$customer_info = $this->customer->getInfo($customer_id)` returns an empty object for
  an unknown id (`Customer.php:92-101`), so the title degrades to `" <report>"`; `$customer_name`
  computed at `:1392-1394` is unused. No location filter in this report. `payment_type = 'invoices'`
  is a sale-type filter, not a payment filter.

### 5.18 `specific_employees` — per-employee report

* Class: `Specific_employee.php`. Controller: `Reports.php:1444-1532`; input `:1417-1432`.
  Permission: `reports_employees` (`Reports.php:103`).
* Title: `"<first> <last> " . lang('Reports.report')` (`Reports.php:1521`).
* Inputs: `start_date`, `end_date`, `employee_id`, `sale_type`.
* Summary query (`:70-157`): identical shape to §5.17 but `WHERE employee_id = '<employee_id>'`,
  no payment filter, and `MAX(customer_name) AS customer_name` replaces `employee_name`.
* Detail rows (`:144-154`): same 12-column select as §5.17. Rewards: same.
* Overall summary (`:163-197`): same filter shape.
* Columns (`:29-64`): `id, type_code, sale_time, quantity, customer_name, subtotal, tax, total, cost,
  profit, payment_type, comment`; details 11; rewards 2.
* Mapping (`Reports.php:1461-1516`): as §5.17 but `employee_info` title; `edit` anchor.
* Edge cases: `Employee::getInfo()` returns an empty object with nulls for unknown ids
  (`Employee.php:92-112`), title becomes `"  Report"`. No location filter.

### 5.19 `specific_discounts` — per-discount report

* Class: `Specific_discount.php`. Controller: `Reports.php:1569-1663`; input `:1540-1556`.
  Permission: `reports_discounts` (`Reports.php:104`).
* Title: `"<discount>% " . lang('Reports.discount') . " " . lang('Reports.report')` —
  note the `%` is appended unconditionally even for fixed discounts (`Reports.php:1653`).
* Inputs: `start_date`, `end_date`, `discount`, `sale_type`, `discount_type`.
  The select offers 0..100 in steps of 10 (`Reports.php:1547-1551`); when discount type is fixed the
  form switches to a numeric `discount_fixed` input defaulting to `config.default_sales_discount`
  (`specific_input.php:48-59,99-109`).
* Summary query (`:71-160`):

```sql
SELECT sale_id, MAX(CASE … type_code …) AS type_code, MAX(sale_status), MAX(sale_time),
       SUM(quantity_purchased) AS items_purchased, MAX(employee_name), MAX(customer_name),
       SUM(subtotal), SUM(tax), SUM(total), SUM(cost), SUM(profit),
       MAX(payment_type), MAX(comment)
FROM sales_items_temp
WHERE discount >= '<discount>'
  AND discount_type = '<discount_type>'
  AND <sale-type predicate>
GROUP BY sale_id
ORDER BY MAX(sale_time)
```

* Details (`:147-157`) and rewards as §5.17.
* Overall summary (`:166-202`): same discount/discount-type/sale-type filters, sums five money columns.
* Columns (`:29-65`): same 13 summary columns as §5.17; details 11; rewards 2.
* Mapping (`Reports.php:1592-1650`): as §5.17; no `editable` key in the view data (`:1652-1660`).
* Edge cases: `>=` means "this discount or greater"; the filter is line-level, so a sale appears if
  **any** line meets it, while the summary sums **all** lines of that sale (including lines below
  the threshold). The title's unconditional `%` is a display bug for fixed discounts. Note that
  `specific_discounts` does not set `editable` while `specific_customers`/`specific_employees`/
  `detailed_sales`/`detailed_receivings` do; consequently `init_dialog()` is only wired where
  `$editable` is set (`visibility_js.php:93-98`).

### 5.20 `specific_suppliers` — per-supplier report

* Class: `Specific_supplier.php`. Controller: `Reports.php:1750-1794`; input `:1724-1739`.
  Permission: `reports_suppliers` (`Reports.php:105`).
* Title: `"<company> (<first> <last>) " . lang('Reports.report')` (`Reports.php:1786`).
* Inputs: `start_date`, `end_date`, `supplier_id`, `sale_type`.
* Data query (`:52-124`): per sale **and item** (grouping `['item_id','sale_id']`):

```sql
SELECT sale_id, MAX(CASE … type_code …) AS type_code, MAX(sale_status), MAX(sale_time),
       MAX(name) AS name, MAX(category) AS category, MAX(item_number) AS item_number,
       SUM(quantity_purchased) AS items_purchased,
       SUM(subtotal) AS subtotal, SUM(tax) AS tax, SUM(total) AS total,
       SUM(cost) AS cost, SUM(profit) AS profit,
       MAX(discount_type) AS discount_type, MAX(discount) AS discount
FROM sales_items_temp
WHERE supplier_id = '<supplier_id>'
  AND <sale-type predicate>
GROUP BY item_id, sale_id
ORDER BY MAX(sale_time)
```

  `supplier_id` in the temp table is `MAX(items.supplier_id)` (`Sale.php:1125`), so this report is
  "sales of items supplied by supplier X", not purchase/receiving history.
* Columns (`:29-46`) are flat (not `summary`/`details`): `id, type_code, sale_time, name, category,
  item_number, quantity, subtotal, tax, total, cost, profit, discount`.
* Mapping (`Reports.php:1766-1781`): datetime, quantity, money, discount string; `id = sale_id`.
* Summary (`:130-175`): five money sums with supplier and sale-type filters.
* Graphical: none.
* Edge cases: no `clearCache()` in this method (all other report actions call it). Grouping by
  `item_id, sale_id` means a sale with three items from the supplier yields three rows sharing a
  `sale_id`, so `id` is not unique in the table. Supplier info for an unknown id returns an empty
  object (`Supplier.php:69-88`) → title `" () Report"`.

### 5.21 Controller-generated endpoints and the index

* `get_payment_type()` (`Reports.php:1291-1304`): array `all/cash/due/check/credit/debit/
  bank_transfer/wallet/invoices` with `Sales.*` labels (`Common.none_selected_text` for `all`).
  Used only by `specific_customer_input`.
* `get_sale_type_options()` (`Reports.php:1799-1813`): ordered `complete`, `sales`;
  `quotes` only when `config.invoice_enable`; `work_orders` only when `invoice_enable` **and**
  `work_order_enable`; then `canceled`, `returns`. Labels `Reports.complete` ("Completed Sales and
  Returns"), `Reports.completed_sales`, `Reports.quotes`, `Reports.work_orders`,
  `Reports.canceled`, `Reports.returns`.
* `getGet_detailed_sales_row()` / `getGet_detailed_receivings_row()`: see §4.5.
  Both rebuild the temp table for one id before querying. `getGet_detailed_receivings_row` does not
  call `clearCache()`.
* `index()`/`getIndex()`: see §4.8.
* `clearCache()`: `:2233-2240`.

### 5.22 `getSummaryData()` on an empty result set

Aggregate queries without `GROUP BY` return exactly one row. With no matching sales,
`ROUND(SUM(...), D)` is NULL, so `subtotal`, `total`, `cost` and `profit` are NULL and `tax` is `0`.
The tabular view then prints `lang(...) . ': ' . to_currency(null)` → `to_decimals(null)` returns
`''`, so the summary block shows blank values (not zeros). Reports with `GROUP BY` return zero rows
and the summary query still returns the single NULL row. This differs from the detailed reports,
whose overall summaries (`SUM(total)` etc.) also produce one NULL row, and from
`inventory_summary`, whose summary is computed from an empty array and therefore returns literal
zeros (`Inventory_summary.php:87-99`).

---

## 6. Permissions and location scoping

### 6.1 Authoritative upstream map

`Reports.php:85-106` (verbatim keys; the values are the permission ids):

| Report key (segment 2 after normalisation) | Permission | Map line |
|---|---|---|
| `summary_sales` | `reports_sales` | 86 |
| `summary_expenses_categories` | `reports_expenses_categories` | 87 |
| `summary_payments` | `reports_payments` | 88 |
| `summary_discounts` | `reports_discounts` | 89 |
| `summary_categories` | `reports_categories` | 90 |
| `summary_customers` | `reports_customers` | 91 |
| `summary_items` | `reports_items` | 92 |
| `summary_suppliers` | `reports_suppliers` | 93 |
| `summary_employees` | `reports_employees` | 94 |
| `summary_taxes` | `reports_taxes` | 95 |
| `summary_sales_taxes` | `reports_sales_taxes` | 96 |
| `detailed_item_sales` | `reports_sales` | 97 |
| `detailed_sales` | `reports_sales` | 98 |
| `detailed_receivings` | `reports_receivings` | 99 |
| `inventory_summary` | `reports_inventory` | 100 |
| `inventory_low` | `reports_inventory` | 101 |
| `specific_customers` | `reports_customers` | 102 |
| `specific_employees` | `reports_employees` | 103 |
| `specific_discounts` | `reports_discounts` | 104 |
| `specific_suppliers` | `reports_suppliers` | 105 |

Graphical methods inherit the map after the `graphical_` prefix is stripped (`:110-112`).
`summary_expenses_categories` and `summary_payments` input pages require only `reports`
(their method names are not map keys), but their data methods are checked.

The permissions table at 3.4.3 contains exactly 13 report permissions:
`reports_categories`, `reports_customers`, `reports_discounts`, `reports_employees`,
`reports_expenses_categories`, `reports_inventory`, `reports_items`, `reports_payments`,
`reports_receivings`, `reports_sales`, `reports_sales_taxes`, `reports_suppliers`,
`reports_taxes` (grep over `app/Database/Migrations/sqlscripts/*.sql`; initial set in
`initial_schema.sql:373-383`, `reports_expenses_categories` added in
`3.1.1_to_3.2.0.sql:128`, `reports_sales_taxes` in `3.3.0_indiagst.sql:97`). The default admin
(person 1) is granted all of them (`initial_schema.sql:419-431` and the migration grant inserts).

### 6.2 Base module and sub-module semantics

`Secure_Controller::__construct('reports')` (`Reports.php:59`) enforces `has_module_grant('reports')`
for every action. `Employee::has_module_grant()` (`Employee.php:444-456`):

```
if count(grants where permission_id LIKE '<module>%' and person_id = X) != 1:
    return count != 0
return has_subpermissions(module)      // true only if no permission '<module>_%' exists
```

So for `reports` (which has 11 sub-permissions in the default schema), a user with **only** the
base `reports` grant is denied; a user with two or more report grants is allowed at the module level
and then the per-report `has_grant()` check decides. `has_grant()` is an exact row lookup
(`Employee.php:472-486`).

### 6.3 Location scoping

* The only location filter is the SQL predicate on `sales_items.item_location` /
  `receivings_items.item_location` / `stock_locations.location_id` per report.
* The dropdown is already restricted to locations the user holds a stock permission for
  (`Stock_location::get_allowed_locations`, `:104-118`), but the submitted value is not validated
  against that list. There is no “all my locations” expansion: `all` removes the predicate.
* `Detailed_sales` and `Detailed_receivings` show a `[location name]` suffix on quantities when
  `Stock_location::multipleLocations()` (`Stock_location.php:95-98`) is true
  (`Reports.php:1893-1895`, `:2089-2091`).
* Inventory reports scope by location row; `inventory_low` has no location filter at all (every
  location is listed), while `inventory_summary` filters `stock_locations.location_id`.

---

## 7. Target baseline (file by file)

### 7.1 `src/lib/reports/registry.ts` (492 lines)

* `ReportDef` (lines 6-15) models `key`, hard-coded English `title`, `permission`, optional
  `hasDateRange`, `columns: {name,label,align}[]`, optional `chart` as a bare string, and
  `buildSql({start,end})`. There is **no** sale-type, location, entity, discount, payment,
  receiving-type or item-count parameter.
* `ts()` (17-21) parses `YYYY-MM-DD`, forces local `T00:00:00` / `T23:59:59`, and returns
  `undefined` for invalid input (unbounded query).
* `runReport()` (23-29) returns every row; no summary, no total count, no page.
* `REPORTS` (31-461) — 23 base entries. Keys and line ranges:
  `summary_sales` 32-52, `detailed_sales` 53-75, `summary_payments` 76-93,
  `detailed_payments` 94-112, `detailed_receivings` 113-134, `inventory_summary` 135-150,
  `inventory_low` 151-166, `summary_customers` 167-186, `summary_employees` 187-206,
  `summary_suppliers` 207-226, `summary_categories` 227-245, `summary_taxes` 246-262,
  `summary_discounts` 263-281, `summary_expenses` 282-298, `summary_expenses_categories` 299-316,
  `summary_cashups` 317-333, `summary_giftcards` 334-347, `specific_customer` 348-365,
  `specific_employee` 366-383, `specific_supplier` 384-401, `specific_discount` 402-420,
  `summary_items` 421-442, `summary_sales_taxes` 443-460.
* `GRAPHICAL_TWINS` (465-477) clones eleven base keys with a `_graphical` suffix and a chart type;
  the loop (479-489) appends them to the same array, so the index page lists them as separate
  reports.
* `getReport()` (491-493) is a linear key lookup; unknown keys yield `notFound()` in the page.

### 7.2 `src/app/(secure)/reports/page.tsx` (19 lines)

* Requires only `reports` (line 6) and maps **every** `REPORTS` entry to a link (11-16),
  including graphical twins; it never consults the user's grants and never renders upstream's
  four panels or the `can_show_report` exclusion.

### 7.3 `src/app/(secure)/reports/[key]/page.tsx` (29 lines)

* `notFound()` for unknown keys (15), permission via `requirePermission("reports", subperm)` where
  `subperm` is the permission with `reports_` stripped (17-18), then immediately executes
  `runReport(def, {start: filters.start, end: filters.end})` (20). No input state, no defaults, no
  validation, no error boundary.
* Serialises only key/title/permission/hasDateRange/columns/chart (21-28).

### 7.4 `src/app/(secure)/reports/[key]/export/route.ts` (27 lines)

* Same key/permission handling; missing key → 404 (14).
* Reads only `start`/`end` (18); runs the same capped query (19).
* Emits CSV with header labels and raw cell values (20-22); filename `<key>.csv`; no BOM, no
  locale formatting, no summary rows, no XLSX/PDF, no pagination and no streaming. Upstream has no
  server export at all — its export is bootstrap-table client-side over the loaded page
  (`tabular.php:63-65`), so this route is a target-only feature whose contract must be defined
  rather than matched.

### 7.5 `src/components/reports/report-view.tsx` (106 lines)

* `fmt()` (22-33): numbers → integers printed raw, non-integers `toFixed(2)`; a 10-digit **string**
  is treated as a Unix timestamp and rendered with `toLocaleString()`. Since SQLite returns
  `sale_time` as a number, real sale times are printed as raw epoch integers, not dates; there is no
  currency symbol, thousands separator, configurable decimals or tax/quantity distinction.
* `ChartFor()` (35-50): label = first column, value = first other column; no `meta`, no axis titles,
  no currency, no percent.
* Render (52-106): title, back link, optional GET filter form with `start`/`end` only (59-77),
  chart (78-82), empty state (83-84), plain table (86-104). No summary block, no pagination, no
  search, no sort, no column visibility, no cost/profit toggle, no detail rows.

### 7.6 `src/components/reports/charts.tsx` (99 lines)

Inline SVG renderers: `BarChart` (5-27), `HBarChart` (29-50), `LineChart` (52-70), `PieChart`
(72-99). They accept `{label,value}[]`, use a fixed seven-colour palette, truncate labels to 8/16
characters, and have no tooltips, axes, currency formatting or locale. No third-party chart
dependency, so no Chartist parity is possible without either accepting a visual rewrite or adding
a chart library.

### 7.7 `src/app/api/reports/**`

* `[key]/detailed-sales-row/route.ts`: treats the path segment as `saleId` (9-11), requires only a
  session (7-8), loads raw `sales`, `sales_items`, `sales_payments`, `sales_taxes`, `people`
  (13-18), returns `{sale, items, payments, taxes, customer}`.
* `[key]/detailed-receivings-row/route.ts`: analogous, `{receiving, items, supplier}` (13-19).
* `payment-type/route.ts`: returns `getPaymentOptions()` (`src/lib/sale/sale-model.ts:453-458`),
  i.e. `["Cash","Check","Debit Card","Credit Card","Due"]` — not the report's
  `all/cash/due/check/credit/debit/bank_transfer/wallet/invoices` map (`Reports.php:1291-1304`).
* `sale-type-options/route.ts`: returns `POS/Invoice/Work Order/Quote/Return` ids 0-4 — the
  **sale type enum**, not the report filter options (`Reports.php:1799-1813`).
* None of these routes is referenced by any page or component (grep over `src/` and `e2e/` finds no
  caller outside `src/app/api`).

### 7.8 Schema facts that constrain the port

| Upstream requirement | Target table/column | Status |
|---|---|---|
| `sales_items_taxes.tax_type` (0 internal / 1 sales) | `sales_items_taxes` has `saleId,itemId,line,name,percent,itemTaxAmount` (`src/db/schema/sales.ts:37-44`) | **missing** |
| `sales_payments.reference_code` | `sales_payments` (`sales.ts:55-63`) | **missing** |
| `sales_taxes.name`, `tax_rate`, `tax_category_id`, `jurisdiction_id`, `reporting_authority` via joins | `sales_taxes` has only `saleId,taxType,roundCode,taxGroup,saleTaxBasis,saleTaxAmount` (`sales.ts:46-53`) | **missing** |
| `expenses.date`, `expenses.tax_amount` | `expenses.expenseTime` (unix), no tax amount (`src/db/schema/expenses.ts:4-13`) | **changed / missing** |
| `expense_categories.category_name` | `expense_categories.category` (`expenses.ts:15-20`) | renamed |
| `receivings.reference` | `receivings.receivingRef` integer (`src/db/schema/receivings.ts:12`) | type mismatch |
| `sales_reward_points.used/earned` | no such table in `src/db/schema/` | **missing** |
| `items.stock_type` | present as `stockType` (`src/db/schema/items.ts:18`) | ok |
| `items.qty_per_pack`, `pack_name` | present (`items.ts:21-22`) | ok |
| `stock_locations.deleted` | present (`src/db/schema/auth.ts`) | ok |
| attribute links for sales/receivings | `attributeLinks` has `saleId`,`receivingId`,`itemId`,`definitionId` (`src/db/schema/attributes.ts:21-27`) | ok |
| `people`/`customers`/`suppliers`/`employees` | present | ok |
| prefix support | tables are created unprefixed (`seed.ts`, drizzle migrations) | upstream prefix config unsupported |

All time columns are Unix integers in SQLite and `int` in the MySQL parallel schema
(`src/db/schema/mysql/index.ts` header comment), whereas upstream stores `DATETIME`/`TIMESTAMP`
and compares/format strings. Every date predicate and every date display therefore has to be
re-expressed, not copied.

### 7.9 Runtime/driver constraints

* `getDbSync()` throws when `DB_DRIVER=mysql` (`src/lib/db/index.ts:32-36`); `runReport` uses it
  unconditionally (`registry.ts:26`), so the reports pages 500 on MySQL.
* `date(s.sale_time,'unixepoch')` and `||` string concatenation (`registry.ts:42,177,197,217`) are
  SQLite syntax; the MySQL schema is a separate `mysqlTable` module.
* Config values available for formatting: `src/db/seed.ts` seeds `tax_included` (26),
  `currency_symbol` (28), `number_locale` (29), `currency_decimals` (31), `quantity_decimals` (33),
  `dateformat` (36), `multi_pack_enabled` (81), `lines_per_page` (78). `getConfig`,
  `getConfigBool`, `getConfigNumber` exist (`src/lib/config/index.ts:19-34`). No currency/quantity
  formatter exists anywhere in `src/lib` (grep for `Intl.NumberFormat`/`toCurrency` finds nothing).

### 7.10 Tests today

* `e2e/reports.spec.ts`: asserts the index lists "Summary Sales (by day)", "Detailed Sales",
  "Inventory Summary" (4-10); asserts `/reports/summary_sales` shows date inputs, Apply and an
  **export link** (12-19); asserts inventory summary renders a filter form or "No data." or a table
  (21-25). These tests encode the current prototype and will need updating for the ported input-page
  flow; the export-link assertion in particular conflicts with upstream (no export on the input
  page).
* Unit tests: none for reports. `src/lib/auth/rbac.test.ts` exercises report grant semantics
  (lines 27-47) but not report SQL.
* Upstream tests to port/adapt: `tests/Controllers/ReportsControllerTest.php` (permission checks,
  including the double-encoded underscore regression), `tests/Models/Reports/Summary_taxes_test.php`
  (columns, grouping, summary-equals-sum-of-rows, subtotal+tax=total),
  `tests/Models/Reports/Inventory_lowTest.php` (query failure → `[]`),
  `tests/Models/Reports/Summary_discounts_test.php` (currency-symbol escaping).

---

## 8. Target gap analysis

Severity: **P0** wrong/missing data; **P1** filter/permission/aggregate drift; **P2** contract or
presentation drift.

### 8.1 Report-key parity matrix

Legend: ✅ present and semantically close; ◐ present but materially different; ✖ missing;
➕ target-only.

| Upstream report | Upstream URL | Target key | Status |
|---|---|---|---|
| Summary Sales | `summary_sales` | `summary_sales` | ◐ |
| Summary Categories | `summary_categories` | `summary_categories` | ◐ |
| Expenses by Category | `summary_expenses_categories` | `summary_expenses_categories` | ◐ |
| Summary Customers | `summary_customers` | `summary_customers` | ◐ |
| Summary Suppliers | `summary_suppliers` | `summary_suppliers` | ◐ (wrong source: receivings) |
| Summary Items | `summary_items` | `summary_items` | ◐ |
| Summary Employees | `summary_employees` | `summary_employees` | ◐ |
| Summary Taxes | `summary_taxes` | `summary_taxes` | ✖ (runtime SQL error) |
| Sales Taxes | `summary_sales_taxes` | `summary_sales_taxes` | ◐ (different table/columns) |
| Summary Discounts | `summary_discounts` | `summary_discounts` | ◐ (blank column, no filter) |
| Summary Payments | `summary_payments` | `summary_payments` | ◐ |
| Low Inventory | `inventory_low` | `inventory_low` | ◐ |
| Inventory Summary | `inventory_summary` | `inventory_summary` | ◐ (3 of 10 columns) |
| Detailed Item Sales | `detailed_item_sales` | — | ✖ |
| Detailed Receivings | `detailed_receivings` | `detailed_receivings` | ◐ |
| Detailed Sales | `detailed_sales` | `detailed_sales` | ◐ |
| Specific Customer | `specific_customers` | `specific_customer` | ◐ (no entity filter, singular key) |
| Specific Employee | `specific_employees` | `specific_employee` | ◐ (no entity filter) |
| Specific Discount | `specific_discounts` | `specific_discount` | ◐ (no discount filter) |
| Specific Supplier | `specific_suppliers` | `specific_supplier` | ◐ (no supplier filter, wrong source) |
| Graphical ×11 | `graphical_summary_*` | `<key>_graphical` | ◐ (different key family, missing 2, extra 2) |
| — | — | `detailed_payments` | ➕ |
| — | — | `summary_expenses` | ➕ |
| — | — | `summary_cashups` | ➕ |
| — | — | `summary_giftcards` | ➕ |

### 8.2 Gap list

**G-01 (P0) — `summary_taxes` cannot execute.** `registry.ts:255-261` selects `st.name AS tax_name`
and `SUM(st.amount)` from `sales_taxes`, but `src/db/schema/sales.ts:46-53` defines only
`saleId, taxType, roundCode, taxGroup, saleTaxBasis, saleTaxAmount`. The page has no error boundary
(`[key]/page.tsx:20`), so the request throws. Correct source is `sales_items_taxes` grouped by
`name, percent` with a sale-status/date join (`Summary_taxes.php:40-100`), or an extended
`sales_taxes` schema.

**G-02 (P0) — `specific_*` reports ignore their entity parameter.** `specific_customer`
(`registry.ts:358-364`), `specific_employee` (376-382), `specific_supplier` (394-400) and
`specific_discount` (412-419) have no `WHERE customer_id/employee_id/supplier_id/discount …`
clause and no such parameter in `ReportDef`. All four return the entire sales (or receivings)
history. Upstream: `Specific_customer.php:96`, `Specific_employee.php:96`,
`Specific_supplier.php:80`, `Specific_discount.php:98-99`.

**G-03 (P0) — Missing `detailed_item_sales`.** No key, no line-level item report, no
sale+discount-type filter. Upstream: `Detailed_item_sales.php` and `Reports.php:1934-1988`;
filter page `Reports.php:730-744`.

**G-04 (P0) — `summary_suppliers` is the wrong report.** Target aggregates `receivings` by
`receivings.supplier_id` (`registry.ts:217-225`); upstream aggregates *sales* by the item's
supplier (`Summary_suppliers.php:32-58`, `Sale.php:1125`). Different population, different totals,
different meaning.

**G-05 (P0) — Summary SQL omits tax, cash adjustment, cost and profit.** Every target summary is
built from a subquery of `quantity_purchased * item_unit_price - discount`
(e.g. `registry.ts:42-51,177-185,197-205,432-441`) and never joins `sales_items_taxes` or
`sales_payments`. Consequences: `tax`, `cost`, `profit`, `total` and the tax-included subtotal are
absent; `cash_adjustment` (rounding) is ignored; `sale_type` (returns vs sales) is not modelled
beyond `sale_status = 0`; location is ignored. Upstream: §4.3.

**G-06 (P0) — `inventory_low`/`inventory_summary` data-set drift.** Target uses `LEFT JOIN
item_quantities` (`registry.ts:145-149,161-165`) so items with no stock row appear with quantity 0;
it does not filter `stock_type = 0`, does not join `stock_locations`, does not filter
`stock_locations.deleted`, and `inventory_low` orders by `quantity - reorder_level` instead of
`items.name` (`Inventory_low.php:33-51`). `inventory_summary` exposes 3 of 10 upstream columns
(`registry.ts:140-144`) and returns no PHP-computed totals (`Inventory_summary.php:85-102`).

**G-07 (P0) — No detail expansion or rewards rows.** `report-view.tsx` has no `detailView`,
no per-sale detail query, no attribute expansion and no `sales_reward_points` (table absent).
Upstream: `tabular_details.php:71-92`, `Detailed_sales.php:172-207`,
`Detailed_receivings.php:119-147`, `expand_attribute_values` (`tabular_helper.php:646-675`).
The reward table does not exist in the target schema at all.

**G-08 (P1) — No input pages and no filter model.** Upstream renders a form-only page for every
report; the target runs the query immediately. Missing controls: date range presets, sale type,
stock location, receiving type, discount type, customer/employee/supplier selects, payment type,
item-count filter. `ReportDef` (`registry.ts:6-15`) and `runReport` (23-29) have no place to put
them. Upstream sources: §3.4, §4.7.

**G-09 (P1) — Date handling.** Target accepts only query-string `start`/`end`, coerces to local
midnight/end-of-day (`registry.ts:17-21`), and applies `sale_time >= start` with Unix ints. Upstream
applies `DATE(sale_time) BETWEEN 'date' AND 'date'` when `date_or_time_format = 0`, and full
datetime comparison when it is 1 (`Summary_report.php:19-23`; `Sale.php:1072-1080`). Invalid or
empty target dates silently mean "all time" (undefined filter), whereas upstream requires the
segments and the picker always supplies them. Timezone/day-boundary results will differ.

**G-10 (P1) — Permission map drift.** See §2 item 8. Concretely:
`registry.ts:230` (`summary_categories` → `reports_items`), `registry.ts:285,302`
(expense reports → `reports_expenses`), `registry.ts:446` (`summary_sales_taxes` → `reports_taxes`).
`src/db/seed.ts:135-148` lacks `reports_expenses_categories` and `reports_sales_taxes`, and seeds
three permissions that do not exist upstream (`reports_expenses`, `reports_cashups`,
`reports_giftcards`). Report permissions are also invisible in the sidebar (only the `reports`
module is a sidebar item, `src/components/shared/sidebar.tsx:35,102`) — acceptable — but the report
index does not filter by grant (`reports/page.tsx:11-16`).

**G-11 (P1) — Base-grant privilege escalation.** `hasModuleGrant` returns true when the sole grant
equals the module id (`src/lib/auth/rbac.ts:60-63`), so `requirePermission("reports", "sales")`
passes with only `reports`. Upstream denies (`Employee.php:451-455`, `has_subpermissions`).
The port must use exact sub-grant checks (plus admin) and must not treat the base grant as a
wildcard.

**G-12 (P1) — No summary rows.** `ReportDef` has no summary concept and no definition returns
`getSummaryData` equivalents. Upstream summary keys per report are in §5 and rendered at
`tabular.php:34-46` / `tabular_details.php:32-36`; `inventory_summary` totals are computed in PHP
(`Inventory_summary.php:85-102`).

**G-13 (P1) — No subtitle.** Upstream prints the formatted date range
(`Reports.php:2217-2228`; views `tabular.php:20`, `tabular_details.php:17`, `graphical.php:18`).
Target has no subtitle anywhere.

**G-14 (P1) — Pagination, sort, search and export drift.** No server pagination (upstream
client-side pageSize = `config.lines_per_page`, `tabular.php:61`); no sort/search/column visibility;
`LIMIT 500` truncates 15 of 23 queries (`registry.ts:74,111,133,149,165,185,205,225,332,346,364,382,400,419,441`)
and silently drops the rest of a large period — and the export route (`export/route.ts:19`) inherits
the truncation. Upstream exports the entire loaded result set in 7 formats
(`tabular.php:63-65`).

**G-15 (P1) — Chart semantics.** `ChartFor` picks the wrong metric and ignores per-report chart
specs (`report-view.tsx:35-42`); e.g. `summary_sales` plots `count` instead of `total`, and
`summary_taxes` would plot the first non-label column (`count`) rather than `total`. Chart types:
`GRAPHICAL_TWINS` (`registry.ts:465-477`) marks employees and suppliers `hbar` but upstream renders
pies (`Reports.php:978,1022`); it omits `summary_items` and `summary_sales_taxes` twins
(`Reports.php:862,1085`) and adds `summary_expenses`, `summary_expenses_categories` (correct one
exists upstream but as a distinct method), `summary_cashups` (no upstream). No `meta`, percentage,
axis titles, currency prefix/suffix or tooltips (`§4.9`).

**G-16 (P1) — Column/key mismatches produce blank cells.**
`detailed_sales` declares `quantity`/`unit_price` but selects `quantity_purchased`/`item_unit_price`
(`registry.ts:62-63` vs 67); `detailed_receivings` declares `quantity` but selects
`quantity_purchased` (121-123 vs 126); `summary_discounts` declares `discount_percent` but selects
`discount` (269 vs 273); `specific_discount` declares `discount_percent` but selects `discount`
(409 vs 412). The table renders `r[c.name]` (98), so those headers are permanently empty.

**G-17 (P1) — Missing columns across most reports.** Comparing each upstream column list in §5
with `registry.ts`: `summary_sales` lacks quantity/subtotal/tax/cost/profit; `summary_categories`
lacks quantity/tax/cost/profit; customers/employees lack quantity/tax/cost/profit; items lacks
cost/unit price/cost/profit; payments lacks the two transaction groups, refunded and due;
`inventory_summary` lacks 7 columns; `detailed_*` lack nearly all summary columns; `specific_*`
lack sale type code, employee/customer, tax, cost, profit, comment.

**G-18 (P1) — `summary_discounts` has no discount-type filter, no `discount > 0` filter, and
`summary_discounts`/`specific_discount` totals use `discount` directly.** Target groups by
`discount, discount_type` but sums `quantity*price*discount/100` or `discount` without the
upstream `discount > 0` predicate (`Summary_discounts.php:39`) and without the upstream
`FIXED`/`PERCENT` input switch (`Reports.php:584,1183-1187`).

**G-19 (P1) — `summary_payments` collapses the report.** Target groups by
`sales_payments.payment_type` only (`registry.ts:86-92`), losing the transaction-group section,
the `<HR>` separator, gift-card consolidation, no-payment rows, refunds and the due calculation
(`Summary_payments.php:29-129`). `SUM(payment_amount)` also includes cash-adjustment rows
(upstream excludes them from `total_payments`).

**G-20 (P1) — Location scoping absent.** No report accepts or applies `location_id`; upstream
applies `sales_items.item_location` / `stock_locations.location_id` and restricts the dropdown by
the user's stock grants (§6.3). Multi-location deployments will see cross-location totals.

**G-21 (P2) — Formatting absent.** No `to_currency`/`to_currency_tax`/`to_quantity_decimals`/
`to_date`/`to_datetime` equivalent; `fmt` (`report-view.tsx:22-33`) prints epoch integers and
`toFixed(2)` decimals, never locale/currency. CSV export uses raw values.
`sale_date` strings from `date(sale_time,'unixepoch')` are fine, but `sale_time` columns are not.

**G-22 (P2) — Titles/labels hard-coded in English.** Upstream drives every label from
`Reports.php` (151 keys, appendix A) and the title from per-report `Reports.*` keys; the target
hard-codes titles (`registry.ts` each entry) and column labels. No i18n integration exists in the
app (`next-intl` is a dependency but unused in reports; no `messages/` directory).

**G-23 (P2) — Report index is a flat list.** Upstream renders Graphical/Summary/Detailed/Inventory
panels, filters graphical/summary by granted permission and excludes inventory/receiving from those
two panels (`listing.php:8-15,37-106`); the target lists all 34 keys (23 + 11 twins) for anyone with
`reports` (`reports/page.tsx:11-16`).

**G-24 (P2) — Row APIs are dead code with the wrong contract.** No caller; URL treats the path
segment as the id (`detailed-sales-row/route.ts:9-11`) while the page/table would naturally pass a
query parameter; payload is raw rows rather than the formatted, keyed summary row
(`Reports.php:1690-1715`); permission is session-only (no `reports_sales`/`reports_receivings`
check). If wired as-is, `table_support`-style consumers would break.

**G-25 (P2) — Export route behaviour undefined vs upstream.** Upstream has no server export; target
adds CSV only, with no permission-specific errors (404 for unknown, 401/redirect for auth), no
`Content-Length`, no escaping of the filename, no date requirement, and capped rows. It also runs
for reports whose UI hides the export link (`report-view.tsx:73` is inside `hasDateRange` only).

**G-26 (P2) — `hasDateRange` is overloaded.** It means "show date filter" but is also used to
decide whether the export link appears (`report-view.tsx:59,73`). Upstream inventory reports have no
date filter and no export, but detailed/specific reports do; the target's flags are broadly right
only by accident (e.g. `specific_discount` hasDateRange true, `inventory_low` false).

**G-27 (P2) — No cache headers / request-scoped behaviour.** Upstream sets no-store on every
report action (`Reports.php:2233-2240`). Next may cache RSC output depending on deployment; the
port should mark report pages dynamic (`export const dynamic = "force-dynamic"`) and the API routes
`cache: "no-store"`.

**G-28 (P2) — SQLite-only SQL / MySQL unsupported.** `date(...,'unixepoch')`, `||`, and
`getDbSync()` (§7.9). Upstream itself is MySQL-only, but the target advertises a MySQL driver
(`src/lib/db/index.ts:7-9,28-36`), so the reports layer must either compile per driver or
explicitly document reports as SQLite-only.

**G-29 (P2) — Table prefix unsupported.** Upstream builds every identifier with
`db->prefixTable()` and one literal-prefix bug in `Summary_payments.php:66-69`. Target has no
prefix concept; acceptable if declared out of scope.

**G-30 (P2) — Test drift.** `e2e/reports.spec.ts` encodes the prototype (flat index, export link on
the report page, no input flow) and will fail or mask regressions after the port; no unit tests
cover report SQL, summary math, filters or permissions.

### 8.3 Correctness traps to preserve deliberately

These are upstream behaviours that a "clean" rewrite would silently change; each needs an explicit
decision recorded in code comments/tests:

1. `Summary_report` vs `Sale::create_temp_table` tax-included subtotal formulas differ (§4.2).
2. `Summary_taxes` summary shows `count` formatted as currency (`Reports.php:39-43` of the view,
   because only `total_quantity` is special-cased).
3. `Summary_discounts`/`Summary_payments` summaries are sales totals, not report-specific totals.
4. `Summary_sales_taxes` has no `sale_status` filter despite its dead `_where`.
5. `summary_suppliers` uses sales attributed by item supplier, not receivings.
6. `specific_discounts` uses `>=` on line discount but sums all lines of matching sales.
7. `specific_suppliers` groups by `(item_id, sale_id)` and therefore repeats `id`.
8. `detailed_receivings` requisitions use `HAVING items_purchased = 0` in the list and
   `WHERE quantity_purchased = 0` in the totals.
9. Canceled sales are included only under the `canceled` filter, but they appear in
   `detailed_*` with `type_code = CNL` and a restore button.
10. Negative (return) lines reduce all sums; there is no absolute-value handling anywhere.

---

## 9. Implementation obligations

Ordered so that each step is independently testable and later steps depend only on earlier ones.
All paths are target paths unless marked upstream. No implementation is performed here.

### O-1. Permission map and seed corrections (unblocks every route)

Files: `src/lib/reports/permissions.ts` (new), `src/db/seed.ts`, `src/db/migrations` (data
migration for existing DBs), `src/lib/auth/rbac.ts`.

* Copy `Reports.php:85-106` verbatim into a `REPORT_PERMISSIONS: Record<string,string>` including
  the aliases `specific_customers/employees/discounts/suppliers`, `detailed_item_sales`,
  `graphical_*` normalisation, and `_graph`/`_row` stripping.
* Seed exactly the 13 upstream permissions; remove `reports_expenses`, `reports_cashups`,
  `reports_giftcards` or map them explicitly as target-only (decision required, §12).
* Add `requireReportPermission(key)` that (a) requires session, (b) allows admins, (c) requires the
  base `reports` module grant **as upstream defines it** (deny a lone `reports` grant), and
  (d) requires the exact sub-permission. Do not use `hasModuleGrant` as a wildcard.
* Data contract: `getReportPermission(key: string): string | null`; unknown key → no sub-check
  (matching upstream input pages), but the page must only expose known keys.

### O-2. Filter model and validation

Files: `src/lib/reports/filters.ts` (new).

* `ReportFilters` discriminated union:
  `{start,end,sale_type,location_id}` (summary/detailed sales),
  `{start,end,receiving_type,location_id}` (receivings),
  `{start,end,sale_type,location_id,discount_type}` (item sales/summary discounts),
  `{start,end,customer_id,sale_type,payment_type}` (specific customer),
  `{start,end,employee_id,sale_type}` (specific employee),
  `{start,end,discount,sale_type,discount_type}` (specific discount),
  `{start,end,supplier_id,sale_type}` (specific supplier),
  `{location_id,item_count}` (inventory summary), `{}` (inventory low).
* Defaults exactly as the upstream views: sale type `complete` except item-sales (`sales`);
  location `all`; receiving type `all`; discount type `config.default_sales_discount_type` for the
  summary input and `all` for item sales; payment type `all`.
* Server validation: date strings must parse (`zod` string/date refinement); invalid dates are a
  400/validation message rather than an unbounded query (target improvement over silent `undefined`);
  sale type must be a key of the option map, else fall back to the default (mirroring
  `Reports.php:1938-1940`); location must be numeric or `all`; discount type `all|0|1`;
  entity ids must be integers that exist (404/validation error otherwise).
* Data contract: `parseFilters(key, searchParams): {ok: true, filters} | {ok: false, errors}`.

### O-3. Column schema with formatting types

Files: `src/lib/reports/columns.ts` (new).

* `ReportColumn = { name, labelKey|label, type: "text"|"date"|"datetime"|"money"|"tax"|"quantity"|"percent"|"discount", align, sorter?, sortable?, hiddenByDefault? }`.
* Reproduce each upstream column list exactly (see §5 tables): order, keys, and the `sortable:false`
  markers (`sale_date`, `sale_time`, `receiving_time`, `payment_type`, `tax_name`,
  `report_count` is sortable, etc.).
* Column keys must equal SQL aliases — add a unit test that asserts every `ReportColumn.name`
  exists in the corresponding query's result row for a fixture row (this catches G-16 forever).

### O-4. Formatting layer

Files: `src/lib/reports/format.ts` (new).

* Implement `toCurrency`, `toCurrencyTax`, `toQuantityDecimals`, `toDate`, `toDateTime` using
  `Intl.NumberFormat(config.number_locale, {style:'currency', currency: …})` plus explicit
  fraction digits from `currency_decimals`/`tax_decimals`/`quantity_decimals`, and
  `dateformat`/`timeformat` mapping (PHP `m/d/Y`, `d/m/Y`, `Y-m-d`, `H:i:s`, etc.).
  Alternative if exact PHP-format parity is required: a small PHP-dateformat formatter.
* `toCurrencyTax` switches decimals on `tax_included` (`locale_helper.php:388-396`).
* Discount rendering: `<value>%` for `discount_type = 0`, `toCurrency` for `1` (used in detailed/
  specific rows and in `Summary_discounts` where the DB already returns a display string).
* Right/left currency symbol for chart axes from `is_right_side_currency_symbol` semantics
  (`locale_helper.php:299-309`).

### O-5. SQL fragments and driver abstraction

Files: `src/lib/reports/sql/common.ts`, `src/lib/reports/sql/date.ts` (new).

* Implement `[SALE_PRICE]`, `[COST]`, `[TAX]`, `[CASH]`, `[SUBTOTAL]`, `[TOTAL]`, `[PROFIT]` as
  composable drizzle `SQL` fragments exactly as §4.3 (both `tax_included` branches, `D` from
  config).
* Implement `saleTypePredicate(saleType)` with the six branches of `Summary_report.php:127-151`
  (identical for temp-table variants and for `Detailed_item_sales.applyFilters`).
* Implement `datePredicate(column, start, end)`:
  SQLite: `date(column,'unixepoch') BETWEEN date(?,'unixepoch') AND …` (or `column BETWEEN
  strftime('%s',?) AND strftime('%s',?)` for datetime mode);
  MySQL: `DATE(FROM_UNIXTIME(column)) BETWEEN ? AND ?` / `column BETWEEN ? AND ?`.
  The target stores Unix ints in both dialects, so upstream's `DATE(sale_time)` must become the
  conversion above; document that day grouping is in server time unless a timezone is configured.
* Implement `groupConcat(expr, sep)` per driver.
* Replace upstream temp tables with CTEs (`WITH taxes AS (… GROUP BY sale_id,item_id,line),
  payments AS (…)`); keep the `SUM(ROUND(item_tax_amount, D))` and `tax_type` split where the column
  exists; where `tax_type` is missing (target), either add the column (migration obligation O-5a)
  or define the fallback (`internal_tax = 0`, all tax treated as sales tax) and record the
  divergence in tests.
* O-5a (schema decision): add `tax_type` to `sales_items_taxes`, `reference_code` to
  `sales_payments`, `tax_amount` to `expenses`, `sales_reward_points`, and either extend
  `sales_taxes` with `name/tax_rate/tax_category_id/jurisdiction_id` or make `summary_sales_taxes`
  read `sales_items_taxes` joined to item tax categories (decision required, §12).

### O-6. Report engine

Files: `src/lib/reports/engine.ts` (new), replacing `runReport` in `registry.ts`.

* `runReport(key, filters, {page, pageSize}): ReportResult`.
* Executes, in order: (1) data query with `LIMIT/OFFSET` when paginated, (2) a `COUNT(*)` companion
  for `totalRows`, (3) the summary query (per-report SQL or PHP aggregation), (4) formatting via
  O-4, (5) optional chart data from the **declared** value column (never "first other column").
* Return contract:

```ts
interface ReportResult {
  key: string;
  title: string;              // i18n key resolved by the page if translations exist
  subtitle: string;           // formatted date range, "" for inventory
  columns: ReportColumn[];
  rows: Record<string, string | number>[];      // formatted cells, keys = column names
  summary: { key: string; label: string; value: string | number; raw: number }[];
  chart?: { type: "bar"|"hbar"|"line"|"pie";
            labels: string[];
            series: { meta?: string; value: number }[];
            xAxisTitle?: string; yAxisTitle?: string; showCurrency: boolean };
  page: number; pageSize: number; totalRows: number;
  filters: ReportFilters;
}
```

* Error behaviour: unknown key → 404; invalid filter → 400; DB error → an empty result plus a
  logged error for `inventory_low`-style queries (upstream regression expectation) and a surfaced
  error for the rest.

### O-7. Definitions for the eleven summary reports

Files: `src/lib/reports/definitions/summary_{sales,categories,expenses_categories,customers,
suppliers,items,employees,taxes,sales_taxes,discounts,payments}.ts` (new).

* Each definition supplies: `permission` (O-1), title lang key, accepted filters (O-2), data SQL
  (exact §5 SQL), summary SQL/PHP, columns (O-3), chart spec (§4.9), and edge-case notes.
* `summary_expenses_categories` and `summary_payments` override summary behaviour exactly as in
  §5.3/§5.11 (they do **not** use the shared summary query).
* `summary_taxes` summary is PHP-summed over rows; `summary_sales_taxes` summary is the shared
  sale-line summary (deliberate upstream quirk, §8.3 item 4).
* Graph spec per report must match the table in §4.9, including meta strings and percentage bases.

### O-8. Definitions for inventory, detailed and specific reports

Files: `src/lib/reports/definitions/{inventory_low,inventory_summary,detailed_item_sales,
detailed_sales,detailed_receivings,specific_customers,specific_employees,specific_discounts,
specific_suppliers}.ts` (new).

* Port each SQL verbatim (§5.12-5.20), including `GROUP BY item_id, sale_id` for
  `specific_suppliers`, `HAVING items_purchased = 0` for requisitions, `discount >= ?` for
  specific discounts, and `payment_type LIKE` for specific customers.
* Detail spec: `detailColumns` (positional names), `loadDetails(parentIds)` batch query
  (avoid N+1): sales details grouped by `(sale_id,item_id)`; receivings details grouped by
  `(receiving_id,item_id)`; rewards loaded in one `WHERE sale_id IN (…)` (only if the schema is
  added); attribute columns from `attribute_definitions WHERE definition_flags & 2/4 AND deleted=0
  AND definition_type <> 'GROUP'` (mirrors `Attribute::getDefinitionsByFlags`, `Attribute.php:270-292`).
* Quantity decoration helpers: `"<qty> x <receiving_quantity>"` and ` [location name]` when the
  deployment has more than one location (upstream `multipleLocations` = count of undeleted
  locations > 1, `Stock_location.php:95-98`).
* `edit` action contract: sales → `/sales/edit/<id>` with delete/restore depending on
  `sale_status`, receivings → `/receivings/edit/<id>`; whether the target supports those dialogs is
  an open decision (§12).

### O-9. Input pages

Files: `src/app/(secure)/reports/[key]/page.tsx` (rework),
`src/components/reports/report-input-form.tsx` (new),
`src/components/reports/entity-select.tsx` (new).

* Canonical routing: `/reports/[key]` renders the **input page** when the key has an input page
  (all upstream keys) and no complete filter set is present; `/reports/[key]/results?…` renders the
  table/chart. Keep `/reports/[key]` for the results view when the key is inventory_low (runs
  directly) so the current e2e URL still works for that one report. Alternatively use
  `/reports/[key]?start=…&end=…` to render results and no params for the form; choose one and
  update `e2e/reports.spec.ts` (O-12).
* Controls per report exactly as §3.4, using native `<input type="date">` (and `datetime-local` when
  `date_or_time_format` is on) plus selects; no date presets are required for parity, but if added
  they must produce the same inclusive ranges (`daterangepicker.php:13-69`).
* Entity pickers: customer (people+customers, `deleted=0`, label `first last [ company ]`),
  employee (`first last`, `deleted=0`), supplier (`company (first last)`, `deleted=0`,
  `category = GOODS_SUPPLIER`), discount (0..100 step 10, or numeric fixed input with
  `config.default_sales_discount`), payment type (the 9-entry map), sale type (the 6-entry map with
  `invoice_enable`/`work_order_enable` gates), receiving type (4 entries), item count (3 entries),
  stock location (granted locations + `All`, reversed).
* New endpoints (O-10) or server-side queries for the pickers; do not reuse the register-flow
  suggest APIs, which are text-search only and return different shapes
  (`src/app/api/customers/suggest/route.ts:10`).

### O-10. Report APIs

Files: `src/app/api/reports/[key]/route.ts` (new),
`src/app/api/reports/[key]/[id]/detailed-sales-row/route.ts` and
`…detailed-receivings-row/route.ts` (reuse/replace the current files),
`src/app/api/reports/entity-options/route.ts` (new),
`src/app/api/reports/payment-type/route.ts`, `src/app/api/reports/sale-type-options/route.ts`
(rework to the report option maps).

* Data endpoint returns the `ReportResult` JSON shape (O-6) and enforces O-1 permissions.
* Detail endpoint: `GET /api/reports/<key>/<saleId>/detailed-sales-row` (and the receivings
  analogue), permission = the parent report's permission, response `{[id]: formattedSummaryRow}`
  matching the table's column keys plus `edit`; 404 for missing, 400 for non-numeric ids.
* `entity-options?type=customer|employee|supplier|discount|payment_type|sale_type|receiving_type|
  location|item_count&term=` returns `{value,label}[]` with the exact labels; `sale-type-options`
  must return the report option map, not the sale-type enum.

### O-11. Components

Files: `src/components/reports/report-view.tsx` (rewrite),
`src/components/reports/report-table.tsx` (new),
`src/components/reports/report-summary.tsx` (new),
`src/components/reports/report-chart.tsx` (new, wrapping `charts.tsx`),
`src/components/reports/detail-panel.tsx` (new).

* Table: server pagination with `lines_per_page` default, sortable headers for the columns upstream
  marks sortable, text search over loaded page or server-side (choose; upstream is client-side over
  all rows, so server-side search is an improvement to declare), column visibility with the
  cost/profit default-hidden behaviour (`visibility_js.php:29-45`), CSV/XLSX/JSON export.
* Summary block: exact label mapping via `Reports.*` (appendix A) and the `total_quantity` raw
  exception; hidden cost/profit rows with the toggle when the report has both.
* Chart: type/labels/series from the definition, currency prefix/suffix on axes and tooltips,
  percentage meta.
* Detail panel: expandable rows fetching O-10's row endpoint or receiving `loadDetails` output, with
  attribute columns and rewards table when enabled.

### O-12. Index page and tests

Files: `src/app/(secure)/reports/page.tsx`, `e2e/reports.spec.ts`,
`src/lib/reports/*.test.ts` (new), possibly `e2e/reports-*.spec.ts`.

* Index: four panels, grant-filtered, with the graphical/summary exclusion of inventory and
  receiving and the item-sales pseudo-link, per §4.8.
* Update e2e expectations: `/reports/summary_sales` is now an input page (heading, date fields,
  sale type, location, submit); export link moves to the results page; add permission-negative
  tests.
* Unit tests per §11.

### O-13. No-cache and dynamic rendering

Files: report pages and route handlers.

* `export const dynamic = "force-dynamic"` on report pages; `Cache-Control: no-store` on API and
  export responses, mirroring `Reports::clearCache()` (`Reports.php:2233-2240`).

### O-14. MySQL readiness (decision-dependent)

Files: `src/lib/reports/sql/*`, `src/lib/db/index.ts`.

* Either make `runReport` async and use `getDb()` with per-driver SQL, or explicitly gate the
  reports module to SQLite and return a clear error under `DB_DRIVER=mysql`. Upstream is MySQL-only,
  so SQLite-only would invert the upstream deployment target; a per-driver compiler is the safer
  parity choice.

---

## 10. Reusable report engine design (preserving exact SQL semantics)

The engine must be a thin execution/formatting shell; all semantics live in per-report definitions
copied from §5. Nothing in the engine may infer columns, metrics or filters.

### 10.1 Types

```ts
type FilterKind =
  | "sales" | "receivings" | "item_sales" | "inventory"
  | "specific_customer" | "specific_employee" | "specific_discount" | "specific_supplier";

interface ReportDefinition {
  key: string;                       // upstream URL key, e.g. "summary_sales"
  titleKey: string;                  // Reports.<key> or explicit lang key
  permission: string;                // O-1 map value
  filterKind: FilterKind;
  inputPage: boolean;                // upstream has a form-only landing page
  executeOnLoad: boolean;            // inventory_low only
  columns: ReportColumn[];           // exact order/keys/types (§5)
  data: (f: Filters, page?: Page) => SQL;         // exact data query
  count?: (f: Filters) => SQL;                    // COUNT(*) for pagination
  summary?: (f: Filters) => SQL | ((rows) => SummaryRow[]);
  detail?: DetailSpec;               // detailed/specific only
  chart?: ChartSpec;                 // graphical twins only
  export?: { formats: ("csv"|"xlsx"|"json")[] };
  quirks?: string[];                 // §8.3 items encoded as comments/tests
}
```

### 10.2 Execution pipeline

1. **Resolve** key → definition; unknown → 404.
2. **Authorise** (O-1): base `reports` per upstream semantics, then exact sub-permission.
   For input pages, upstream only checks the base grant; keep that for parity, but never expose
   data on the input page.
3. **Parse/validate filters** (O-2) with the definition's `filterKind`; reject invalid.
4. **Build** the data SQL with the §4.3 fragments. Every per-report SQL is a literal template from
   §5; filters are appended as bound parameters, never interpolated. The one deliberate dynamic
   identifier is none — all table/column names are constants. (Upstream's `Summary_discounts`
   currency-symbol interpolation becomes a bound parameter or a post-formatting step; the
   regression test `Summary_discounts_test.php` must be re-expressed as "no raw symbol in SQL".)
5. **Run** data (+ count when paginated) and summary. For reports whose upstream summary is
   PHP-computed (`summary_taxes`, `inventory_summary`), reuse the same rows (no second query).
6. **Format** every cell via O-4 by column `type`; build `summary` entries with `Reports.*` labels
   and the `total_quantity` raw exception.
7. **Chart** data from the definition's declared columns only (label column, value column,
   meta template, percentage denominator).
8. **Return** `ReportResult`; the RSC page renders it, and the API/export routes serialise the same
   object so tables, charts, exports and tests cannot drift.

### 10.3 Preserving exact SQL

* Keep the upstream select-list order and aliases; the column schema (O-3) keys off them.
* Keep `IFNULL`, `ROUND(..., D)`, `MAX(...)` and `GROUP BY` exactly; do not "simplify"
  `MAX(name)` to a bare column (upstream relies on `ONLY_FULL_GROUP_BY`-permissive MySQL, and the
  MAX gives deterministic output).
* Keep both `tax_included` branches and both temp-table formula variants (§4.2).
* Keep the `sale_type` six-branch predicate in one helper used by all sale reports, including
  item-sales' `applyFilters` (`Detailed_item_sales.php:88-136`).
* Keep the `date_or_time_format` two-mode predicate, mapped to Unix columns per driver (O-5).
* Port `GROUP_CONCAT` semantics for payment strings and attributes via driver helpers.
* Where a schema column is absent (G-01/G-05/G-07), record the decision in `quirks` and cover it
  with a test asserting the documented approximation — do not silently invent data.

### 10.4 Definition catalogue (one file per report)

| Definition file | Keys | Shared helpers |
|---|---|---|
| `definitions/summary_sales.ts` | `summary_sales`, `summary_sales_graphical` | common select, sale type, date, loc |
| `definitions/summary_categories.ts` | `summary_categories`, twin | + items join |
| `definitions/summary_expenses_categories.ts` | keys + twin | expenses date, deleted |
| `definitions/summary_customers.ts` | keys + twin | + people join |
| `definitions/summary_suppliers.ts` | keys + twin | + items/suppliers/people joins |
| `definitions/summary_items.ts` | keys + twin | + items join |
| `definitions/summary_employees.ts` | keys + twin | + people join |
| `definitions/summary_taxes.ts` | keys + twin | subquery + PHP summary |
| `definitions/summary_sales_taxes.ts` | keys + twin | sales_taxes joins |
| `definitions/summary_discounts.ts` | keys + twin | discount-type switch, symbol escaping |
| `definitions/summary_payments.ts` | keys + twin | temp-table replacement, gift cards |
| `definitions/inventory_low.ts` | `inventory_low` | item name expression |
| `definitions/inventory_summary.ts` | key | item name, qty_per_pack |
| `definitions/detailed_item_sales.ts` | key | temp-table replacement, discount filter |
| `definitions/detailed_sales.ts` | key | per-sale aggregate + detail + attributes + rewards |
| `definitions/detailed_receivings.ts` | key | per-receiving aggregate + detail + attributes |
| `definitions/specific_customers.ts` | key | entity filter + payment LIKE |
| `definitions/specific_employees.ts` | key | entity filter |
| `definitions/specific_discounts.ts` | key | `>=` discount + type |
| `definitions/specific_suppliers.ts` | key | supplier filter, `GROUP BY item_id,sale_id` |

---

## 11. Acceptance tests

### 11.1 Controller/permission tests (port of `tests/Controllers/ReportsControllerTest.php`)

| Test | Setup | Assertion | Upstream reference |
|---|---|---|---|
| denies report without sub-grant | user with only `reports_sales`, GET `/reports/summary_customers` | redirect/403 to `no_access/reports/reports_customers` | `ReportsControllerTest.php:105-118` |
| encoded key cannot bypass | same user, GET `/reports/summary%5Fcustomers` (and `%255F`) | same denial | `:127-140` |
| different prefix also denied | user with only `reports_customers`, GET `/reports/detailed_sales` | denial | `:148-161` |
| exact grant allows | grants `reports` + `reports_customers` | 200 | `:169-184` |
| index requires base `reports` | grants `reports` + sub | 200 | `:192-207` |
| lone base grant is not a wildcard | grant only `reports` | all sub-report data routes denied | `Employee.php:444-467` (upstream semantics) |
| detail-row endpoint enforces parent permission | no `reports_sales` | 403 | new (upstream has the gap; decide whether to fix or preserve, §12) |
| export enforces same permission | no sub-grant | 403 | new |

### 11.2 Model/semantic tests (port of `tests/Models/Reports/*`)

Fixtures: seed two items, three completed sales, four sale lines, four tax rows as in
`Summary_taxes_test.php:40-89`; plus one return sale, one canceled sale, one suspended quote, one
sale with no payment, one sale with a cash adjustment, and one expense.

| Test | Assertion |
|---|---|
| `summary_taxes` columns | exactly 6 columns, keys `tax_name,tax_percent,report_count,subtotal,tax,total` in order (`Summary_taxes_test.php:245-259`) |
| `summary_taxes` rows | unique `(name,percent)`; each `subtotal + tax = total` within 0.01; status/date filters applied; location/sale-type ignored |
| `summary_taxes` summary | equals sum of row values rounded to `currency_decimals` (`:169-219`) |
| summary totals vs detail | for each summary report, `getSummaryData` equals the sum of its data rows for the same filters (the shared `[COMMON]` summary is a grand total, so for grouped reports assert the grand total, not the per-row grouping) |
| returns | totals decrease by the return amounts for `complete`; `sales` excludes returns; `returns` includes only returns |
| suspended/canceled | excluded by default; `quotes`/`work_orders`/`canceled` select only the matching status |
| tax included | both `tax_included` values produce the two §4.2 formula pairs; subtotal/tax/total identities hold |
| discount symbol | a hostile `currency_symbol` never appears unescaped in SQL and never executes (`Summary_discounts_test.php:10-50`) |
| inventory low failure | a failing query returns `[]` (`Inventory_low_test.php:28-33`) |
| inventory summary totals | `total_inventory_value`, `total_quantity`, `total_low_sell_quantity`, `total_retail` match PHP sums over the filtered rows |
| specific filters | customer/employee/supplier/discount reports return only rows for the supplied entity; `>=` semantics for discount; payment-type `LIKE` semantics for customer |
| detailed receivings requisitions | list uses `HAVING items_purchased = 0`, totals use `quantity_purchased = 0` (documented divergence) |
| pagination | `totalRows` equals unpaged count; page 2 offset matches; export ignores pagination |
| column/schema invariant | every declared column name exists in the result row for a non-empty fixture (catches G-16) |
| chart spec | `summary_sales` series values equal row `total`; `summary_categories` meta percentage uses row `total / summary.total`; `summary_payments` includes only the payments group |

### 11.3 E2E tests (replace `e2e/reports.spec.ts`)

| Test | Steps | Assertion |
|---|---|---|
| index panels | open `/reports` as admin | Graphical/Summary/Detailed/Inventory headings; links filtered by grants for a sub-permission user |
| input page | open `/reports/summary_sales` | date inputs, sale-type select (6 options; quotes/work orders gated by config), location select, submit; no table |
| summary run | submit a range | subtitle shows `start - end`; table columns match §5.1; summary block shows subtotal/tax/total/cost/profit |
| graphical run | `/reports/summary_sales` graphical variant | line chart with revenue values and currency axis |
| inventory | `/reports/inventory_low` | runs directly, no date form |
| inventory summary input | `/reports/inventory_summary` | location + item-count selects; result table 10 columns and four totals |
| detailed expansion | `/reports/detailed_sales` run | expand a sale row; detail columns 11 + attributes; rewards when enabled; edit link |
| specific customer | pick a customer | only that customer's sales; payment-type filter changes rows |
| export | result page | CSV has header labels, all filtered rows (no 500 cap), formatted values |
| permission | user without `reports_discounts` | `/reports/summary_discounts` denied; index does not list it |

### 11.4 Visual/renderer tests

* Snapshot or DOM assertions for bar/hbar/line/pie: labels truncated as upstream (8 chars on bar/
  line, 16 on hbar), value labels, currency prefix/suffix, no slice colour assertion (upstream is
  random, `pie.php:73-82`).
* Cost/profit visibility persisted across navigation (localStorage key `columnVisibility`,
  `visibility_js.php:29-51`).

---

## 12. Unknowns

1. **CI4 `(:any)` greedy behaviour** — the parameter mapping in §3.2 is derived from the route
   strings and the view JS, not from a running instance. It explains every URL the views generate,
   but should be confirmed against a live 3.4.3 install before locking the Next route shape.
2. **Two-value summary URLs** — whether CI4 passes fewer arguments (and thus a PHP
   `ArgumentCountError`) or an empty string for a missing required parameter was not executed.
   The UI never produces such URLs.
3. **`Summary_payments` prefix bug** — `ospos_sales` is hard-coded (`Summary_payments.php:66`).
   Whether a prefixed deployment is broken in 3.4.3 was not tested.
4. **Stale temp tables** — `CREATE TEMPORARY TABLE IF NOT EXISTS` with a different date range in the
   same connection is theoretically stale; whether any request path does this was not observed.
5. **`Summary_sales_taxes` status filtering** — the dead `_where` suggests intended `COMPLETED`
   filtering; whether the shipped report actually intends to include canceled sales' taxes is
   undocumented. Decision needed for parity.
6. **Tax-included subtotal divergence** (§4.2) — which formula is considered correct is unknown;
   both are shipped.
7. **`Summary_discounts` percent formula** — whether `SUM(item_unit_price) * discount / 100` is a
   bug or intentional is unknown; no issue reference found.
8. **`specific_discounts` title `%`** — whether fixed discounts should omit the percent sign is
   unknown; the code always appends it (`Reports.php:1653`).
9. **Target schema evolution** — whether adding `sales_items_taxes.tax_type`, `sales_taxes`
   reporting columns, `expenses.tax_amount`, and `sales_reward_points` is acceptable for the port,
   or whether the report must approximate with existing columns, is a product decision. This
   determines G-01/G-05/G-07 and O-5a.
10. **Target-only permissions** (`reports_expenses`, `reports_cashups`, `reports_giftcards`) —
    whether they are deliberate extensions or seed drift is unknown; they have no upstream report
    method.
11. **Target-only reports** (`detailed_payments`, `summary_expenses`, `summary_cashups`,
    `summary_giftcards`) — whether these should be kept as extensions, re-mapped to upstream keys,
    or removed.
12. **MySQL support for reports** — whether the target must serve `DB_DRIVER=mysql` with the same
    report SQL is unstated; `getDbSync()` currently makes it impossible.
13. **Table prefix** — whether the target will ever support `ospos_` prefixes is unstated; all
    report SQL and the schema assume none.
14. **Edit dialogs** — upstream detail rows open `/sales/edit/<id>` and `/receivings/edit/<id>`
    modal dialogs. Whether the target implements those dialogs (and therefore whether the `edit`
    column/`data-btn-delete|restore` contract is meaningful) was not verified beyond the existence
    of the routes.
15. **Rewards feature** — `config.customer_reward_enable` exists in the target seed? Not confirmed
    (grep found no such key in `src/db/seed.ts`), and the `sales_reward_points` table is absent.
    Whether rewards detail rows are in scope is unknown.
16. **i18n** — `next-intl` is installed but no message catalogs exist; whether report labels must be
    translatable in this port is unstated.
17. **Timezone** — upstream `DATE(sale_time)` uses the DB server timezone; the target stores Unix
    seconds. No application timezone config was found, so day grouping will follow the runtime
    timezone unless one is introduced.

---

## 13. Appendices

### A. `Reports.*` language keys (all 151, `app/Language/en/Reports.php`)

`all, authority, canceled, categories, categories_summary_report, category, code_canceled,
code_invoice, code_pos, code_quote, code_return, code_type, code_work_order, comments, commission,
complete, completed_sales, confirm_delete, confirm_restore, cost, cost_price, count, customer,
customers, customers_summary_report, date, date_range, description, detailed_item_sales_report,
detailed_receivings_report, detailed_receivings_report_input, detailed_reports,
detailed_requisition_report, detailed_sales_report, discount, discount_fixed, discount_percent,
discount_type, discounts, discounts_summary_report, earned, employee, employees,
employees_summary_report, expenses, expenses_amount, expenses_categories,
expenses_categories_summary_report, expenses_category, expenses_payment_amount,
expenses_tax_amount, expenses_total_amount, expenses_total_tax_amount, graphical_reports,
inventory, inventory_low, inventory_low_report, inventory_reports, inventory_summary,
inventory_summary_report, item, item_count, item_name, item_number, items, items_purchased,
items_received, items_summary_report, jurisdiction, low_inventory, low_inventory_report,
low_sell_quantity, more_than_zero, name, no_reports_to_display, payment_type, payments,
payments_summary_report, profit, quantity, quantity_purchased, quotes, received_by, receiving_id,
receiving_type, receivings, reorder_level, report, report_input, reports, requisition,
requisition_by, requisition_id, requisition_item, requisition_item_quantity,
requisition_related_item, requisition_related_item_total_quantity,
requisition_related_item_unit_quantity, requisitions, returns, revenue, sale_id, sale_type, sales,
sales_amount, sales_summary_report, sales_taxes, sales_taxes_summary_report, serial_number,
service_charge, sold_by, sold_items, sold_to, stock_location, sub_total_value, subtotal,
summary_reports, supplied_by, supplier, suppliers, suppliers_summary_report, tax, tax_category,
tax_name, tax_percent, tax_rate, taxes, taxes_summary_report, toggle_cost_and_profit, total,
total_inventory_value, total_low_sell_quantity, total_quantity, total_retail, trans_amount,
trans_due, trans_group, trans_nopay_sales, trans_payments, trans_refunded, trans_sales, trans_type,
type, unit_price, used, work_orders, zero_and_less` (`Reports.php:4-150`).

Labels used by the models but not by the controller (already in the list): `earned, used,
tax_name, tax_percent, item_name, reorder_level, stock_location, low_sell_quantity,
sub_total_value, more_than_zero, zero_and_less`.

### B. Upstream-to-target key matrix (machine-readable summary)

```text
UPSTREAM KEY                     TARGET KEY                       PERMISSION (upstream)
summary_sales                    summary_sales                    reports_sales
summary_categories               summary_categories               reports_categories
summary_expenses_categories      summary_expenses_categories      reports_expenses_categories
summary_customers                summary_customers                reports_customers
summary_suppliers                summary_suppliers                reports_suppliers
summary_items                    summary_items                    reports_items
summary_employees                summary_employees                reports_employees
summary_taxes                    summary_taxes                    reports_taxes
summary_sales_taxes              summary_sales_taxes              reports_sales_taxes
summary_discounts                summary_discounts                reports_discounts
summary_payments                 summary_payments                 reports_payments
inventory_low                    inventory_low                    reports_inventory
inventory_summary                inventory_summary                reports_inventory
detailed_item_sales              (missing)                        reports_sales
detailed_sales                   detailed_sales                   reports_sales
detailed_receivings              detailed_receivings              reports_receivings
specific_customers               specific_customer                reports_customers
specific_employees               specific_employee                reports_employees
specific_discounts               specific_discount                reports_discounts
specific_suppliers               specific_supplier                reports_suppliers
graphical_summary_<x>            <x>_graphical                    same as <x>
(no upstream)                    detailed_payments                reports_payments (target)
(no upstream)                    summary_expenses                 reports_expenses (target)
(no upstream)                    summary_cashups                  reports_cashups (target)
(no upstream)                    summary_giftcards                reports_giftcards (target)
```

### C. Upstream line index (most-cited locations)

* Permission map: `app/Controllers/Reports.php:85-106`; normalisation `:108-120`.
* Subtitle: `:2217-2228`; no-cache: `:2233-2240`.
* Sale-type options: `:1799-1813`; payment-type options: `:1291-1304`.
* Summary data methods: `:160,207,252,290,338,384,434,482,524,584,623`.
* Summary input pages: `:566,684,703,717,730,752,1267,1417,1540,1724,2160`.
* Graphical methods: `:771,816,862,909,952,997,1041,1085,1129,1177,1224`.
* Detailed/specific data methods: `:1317,1444,1569,1750,1822,1934,2037`.
* Row endpoints: `:1672-1716`, `:1997-2028`.
* Inventory data methods: `:2122-2152`, `:2179-2212`.
* `Summary_report` common fragments: `Summary_report.php:13-90` (select/temp tables),
  `96-105` (from), `112-152` (where), `200-234` (public API).
* Temp-table suppliers: `Sale.php:1065-1200`, `Receiving.php:306-380`.
* View contracts: `tabular.php:34-79`, `tabular_details.php:32-97`, `graphical.php:33-39`,
  `graphs/{bar,hbar,line,pie}.php`.
* Target report surface: `src/lib/reports/registry.ts:31-493`,
  `src/app/(secure)/reports/[key]/page.tsx:6-30`,
  `src/app/(secure)/reports/[key]/export/route.ts:11-28`,
  `src/components/reports/report-view.tsx:22-106`,
  `src/components/reports/charts.tsx:5-99`,
  `src/app/api/reports/**`, `src/db/schema/{sales,receivings,items,expenses,taxes}.ts`.

### D. Files that must change for the port (checklist)

```text
src/lib/reports/registry.ts                 replace with definition index
src/lib/reports/permissions.ts              new
src/lib/reports/filters.ts                  new
src/lib/reports/columns.ts                  new
src/lib/reports/format.ts                   new
src/lib/reports/sql/common.ts               new
src/lib/reports/sql/date.ts                 new
src/lib/reports/engine.ts                   new
src/lib/reports/detail.ts                   new
src/lib/reports/export.ts                   new
src/lib/reports/definitions/*.ts            20 new files (§10.4)
src/app/(secure)/reports/page.tsx           panels + grant filtering
src/app/(secure)/reports/[key]/page.tsx     input/results split
src/app/(secure)/reports/[key]/export/route.ts  permission + formatting + no cap
src/app/api/reports/[key]/route.ts          new data endpoint
src/app/api/reports/[key]/[id]/*-row/route.ts   rework existing two files
src/app/api/reports/entity-options/route.ts new
src/app/api/reports/payment-type/route.ts   rework
src/app/api/reports/sale-type-options/route.ts  rework
src/components/reports/{report-view,report-table,report-summary,report-chart,detail-panel}.tsx
src/components/reports/charts.tsx           currency/axis/tooltip additions
src/db/seed.ts                              permission corrections
src/db/schema/*                             tax_type, reference_code, expenses.tax_amount,
                                            sales_reward_points, sales_taxes reporting columns
                                            (decision-dependent)
e2e/reports.spec.ts                         rewrite
src/lib/reports/*.test.ts                   new unit tests
src/lib/auth/rbac.ts                        base-grant semantics
```

---

End of report.









