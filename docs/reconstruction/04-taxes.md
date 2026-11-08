# 04 — Taxes: source-parity reconstruction (classic + destination-based)

Analysis agent E. Read-only analysis of both trees; no source file was modified.
One deliverable only: this report.

- UPSTREAM (source of truth): `/home/yash/ospos` — OSPOS 3.4.3, commit
  `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`.
- TARGET: `/home/yash/Desktop/yash/ospos-nextjs` — Next.js 16 + Drizzle port
  (SQLite primary, MySQL schema mirror).

All citations are `path:line`. Upstream paths are absolute under `/home/yash/ospos`;
target paths are absolute under `/home/yash/Desktop/yash/ospos-nextjs`, abbreviated
as `T:/` in prose only where a sentence would otherwise repeat the root; every
table row and code block uses full or unambiguous paths.

---

## 0. Executive summary

Upstream has **two independent tax engines** selected at runtime by the
`use_destination_based_tax` config row:

1. **Classic ("Base System") item taxes** — per-item rows in `items_taxes`
   (`name`, `percent`), no categories, no jurisdictions, no codes, no cascade,
   no per-rate rounding. All rounding is hard-wired to `HALF_UP`; the final pass
   rounds group totals to `tax_decimals` when `tax_included` else `currency_decimals`.
2. **Destination-based tax** — `tax_codes` (city/state/destination code) ×
   `tax_categories` → `tax_rates` rows, each pointing at a `tax_jurisdictions`
   row carrying `tax_type` (included/excluded), `tax_group`, `tax_group_sequence`,
   `cascade_sequence` and `tax_rounding_code`. Tax is computed per line, per rate,
   with cascade compounding and per-rate rounding, then group totals are
   re-rounded in `round_taxes`.

The target has a single `getTaxes()` in `src/lib/tax/index.ts` that attempts both
engines, but it diverges from upstream in at least twenty material ways: missing
cascade ordering, wrong group keys, no print sequence, wrong destination
fallback shape, no default tax category, a `HALF_FIVE` that rounds to half-units
instead of five units, sign-incorrect `HALF_UP`/`HALF_DOWN` for negative amounts,
classic-path "default tax 1/2" behaviour that upstream does not have, no
`taxed_flag`, no `sale_id` re-open path, no persistence of jurisdiction/category/
code on `sales_items_taxes`, and tax report SQL that references columns the port
never created (`sales_taxes.name`, `sales_taxes.amount`).

The biggest *structural* gaps (must be fixed for parity, not cosmetic):

| # | Gap | Upstream evidence | Target evidence |
|---|-----|-------------------|-----------------|
| G1 | Destination rate rows are not ordered by `cascade_sequence, tax_group, jurisdiction_name, seq` | `/home/yash/ospos/app/Models/Tax.php:126` | `src/lib/tax/index.ts:298-310` (no `orderBy`) |
| G2 | Group key is not `clean('X' . (float)rate . '% ' . group)` | `/home/yash/ospos/app/Libraries/Tax_lib.php:196` | `src/lib/tax/index.ts:220,335` |
| G3 | No `print_sequence` / `tax_group_sequence` on persisted groups | `Tax_lib.php:194-216`, `Tax.php:120` | `SaleTaxGroup` has no such field (`src/lib/tax/index.ts:29-35`) |
| G4 | Classic engine invents a `default_tax_1_*` fallback that upstream never applies at sale time | upstream only seeds `items_taxes` at item-create (`app/Controllers/Items.php:398-411,1481-1500`) | `src/lib/tax/index.ts:178-201` |
| G5 | Destination branch falls through into the classic branch when it returns false | `Tax_lib.php:148-155` (else-branch only) | `src/lib/tax/index.ts:163-210` |
| G6 | No default tax category when the cart line has none | `Tax_lib.php:150-152` | `src/lib/tax/index.ts:163,297` |
| G7 | Customer `sales_tax_code_id`/city/state never reach destination lookup for exempt/absent customers consistently | `Tax_lib.php:90-96,154` | `src/lib/tax/index.ts:137-157` |
| G8 | `sales_items_taxes` loses `tax_type`, `rounding_code`, `cascade_sequence`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id` | `3.3.0_indiagst.sql:38-42`, `Sale.php:743-766` | `src/db/schema/sales.ts:37-44`, `src/lib/sale/sale-model.ts:190-200` |
| G9 | `sales_taxes` loses `print_sequence`, `name`, `tax_rate`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id`, `rounding_code` | `3.3.0_indiagst.sql:46-62`, `Sale.php:726-741` | `src/db/schema/sales.ts:46-53`, `src/lib/sale/sale-model.ts:178-188` |
| G10 | Tax reports reference nonexistent columns | `Summary_taxes.php:59-99`, `Summary_sales_taxes.php:65-69` | `src/lib/reports/registry.ts:255-259,453-459` |
| G11 | `roundTaxes` does not sort by print sequence and never runs `apply_invoice_taxing` | `Tax_lib.php:232-294` | `src/lib/tax/index.ts:269-278` |
| G12 | Item/customer UI does not persist `sales_tax_code_id`, `tax_id`, `tax_code_type` | `Customers.php:279`, `Views/customers/form.php:156-168` | `src/components/customers/customer-form.tsx:43-63`, `src/db/schema/customers.ts:5-15` |
| G13 | Tax rate save accepts negative percentages | `Controllers/Taxes.php:376-380` | `src/app/(secure)/taxes/actions.ts:17-21` |
| G14 | Tax CRUD structure differs (bulk-save tabbed manage vs per-row pages), no uniqueness of `(code, category, jurisdiction)` and no jurisdiction `tax_group` uniqueness check | `Controllers/Taxes.php:489-546` | `src/app/(secure)/taxes/actions.ts:10-31` |

---

## 1. Concepts and gating

### 1.1 The master switch

`app_config.use_destination_based_tax` (string `'0'`/`'1'`) is the only switch.
It was introduced by renaming the legacy key `customer_sales_tax_support`
(`/home/yash/ospos/app/Database/Migrations/sqlscripts/3.3.0_indiagst.sql:11-13`).
It is read as a PHP truthy string:

- `/home/yash/ospos/app/Libraries/Tax_lib.php:100`
  `if (!$this->config['use_destination_based_tax'])` → classic engine else
  destination engine.
- Config UI disables the classic fields and the destination fields mutually
  exclusively: `/home/yash/ospos/app/Views/configs/tax_config.php:150-164`
  (`tax_included`, `default_tax_1/2_*` disabled when destination mode is on;
  `default_tax_code/category/jurisdiction` disabled when it is off).

Target reads the same key in `src/lib/tax/index.ts:129`
(`getConfigBool("use_destination_based_tax", false)`) and gates item-form UI
(`src/app/(secure)/items/page.tsx:31`, `src/app/(secure)/items/[id]/page.tsx:24`,
`src/app/(secure)/items/new/page.tsx:14`). Target does **not** gate the config
fields, and the config tab (`src/lib/config/tabs.ts:52-66`) exposes both families
at once and is missing `default_tax_jurisdiction`.

### 1.2 Tax included vs excluded

Two constants, both strings, at `/home/yash/ospos/app/Libraries/Tax_lib.php:23-24`:

```php
const TAX_TYPE_EXCLUDED = '1';   // "Sales Tax" — added on top of the price
const TAX_TYPE_INCLUDED = '0';   // "VAT Tax"    — a component of the price
```

`config.tax_included` selects the **global** classic mode
(`Tax_lib.php:118-124`). In destination mode the type is **per rate row** from
`tax_jurisdictions.tax_type` (`Tax_lib.php:331-338`), and `config.tax_included`
still influences only the final rounding scale (`Tax_lib.php:263-267`) and the
sale-total assembly (`app/Libraries/Sale_lib.php:729-738`).

`get_tax_types()` returns `[EXCLUDED => lang('Taxes.tax_excluded'),
INCLUDED => lang('Taxes.tax_included')]` = `['1' => 'Tax excluded',
'0' => 'Tax included']` (`Tax_lib.php:52-58`, strings at
`app/Language/en/Taxes.php:58,62`). `get_tax_type_options()` renders an HTML
fragment with **EXCLUDED first labelled "Sales Tax"** and **INCLUDED second
labelled "VAT Tax"** (`Tax_lib.php:460-475`, labels `Taxes.sales_tax` and
`Taxes.vat_tax` at `app/Language/en/Taxes.php:27,84`). The target inverts both
the order and the labels (`src/lib/tax/index.ts:88-93` returns
`INCLUDED:"Included"` then `EXCLUDED:"Excluded"`).

Included-tax extraction formula (`Tax_lib.php:183-189`):

```
gross  = get_item_total(q, price, discount, discount_type, include_discount=true)
factor = (100 + percent) / 100          // bcadd then bcdiv, scale = bcscale
net    = gross / factor                 // bcdiv, truncating at bcscale
tax    = gross - net                    // bcsub, scale = bcscale
```

`bcscale` is globally set to `max(2, totals_decimals + tax_decimals)` = **4** with
default config (`/home/yash/ospos/app/Events/Load_config.php:44`). All bc math
without an explicit scale therefore truncates at 4 decimals. This is load-bearing
for exact parity (see §3.2).

### 1.3 The five dimensions

| Concept | Table | Purpose |
|---|---|---|
| Tax category | `tax_categories` | Classifies items/services; each category can carry its own rate per code. `tax_group_sequence` participates in print ordering. |
| Tax code | `tax_codes` | "Destination" identity: a code with optional `city`/`state`, assigned to customers (`customers.sales_tax_code_id`) and selectable as the site default. |
| Jurisdiction | `tax_jurisdictions` | The taxing authority. Carries `tax_group` (the human/aggregation name), `tax_type` (included/excluded), `reporting_authority`, `tax_group_sequence`, `cascade_sequence`. |
| Rate | `tax_rates` | The join tuple `(rate_tax_code_id, rate_tax_category_id, rate_jurisdiction_id) → tax_rate (decimal 15,4) + tax_rounding_code`. Multiple rates may share code+category (one per jurisdiction). |
| Item tax | `items_taxes` | Classic engine only: unbounded list of `(name, percent)` per item. |

### 1.4 Customer exemption

`customers.taxable` (int 1 default) gates the **entire** computation:

```php
// Tax_lib.php:95-96
if ($customer_id == -1 || $customer_info->taxable) { ... whole cart ... }
```

If the block is skipped, `$taxes` and `$item_taxes` stay `[]`, `round_taxes()` is
not called, and no cart line receives `taxed_flag`. Note `-1` is `NEW_ENTRY`
(`app/Config/Constants.php:87`) and is also the "walk-in" sentinel returned by
`Sale_lib::get_customer()`.

The same gate is re-applied at persist time:
`/home/yash/ospos/app/Models/Sale.php:683-686`
`if ($customerId == NEW_ENTRY || $customer->taxable) { save_sales_tax; save_sales_items_taxes; }`.

### 1.5 Default tax 1 / default tax 2 (classic only, item-creation defaults)

`app_config` keys `default_tax_1_name`, `default_tax_1_rate`,
`default_tax_2_name`, `default_tax_2_rate`
(`3.0.2_to_3.1.1.sql:195-198`; UI `app/Views/configs/tax_config.php:42-86`;
save + negative validation `app/Controllers/Config.php:953-967`).

Upstream semantics are **narrow**: they prefill the item form for a *new* item
(`app/Controllers/Items.php:398-400`, `app/Views/items/form.php:227-236,247-259`)
and are written into `items_taxes` when the item is saved
(`Items.php:1481-1500`, `Item_taxes::save_value`). `Tax_lib` **never reads them**.
So an item with zero `items_taxes` rows has zero tax in upstream, regardless of
the defaults.

`default_tax_1_cumulative` exists only in the target
(`src/lib/config/tabs.ts:57`); it is not an upstream key (grep over
`/home/yash/ospos/app` finds no such key).

### 1.6 Item tax assignments

- Classic: `items_taxes(item_id, name, percent)`, at most two rows in practice
  because the form exposes two pairs; `Item_taxes::save_value` deletes all rows
  and re-inserts (`app/Models/Item_taxes.php:56-70`).
- Destination: `items.tax_category_id` (nullable since
  `3.4.2_nullable_tax_category_id.sql`), chosen only when destination mode is on
  (`app/Views/items/form.php:267-279`; defaulting logic
  `app/Controllers/Items.php:405-412`).
- New-item default for destination mode is `config.default_tax_category`
  (`Items.php:410-412`). The migration seeds that value as the **name**
  `'Standard'` (`3.0.2_to_3.1.1.sql:194`) while `Tax::get_taxes()` compares it to
  `rate_tax_category_id` — an upstream seed/config inconsistency (see §12 U3).

### 1.7 Rounding mode selection

- Classic engine: hard-coded `Rounding_mode::HALF_UP` for both the computation
  (`Tax_lib.php:120,123`) and the group record (`Tax_lib.php:128,139`).
- Destination engine: `tax_rates.tax_rounding_code` per rate row
  (`Tax_lib.php:328,342`).
- Final group re-rounding: `tax_rounding_code` of the group
  (`Tax_lib.php:271-290`).
- Cash rounding (orthogonal): `config.cash_rounding_code` through
  `Rounding_mode::round_number(code, total, cash_decimals)`
  (`app/Libraries/Sale_lib.php:1728-1734`).

### 1.8 Gating summary matrix

| Condition | Upstream effect | Target effect |
|---|---|---|
| `use_destination_based_tax = 1` | only `apply_destination_tax` runs | destination attempted, then classic fallback |
| `tax_included = 1` (classic) | `get_included_tax`, groups typed `INCLUDED` | same |
| `tax_included = 1` (final round) | round to `tax_decimals` | per-row: included→`taxDecimals`, else `totalsDecimals` |
| customer taxable = 0 | no tax arrays, no flags | early return `{taxes:[],itemTaxes:[]}` |
| customer id = -1 | tax applies (walk-in) | tax applies (customer lookup skipped) |
| customer id set but row missing | upstream `taxable` defaults 0 → **no tax** | target computes tax (customer undefined → not `false`) |
| item price = 0 (destination) | skipped, `taxed=false` | not skipped; `taxed=true` if links exist |

---

## 2. Config keys, constants, decimals

### 2.1 Exact config keys

| Key | Seeded value | Defined at |
|---|---|---|
| `tax_included` | `'0'` | `app/Database/Migrations/sqlscripts/initial_schema.sql:27` |
| `tax_decimals` | `'2'` | `initial_schema.sql:66` |
| `currency_decimals` | `'2'` | `initial_schema.sql:65` |
| `cash_decimals` | `'2'` | `3.0.2_to_3.1.1.sql:150` |
| `cash_rounding_code` | `'0'` | `3.0.2_to_3.1.1.sql:151` |
| `default_tax_1_name` / `_rate` | `''`, `''` | `3.0.2_to_3.1.1.sql:195-196` |
| `default_tax_2_name` / `_rate` | `''`, `''` | `3.0.2_to_3.1.1.sql:197-198` |
| `default_tax_category` | `'Standard'` | `3.0.2_to_3.1.1.sql:194` |
| `default_tax_code` (was `default_origin_tax_code`) | `''` | renamed at `3.3.0_indiagst.sql:15-17` |
| `default_tax_jurisdiction` | `''` | inserted at `3.3.0_indiagst.sql:8` |
| `use_destination_based_tax` (was `customer_sales_tax_support`) | `'0'` | `3.0.2_to_3.1.1.sql:192`, renamed `3.3.0_indiagst.sql:11-13` |
| `tax_id` | `''` | `3.3.0_indiagst.sql:9` |
| `include_hsn` | `'0'` | `3.3.0_indiagst.sql:6` |

Read helper: `config(OSPOS::class)->settings` is an array of these strings
(`app/Libraries/Tax_lib.php:46`, `app/Controllers/Taxes.php:34`). No coercion is
applied anywhere; `'0'` is falsy, any other non-empty string truthy.

### 2.2 Decimal helpers

`app/Helpers/locale_helper.php`:

```php
quantity_decimals() : int  => $config['quantity_decimals'] ?? 0     // 313-317
totals_decimals()   : int  => $config['currency_decimals'] ?? 0     // 322-326
cash_decimals()     : int  => $config['cash_decimals'] ?? 0         // 331-335
tax_decimals()      : int  => $config['tax_decimals'] ?? 0          // 340-344
parse_tax($n)       : mixed => parse_decimals($n, tax_decimals())   // 467-470
```

Display-only rounding helper used by receipts/invoices:
`to_currency_tax($n)` = `to_decimals($n, 'tax_decimals')` when `tax_included`
else `to_decimals($n, 'currency_decimals')` (`locale_helper.php:388-397`).

### 2.3 Other constants used by tax code

`app/Config/Constants.php`:
`NEW_ENTRY = -1` (:87), `HAS_STOCK = 0` (:110), `COMPLETED = 0` (:139),
`SALE_TYPE_POS/INVOICE/WORK_ORDER/QUOTE/RETURN = 0/1/2/3/4` (:143-147),
`PERCENT = 0` (:149), `DEFAULT_PRECISION = 2` (:172).

`PERCENT = 0` matters: `Sale_lib::get_item_discount()` treats
`discount_type == PERCENT` as percentage, anything else as a fixed per-unit
amount (`app/Libraries/Sale_lib.php:1633-1643`).

Target mirrors the numeric constants in `src/lib/constants.ts:29-33,37,41`:
`TAX_TYPE = {INCLUDED:0, EXCLUDED:1}`,
`ROUNDING_MODE = {HALF_UP:1, HALF_DOWN:2, HALF_EVEN:3, HALF_ODD:4, ROUND_UP:5,
ROUND_DOWN:6, HALF_FIVE:7}`, `PERCENT = 0`, `NEW_ENTRY = -1`. Values match PHP's
`PHP_ROUND_HALF_*` (1..4) and the upstream custom 5/6/7.

### 2.4 Rounding_mode enum surface

`app/Models/Enums/Rounding_mode.php`:

```php
const HALF_UP   = PHP_ROUND_HALF_UP;    // 1   :9
const HALF_DOWN = PHP_ROUND_HALF_DOWN;  // 2   :10
const HALF_EVEN = PHP_ROUND_HALF_EVEN;  // 3   :11
const HALF_ODD  = PHP_ROUND_HALF_ODD;   // 4   :12
const ROUND_UP   = 5;                   // :13
const ROUND_DOWN = 6;                   // :14
const HALF_FIVE  = 7;                   // :15
```

API:
- `get_rounding_options(): array` — reflection over the constants, labels from
  `Enum.<lowercase name>` (`:25-35`; labels `app/Language/en/Enum.php:3-11`:
  Half Down / Half Even / Half Five / Half Odd / Half Up / Round Down / Round Up).
- `get_rounding_code_name(int): string` — `lang('Common.unknown')` for empty/0
  (`:41-48`).
- `get_html_rounding_options(): string` — `<option value="N">Label</option>`
  (`:53-62`).
- `round_number(int $mode, float $amount, int $decimals): string` (`:70-85`).

---

## 3. `Tax_lib` — every method, exact algorithm

Instance construction (`Tax_lib.php:35-47`) wires `Sale_lib`, `Customer`,
`Item_taxes`, `Sale`, `Tax`, `Tax_category`, `Tax_code`, `Tax_jurisdiction`, and
snapshots `config(OSPOS::class)->settings`.

### 3.1 `get_tax_types()` — `:52-58`

Returns the string-keyed map described in §1.2. No parameters.

### 3.2 `get_item_sales_tax()` — `:63-71` (dead code upstream)

```
decimals = tax_decimals()
basis    = Sale_lib.get_item_total(quantity, price, discount, discount_type,
                                   include_discount = true)     // scale 4
return get_tax_for_amount(basis, tax_percentage, rounding_code, decimals)
```

The TODO at `:63` states it is never called. Target ports it as
`getItemSalesTax` (`src/lib/tax/index.ts:107-111`) with the same shape.

### 3.3 `get_tax_for_amount()` — `:76-81`

```
product = bcmul(basis, bcdiv(percent, '100'))    // both at bcscale = 4, truncating
return Rounding_mode::round_number(rounding_mode, product, decimals)
```

Two truncations happen before rounding:
1. `bcdiv(percent, '100')` truncates the fraction to 4 decimals. A rate of
   `6.875` becomes `0.0687`, not `0.06875`.
2. `bcmul` truncates the product to 4 decimals.

Target (`src/lib/tax/index.ts:113-115`) uses IEEE-754
`taxBasis * (percent / 100)` with no 4-decimal truncation. For rates with more
than 2 decimal places the two engines produce different cents (fixture F19).

### 3.4 `get_included_tax()` — `:183-189`

```
item_total  = get_item_total(q, price, discount_pct, discount_type, true)  // gross, scale 4
tax_fraction = bcdiv(bcadd('100', tax_percentage), '100')                  // scale 4
price_tax_excl = bcdiv(item_total, tax_fraction)                           // scale 4, truncating
return bcsub(item_total, price_tax_excl)                                   // scale 4, truncating
```

Critical: the docblock at `:183` notes `$tax_decimal` and `$rounding_code` are in
the signature but **never used** — the result is unrounded. Rounding happens only
later in `round_taxes`. Target (`src/lib/tax/index.ts:117-121`) rounds inside the
function to `taxDecimals` with the supplied code, which can shift a cent when
many lines aggregate.

Also note the argument `$discount_percentage` is really the raw discount (percent
or fixed) — `get_item_total` interprets it via `discount_type`.

### 3.5 `get_taxes(array &$cart, int $sale_id = -1)` — `:86-171`

This is the cart engine. Return value is a two-element list:
`[0] => sales_tax groups (assoc, later reindexed), [1] => per-line tax detail rows`.

Pseudocode, faithful to the source:

```
get_taxes(cart, sale_id = -1):
  register_mode = sale_lib.get_mode()               # 'sale' | 'return' | 'sale_invoice' | 'sale_quote' | 'sale_work_order'
  tax_decimals  = tax_decimals()
  customer_id   = sale_lib.get_customer()           # -1 for walk-in
  customer_info = Customer.getInfo(customer_id)     # empty object when not found
  taxes = {}                                        # assoc, key = group index
  item_taxes = []                                   # ordered detail rows

  if customer_id == -1 OR customer_info.taxable:                       # :96
    for line, item in cart:                                            # :97
      taxed = false
      if NOT config.use_destination_based_tax:                         # :100
        if sale_id == -1:                                              # :103
          tax_info = Item_taxes.get_info(item.item_id)                 # live item taxes
        else:
          tax_info = Sale.get_sales_item_taxes(sale_id, item.item_id)  # saved name+percent only
        tax_group_sequence = 0                                         # :109
        for tax in tax_info:                                           # :113
          tax_basis = sale_lib.get_item_total(item.quantity, item.price,
                          item.discount, item.discount_type, true)     # :115
          tax_amount = '0.0'
          if config.tax_included:                                      # :118
            tax_type   = '0'  # INCLUDED
            tax_amount = get_included_tax(q, price, discount, discount_type,
                                          tax.percent, tax_decimals, HALF_UP)   # :120
          else:
            tax_type   = '1'  # EXCLUDED
            tax_amount = get_tax_for_amount(tax_basis, tax.percent, HALF_UP,
                                            tax_decimals)              # :123
          if tax_amount <> 0:                                          # :126  (loose compare)
            tax_group_sequence += 1                                    # :127
            update_taxes(taxes, tax_type, tax.name, tax.percent, tax_basis,
                         tax_amount, tax_group_sequence, HALF_UP, -1, tax.name)  # :128
            tax_group_sequence += 1                                    # :129  → 1,3,5,...
            taxed = true
          item_taxes.append({                                          # :133-146
            item_id: item.item_id, line: item.line, name: tax.name,
            percent: tax.percent, tax_type: tax_type,
            rounding_code: HALF_UP, cascade_sequence: 0,
            item_tax_amount: tax_amount,
            sales_tax_code_id: null, jurisdiction_id: null, tax_category_id: null
          })
      else:                                                            # :148 destination
        if item.tax_category_id == null:                               # :150
          item.tax_category_id = config.default_tax_category           # :151 (assigned into a *local copy*)
        taxed = apply_destination_tax(item, customer_info.city, customer_info.state,
                     customer_info.sales_tax_code_id, register_mode, 0,
                     taxes, item_taxes, item.line)                     # :154
      if taxed:                                                        # :157
        cart[line].taxed_flag = lang('Sales.taxed_ind')
      else:
        cart[line].taxed_flag = lang('Sales.nontaxed_ind')
    round_taxes(taxes)                                                 # :163
  return [taxes, item_taxes]                                           # :166-170
```

Observations that matter for parity:

1. `tax_basis` is recomputed inside the per-tax loop but is the same value each
   time (`:115`). It excludes any prior tax — the classic engine has **no
   cascade** even though `items_taxes` gained a `cascade_sequence` column in
   3.1.1 (`3.0.2_to_3.1.1.sql:126`), which is never populated for classic rows.
2. `$tax_group_sequence` resets **per cart line** (`:109`) and is incremented
   twice per found tax, so values are 1, 3, 5, … within a line. Because
   `update_taxes` only stores `print_sequence` on first insertion of a group
   key, the **first cart line that produced the group** fixes its print
   sequence; several groups can share the same number.
3. The `else` branch (`:148`) never falls back to classic taxes.
4. `$item['tax_category_id'] = ...` at `:151` mutates the foreach **value copy**,
   not `$cart[$line]`; it nevertheless works because the modified `$item` is
   passed to `apply_destination_tax` immediately afterwards (`:154`). The cart
   line itself keeps `null`.
5. `get_sales_item_taxes()` selects only `item_id, name, percent`
   (`app/Models/Sale.php:784-793`), so a re-opened sale loses tax type, rounding
   code, cascade and all destination metadata when re-displaying
   (`app/Controllers/Sales.php:1215`). Group totals are recomputed from scratch
   but the stored `sales_taxes` rows are what the receipt prints
   (`Sales.php:1216`).
6. `taxed_flag` language keys: `Sales.taxed_ind` / `Sales.nontaxed_ind`
   (`Tax_lib.php:158,160`).
7. `round_taxes()` is called **only** when tax applies; exempt customers leave
   raw (unrounded) group values — irrelevant because the arrays are empty.

Target equivalent: `src/lib/tax/index.ts:123-256`. Differences enumerated in §10.

### 3.6 `update_taxes()` — `:194-226`

Signature (11 parameters, 3 optional):

```php
update_taxes(array &$taxes, string $tax_type, string $tax_group, string $tax_rate,
             string $tax_basis, string $item_tax_amount, int $tax_group_sequence,
             int $rounding_code, int $sale_id, string $name = '',
             ?int $tax_code_id = null, ?int $jurisdiction_id = null,
             ?int $tax_category_id = null): void
```

```
index = clean('X' . (float)tax_rate . '% ' . tax_group)      # :196
if index not in taxes:
    taxes[index] = {
      sale_id: sale_id, tax_type: tax_type, tax_group: tax_group,
      sale_tax_basis: tax_basis, sale_tax_amount: item_tax_amount,
      print_sequence: tax_group_sequence, name: name, tax_rate: tax_rate,
      sales_tax_code_id: tax_code_id, jurisdiction_id: jurisdiction_id,
      tax_category_id: tax_category_id, rounding_code: rounding_code
    }                                                        # :201-216
else:
    taxes[index].sale_tax_basis  = bcadd(old, tax_basis, 4)     # :223
    taxes[index].sale_tax_amount = bcadd(old, item_tax_amount, 4)  # :224
```

`clean()` (`:394-399`):

```
s = str_replace(' ', '-', s)          # spaces → hyphens
s = preg_replace('/[^A-Za-z0-9\-]/', '', s)  # strip everything except ASCII alnum and '-'
```

So `'X8% VAT'` → `'X8%-VAT'` → `'X8-VAT'`. `percent`/currency signs and Unicode
are stripped. `(float)'10.0000'` → `10`; `(float)'8.2500'` → `8.25`.

Consequences:
- The key is **not** usable as a display label; the display values live in
  `tax_group` / `name`.
- Two jurisdictions with the same rate and same `tax_group` collapse into one
  group. Two with the same rate and different groups stay separate.
- Accumulation is at scale 4 regardless of `tax_decimals`; the final scale is
  imposed by `round_taxes`.
- `sale_id` is `-1` for cart-time computation and the real id only in the
  migration-era invoice-taxing path; `save_sales_tax` overwrites it
  (`app/Models/Sale.php:726-741`).

Group record shape persisted by upstream (`sales_taxes`, 3.3.0 DDL):
`sales_taxes_id, sale_id, jurisdiction_id, tax_category_id, tax_type, tax_group,
sale_tax_basis decimal(15,4), sale_tax_amount decimal(15,4), print_sequence,
name, tax_rate decimal(15,4), sales_tax_code_id, rounding_code`
(`3.3.0_indiagst.sql:46-62`).

### 3.7 `apply_invoice_taxing()` — `:232-247`

```
if taxes not empty:
    stable sort taxes by print_sequence ascending (array_multisort, keys renumbered)
decimals = totals_decimals()
for each tax row:
    sale_tax_amount = get_tax_for_amount(sale_tax_basis, tax_rate,
                                         rounding_code, decimals)
```

Comment at `:230-231` says it applies "invoice taxing (as opposed to
invoice_item_taxing)" and is "currently used ONLY for the original sales tax
migration". Grep confirms **no caller** in `app/` outside `Tax_lib`. So it is
part of the public surface but dead in 3.4.3.

Note it recomputes from the **aggregated basis** using `totals_decimals`
(never `tax_decimals`) and the row's stored rounding code.

### 3.8 `round_taxes()` — `:252-294`

```
if taxes not empty:
    stable sort by print_sequence asc, keys renumbered 0..n-1
decimals = config.tax_included ? tax_decimals() : totals_decimals()   # :263-267
for each row:
    amount = row.sale_tax_amount
    code   = row.rounding_code
    rounded = amount
    if   code == HALF_UP   : rounded = round(amount, decimals, PHP_ROUND_HALF_UP)    # :275
    elif code == HALF_DOWN : rounded = round(amount, decimals, PHP_ROUND_HALF_DOWN)  # :277
    elif code == HALF_EVEN : rounded = round(amount, decimals, PHP_ROUND_HALF_EVEN)  # :279
    elif code == HALF_ODD  : rounded = round(amount, decimals, PHP_ROUND_HALF_UP)    # :281  ← BUG: not HALF_ODD
    elif code == ROUND_UP  : fig = (int)str_pad('1', decimals, '0');
                             rounded = ceil(amount * fig) / fig                      # :283-284
    elif code == ROUND_DOWN: fig = (int)str_pad('1', decimals, '0');
                             rounded = floor(amount * fig) / fig                     # :286-287
    elif code == HALF_FIVE : rounded = round(amount / 5) * 5                         # :289  ← BUG: no decimals arg
    row.sale_tax_amount = rounded
```

Three upstream defects to decide on explicitly:

1. `HALF_ODD` is implemented as `HALF_UP` (`:281`) — diverges from
   `Rounding_mode::round_number`, which honours `PHP_ROUND_HALF_ODD`.
2. `HALF_FIVE` here is `round(amount / 5) * 5` with **no decimals argument**, so
   it rounds to the nearest multiple of **5 currency units** (0, 5, 10, …), not
   the nearest 5 units at the configured scale. Example: an 8.00 tax becomes
   10.00. This affects any destination rate with `tax_rounding_code = 7`
   because round_taxes is the last writer.
3. `str_pad('1', decimals, '0')` yields `1`, `10`, `100` — correct for 0/1/2
   decimals; for `decimals > 9` it overflows an int, irrelevant in practice.

`array_multisort` renumbers keys, so after this method the group map is a
0-based list ordered by print sequence.

### 3.9 `apply_destination_tax()` — `:300-364`

Signature:

```php
apply_destination_tax(array &$item, string $city, string $state,
    int $sales_tax_code_id, string $register_mode, int $sale_id,
    array &$taxes, array &$item_taxes, int $line): bool
```

```
taxed = false
code_id = get_applicable_tax_code(register_mode, city, state, sales_tax_code_id)   # :304
if code_id != -1 AND item.price != 0:                                              # :307
    tax_decimals = tax_decimals()
    definitions  = Tax.get_taxes(code_id, item.tax_category_id)                    # :310
    tax_basis    = sale_lib.get_item_total(item.quantity, item.price,
                       item.discount, item.discount_type, true)                    # :313
    last_cascade_sequence = 0                                                      # :317
    cascade_tax_amount    = '0.0'                                                  # :318
    for tax in definitions:                                                        # :320
        cascade_sequence = tax.cascade_sequence
        if cascade_sequence != last_cascade_sequence:                              # :322
            last_cascade_sequence = cascade_sequence
            tax_basis = bcadd(tax_basis, cascade_tax_amount)                       # :324  ← cumulative add
        rate          = tax.tax_rate
        rounding_code = tax.tax_rounding_code
        tax_type      = tax.tax_type
        if tax_type == INCLUDED:                                                   # :333
            tax_amount = get_included_tax(q, price, discount, discount_type,
                                          rate, tax_decimals, rounding_code)       # :334 (rounding args ignored)
        else:
            tax_amount = get_tax_for_amount(tax_basis, rate, rounding_code,
                                            tax_decimals)                          # :336
            cascade_tax_amount = bcadd(cascade_tax_amount, tax_amount)             # :337
        if tax_amount != 0:                                                        # :340
            taxed = true
            update_taxes(taxes, tax_type, tax.tax_group, rate, tax_basis,
                         tax_amount, tax.tax_group_sequence, rounding_code,
                         sale_id, tax.tax_group, code_id,
                         tax.rate_jurisdiction_id, item.tax_category_id)           # :342
        item_taxes.append({                                                        # :345-359
            line: line, item_id: item.item_id, name: tax.tax_group,
            percent: rate, tax_type: tax_type, rounding_code: rounding_code,
            cascade_sequence: cascade_sequence, item_tax_amount: tax_amount,
            sales_tax_code_id: code_id, jurisdiction_id: tax.rate_jurisdiction_id,
            tax_category_id: tax.rate_tax_category_id,
            tax_group_sequence: tax.tax_group_sequence
        })
return taxed
```

Cascade semantics, stated precisely:

- Definitions are ordered `cascade_sequence, tax_group, jurisdiction_name,
  (jurisdictions.tax_group_sequence + categories.tax_group_sequence)`
  (`app/Models/Tax.php:126`).
- The basis is a **running** value. At every change of `cascade_sequence`
  (including the trivial change from "0" to "0"? no — only when the value
  differs) the accumulated **excluded** tax so far is added to the basis.
- `cascade_tax_amount` is never reset and accumulates **only excluded** taxes.
  Included taxes are extracted from the gross line total and never compound.
- Mathematically the basis at cascade level *n* equals
  `line_basis + Σ(excluded taxes of levels < n)`.
- `cascade_sequence` equal to the initial `last_cascade_sequence = 0` for the
  first row does not add anything (accumulator is 0), so a single-group code is
  unaffected.
- A rate with `tax_amount == 0` still gets a detail row (with amount 0) but does
  not update the group and does not set `taxed`.

Rounding/scale details:
- `get_included_tax` ignores the supplied `tax_decimals`/`rounding_code`; the
  included amount is unrounded at scale 4.
- `get_tax_for_amount` rounds each excluded rate to `tax_decimals` at the
  per-rate rounding code.
- `update_taxes` accumulates at scale 4; `round_taxes` finally re-rounds groups
  to `tax_decimals` (included config) or `totals_decimals`.
- So a destination group's final amount can differ from the sum of its
  `sales_items_taxes.item_tax_amount` values (each of which was already rounded
  to `tax_decimals`, while the group is re-rounded to `currency_decimals` when
  `tax_included = 0`). This asymmetry is upstream behaviour and is visible in
  the reports (`Summary_report.php:52-56` re-rounds detail rows to currency
  decimals).

Nullability hazard: the parameter is `int $sales_tax_code_id` (`:373`) but
`$customer_info->sales_tax_code_id` is `NULL` for customers who never had a code
(`3.3.0_indiagst.sql:33` `DEFAULT NULL`), and the call site passes it straight
through (`:154`). In PHP 8 coercive mode, `null → int` is a `TypeError` for
userland typed parameters. Either the framework/DB never returns null in the
tested path, or destination mode + customer without code is an upstream crash.
Flag as U1.

### 3.10 `get_applicable_tax_code()` — `:373-388`

```
if register_mode == 'sale':                                  # :375
    return config.default_tax_code        # customer's code is IGNORED for plain sales
if sales_tax_code_id == null OR sales_tax_code_id == 0:      # :378
    code = Tax_code.get_sales_tax_code(city, state)          # :379
    if code == null OR code == 0:
        code = config.default_tax_code                       # :382
    return code
return sales_tax_code_id
```

Note the comment on `:376` and `:382` says "Overrides customer assigned code" —
copy-pasted and wrong on the first branch's semantics, but the code is clear:
**plain `sale` mode always uses the site default code; every other register mode
honours the customer's code first.**

`Tax_code::get_sales_tax_code(city, state)` — `app/Models/Tax_code.php:233-263`:

```
q1: tax_codes WHERE city = :city AND state = :state AND deleted = 0
    if exactly 1 row -> return its tax_code_id
q2: tax_codes WHERE city = '' AND state = :state AND deleted = 0
    if exactly 1 row -> return its tax_code_id
otherwise -> config.default_tax_code
```

Precedence chain: exact (city+state) → state-only → default. Note:
- "Exactly 1 row" — 0 or ≥2 rows both fall through (no deterministic pick).
- Case-sensitive comparison, no trimming, no normalization.
- Deleted codes are excluded.

### 3.11 `clean()` — `:394-399`

Described in §3.6. Target's `clean()` (`src/lib/tax/index.ts:390-393`) is a
**different function**: it strips `<>;"'` and trims, but keeps spaces and other
punctuation, and it is applied to city/state before DB matching, which upstream
does not do. Two consequences: keys differ (target keeps spaces, upstream
hyphenates) and lookup values may differ for names with apostrophes.

### 3.12 Option builders — `:404-475`

- `get_tax_code_options()` → `['' => ''] + {tax_code_id: tax_code_name}` for all
  non-deleted codes ordered by name (`Tax_code::get_all`, `Tax_code.php:79-93`).
- `get_tax_jurisdiction_options()` → `[0 => ''] + {jurisdiction_id:
  jurisdiction_name}`, non-deleted, ordered by name
  (`Tax_jurisdiction.php:78-93`).
- `get_tax_category_options()` → `[0 => ''] + {tax_category_id: tax_category}`,
  non-deleted, ordered by `tax_group_sequence` then `tax_category`
  (`Tax_category.php:75-90`).
- `get_tax_type_options($selected)` → HTML `<option>` string, EXCLUDED then
  INCLUDED, `selected="selected"` (escaped as `\"` inside the string) on the
  matching one (`:460-475`).

Target equivalents `getTaxCodeOptions`, `getTaxJurisdictionOptions`,
`getTaxCategoryOptions` (`src/lib/tax/index.ts:395-405`) return raw rows instead
of `{id: label}` maps including the empty sentinel, and `getTaxTypeOptions`
returns a numeric array in reverse order. They also return `deleted=false`
filters matching upstream, but categories are ordered by name, not by
`tax_group_sequence` (see §10).

---

## 4. Rounding modes — exact mathematical definitions

### 4.1 PHP semantics

`round($x, $d, PHP_ROUND_HALF_UP)` etc. operate on the decimal representation of
the binary float. For the seven modes use the following definitions, where
`S = x * 10^d`, `f = floor(S)`, `c = ceil(S)`, `r = S - f`:

| Code | Name | PHP expression | Definition | Positive example `x=2.345, d=2` | Negative example `x=-2.345` |
|---|---|---|---|---|---|
| 1 | HALF_UP | `round(x,d,PHP_ROUND_HALF_UP)` | nearest; ties away from zero | 2.35 | -2.35 |
| 2 | HALF_DOWN | `PHP_ROUND_HALF_DOWN` | nearest; ties toward zero | 2.34 | -2.34 |
| 3 | HALF_EVEN | `PHP_ROUND_HALF_EVEN` | nearest; ties to even last digit | 2.34 | -2.34 |
| 4 | HALF_ODD | `PHP_ROUND_HALF_ODD` | nearest; ties to odd last digit | 2.35 | -2.35 |
| 5 | ROUND_UP | custom | `ceil(S)/10^d` — toward **+∞** | 2.35 | -2.34 |
| 6 | ROUND_DOWN | custom | `floor(S)/10^d` — toward **−∞** | 2.34 | -2.35 |
| 7 | HALF_FIVE | custom | nearest multiple of 5 units: `round(x/5, d, HALF_EVEN)*5` | 2.35 | -2.35 |

`Rounding_mode::round_number` source for 5/6 (`app/Models/Enums/Rounding_mode.php:72-79`):

```php
$fig = pow(10, $decimals);
$rounded_total = (ceil($fig * $amount) + ceil($fig * $amount - ceil($fig * $amount))) / $fig;   // ROUND_UP
$rounded_total = (floor($fig * $amount) + floor($fig * $amount - floor($fig * $amount))) / $fig; // ROUND_DOWN
```

The second `ceil`/`floor` term is always 0 (the argument lies in `(-1, 0]` or
`[0, 1)`), so the expressions reduce to plain `ceil`/`floor` of the scaled value.
This is why negative values move **toward the named infinity**, not toward zero.

`HALF_FIVE` (`:78-79`):

```php
$rounded_total = round($amount / 5, $decimals, Rounding_mode::HALF_EVEN) * 5;
```

Meaning: divide by 5, round the quotient to `decimals` using banker's rounding,
multiply back. At `d = 2` the granularity is 0.05; at `d = 0` it is 5. For
2.345 → 2.345/5 = 0.469 → HALF_EVEN to 2 → 0.47 → ×5 = 2.35. For -2.345 →
-0.469 → -0.47 → -2.35.

Return type is declared `string` but the function returns a float; PHP coerces.

### 4.2 Target implementation and its deviations

`src/lib/tax/index.ts:37-70`:

| Code | Target expression | Correct? | Failure example |
|---|---|---|---|
| HALF_UP | `Math.round(S)/10^d` | **No for negatives** — JS `Math.round` ties toward +∞ | `-2.345` → `-2.34` (PHP: `-2.35`) |
| HALF_DOWN | floor-based, ties → floor | **No for negatives** | `-2.345` → `-2.35` (PHP: `-2.34`) |
| HALF_EVEN | floor + parity test | Yes (both signs) | — |
| HALF_ODD | floor + inverse parity | Yes (both signs) | — |
| ROUND_UP | `Math.ceil(S)/10^d` | Yes | — |
| ROUND_DOWN | `Math.floor(S)/10^d` | Yes | — |
| HALF_FIVE | `Math.round(S*2)/(10^d*2)` | **No** — rounds to the nearest *half unit* (0.005 at d=2), not to a multiple of 5 | `1.234` → `1.235` (PHP: `1.25`) |
| default | `Math.round(S)/10^d` | HALF_UP fallback | — |

`getRoundingOptions()` (`:72-82`) returns the correct labels in upstream order
(Half Up, Half Down, Half Even, Half Odd, Round Up, Round Down, Half Five) so the
enum surface is fine; only the arithmetic is wrong.

Additional target problem: `roundNumber` is used for **accumulation** at
4 decimals (`:223-224,231,261-262,322,331,338-339,345-346`) where upstream uses
truncating `bcadd(..., 4)`. Rounding-at-every-add accumulates drift differently
from truncation. This matters for the fixtures in §9 only in the 4th decimal,
but it can flip a half-cent after `roundTaxes`.

### 4.3 Cash rounding

Upstream: `Sale_lib::check_for_cash_rounding()` →
`Rounding_mode::round_number(config.cash_rounding_code, (float)$total,
cash_decimals())` (`app/Libraries/Sale_lib.php:1728-1734`). Therefore the same
`HALF_FIVE` definition applies, and cash totals can be rounded to 0.05.

Target `getTotals` applies `roundNumber(total, HALF_UP, cashDecimals())`
(`src/lib/sale/sale-lib.ts:492-497`) — it reads `cash_rounding_code` only to
decide *whether* cash rounding is active (`:654-662`) and never passes the code
to the rounding function. So a site configured with `HALF_FIVE` cash rounding
gets half-up rounding instead.

---

## 5. Tax CRUD — upstream behaviour in full

Two UIs exist upstream: (a) the **tabbed manage page** at `/taxes` which
bulk-saves all four entities, and (b) per-entity controllers
`Tax_codes`, `Tax_categories`, `Tax_jurisdictions` which are largely vestigial
and partly broken. Auto-routing is enabled (`app/Config/Routing.php:97`), so URLs
map to `getX`/`postX` methods.

### 5.1 Tax codes

**Model** `app/Models/Tax_code.php`:
- `$allowedFields = ['tax_code','tax_code_name','city','state','deleted']`
  (`:19-25`). Note: **no `tax_code_type`**, even though the 3.1.1 DDL had that
  column and the 3.3.0 DDL dropped it.
- `exists(string $tax_code)` by `tax_code` (`:30-36`).
- `get_all($rows,$limit,$no_deleted)` filters `deleted = 0`, orders by
  `tax_code_name` (`:79-93`).
- `save($data)`: insert when `tax_code` is new, else **update by `tax_code`**
  (`:110-124`). Consequence: renaming a code creates a new row and the bulk sweep
  soft-deletes the old one.
- `save_tax_codes(array)`: transaction; upserts every posted row with
  `deleted = '0'`; then soft-deletes any non-deleted row whose `tax_code` is not
  in the posted list (`:129-159`).
- `delete($tax_code)` / `delete_list(array)` soft-delete by `tax_code`
  (`:164-181`) — note the controller passes **ids** here (§5.1.1 bug).
- `search()`: `LIKE tax_code_name OR LIKE tax_code`, `deleted = 0`, count-only
  support (`:194-228`).
- `get_sales_tax_code(city, state)` (`:233-263`), see §3.10.
- `get_tax_codes_search_suggestions($term,$limit=25)` → `[{value: tax_code_id,
  label: tax_code . ' ' . tax_code_name}]` (`:270-294`).
- `get_empty_row()` → one row with `tax_code_id = -1`, blanks (`:299-311`).

**Controller** `app/Controllers/Tax_codes.php`:
- `getIndex` renders `taxes/tax_codes` with table headers (`:28-41`).
- `getSearch` / `getRow` (`:48-77`) use `tax_helper` row builders.
- `getView($id)` returns `taxes/tax_code_form` with `$data['tax_code_info']`
  (`:83-88`) — **that view file does not exist** (only `tax_rates_form.php` is in
  `app/Views/taxes/`), so this route errors.
- `postSave` builds only `tax_code, tax_code_name, city, state` and calls
  `save()` (`:95-125`). `tax_code_id` is never used; success message carries
  `$tax_code_data['tax_code_id']`, which is undefined (a PHP warning).
- `postDelete` calls `delete_list($ids)` where `$ids` are `tax_code_id` values
  (`:130-142`); `delete_list` filters by `tax_code`, so it is a no-op in practice.

**Views**:
- `app/Views/taxes/tax_codes.php`: one form `taxes/save_tax_codes/` (`:7`);
  repeatable rows from `partial/tax_codes`; client-side rules
  `requireTaxCode`, `check4TaxCodeDups`, `validateTaxCodeCharacters`
  (underscore forbidden) (`:76-125`).
- `app/Views/partial/tax_codes.php`: hidden `tax_code_id[]` with `-1` for new
  rows (`:66`), hidden row when `deleted` (`:19`), inputs `tax_code[]`,
  `tax_code_name[]`, `city[]`, `state[]` (`:22-61`).
- Server-side validation in `Taxes::postSave_tax_codes`
  (`app/Controllers/Taxes.php:439-481`): only when a non-empty `tax_code_name`
  is posted; rules `max_length[255]|unicode_alpha_numeric_punct` with messages
  `Taxes.tax_code_invalid_chars`. This is the stored-XSS guard exercised by
  `tests/Controllers/TaxesControllerTest.php:57-160`.
- The grid edit anchor points at `tax_codes/view_tax_codes/<tax_code>`
  (`app/Helpers/tax_helper.php:37-45`), which resolves on the **Taxes** controller
  (`getView_tax_codes`) and reads `$tax_code_info->tax_code_type`,
  `->rate_tax_code` — both undefined properties because the 3.3.0 table/select
  have neither (`Tax.php:61-90`).

### 5.2 Tax categories

**Model** `app/Models/Tax_category.php`:
- Fields `tax_category, tax_group_sequence, deleted` (`:19-23`).
- `get_all` orders by `tax_group_sequence, tax_category` (`:75-90`).
- `save_value(array &$data, $id = NEW_ENTRY)`: insert-or-update by id, writes
  back `tax_category_id` on insert (`:107-124`).
- `save_categories(array)`: transaction; upsert each; `not_to_delete` tracks new
  ids written back by reference; soft-delete everything else (`:129-163`).
- `delete` / `delete_list` soft-delete (`:168-185`).
- `search` `LIKE tax_category`, `deleted = 0` (`:198-229`); suggestions
  `LIKE %term%` (`:235-253`); `get_empty_row` with id `-1` (`:258-268`).

**Controller** `Tax_categories.php`:
- `getView` renders `taxes/tax_category_form` (`:72-77`) — **file missing**.
- `postSave` includes `tax_category_code` which is **not a column**
  (`:84-114`); `save_value` uses the query builder directly
  (`Tax_category.php:109-123`), so this would raise `Unknown column`. The route
  is reachable only from the broken view.
- `postDelete` soft-deletes by id list (`:119-131`).

**Manage-tab path** (the working one): `Taxes::postSave_tax_categories`
(`app/Controllers/Taxes.php:554-593`) posts parallel arrays
`tax_category_id[]`, `tax_category[]`, `tax_group_sequence[]`, validates
`max_length[255]|unicode_alpha_numeric_punct` on `tax_category.*`, and calls
`save_categories`. The JS enforces non-empty, no underscores, no duplicates, and
at least one row (`app/Views/taxes/tax_categories.php:37-125`);
`partial/tax_categories.php:17-44` renders the inputs.

### 5.3 Tax jurisdictions

**Model** `app/Models/Tax_jurisdiction.php`:
- `$primaryKey = 'cashup_id'` (`:16`) — copy/paste bug, harmless because all
  queries key on `jurisdiction_id`.
- Fields `jurisdiction_name, tax_group, tax_type, reporting_authority,
  tax_group_sequence, cascade_sequence, deleted` (`:19-27`).
- `get_all` orders by name (`:78-93`).
- `save_value(array &$data, $id = NEW_ENTRY)` (`:110-125`) — writes back
  `jurisdiction_id` on insert.
- `save_jurisdictions(array)`: transaction; upsert; soft-delete everything not
  posted (`:130-168`). Same reference-writeback pattern as categories.
- `delete` / `delete_list` soft (`:173-190`).
- `search` `LIKE jurisdiction_name OR LIKE reporting_authority`, `deleted = 0`
  (`:203-237`).
- `get_empty_row` defaults `tax_type = '1'` (EXCLUDED) (`:242-256`).

**Manage-tab path**: `Taxes::postSave_tax_jurisdictions`
(`app/Controllers/Taxes.php:489-546`) posts
`jurisdiction_id[]`, `jurisdiction_name[]`, `tax_group[]`, `tax_type[]`,
`reporting_authority[]`, `tax_group_sequence[]`, `cascade_sequence[]`.
Validation:
- `max_length[255]|unicode_alpha_numeric_punct` on `jurisdiction_name.*`
  (`:499-514`).
- **Uniqueness of `tax_group` across the submitted rows** (`:530-537`), error
  `Taxes.tax_group_not_unique` with the offending group. This is the only
  uniqueness rule in the whole tax configuration and it exists because
  `tax_group` is the aggregation/print identity.
- No validation of `tax_type` domain, sequence ranges, or that
  `cascade_sequence` is monotonic.

**Per-entity controller** `Tax_jurisdictions.php` is broken: `postSave` builds
only `jurisdiction_name` + `reporting_authority` and calls
`save_value($data)` **without the id argument** (`:87-115`), so editing always
inserts a new row; `getView` renders the missing
`taxes/tax_jurisdiction_form` (`:75-80`).

**View defect**: `app/Views/partial/tax_jurisdictions.php:48` uses
`form_dropdown('tax_type[]' . $i, ...)`, producing `name="tax_type[]1"` — not
PHP array syntax. `getPost('tax_type')` in the bulk save therefore yields null
(or a scalar), and `$tax_type[$key]` in the loop
(`Controllers/Taxes.php:524`) cannot work. The jurisdictions tab cannot round-trip
`tax_type` as shipped. The target must implement the intended design (a per-row
`tax_type` select posting `tax_type[]`), not the literal bug.

### 5.4 Tax rates

**Model** `app/Models/Tax.php` (table `tax_rates`):
- Fields `rate_tax_code_id, rate_tax_category_id, rate_jurisdiction_id,
  tax_rate, tax_rounding_code`; no soft delete (`:18-24`).
- `get_info($tax_rate_id)`: LEFT JOIN `tax_codes`, `tax_categories`,
  `tax_jurisdictions`; empty object with defaults on miss (`:61-112`).
- `get_taxes($tax_code_id, $tax_category_id)`: the computation query (§3.9),
  ordered `cascade_sequence, tax_group, jurisdiction_name, group sequence sum`
  (`:117-131`). Returns `[]` on query failure.
- `get_rate_info($code_id,$category_id)`: joins categories, expects 1 row, else
  an object with blank properties (`:136-162`).
- `save_value(array &$data, $id = NEW_ENTRY)` insert-or-update (`:167-185`).
- `delete($id)` / `delete_list(array)` — **hard delete** (`:190-206`).
- `search()` — `LIKE rate_tax_code` on a **column that no longer exists**
  (renamed `rate_tax_code_id` in 3.3.0) plus `orLike tax_code_name`; any non-empty
  search raises a SQL error (`:219-267`).
- `get_tax_code_type_name()` maps `'0'` → `Taxes.tax_included`, else
  `Taxes.tax_excluded` (`:273-280`) — unused legacy.
- `get_tax_category($id)` (`:286-293`); `get_all_tax_categories()` ordered by id
  (`:298-304`); `get_tax_category_id($name)` ignores its parameter and returns
  the first row (`:310-316`, dead).
- `get_tax_category_usage($category_id)` counts `tax_rates` rows
  (`:50-56`) — the "is this category used" probe; never called by the controller.

**Controller** `Taxes.php`:
- `getIndex` builds the tabbed manage page from all four models, `get_empty_row`
  fallbacks, `Rounding_mode::get_rounding_options()`, default tax type from
  `config.tax_included` (`:42-72`).
- `getSearch` (DataTables AJAX) uses `sanitizeSortColumn(...,
  get_tax_rates_manage_table_headers(), 'tax_rate_id')` (`:79-97`).
- `getRow($id)` (`:128-133`).
- `getView($tax_rate_id)` — the working edit dialog, renders
  `taxes/tax_rates_form` with code/category/jurisdiction option maps, default
  config ids for a new rate, `HALF_UP` and `'0.0000'` (`:204-231`).
- `postSave($tax_rate_id)` (`:373-403`):
  - `parse_tax(getPost('tax_rate'))` then **reject negative** with
    `Taxes.tax_rate_non_negative` (`:376-380`).
  - No check that `rate_tax_code_id`/`rate_tax_category_id`/
    `rate_jurisdiction_id` exist or are non-zero.
  - No uniqueness check on `(code, category, jurisdiction)`; duplicates are
    permitted by the 3.3.0 DDL (no unique key) and simply produce two tax rows
    for the same code/category.
- `postDelete` calls `delete_list` on `ids` (hard delete) (`:408-417`).
- `suggest_search` calls a non-existent `Tax::get_search_suggestions`
  (`:103-109`) — fatal route.
- `getView_tax_codes`, `getView_tax_categories`, `getView_tax_jurisdictions`
  (`:139-359`) all call `$this->tax->get_tax_code_rate_exceptions($tax_code)`,
  which **does not exist** (TODO notes it was deleted in upstream commit
  3220469). All three routes fatal. They also read `rate_tax_code` and
  `rounding_code` properties that `Tax::get_info` never selects.
- `get_html_rounding_options()` static wrapper (`:364-367`).

**Views**:
- `app/Views/taxes/tax_rates_form.php`: dropdowns for code, category,
  jurisdiction; `tax_rate` text input with `%` addon; rounding dropdown from
  `$rounding_options` (`:18-63`). Submits `taxes/save/$tax_rate_id`
  (`:18`). No client rules (`rules: {}`).
- `app/Views/taxes/tax_rates.php`: DataTables init with `uniqueId:
  'tax_rate_id'`, delete button (`:9-37`).
- `app/Views/taxes/manage.php`: four tabs in order Codes, Jurisdictions,
  Categories, Rates (`:13-49`).

### 5.5 Table helpers

`app/Helpers/tax_helper.php` renders DataTables headers/rows:
- Codes: headers Code/Name/City/State (`:12-22`); row includes an unused
  `tax_code_type` key (`:34`) and the edit anchor (`:37-45`).
- Categories: Name/Code/Sequence (`:52-61`); row includes `tax_category_code`
  (`:73`) which the table does not have.
- Jurisdictions: Id/Name/Authority (`:90-99`), row (`:104-122`).
- Rates: Code/Name/Jurisdiction/Category/Rate/Rounding name (`:127-139`); row
  resolves `Rounding_mode::get_rounding_code_name` (`:156`).
- `transform_headers`/`anchor` come from `app/Helpers/tabular_helper.php`.

### 5.6 Deletion constraints summary

| Entity | Delete kind | Blocked by FK? | Upstream usage check |
|---|---|---|---|
| tax_codes | soft (`deleted=1`) | no | none |
| tax_categories | soft | no | `Tax::get_tax_category_usage` exists, never called |
| tax_jurisdictions | soft | no | none |
| tax_rates | hard | no (inbound FKs are from nothing) | none |
| items_taxes | hard, full replace per item | cascade from items | n/a |

Deleted codes/categories/jurisdictions disappear from option lists and from
matching (`Tax_code.php:242,254`), but historical `sales_taxes` rows keep their
FK ids (no `ON DELETE` cascade for those joins; reports LEFT JOIN and show nulls).

### 5.7 Target CRUD surface

| Path | What it does |
|---|---|
| `src/app/(secure)/taxes/page.tsx:8-36` | one flat table of `tax_code_links` joined to code/category/jurisdiction; no tabs, no codes/categories/jurisdictions management in the same page |
| `src/app/(secure)/taxes/actions.ts:10-31` | upsert one link; requires all three ids non-zero; parses rate/round/cascade; **no negative-rate check**; redirects to the edit page |
| `src/app/(secure)/taxes/actions.ts:33-38` | hard delete |
| `src/app/(secure)/taxes/new/[id]/page.tsx:7-19` | loads one link + option lists |
| `src/components/taxes/tax-rate-form.tsx:24-68` | selects for code/category/jurisdiction, numeric rate/round/cascade, no rounding-name dropdown, no validation |
| `src/app/(secure)/tax_codes/*` | list + simple form (code/name/city/state), soft delete; no `tax_code_type`, no links editor |
| `src/app/(secure)/tax_categories/*` | list + form (name, `taxGroupSeq` as text) |
| `src/app/(secure)/tax_jurisdictions/*` | list + form; `taxType` is a **free-text** input (`src/components/taxes/tax-jurisdiction-form.tsx:26-28`) instead of a select of included/excluded; exposes `taxableAmount` and `taxRate` directly on the jurisdiction (not upstream columns) |

Target permissions: all pages call `requirePermission("taxes")`
(`src/app/(secure)/tax_codes/page.tsx:9`, `tax_categories/page.tsx:9`,
`tax_jurisdictions/page.tsx:9`, `taxes/page.tsx:9`), while some server actions
use distinct ids `tax_codes` / `tax_categories` / `tax_jurisdictions`
(`src/app/(secure)/tax_codes/actions.ts:38-41`,
`tax_categories/actions.ts:36-37`, `tax_jurisdictions/actions.ts:42-43`).
Seed grants define only `taxes` (`src/db/seed.ts:122,162`), so those extra ids
resolve only if the permission layer treats unknown ids as granted/denied
consistently — see U4.

---

## 6. Destination matching — precedence and fallback chain

### 6.1 Inputs

`apply_destination_tax` receives (`Tax_lib.php:300`):
- `$city`, `$state` from `$customer_info->city` / `->state`. `Customer::getInfo`
  joins `people` (`app/Models/Customer.php:92-102`), so these are the customer's
  address fields, not the store's.
- `$sales_tax_code_id` from `$customer_info->sales_tax_code_id`.
- `$register_mode` from `Sale_lib::get_mode()`.
- `$item['tax_category_id']` from the cart line (or the config default, §3.5).

### 6.2 Mode table

| `register_mode` | Customer code | Matching | Result |
|---|---|---|---|
| `sale` | ignored | none | `config.default_tax_code` |
| `return` | non-null, non-zero | none | customer's code |
| `return` | null / 0 | exact (city+state) → state-only → default | first unique match, else default |
| `sale_invoice` | same as return | same | same |
| `sale_quote` | same as return | same | same |
| `sale_work_order` | same as return | same | same |

Upstream has no "non-sale register" concept beyond the string compare at
`Tax_lib.php:375`. There is no store-location dimension in the lookup; the only
destination inputs are the customer address and code.

### 6.3 Fallback chain, exact

```
1. mode == 'sale'                       → default_tax_code                     (no DB)
2. customer code present (non-0)        → customer code                        (no DB)
3. tax_codes(city=cust.city, state=cust.state, deleted=0) has exactly 1 row
                                        → that tax_code_id
4. tax_codes(city='', state=cust.state, deleted=0) has exactly 1 row
                                        → that tax_code_id
5. otherwise                            → default_tax_code
```

`default_tax_code` itself may be `''` or `0`; upstream then queries
`tax_rates` with that value and gets `[]` (no tax), unless a rate row literally
has `rate_tax_code_id = 0`.

### 6.4 Target implementation

`src/lib/tax/index.ts:365-388`:

```
defaultCode = getConfigNumber("default_tax_code", 0)
if registerMode == "sale": return defaultCode
if salesTaxCodeId: return salesTaxCodeId
exact = taxCodes where city = clean(city) AND state = clean(state) AND deleted=false
     if exactly 1: return id
stateOnly = taxCodes where city = "" AND state = clean(state) AND deleted=false
     if exactly 1: return id
return defaultCode
```

Matches the chain structurally. Deviations:
1. `clean()` is applied to the lookup values (`:371-372`) but **not** on save
   (`src/app/(secure)/tax_codes/actions.ts:16-17` stores raw city/state), so a
   code saved as `"St. John's"` is matched as `"St. Johns"` and never found.
2. `getConfigNumber` coerces; upstream compares strings. A non-numeric
   `default_tax_code` (an empty string is typical) becomes 0 in target but `''`
   upstream — equivalent after the `!= -1 && price != 0` guard in practice.
3. `applyDestinationTax` returns `false` when `codeId` is falsy (`:293`) and when
   the item has no `taxCategoryId` (`:297`), and the caller then falls through to
   the classic engine (`:178-210`). Upstream does not fall through.
4. No default tax category substitution (`Tax_lib.php:150-152`).
5. No `item.price != 0` guard (`Tax_lib.php:307`).

---

## 7. Tax data model — final tables, columns, relations, migrations

### 7.1 Final upstream schema (3.4.3)

`tax_codes` (recreated at `3.3.0_indiagst.sql:21-29`):

| Column | Type | Notes |
|---|---|---|
| tax_code_id | int(11) PK AUTO_INCREMENT | 3.1.1 keyed by `tax_code`; changed in 3.3.0 |
| tax_code | varchar(32) NOT NULL | legacy uniqueness semantics only |
| tax_code_name | varchar(255) NOT NULL DEFAULT '' | |
| city | varchar(255) NOT NULL DEFAULT '' | |
| state | varchar(255) NOT NULL DEFAULT '' | |
| deleted | int(1) NOT NULL DEFAULT 0 | soft delete |

`tax_categories` (3.1.1 `:166-177`, `deleted` added 3.3.0 `:79-80`,
`tax_group_sequence` narrowed 3.4.0 `:112`):

| Column | Type |
|---|---|
| tax_category_id | int(10) PK (NOT auto-increment in the 3.1.1 DDL; 3.3.0 does not alter it) |
| tax_category | varchar(32) NOT NULL |
| tax_group_sequence | tinyint(1) NOT NULL |
| deleted | tinyint(1) DEFAULT 0 NOT NULL |

Note the PK is not AUTO_INCREMENT in the shipped DDL; inserts must supply
`tax_category_id` explicitly. `Tax_category::save_value` calls
`$builder->insert($tax_category_data)` with data that has **no**
`tax_category_id`, then `$this->db->insertID()`. In MySQL, inserting 0 into a
non-auto PK stores 0 and returns 0 for `insertID()`, so the first inserted
category gets id 0 and a second insert collides. This is an upstream defect
visible in fresh installs; fixtures assume category ids 1..n exist (seeded by
upgrades). See U2.

`tax_jurisdictions` (3.3.0 `:64-74`):

| Column | Type |
|---|---|
| jurisdiction_id | int(11) PK AUTO_INCREMENT |
| jurisdiction_name | varchar(255) NULL |
| tax_group | varchar(32) NOT NULL |
| tax_type | smallint(2) NOT NULL |
| reporting_authority | varchar(255) NULL |
| tax_group_sequence | tinyint(2) NOT NULL DEFAULT 0 |
| cascade_sequence | tinyint(2) NOT NULL DEFAULT 0 |
| deleted | int(1) NOT NULL DEFAULT 0 |

`tax_rates` (3.3.0 `:84-92`; replaces `tax_code_rates` which was keyed
`(rate_tax_code, rate_tax_category_id)` per `3.0.2_to_3.1.1.sql:143-150`):

| Column | Type |
|---|---|
| tax_rate_id | int(11) PK AUTO_INCREMENT |
| rate_tax_code_id | int(11) NOT NULL |
| rate_tax_category_id | int(10) NOT NULL |
| rate_jurisdiction_id | int(11) NOT NULL |
| tax_rate | decimal(15,4) NOT NULL DEFAULT 0.0000 |
| tax_rounding_code | tinyint(2) NOT NULL DEFAULT 0 |

Indexes/FKs added by `3.3.0_dbfix.sql`:
- `customers.sales_tax_code_id` → `tax_codes.tax_code_id`
- `tax_rates.rate_tax_category_id` → `tax_categories.tax_category_id`
- `tax_rates.rate_tax_code_id` → `tax_codes.tax_code_id`
- `tax_rates.rate_jurisdiction_id` → `tax_jurisdictions.jurisdiction_id`

`items`:
- `tax_category_id` int(10) NOT NULL DEFAULT 0 (`3.0.2_to_3.1.1.sql:114-115`),
  then **nullable** (`3.4.2_nullable_tax_category_id.sql:1-2`).
- `hsn_code` varchar(32) added (`3.3.0_indiagst.sql:35-36`).

`customers`:
- `taxable` int(1) NOT NULL DEFAULT 1 (`initial_schema.sql:98`).
- `tax_id` varchar(32) NOT NULL DEFAULT '' (`3.3.0_indiagst.sql:31-33`).
- `sales_tax_code_id` int(11) DEFAULT NULL (`3.3.0_indiagst.sql:33`).
- Legacy `sales_tax_code` varchar(32) NOT NULL DEFAULT '1'
  (`3.0.2_to_3.1.1.sql:129-130`), superseded by `sales_tax_code_id`.

`items_taxes` (initial `:225-235`): `item_id, name, percent decimal(15,4)`,
no PK, hard delete.

`tax_code_rates` (legacy, 3.1.1 only): dropped/renamed to `_backup` by 3.3.0
(`:82`) and dropped by `3.3.0_indiagst2.sql:6`.

`sales_items_taxes`:
- Original `(sale_id, item_id, line, name, percent)` (`initial_schema.sql:551-565`).
- 3.1.1 adds `tax_type, rounding_code, cascade_tax, cascade_sequence,
  item_tax_amount` and widens `percent` (`3.0.2_to_3.1.1.sql:180-186`).
- 3.3.0 adds `sales_tax_code_id, jurisdiction_id, tax_category_id` and **drops
  `cascade_tax`** (`3.3.0_indiagst.sql:38-42`).
- 3.4.0 narrows `tax_type`, `rounding_code`, `cascade_sequence` to tinyint
  (`3.4.0_database_optimizations.sql:83-86`).

`sales_taxes`:
- 3.1.1 shape `(sale_id, tax_type, tax_group, sale_tax_basis, sale_tax_amount,
  print_sequence, name, tax_rate, sales_tax_code varchar, rounding_code)` with
  PK `(sale_id, tax_type, tax_group)` (`3.0.2_to_3.1.1.sql:151-164`).
- 3.3.0 replaces it: surrogate PK `sales_taxes_id`, adds `jurisdiction_id`,
  `tax_category_id`, changes `sales_tax_code` → `sales_tax_code_id int`,
  keeps a non-unique index `(sale_id, print_sequence, tax_group)`
  (`3.3.0_indiagst.sql:44-62`).
- 3.4.0 narrows `print_sequence`/`rounding_code`
  (`3.4.0_database_optimizations.sql:88-90`).

Migration order that matters: `3.3.0_indiagst.sql` → `3.3.0_dbfix.sql` →
`3.3.0_indiagst1.sql` (supplier tax_id NOT NULL) → `3.3.0_indiagst2.sql`
(drop backups). Also `3.3.0_indiagst.sql:94-100` adds the
`reports_sales_taxes` permission and grant.

### 7.2 Relations

```
customers.sales_tax_code_id ──► tax_codes.tax_code_id
items.tax_category_id ──► tax_categories.tax_category_id
items_taxes.item_id ──► items.item_id
tax_rates.rate_tax_code_id ──► tax_codes.tax_code_id
tax_rates.rate_tax_category_id ──► tax_categories.tax_category_id
tax_rates.rate_jurisdiction_id ──► tax_jurisdictions.jurisdiction_id
tax_rates.(code, category, jurisdiction) is the effective composite key
   (no DB unique constraint since 3.3.0)
sales_items_taxes.(sale_id, item_id, line) ──► sales_items
sales_taxes.sale_id ──► sales.sale_id
```

### 7.3 Target schema mapping

`src/db/schema/taxes.ts` (SQLite) and `src/db/schema/mysql/index.ts:326-364`:

| Target table | Target columns | Upstream table | Missing / changed |
|---|---|---|---|
| `tax_categories` | `tax_category_id` PK autoincrement, `tax_category`, `tax_group_seq` **text**, `deleted` | `tax_categories` | `tax_group_sequence` should be tinyint numeric and participate in ordering; target never orders by it |
| `tax_codes` | `tax_code_id` PK autoincrement, `tax_code`, `tax_code_name`, `city`, `state`, `deleted` | `tax_codes` | columns match; **no uniqueness on `tax_code`** and lookup by code id only (upstream `save` keys on code) |
| `tax_jurisdictions` | `jurisdiction_id`, `jurisdiction_name`, `tax_type` **text**, `reporting_authority`, `taxable_amount` (extra), `tax_rate` (extra), `tax_group`, `round_code`, `cascade_sequence`, `deleted` | `tax_jurisdictions` | `tax_group_sequence` **missing**; `tax_type` should be numeric 0/1 or a constrained enum; `taxable_amount`/`tax_rate` are inventions with no upstream meaning |
| `tax_code_links` | surrogate `tax_code_link_id`, `tax_code_id`, `tax_category_id`, `jurisdiction_id`, `tax_rate`, `round_code`, `cascade_sequence` | `tax_rates` | surrogate key vs upstream `tax_rate_id`; no `deleted` (matches hard delete); no ordering guarantees |
| `items` | `tax_category_id` nullable (`src/db/schema/items.ts:20`), `hsn_code` | `items` | matches |
| `items_taxes` | `item_id`, `name`, `percent` real (`src/db/schema/items.ts:28-32`) | `items_taxes` | matches |
| `customers` | `taxable` boolean default true, `sales_tax_code_id` FK (`src/db/schema/customers.ts:9,13`) | `customers` | **`tax_id` missing everywhere in target** |
| `sales_items_taxes` | `sale_id, item_id, line, name, percent, item_tax_amount` (`src/db/schema/sales.ts:37-44`) | `sales_items_taxes` | missing `tax_type, rounding_code, cascade_sequence, sales_tax_code_id, jurisdiction_id, tax_category_id` |
| `sales_taxes` | `sale_id, tax_type, round_code, tax_group, sale_tax_basis, sale_tax_amount` (`src/db/schema/sales.ts:46-53`) | `sales_taxes` | missing `sales_taxes_id`, `print_sequence`, `name`, `tax_rate`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id`; `round_code` should be `rounding_code` |

SQLite DDL: `drizzle/sqlite/0000_skinny_power_man.sql:297-306` (sales_items_taxes),
`:319-327` (sales_taxes), `:329-334` (tax_categories), `:336-344`
(tax_code_links), `:346-353` (tax_codes), `:355-367` (tax_jurisdictions).
`drizzle/sqlite/0002_slow_madame_web.sql:1` adds `customers.sales_tax_code_id`
with an FK. No later migration alters any tax table.

---

## 8. Reporting integration

### 8.1 Upstream reports that consume tax data

**Summary_taxes** (`app/Models/Reports/Summary_taxes.php`), permission
`reports_taxes` (`app/Controllers/Reports.php:95`):
- Columns `tax_name, tax_percent, report_count, subtotal, tax, total`
  (`:17-27`).
- Data builds a subquery over `sales_items` LEFT JOIN `sales_items_taxes` on
  `(sale_id, item_id, line)` (`:59-88`), computing:
  - `sale_amount` = qty×price−discount with `ROUND(..., totals_decimals)` for
    percent discounts (`:45-47`);
  - `sale_tax = IFNULL(sales_items_taxes.item_tax_amount, 0)` (`:49`);
  - if `config.tax_included`: `subtotal = ROUND(sale_amount − sale_tax, d)`,
    else `subtotal = ROUND(sale_amount, d)` (`:51-55`);
  - `tax = ROUND(sale_tax, d)`, `total = subtotal + tax` (`:56-57`).
- Outer aggregation groups by `percent, name` and re-rounds sums to
  `totals_decimals` (`:90-99`), counts `DISTINCT sale_id` (`:92`).
- `getSummaryData` sums rows with float arithmetic and rounds (`:102-125`).
- Filter: `sales.sale_status = COMPLETED` (`:31`).
- Consequence: rows are keyed by **tax name + percent**, so a destination tax
  and a classic tax with the same name/percent merge; included and excluded
  taxes are not distinguished.

**Summary_sales_taxes** (`app/Models/Reports/Summary_sales_taxes.php`),
permission `reports_sales_taxes` (`Reports.php:96`, permission added at
`3.3.0_indiagst.sql:94-100`):
- Columns `reporting_authority, jurisdiction_name, tax_category, tax_rate, tax`
  (`:20-29`).
- Joins `sales_taxes` → `sales` → `tax_categories` → `tax_jurisdictions` using
  `sales_taxes.tax_category_id` / `.jurisdiction_id` (`:55-69`), groups by those
  four fields, sums `sale_tax_amount`.
- This report is **only meaningful for destination mode**, since classic rows
  persist null jurisdiction/category ids (`Tax_lib.php:142-144`).
- It filters on `sales.sale_status = COMPLETED` in `_where` (`:38`) but its
  `getData` date filters reference `sale_time` unqualified after the join
  (`:57-63`) — ambiguous column risk.

**Summary_report** base (`app/Models/Reports/Summary_report.php`) — used by all
summary reports (sales, items, customers, …):
- Builds temp table `sales_items_taxes_temp` with per-line
  `SUM(ROUND(item_tax_amount, d)) AS tax`, plus `internal_tax` (tax_type = 0) and
  `sales_tax` (tax_type = 1) (`:44-63`). Note it reads the raw column names
  `tax`, `sales_tax`, `internal_tax` from `sales_items_taxes` in later queries
  (`:32,85,142-144`) even though the physical columns are `item_tax_amount`,
  `tax_type`; the temp table aliases make those names exist.
- If `config.tax_included`: `sale_total = ROUND(SUM(price),d) + cash_adjustment`
  and `sale_subtotal = sale_total − sales_tax` (`:36-38`); else
  `sale_subtotal = ROUND(SUM(price),d) + cash_adjustment` and
  `sale_total = ... + sales_tax + cash_adjustment` (`:39-42`).
- So report subtotals are **net of included tax** and totals are gross.

**Detailed_sales** (`app/Models/Reports/Detailed_sales.php`):
- `sales_items_temp` carries `tax` per sale; `SUM(tax)` appears in the summary
  query (`:40-125`), per-item details (`:115`), and grand totals (`:219`).
- The `sales_items_temp` build is in `app/Models/Reports/Detailed_sales.php` and
  `Sale::create_temp_table_sales_items_taxes_data` (see `Sale.php:1087-1110`),
  which rounds `item_tax_amount` to `totals_decimals` and splits
  `tax_type = 0` into `internal_tax`.

### 8.2 Receipts and invoices

- Receipt views print `taxes` from the saved rows, ordered by `print_sequence`
  (`Sale::get_sales_taxes`, `app/Models/Sale.php:770-779`;
  `Views/sales/invoice.php:176-180` uses `to_currency_tax`).
- `_load_sale_data` sets `$data['taxes'] = $this->sale->get_sales_taxes($sale_id)`
  (`Sales.php:1216`) but computes totals from a **fresh** `get_taxes(...,
  $sale_id)` (`:1215,1225`).
- `receipt_show_taxes` config gates printing in the templates
  (`initial_schema.sql:42`).

### 8.3 Target reporting state

`src/lib/reports/registry.ts`:
- `summary_taxes` (`:247-259`) executes
  `SELECT st.name AS tax_name, SUM(st.amount) AS total FROM sales_taxes st ...`
  — **neither `name` nor `amount` exists** in target `sales_taxes`
  (`src/db/schema/sales.ts:46-53`), so the report throws at runtime. It also
  omits percent, count, subtotal and the included/excluded split; grouping is by
  name only.
- `summary_sales_taxes` (`:444-461`) executes
  `SELECT sit.name, COUNT(*), SUM(sit.item_tax_amount) FROM sales_items_taxes ...`
  grouping by name. This runs, but it is a name-only approximation of upstream's
  authority/jurisdiction/category/rate grouping because the columns are absent.
- No equivalent of upstream `Summary_report`'s included-tax netting: other
  target report SQL sums `sales_items` prices without subtracting included tax
  (e.g. `summary_categories` at `:235-245`).
- Permission names are `reports_taxes` for both; upstream uses
  `reports_taxes` and `reports_sales_taxes` separately (`Reports.php:95-96`).

Target receipt/PDF: `getSaleTaxes` returns rows
(`src/lib/sale/sale-model.ts:307-311`), the receipt renders
`Tax {t.taxGroup}` (`src/app/(secure)/sales/receipt/[id]/page.tsx:51-53`), and
`buildReceiptData` maps `name: t.taxGroup` (`src/lib/pdf/data.ts:36`). Since
`taxGroup` currently stores the composite key `X10-VAT`, receipts will print
`Tax X10-VAT` rather than a human name — another consequence of G2/G9.

---

## 9. Worked fixtures

Config for all fixtures unless stated: `tax_included = 0`, `currency_decimals = 2`,
`tax_decimals = 2`, `use_destination_based_tax` as noted, `bcscale = 4`.
"Basis" is `get_item_total(q, price, discount, discount_type, true)` at scale 4.
"Group amount" is the value **after** `round_taxes` (i.e. what is persisted and
printed). `S` = subtotal, `T` = total as assembled by
`Sale_lib::get_totals` (`app/Libraries/Sale_lib.php:693-742`).

### F1 — No tax at all (classic)

Item 100.00 × 1, no `items_taxes` rows, `default_tax_1/2_*` empty
(upstream ignores the config keys anyway).

| quantity | price | basis | tax_info | groups | itemTaxes |
|---|---|---|---|---|---|
| 1 | 100.00 | 100.0000 | [] | {} | [] |

`taxed_flag = nontaxed_ind`. S = 100.00, T = 100.00.

### F2 — Single excluded tax

Item 100.00 × 1, item tax `VAT 8%`.

```
bcdiv('8','100') = 0.0800 ; bcmul(100.0000,0.0800) = 8.0000
get_tax_for_amount → round_number(HALF_UP, 8.0000, 2) = 8.00
group key = clean('X8% VAT') = 'X8-VAT'
```

| group key | tax_type | basis | amount | print_sequence |
|---|---|---|---|---|
| X8-VAT | 1 | 100.0000 | 8.00 | 1 |

S = 100.00, T = 108.00. `sales_items_taxes` row: name VAT, percent 8.0000,
tax_type 1, rounding_code 1, cascade 0, amount 8.00.

### F3 — Two additive classic taxes (no cascade)

Item 200.00 × 1 (`qty 2 × 100`), taxes `State 5%`, `Local 7.5%`.

| group | basis | amount |
|---|---|---|
| X5-State | 200.0000 | 10.00 |
| X7.5-Local | 200.0000 | 15.00 |

Note both bases stay 200.0000 — the classic engine never compounds. S = 200.00,
T = 225.00. Print sequences: 1 and 3 (same line, `+= 1` twice per tax).

### F4 — Destination compound, two levels

Destination mode. Code C, category 1, jurisdictions:
`State EXCLUDED 10% seq 0 cascade 0`, `Local EXCLUDED 5% seq 0 cascade 1`.
Item 100.00 × 1.

```
level 0: basis 100.0000 → 10.0000 (HALF_UP 2 = 10.00); cascade_tax_amount = 10.0000
level 1: cascade changed → basis = bcadd(100.0000, 10.0000) = 110.0000
         5% of 110 = 5.5000 → 5.50; cascade_tax_amount = 15.5000
```

| group | basis | amount |
|---|---|---|
| State | 100.0000 | 10.00 |
| Local | 110.0000 | 5.50 |

S = 100.00, T = 115.50.

### F5 — Destination compound, three levels

10% (cascade 0), 5% (cascade 1), 2% (cascade 2) on 100.00.

```
lvl0: 10.00                       basis 100.0000
lvl1: basis 110.0000 → 5.50       cascade 15.5000
lvl2: basis bcadd(110.0000,15.5000)=125.5000 → 2.5100 → 2.51
```

| group | basis | amount |
|---|---|---|
| A | 100.0000 | 10.00 |
| B | 110.0000 | 5.50 |
| C | 125.5000 | 2.51 |

T = 118.01. Detail rows sum to 10.00+5.50+2.51 = 18.01 = T − S.

### F6 — Tax included, exact divisor

`tax_included = 1`, item tax `VAT 10%`, price 110.00 × 1.

```
gross = 110.0000; factor = (100+10)/100 = 1.1000
net = bcdiv(110,1.1000) = 100.0000; tax = 10.0000
round_taxes (tax_included) → tax_decimals 2 → 10.00
```

S = 110.00 − 10.00 = 100.00; T = 110.00; `tax_total` = 0.00 (included taxes are
not added to `tax_total`, only subtracted from subtotal, `Sale_lib.php:732-737`).

### F7 — Tax included, repeating decimal (truncation at bcscale)

`tax_included = 1`, `VAT 8.25%`, price 100.00 × 1.

```
factor = 1.0825
net = bcdiv(100,1.0825) = 92.3787   (100/1.0825 = 92.37875…, truncated at 4)
tax = bcsub(100,92.3787) = 7.6213   → round 2 → 7.62
```

S = 100.00 − 7.62 = 92.38; T = 100.00.

### F8 — Exempt customer

`customers.taxable = 0`; item has `VAT 10%`, price 100.00.

Upstream: entire block skipped → groups `{}`, itemTaxes `[]`, **no**
`taxed_flag` written. S = 100.00, T = 100.00. Persist gate
(`Sale.php:683-686`) writes no tax rows.

### F9 — Destination exact city+state match

Destination mode, `register_mode = return`, customer city `Austin`, state `TX`,
`sales_tax_code_id = NULL`. Codes: `(city='Austin', state='TX') → code 5`.

`get_applicable_tax_code` → customer code null → `get_sales_tax_code` q1 matches
exactly one → code 5. Code 5 category 1 has one jurisdiction `TX 8% EXCLUDED`.
Item 100.00.

Group `X8-TX` basis 100.0000 amount 8.00. S = 100.00, T = 108.00.

### F10 — Destination state-only fallback

Same as F9 but customer city `Dallas` (no exact row) and a row
`(city='', state='TX') → code 6` (8%): q1 returns 0 rows, q2 returns exactly
one → code 6 → 8.00. If q2 also has two rows, fall through to
`config.default_tax_code`.

### F11 — Destination default fallback

No code rows for the address and no customer code. `default_tax_code = 2`, code
2/category 1 has `Default 10% EXCLUDED` → tax 10.00 on 100.00. In plain `sale`
mode this path is taken **unconditionally** (customer code ignored), so F11 is
also the outcome of every `sale`-mode cart in destination mode.

### F12 — Mixed lines (one taxed, one not)

Classic. Line 1: item 9001, qty 2 × 50, tax `A 10%` → basis 100.0000, tax 10.00.
Line 2: item 9002, no taxes → nothing, `taxed_flag = nontaxed_ind`.

| group | basis | amount | print_sequence |
|---|---|---|---|
| X10-A | 100.0000 | 10.00 | 1 |

Only line 1 has an `itemTaxes` row. S = 150.00, T = 160.00.

### F13 — Multi-line aggregation into one group

Classic, two lines both `A 10%`:
line 1: 2 × 50 = 100.0000 → 10.0000; line 2: 1 × 30 = 30.0000 → 3.0000.

`update_taxes` first insert (line 1) stores basis 100.0000 amount 10.0000,
print_sequence 1; the second call accumulates:
`bcadd(100.0000,30.0000,4) = 130.0000`, `bcadd(10.0000,3.0000,4) = 13.0000`.
`round_taxes` → 13.00.

| group | basis | amount | print |
|---|---|---|---|
| X10-A | 130.0000 | 13.00 | 1 |

S = 130.00, T = 143.00. Note the group amount (13.00) equals the sum of detail
amounts (10.00 + 3.00) here because `tax_decimals == currency_decimals`.

### F14 — Discount before tax, percentage

Classic, price 100.00 × 2, discount 10% (`discount_type = 0`), tax `VAT 8%`.

```
extended = bcmul(2,100)           = 200.0000
discount = bcmul(200, bcdiv(10,100)=0.1000) = 20.0000 → round(totals 2, HALF_UP) = 20.00
basis    = bcsub(200.0000, 20.00) = 180.0000
tax      = bcmul(180.0000, 0.0800) = 14.4000 → 14.40
```

S = 180.00, T = 194.40, `total_discount` = 20.00.

### F15 — Discount before tax, fixed

Classic, qty 3 × 100.00, discount 10 fixed (`discount_type = 1`), `VAT 8%`.

```
discount = bcmul(3,10) = 30.0000 → round 2 → 30.00
basis    = 300.0000 − 30.00 = 270.0000
tax      = 270.0000 × 0.0800 = 21.6000 → 21.60
```

S = 270.00, T = 291.60.

### F16 — Rounding modes at d = 2 on 2.345 (basis 46.90 × 5%)

`bcdiv('5','100') = 0.0500`; `bcmul(46.9000,0.0500) = 2.3450`.
`round_number(mode, 2.345, 2)`:

| mode | code | upstream result | target `roundNumber` result |
|---|---|---|---|
| HALF_UP | 1 | 2.35 | 2.35 (positive case agrees) |
| HALF_DOWN | 2 | 2.34 | 2.34 |
| HALF_EVEN | 3 | 2.34 | 2.34 |
| HALF_ODD | 4 | 2.35 | 2.35 |
| ROUND_UP | 5 | 2.35 | 2.35 |
| ROUND_DOWN | 6 | 2.34 | 2.34 |
| HALF_FIVE | 7 | 2.35 | 2.35 (coincides here; see 4.2 for a disagreeing case) |

### F17 — Rounding modes at d = 2 on −2.345 (negative return line)

Same basis with negated quantity/price: `S = −234.5`, `f = floor(−234.5) = −235`,
`c = ceil(−234.5) = −234`, tie.

| mode | code | upstream | target |
|---|---|---|---|
| HALF_UP | 1 | −2.35 | **−2.34** (bug) |
| HALF_DOWN | 2 | −2.34 | **−2.35** (bug) |
| HALF_EVEN | 3 | −2.34 | −2.34 |
| HALF_ODD | 4 | −2.35 | −2.35 |
| ROUND_UP | 5 | −2.34 | −2.34 |
| ROUND_DOWN | 6 | −2.35 | −2.35 |
| HALF_FIVE | 7 | −2.35 | **−2.345** (bug) |

### F18 — Rounding modes where target HALF_FIVE disagrees (positive)

`roundNumber(1.234, HALF_FIVE, 2)`: upstream = `round(0.2468,2,HALF_EVEN)*5 =
0.25*5 = 1.25`; target = `Math.round(123.4*2)/200 = 247/200 = 1.235`.

Cash-rounding fixture: total 108.23, `cash_decimals = 2`,
`cash_rounding_code = 7` → upstream `round(21.646,2,HALF_EVEN)*5 = 21.65*5 =
108.25`; target applies `roundNumber(108.23, HALF_UP, 2)` = 108.23.

### F19 — Rate precision beyond 2 decimals (bc truncation vs float)

Rate 6.875% on basis 100.0000, `tax_decimals = 2`:

```
upstream: bcdiv('6.875','100') = 0.0687 (truncated at scale 4)
          bcmul(100,0.0687)     = 6.8700 → 6.87
target:   100 * (6.875/100)     = 6.875  → round HALF_UP 2 → 6.88
```

Difference 0.01 per line. This fixture should be captured because real GST/VAT
rates with three decimals exist (e.g. 8.875% NYC MCTD).

### F20 — Negative return line, whole-line

Classic mode, return of one unit at 100.00 with `VAT 8%`.
Cart quantity = −1 (upstream `Sale_lib::return_entire_sale` passes
`-$row->quantity_purchased`, `app/Libraries/Sale_lib.php:1327`).

```
basis = bcmul(-1,100) = -100.0000 ; tax = bcmul(-100,0.0800) = -8.0000
round_taxes → -8.00
```

S = −100.00, T = −108.00, `taxed_flag = taxed`.

### F21 — Destination mixed included + excluded on one line

Destination, `tax_included = 0` (global). Rate 1 `INCLUDED 10%`, rate 2
`EXCLUDED 5%` (cascade 0, or cascade 1 — the excluded amount never affects the
included extraction either way because included uses the gross line total).
Price 100.00.

```
included: gross 100.0000 / 1.1000 = 90.9090 (bcdiv scale 4)
          tax = 100.0000 − 90.9090 = 9.0910 → round_taxes (currency d=2) → 9.09
excluded: basis 100.0000 × 0.0500 = 5.0000 → 5.00
```

| group | type | basis | amount |
|---|---|---|---|
| VAT | 0 | 100.0000 | 9.09 |
| GST | 1 | 100.0000 | 5.00 |

`Sale_lib::get_totals`: subtotal = 100.00 − 9.09 = 90.91; total =
100.00 + 5.00 = 105.00; `tax_total` = 5.00. This is the India-GST-style case the
3.3.0 schema exists for.

### F22 — Destination per-rate rounding then cascade

Rates: `A 10% ROUND_UP cascade 0`, `B 5% HALF_UP cascade 1`. Price 46.91.

```
A: bcmul(46.9100,0.1000) = 4.6910 → ROUND_UP 2 = 4.70
cascade: basis = bcadd(46.9100,4.7000) = 51.6100
B: bcmul(51.6100,0.0500) = 2.5805 → HALF_UP 2 = 2.58
```

Groups: A basis 46.9100 amount 4.70 (round_taxes HALF_UP → 4.70); B basis
51.6100 amount 2.58. S = 46.91, T = 54.19.

### F23 — Zero-priced line in destination mode

Item price 0.00 with a valid code and category.

Upstream: `$item['price'] != 0` fails → no definition query, no detail rows,
`taxed = false` → flag nontaxed. Target: enters `applyDestinationTax`, appends
detail rows with amount 0 and returns `true` (marks taxed) if links exist
(`src/lib/tax/index.ts:293-362` — no early price guard, unconditional
`return true`).

### F24 — Two rates from different jurisdictions sharing rate+group name

Rate `8%` from two jurisdictions both with `tax_group = 'NY'`, code C, category 1.

Upstream: both rows produce key `X8-NY`; second call accumulates basis and
amount into the first group, so the group shows `basis = 2 × line_basis` and
`amount = 2 × 8% × line_basis`, while **two** detail rows exist. `print_sequence`
stays from the first. This is the intended way multi-jurisdiction same-name taxes
aggregate. Target's key `X8% NY` also collides, so the same accumulation happens,
but the key string differs and there is no ordering guarantee.

### F25 — Tax group name with spaces and punctuation

Item tax named `GST/HST (Ontario)` at 13%: upstream key =
`clean('X13% GST/HST (Ontario)')` → `X13-GSTHST-Ontario`. Target key =
`X13% GST/HST (Ontario)`. Two consequences: (a) keys are not equal across
engines; (b) report/print code that displays `taxGroup` shows the raw composite
in target.

### F26 — Included tax group amount vs detail sum drift

Classic, `tax_included = 1`, `VAT 8.25%`, two lines of 100.00 each.

Per line: `tax = 7.6213` (unrounded, stored in `sales_items_taxes` at decimal
15,4 → 7.6213). Group accumulation: `bcadd(7.6213,7.6213,4) = 15.2426`;
`round_taxes` with `tax_decimals = 2` → 15.24. The two detail rows sum to 15.2426
and are each reported at 7.62 by `Summary_report` (`ROUND(item_tax_amount,2)`),
giving 15.24 — consistent here. With three lines each 7.6213 the group is
22.8639 → 22.86, detail-rounded sum 22.86; with five lines 38.1065 → 38.11 vs
detail-rounded 5×7.62 = 38.10, a 0.01 report-vs-sale discrepancy inherent to
upstream. Document as a known upstream artifact, not a target bug.

---

## 10. Target gap analysis — file by file

Legend: **P** = parity break (must fix), **M** = missing feature, **D** = design
divergence needing a product decision, **X** = target-only extra.

### 10.1 `src/lib/tax/index.ts`

| Line | Finding | Class | Upstream reference |
|---|---|---|---|
| 37-70 | `roundNumber` wrong for negatives (HALF_UP/HALF_DOWN) and HALF_FIVE (see §4.2) | P | `Rounding_mode.php:70-85` |
| 72-82 | Rounding option labels/order correct; but no `getRoundingCodeName` equivalent (unknown→"Unknown") | M | `Rounding_mode.php:41-48` |
| 84-93 | `getTaxTypes` returns numeric map; upstream keys are strings and labels are "Tax excluded"/"Tax included"; `getTaxTypeOptions` order is INCLUDED first and labels "Included"/"Excluded" | P | `Tax_lib.php:52-58,460-475` |
| 95-105 | `getItemTotal` multiplies then applies discount; does **not** round the discount to `totals_decimals` before subtracting, and returns unrounded | P | `Sale_lib.php:1589-1599` + `1633-1643` |
| 107-111 | `getItemSalesTax` fine | — | `Tax_lib.php:63-71` |
| 113-115 | No bc truncation at 4 decimals before rounding | P | `Tax_lib.php:76-81` |
| 117-121 | `getIncludedTax` rounds inside, upstream does not | P | `Tax_lib.php:183-189` |
| 123-127 | Signature lacks `saleId`; no re-open path using saved `sales_items_taxes` | M | `Tax_lib.php:86,103-107` |
| 137-157 | Customer load: joins people for city/state (correct); returns early on `taxable === false` (correct); but no "customer id set, row missing ⇒ taxable=false" upstream quirk; no support for `salesTaxCodeId` when `customerId` is 0 | D | `Tax_lib.php:90-96` |
| 159-176 | Destination branch only when `line.taxCategoryId` truthy; no config default category; after `false` falls through to classic | P | `Tax_lib.php:148-155` |
| 178-201 | Classic "default tax 1/2" fallback invented at sale time | P (X) | upstream only at item create (`Items.php:398-411`) |
| 202-210 | If destination mode and the item has `items_taxes` rows, they are applied — upstream never does | P | `Tax_lib.php:148-155` |
| 212-247 | Classic loop: `cumulativeBasis` cascade code is dead/wrong (classic never cascades); detail rows lack `taxGroupSequence`, `salesTaxCodeId`, `jurisdictionId`, `taxCategoryId` | P/M | `Tax_lib.php:113-147` |
| 220 | Group key not `clean('X'+float(rate)+'% '+group)` | P | `Tax_lib.php:196` |
| 223-231 | Accumulation uses HALF_UP rounding at 4 instead of `bcadd(...,4)` truncation | D | `Tax_lib.php:223-224` |
| 234-243 | `line: idx + 1` instead of the cart line number; `ItemTax` lacks `taxGroupSequence` | P | `Tax_lib.php:135` |
| 250-253 | Final rounding not sorted by print sequence, and uses per-row tax type for decimals instead of global `tax_included` | P | `Tax_lib.php:263-267` |
| 258-267 | `updateTaxes` keyed by `taxGroup` string; upstream key is the cleaned composite; no `printSequence` | P | `Tax_lib.php:194-226` |
| 269-271 | `applyInvoiceTaxing` only sorts by `taxGroup` and does not recompute amounts | P | `Tax_lib.php:232-247` |
| 273-278 | `roundTaxes` no sort | P | `Tax_lib.php:252-294` |
| 280-363 | `applyDestinationTax`: no `orderBy`; no `price != 0` guard; no default category; returns `true` even when every amount is 0; detail rows omit jurisdiction/category/code/group sequence; group name uses `taxGroup ?? jurisdictionName` | P | `Tax_lib.php:300-364` |
| 365-388 | `getApplicableTaxCode` structurally correct; `clean()` applied to lookup only | P (D) | `Tax_code.php:233-263`, `Tax_lib.php:373-388` |
| 390-393 | `clean` is not upstream's `clean` | P | `Tax_lib.php:394-399` |
| 395-409 | Option builders return rows, not `{id: label}` maps with the empty sentinel; categories not ordered by group sequence | P/M | `Tax_lib.php:404-454` |
| 407-409 | `getTaxCategoryUsage` counts **items** (upstream's `Item::get_tax_category_usage` semantics) while a same-named function in the repository counts rates; upstream `Tax::get_tax_category_usage` counts rates | D | `Tax.php:50-56`, `Item.php:128-132` |
| 411-414 | `void` placeholders for unused imports — dead code | X | — |

### 10.2 `src/lib/taxes/repository.ts`

| Line | Finding | Class |
|---|---|---|
| 43-48 | Categories ordered by name, upstream by `tax_group_sequence` then name | P |
| 55-71 | No `tax_category_id` write-back on insert; no duplicate-name check; no `deleted:false` reset on update | M |
| 73-76 | Delete has no usage check (upstream also has none, but upstream exposes `get_tax_category_usage` for a future guard) | D |
| 84-89 | Codes ordered by name (matches) | — |
| 100-121 | `saveTaxCode` accepts `jurisdictions: TaxCodeLinkRow[]`, deletes and re-inserts links; no uniqueness on `tax_code`, no `tax_code_type` | M |
| 123-125 | Soft delete (matches) | — |
| 127-131 | Suggestions match only `taxCodeName`; upstream matches `tax_code OR tax_code_name` and returns `{value,label}` | P |
| 154-173 | Jurisdiction save writes `taxRate`/`taxableAmount` (target-only columns) and lacks `taxGroupSequence` | P/M |
| 180-184 | `getTaxCategoryUsage` counts links (upstream `Tax::get_tax_category_usage` does the same) | — |
| 186-192 | `getRateInfo` returns only the numeric rate, not the rounding code/type | M |
| 194-199 | `getTaxCategoryId(name)` — upstream equivalent `Tax::get_tax_category_id` is dead and broken | X |

### 10.3 `src/db/schema/taxes.ts`, `sales.ts`, `items.ts`, `customers.ts`

| Location | Finding | Class |
|---|---|---|
| `taxes.ts:4-9` | `tax_group_seq` is text; upstream tinyint sequence used for ordering | P |
| `taxes.ts:20-31` | `tax_jurisdictions` invents `taxable_amount` + `tax_rate`, lacks `tax_group_sequence`; `tax_type` text | P |
| `taxes.ts:33-41` | `tax_code_links` surrogate PK, no unique `(code,category,jurisdiction)` | D |
| `sales.ts:37-44` | `sales_items_taxes` missing 6 upstream columns (§7.3) | P |
| `sales.ts:46-53` | `sales_taxes` missing 7 columns and uses `round_code` instead of `rounding_code` | P |
| `items.ts:20` | `tax_category_id` nullable (matches 3.4.2) | — |
| `customers.ts:5-15` | `tax_id` absent; `sales_tax_code_id` present | M |

### 10.4 `src/lib/sale/*`

| Location | Finding | Class |
|---|---|---|
| `sale-lib.ts:447-451` | `getItemTotalForLine` calls `getItemTotalTaxExclusive(..., taxIncluded ? 1 : 0, taxPercent)` — when included it multiplies by 1 (no-op), when excluded it computes a price **with** tax; upstream's `get_item_total_tax_exclusive` subtracts each item tax from the total, it does not gross up the price | P |
| `sale-lib.ts:453-457` | `getTotal` always adds `taxTotal`, including included tax | P |
| `sale-lib.ts:473-510` | `getTotals` computes `total = subtotal + taxTotal` and never subtracts included tax from subtotal; no `prediscount_subtotal` rounding, no `cash_total`/`amount_due` split matching upstream, no `paid_in_full` threshold | P |
| `sale-lib.ts:492-497` | Cash rounding uses HALF_UP, ignoring `cash_rounding_code` | P |
| `sale-lib.ts:654-662` | Cash rounding activation requires `cash_decimals < totals_decimals`; upstream activates on `cash_rounding_code > 0` independent of decimals (`Sale_lib.php:1728-1734`, config semantics) | D |
| `sale-lib.ts:665-669` | `isCustomerTaxable` exists but is never used by `getTaxes` (getTaxes re-queries) | X |
| `sale-lib.ts:98-99,738-739,825-826` | `taxedFlag` initialised but never set by the tax engine | M |
| `types.ts:84-87` | `getItemTotalTaxExclusive` grosses up price by `taxPercent` instead of subtracting tax from a gross unit price; sign/scale wrong | P |
| `types.ts:115-124` | `getCartTotals` included-tax handling wrong (above) | P |
| `sale-model.ts:178-201` | Persists only 6 group fields and 6 detail fields | P |
| `sale-model.ts:307-320` | Readers return the reduced shapes | P |

### 10.5 `src/app/(secure)/sales/*` and receipts

| Location | Finding | Class |
|---|---|---|
| `sales/actions.ts:25,157,192` | always calls `getTaxes(cart.cart, cart.customerId, cart.mode)`; no `saleId`, so re-suspending a sale recomputes from live item taxes rather than saved ones | P |
| `sales/register/page.tsx:16-18` | displays totals from `getCartTotals`, which is wrong for included tax | P |
| `sales/receipt/[id]/page.tsx:51-53` | prints `Tax {taxGroup}` (composite key) | P |
| `src/lib/pdf/data.ts:36` | maps `name: t.taxGroup`, and `total` at `:22` ignores discounts and tax | P |

### 10.6 Tax CRUD UI/actions

| Location | Finding | Class |
|---|---|---|
| `taxes/actions.ts:10-31` | no negative-rate rejection (upstream `Taxes.php:376-380`) | P |
| `taxes/actions.ts:20` | requires code/category/jurisdiction non-zero (upstream allows blank/jurisdiction 0 and stores it) | D |
| `taxes/actions.ts:33-38` | hard delete (matches upstream) | — |
| `taxes/page.tsx:11-25` | flat list, no categories/codes/jurisdictions tabs | M |
| `components/taxes/tax-rate-form.tsx:57-60` | `roundCode` free number, not a dropdown of `get_rounding_options` names | M |
| `components/taxes/tax-code-form.tsx:17-33` | no `tax_code_type` field (upstream form references it but the column does not exist — implement only if adding the column) | D |
| `components/taxes/tax-jurisdiction-form.tsx:26-28` | `taxType` free text; should be included/excluded select | P |
| `components/taxes/tax-jurisdiction-form.tsx:34-40` | exposes `taxableAmount` and `taxRate` on jurisdictions — no upstream meaning; rate belongs on `tax_rates` | P (X) |
| `tax_categories/actions.ts:15-23` | `taxGroupSeq` text; no ordering use | P |
| `tax_codes/actions.ts:18` | requires both code and name, upstream allows blank name (`TaxesControllerTest.php:144-160`) | P |
| `tax_codes/actions.ts:37-42` etc. | imports placed after functions; distinct permission ids not seeded | D |
| `src/lib/config/tabs.ts:52-66` | missing `default_tax_jurisdiction`; `default_tax_code`/`category` are text not selectors; includes a non-upstream `default_tax_1_cumulative`; no negative-rate validation | M |
| `src/components/customers/customer-form.tsx:43-63` | no `sales_tax_code_id` selector, no `tax_id` | M |
| `src/app/(secure)/customers/actions.ts:26-46` | does not parse/save `salesTaxCodeId` or `taxId` | M |
| `src/components/items/item-form.tsx:173-195` | Tax 1/2 inputs are controlled and appended as JSON (works), but limited to 2, and hidden entirely in destination mode (matches upstream) | — |
| `src/components/items/item-form.tsx:198-206` | tax category select present only in destination mode (matches) | — |

### 10.7 Reports

| Location | Finding | Class |
|---|---|---|
| `src/lib/reports/registry.ts:255-259` | `sales_taxes.name` / `st.amount` do not exist → runtime error | P |
| `src/lib/reports/registry.ts:453-459` | name-only grouping; no authority/jurisdiction/category/rate; no `COMPLETED`-only filter issue (it has `sale_status = 0` which matches COMPLETED) | P |
| `src/lib/reports/registry.ts:247-249,444-446` | both reports use permission `reports_taxes`; upstream second is `reports_sales_taxes` | P |
| (absent) | no included-tax netting in any summary report | P |

### 10.8 Tests

| Location | Finding |
|---|---|
| `src/lib/tax/tax.test.ts:30-203` | 10 tests; none cover print sequence, group keys, excluded/included mixing, destination fallback chain, cascade 3 levels, negative amounts, all 7 rounding modes, persistence shape, or reports. Several tests encode the **wrong** behaviour (e.g. `:87-102` asserts the default-tax fallback; `:104-116` only asserts the early return). |
| `e2e/taxes.spec.ts:1-17` | only page-load smoke tests |
| `tests/Models/TaxTest.php` (upstream) | only asserts `get_taxes` returns `[]` on query failure (`:21-26`); no arithmetic coverage upstream either |
| `tests/Support/TaxFixtureTrait.php` | config payload fixture (rates 5/10, non-destination) |

---

## 11. Implementation obligations (ordered)

Each obligation names target files, the upstream contract it must satisfy, and
acceptance tests. "Fixture" refers to §9. No implementation is performed here.

### O1 — Fix `roundNumber` to exact upstream semantics

Files: `src/lib/tax/index.ts` (37-70).
Contract: §4.1. Implement all seven modes on **both signs**, including
`HALF_FIVE` as `roundHalfEven(value/5, decimals) * 5`. Keep the exported
signature `roundNumber(value, mode, decimals): number`.
Acceptance: unit table covering `{2.345, -2.345, 2.5, -2.5, 3.5, -3.5, 1.234,
-1.234}` × 7 modes at d = 0 and d = 2, compared against the PHP table in §4.1.
Fixtures F16, F17, F18.

### O2 — Reproduce `Tax_lib::clean` and the composite group key

Files: `src/lib/tax/index.ts` (`clean`, `getTaxes`, `applyDestinationTax`,
`updateTaxes`).
Contract: `clean(s) = s.replace(/ /g, "-").replace(/[^A-Za-z0-9-]/g, "")`;
`groupKey = clean("X" + String(Number(rate)) + "% " + taxGroup)`.
Keep a separate `normaliseLookup()` for city/state matching (do not reuse
`clean` there; see O6).
Acceptance: F2 => `X8-VAT`; F25 => `X13-GSTHST-Ontario`; F24 collision
behaviour; a property test that keys are ASCII `[A-Za-z0-9-]` only.

### O3 — Add print sequence, sale id and full group/detail shapes

Files: `src/lib/tax/index.ts` (interfaces + engine), `src/db/schema/sales.ts`,
`drizzle/sqlite/0003_*.sql` (+ MySQL mirror in `src/db/schema/mysql/index.ts`),
`src/lib/sale/sale-model.ts`.
Contract:
- `SaleTaxGroup` gains `saleId`, `printSequence`, `taxGroupName` (human),
  `taxRate`, `taxType`, `roundCode`, `saleTaxBasis`, `saleTaxAmount`,
  `salesTaxCodeId`, `jurisdictionId`, `taxCategoryId`.
- `ItemTax` gains `taxGroupSequence`, `salesTaxCodeId`, `jurisdictionId`,
  `taxCategoryId`, `taxGroupName`; `line` must be the cart line, not the index.
- `sales_items_taxes` gains `tax_type`, `rounding_code`, `cascade_sequence`,
  `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id`.
- `sales_taxes` gains `sales_taxes_id` (or keep `sale_id`+`tax_group` unique),
  `print_sequence`, `name`, `tax_rate`, `sales_tax_code_id`, `jurisdiction_id`,
  `tax_category_id`; rename `round_code` → `rounding_code` or provide a mapping
  layer used by every reader.
Acceptance: persist a destination sale with two rates and assert row-for-row
equality with the upstream tuple, including `print_sequence` = category seq +
jurisdiction seq; F4/F5/F22 storage assertions.

### O4 — Order destination definitions exactly like upstream

Files: `src/lib/tax/index.ts` (`applyDestinationTax` query), optionally
`src/lib/taxes/repository.ts`.
Contract: `ORDER BY cascade_sequence, tax_group, jurisdiction_name,
(tax_group_sequence_category + tax_group_sequence_jurisdiction)`.
This requires `tax_jurisdictions.tax_group_sequence` (O5) and joins to
`tax_categories`.
Acceptance: seed three rates with equal `cascade_sequence` but differing
`tax_group` and assert processing/print order; F5 with shuffled insertion order.

### O5 — Restore jurisdiction/category sequence columns

Files: `src/db/schema/taxes.ts`, `src/db/schema/mysql/index.ts`, migration.
Contract: `tax_jurisdictions.tax_group_sequence` INTEGER NOT NULL DEFAULT 0;
`tax_categories.tax_group_sequence` INTEGER (numeric, ordered);
remove or quarantine target-only `taxable_amount` / `tax_rate` on jurisdictions
(keep them only if a deliberate product decision records it).
Acceptance: category list ordered by sequence then name (upstream
`Tax_category.php:82-83`); `getTaxCategoryOptions` returns sequences in order.

### O6 — Rewrite `getTaxes` to a strict two-engine switch

Files: `src/lib/tax/index.ts` (123-256).
Contract (pseudocode in §3.5):
- Accept `saleId?: number`; when provided, read `sales_items_taxes`
  (`name`, `percent`) like `Sale::get_sales_item_taxes` and use its line numbers.
- `if (!useDestinationBased)` classic, else destination **only** — no fallback.
- Destination: default `taxCategoryId` from `config.default_tax_category` when
  the line has none; skip when `price === 0`.
- Classic: no `default_tax_1/2` fallback at sale time.
- Write `taxedFlag` onto the returned cart lines (add a cart field or return the
  flags) using the same "any tax amount != 0" rule.
- Apply customer taxable semantics: `customerId == null` → taxable; customer row
  missing → treat as taxable in target (record as decision D1) or replicate the
  upstream 0 default if strict parity is preferred.
- Final rounding pass sorted by `printSequence`, decimals from global
  `tax_included` (not per-row type), with HALF_ODD/HALF_FIVE upstream quirks
  handled per decision D2.
Acceptance: F1–F5, F8–F15, F20, F21, F23, F24, F26.

### O7 — Destination lookup parity

Files: `src/lib/tax/index.ts` (`getApplicableTaxCode`, `clean`), 
`src/app/(secure)/tax_codes/actions.ts` (save normalisation), repository.
Contract: precedence in §6.3; compare raw stored values (or normalise on both
write and read, consistently); exactly-one-row rule; `default_tax_code` string
handling; `sale` mode ignores customer code.
Acceptance: F9, F10, F11; a code stored with apostrophes/periods must match
itself; duplicate state rows must fall back to default.

### O8 — Correct sale totals for included tax

Files: `src/lib/sale/types.ts` (`getCartTotals`, `getItemTotalTaxExclusive`),
`src/lib/sale/sale-lib.ts` (`getTotal`, `getTotals`), 
`src/app/(secure)/sales/register/page.tsx`.
Contract: mirror `Sale_lib::get_totals` (`:693-742`): for each group, excluded ⇒
`total += amount; taxTotal += amount`; included ⇒ `subtotal -= amount`. Do not
subtract included tax from `total`. Apply cash rounding with
`config.cash_rounding_code` at `cash_decimals`.
Acceptance: F6, F7, F21 totals; F18 cash-rounding case.

### O9 — Persist and read the full tax payload

Files: `src/lib/sale/sale-model.ts` (178-201, 307-320),
`src/app/(secure)/sales/actions.ts` (25/157/192 to pass `cart.saleId`),
`src/lib/pdf/data.ts`, receipt/PDF templates.
Contract: save every field produced by O3; on re-open, use saved detail rows for
display and the saved `sales_taxes` for printing; receipts print the human
`name`/`tax_group`, not the composite key.
Acceptance: round-trip test — compute → save → read → assert equality of group
amounts, print order, names; receipt snapshot contains "Sales Tax" not "X8-…".

### O10 — Rebuild tax reports

Files: `src/lib/reports/registry.ts` (255-259, 453-459), optional new report
module.
Contract:
- `summary_taxes`: reproduce `Summary_taxes.php:42-99` — group by
  `(name, percent)`, `COUNT(DISTINCT sale_id)`, subtotal net of included tax,
  `tax`, `total`, all rounded to `totals_decimals`.
- `summary_sales_taxes`: reproduce `Summary_sales_taxes.php:53-74` — join
  `tax_categories`/`tax_jurisdictions` on the persisted ids, group by
  authority/jurisdiction/category/rate, sum `sale_tax_amount`.
- permissions: `reports_taxes` and `reports_sales_taxes` respectively.
- Filter `sales.sale_status = COMPLETED`.
Acceptance: extend `tests/Models/Reports/Summary_taxes_test.php` semantics in
the target test suite: row keys, subtotal+tax=total per row, grouping
uniqueness, summary = Σ rows; plus a destination-mode fixture asserting
authority/jurisdiction/category/rate buckets.

### O11 — Tax CRUD parity and validation

Files: `src/app/(secure)/taxes/*`, `tax_codes/*`, `tax_categories/*`,
`tax_jurisdictions/*`, `src/components/taxes/*`, `src/lib/taxes/repository.ts`.
Contract:
- Reject negative `tax_rate` (`Taxes.tax_rate_non_negative`).
- Unique `tax_group` across submitted jurisdictions (error text with the group).
- `tax_type` select (Included/Excluded) with values 0/1.
- Rounding dropdown from `getRoundingOptions()` with names.
- `tax_code_type` only if the column is added; otherwise do not read/write it.
- Bulk-save semantics: upsert by identity and soft-delete unposted rows
  (categories/jurisdictions/codes); rates hard delete.
- Uniqueness of `(tax_code, tax_category, jurisdiction)` — decide whether to
  allow duplicates (upstream allows) or enforce (D3).
Acceptance: port the intent of `tests/Controllers/TaxesControllerTest.php`
(XSS rejection incl. Unicode/GST-HST/parentheses acceptance, negative-rate
rejection) into target action tests; CRUD round-trip for all four entities.

### O12 — Customer and item tax fields

Files: `src/db/schema/customers.ts`, `src/components/customers/customer-form.tsx`,
`src/app/(secure)/customers/actions.ts`, `src/lib/persons/repository.ts`,
`src/components/items/item-form.tsx` (no change needed beyond category gating).
Contract: `customers.tax_id` column + form field; `sales_tax_code_id` selector
visible only in destination mode, autocomplete from
`/api/taxes/tax-codes-suggest`; parse and persist both.
Acceptance: create a customer with code X, run destination `return` mode, and
assert its rate applies (F9 without code-null path).

### O13 — Config tab parity

Files: `src/lib/config/tabs.ts` (52-66), `src/app/(secure)/config/actions.ts`.
Contract: add `default_tax_jurisdiction`; render `default_tax_code`,
`default_tax_category`, `default_tax_jurisdiction` as selectors fed by the option
builders; reject negative default rates; drop `default_tax_1_cumulative` unless a
decision keeps it (D4); encode booleans as `'1'`/`'0'` (already done at
`actions.ts:15-16`).
Acceptance: save/load round-trip; negative-rate rejection message; disabling
behaviour parity is a UI nicety (not required for data parity).

### O14 — Tests: add tax-parity fixtures

Files: new `src/lib/tax/tax-parity.test.ts` (or extend `tax.test.ts`), plus
report tests.
Content: F1–F26 as table-driven cases; every case asserts groups (key, type,
basis, amount, print sequence), detail rows, totals, and the persisted rows.
Also add a PHP-cross-check harness note: run the same fixtures against
`Tax_lib` in a disposable OSPOS instance and diff JSON (documented as the
validation step; the upstream suite has essentially no arithmetic coverage).
Acceptance: all fixtures green; the three existing but wrong tests
(`tax.test.ts:87-102` default fallback, `:118-157` destination match,
`:159-203` cascade) rewritten to the contracts above.

### O15 — Ordering of work

1. O1, O2 (pure functions; unblock everything).
2. O5, O3 (schema + shapes; blocks persistence and reports).
3. O6, O7 (engine).
4. O4 (ordering) with O5.
5. O8 (totals) — needs O6.
6. O9 (persistence/print) — needs O3/O6.
7. O10 (reports) — needs O3/O9.
8. O11, O12, O13 (CRUD/config).
9. O14 continuously; final cross-check against upstream.

---

## 12. Unknowns and decisions required

### U1 — Null `sales_tax_code_id` into `int` parameter

`Tax_lib.php:300,373` declare `int $sales_tax_code_id`, but
`customers.sales_tax_code_id` is `DEFAULT NULL` (`3.3.0_indiagst.sql:33`) and the
call site passes the DB value directly (`Tax_lib.php:154`). Under PHP 8 userland
typing this is a `TypeError` for any customer saved without a code in a
non-`sale` mode. Either the deployed PHP runs with coercive null-to-0 behaviour
(not standard), the customer record always has 0 (not the DDL default), or this
path is simply untested. **Decision:** target treats `null` as 0 (recommended,
matches the fallback chain), and the report records this as an upstream latent
defect rather than replicating a crash.

### U2 — `tax_categories.tax_category_id` AUTO_INCREMENT

The 3.1.1 DDL (`3.0.2_to_3.1.1.sql:166-177`) declares the PK without
`AUTO_INCREMENT`; 3.3.0 does not alter it; `Tax_category::save_value` inserts
without an id and then reads `insertID()` (`Tax_category.php:107-124`). On a
fresh install this cannot produce distinct ids. Upgraded installs likely have the
column altered by an unshipped hotfix. **Decision:** target keeps its
auto-increment PK (correct behaviour) and treats upstream id semantics as
"1..n" for fixtures.

### U3 — `default_tax_category` seeded as a name

`3.0.2_to_3.1.1.sql:194` seeds `'Standard'`; the config UI saves a
**tax_category_id** because the dropdown is keyed by id
(`Tax_lib.php:440-454`), and `Tax_lib.php:151` assigns the config value to
`tax_category_id` which is compared against `rate_tax_category_id` in
`Tax::get_taxes` (`Tax.php:125`). A site that never re-saved the tax tab has a
name where an id is expected → no destination tax for lines without a category.
**Decision:** target should resolve `default_tax_category` as an id first, and (if
non-numeric) as a category name via `getTaxCategoryId`; document the fallback.

### U4 — Permission identifiers

Upstream uses `taxes`, `reports_taxes`, `reports_sales_taxes` and module
`taxes` (`3.0.2_to_3.1.1.sql:141-146`, `3.3.0_indiagst.sql:94-100`,
`Reports.php:95-96`). Target seeds `taxes` and `reports_taxes` only
(`src/db/seed.ts:122,144,162`) while some actions call
`requirePermission("tax_codes"|"tax_categories"|"tax_jurisdictions")`. Whether
those unknown ids deny or allow is unverified. **Decision:** normalise all tax
CRUD to `taxes` and add `reports_sales_taxes`.

### U5 — `round_taxes` HALF_ODD / HALF_FIVE bugs

§3.8 defects 1–2 are unambiguous upstream bugs with user-visible effect
(HALF_FIVE collapses tax amounts to multiples of 5). Strict parity means
replicating them; product correctness means fixing them. **Recommendation:**
fix in target, record the divergence in the report, and add a compatibility
flag if byte-for-byte parity with a live OSPOS dataset is required. This is the
single most consequential decision in this scope because it changes stored
`sales_taxes.sale_tax_amount` for affected configurations.

### U6 — Mixed included/excluded rounding scale

Upstream `round_taxes` picks one scale for the whole cart from the global
`tax_included`, even though destination mode permits per-rate types. A
destination sale with both types and `tax_included = 0` therefore rounds an
included group to `currency_decimals`, while the per-item extraction used
`tax_decimals` in `apply_destination_tax` (though `get_included_tax` ignores the
argument). Target's per-row choice is more logical but differs. **Decision:**
follow upstream (global scale) unless a decision records the improvement.

### U7 — Reporting identity of "tax group"

Upstream `sales_taxes.tax_group` is the jurisdiction's `tax_group`, and
`tx_group` uniqueness is enforced only within one submitted jurisdiction list
(`Taxes.php:530-537`); across codes, two jurisdictions may share a group name.
`update_taxes` then merges them within a cart. Whether merging distinct
jurisdictions that share a group name is intended is not documented. Target
inherits the merge. **Decision:** keep merge semantics (upstream parity);
`summary_sales_taxes` still separates by jurisdiction id.

### U8 — `sale` mode ignoring the customer's code

`Tax_lib.php:375-376` unconditionally overrides the customer code in `sale`
mode, with a comment that says "Overrides customer assigned code" — which reads
like a deliberate design ("origin tax code for sales, destination code for
returns") rather than a bug. It is also what makes destination tax effectively
"default code only" for ordinary POS sales unless the operator uses invoice/
quote/return modes. **Decision:** replicate exactly; do not "fix" to honour the
customer code in sale mode without a product ruling.

### U9 — Whether `sales_taxes` should retain a unique key

Upstream 3.1.1 had PK `(sale_id, tax_type, tax_group)`; 3.3.0 replaced it with a
surrogate key and a non-unique index (`3.3.0_indiagst.sql:60-61`), which permits
duplicate groups for one sale. Target's Drizzle table has **no** primary key or
unique index at all (`src/db/schema/sales.ts:46-53`), so duplicate inserts are
silently allowed and de-duplication relies entirely on in-memory accumulation.
**Decision:** add `(sale_id, tax_group, tax_type)` unique or a surrogate PK to
match 3.3.0; either way, reads must be ordered by `print_sequence`.

### U10 — Upstream `get_tax_code_rate_exceptions` removal

`app/Controllers/Taxes.php:184,282,346` call a removed model method. The three
edit routes are therefore dead in 3.4.3. The target's simpler separate forms are
functionally superior; the decision is whether "parity" requires reproducing
non-functional routes. Recommended: do not reproduce breakage; implement the
intended per-category rate exception editing on the tax-code form (the data model
already supports it: one `tax_code_links` row per category/jurisdiction).

### U11 — Item form's two-tax limit

Classic `items_taxes` is unbounded but the UI has exactly two rows
(`app/Views/items/form.php:219-259`). Target enforces two
(`src/components/items/item-form.tsx:53-58`, `saveItem` slices to 2 at
`src/lib/items/repository.ts:331`). Parity holds for the UI; the engine must not
assume two rows.

### U12 — Tax code identity semantics

Upstream `Tax_code::save` keys on the `tax_code` **string**
(`Tax_code.php:110-124`), while `delete_list` keys on ids
(`Taxes.php:410-412`) and `get_sales_tax_code` returns ids. Renaming a code
therefore creates a new row; target keys everything on `tax_code_id` and updates
in place. **Decision:** adopt id-keyed CRUD (recommended; the string key is a
legacy artifact) and add a unique index on `tax_code` so the two semantics cannot
diverge silently.

### U13 — What "taxed" means for the cart flag

Upstream sets `taxed_flag` only inside the taxable-customer branch and only for
lines processed; with a destination rate of 0% the flag is `nontaxed` because
`tax_amount != 0` is the test (`Tax_lib.php:340-343`). Target returns `true` from
`applyDestinationTax` unconditionally (`src/lib/tax/index.ts:362`). The flag is
displayed in receipts/register (`Sales.taxed_ind`) and may affect the
`receipt_show_tax_ind` behaviour. **Decision:** replicate the amount-based test.

### U14 — `default_tax_1_cumulative`

Not an upstream key. If inherited from a downstream fork, its semantics are
unverified (presumably "tax 2 compounds on tax 1"). **Decision:** remove from the
config tab unless a source for the key is produced.

---

## Appendix A — Method inventory cross-reference

| Upstream method | Target symbol | Status |
|---|---|---|
| `Tax_lib::get_tax_types` | `getTaxTypes` / `getTaxTypeOptions` | present, labels/order differ |
| `Tax_lib::get_item_sales_tax` | `getItemSalesTax` | present, no bc truncation |
| `Tax_lib::get_tax_for_amount` | `getTaxForAmount` | present, float math |
| `Tax_lib::get_taxes` | `getTaxes` | present, divergent |
| `Tax_lib::get_included_tax` | `getIncludedTax` | present, rounds early |
| `Tax_lib::update_taxes` | `updateTaxes` | present, key/shape differ |
| `Tax_lib::apply_invoice_taxing` | `applyInvoiceTaxing` | present, sort-only stub |
| `Tax_lib::round_taxes` | `roundTaxes` (+ inline mapping in `getTaxes`) | present, no sort |
| `Tax_lib::apply_destination_tax` | `applyDestinationTax` | present, divergent |
| `Tax_lib::get_applicable_tax_code` | `getApplicableTaxCode` | present, close |
| `Tax_lib::clean` | `clean` | different function |
| `Tax_lib::get_tax_code_options` | `getTaxCodeOptions` | shape differs |
| `Tax_lib::get_tax_jurisdiction_options` | `getTaxJurisdictionOptions` | shape differs |
| `Tax_lib::get_tax_category_options` | `getTaxCategoryOptions` | shape/order differ |
| `Tax_lib::get_tax_type_options` | `getTaxTypeOptions` | order/labels differ |
| `Rounding_mode::get_rounding_options` | `getRoundingOptions` | present, correct |
| `Rounding_mode::get_rounding_code_name` | — | missing |
| `Rounding_mode::get_html_rounding_options` | — | missing (not needed in React) |
| `Rounding_mode::round_number` | `roundNumber` | present, wrong modes |
| `Tax::get_taxes` (definitions) | inline query in `applyDestinationTax` | present, no ordering |
| `Tax::get_info` | `src/app/(secure)/taxes/new/[id]/page.tsx` inline select | present |
| `Tax::get_rate_info` | `getRateInfo` (rate only) | partial |
| `Tax::save_value` | `saveTaxRateAction` | present |
| `Tax::delete` / `delete_list` | `deleteTaxRateAction` | present |
| `Tax::search` | `src/app/(secure)/taxes/page.tsx` select | present, no pagination |
| `Tax::get_tax_code_type_name` | — | missing (no column) |
| `Tax::get_tax_category` | `getTaxCategory` | present |
| `Tax::get_all_tax_categories` | `getAllTaxCategories` | present, order differs |
| `Tax_code::get_sales_tax_code` | inline in `getApplicableTaxCode` | present |
| `Tax_code::save_tax_codes` | `saveTaxCode` | present, id-keyed |
| `Tax_code::get_tax_codes_search_suggestions` | `getTaxCodeSearchSuggestions` | partial (name only) |
| `Tax_category::save_categories` | `saveTaxCategory` | present, id-keyed |
| `Tax_category::get_tax_category_suggestions` | `getTaxCategorySuggestions` | present |
| `Tax_jurisdiction::save_jurisdictions` | `saveJurisdiction` | present |
| `Item_taxes::get_info` | `getItemTaxes` | present |
| `Item_taxes::getInfoMultiple` | not ported | missing (bulk item list) |
| `Item_taxes::save_value` | `saveItem` slice(0,2) | present |
| `Item_taxes::save_multiple` | not ported | missing (bulk item edit) |

## Appendix B — Upstream bugs to consciously not replicate

1. `Taxes::suggest_search` calls a nonexistent model method (`Taxes.php:103-109`).
2. `Tax::search` filters on the dropped column `rate_tax_code` (`Tax.php:251-252`).
3. `Taxes::getView_tax_codes/_categories/_jurisdictions` call the removed
   `get_tax_code_rate_exceptions` (`Taxes.php:184,282,346`).
4. Missing view files `taxes/tax_code_form.php`, `tax_category_form.php`,
   `tax_jurisdiction_form.php` (referenced at `Tax_codes.php:87`,
   `Tax_categories.php:76`, `Tax_jurisdictions.php:79`).
5. `Tax_jurisdictions::postSave` ignores the id and always inserts
   (`Tax_jurisdictions.php:94`).
6. `Tax_categories::postSave` writes a nonexistent `tax_category_code`
   (`Tax_categories.php:88`).
7. `partial/tax_jurisdictions.php:48` emits `name="tax_type[]1"`.
8. `Tax_jurisdiction::$primaryKey = 'cashup_id'` (`:16`).
9. `Tax::get_tax_category_id` ignores its argument (`:310-316`).
10. `round_taxes` HALF_ODD→HALF_UP and HALF_FIVE losing decimals (`:281,289`).
11. `Tax_code::get_info` uses `$query` before assignment when passed null
    (`Tax_code.php:52-62`).
12. `Tax_code::save` update path is keyed on the code string, so rename =
    duplicate + soft-delete of the old row.

## Appendix C — Minimal data contract for the shared engine (normative)

```
SaleTaxGroup {
  saleId: number | null          // -1/NULL at cart time
  taxType: 0 | 1                 // 0 = INCLUDED, 1 = EXCLUDED
  taxGroup: string               // raw jurisdiction tax_group (display + report)
  taxGroupKey: string            // clean('X' + Number(rate) + '% ' + taxGroup)
  taxRate: number                // decimal(15,4)
  saleTaxBasis: number           // scale 4 accumulated
  saleTaxAmount: number          // rounded to the final scale
  printSequence: number          // category seq + jurisdiction seq (destination)
                                 // or per-line 1,3,5,... (classic)
  roundingCode: 0..7
  salesTaxCodeId: number | null
  jurisdictionId: number | null
  taxCategoryId: number | null
}

ItemTax {
  saleId?: number
  itemId: number
  line: number                   // cart line / sales_items.line
  name: string                   // jurisdiction tax_group (dest) or item tax name (classic)
  percent: number
  taxType: 0 | 1
  roundingCode: 0..7
  cascadeSequence: number
  taxGroupSequence: number       // destination only; 0 for classic
  itemTaxAmount: number
  salesTaxCodeId: number | null
  jurisdictionId: number | null
  taxCategoryId: number | null
}
```

Both arrays are ordered: groups by `printSequence` ascending (stable), details in
computation order (cart line order, then definition order).

---

*End of report.*
