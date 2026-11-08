# Sales subsystem reconstruction report (upstream OSPOS 3.4.3 → Next.js 16 target)

Status: analysis-only. Source of truth: `/home/yash/ospos` at commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea` (CodeIgniter 4.7.4).
Target: `/home/yash/Desktop/yash/ospos-nextjs` (Next.js 16 + Drizzle, SQLite/MySQL schema mirrors).
This report covers the whole sales subsystem: controller actions, `Sale_lib` state machine, `Sale` persistence, totals math, end-to-end flows, document rendering, authz, target gap analysis, and implementation obligations.

Every claim cites `path:line`. When the target has no corresponding file, that is stated explicitly.

---

## 1. Route / action map (upstream)

### 1.1 Routing mechanism

There are **no explicit `sales/*` routes** in `app/Config/Routes.php` (only report routes reference sales: `app/Config/Routes.php:32-35`). Sales is reached through CI4 auto-routing:

- `app/Config/Routing.php:97` → `public bool $autoRoute = true;`
- `app/Config/Feature.php:15` → `public bool $autoRoutesImproved = true;`

Improved auto-routing maps `GET /sales/<method>` → `Sales::get<Method>()`, `POST /sales/<method>` → `Sales::post<Method>()`. This has two consequences that must be reproduced deliberately in the Next port:

1. Methods without a `get`/`post` prefix are **not directly routable**. `Sales::restore()` (`app/Controllers/Sales.php:1556`) and `Sales::suggest_search()` (`app/Controllers/Sales.php:226`) are therefore dead endpoints in 3.4.3 even though JS calls `/sales/restore` (`public/js/manage_tables.js:281-283,333`). `change_register_mode()` (`app/Controllers/Sales.php:314`) is only called internally from `postUnsuspend()`. `get_filtered()` (`:1875`) and `search_cart_for_item_id()` (`:1965`) are helper methods on a controller, not routes.
2. URL segment casing follows the method name: tests call `/sales/selectCustomer`, `/sales/addPayment`, `/sales/editItem/1`, `/sales/deleteItem/...`, `/sales/sendPdf/...` (`tests/Controllers/SalesControllerTest.php:140-160,300-360`). PHP method lookup is case-insensitive; the canonical URLs are as listed below.

All actions are gated first by `Secure_Controller::__construct('sales')` (`app/Controllers/Sales.php:47-68`), which requires `Employee::has_module_grant('sales', person_id)` and throws `RedirectException("no_access/sales/")` otherwise (`app/Controllers/Secure_Controller.php:41-49`). `has_module_grant` has unusual semantics: a single `sales` grant is insufficient when any `sales_*` sub-permission row exists in `permissions`; it then requires at least one `sales_*` grant (`app/Models/Employee.php:444-467`). This is why the upstream tests give a cashier both `sales` and `sales_stock` (`tests/Controllers/SalesControllerTest.php:66-72`).

### 1.2 Action table

Legend: `R` = `reports_sales` grant required; `D` = `sales_delete`; `P` = `sales_change_price`; `-` = module grant only.

| HTTP | URL | Method | Params | Perm | Response | Side effects |
|---|---|---|---|---|---|---|
| GET | `/sales` | `getIndex` `:69` | — | - | view `sales/register` via `reload()` | `session.allow_temp_items = 1` (`:71`) |
| GET | `/sales/manage` | `getManage` `:81` | — | R | view `sales/manage` | reads/restores table filters from query |
| GET | `/sales/row/{rowId}` | `getRow` `:131` | int | R | JSON row | none |
| GET | `/sales/search` | `getSearch` `:148` | `search,limit,offset,sort,order,start_date,end_date,filters[],only_invoices` | R | JSON `{total,rows,payment_summary}` | temp tables in DB |
| GET | `/sales/itemSearch` | `getItemSearch` `:206` | `term` | - | JSON suggestions | in return mode validates receipt and injects receipt string as a suggestion (`:211-216`) |
| POST | `/sales/suggest_search` (unroutable) | `suggest_search` `:226` | `term` | - | JSON | none |
| POST | `/sales/selectCustomer` | `postSelectCustomer` `:243` | `customer` | - | full register HTML | sets `sales_customer`; applies customer discount to zero-discount lines (`:247-255`) |
| POST | `/sales/changeMode` | `postChangeMode` `:266` | `mode,dinner_table,stock_location` | - | register HTML | sets `sales_mode`, `sale_type`, dinner table (swap), `sales_location`, empties payments |
| GET | `/sales/change_register_mode/{sale_type}` (unroutable) | `change_register_mode` `:314` | int | - | register HTML | sets `sales_mode` only |
| POST | `/sales/setComment` | `postSetComment` `:335` | `comment` | - | JSON `{success:true}` | `sales_comment` |
| POST | `/sales/setInvoiceNumber` | `postSetInvoiceNumber` `:347` | `sales_invoice_number` | - | JSON `{success:true}` | `sales_invoice_number` (cast to int) |
| POST | `/sales/setPaymentType` (unused) | `postSetPaymentType` `:356` | `selected_payment_type` | - | register HTML | `payment_type` |
| POST | `/sales/setPrintAfterSale` | `postSetPrintAfterSale` `:368` | `sales_print_after_sale` | - | JSON | `sales_print_after_sale = (value != 'false')` |
| POST | `/sales/setPriceWorkOrders` | `postSetPriceWorkOrders` `:380` | `price_work_orders` | - | JSON | `sales_price_work_orders` (parsed decimal) |
| POST | `/sales/setEmailReceipt` | `postSetEmailReceipt` `:393` | `email_receipt` | - | JSON | `sales_email_receipt` |
| POST | `/sales/addPayment` | `postAddPayment` `:405` | `payment_type,amount_tendered,reference_code` | - | register HTML with error/warning | `sales_payments`, `cash_mode`, giftcard/rewards remainders |
| GET | `/sales/deletePayment/{base64url(payment_id)}` | `getDeletePayment` `:545` | encoded string | - | register HTML | removes payment + cash-rounding sibling |
| POST | `/sales/add` | `postAdd` `:560` | `item` | - | register HTML with error/warning | cart mutations; may call `return_entire_sale` |
| POST | `/sales/editItem/{line}` | `postEditItem` `:641` | `line`; body `price,quantity,discount,discount_type,description,serialnumber,location,discounted_total` | P if price changes | register HTML with error/warning | cart line update; empties payments |
| GET | `/sales/deleteItem/{line}` | `getDeleteItem` `:724` | int (misnamed item_id) | - | register HTML | removes cart line, empties payments |
| GET | `/sales/removeCustomer` | `getRemoveCustomer` `:739` | — | - | register HTML | clears remainders, deletes rewards payment, clears invoice/quote numbers, removes customer |
| POST | `/sales/complete` | `postComplete` `:758` | — | - | document view or register HTML with error | persists sale, writes inventory/taxes/rewards/payments, clears cart |
| GET | `/sales/sendPdf/{saleId}/{type=invoice}` | `getSendPdf` `:1041` | int, string | R | JSON `{success,message,id}` | clears cart; sends PDF email |
| GET | `/sales/sendReceipt/{saleId}` | `getSendReceipt` `:1097` | int | R | JSON | clears cart; sends HTML receipt email |
| GET | `/sales/receipt/{saleId}` | `getReceipt` `:1427` | int | R | view `sales/receipt` | clears cart |
| GET | `/sales/invoice/{saleId}` | `getInvoice` `:1448` | int | R | view `sales/<invoice_type>` | clears cart |
| GET | `/sales/edit/{saleId}` | `getEdit` `:1469` | int | R | view `sales/form` | none (header/payment edit modal) |
| POST | `/sales/delete/{saleId?}` | `postDelete` `:1529` | int? or `ids[]` | D | JSON | cancels sale(s), restores inventory if completed |
| POST (unroutable) | `/sales/restore/{saleId?}` | `restore` `:1556` | int? or `ids[]` | D | JSON | sets status SUSPENDED |
| POST | `/sales/save/{saleId?}` | `postSave` `:1585` | `date,customer_id,employee_id,comment,invoice_number,number_of_payments,payment_*_i,payment_type_new,payment_amount_new,reference_code_new,refund_*_i` | R | JSON | updates sale header + payments, updates inventory trans_date |
| POST | `/sales/cancel` | `postCancel` `:1716` | — | - | register HTML | releases table, cancels/deletes current sale, clears cart |
| GET | `/sales/discardSuspendedSale` | `getDiscardSuspendedSale` `:1747` | — | - | register HTML | clears cart, cancels suspended id |
| POST | `/sales/suspend` | `postSuspend` `:1763` | — | - | register HTML | saves SUSPENDED sale, clears cart |
| GET | `/sales/suspended` | `getSuspended` `:1807` | — | - | view `sales/suspended` | none |
| POST | `/sales/unsuspend` | `postUnsuspend` `:1822` | `suspended_sale_id` | R | register HTML | clears cart, copies sale into cart, changes mode |
| GET | `/sales/salesKeyboardHelp` | `getSalesKeyboardHelp` `:1850` | — | - | view `sales/help` | none |
| POST | `/sales/checkInvoiceNumber` | `postCheckInvoiceNumber` `:1863` | `sale_id,invoice_number` | - | JSON `"true"`/`"false"` (quoted) | none |
| POST | `/sales/changeItemNumber` | `postChangeItemNumber` `:1898` | `item_id,item_number` | - | JSON | **updates item master** and cart line |
| POST | `/sales/changeItemName` | `postChangeItemName` `:1918` | `item_id,item_name` | - | JSON | updates item master and cart line |
| POST | `/sales/changeItemDescription` | `postChangeItemDescription` `:1942` | `item_id,item_description` | - | JSON | updates item master and cart line |

`get_filtered(array $cart)` (`:1875`) and `search_cart_for_item_id()` (`:1965`) are public helper methods, not actions.

### 1.3 JSON shapes

- `getSearch`: `{total:int, rows:[row,...lastRow], payment_summary:html-string}`; rows produced by `getSaleDataRow` (`app/Helpers/tabular_helper.php:96-141`); last row sums `amount_due`, `amount_tendered`, `change_due` (`:146-165`). 403 JSON is `{success:false,message:lang('Sales.not_authorized')}` (`app/Controllers/Sales.php:136,153`).
- `postCheckInvoiceNumber`: `setJSON(!$exists ? 'true' : 'false')` — a JSON **string**, not boolean (`:1867`).
- `getSendPdf` / `getSendReceipt`: `{success:bool, message:string, id:int}`.
- `delete`/`restore`: `{success:bool, message:string, ids:[...]}`.

---

## 2. `Sale_lib` state model (every property/method)

`Sale_lib` (`app/Libraries/Sale_lib.php`) is a session-backed cart plus a thin calculator. Constructor binds models `Attribute`, `Customer`, `Dinner_table`, `Item`, `Item_kit_items`, `Item_quantity`, `Item_taxes`, `Sale`, `Stock_location` and caches `config(OSPOS::class)->settings` (`:51-68`).

### 2.1 Constants and option menus

| Item | Behavior | Cite |
|---|---|---|
| Shortcut defaults | `KEY_SHORTCUT_DEFAULTS`: cancel/items/customers/suspend/suspended/amount/payment/complete/finish/help with `value` like `'27 | ESC'`, `code`, `label` | `:21-32` |
| `getKeyShortcutsOptions` | maps `value => label` | `:131-144` |
| `getKeyShortcuts` | parses `config["key_<name>"]` on `|` into `{value,code,label}`; falls back to defaults | `:147-163` |
| `ALLOWED_INVOICE_TYPES` | `invoice`, `tax_invoice`, `custom_invoice`, `custom_tax_invoice` | `:93-98`, validator `:165-168` |
| `ALLOWED_RECEIPT_TEMPLATES` | `receipt_default`, `receipt_short` | `:100-103`, validator `:170-173` |
| `get_line_sequence_options` | `0=entry`, `1=group_by_type`, `2=group_by_category` | `:70-78` |
| `get_register_mode_options` | if `invoice_enable` false: only `sale`; else `sale` (label `Sales.receipt`), `sale_quote`, optional `sale_work_order` when `work_order_enable`, `sale_invoice`; `return` always appended | `:82-111` |
| `get_invoice_type_options` | four labels always returned | `:116-123` |

### 2.2 Session keys written

| Session key | Written by | Read by |
|---|---|---|
| `sales_cart` | `set_cart`, `empty_cart` | `get_cart`, all flows |
| `sales_comment` | `set_comment`, `clear_comment` | `get_comment` |
| `sales_invoice_number` | `set_invoice_number`, `clear_invoice_number` | `get_invoice_number` |
| `sales_quote_number` | `set_quote_number`, `clear_quote_number` | `get_quote_number` |
| `sales_work_order_number` | `set_work_order_number`, `clear_work_order_number` | `get_work_order_number` |
| `sale_type` | `set_sale_type`, `clear_sale_type`, `postChangeMode` | `getSaleType` |
| `suspended_id` | `set_suspended_id` (from `postComplete` quote/WO paths and `postSuspend`? no: set only after WO/quote completion: `:945, :985`) | `get_suspended_id` |
| `sales_mode` | `set_mode`, `clear_mode` | `get_mode`, mode predicates |
| `sales_price_work_orders` | `set_price_work_orders` | `is_price_work_orders` |
| `sales_print_after_sale` | `set_print_after_sale` | `is_print_after_sale` fallback |
| `sales_email_receipt` | `set_email_receipt`, `clear_email_receipt` | `is_email_receipt` fallback |
| `sales_payments` | `setPayments`, `empty_payments` | `getPayments`, totals |
| `cash_mode` | `addPayment`, `get_payments_total`, `reset_cash_rounding`, `copy_entire_sale`, `postAddPayment` | totals / views |
| `cash_rounding` | `reset_cash_rounding` | totals / views |
| `sales_customer` | `set_customer`, `remove_customer` | `get_customer` |
| `sales_employee` | `set_employee`, `remove_employee` | `get_employee` |
| `dinner_table` | `set_dinner_table`, `clear_table` | `get_dinner_table` |
| `sales_location` | `set_sale_location`, `clear_sale_location` | `get_sale_location` |
| `payment_type` | `set_payment_type` | `get_payment_type` |
| `sales_giftcard_remainder` | `set_giftcard_remainder`, `clear_giftcard_remainder` | `get_giftcard_remainder` |
| `sales_rewards_remainder` | `set_rewards_remainder`, `clear_rewards_remainder` | `get_rewards_remainder` |
| `sale_id` | `copy_entire_sale`, `clear_all`, controller `reload`/`cancel`, `postSuspend` via save? no | `get_sale_id`, cancel/complete |
| `cash_adjustment_amount` | controller `_load_sale_data` (`app/Controllers/Sales.php:1226`) | receipt/invoice views? (not referenced in sales views; likely dead) |
| `allow_temp_items` | controller `getIndex` sets 1 (`:71`), Items controller sets 0 (`app/Controllers/Items.php:77`) | Items form temp-item checkbox |

Defaults on first read: cart `[]` (`:177-183`), payments `[]` (`:565-571`), customer `-1` (`:810-818`), employee `-1` (`:839-846`), mode `sale` (`:868-874`), dinner table `1` when `dinner_table_enable` (`:896-903`), location = `Stock_location::getDefaultLocationId('sales')` (`:927-934`).

### 2.3 Cart record shape (produced by `add_item`)

Every line is keyed by its `line` integer and contains exactly (`:1153-1181`):

`item_id`, `item_location`, `stock_name`, `line`, `name` (with `NAME_SEPARATOR . pack_name` appended when `multi_pack_enabled`), `item_number`, `attribute_values`, `attribute_dtvalues`, `description`, `serialnumber`, `allow_alt_description`, `is_serialized`, `quantity`, `discount`, `discount_type`, `in_stock`, `price`, `cost_price`, `total` (undiscounted), `discounted_total`, `print_option`, `stock_type`, `item_type`, `hsn_code`, `tax_category_id`.

`Tax_lib::get_taxes()` also annotates each line with `taxed_flag` (`lang('Sales.taxed_ind')` = `"T"`, `lang('Sales.nontaxed_ind')` = `" "`) (`app/Libraries/Tax_lib.php:157-161`; `app/Language/en/Sales.php:129-130,195`).

### 2.4 Method-by-method semantics

#### `get_cart` / `set_cart` / `empty_cart` — `:177-269`
- `get_cart` initializes `sales_cart` to `[]` if falsy and returns it.
- `empty_cart` removes the key. No temp-item cleanup.
- `remove_temp_items` (`:272-283`) loops the cart and calls `Item::delete` for lines with `item_type == ITEM_TEMP` (soft delete), but does **not** modify the cart; controller calls it only when canceling an empty/unsaved sale (`app/Controllers/Sales.php:1731`).

#### `sortAndFilterCart` — `:190-253`
Used only for rendering after save (`postComplete`) and in `_load_sale_data` consumers. Semantics:
1. Keep only lines whose `print_option == PRINT_YES` (constant `0`).
2. If kept line `price == 0.0` (`==`, not `===`), set `discount = 0.0` in the returned copy.
3. Sort:
   - `line_sequence == '0'` → ascending `line`.
   - `'1'` → `stock_type DESC`, `description ASC`, `name ASC`.
   - `'2'` → uses `$sort['category'][$k] = $v['stock_type']` (an upstream bug: category is stock_type, not `category`), then `stock_type DESC`, `description ASC`, `name ASC`.
   - anything else → ascending `line`.
Returns the filtered/re-sorted array; does not write it back to session.

#### Comments / numbers / sale type — `:286-433`
- Comment getter normalizes null/empty to `''`.
- `set_invoice_number(int, keep_custom=false)`: writes only if `!keep_custom || empty(current)`. Same pattern for quote (nullable string), work order, sale type.
- `getSaleType(): ?int` returns `session('sale_type') ?? 0`.
- `clear_sale_type` removes `sale_type`.
- `set_suspended_id`/`get_suspended_id`: raw session; getter typed `int` but may return null.

#### Mode predicates — `:451-489`
- `is_invoice_mode`: `sales_mode == 'sale_invoice' && invoice_enable`.
- `is_sale_by_receipt_mode`: `sales_mode == 'sale'` (unused).
- `is_quote_mode`, `is_return_mode`, `is_work_order_mode`: strict string compare.
- `set_mode(mode)` writes only; `change_mode` does not exist; controller `postChangeMode` performs side effects (see §5).

#### Print/email flags — `:492-562`
- `set_price_work_orders(string)`, `is_price_work_orders()` true when session value is `'true'` or `'1'` (`==`).
- `set_print_after_sale(bool)`.
- `is_print_after_sale()`: if `config.print_receipt_check_behaviour == 'always'` → true; `'never'` → false; else session value `'true'`/`'1'`.
- `set_email_receipt(string)`, `clear_email_receipt`, `is_email_receipt()`: same `always`/`never`/session logic against `email_receipt_check_behaviour`.

#### Payments — `:565-694`
Data shape keyed by **payment type string**: `{payment_type, payment_amount, cash_refund, cash_adjustment, reference_code}`.
- `addPayment(paymentId, paymentAmount, referenceCode=null, cashAdjustment=CASH_ADJUSTMENT_FALSE)`:
  - If key exists: `payment_amount = bcadd(existing, new)` (reference code and cash_adjustment are not updated).
  - Else inserts a new entry.
  - If `session.cash_mode` is truthy and `session.cash_rounding` and payment id is not `lang('Sales.cash')`/`lang('Sales.cash_adjustment')`, sets `cash_mode = CASH_MODE_FALSE` (`:611-615`).
  - No DB writes.
- `edit_payment(id, float)`: sets `payment_type=id`, amount; returns bool. Always uses float.
- `delete_payment(id)`: `urldecode`, `unset`; then `reset_cash_rounding()`; if that returns 1 and the deleted id is `Cash` → also unset `Cash Adjustment`; vice versa (`:642-661`). Note the reset happens on every delete and forces `cash_mode=false`.
- `empty_payments`: removes `sales_payments`.
- `get_payments_total()`: sums `payment_amount` for entries where `cash_adjustment` is falsy; sets `cash_mode = CASH_MODE_TRUE` if **all** payment types are Cash/Cash Adjustment and `cash_rounding` is set (`:675-693`). Cash Adjustment rows are excluded from the total.

#### Totals — `get_totals`, `get_amount_due` — `:700-805`
See §4 for formulas. Notes:
- `item_count` counts only `stock_type == HAS_STOCK` lines; `total_units` sums only those quantities.
- `total_discount` is the sum of `get_item_discount` per line (not exposed to most views; `get_discount()` recomputes and only adds when `discount > '0.0'` — string comparison).
- `cash_total` is always computed when `cash_rounding` is enabled, regardless of `cash_mode`.
- `payments_cover_total` uses a threshold of `10^-totals_decimals / 2`; in `return` mode the comparison is `current_due > -threshold`, otherwise `current_due < threshold`.
- `cash_adjustment_amount = round(cash_total - total, totals_decimals, HALF_UP)` only when payments cover the total.
- `get_amount_due`: `payment_total` must be computed first (it sets `cash_mode`), then `total - payment_total`; returns `'0'` when rounded to totals_decimals is zero, else the raw bcmath string.

#### Customer / employee / mode / table / location — `:810-974`
- `get_customer` default `-1`; `set_customer(int)`; `remove_customer`.
- `get_employee` default `-1`; `set_employee`; `remove_employee`.
- `get_mode` default `'sale'`; `set_mode`; `clear_mode`.
- `get_dinner_table`: if unset and `dinner_table_enable`, sets and returns `1`; `set_dinner_table(?int)`; `clear_table`.
- `get_sale_location`: if unset, reads default sales location from `Stock_location::getDefaultLocationId('sales')` and caches it; returns null when no default.
- `set_payment_type`/`get_payment_type` raw session.

#### Remainders — `:977-1025`
- Giftcard remainder (`sales_giftcard_remainder`) and rewards remainder (`sales_rewards_remainder`) are informational strings for the register/receipt; setters/clearers are raw.

#### `add_item` — `:1043-1195`
Signature: `add_item(&$item_id, int $item_location, string $quantity='1', &$discount='0.0', int $discount_type=0, int $price_mode=PRICE_MODE_STANDARD, ?int $kit_price_option=null, ?int $kit_print_option=null, ?string $price_override=null, ?string $description=null, ?string $serialnumber=null, ?int $sale_id=null, bool $include_deleted=false, ?bool $print_option=null, ?bool $line=null): bool`.

Algorithm (exact):
1. Resolve item by item number first, then by numeric id only if `ctype_digit && !str_starts_with('0')`; limit 1 (`Item::get_info_by_id_or_number`, `app/Models/Item.php:640-669`). On miss: set `$item_id = NEW_ENTRY` (-1), return false.
2. `$applied_discount = $discount`; resolve `item_type`, `stock_type`, `unit_price`, `cost_price`; `price_override` replaces price if non-null.
3. If `price_mode == PRICE_MODE_KIT` (1):
   - Price is zeroed (and discount zeroed) unless `kit_price_option == PRICE_OPTION_ALL` (0), or `PRICE_OPTION_KIT` (1) with `item_type == ITEM_KIT` (1), or `PRICE_OPTION_KIT_STOCK` (2) with `stock_type == HAS_STOCK` (0).
   - If price string is exactly `'0.00'`, discount is zeroed.
   - If `discount_type == FIXED` (1): if discount > price, discount = price and the caller's `$discount` is decremented by the applied amount; else caller's `$discount` is set to 0.
4. Scan the cart: compute highest `line`; find a line with same `item_id` **and** same `item_location`. If found and item is not serialized, `quantity = bcadd(quantity, existing quantity)`.
5. New line key = `maxkey + 1`.
6. `print_option_selected`: in kit mode → `PRINT_YES` if `kit_print_option == PRINT_ALL` (0), or `PRINT_KIT` (2) with item_type KIT, or `PRINT_PRICED` (1) with price > 0; else `PRINT_NO`. In standard mode → provided `print_option` or `PRINT_YES`.
7. `total = get_item_total(qty, price, applied_discount, discount_type)` (no discount); `discounted_total = get_item_total(..., true)`.
8. Append `NAME_SEPARATOR . pack_name` to name when `multi_pack_enabled`.
9. Read attribute links for this item with `sale_id` (when `$sale_id` non-null) and `Attribute::SHOW_IN_SALES`; store concatenated `attribute_values`/`attribute_dtvalues`.
10. If item not already in sale or serialized → add new line (full record, `in_stock` from `item_quantities` for that location). Else update quantity/total/discounted_total on the existing line (discount, description, serial are **not** updated in this branch).
11. `set_cart`.

Quirks: `$insertkey` is assigned but unused (`:1101,1121`); the `$line` parameter is declared but never used; merge matches location, unlike the target.

#### `out_of_stock` / quantity helpers — `:1202-1263`
- `out_of_stock(item_id, location)`: if item exists and `stock_type == HAS_STOCK`, returns `lang('Sales.quantity_less_than_zero')` when `in_stock - already_added < 0`, else `lang('Sales.quantity_less_than_reorder_level')` when `< reorder_level`; otherwise `''`.
- `get_quantity_already_added` sums cart quantities by item+location using `+=` (float, not bcadd).
- `get_item_id(line)` returns item id for line or `-1`.

#### `edit_item` — `:1268-1293`
- If `discounted_total != null` and different from the stored `discounted_total`, recompute `quantity = bcdiv(discounted_total, price, quantity_decimals())` — this is the **amount-entry** path (`ITEM_AMOUNT_ENTRY`).
- Writes description, serialnumber, quantity, discount, optional discount_type, price, `total`, `discounted_total`. Always returns `false` (upstream bug).

#### `delete_item` — `:1299-1311`
- If the line's `item_type == ITEM_TEMP`, calls `Item::delete(item_id)` (soft delete).
- `unset` line, save cart.

#### `return_entire_sale` — `:1317-1331`
- Parses `"POS <id>"` by `explode(' ')` and takes piece 1 (no validation).
- Empty cart and remove customer.
- For each `get_sale_items_ordered($sale_id)` row: `add_item(item_id, item_location, -quantity_purchased, discount, discount_type, PRICE_MODE_STANDARD, null, null, item_unit_price, description, serialnumber, null, true)`.
- Sets customer to the original sale's customer.
- Does **not** switch mode itself (controller's return mode already set), does not copy payments, comments, table, numbers.

#### `add_item_kit` — `:1343-1360`
- Extracts kit id after a space if present.
- For each `Item_kit_items::get_info(kit_id)` row: `add_item(component, location, component_quantity, discount, discount_type, PRICE_MODE_KIT, kit_price_option, kit_print_option)`; accumulates boolean result; captures the first non-null stock warning via `out_of_stock`.
- Note: kit header item is added by the controller separately (`postAdd`, `:587-613`).

#### `copy_entire_sale` — `:1366-1409`
- Empty cart, remove customer.
- For each ordered sale item: `add_item(item, location, quantity_purchased, discount, discount_type, PRICE_MODE_STANDARD, null, null, item_unit_price, description, serialnumber, sale_id, true, print_option)`. Passing `sale_id` makes attribute links resolve against that sale; `include_deleted=true`; print option copied.
- `cash_mode = false`; if `cash_rounding` session is set, set `cash_mode=true` only when every payment type is Cash or Cash Adjustment.
- Replays every payment row through `addPayment(payment_type, payment_amount, reference_code ?? null, cash_adjustment)` (so same-type rows accumulate; reference code kept).
- Sets customer, employee, quote number, work-order number, sale type, comment, dinner table, `sale_id`.
- Does **not** set invoice number, mode (controller `change_register_mode` does), suspended id, location, giftcard/rewards remainders.

#### `clear_all` / `clear_cash_flags` / `reset_cash_rounding` — `:1422-1470`
- `clear_all`: `sale_id = -1`; clears mode, table, cart, comment, email receipt, invoice/quote/work-order numbers, sale type, giftcard remainder, payments, customer, cash flags. It does **not** clear `sales_rewards_remainder`, `sales_employee`, `sales_location`, `payment_type` (payment_type is cleared by `clear_cash_flags`), or `allow_temp_items`.
- `clear_cash_flags`: removes `cash_rounding`, `cash_mode`, `payment_type`.
- `reset_cash_rounding`: `cash_rounding = 1` iff `cash_decimals() < totals_decimals()` **or** `cash_rounding_code == Rounding_mode::HALF_FIVE` (7); else 0. Writes `cash_mode = CASH_MODE_FALSE`. Returns the flag.

#### Customer discount / discount totals — `:1473-1524`
- `is_customer_taxable()` (never called): returns `customer.taxable or customer_id == -1` (uses `or`, not `||`).
- `apply_customer_discount(discount, discount_type)`: for each line whose `discount == 0.0`, set discount/type and recompute total/discounted_total. Only zero discounts are touched.
- `get_discount()`: sums `get_item_discount` only for lines with `discount > '0.0'` (string comparison).

#### Item math — `:1529-1725`
- `get_subtotal(include_discount=false, exclude_tax=false)` → `calculate_subtotal`.
- `get_item_total_tax_exclusive(item_id, qty, price, discount, type, include_discount=false)`: line total minus each **additive** item tax (`items_taxes`), where the tax is computed with `get_item_tax`.
- `get_extended_total_tax_exclusive` (unused): subtract taxes from a provided discounted extended amount.
- `get_item_total(qty, price, discount, type, include_discount=false)`: `bcmul(qty, price)`; when including discount, subtract `get_item_discount`.
- `get_quantity_sold(total, price)`: `bcdiv(total, price, quantity_decimals())`.
- `get_extended_amount(qty, price, discount_amount='0.0')`: `bcmul(qty, price) - discount_amount`.
- `get_item_discount(qty, price, discount, type)`: percent → `bcmul(qty*price, discount/100)`; fixed → `bcmul(qty, discount)`; then `round(..., totals_decimals, PHP_ROUND_HALF_UP)` cast to string.
- `get_item_tax(qty, price, discount, type, percent)`: if `tax_included`, `item_total - item_total/(1+percent/100)`; else `item_total * percent/100` where `item_total` includes discount.
- `calculate_subtotal(include_discount, exclude_tax)`: for each line, if `exclude_tax && tax_included`, use `get_item_total_tax_exclusive(item_id,...)`; else `get_item_total`; accumulate with `bcadd`.
- `get_total(include_cash_rounding=true)`: `calculate_subtotal(true)`; if tax excluded, add every `Tax_lib::get_taxes(cart)[0].sale_tax_amount`; if `include_cash_rounding && cash_mode`, apply `check_for_cash_rounding`.
- `get_empty_tables(current_id)` delegates to `Dinner_table::get_empty_tables`.
- `check_for_cash_rounding(total)`: `Rounding_mode::round_number(config.cash_rounding_code, (float)total, cash_decimals())` (`app/Models/Enums/Rounding_mode.php:69-88`).

### 2.5 Every config key consulted by `Sale_lib` (and sale code)

| Config key | Used for | Cite |
|---|---|---|
| `invoice_enable` | register modes, invoice mode predicate, invoice numbering/render branch | `Sale_lib.php:82-111,451-457`; `Sales.php:758-1040` |
| `work_order_enable` | work-order register mode | `Sale_lib.php:99-103` |
| `line_sequence` | cart and DB item ordering | `Sale_lib.php:213-250`; `Sale.php:888-938` |
| `multi_pack_enabled` | append pack name to line name | `Sale_lib.php:1145-1147`; `Item.php:1471-1488` |
| `cash_rounding_code` | cash rounding algorithm | `Sale_lib.php:1458-1469,1728-1734` |
| `cash_decimals`, `currency_decimals` (`totals_decimals`), `tax_decimals`, `quantity_decimals` | decimal scales | `app/Helpers/locale_helper.php:313-344` |
| `print_receipt_check_behaviour` | print-after-sale flag precedence | `Sale_lib.php:518-531` |
| `email_receipt_check_behaviour` | email-receipt flag precedence | `Sale_lib.php:550-562` |
| `default_sales_discount`, `default_sales_discount_type` | initial item discount | `Sales.php:564-566` |
| `customer_reward_enable` | rewards package display/payment/earning | `Sale.php:1417`; `Sales.php:1371`; `Sale.php:960-970` |
| `tax_included` | totals/tax math in sales + SQL | `Sale_lib.php:1653-1671,1693-1712`; `Sale.php:55-57,1084-1101` |
| `use_destination_based_tax`, `default_tax_category` | tax engine branch | `Tax_lib.php:100-155` |
| `date_or_time_format` | manage search date comparison | `Sale.php:122-129,216-220` |
| `invoice_type` | invoice view selection | `Sales.php:880-886,1287-1294` |
| `receipt_template` | receipt view selection | `Sales.php:1019-1025,1289-1296` |
| `sales_invoice_format`, `sales_quote_format`, `work_order_format` | number rendering | `Sales.php:864-866,918-921,958-961,1380-1390` |
| `invoice_email_message` | email body tokens | `Sales.php:1057-1067` |
| `account_number`, `tax_id`, `address`, `phone`, `company` | company/customer blocks | `Sales.php:774-785,1150-1194` |
| `include_hsn` | HSN column | `Sales.php:764,1217`; invoice views |
| `payment_reference_code_min`, `payment_reference_code_max` | reference-code validation bounds | `Sales.php:434-445,1607-1625` |
| `payment_options_order`, `country_codes` | payment option set/order and UPI | `app/Helpers/locale_helper.php:240-280` |
| `dinner_table_enable` | table selection/release | `Sale_lib.php:896-901`; `Sale.php:688-695`; `Sales.php:280-310` |
| `dateformat`, `timeformat`, `number_locale`, `thousands_separator`, `currency_symbol` | formatting | `locale_helper.php:350-397,428-520` |
| `print_header`, `print_footer`, `print_*_margin`, `print_silently`, `print_delay_autoreturn` | print partial | `app/Views/partial/print_receipt.php` |
| `receipt_font_size`, `receipt_show_company_name`, `receipt_show_tax_ind`, `receipt_show_total_discount`, `receipt_show_description`, `receipt_show_serialnumber`, `receipt_show_taxes`, `company_logo`, `return_policy` | receipt templates | receipt views |
| `payment_message`, `invoice_default_comments`, `quote_default_comments` | document terms | invoice/quote views |
| `lines_per_page` | manage table page size | `app/Views/sales/manage.php:39` |
| `enforce_privacy` | customer delete (not sales) | `Customer.php:275` |

---

## 3. `Sale` model persistence (every SQL write)

`Sale` (`app/Models/Sale.php`) is a CI4 model on table `sales`, primary key `sale_id`, auto-increment, **no soft deletes**; allowed fields are `sale_time, customer_id, employee_id, comment, quote_number, sale_status, invoice_number, dinner_table_id, work_order_number, sale_type` (`:17-32`). `__construct` loads the `text` helper (`:34-38`).

Relevant physical schema (upstream MySQL, from migrations):
- `sales`: `sale_time timestamp default now`, `customer_id`, `employee_id default 0`, `comment text`, `invoice_number varchar(32) unique`, `sale_id`, `quote_number varchar(32)`, `sale_status tinyint default 0`, `sale_type tinyint default 0`, `dinner_table_id`, `work_order_number` (`app/Database/Migrations/sqlscripts/initial_schema.sql:501-516`; `3.0.2_to_3.1.1.sql:178-182`; `3.1.1_to_3.2.0.sql` adds work order).
- `sales_items`: `sale_id,item_id,description varchar(30),serialnumber varchar(30),line,quantity_purchased decimal(15,3),item_cost_price,item_unit_price,discount,discount_type,item_location,print_option`; PK `(sale_id,item_id,line)` (`initial_schema.sql:526-543`; later migrations add `discount_type` and `print_option`).
- `sales_items_taxes`: `sale_id,item_id,line,name,percent,tax_type,rounding_code,cascade_sequence,item_tax_amount,sales_tax_code_id,jurisdiction_id,tax_category_id` (`3.0.2_to_3.1.1.sql:180-190`; `3.3.0_indiagst.sql:38-42`).
- `sales_payments`: `payment_id` PK auto-increment, `sale_id,payment_type varchar(40),payment_amount decimal(15,2),cash_refund,cash_adjustment,employee_id,payment_time,reference_code varchar(40) default ''`; key `(sale_id,payment_type)` (`3.3.0_paymenttracking.sql:5-17`; `3.3.0_refundtracking.sql`; `20201108100000_cashrounding.php:15`).
- `sales_taxes`: `sales_taxes_id` PK, `sale_id,jurisdiction_id,tax_category_id,tax_type,tax_group varchar(32),sale_tax_basis decimal(15,4),sale_tax_amount decimal(15,4),print_sequence,name varchar(255),tax_rate decimal(15,4),sales_tax_code_id,rounding_code` (`3.3.0_indiagst.sql:46-66`).
- `customers`: `package_id`, `points` added after `discount_percent` (`3.0.2_to_3.1.1.sql:119-123`); `customers_packages(package_id,package_name,points_percent float,deleted)`; `sales_reward_points(id,sale_id,earned float,used float)` (`3.0.2_to_3.1.1.sql:79-117`).

### 3.1 `save_value` — the one write path for completed/suspended sales

Signature (`:520-534`): `save_value(int $saleId, string &$saleStatus, array &$items, int $customerId, int $employeeId, string $comment, ?string $invoiceNumber, ?string $workOrderNumber, ?string $quoteNumber, int $saleType, ?array $payments, ?int $dinnerTableId, ?array &$salesTaxes): int`.

Returns `sale_id` on success; `-1` for empty cart or transaction failure; `INSUFFICIENT_GIFTCARD_BALANCE` (-2), `INSUFFICIENT_REWARD_POINTS` (-3), `INSUFFICIENT_STOCK` (-4) (`app/Config/Constants.php:88-92`).

Exact order (all inside `db->transStart()` at `:561`, `transComplete()` at `:697`; nested calls also open/close transactions, which CI4 handles with savepoints/depth):

1. **Empty-cart guard**: `count($items) == 0` → return `-1` (`:543-545`). Note controller `postSuspend` does not pre-check; an empty suspend yields `-1`.
2. Build `salesData` (`:547-558`):
   - `sale_time = date('Y-m-d H:i:s')` (server now; no caller override)
   - `customer_id = Customer::exists($customerId) ? $customerId : null` (`:549`) — a bogus customer id becomes NULL.
   - `employee_id`, `comment`, `sale_status`, `invoice_number`, `quote_number`, `work_order_number`, `dinner_table_id`, `sale_type`.
3. If `saleId != NEW_ENTRY`: `clear_suspended_sale_detail($saleId)` (`:563-565`) — see §3.4. This happens **before** the header insert/update.
4. Insert (`NEW_ENTRY`) or update by `sale_id`; capture `insertID()` (`:567-574`).
5. Payment loop (`:576-618`), in cart order:
   - Split `payment_type` on `':'` with limit 2; prefix = first part.
   - Giftcard prefix `lang('Sales.giftcard')` = `"Gift Card"`:
     - `applyGiftcardPayment(number, amount, saleType, saleStatus)` (`:583-593`, implementation `:702-721`):
       - `isReturnCredit = saleType === SALE_TYPE_RETURN && amount < 0`.
       - If return credit **and** status != COMPLETED → return true (no balance change; suspended return does not credit).
       - Empty number → false.
       - Return credit → `Giftcard::incrementGiftcardValue(number, abs(amount))`.
       - Otherwise → `Giftcard::decrementGiftcardValue(number, amount)` which fails when `value < amount` or amount <= 0 (`app/Models/Giftcard.php` decrement method uses `where value >= amount` and `affectedRows() > 0`).
       - Failure → rollback, return `INSUFFICIENT_GIFTCARD_BALANCE`.
   - Rewards prefix `lang('Sales.rewards')` = `"Reward Points"`:
     - `Customer::adjustRewardPoints(customerId, -amount)`; failure → rollback, return `INSUFFICIENT_REWARD_POINTS` (`:594-599`).
     - Accumulate `totalAmountUsed += amount` (`:601`).
   - Insert `sales_payments` row: `sale_id,payment_type (full string incl. `:number`),payment_amount,cash_refund,cash_adjustment,employee_id,reference_code` (`:604-615`). `reference_code` defaults to `''` (`?? ''`), unlike the session's null.
   - Accumulate `totalAmount += payment_amount - cash_refund` (`:617`).
6. `save_customer_rewards(customerId, saleId, totalAmount, totalAmountUsed)` **before** items are written (`:620`). Implementation (`:1413-1436`):
   - Requires non-empty customer and `config.customer_reward_enable` truthy.
   - Reads `customers.package_id` from `Customer::getInfo`.
   - If package: `points_percent = Customer_rewards::get_points_percent(packageId)` (null → 0); `earned = totalAmount * points_percent / 100` (note: uses gross `totalAmount`, **not** net of points used).
   - `adjustRewardPoints(customerId, earned)`; inserts `sales_reward_points {sale_id, earned, used=totalAmountUsed}` via `Rewards::save_value` (`app/Models/Rewards.php:17-37`).
7. Reload customer (`:622`) for the taxable check later.
8. Item loop (`:624-681`), in **cart iteration order** (not sorted):
   - If `price == 0.00` → force discount 0 (`:627-629`).
   - Insert `sales_items`: `sale_id,item_id,line,description` truncated by `character_limiter(...,255)` (despite DB varchar(30) for description), `serialnumber` truncated to 30, `quantity_purchased`, `discount`, `discount_type`, `item_cost_price`, `item_unit_price`, `item_location`, `print_option` (`:631-647`).
   - If item master `stock_type == HAS_STOCK` **and** `saleStatus == COMPLETED` (`:649`):
     - `Item_quantity::changeQuantity(item, location, -quantity)` — atomic upsert adding a negative delta; creates the row if absent; **negative resulting quantity is allowed** (`app/Models/Item_quantity.php:88-104`). Failure → rollback, return `INSUFFICIENT_STOCK` (-4).
     - If `quantity < 0` → `Item::undelete(item_id)` (`:661-664`).
     - Insert `inventory`: `trans_date=now, trans_items, trans_user=employee, trans_location, trans_comment='POS <saleId>', trans_inventory = -quantity` (`:666-677`).
   - `Attribute::copy_attribute_links(item_id, 'sale_id', saleId)` (`:680`): copies rows from `attribute_links` where `item_id` and both `sale_id`/`receiving_id` are NULL into new rows carrying `sale_id` (`app/Models/Attribute.php:829-838`).
9. Taxes (`:683-686`): only when `customerId == NEW_ENTRY` (-1) **or** the customer is taxable:
   - `save_sales_tax(saleId, $salesTaxes[0])` inserts each group into `sales_taxes` (`:726-739`).
   - `save_sales_items_taxes(saleId, $salesTaxes[1])` inserts each detail row into `sales_items_taxes` with `sale_id,item_id,line,name,percent,tax_type,rounding_code,cascade_sequence,item_tax_amount,sales_tax_code_id,tax_category_id,jurisdiction_id` (`:743-767`).
10. Dinner table (`:688-695`): if `config.dinner_table_enable`:
    - completed → `Dinner_table::release(dinnerTableId)` sets `status=0` only when id > 2;
    - otherwise (SUSPENDED) → `occupy` sets `status=1` only when id > 2. IDs 1/2 are the seeded `Delivery` and `Take Away` pseudo-tables and must never be occupied (`app/Database/Migrations/sqlscripts/3.0.2_to_3.1.1.sql:41-43`; `app/Models/Dinner_table.php:124-152`).
11. `transComplete`; return `saleId` if `transStatus()` else `-1`.

Notable: **inventory/tax/reward side effects occur for a suspended sale's tax/reward/giftcard logic**; inventory does not because of the status guard. Suspending with a giftcard or rewards payment therefore debits those balances immediately; resuming and completing debits them again (upstream edge-case defect, see §10).

### 3.2 `Sale::update` (header + payments only)

`update($sale_id, $sale_data)` (`:453-518`) is a non-model-override used by `postSave`:
- Updates `sales` with all provided fields except `payments`.
- If update succeeded and `payments` non-empty: opens a transaction and loops:
  - `payment_id == NEW_ENTRY && payment_amount != 0` → insert row (including `reference_code`).
  - `payment_id != NEW_ENTRY && payment_amount != 0` → update that payment row by `payment_id` (type, amount, refund, adjustment).
  - `payment_id != NEW_ENTRY && amount == 0` → **delete** that payment row.
- Does not touch `sales_items`, inventory counters, taxes, rewards, giftcards, dinner tables.

### 3.3 Return handling

- A return is an ordinary `sales` row with `sale_type = SALE_TYPE_RETURN` (4) and **negative** `quantity_purchased`/prices; status COMPLETED.
- `save_value` deducts `-(-qty)` = positive stock delta, inserts a positive `inventory.trans_inventory`, and undeletes the item when `quantity < 0`.
- Payments may be negative (refund) rows; giftcard return credits the card via `incrementGiftcardValue`; rewards returns are not specially credited by `save_value` (a negative rewards payment would call `adjustRewardPoints(+amount)` and add points).
- Receipt/invoice views show negative quantities/totals verbatim (no `abs`).
- The controller forbids negative totals only outside return mode (`Sales.php:822-827`).

### 3.4 `clear_suspended_sale_detail`

`:1366-1392`: transaction; if `dinner_table_enable`, read the sale's table and `release` it; then delete in this exact order:
1. `sales_payments where sale_id`
2. `sales_items_taxes where sale_id`
3. `sales_items where sale_id`
4. `sales_taxes where sale_id`
No inventory reversal. Called from `save_value` for any `saleId != NEW_ENTRY` (the resume-a-suspended-sale path).

### 3.5 Delete / restore / cancel

- `delete_list(ids, employee_id, update_inventory=true)` loops `delete` and ANDs results (`:799-811`).
- `delete($sale_id, $purge=false, $update_inventory=true, $employee_id=null)` (`:828-872`):
  1. transaction;
  2. if `update_inventory && status == COMPLETED`: for each `sales_items` row whose item master `stock_type == HAS_STOCK`: insert `inventory` (`trans_comment='Deleting sale <id>'`, `trans_inventory=+quantity_purchased`) and `changeQuantity(+quantity_purchased)`;
  3. `update_sale_status(CANCELED)` (0→2);
  4. return transaction status.
  Hard deletes are never performed. Dinner table is **not** released here.
- `restore_list(ids, employee_id, update_inventory=true)` (`:813-820`) sets every id to `SUSPENDED`; parameters unused; no inventory re-deduction. Because improved auto-routing cannot reach the `restore` action, this is effectively inaccessible in 3.4.3 via HTTP.
- `delete_suspended_sale(sale_id)` (`:1343-1360`): transaction; release dinner table; set status CANCELED.
- `update_sale_status(id, status)` (`:1268-1276`): bare update.
- Controller `postCancel` (`:1716-1745`): if a sale id is active, release the current table, then if `sale_type == SALE_TYPE_WORK_ORDER` set CANCELED, else call `delete()` (which sets CANCELED), and set `session.sale_id=NEW_ENTRY`; if no active sale, remove temp items. Then `clear_all()` and reload. Quotes and POS suspended sales are therefore canceled, not removed.
- Controller `getDiscardSuspendedSale` (`:1747-1761`): reads `suspended_id`, `clear_all()`, `delete_suspended_sale(id)` (release + CANCELED), reload.

### 3.6 Suspended queries and document ids

- `get_all_suspended(?int $customer_id = null)` (`:1211-1225`):
  - `NEW_ENTRY` (-1) → all suspended;
  - otherwise filter `customer_id = $customer_id`;
  - selected `doc_id = sale_type==QUOTE ? quote_number : (sale_type==WORK_ORDER ? work_order_number : sale_id)`, plus `sale_id as suspended_sale_id, sale_status, sale_time, dinner_table_id, customer_id, employee_id, comment`.
  - Returns `[]` when the query returns false (tested at `tests/Models/SaleTest.php:434-440` — `testGetAllSuspended_ReturnsEmptyArrayWhenQueryFails`).
- `get_suspended_sale_info(id)` (`:1397-1405`): sales joined LEFT to people, filtered `sale_status = SUSPENDED`.
- `get_suspended_invoice_count()` (`:1330-1338`): count where `invoice_number IS NOT NULL AND sale_status = SUSPENDED`.
- `get_dinner_table(sale_id)` (`:1227-1240`): `null` for `NEW_ENTRY`, else row's `dinner_table_id`.
- `get_sale_type`, `getSaleStatus` (null when absent), `get_quote_number`, `get_work_order_number`, `get_comment`, `get_customer(id)` → `Customer::getInfo`, `get_employee(id)` → `Employee::getInfo` (`:1242-1330, 977-1001`).

### 3.7 Number generation and invoice counts

- `get_invoice_count()`: count of all rows with `invoice_number IS NOT NULL` regardless of status (`:357-365`). Backs `{CO}`.
- `get_invoice_number_for_year(year='', start_from=0)` / `get_quote_number_for_year` delegate to `get_number_for_year(field, year, start_from)` (`:381-410`): `COUNT(1)` where `DATE_FORMAT(sale_time,'%Y') = year` and field not null, plus `start_from`. Backs `{YCO}`/`{QCO}`.
- `get_sale_by_invoice_number(number)` (`:368-377`) used by receipt validation.
- Duplicate checks:
  - `check_invoice_number_exists(number, exclude_sale_id='')` (`:1018-1031`) — exact match, optional `sale_id !=`.
  - `check_quote_number_exists` (`:1003-1016`).
  - `check_work_order_number_exists` (`:1033-1045`) — **upstream defect: filters on `invoice_number`, not `work_order_number`** (`:1037`). Target "fixes" it; decide parity policy in §8/§9.
- `isValidReceipt(&$receiptSaleId)` (`:415-440`): accepts `"POS <digits>"` (case-insensitive POS, exact two tokens) and verifies existence; otherwise, when `invoice_enable`, looks up `invoice_number` and rewrites the reference to `"POS <sale_id>"`. Mutates the input by reference.

### 3.8 Manage search / `getInfo` (temp-table SQL)

`getInfo(sale_id)` (`:43-102`) calls `create_temp_table(['sale_id'=>…])` then aggregates:
- `amount_due = ROUND(SUM(sale_price), totals_decimals) + sales_tax + cash_adjustment` when tax excluded; when `tax_included`, `= ROUND(SUM(sale_price)) + cash_adjustment`.
- `sale_price` = percent: `qty*price - ROUND(qty*price*discount/100, decimals)`; fixed: `qty*(price-discount)` (fixed is per unit).
- `amount_tendered = MAX(payments.sale_payment_amount)` where that temp column sums non-adjustment payment amounts.
- `change_due = amount_tendered - amount_due`; `cash_refund = MAX(sale_cash_refund)`; `cash_adjustment = MAX(sale_cash_adjustment)`; `payment_type`/`reference_code` group-concatenated as `"type amount-refund"` / non-empty refs.
- Groups by `sales.sale_id, payments.reference_code`.

`search(...)` (`:115-205`) builds two temp tables:
- `sales_search_payments_temp`: per sale `sale_payment_amount`, `sale_cash_adjustment`, `sale_cash_refund`, grouped `payment_type "type amount-refund"` and `reference_code`, filtered by the date/customer/location WHERE clause (`:1444-1472`).
- `sales_items_taxes_temp`: per sale/item/line `tax` (sum item_tax_amount), `internal_tax` (tax_type=0), `sales_tax` (tax_type=1) (`:1473-1500`).
Then aggregates `subtotal = ROUND(SUM(sale_price)) - internal_tax`, `tax`, `total = ROUND(SUM(sale_price)) + sales_tax + cash_adjustment`, `cost`, `profit = total - cost`, `amount_due = total`, `amount_tendered`, `change_due`, `payment_type`; excludes `sale_status=0`? Actually `$where = 'sales.sale_status = 0 AND ...'` (`:127`) — hard-coded COMPLETED; date compare is `DATE(sale_time) BETWEEN start AND end` unless `date_or_time_format` is set, in which case raw `sale_time BETWEEN rawurldecode(start) AND rawurldecode(end)` (`:128-131`).
Filters in `add_filters_to_query` (`:1502-1568`):
- search: if valid receipt → `sales.sale_id = tokens[1]`; else LIKE on customer last/first/full name/company + exact `sales.sale_id` when digits.
- `location_id != 'all'` → `sales_items.item_location`.
- `selected_customer != false` → uses **the current session customer** via a new `Sale_lib` (`:1543-1547`), not a request id.
- payment filters: only_invoices (`invoice_number IS NOT NULL`), only_cash (LIKE `Cash` OR payments null), credit/debit/due/check/bank_transfer/wallet each LIKE the localized payment label.
`getPaymentsSummary` (`:213-318`) has the same filters, groups by `payment_type`, computes `SUM(payment_amount - cash_refund)` and count, applies sale-type semantics: `sales` → completed & payment_amount > 0; `quotes` → suspended & quote_number not null; `returns` → completed & payment_amount < 0; `all` → completed; merges every `Gift Card*` type into one `Sales.giftcard` row.

`get_search_suggestions(search)` (`:330-355`) returns customer-name labels unless the term is a valid receipt, in which case it returns `{label: search}`.

### 3.9 Item-kit explosion

Upstream kits are not persisted as kits in `sales_items`: the kit header item (`item_kits.item_id`) is added as a normal line priced by `PRICE_MODE_KIT` rules, then every `item_kit_items` component is added as another normal line with the same discount/type and kit price/print options (`Sales.php:587-620`; `Sale_lib.php:1343-1360`). Line ordering is therefore header-first followed by component order (`kit_sequence ASC` from `Item_kit_items::get_info`, `app/Models/Item_kit_items.php:20-35`). Receipt rendering can hide component lines via `print_option`; `sales_items.print_option` persists that choice. There is no kit id column in `sales_items`.

---

## 4. Totals math (exact)

### 4.1 Decimal scale and arithmetic primitives

- PHP `bcscale()` is set globally at boot to `max(2, totals_decimals() + tax_decimals())` (`app/Events/Load_config.php:44`). With defaults (2+2) bcmath operations carry 4 decimal places unless a scale is passed.
- `totals_decimals()` = `currency_decimals` default 2; `tax_decimals()` default 2; `cash_decimals()` default 2; `quantity_decimals()` default 0; all fall back with `?? 0` (`app/Helpers/locale_helper.php:313-344`).
- Line totals use bcmath, but discounts and tax amounts are rounded with PHP `round(..., HALF_UP)` at a configured scale. Display formatting is locale-dependent (`to_currency`, `to_decimals`, `to_quantity_decimals`; `locale_helper.php:370-426,428-456`) and is **not** part of stored values.

### 4.2 Line basis

For a line with `q` quantity, `p` unit price, `d` discount, `t` discount type:

```
extended          = q * p                                  (bcmath, scale 4)
discount_amount   = t == PERCENT ? round(q*p * d/100, totals_decimals, HALF_UP)
                                : round(q * d,       totals_decimals, HALF_UP)
total             = extended                                // undiscounted
discounted_total  = extended - discount_amount
```

`get_item_discount` (`Sale_lib.php:1633-1649`), `get_item_total` (`:1589-1604`), `get_extended_amount` (`:1619-1626`).
Important: a FIXED discount is **per unit** and is multiplied by quantity. Percent discounts are computed on the extended amount and rounded once per line.

Whole-sale "discount" in the register is not a separate entity: `get_discount()` sums per-line discount amounts (`:1511-1524`), and customer default discounts are applied per line only where the line discount is zero (`:1487-1508`).

### 4.3 Subtotal / total with taxes

`get_totals($taxes)` (`:700-789`):

```
prediscount_subtotal = Σ(q_i * p_i)                    (bcadd)
line_total_sum       = Σ discounted_total_i            (bcadd)  // "total" and "subtotal" start here
total_discount       = Σ discount_amount_i
for each tax group:
    if tax_type == EXCLUDED: total += sale_tax_amount ; sales_tax += sale_tax_amount
    else (INCLUDED):         subtotal -= sale_tax_amount
subtotal = line_total_sum - Σ INCLUDED tax amounts
total    = line_total_sum + Σ EXCLUDED tax amounts
tax_total = Σ EXCLUDED tax amounts
```

Thus for tax-included sites the receipt "subtotal" is the tax-exclusive amount while `total` remains the tax-inclusive price. `get_total()` (`:1693-1712`) independently computes `Σ discounted_total` and adds only excluded taxes.

Tax computation (`Tax_lib::get_taxes`, `app/Libraries/Tax_lib.php:86-171`):
- Charged only when customer id is `-1` (walk-in) or `customers.taxable` (`:96`).
- Per line, `tax_basis = get_item_total(q,p,d,t,true)` (discounted).
- Non-destination mode, per `items_taxes` row (or `sales_items_taxes` when `$sale_id != -1`):
  - included: `tax_amount = item_total - item_total/(1+rate/100)` (`get_included_tax`, `:183-189`), type 0.
  - excluded: `tax_amount = round(tax_basis * rate/100, tax_decimals, HALF_UP)` (`get_tax_for_amount`, `:76-83`), type 1.
  - only non-zero amounts are added to the group array; group key is `clean('X' . (float)rate . '% ' . tax_group)` (`:194-226`). `print_sequence` increments by 2 per added tax (`:127-129`).
  - each row also appends a `sales_items_taxes` detail with `item_id,line,name,percent,tax_type,rounding_code=HALF_UP,cascade_sequence=0,item_tax_amount,sales_tax_code_id=null,jurisdiction_id=null,tax_category_id=null` (`:133-146`).
  - sets `cart[line]['taxed_flag']`.
- Destination mode (`use_destination_based_tax`): line `tax_category_id` defaults to `config.default_tax_category` if null (`:150-152`); `apply_destination_tax` resolves tax code via `get_applicable_tax_code` (`:373-390`): register mode `'sale'` always uses `config.default_tax_code`; otherwise customer `sales_tax_code_id`, else city/state lookup, else default. Tax rows may have per-jurisdiction rounding codes and cascade sequences; excluded taxes cascade by adding accumulated tax to the basis when `cascade_sequence` changes (`:300-370`); item detail includes `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id`.
- `round_taxes` (`:252-294`) sorts by `print_sequence`, then rounds each group to `tax_decimals` if `tax_included`, else `totals_decimals`, honoring the group's rounding code. Tax group accumulation itself uses scale 4 (`:221-225`).

### 4.4 Cash rounding

`reset_cash_rounding()` (`Sale_lib.php:1455-1470`) enables rounding when `cash_decimals < totals_decimals` **or** code is `HALF_FIVE` (7). It runs on every controller reload, so the flag is recomputed per request and `cash_mode` is reset to false.

`get_totals` always computes `cash_total = check_for_cash_rounding(total)` when the flag is on; the rounding function is `Rounding_mode::round_number(code, (float)total, cash_decimals)` (`app/Models/Enums/Rounding_mode.php:69-88`):
- `ROUND_UP`/`ROUND_DOWN` use ceil/floor formulas;
- `HALF_FIVE` → `round(amount / 5, decimals, HALF_EVEN) * 5`;
- otherwise PHP `round(amount, decimals, code)` with codes 1..4.

Cash vs non-cash dues:
```
amount_due      = total      - payment_total
cash_amount_due = cash_total - payment_total
current_due     = cash_mode ? cash_amount_due : amount_due
threshold       = 10^-totals_decimals / 2
payments_cover_total = mode == 'return' ? current_due > -threshold : current_due < threshold
cash_adjustment_amount = payments_cover_total ? round(cash_total - total, totals_decimals, HALF_UP) : 0
```
`get_payments_total()` excludes rows with `cash_adjustment` truthy and flips `cash_mode` off when any non-Cash/Cash-Adjustment type is present (`:675-693`). The controller's cash-payment branch computes `amountDue - salesTotal` and inserts a `Cash Adjustment` row flagged `CASH_ADJUSTMENT_TRUE` when non-zero (`Sales.php:518-527`).

### 4.5 Payments, refunds, change

- Session payments are keyed by type; same type accumulates with `bcadd` (`Sale_lib.php:593-595`).
- Completion computes `amount_due` from totals (cash variant when `cash_mode`), then `amount_change = -amount_due` (`Sales.php:841`). When positive, it is stored as `cash_refund` on the existing Cash payment, or a new Cash row with `payment_amount=0` is appended (`:843-857`). Non-cash overpayment is therefore reported as cash change.
- `getInfo` derives `amount_tendered = MAX(sale_payment_amount)` (sum of non-adjustment payments) and `change_due = amount_tendered - amount_due`; `cash_refund` is reported separately (`Sale.php:43-102`).
- Edit-sale modal computes `balanceDue = round(amount_due - amount_tendered + cash_refund, totals_decimals, HALF_UP)`; when cash rounding is off and balance is negative it is clamped to 0 (`Sales.php:1486-1490`).

### 4.6 Quantity decimals and amount entry

`get_quantity_sold(total, price) = bcdiv(total, price, quantity_decimals())` (`:1608-1616`). This backs `ITEM_AMOUNT_ENTRY` lines: editing `discounted_total` recomputes quantity (`edit_item`, `:1273-1276`). With `quantity_decimals=2`, `10.00 / 3.00 = 3.33`, and the resulting line total is `3.33 * 3.00 = 9.99`, i.e. amount entry can never exceed the target exactly.

### 4.7 Worked fixtures (exact expected values)

Fixture assumptions unless stated: `currency_decimals=2`, `tax_decimals=2`, `quantity_decimals=2`, `cash_decimals=2`, `cash_rounding_code=0`, `tax_included=0`, walk-in customer, no customer discount, no cash rounding.

**F1 — percent discount + excluded tax.**
Cart: qty `2`, price `10.00`, discount `10` PERCENT; item tax `VAT 8%`.
- `discount_amount = round(20 * 0.10, 2) = 2.00`
- `total = 20.0000`; `discounted_total = 18.0000`
- `prediscount_subtotal = 20.0000`, `subtotal = 18.0000`, `total_discount = 2.00`
- tax basis `18.0000`; tax `round(1.44,2) = 1.44`; internal group key `X8-VAT` (via `clean()`), stored `tax_group = "VAT"`, `tax_rate = 8`
- `get_totals`: `subtotal=18.0000`, `total=19.4400`, `tax_total=1.4400`, `cash_total=19.4400`
- payment Cash `20.00` → `payment_total=20.0000`, `amount_due=-0.5600`, `cash_amount_due=-0.5600`, threshold `0.005`, `payments_cover_total=true`, `cash_adjustment_amount=0`
- completion: `amount_change=0.56`; cash row stored `payment_amount=20.00, cash_refund=0.56`; `totalAmount` used by rewards = `19.44`
- receipt: total `19.44`; Cash line `-20.00`; change `0.56`
- **target expected failure**: line total would be `18.00` only if percent path is right (it is), but `getCartTotals` computes `prediscountSubtotal - itemDiscount` with unrounded `2`, so 18.00 is same here; receipt total ignores tax entirely (`buildReceiptData` → `100.00`-style bug in F3).

**F2 — fixed discount is per unit.**
Cart: qty `3`, price `10.00`, discount `1.50` FIXED, no tax.
- `discount_amount = round(3 * 1.50, 2) = 4.50`
- `discounted_total = 30.00 - 4.50 = 25.50`; `total = 25.50`
- **target expected failure**: `getItemTotal(3,10,1.5,FIXED)` computes `30 - 1.5 = 28.50` (`src/lib/sale/types.ts:80`); `getItemDiscount` returns `1.50` (`:97-99`), so subtotal is `28.50` and tax basis is wrong.

**F3 — tax-included backout.**
Cart: qty `1`, price `110.00`, item tax `VAT 10%`, `tax_included=1`.
- `get_included_tax`: `110 - 110/1.1 = 10.00`
- `get_totals`: `subtotal = 110 - 10 = 100.00`; `total = 110.00`; `tax_total = 0`
- receipt: subtotal `100.00`, tax row `10.00`, total `110.00`
- **target expected failure**: `getCartTotals` returns `subtotal=110.00`, `total=110.00` (`src/lib/sale/types.ts:121-122`); `getTotal` adds the included tax and yields `120.00` (`src/lib/sale/sale-lib.ts:453-457`).

**F4 — receipt/invoice total must include excluded tax.**
Cart: qty `1`, price `100.00`, tax `8%` excluded; payment Cash `200.00`.
- upstream totals: `subtotal=100.00`, `total=108.00`, `amount_due=-92.00`, `amount_change=92.00`, cash row `200.00 / refund 92.00`
- **target expected failure**: `buildReceiptData` total = `100.00`, change = `200.00 - 100.00 = 100.00` (`src/lib/pdf/data.ts:22-23,39`); the receipt page duplicates this (`src/app/(secure)/sales/receipt/[id]/page.tsx:26-27,58`). Invoice page corrects the total (`invoice/[id]/page.tsx:26-28`) but shows paid `200` and no change/refund.

**F5 — cash rounding HALF_FIVE.**
Total `19.43`, `cash_decimals=2`, `cash_rounding_code=7`.
- `cash_total = round(19.43/5, 2, HALF_EVEN) * 5 = round(3.886,2)*5 = 3.89*5 = 19.45`
- payment Cash `20.00`: `amount_due=-0.57`, `cash_amount_due=-0.55`, `current_due=-0.55`, covered; `amount_change=0.55`; `cash_adjustment_amount=0.02`
- **target expected failure**: `roundNumber(HALF_FIVE)` is implemented as `Math.round(scaled*2)/(factor*2)` (`src/lib/tax/index.ts:55-56`), which for `1943` gives `1943` cents (no rounding); `resetCashRounding` does not enable when only `HALF_FIVE` is set and `cashDecimals == totalsDecimals` (`src/lib/sale/sale-lib.ts:654-662`). Cash rounding is additionally unreachable because no action passes `cashAdjustment` (`src/app/(secure)/sales/actions.ts:82-88`).

**F6 — return coverage.**
Return cart from a `POS 7` sale: qty `-2`, price `100.00`, tax none → total `-200.00`.
- payment Cash `-200.00`: `payment_total=-200`, `amount_due=0`, `current_due=0`; return test `0 > -0.005` → covered; `amount_change=0`.
- payment `0`: `current_due=-200`, `-200 > -0.005` false → not covered; `postComplete` blocks with `lang('Sales.amount_due_not_covered')`, except quote/invoice modes (`Sales.php:830-833`).
- **target**: no coverage check at all (`completeSaleAction`, `actions.ts:187-208`).

**F7 — rewards earning is on gross payments.**
Sale payments: Cash `100.00` + Reward Points `40.00`; customer package `5%`.
- `adjustRewardPoints(-40)` (use), then `earned = (100+40) * 5/100 = 7.0` (earn), `sales_reward_points {earned:7.0, used:40}`.
- net points delta `-33.0`.
- **target expected failure**: `addPayment` deducts 40 immediately (`src/lib/sale/sale-lib.ts:543-551`), `saveSale` deducts another 40 (`src/lib/sale/sale-model.ts:102-107`), and `saveCustomerRewards` computes `(total - used) * percent = 100*5% = 5` instead of 7 and never writes a rewards usage row (`:217-232`).

**F8 — giftcard.**
Card value `100`, payment `"Gift Card:123"` amount `60`.
- upstream: one decrement at save → `40.00`; insufficient (`value < amount`) → sentinel `-2` and rollback.
- **target expected failure**: UI emits `"giftcard"` not `"Gift Card:123"` (`src/components/sales/register.tsx:410-415`), so no card lookup occurs; if called with `"giftcard:123"`, `addPayment` decrements to 40 (`sale-lib.ts:534-542`) and `saveSale` decrements again to `-20` with no balance guard (`sale-model.ts:96-101`).

**F9 — destination tax additive vs cascading.**
Item `100.00`, jurisdictions State `10%` cascade 0 and Local `5%` cascade 1:
- State tax `10.00`; basis increases to `110.00`; Local `5.50`; total tax `15.50`.
- With both cascade 0: `10.00 + 5.00 = 15.00`.

**F10 — item counts.** Cart of one stock line qty `3` and one non-stock line qty `5`: `item_count = 1`, `total_units = 3` (non-stock excluded), while `total` includes both (`Sale_lib.php:711-715`).

---

## 5. End-to-end flows (upstream)

### 5.1 Register load (`GET /sales`)

1. `getIndex` sets `session.allow_temp_items=1` (`Sales.php:69-73`) and calls `reload()`.
2. `reload()` (`:1308-1425`):
   - initializes `sale_id` to `NEW_ENTRY` when empty (`:1310-1315`);
   - `reset_cash_rounding()` → `cash_rounding` flag; `cash_mode` forced false;
   - loads cart, customer data with spend stats (`_load_customer_data(..., true)`), register mode options, mode, selected dinner table, empty tables (includes the currently selected table), allowed stock locations, current location;
   - `tax_exclusive_subtotal = get_subtotal(true,true)`, then `Tax_lib::get_taxes(cart)` (this also mutates cart `taxed_flag`), discount, payments;
   - `get_totals(taxes)` → item_count, total_units, subtotal, total, payment_total, payments_cover_total, cash_mode, prediscount_subtotal, cash_total, non_cash_total, cash_amount_due, non_cash_amount_due;
   - chooses `total`/`amount_due` as cash variants when `cash_mode && (selected_payment_type == Cash || payments_total > 0)`;
   - `amount_change = -amount_due`;
   - comment, email flag, payment options (giftcard+rewards only if a customer is selected and `customer_reward_enable`; work-order modes also add `Cash Deposit`/`Credit Deposit`), reference-code payment types, `items`/`sales_change_price` UI grants;
   - invoice-number preview: if no session invoice number, `Token_lib::render(sales_invoice_format, [], false)` (save=false, no sequence increment) (`:1380-1392`);
   - print/price-work-order flags, `pos_mode`, quote/work-order numbers, keyboard shortcuts, mode label/customer-required label;
   - renders `sales/register`.

### 5.2 Add item (`POST /sales/add`)

1. `postAdd` (`:560-639`):
   - start discount = `config.default_sales_discount` / `default_sales_discount_type`; if a customer is selected and has a non-empty `discount`, use the customer's discount/type instead (`:564-578`).
   - read `item`, `Token_lib::parse_barcode(&quantity,&price,&item)` (`:580`); in `return` mode negate quantity; location = session sales location.
   - if mode `return` and the input is a valid receipt → `return_entire_sale` and skip add.
   - else if the input is a valid item kit (`Item_kit::is_valid_item_kit`, `app/Models/Item_kit.php:43-57`):
     - resolve kit info; `kit_item_id`, `price_option`, `print_option` (0 all, 1 priced, 2 kit-only), kit discount/type;
     - if same discount type, use the larger of kit discount and current discount; otherwise replace both with kit values;
     - add the kit header item via `add_item(kit_item_id, location, qty, discount, type, PRICE_MODE_KIT, price_option, print_option, parsed price)`; warning from `out_of_stock`;
     - add components via `add_item_kit(...)`; warning from first out-of-stock component;
   - else standard `add_item(item, location, qty, discount, type, PRICE_MODE_STANDARD, null, null, parsed price)`;
   - reload with `error` (`lang('Sales.unable_to_add_item')`) or `warning` (`out_of_stock` string).

### 5.3 Edit item (`POST /sales/editItem/{line}`)

1. Validate: `price required|decimal_locale|nonNegativeDecimal`, `quantity required|decimal_locale`, `discount permit_empty|decimal_locale|nonNegativeDecimal` (`Sales.php:644-657`).
2. Sanitize description/serial; price normalized to `number_format(..., totals_decimals)`; quantity parsed; `discount_type` raw; discount parsed with `quantity_decimals` when type set, else currency decimals; empty → 0 (`:661-671`).
3. Reject negative quantity outside return mode (`:673-677`); PERCENT discount > 100 (`:679-683`); FIXED discount > `abs(qty)*price` (`:685-689`).
4. Server-side `sales_change_price` grant check when the new price differs from the stored cart price; the UI-only `change_price` flag is not trusted (`:691-698`).
5. Location from POST; `discounted_total` parsed when non-empty; `edit_item`; `empty_payments()`; warning from `out_of_stock(item_id(line), location)` (`:700-711`).

### 5.4 Delete item / remove customer / change mode

- `getDeleteItem` calls `delete_item(line)` then `empty_payments()` (`:724-731`). Temp items are soft-deleted.
- `getRemoveCustomer` (`:739-748`): clear giftcard/rewards remainders, `delete_payment(lang('Sales.rewards'))` (key `"Reward Points"`), clear invoice and quote numbers, `remove_customer()`. Work-order number and comment survive.
- `postChangeMode` (`:266-312`): set mode; map mode→sale type (`sale`=POS 0, `sale_quote`=QUOTE 3, `sale_work_order`=WORK_ORDER 2, `sale_invoice`=INVOICE 1, anything else=RETURN 4); if dinner tables enabled: posted `dinner_table`, released table = current session table; if current is occupied and posted differs → `swap_tables(current, posted)`; then set posted table unconditionally; if posted `stock_location` is non-empty, different, and allowed for sales → set it; empty payments; reload.

### 5.5 Add payment (`POST /sales/addPayment`) — all branches

1. `payment_type` must be a non-empty string; if it is not exactly Gift Card/Reward Points but contains either label, reject with `lang('Sales.must_enter_numeric')` (anti-forged-type check) (`:405-426`).
2. Amount rule: return mode allows a negative decimal; otherwise `nonNegativeDecimal` (`:428`). Gift Card uses `integer` (the field is the card number); reference-code types (`Debit Card`, `Credit Card`, from `get_reference_code_payment_types`, `locale_helper.php:286-292`) require `alpha_numeric` with configurable min/max (defaults 3/20 in sale add-payment; 3/40 in edit-sale) and localized error messages (`:430-461`).
3. On failure: first validation error or `must_enter_numeric`; reload (`:463-467`).
4. Gift Card branch (`:469-494`):
   - parse the input as the **card number**; composed key `"Gift Card:<number>"`;
   - current payments for that key, current card value, card owner customer;
   - error if card belongs to another customer (`Giftcards.cannot_use`);
   - error if `card_value - already_added <= 0` and mode is `sale` (`Giftcards.remaining_balance`);
   - else compute remainder `max(card_value - get_amount_due(), 0)`, store remainder, warning `Giftcards.remaining_balance`, amount = `min(get_amount_due(), card_value)`, `addPayment(composed_key, amount)`.
5. Reward Points branch (`:496-517`):
   - customer must have `package_id`; points null→0;
   - error if `points - already_added <= 0` (`Sales.rewards_remaining_balance`);
   - else remainder `max(points - amount_due, 0)`, warning, amount = `min(amount_due, points)`, `addPayment("Reward Points", amount)`.
6. Cash branch (`:519-527`): `amountDue = get_total()` (may be cash-rounded), `salesTotal = get_total(false)`, parsed tendered; `addPayment(Cash, tendered)`; `cashAdjustment = amountDue - salesTotal`; if non-zero set `session.cash_mode=true` and `addPayment("Cash Adjustment", adjustment, null, CASH_ADJUSTMENT_TRUE)`.
7. Other branch (`:529-533`): parse amount and `reference_code`, `addPayment(type, amount, reference)`.
8. Reload with error/warning. No DB writes.

### 5.6 Delete payment (`GET /sales/deletePayment/{base64url}`)

`base64url_decode` (`app/Helpers/url_helper.php:23-30`) → `delete_payment(id)` → reload. `delete_payment` unsets by decoded type key, resets cash rounding (always), deletes the sibling Cash/Cash Adjustment while rounding is enabled, and writes the payments array.

### 5.7 Complete sale (`POST /sales/complete`)

1. Gather `saleId`, dinner table, cart, flags, comments, employee, company/account/tax info, invoice/work-order/quote numbers, customer data (`:758-806`).
2. `Tax_lib::get_taxes(cart)`; discount; payments; `get_totals`; map totals into view data; `cash_mode`.
3. Safety gates:
   - outside return mode, reject a negative `total` (`lang('Sales.negative_total_invalid')`) (`:822-827`);
   - if `payments_cover_total` is false and mode is neither invoice nor quote → reject (`lang('Sales.amount_due_not_covered')`) (`:829-833`).
4. Choose view `amount_due` (cash or normal); `amount_change = -amount_due`.
5. If change > 0: set `cash_refund` on the Cash payment, or append `Cash` with amount 0/refund change (`:843-857`).
6. Branch:
   - **Invoice mode** (`is_invoice_mode`): if format non-empty and no manual number → `Token_lib::render(sales_invoice_format)` (save=true, sequence may increment); duplicate check only for `NEW_ENTRY`; status COMPLETED, type INVOICE; `save_value`; on `-2/-3/-1` reload with error; else barcode, `clear_all()`, render `sales/<invoice_type>` (whitelisted via `Sale_lib::isValidInvoiceType`, fallback `invoice`) (`:859-911`).
   - **Work order**: status SUSPENDED, type WORK_ORDER; number from manual value or `render(work_order_format)`; duplicate check only on new; save; `set_suspended_id`; filtered cart; view `sales/work_order`; `clear_all` (`:913-952`).
   - **Quote**: status SUSPENDED, type QUOTE; number from manual or `render(sales_quote_format)`; duplicate check; save; `set_suspended_id`; view `sales/quote`; `clear_all` (`:954-991`).
   - **Else (POS/return)**: status COMPLETED, type RETURN or POS; save; barcode; receipt template whitelisted (`receipt_template` config, fallback `receipt_default`); view `sales/receipt` which includes `sales/<template>`; `clear_all` (`:993-1034`).
7. `save_value` performs all persistence described in §3.1. On sentinel failure the cart/session is **not** cleared (except error rendering).

### 5.8 Invoice / quote / work-order re-render (`getInvoice`, `getReceipt`)

`_load_sale_data(saleId)` (`:1202-1306`):
1. `clear_all()`; `reset_cash_rounding()`.
2. `Sale::getInfo` row; `copy_entire_sale` (populates cart/payments/customer/employee/numbers/type/comment/table/sale_id).
3. Cart/payments/selected payment type; `Tax_lib::get_taxes(cart, saleId)` (uses **stored** `sales_items_taxes` rows); stored `sales_taxes` for display; discount; transaction date/time; show-locations; include-HSN.
4. `get_totals`; store `cash_adjustment_amount` in session; map totals; choose cash/normal total/due when cash_mode and (selected type Cash or payments > 0); `amount_change=-amount_due`; employee initial; customer data.
5. sale id/number/status/comment/company info; barcode; `print_after_sale=false`; `price_work_orders=false`; mode label/customer-required; validated invoice view; validated receipt template view.
`getReceipt`/`getInvoice` then `clear_all()` and render. `getInvoice` renders `sales/<invoice_type>` (invoice, tax_invoice, custom_invoice, custom_tax_invoice). (`:1427-1467`)

### 5.9 Suspend / unsuspend / cancel

- **Suspend** (`postSuspend`, `:1763-1805`): collect current sale id, table, cart, payments, employee, customer, document numbers, sale type (empty→POS), comment; status SUSPENDED; `sales_taxes=[[],[]]`; `save_value`; on sentinels set error and `clear_all`; on success message + `clear_all`; reload. No inventory change; giftcard/reward payments are debited at save (§10).
- **Suspended list** (`getSuspended`, `:1807-1814`): `get_all_suspended(session customer)` (because default customer is -1 → all), view `sales/suspended`.
- **Unsuspend** (`postUnsuspend`, `:1822-1848`): requires `reports_sales`; POST `suspended_sale_id`; only if `> 0` and status SUSPENDED: `clear_all()`, `copy_entire_sale(id)`; then `change_register_mode(sale_type)`; reload. Invalid/completed ids leave the existing cart untouched (tested at `tests/Controllers/SalesControllerTest.php:672-725`).
- **Cancel** (`postCancel`, `:1716-1745`): described in §3.5.
- **Discard suspended** (`getDiscardSuspendedSale`, `:1747-1761`): described in §3.5.

### 5.10 Edit a completed sale (`getEdit` / `postSave`)

- `getEdit` (`:1469-1527`): requires `reports_sales`; loads `Sale::getInfo`, selected customer/employee, payment rows, computes `balanceDue`, clamps negative to 0 when rounding disabled, offers payment options **without gift card** (`get_payment_options(false)`), adds `Cash Adjustment` when rounding is enabled, appends `"--"` (`PAYMENT_TYPE_UNASSIGNED`) to new-payment options, returns `sales/form` modal.
- `postSave` (`:1585-1714`): requires `reports_sales`; parses `date` with `config.dateformat + ' ' + timeformat` → `sale_time`; builds header (`customer_id`/`employee_id` null when empty, comment, invoice_number); validates `reference_code_new` for reference-code types when a new payment is present; loops `number_of_payments`:
  - reads payment id/type/amount/refund type/refund amount/reference code;
  - `cash_adjustment` flag when type is Cash Adjustment;
  - accumulates tendered for non-adjustment (`amount - refund`);
  - if refund type does not contain Cash and refund amount > 0 → convert to a negative payment of `refund type` with amount reduced by refund and `cash_refund=0` (non-cash refund);
  - appends payment record with employee and reference code.
  - New payment: when type != `--` and amount non-empty; cash-adjustment → flag true; else sum tendered and compute `cashRefund = tendered - saleInfo.amount_due` when over.
  - Updates `inventory.trans_date` for all rows with `trans_comment = "POS <saleId>"`; then `Sale::update` (header + payments). Returns JSON success/message/id.
- Items, inventory quantities, taxes, giftcards and rewards are **not** recomputed.

### 5.11 Delete / restore sales

- Manage table toolbar delete/restore (`app/Views/sales/manage.php:66-72`; `public/js/manage_tables.js:270-333`) posts `ids[]` to `sales/delete` or `sales/restore`.
- `postDelete` (`:1529-1554`): requires `sales_delete`; `sale_id` param or POST `ids`; `delete_list`; JSON.
- `restore` (`:1556-1583`): same grant/JSON; unreachable via improved auto-routing (§1.1).

### 5.12 Email receipt / PDF

- `getSendPdf` (`:1041-1095`): requires `reports_sales`; `_load_sale_data`; only if `customer_email` non-empty:
  - subject `<localized type> <number>` where number is `saleData["<type>_number"]` if present (so receipt has `""`);
  - body = `config.invoice_email_message` rendered through tokens `Token_invoice_sequence(number)`, `Token_invoice_count('POS '.saleId)`, `Token_customer(saleData)`;
  - logo mime type and img tag;
  - renders `sales/<type>_email` to HTML, converts to PDF with `create_pdf`, sends via `Email_lib::sendEmail(to, subject, text, pdfPath)`;
  - message localized `Sales.<type>_sent|unsent + email`;
  - always `clear_all()`; JSON.
- `getSendReceipt` (`:1097-1134`): same permission/load; barcode + logo img tag; renders `sales/receipt_email` as the **message body**; sends without attachment; JSON.
- Token quirks (upstream): `Token_invoice_count` ignores its constructor value and always returns the global invoice count (`app/Models/Tokens/Token_invoice_count.php:37-41` — local `$value` is undefined); `Token_customer` returns `''` when a non-empty customer array is supplied, because it only looks up when `customer_info` is empty (`Token_customer.php:37-50`). Email templates are therefore partly broken upstream but still the parity baseline.

### 5.13 Print receipt

`app/Views/partial/print_receipt.php` injects a `printdoc()` JS function:
- with Firefox `jsPrintSetup`: sets margins from `print_top/left/bottom/right_margin`, clears headers/footers per `print_header`/`print_footer`, finds a printer whose name equals `localStorage[selected_printer]`, sets it, clears silent-print, sets `printSilent` when `!print_silently`, prints;
- otherwise `window.print()`.
- when `print_after_sale` is true, on load it calls `printdoc()` and after `print_delay_autoreturn * 1000` ms redirects to `site_url('sales')`.
`selected_printer` is `receipt_printer` on receipts, `invoice_printer` on invoice/quote/work-order, `takings_printer` on manage.

### 5.14 Dinner-table lifecycle

- Pseudo-tables `Delivery` (id 1) and `Take Away` (id 2) are seeded and never occupied/released by model guards (`3.0.2_to_3.1.1.sql:41-43`; `Dinner_table.php:124-152`).
- Register shows empty tables plus the currently selected table (`Dinner_table::get_empty_tables`, `app/Models/Dinner_table.php:45-67`).
- Mode change may swap the previously occupied table for the newly chosen one (`Sales.php:280-292`).
- Save: COMPLETED → release; SUSPENDED → occupy (`Sale.php:688-695`).
- Cancel: release current table (`Sales.php:1723-1726`), then cancel/delete.
- Discard suspended: release table via `delete_suspended_sale` (`Sale.php:1349-1353`).
- Edit-sale `postSave` does not touch tables; `clear_suspended_sale_detail` releases before reusing a sale id (`Sale.php:1371-1375`).

### 5.15 Giftcard payment and rewards redemption

Covered end-to-end in §5.5 (add), §3.1 (persist), §4.7 F7/F8 (numbers). Key ordering: balances are changed **only at save** upstream; the register remainder is informational.

---

## 6. Document rendering (receipt / invoice / quote / work order)

### 6.1 Template selection matrix

| Condition | Selected view | Cite |
|---|---|---|
| POS/return, `receipt_template == 'receipt_default'` | `sales/receipt` → `sales/receipt_default` | `Sales.php:1019-1029`; `app/Views/sales/receipt.php:10,54` |
| POS/return, `receipt_template == 'receipt_short'` | `sales/receipt` → `sales/receipt_short` | same |
| any other `receipt_template` value | fallback `receipt_default` (whitelist `isValidReceiptTemplate`) | `Sales.php:1020-1025` |
| `invoice_type` one of four allowed | `sales/invoice`, `sales/tax_invoice`, `sales/custom_invoice`, `sales/custom_tax_invoice` | `Sales.php:1287-1294,880-891` |
| invalid `invoice_type` | fallback `sales/invoice` | same |
| quote | `sales/quote` | `Sales.php:989` |
| work order | `sales/work_order` | `Sales.php:950` |
| email invoice/quote/work-order | `sales/<type>_email` | `Sales.php:1072` |
| email receipt button | `sales/receipt_email` as HTML body | `Sales.php:1118-1121` |
| `getReceipt` reprint | `sales/receipt` (template config) | `Sales.php:1427-1446` |
| `getInvoice` reprint | `sales/<invoice_view>` | `Sales.php:1448-1467` |

### 6.2 Receipt templates

`receipt_default.php` and `receipt_short.php` differ only in layout and two math choices:

| Feature | `receipt_default` | `receipt_short` |
|---|---|---|
| Header logo | `company_logo` → `uploads/<logo>` | same |
| Company name | shown when `receipt_show_company_name` | same (no `nl2br`) |
| Meta | customer if set, `Sales.id: POS n`, invoice number if non-empty, employee | same |
| Columns | description 40%, price 20%, qty 20%, total 20%, optional tax-indicator 5th col | description 50%, qty 25%, total 25%; no price col, no tax indicator |
| Item name | `ucfirst(name . ' ' . attribute_values)` escaped | same |
| Item total field | `receipt_show_total_discount ? total : discounted_total` | same |
| Second row | description if `receipt_show_description`; serial if `receipt_show_serialnumber` | same |
| Per-line discount row | fixed: `to_currency(discount) + Sales.discount`; percent: `to_decimals(discount) + Sales.discount_included`; then `discounted_total` | same |
| Whole-discount block | only if `receipt_show_total_discount && discount > 0`; subtotal row = **`prediscount_subtotal`**, then `customer_discount` = `-discount` | same block but subtotal row = **`subtotal`** (divergence/bug) |
| Tax block | only if `receipt_show_taxes`: subtotal + each `rate% group : to_currency_tax(amount)` | same |
| Total | `to_currency(total)` | same |
| Payment rows | split type on `:`, show first part, amount **negative** (`amount * -1`) | same |
| Giftcard balance | if `cur_giftcard_value` set and any giftcard payment | same |
| Change/due label | `amount_change >= 0 ? (only_sale_check ? Sales.check_balance : Sales.change_due) : Sales.amount_due` | same |
| Change amount | `to_currency(amount_change)` | same |
| Return policy | `nl2br(esc(return_policy))` | same |
| Barcode | `<barcode><br><sale_id>` | same |

Tax indicator column uses `taxed_flag` (`T` or blank) and is gated by `receipt_show_tax_ind`.

### 6.3 Invoice / tax invoice

`invoice.php`:
- Header/title `Sales.invoice`; customer block only when `isset($customer)` using `customer_info` (company/name, address, zip/city/state, account number, tax id; built by `_load_customer_data`, `Sales.php:1136-1200`).
- Logo per `company_logo`; company name per `receipt_show_company_name`.
- Meta: invoice number, date, `invoice_total = to_currency(total)`.
- Items columns: item number; HSN when `include_hsn`; item name (serialized/alt-description items show `description`, else `name + attribute_values`); quantity (`to_quantity_decimals`); price; discount (fixed currency, percent `to_decimals(discount).'%'`); an extra `customer_discount` column when whole `discount > 0`, showing `discounted_total / quantity` (average unit after discount); total `discounted_total`.
- Serialized extra row with serial number.
- Totals: subtotal, each tax group `(float)tax_rate . '% ' . tax_group` with `to_currency_tax`, total; each payment type first part and amount `*-1`; giftcard balance when a giftcard payment exists; change/due row only when `payments` non-empty; terms: `payment_message`, comments or `invoice_default_comments`, `return_policy`; barcode.
`tax_invoice.php`:
- Title `Sales.tax_invoice`; meta label `Sales.amount_due` (value `total`).
- Item name only (`name`, no attribute/description selection); description/serial sub-row condition is `is_serialized || allow_alt_description && !empty(description)` and it **always prints an HSN cell** even when `include_hsn` is false (bug).
- Change row includes `Sales.authorized_signature` label; barcode rendered as `<img src="data:image/png;base64,...">` (invoice.php prints raw markup).
- Contains a malformed `</td>` in the giftcard balance row (`app/Views/sales/tax_invoice.php:472`).

### 6.4 Quote and work order

`quote.php`:
- Title `Sales.quote`; meta quote number/date/invoice total.
- Items: item number/name/qty/price/discount/total; optional customer_discount column when `discount > 0` (`discounted_total/quantity`); serialized sub-row.
- Totals: subtotal/taxes/total; payments shown **positive** (`to_currency(payment_amount)`, no `*-1`), no giftcard-balance block, no change row.
- Terms: comments and `quote_default_comments`; no barcode; controls include `sales/discardsuspendedsale` (Discard).
`work_order.php`:
- Title from `$sales_work_order = lang('Sales.work_order')`; meta work-order label/number/date; amount due only when `print_price_info`.
- Items: item number/name/qty/discount always; price and total cells empty when `print_price_info` false.
- Totals block only when `print_price_info`; payments shown positive; comments; Discard button `sales/discard_suspended_sale` (snake-case URL; route is `discardsuspendedsale` so this link likely 404s upstream).

### 6.5 Email variants

| Template | Layout notes |
|---|---|
| `invoice_email.php` | standalone HTML, inline CSS from `public/css/invoice_email.css`, logo as `data:<mimetype>;base64`, customer `<pre>`, meta, item table without HSN/serial rows, subtotal/tax/total, payments negative, giftcard balance, change when payments, terms, SVG barcode data URI. |
| `quote_email.php` | same but quote number, no payments/change, comments + `quote_default_comments`, logo relative `uploads/...` (broken in email clients), no barcode image (prints quote number). |
| `receipt_email.php` | receipt markup widened, logo via `$img_tag` (base64 from `Email_lib::buildLogoImgTag`), no tax indicator, per-line discounts, receipt_show_* flags, payments negative, giftcard balance, change, SVG barcode data URI. |
| `work_order_email.php` | inline `<link>` to `base_url('css/invoice_email.css')`, logo relative path, items without price suppression, subtotal uses `$tax_exclusive_subtotal` (not provided by `_load_sale_data`! — view variable contract mismatch; PHP renders empty/0), tax rows iterate `taxes as $name=>$value` (stored `sales_taxes` rows are associative arrays, so `$name` is `0` and `$value` is an array → likely broken), total, comments. |

### 6.6 Token rendering (`Token_lib`)

`app/Libraries/Token_lib.php`:
- If the text contains `%`, `applyDateFormats` runs first. It supports strftime-style `%a %A %b %B %c %d %D %e %F %g %G %h %H %I %j %m %M %n %p %P %r %R %S %t %T %u %U %V %w %W %x %X %y %Y %z %Z`, `%%`, `%C`; unknown `%x` patterns are left as-is (`:66-143`).
- `scan` matches `{token}` or `{token:length}` where the token may not contain whitespace, `{`, `}`, `:`; lengths are arbitrary strings (`:145-172`).
- `generate`: replaces every **occurrence** (the token tree groups by token code and length); left-pads with zeros when length non-empty (`:174-190`).
- `resolve_token` searches caller-provided token objects first, then `Token::get_tokens()`, and returns the token object's `get_value($save)` (`:192-203`).
Tokens:

| Code | Class | Value semantics | Cite |
|---|---|---|---|
| `CO` | `Token_invoice_count` | global count of `invoice_number IS NOT NULL` (constructor value ignored due to bug) | `Token_invoice_count.php:37-41` |
| `ISEQ` | `Token_invoice_sequence` | if constructed with a value → that value; else `Appconfig::acquire_next_invoice_sequence($save)` (increments `last_used_invoice_number` only when save=true) | `Token_invoice_sequence.php:35-44`; `Appconfig.php:147-157` |
| `QSEQ` | `Token_quote_sequence` | `acquire_next_quote_sequence($save)` | `Token_quote_sequence.php:28-35`; `Appconfig.php:162-172` |
| `WSEQ` | `Token_work_order_sequence` | constructor value or `acquire_next_work_order_sequence($save)` | `Token_work_order_sequence.php:30-44`; `Appconfig.php:177-187` |
| `SCO` | `Token_suspended_invoice_count` | count of suspended rows with non-null invoice number | `Token_suspended_invoice_count.php:24-30`; `Sale.php:1330-1338` |
| `YCO` | `Token_year_invoice_count` | invoice count for current year (+ `start_from`) | `Token_year_invoice_count.php:24-30`; `Sale.php:381-410` |
| `QCO` | `Token_year_quote_count` | quote count for current year | `Token_year_quote_count.php:24-30` |
| `CU` | `Token_customer` | current session customer full name (only when no customer array supplied) | `Token_customer.php:31-51` |

Default formats: invoices `$CO` (legacy dollar form, not matched by `{...}` scanning), quotes `Q%y{QSEQ:6}`, work orders `W%y{WSEQ:6}` (`initial_schema.sql:48`; `3.0.2_to_3.1.1.sql:67`; `3.1.1_to_3.2.0.sql:31`). Operators are expected to configure `{CO}`/`{ISEQ}` forms; the register preview renders with `save=false` so it never increments a sequence (`Sales.php:1380-1392`).

### 6.7 Which config flags control what (rendering)

| Flag | Effect |
|---|---|
| `invoice_enable` | invoice mode/register label/invoice number field/duplicate check/reprint invoice link |
| `work_order_enable` | work-order register mode and document |
| `invoice_type` | invoice vs tax_invoice vs custom variants |
| `receipt_template` | default vs short receipt |
| `include_hsn` | HSN column on invoice (and tax invoice row bug) |
| `receipt_show_taxes` | subtotal/tax block on receipts |
| `receipt_show_tax_ind` | tax indicator column on default receipt |
| `receipt_show_total_discount` | whether item total column uses undiscounted `total` and whether whole-discount block is shown |
| `receipt_show_description` / `receipt_show_serialnumber` | second item row fields |
| `receipt_show_company_name` | company name on all documents |
| `receipt_font_size` | receipt wrapper font size |
| `company_logo` | header logo; email CID/data URI |
| `return_policy`, `payment_message`, `invoice_default_comments`, `quote_default_comments` | terms blocks |
| `print_after_sale` (session fallback), `print_receipt_check_behaviour`, `print_delay_autoreturn`, `print_silently`, `print_header`, `print_footer`, `print_*_margin` | printing behavior |
| `email_receipt_check_behaviour` / session `sales_email_receipt` | auto-email after sale |
| `invoice_email_message` | email body template with tokens |
| `multi_pack_enabled` | line names include pack |
| `line_sequence` | cart/DB/receipt ordering |
| `dateformat`/`timeformat` | all displayed dates |

### 6.8 Print options on lines

- `print_option` is persisted per line (`sales_items.print_option`).
- Receipt/invoice/quote/work-order loops generally render only `print_option == PRINT_YES` (0); `sortAndFilterCart` already removes non-`PRINT_YES` lines before save-render flows (`Sale_lib.php:190-253`).
- Kit print options: `PRINT_ALL` (0) prints everything; `PRINT_KIT` (2) prints only the kit header; `PRINT_PRICED` (1) prints components only when their computed price > 0 — mapped to `PRINT_YES`/`PRINT_NO` in `add_item` (`:1124-1140`).
- `get_filtered()` uses a different interpretation (`PRINT_ALL` always, `PRINT_PRICED` when price != 0, `PRINT_KIT` never) but is not routed (`Sales.php:1875-1895`).

---

## 7. Security / authz

### 7.1 Authentication and module grant

- Authentication: CI4 session (`person_id`). `Secure_Controller` resolves the employee and throws `RedirectException("no_access/$module_id/$submodule_id")` when `has_module_grant` fails (`app/Controllers/Secure_Controller.php:41-49`).
- `has_module_grant('sales')` (`app/Models/Employee.php:444-456`): counts grants whose `permission_id` starts with `sales`; 0 → deny; 1 → allow only if no `sales_*` rows exist in `permissions`; >1 → allow. This is why `sales` + `sales_stock` is the minimal cashier grant (`tests/Controllers/SalesControllerTest.php:58-73`).
- `has_grant(id, person)` is exact-match (`Employee.php:472-486`); `null` permission allows, `null` person denies.

### 7.2 Per-action authorization

| Action | Grant | Cite |
|---|---|---|
| all sales actions | module `sales` | `Secure_Controller.php:41-49` |
| manage, row, search, edit, receipt, invoice, save, sendPdf, sendReceipt, unsuspend | `reports_sales` | `Sales.php:84-88,135-139,152-156,1822-1826,1046-1050,1101-1105,1429-1433,1450-1454,1472-1476,1590-1594` |
| delete, restore | `sales_delete` | `:1531-1537,1558-1564` |
| change item price in `editItem` | `sales_change_price` (server-side, compare to stored cart price) | `:691-698` |
| UI price-edit input | `items` grant (`items_module_allowed`) **and** `sales_change_price` (`change_price`) | `:1408-1409`; `app/Views/sales/register.php:203-212` |
| takings buttons in register/receipt | `reports_sales` for display | `register.php:107-117`; `receipt.php:39-45` |
| send email actions | `reports_sales` | `:1046,1101` |

Upstream test coverage for these gates: `tests/Controllers/SalesControllerTest.php:129-320` (403 JSON for row/search/sendPdf/sendReceipt/save; redirects for edit/receipt/invoice), plus change-price tests `:321-390`.

### 7.3 CSRF and request hygiene

- Global CI4 CSRF filter runs before every request except `login|migrate` (`app/Config/Filters.php:77-84`); tests disable it (`:128-133`). Most mutating sales actions are POST; however item deletion and payment deletion are GET (`Sales.php:545,724`) and therefore **not CSRF-protected**. Sale delete (`postDelete`) is POST.
- Input sanitization: `FILTER_SANITIZE_FULL_SPECIAL_CHARS` / `FILTER_SANITIZE_NUMBER_INT` on controller inputs (`Sales.php:150-176,243-250,335-400,641-720,1585-1714`).
- Numeric validation: `decimal_locale` wraps `parse_decimals` (`app/Config/Validation/OSPOSRules.php:134-137`), `nonNegativeDecimal` rejects `< 0` (`:147-160`); add-payment amount is non-negative except return mode (`Sales.php:428`); edit price/discount non-negative even in return mode (`:646-657`).
- Price-change authorization is enforced server-side because the UI flag is client-controlled (`:691-698`), tested at `tests/Controllers/SalesControllerTest.php:330-400`.
- Negative total guard and payment-coverage guard on completion (`:822-833`), tested at `tests/Controllers/SalesControllerTest.php:620-670`.
- Anti-forgery on payment type: a type that merely *contains* Gift Card/Reward Points but is not exactly the allowed label is rejected (`:414-424`); tested at `:460-560`.
- Giftcard/reward balance enforcement is server-side at save, with rollback (`Sale.php:583-599,702-721`), tested in `tests/Models/SaleTest.php` and `tests/Models/CustomerRewardPointsTest.php` (atomic SQL check-and-write).
- XSS: views escape item names/descriptions/serials/tax names/customer text with `esc()`; table headers go through `transform_headers`; tax `tax_group` escaped in receipts/invoices; `register.php` escapes cart names and customer fields. Upstream regression test: `tests/Controllers/SalesControllerTest.php:676-700` injects `<svg onload=alert(1)>` as a tax name and asserts it is escaped on `/sales`.
- Sort-column injection: `getSearch` sanitizes `sort` against `salesHeaders()` (`Secure_Controller::sanitizeSortColumn`, `app/Controllers/Secure_Controller.php:73-88`; `Sales.php:160`). `order` is not whitelisted, but CI4 escapes order keywords only partially — potential injection surface upstream.
- Template-path hardening: `receipt_template` and `invoice_type` are whitelisted before being concatenated into view names (`Sales.php:1020-1025,885-890,1287-1296`). `getSendPdf($saleId, $type)` does **not** whitelist `$type` before `render("sales/$type_email")` and `lang('Sales.'.$type)` (`:1072-1078`) — a path/template-selection surface to close in the port.
- File handling: PDF temp file uses `sys_get_temp_dir()` and replaces `/` in the number (`:1079-1081`); no upload in sales.
- `postChangeItemNumber/Name/Description` update the item master from the sales module without an `items` grant (`:1898-1963`) — privilege issue worth closing or reproducing explicitly.

---

## 8. Target gap analysis (file by file)

Target sales files (verified inventory): `src/lib/sale/{types.ts,cart-store.ts,sale-lib.ts,sale-model.ts,sale-lib.test.ts}`, `src/lib/token/index.ts`, `src/lib/pdf/{data.ts,receipt.tsx,receipt_default.tsx,receipt_short.tsx,invoice.tsx,tax_invoice.tsx,quote.tsx,work_order.tsx}`, `src/lib/email/index.tsx`, `src/app/(secure)/sales/**`, `src/components/sales/**`, `src/lib/{customer_rewards,rewards,giftcards}/repository.ts`, `src/lib/tax/index.ts`, `src/db/schema/{sales,customers,giftcards,attributes}.ts`.
Absent: no `src/app/(secure)/sales/edit/…`, no quote/work-order HTML pages (only `pdf/route.tsx`), no `row`/`search` API endpoints, no `delete`/`restore` actions, no `form.tsx` equivalent, no receipt template selection, no print partial, no invoice-type selection, no `manage` search/filter/print/summary.

### 8.1 `src/lib/sale/types.ts` — calculator port

| Upstream behavior | Target | Cite | Verdict |
|---|---|---|---|
| `get_item_total` subtracts `qty*discount` for FIXED | subtracts `discount` once: `else t = t - discount` | `types.ts:77-82` | **Wrong**; F2 |
| Discount rounded per line to `totals_decimals` | `getItemDiscount` derives from the wrong total; no rounding to currency decimals | `types.ts:97-100` | **Wrong** |
| Percent discount on extended amount | same formula, rounded to 4 | `types.ts:79` | Mostly right, but forced 4-decimals instead of bcmath/currency rounding |
| `get_item_tax` uses `get_item_total(...,true)` and config tax_included | exists but unused; same fixed-discount bug propagates | `types.ts:106-113` | **Wrong** |
| `get_extended_amount(q,p,discount_amount)` | signature differs: takes `(q,p,discount,discountType)` and returns discounted total | `types.ts:89-91` | Contract mismatch |
| `get_quantity_sold(total, price)` with quantity decimals | takes `cart` and sums quantities | `types.ts:102-104` | **Missing amount-entry math** |
| `get_totals` tax-included subtotal subtracts included tax; total adds excluded tax; returns 10 fields | `getCartTotals` subtracts raw `itemDiscount`, never subtracts included tax, returns `{prediscountSubtotal, subtotal, itemDiscount, total, taxTotal}` | `types.ts:115-124` | **Wrong**; F3 |
| `get_discount` only counts discounts > 0, rounded per line | sums percent unrounded, fixed once; no `>0` filter | `types.ts:139-145` | **Wrong** for fixed and rounding |
| `calculate_subtotal(include_discount, exclude_tax)` uses per-item tax-exclusive helper when tax included | ignores `excludeTax`; fixed bug | `types.ts:126-136` | **Wrong** |
| no target equivalent of `get_subtotal` with includeDiscount/excludeTax flags used by register | `getSubtotal` hard-codes `(true,false)` | `types.ts:147-149` | Incomplete |

### 8.2 `src/lib/sale/cart-store.ts` — session replacement

| Upstream | Target | Cite | Verdict |
|---|---|---|---|
| PHP session per browser session | one row `cart_sessions.session_id = "cart:<personId>"` per employee, shared across devices | `cart-store.ts:9-36`; schema `src/db/schema/auth.ts:61-66` | Behavioral change; concurrent registers for one employee collide |
| default sale location from `Stock_location::getDefaultLocationId('sales')` | hard-coded `locationId: 1` | `cart-store.ts:59` | **Wrong** |
| `sales_customer` default `-1` sentinel | `customerId: null` | `cart-store.ts:52` | Different contract; every check must use null |
| `sale_id` default absent; `clear_all` sets -1 | `saleId: -1` | `cart-store.ts:55` | OK |
| default employee `-1` | `employeeId: null` | `cart-store.ts:53` | OK if consistently handled |
| default mode `sale`, sale_type 0 | same | `:56-57` | OK |
| default payment type absent | `"Cash"` | `:66` | Minor |
| `empty_cart` removes cart only | `clearCart()` writes a whole empty cart | `:68-70` | OK |
| session flags: `allow_temp_items=1` set on register index | `allowTempItems: false` never set true | `:64`; `src/app/(secure)/sales/register/page.tsx:14` does not set it | **Missing temp-item enablement** |
| no `suspended_id` default | `null` | `:57` | OK |
| cart lines keyed by line integer | array of lines | `types.ts:1-32` | Contract change; line lookups are O(n) but fine |
| extra fields not upstream: `promotionDiscount`, `unitPriceBeforePromo`, `promoQuantitySold`, `printAfterPromo`, `taxedFlag` | present | `types.ts:27-32` | Unused promotion fields; dead weight |
| no `tax_category_id`/`hsn_code` on cart line upstream? upstream has both | present | `types.ts:25-26` | OK |

### 8.3 `src/lib/sale/sale-lib.ts` — `Sale_lib` port

| Upstream | Target | Cite | Verdict |
|---|---|---|---|
| `add_item` merges by `item_id` **and** `item_location`, adds quantities with bcadd, ignores serialized accumulation | merges by `itemId` only, ignores location; JS addition; serialized never merges (because condition excludes serialized) | `sale-lib.ts:144-150` | **Wrong** (same item at two locations merges) |
| item resolution: item_number first, then id if numeric and not leading 0; include_deleted flag | id first if `/^\d+$/ && !startsWith("0")`, else item_number; suggestion fallback by name; deleted guard | `sale-lib.ts:129-139` | Semantics differ; name fallback can add wrong item silently |
| barcode parsing (`Token_lib::parse_barcode`) before add | never called (`parseBarcode` is dead, `src/lib/token/index.ts:72`) | `sale-lib.ts:107-164` | **Missing**; quantity/price from barcodes ignored |
| default/customer discount computed in `postAdd` and applied | `addItem` never applies config default or customer discount; `applyCustomerDiscount` is dead (`sale-lib.ts:423-436`) | `sale-lib.ts:107-164`; `actions.ts:37-46` | **Missing** |
| kit header + component explosion, kit price/print/discount rules | `addItemKit` exists but is never called; no kit detection in sales actions; price-mode logic absent from `addItem` | `sale-lib.ts:763-792`; `actions.ts:37-46` | **Missing entire kit flow** |
| price modes `PRICE_MODE_KIT`, `PRICE_OPTION_*`, print options | `opts.priceMode` accepted but unused; print option only direct set | `sale-lib.ts:142,159` | **Missing** |
| attributes on lines (`get_link_values`), stock name, in_stock, hsn, tax_category | all blank/zero/hard-coded except `hsnCode`/`taxCategoryId` from item; stockName `""`, attributeValues `""`, `inStock: 0` | `sale-lib.ts:77-104` | **Missing**; register cannot show attributes/stock |
| `multi_pack_enabled` appends pack name | never | `:77-104` | **Missing** |
| out-of-stock is checked by controller and returned as warning | `outOfStock` exists but is never called by actions; it also treats any negative stock as out (uses `<= 0`, ignores reorder level, ignores non-matching location rows incorrectly: sums only matching) | `sale-lib.ts:24-39`; `actions.ts:37-46` | **Missing warning behavior** |
| `edit_item` amount-entry path via `discounted_total` | `editItem` clamps `quantity<0` to 0 and `price<0` to 0, no `discounted_total` handling, no per-field validation, no change-price grant | `sale-lib.ts:166-180`; `actions.ts:48-51` | **Wrong**; returns/amount entry impossible |
| `edit_item` allows negative quantities in return mode | clamped | `:171` | **Wrong** |
| `delete_item` soft-deletes temp items | only removes line; temp DB row leaks | `:182-187` | **Missing** |
| `return_entire_sale` copies items, sets customer, leaves mode/session numbers to caller | sets mode `return`, saleType RETURN, clears payments/numbers/table; uses `Math.abs` of original quantity; no payments; sets customer | `:698-761` | Mostly right, but `Math.abs` breaks returning a return and invoice/quote/work-order numbers are always cleared |
| `add_item_kit` | unused (above) | `:763-792` | **Missing** |
| `copy_entire_sale` replays items with sale_id, print options, payments, customer, employee, quote/work-order/sale type/comment/table, sale_id, cash mode inspection | copies items with `Math.abs` quantity (loses return sign), no attributes/print/price-mode, payments without reference codes, sets customer/employee/numbers/type/table/location/saleId/mode, **does not set comment**, `cashMode` only all-"Cash" (ignores adjustment), no cashRounding | `:794-859` | **Incomplete/wrong** |
| `clear_all` clears 13 keys | resets entire cart shape; does not model employee/location reset explicitly (uses defaults) | `:861-865` | OK-ish |
| `reset_cash_rounding` enables on `cash_decimals < totals_decimals` OR HALF_FIVE; resets cash mode | requires `code > 0 && cashDecimals < totalsDecimals`; no HALF_FIVE-only; does not reset cashMode | `:654-662` | **Wrong** |
| `get_totals` 10-field contract with threshold/return inversion/cash adjustment | unused duplicate `getTotals` with wrong cash semantics: `paymentsCoverTotal = amountDue <= 0`, `cashTotal` = sum cash payments, `cashAmountDue = max(0,total-cashPaid)`, itemCount = line count | `:473-519` | **Wrong**, currently dead |
| `getTotal` adds excluded taxes only | adds **all** tax groups including included tax | `:453-457` | **Wrong** for tax-included |
| `getAmountDue` rounds via bcpow threshold | simple `roundNumber(total-paid, HALF_UP, totals)`; no cash variant | `:467-471` | Incomplete |
| `getPaymentsTotal` excludes adjustment rows | same | `:461-465` | OK |
| `addPayment` keyed by type, accumulates, no DB writes, reference code, cash-mode disable on non-cash | generates unique `paymentId`, accumulates by type, **writes giftcards/customers balances immediately**, converts negative cash to `cashRefund`, sibling adjustment only when caller passes `cashAdjustment`, sets cash mode heuristically, **no referenceCode field at all** | `:521-604`; `SalePayment` `types.ts:34-44` | **Severe**: double debit, no reference codes, wrong cash-rounding behavior |
| `delete_payment` unsets by type and sibling only when rounding enabled; resets rounding | finds by unique id, always deletes sibling, credits giftcard/rewards immediately, no reset cash rounding, no urldecode/base64 | `:614-646` | **Wrong** |
| `edit_payment` | exists, unused | `:606-612` | Dead |
| `apply_customer_discount` used by `postSelectCustomer` | dead; `selectCustomerAction` sets id only | `:423-436`; `actions.ts:58-63` | **Missing** |
| `sortAndFilterCart` filters `PRINT_YES` and sorts by line_sequence | filters only `PRINT_OPTION.DO_NOT_PRINT`; sequence 1 sorts by line (not stock type/description/name); sequence 2 identical to 0; never called on save | `:681-692` | **Wrong/unused** |
| `is_print_after_sale`/`is_email_receipt` `always`/`never`/session | compares config to `"1"` only and falls back to boolean configs `print_after_sale`/`email_receipt` | `:273-296` | **Wrong config semantics** |
| `getKeyShortcuts` parses config `key_*` + defaults | static `KEY_SHORTCUTS` F1..F12, ignores config | `:261-262`; `src/lib/constants.ts:79-93` | **Wrong** |
| `get_register_mode_options` config-driven, labels receipt/quote/wo/invoice/return | static REGISTER_MODES always includes all; labels differ ("POS Sale") | `:258-259`; `constants.ts:52-58`; `register.tsx:36-42` | **Wrong** |
| `get_invoice_type_options` four types | static four | `constants.ts:60-65` | OK |
| validators for invoice type/receipt template | `isValidInvoiceType` list correct; `isValidReceiptTemplate` includes **invoice/quote/work_order** plus receipts, wider than upstream (upstream only two receipts) | `sale-lib.ts:264-271`; `constants.ts:73-77` | **Wrong whitelist** (path safety still OK but parity differs) |
| `remove_temp_items` | exists; soft-delete then removes line | `:670-679` | Closer than upstream but unused by cancel |
| `empty_cart`/`set_cart` semantics | whole-object writes | `:189-234` | OK |
| session keys `sales_*` | all collapsed into one JSON document | `cart-store.ts` | Contract change; audit/observability lost |

### 8.4 `src/lib/sale/sale-model.ts` — `Sale` port

| Upstream | Target | Cite | Verdict |
|---|---|---|---|
| number generation in controller: invoice format tokens with `save=true`, duplicate check only on new sale, quote/WO formats with `%y` + sequence tokens | only invoice uses `render(sales_invoice_format,{save:true})` and only when mode invoice **and** status completed; quote/WO just `acquireNextSequence(...).toString()` ignoring `sales_quote_format`/`work_order_format`; no token date/`%` handling; no duplicate checks | `sale-model.ts:54-60`; `actions.ts:187-208` | **Wrong** |
| quote/WO are SUSPENDED | action always passes `SALE_STATUS.COMPLETED` even for quote/WO; `saveSale` never overrides status by mode | `actions.ts:195-202` | **Critical**: quotes/WOs are completed, never appear suspended, dinner tables released |
| invoice mode requires `invoice_enable`; mode is `sale_invoice` only when enabled | no config check | `sale-model.ts:54`; `sale-lib.ts:236-249` | **Missing** |
| customer existence check → null | raw `cart.customerId` into FK | `sale-model.ts:66` | Potential FK failure; upstream silently nulls |
| edit/resume: clear detail **before** header update, release dinner table | updates header first, then `clearSuspendedSaleDetail`; no table release | `sale-model.ts:77-90,234-239` | Order/behavior wrong |
| giftcard: split prefix, return credit branch, empty-number guard, insufficient sentinel, only at save | prefix `GIFT_CARD_PREFIX` check, no return-credit branch, no empty guard (empty number → lookup miss, silently no change), no insufficient check, decrement twice (add+save) | `sale-model.ts:96-101`; `sale-lib.ts:534-542` | **Severe**; F8 |
| rewards: `adjustRewardPoints(-amount)` with atomic guard, `INSUFFICIENT_REWARD_POINTS`, used accumulator | subtract points without guard, `totalAmountUsed += amount`; second subtraction from addPayment | `sale-model.ts:102-107` | **Severe**; F7 |
| insert payments includes `reference_code` | no column in schema, never written | `sale-model.ts:109-116`; `schema/sales.ts:55-62` | **Missing** |
| rewards earned from gross `totalAmount` with customer package; writes `sales_reward_points` | config key `use_customer_rewards` (wrong); join table `customer_rewards`/`rewards` (different model: packages vs sale points); `(total - used) * percent`; no usage record; runs even for returns with negative totals (adds negative points) | `sale-model.ts:217-232` | **Wrong schema + math + config**; F7 |
| `sales_items` insert with `character_limiter` and zero-price discount reset | no length limits (SQLite text accepts), no zero-price reset, description falls back to item name | `sale-model.ts:121-138` | Partial; upstream `description` is required by views |
| inventory: `changeQuantity` upsert, undelete on negative, inventory row with `trans_date`, comment `POS <id>` | manual select/update or insert, no negative floor, undelete only when `delta < 0` (target delta is positive for returns, so never), no `trans_date`, comment `POS ...` else `SUSPEND ...` (unreachable) | `sale-model.ts:140-166` | **Wrong** for returns/undelete; missing trans_date |
| inventory only for COMPLETED | same | `:140` | OK |
| attribute links copied from unlinked master rows | inserts one bogus link `definitionId:0, attributeId:null` per line, catches errors | `:168-175` | **Stub/wrong** |
| taxes saved only when walk-in or taxable customer; rows include extra columns | saves whenever arrays non-empty; schema lacks `tax_type`/rounding/cascade/IDs on item taxes and `print_sequence`/`name`/`tax_rate`/IDs on group taxes | `sale-model.ts:178-201`; `schema/sales.ts:37-53` | **Schema gap**; receipts lose rate/name/print order |
| dinner table release/occupy with ids >2 guard | sets status directly for any id, including Delivery/Take Away | `:203-209` | **Wrong** |
| empty cart → `-1` and no row | action throws if cart empty before calling; no sentinel | `actions.ts:191` | Different failure mode |
| sentinels -2/-3/-4 and rollback | no sentinels; transaction throws on error | `sale-model.ts:62-214` | **Missing** user-facing errors |
| `update` (edit sale) payment replacement/zero delete/cash refund calculation/non-cash refund conversion/inventory trans_date | updates header; skips zero payments instead of deleting; matches payment by **type** not payment_id (schema lacks payment_id); no refund math; no inventory update; unused | `sale-model.ts:695-737` | **Wrong**; no edit-sale UI |
| `cancelSale`/`deleteList`/`restoreList` | completed → CANCELED + inventory restore; non-completed → **hard delete**; release table for both; restore sets SUSPENDED | `sale-model.ts:501-547` | Upstream never hard-deletes; target hard-deletes quotes/WO; upstream restore has no inventory change (target same) |
| `deleteSuspendedSale` | release + CANCELED | `:489-499` | Correct (but discard action bypasses it) |
| `search`/`getFoundRows`/`getTotalRows`/`getPaymentsSummary` | no temp tables; no payment-type filters, no receipt search, no `sale_type` sales/quotes/returns/all semantics, no giftcard aggregation, no subtotal/tax/cost/profit/change_due, location filter uses non-upstream `sales.sale_location`, date is epoch comparisons | `:553-607`; `schema/sales.ts:17` | **Major gap**; manage page uses none of it |
| `getInfo` | no equivalent | absent | **Missing**; row/manage totals naive |
| `getAllSuspended` doc_id/date/employee/table | returns raw rows; no `doc_id`; customer filter uses truthiness (`if (customerId)`) so `-1` filters to -1 instead of "all" | `:460-465` | **Wrong** |
| `getSuspendedSales` | declares `total`/`itemCount` but select omits them (undefined at runtime) | `:254-285` | Bug |
| `isValidReceipt` | accepts `POS n` or numeric item id; no invoice-number lookup; type `ITEM` is not a receipt concept | `:445-451` | **Missing invoice lookup** |
| `getPaymentOptions` | hard-coded array, no config order/UPI/bank/wallet/deposit, giftcard placeholder `"Gift Card: "` with trailing space, rewards `"Rewards"` instead of `"Reward Points"` | `:453-458`; `constants.ts:94-100` | **Wrong localization/order** |
| `checkWorkOrderNumberExists` | checks `work_order_number` (upstream bug checks invoice_number) | `:383-390` | Intentional fix; document deviation |
| invoice/quote/year counts | SQL count with epoch year bounds; year token adds +1 (`YCO`), upstream `get_invoice_number_for_year` returns count + start_from (default 0, no +1) | `:321-358`; `token/index.ts:122-139` | **Off-by-one** for YCO/QCO |
| suspended invoice count | counts all suspended, not only those with invoice numbers | `:327-334` vs token `SCO` `token/index.ts:140-147` | **Wrong** for `{SCO}` |
| `copySaleToCart` | exists; unused; same abs-quantity and missing-reference problems | `:632-679` | Dead duplicate of `copyEntireSale` |
| `saveCustomerRewardPoints` | unused duplicate with same wrong math/schema | `:681-693` | Dead |

### 8.5 DB schema gaps (`src/db/schema/sales.ts`, `customers.ts`, `giftcards.ts`)

| Table/column (upstream) | Target | Cite | Impact |
|---|---|---|---|
| `sales_payments.payment_id` PK auto-increment | absent; no PK at all | `schema/sales.ts:55-62` | Cannot update/delete a specific payment; duplicates type rows ambiguous |
| `sales_payments.reference_code` | absent | same | Reference codes dropped from all flows |
| `sales_payments.payment_time` | present with default now, not exposed in cart saves (DB default) | `:62` | OK-ish |
| `sales_taxes.print_sequence`, `name`, `tax_rate`, `rounding_code` (as semantics), `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id` | only `taxType`, `roundCode`, `taxGroup`, `basis`, `amount`; `taxGroup` stores full `"X8% VAT"` key, not the group name | `:46-53` | Receipts cannot show clean tax labels/order; destination tax metadata lost |
| `sales_items_taxes.tax_type`, `rounding_code`, `cascade_sequence`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id` | only `name`, `percent`, `itemTaxAmount` | `:37-44` | Recomputing tax for reprints uses item master taxes, not the taxes actually charged |
| `sales.sale_location` | target-only column used for location filter | `:17` | Upstream location is per `sales_items.item_location`; target search/summaries are wrong |
| `sales.sale_cash_adjustment`, `sale_cash_refund` | target-only unused columns | `:18-19` | Dead schema |
| `customers.package_id` | absent; target models `customer_rewards(customer_id,reward_id)` + `rewards(name,points_percent)` | `schema/customers.ts:5-15,33-42` | Different rewards model; upstream package concept lost |
| `customers_packages(package_id,package_name,points_percent,deleted)` | absent | same | Configuration UI/data incompatible |
| `sales_reward_points(id,sale_id,earned,used)` | absent | same | No per-sale reward audit |
| `customers.points` integer | integer | `:12` | Fractional earn values may be stored/rounded inconsistently |

### 8.6 `src/lib/token/index.ts` — token port

| Upstream | Target | Cite | Verdict |
|---|---|---|---|
| scan `{token[:length]}` where token is any non-space/brace/colon string | regex `\{([A-Z]{2,4})(?::(\d+))?\}` | `token/index.ts:6` | **Narrower**: lowercase/mixed tokens and >4-char tokens no longer render |
| replace every occurrence | `result.replace(whole, padded)` replaces only the **first** occurrence of that literal | `:19-25` | **Wrong** for duplicated tokens |
| `%`-style strftime expansion | `{d}`,`{D}`,... style `{...}` expansion via `STRFTIME_RE`; `%` formats not supported | `:7,16,29-60` | **Wrong syntax**; default quote/WO formats (`Q%y{QSEQ:6}`) will keep `%y` literal |
| `ISEQ` honours supplied value | always acquires next sequence, ignoring `ctx`/value | `:116-117` | **Wrong**; re-render of an existing number increments sequences |
| `QSEQ`/`WSEQ` sequences | acquire next | `:118-121` | OK, but only used when format rendering is called (never for quote/WO) |
| `SCO` counts suspended invoices with `invoice_number NOT NULL` | counts all suspended | `:140-147` | **Wrong** |
| `YCO` count for current year, no +1 | adds +1 | `:122-130` | **Off-by-one** |
| `QCO` | named `YQO` | `:131-139,160` | **Wrong token code**; `{QCO}` falls through to literal |
| `CU` current customer (or constructor) | needs `ctx.customerId`; not passed by sale flows | `:148-154` | Incomplete |
| barcode parser token-driven (`I/W/P`) | simplified JSON-format regex parser, never called | `:72-108` | Dead/incorrect |

### 8.7 PDF layer (`src/lib/pdf/**`)

| Upstream | Target | Cite | Verdict |
|---|---|---|---|
| Receipt data built from sale session/copy with discounts, taxes, refunds, change, payment split, giftcard remainder | `buildReceiptData` sums `unitPrice * abs(quantity)` only, ignores discounts, tax in total, refunds, split labels, cash adjustment exclusion, giftcard remainder, tax rate/name; `paid` includes adjustment rows; `change = paid - total` | `pdf/data.ts:22-39` | **Wrong math**; F3/F4 |
| Receipt displays negative quantities/totals for returns | `Math.abs(quantityPurchased)` and positive totals/change | `pdf/data.ts:22,33`; `receipt/[id]/page.tsx:26-27,44-58` | **Breaks returns** |
| receipt_default vs receipt_short differ as §6.2 | Two components, but both same data and no config flags; short truncates description to 24 chars and omits price column | `pdf/receipt_default.tsx`; `pdf/receipt_short.tsx` | Partial layout only |
| invoice/tax invoice/quote/work order per §6.3-6.4 | Simplified A4 templates; invoice/tax/quote/WO use `ReceiptData`; no HSN values, no item number, no serial/description rows, no discount columns, no terms/comments/policy, no authorized signature on tax invoice (quote/WO do have signatures) | `pdf/invoice.tsx`, `tax_invoice.tsx`, `quote.tsx`, `work_order.tsx` | **Major rendering gap** |
| invoice PDF route picks invoice template | `/sales/invoice/[id]/pdf` renders `ReceiptDocument` | `invoice/[id]/pdf/route.tsx:3,13` | **Bug**; downloads receipt as invoice |
| tax-invoice type selection | `/sales/tax_invoice/[id]/pdf` exists but no page/links selecting it | route file only | Orphan |
| `custom_invoice`/`custom_tax_invoice` | no components/routes | absent | **Missing** |
| invoice number/quote number/WO number in meta | all templates print `#{data.saleId}` (DB id), not the document number | `pdf/invoice.tsx:34` etc. | **Wrong** |
| email PDF variants | `sendSaleEmail` passes raw DB context (`ctx`) to components typed as `ReceiptData` | `src/lib/email/index.tsx:84-108` | **Broken**: `data.company`, `data.lines`, `data.total` undefined; PDF render will throw or emit blank |
| `buildReceiptData` used by email-action | yes, in `sales/email-action.tsx:54`, but those actions are never imported/used | `email-action.tsx:83-96` | Dead code |

### 8.8 `src/lib/email/index.tsx`

| Upstream | Target | Cite | Verdict |
|---|---|---|---|
| per-type email HTML template with tokens, comments, logo CID | generic `<p>Dear ...` HTML, `invoice_email_message` only for invoice, no token rendering, no template-specific data | `email/index.tsx:84-114` | **Missing** |
| recipient from selected customer; skip with localized `*_no_email` message | `sendSaleEmail` returns `{ok:false,message:"Customer email not set"}`; no localized strings | `:87` | Partial |
| `Email_lib` from `config.email` + `config.company`, protocol/mailPath/SMTP crypto/timeout | nodemailer host/port/tls; from `email`/`company`; logo attached from `public/uploads/<logo>` | `:30-59` | Close enough for SMTP |
| PDF attachment for invoice/quote/WO/receipt | attachments, but built from wrong data (above) | `:94-108` | Broken |
| `sendSaleEmail` caller (`sendPdfAction`) | action exists but no UI calls it; receipt/invoice pages have no email buttons | `actions.ts:217-220`; pages | **Missing UI wiring** |

### 8.9 Config helper (`src/lib/config/index.ts`)

- `getConfig` reads a cached `Map` from `app_config` (`:10-21`); cache is process-global and never invalidated by external writes except `setConfig`/`acquireNextSequence` (`:47-72`). Upstream refreshes settings cache on save (`Appconfig::save`, `app/Models/Appconfig.php:77-90`). Multi-process Next workers can serve stale config.
- `getConfigBool` accepts `"1"`/`"true"`/`"TRUE"` (`:23-27`); upstream treats `"1"` primarily.
- `acquireNextSequence` performs an atomic `UPDATE ... value+1 RETURNING` and inserts `"1"` if missing (`:54-72`). Upstream reads cached config, increments, then saves (`Appconfig.php:147-187`) — target is safer but returns 1-based differently when key absent (upstream `0+1`).
- `totalsDecimals`/`taxDecimals`/`cashDecimals`/`quantityDecimals` defaults are 2/2/2/0 (`:74-84`); upstream defaults come from app_config rows (currency 2, tax 2, quantity 0, cash 2).

### 8.10 `src/app/(secure)/sales/**` and `src/components/sales/**`

| Upstream surface | Target | Cite | Verdict |
|---|---|---|---|
| `GET /sales` register with modes/table/location/customer/payments/comments/print/email/invoice number/keyboard help | single client `Register` page; modes hard-coded; no print-after-sale, price-work-orders, keyboard shortcuts config, invoice number uses one field for all document types | `register/page.tsx:13-63`; `register.tsx:36-42,330-340` | **Partial** |
| register item table editable price/qty/discount/description/serial/discounted_total with per-row update | only price/qty/discount inline; no description/serial/discounted_total; edits fire per keystroke `onChange` server actions | `register.tsx:199-235` | **Missing** and race-prone |
| add item supports barcode, kits, receipts in return mode | server action: `POS n` always triggers returnEntireSale regardless of mode; no kit/barcode | `actions.ts:37-46` | **Wrong** |
| customer select applies discount and validates existence | sets id only | `actions.ts:58-63` | **Missing** |
| change mode sets sale type, dinner-table swap, location validation, empties payments | `setMode` sets mode/type/payments; no table/location | `actions.ts:77-80`; `sale-lib.ts:236-249` | **Missing** |
| payment form: type select, amount, reference code, giftcard number, rewards, cash adjustment, split payments | type/amount only; giftcard prompt uses lowercase `"giftcard"` never present in options; rewards option is `"Rewards"`; no reference code; no cash adjustment; no negative-return allowance indication | `register.tsx:387-425` | **Major gap** |
| delete payment by base64url type key | deletes by generated paymentId | `register.tsx:363-369`; `actions.ts:90-94` | Contract change |
| suspend/complete/cancel; cancel has confirmation | suspend + complete only; **no cancel button**; complete always enabled when cart non-empty | `register.tsx:428-445` | **Missing cancel** |
| complete validates coverage/negative total/duplicates and branches by mode | no validation, no duplicates, no mode-status branch, redirects quotes/WOs to non-existent pages | `actions.ts:187-208` | **Broken** |
| suspended list with doc id/date/table/customer/employee/comment and unsuspend form | table date/type/number/comment; no customer/employee/table; unsuspend has no reports_sales check and no status guard | `suspended-table.tsx`; `actions.ts:172-177` | **Missing authz/status guard** |
| manage takings JSON table, search, filters, payment summary, totals row, print, delete/restore, receipt/invoice links | static completed-sales list, naive total, invoice link only; no search/filters/pagination/summary/delete/restore/print | `manage/page.tsx:8-50` | **Major gap** |
| edit-sale modal + save | absent | no files | **Missing** |
| receipt/invoice/quote/work-order HTML pages with print/email/back buttons | receipt + invoice HTML pages only; no quote/WO pages; no print/email buttons; receipt math wrong | `receipt/[id]/page.tsx`, `invoice/[id]/page.tsx` | **Partial/broken** |
| email actions | server actions exist in `email-action.tsx` but nothing imports them; `sendPdfAction` uses broken lib email | `email-action.tsx`; `actions.ts:217-220` | **Dead** |

### 8.11 Explicit verification checklist (requested items)

| # | Item | Upstream truth | Target | Evidence | Verdict |
|---|---|---|---|---|---|
| 1 | **Return flow** | Mode `return` negates scanned quantity (`Sales.php:582-584`); scanning a valid `POS n` loads the whole sale negatively (`Sale_lib.php:1317-1331`); save stores negative quantities, adds stock, positive inventory row (`Sale.php:649-677`); documents print negatives verbatim | `returnEntireSale` creates negative lines and mode/saleType, but only when input matches `POS n` **in any mode** (`actions.ts:37-46`); `editItem` clamps negative qty to 0 (`sale-lib.ts:171`); save converts `qty` to `-abs(line.quantity)` (`sale-model.ts:124`) which is correct only if the line is already negative; `buildReceiptData` and receipt page `abs()` hide the sign (`pdf/data.ts:22,33`; receipt page `:26,44-58`) | `sale-lib.test.ts:120-150` only asserts cart-level negatives; no save/document assertions beyond stock +2 | **Partial, documents broken**. Must keep negative signs through save and rendering; add mode guard; support amount-entry/negative edit in return mode |
| 2 | **`cash_refund`** | Only set at completion from `amount_change > 0`: existing Cash row refund or new zero-amount Cash row (`Sales.php:841-857`); stored per payment (`Sale.php:604-611`); `getInfo` reports it (`Sale.php:73-74`) | `addPayment` converts any negative Cash amount to `cashRefund` at **entry time** and zeroes `paymentAmount` (`sale-lib.ts:554-559`); completion never computes change/refund (`actions.ts:187-208`); receipts ignore `cashRefund` (`pdf/data.ts:38-39`) | `sale-lib.test.ts:152-170` asserts entry-time conversion (a target-only behavior) | **Wrong timing/semantics**. Upstream stores overpayment as positive payment + refund; target's approach changes payment totals and receipt lines |
| 3 | **Sibling `cash_adjustment` deletion** | Delete unsets the named type; **only if `reset_cash_rounding()` returns true** does it also unset the Cash/Cash Adjustment counterpart (`Sale_lib.php:642-661`); delete payment UI shows all rows including adjustment; `get_payments_total` excludes adjustment rows | `deletePayment` finds by generated `paymentId`, always removes `siblingId` both directions, credits giftcard/points, resets nothing (`sale-lib.ts:614-646`); cash adjustment rows can only be created by passing a non-zero argument, which no caller does | `sale-lib.test.ts:172-200` constructs siblings manually via `addPayment(..., 0.03)` and asserts deletion | **Functionally close but unreachable**. No production path creates adjustments; deletion lacks the rounding-enabled condition and reset |
| 4 | **Edit-sale inventory reversal** | Upstream does **not** reverse inventory for header edits: `getEdit/postSave` only update sales + payments + `inventory.trans_date` (`Sales.php:1585-1714`; `Sale.php:453-518`). `save_value` for a non-new sale clears **detail only** (no inventory reversal) because it is used for suspended resumes, not completed edits (`Sale.php:563-565,1366-1392`) | No edit-sale UI or save path at all; `update()` exists but unused and payment matching is wrong (`sale-model.ts:695-737`) | none | **Missing feature**. The correct parity spec is: no item/inventory reversal; header/payments/time only; document why |
| 5 | **Dinner table release on CANCELED** | `postCancel` releases the session table before cancel/delete (`Sales.php:1723-1726`); `delete_suspended_sale` releases (`Sale.php:1349-1353`); `delete()` itself does not; `release/occupy` ignore ids 1/2 (`Dinner_table.php:124-152`) | `cancelSale` releases for completed and non-completed paths (`sale-model.ts:529-535`); `deleteSuspendedSale` releases (`:489-499`); **`discardSuspendedSaleAction` only calls `updateSaleStatus(CANCELED)` and does not release** (`actions.ts:226-234`); `saveSale` mutates status for ids 1/2 (`:203-209`) | test only covers `cancelSale` release (`sale-lib.test.ts:202-233`) | **Partial**. Add release to discard; add id>2 guard; add test for discard and for Delivery/Take Away |
| 6 | **Rewards schema/config key** | Config `customer_reward_enable`; `customers.package_id` → `customers_packages.points_percent`; `customers.points` adjusted atomically with a balance guard; `sales_reward_points(sale_id,earned,used)` written per sale (`Sale.php:594-601,620,1413-1436`; `Customer.php:249-262`) | Config `use_customer_rewards` (`sale-model.ts:219`); `customer_rewards(customer_id,reward_id)` join + `rewards(name,points_percent)` package-like table (`schema/customers.ts:33-42`); points guard absent; no usage table; earn formula `(total-used)*percent` (`:226`); double deduction from addPayment | no rewards-specific unit test | **Wrong key/schema/math** |
| 7 | **Attributes on sale lines** | `add_item` reads master attribute values (sale_id null) and stores concatenated values on the line (`Sale_lib.php:1149-1162`); `save_value` copies master attribute links to the sale via `copy_attribute_links` insertBatch (`Sale.php:680`; `Attribute.php:829-838`); invoice/receipt display `attribute_values` | `addItem` leaves `attributeValues`/`attributeDtvalues` empty and never calls its local `getAttributesByItem` (`sale-lib.ts:77-104,54-69`); `saveSale` inserts a placeholder link `{attributeId:null,definitionId:0}` and swallows errors (`sale-model.ts:168-175`) | `src/lib/sale/sale-lib.test.ts` has no attribute test | **Missing/stub** |
| 8 | **Suspended quote / work order** | Quote completion status = SUSPENDED, type QUOTE, number from `sales_quote_format` (`Sales.php:954-991`); WO = SUSPENDED, type WORK_ORDER, `work_order_format` (`:913-952`); both set `suspended_id`; both render documents; unsuspend requires SUSPENDED + `reports_sales` | `completeSaleAction` always calls `completeSale` → status COMPLETED for every mode (`actions.ts:187-208`); `saveSale` generates a quote/WO number but does not change status (`sale-model.ts:54-60`); redirects to `/sales/quote/{id}` and `/sales/work_order/{id}` which have **no page**, only `pdf/route.tsx`; `unsuspendAction` has no permission/status check (`actions.ts:172-177`) | e2e only tests mode switching, not completion (`e2e/sales.spec.ts:120-145`) | **Critical** |
| 9 | **Token sequences** | `{ISEQ}` increments only when `save=true` and uses supplied value when present (`Token_invoice_sequence.php:35-44`); preview uses `save=false` (`Sales.php:1385`); `{CO}` count; `{SCO}` suspended-with-invoice count; `{YCO}/{QCO}` year counts; `{CU}` customer; `%` strftime; replace-all | `ISEQ` always increments regardless of context (`token/index.ts:116-117`); `SCO` counts all suspended (`:140-147`); `YCO` adds 1 (`:122-130`); quote-year token is `YQO` not `QCO` (`:131-139,160`); no `%` strftime; first-occurrence-only replacement (`:19-25`); `CU` requires `ctx.customerId` never supplied; quote/WO never render formats at all (`sale-model.ts:56-59`) | no token tests | **Wrong** |
| 10 | **Receipt data math** | Subtotal excludes included tax; total includes excluded tax; line totals honor discounts; payment rows exclude adjustments from tender and print `-amount`; change = `-amount_due`; giftcard remainder separate; negative return values preserved (§4) | `buildReceiptData` total = Σ `price*abs(qty)`, ignores discount/tax/refund/adjustment; change = Σ `paymentAmount - total`; tax lines rendered though total excludes them (`pdf/data.ts:22-39`); receipt page duplicates it (`receipt/[id]/page.tsx:26-27,50-58`) | e2e asserts only `$108` register total from cart math, not receipt (`e2e/sales.spec.ts:35-42`) | **Wrong** |
| 11 | **Payment localizability** | Payment labels come from `lang('Sales.*')`: Cash, Check, Debit Card, Credit Card, Due, Gift Card, Reward Points, Bank Transfer, Wallet, UPI (India), Cash Deposit/Credit Deposit (WO) (`locale_helper.php:240-292`; `Sale.php:954-975`; `app/Language/en/Sales.php:12-208`); order from `payment_options_order`; giftcard stored `"Gift Card:<number>"`; adjustment `"Cash Adjustment"`; rewards `"Reward Points"` | Hard-coded English array `["Cash","Check","Debit Card","Credit Card","Due","Bank Transfer","Wallet"]`, plus `"Gift Card: "` and `"Rewards"` (`sale-model.ts:453-458`; `constants.ts:94-100`); adjustment constant lowercase `"cash_adjustment"` (`constants.ts:100`); no config order/UPI/deposits; UI option is `"giftcard"` (`register.tsx:410`) | none | **Wrong localization/strings**; stored rows will not match upstream |

### 8.12 Test surface gap

Upstream tests mapped:

| Upstream test | What it protects | Target equivalent |
|---|---|---|
| `tests/Controllers/SalesControllerTest.php:129-320` | `reports_sales` gates on row/search/edit/receipt/invoice/sendPdf/sendReceipt/save | none; target pages use `requirePermission("sales")` only (`receipt/[id]/page.tsx:10`, `invoice/[id]/page.tsx:10`, `manage/page.tsx:9` uses `("reports","sales")`) |
| `:321-390` | `sales_change_price` enforced server-side | none; `editItemAction` has no auth check (`actions.ts:48-51`) |
| `:392-615` | addPayment negative/malformed amount rejection, giftcard type forging, reference-code validation, cash negative rejection | none; `addPaymentAction` accepts arbitrary type/amount (`actions.ts:82-88`) |
| `:616-686` | complete rejects uncovered payment; quote/invoice zero-payment allowed; tax-name XSS escaping | none; target has no coverage check; React escapes by default |
| `:688-725` | unsuspend authz + status guard + cart replacement | none |
| `tests/Models/SaleTest.php` | giftcard insufficient sentinel/rollback; substring type must not match; reward insufficient sentinel/rollback; stock decrement incl. missing quantity row; delete restores stock; `get_all_suspended` query failure; return giftcard credit; suspended return no credit; empty giftcard number sentinel | partial: `sale-lib.test.ts:236-300` covers return stock restore only; no sentinel tests |
| `tests/Libraries/Sale_libPaymentTest.php` | payment add/accumulate/reference code/edit/delete | target `sale-lib.test.ts:152-200` covers cashRefund/sibling only; no reference code/edit tests |
| `tests/Models/CustomerRewardPointsTest.php` | atomic reward-point check-and-write; concurrent decrements | none; target read-then-write double-spend (`sale-lib.ts:545-549`, `sale-model.ts:103-106`) |

Target tests present: `src/lib/sale/sale-lib.test.ts` (6 tests: return cart, cash refund conversion, non-cash negative, sibling deletion, cancel table release, return save stock) and `e2e/sales.spec.ts` (empty cart, add item, edit quantity, add payment, complete, suspend/unsuspend, return mode, mode switch). `src/lib/tax/tax.test.ts` covers tax math but encodes target deviations (default-tax fallback, fixed-discount basis indirectly).

---

## 9. Implementation obligations (ordered)

Each obligation is independently reviewable and testable. "Parity" means byte/behavior equivalence with upstream for the cited flows unless a target-only improvement is explicitly marked.

### O1 — Sales DB schema parity (blocking)
**Files:** `src/db/schema/sales.ts`, `src/db/schema/customers.ts`, new migration(s) in the project's migration path.
**Spec:**
- Add `paymentId` PK autoincrement to `sales_payments` and `referenceCode` (text, default `''`). Keep `paymentTime` with default now.
- Extend `sales_taxes` with `salesTaxesId` PK, `printSequence`, `name`, `taxRate`, `salesTaxCodeId`, `jurisdictionId`, `taxCategoryId`; store `taxGroup` as the **group name**, not the composite key.
- Extend `sales_items_taxes` with `taxType`, `roundingCode`, `cascadeSequence`, `salesTaxCodeId`, `jurisdictionId`, `taxCategoryId`.
- Add `customers.packageId`; add `customers_packages` and `sales_reward_points` tables (or map `rewards` intentionally, but then provide an explicit compatibility view — recommended: keep upstream names).
- Decide `sales.saleLocation`/`saleCashAdjustment`/`saleCashRefund`: either drop or mark non-upstream and stop using them for search/summary (location filters must use `sales_items.item_location`).
**Data contract:** columns/types/lengths per §3 schema block; all monetary columns decimal/real with 4-dp storage where upstream is decimal(15,4).
**Acceptance:**
- unit: insert a sale with a giftcard payment and assert `paymentId`/`referenceCode` round-trip; insert tax groups and assert name/rate/print sequence.
- e2e: after a completed sale, DB contains `sales_payments.reference_code` for a Debit Card payment and `sales_taxes.print_sequence` ordering.
**Upstream mapping:** `3.3.0_paymenttracking.sql`, `3.3.0_refundtracking.sql`, `3.3.0_indiagst.sql`, `3.0.2_to_3.1.1.sql:119-123`.

### O2 — Cart/session contract and defaults
**Files:** `src/lib/sale/cart-store.ts`, `src/lib/sale/types.ts`.
**Spec:**
- Keep one cart per employee is acceptable for the web port, but document it and add a per-tab/session discriminator if concurrent registers are required (upstream is browser-session scoped). Provide `cartSessionKey(personId, sessionId?)`.
- Initialize `locationId` from the default sales location (`getDefaultLocationId('sales')`), not `1`.
- Initialize `employeeId` from the authenticated user at first cart creation; do not leave null while other code expects it.
- Set `allowTempItems` true on the register route (equivalent of `getIndex` setting `allow_temp_items=1`).
- Preserve a `customerId` sentinel strategy: either keep `null` everywhere and translate `-1` at boundaries, or store `-1`. All functions must agree.
**Data contract:** `SaleCart` fields per `types.ts:46-70`, with upstream semantics (payments array ordered by entry, line keyed by integer line).
**Acceptance:** unit test empty-cart defaults; e2e fresh employee sees default location and an empty cart.

### O3 — Calculator parity
**Files:** `src/lib/sale/types.ts`, `src/lib/tax/index.ts`, `src/lib/config/index.ts`.
**Spec:**
- `getItemTotal(q,p,d,type,includeDiscount=false)` must return undiscounted when false and `q*p - discountAmount` when true, with fixed discount `= q*d` and percent `= round(q*p*d/100, totals_decimals, HALF_UP)`. Consider a decimal library (`decimal.js`) or integer minor-units to avoid float drift; if keeping numbers, round explicitly at every upstream rounding boundary.
- Provide `getQuantitySold(total, price) = round(total/price, quantity_decimals)`.
- `getCartTotals`/`getTotals` must implement §4.3: subtract included-tax amounts from subtotal; add excluded tax to total; threshold `10^-totals/2`; return-mode comparison inversion; cash variants; `itemCount` only `HAS_STOCK`; `totalUnits` only stock lines; `cashAdjustmentAmount` rounded when covered.
- `roundNumber` must match PHP semantics including negatives (`round(-0.5, HALF_UP) = -1`), and `HALF_FIVE` must be `round(amount/5, decimals, HALF_EVEN)*5`.
- Remove the `default_tax_1/2` fallback from `getTaxes` (upstream reads only `items_taxes`), or make it an explicitly configured non-parity option defaulted off.
- Tax group key may remain internal, but stored/printed `tax_group`/`name`/`tax_rate` must follow upstream.
**Data contract:** totals object keys used by views/actions: `prediscount_subtotal, subtotal, total, tax_total, cash_total, payment_total, amount_due, cash_amount_due, payments_cover_total, item_count, total_units, cash_adjustment_amount, discount`.
**Acceptance:** port every fixture F1–F10 as unit tests with exact expected strings/numbers; add negative-rounding tests. Extend `src/lib/tax/tax.test.ts`; add `src/lib/sale/totals.test.ts`.
**Upstream mapping:** `Sale_lib.php:1589-1740`; `Tax_lib.php:76-294`.

### O4 — Payment model and register payment actions
**Files:** `src/lib/sale/{types.ts,sale-lib.ts}`, `src/app/(secure)/sales/actions.ts`, `src/components/sales/register.tsx`, `src/lib/sale/sale-model.ts`.
**Spec:**
- Store payments keyed/identified by **payment type** (upstream array key), with `{paymentType, paymentAmount, cashRefund=0, cashAdjustment=0, referenceCode}`. A unique surrogate key may be added, but merge semantics must be by type.
- `addPayment` must not touch giftcard/customer balances and must support `referenceCode`.
- Implement `deletePayment(type)` semantics including `resetCashRounding()` and sibling deletion only when rounding is enabled.
- Add reference-code validation to `addPaymentAction`: types from `get_reference_code_payment_types()`, required, alphanumeric, min/max from `payment_reference_code_min/max` (defaults 3/20 sale, 3/40 edit), reject negative/non-numeric amounts except returns.
- Implement the giftcard branch exactly: input is the card number; error if owned by another customer; error when balance minus already-added <= 0 in `sale` mode; amount = min(amount_due, card value); set remainder and warning.
- Implement the rewards branch with `package_id` presence, points balance check, amount = min(due, points), remainder/warning.
- Implement the cash branch: `amountDue=getTotal()` (cash-aware), `salesTotal=getTotal(false)`, insert cash payment, then insert `Cash Adjustment` with `cashAdjustment=1` when difference non-zero; set cash mode.
- Add the forged-type check and `must_enter_numeric` errors.
**Data contract:** localized payment strings (`Cash`, `Check`, `Debit Card`, `Credit Card`, `Due`, `Gift Card`, `Reward Points`, `Bank Transfer`, `Wallet`, `UPI` when country IN, `Cash Deposit`/`Credit Deposit` in WO mode, `Cash Adjustment`); stored giftcard type `"Gift Card:<number>"`.
**Acceptance (unit):** port `Sale_libPaymentTest.php` cases; new tests: accumulate same type, reference code preserved, cash adjustment sibling, delete with rounding off/on, forged type rejected, negative cash rejected outside return.
**Acceptance (e2e):** pay split Cash + Debit with reference code; delete one payment; giftcard prompt; verify labels and stored types.
**Upstream mapping:** `Sales.php:405-558`; `Sale_lib.php:565-694`.

### O5 — Giftcard/reward balance application at save only, atomically
**Files:** `src/lib/sale/sale-model.ts`, `src/lib/giftcards/repository.ts`, `src/lib/customers/repository` (or `persons`), `src/lib/customer_rewards/repository.ts`, `src/lib/rewards/repository.ts`.
**Spec:**
- Add repository primitives `decrementGiftcardValue(number, amount)` (`WHERE value >= amount AND deleted=0`, affectedRows>0) and `incrementGiftcardValue`, mirroring `Giftcard.php`.
- Add `adjustRewardPoints(customerId, delta)` as one atomic SQL `UPDATE ... SET points = points ± abs(delta) WHERE person_id=? [AND points >= abs(delta)]`, mirroring `Customer.php:249-262`.
- Remove all balance mutations from `addPayment`/`deletePayment`; mutate only inside `saveSale`'s transaction.
- Implement giftcard return-credit handling and suspended-return skip exactly (§3.1 step 5); empty number → `INSUFFICIENT_GIFTCARD_BALANCE`; insufficient → sentinel + rollback.
- Rewards: subtract `amount` with atomic guard; sentinel `INSUFFICIENT_REWARD_POINTS` + rollback; accumulate `totalAmountUsed`.
**Acceptance:** port `SaleTest.php` giftcard/reward/return cases and `CustomerRewardPointsTest.php` including a two-process concurrency test (SQLite: two connections with `BEGIN IMMEDIATE` or a serialized helper).
**Upstream mapping:** `Sale.php:579-618,702-721`; `Customer.php:249-262`; `Giftcard.php` decrement/increment.

### O6 — `add_item` parity
**Files:** `src/lib/sale/sale-lib.ts`, `src/lib/token/index.ts`, `src/lib/items/repository.ts`, `src/app/(secure)/sales/actions.ts`.
**Spec:**
- Parse barcodes with the upstream format list (`config.barcode_formats`, token patterns I/W/P; W in thousandths) before resolving the item.
- Resolve item number first, then numeric id when not leading-zero; `includeDeleted` option.
- Merge by `item_id` **and** `item_location`; serialized items never merge; quantity added with decimal-safe arithmetic.
- Implement kit header + components, `PRICE_MODE_KIT` price/discount rules, `PRICE_OPTION_ALL/KIT/KIT_STOCK`, print-option mapping, kit discount precedence (`same type → max`, else kit wins), stock warnings from header and components.
- Apply `config.default_sales_discount`/type and customer discount exactly as `postAdd` does.
- Populate line: stock name, in-stock quantity, attribute values/date values for `SHOW_IN_SALES`, hsn, tax category, multipack name.
- Return structured `{error, warning}` instead of throwing generic errors.
**Data contract:** full cart record per §2.3.
**Acceptance:** unit tests for merge-by-location, serialized duplicates, kit price options (0/1/2) and print mapping, barcode qty/price, customer/default discount, multipack, attributes, out-of-stock warning (reorder level).
**Upstream mapping:** `Sales.php:560-639`; `Sale_lib.php:1043-1195,1343-1360`; `Token_lib.php:174-200`.

### O7 — `edit_item` / `delete_item` / remove-customer parity
**Files:** `src/lib/sale/sale-lib.ts`, `src/app/(secure)/sales/actions.ts`, `src/components/sales/register.tsx`.
**Spec:**
- `editItem` must accept description, serial, quantity, discount, discountType, price, and `discountedTotal` amount-entry; recompute quantity via `getQuantitySold` when a different discounted total is supplied.
- Do not clamp negative quantity in return mode; reject negatives outside return mode at the action boundary.
- Enforce `sales_change_price` server-side by comparing to the stored line price; reject PERCENT > 100 and FIXED > abs(qty)*price.
- Clear payments after any edit/delete (upstream).
- `deleteItem` must soft-delete `ITEM_TEMP` items.
- `removeCustomer` must delete the `Reward Points` payment by type, clear both remainders and invoice/quote numbers.
**Acceptance:** port controller tests for change-price grant and negative amounts; unit tests for amount entry (`10 / 3 → 3.33 → 9.99`) and return-mode negative edit; e2e edit qty with Tab.
**Upstream mapping:** `Sales.php:641-748`; `Sale_lib.php:1268-1311`.

### O8 — Return and copy flows
**Files:** `src/lib/sale/sale-lib.ts`, `src/app/(secure)/sales/actions.ts`.
**Spec:**
- `returnEntireSale` must only be reachable in return mode; preserve original quantity sign (use `-quantity_purchased`, which is already negative for a return sale), discount/type, price, description, serial, print option; set customer; clear payments; do not invent mode changes when invoked from sale mode.
- `copyEntireSale` must preserve signed quantities, comments, employee, quote/WO numbers, type, table, sale id, payments including reference codes and cash adjustments; set cash mode by inspecting payment types when rounding is enabled; set mode from sale type; leave invoice number handling to the caller.
- Provide a single copy implementation; remove the duplicate `copySaleToCart`.
**Acceptance:** unit: return of a normal sale yields negative lines; return of a return sale yields positive lines; copy of a return keeps negative sign; copy of quote sets number/type/mode/comment/payments.
**Upstream mapping:** `Sale_lib.php:1317-1409`; `Sales.php:582-586,1822-1848`.

### O9 — `save_value` parity and transaction order
**Files:** `src/lib/sale/sale-model.ts`.
**Spec:** implement §3.1 in order:
1. empty cart → `-1`;
2. customer existence → null;
3. clear suspended detail (release table) before header write when editing;
4. insert/update header with `sale_time=now`;
5. payments: giftcard/reward balance application with sentinels; persist reference codes; accumulate `totalAmount` and `totalAmountUsed`;
6. rewards earning (gross total; package config; write `sales_reward_points`);
7. items: insert, stock delta `-quantity` only when COMPLETED, undelete on negative, inventory row with `trans_date`/`POS <id>`, attribute link copy;
8. taxes: only when walk-in or taxable; full columns;
9. dinner table release/occupy with id>2 guard;
10. return sentinel/sale id.
**Data contract:** return type must distinguish `-1/-2/-3/-4`; all writes in one transaction with rollback on any sentinel.
**Acceptance:** port all `SaleTest.php` cases except the `get_all_suspended` query-failure case (covered in O11) plus new tests for: reference code persisted, edit-resume clears detail in order, attribute links copied, tax columns, dinner table pseudo-ids untouched, rewards row written.
**Upstream mapping:** `Sale.php:520-721,726-767,1413-1436`.

### O10 — Cancel / delete / restore semantics
**Files:** `src/lib/sale/sale-model.ts`, `src/app/(secure)/sales/actions.ts`, `src/components/sales/**`.
**Spec:**
- Deletion is always logical: set `sale_status=CANCELED`. Remove the hard-delete branch for non-completed sales.
- Restore sets `SUSPENDED` (no inventory re-deduction), exposed via a POST action with `sales_delete`.
- Inventory restoration only for COMPLETED and `update_inventory=true`: `+quantity_purchased` to `item_quantities` and an inventory row with comment `Deleting sale <id>` and `trans_date`.
- Dinner table release is a controller/action concern and must happen for cancel, discard, and delete-suspended; guard ids 1/2.
- Add a UI delete/restore path on the manage page and a `delete`/`restore` server action.
**Acceptance:** unit tests: completed sale cancel restores stock; suspended/quote cancel does not restore stock and row remains CANCELED; restore flips status; discard releases table; Delivery table never changes status.
**Upstream mapping:** `Sale.php:799-872,1343-1392`; `Sales.php:1529-1583,1716-1761`.

### O11 — Suspended sale flows, document ids, guards
**Files:** `src/lib/sale/sale-model.ts`, `src/app/(secure)/sales/actions.ts`, `src/app/(secure)/sales/suspended/page.tsx`, `src/components/sales/suspended-table.tsx`.
**Spec:**
- `getAllSuspended(customerId?)`: `-1`/undefined → all; otherwise exact customer filter. Return `{saleId, docId, saleStatus, saleTime, dinnerTableId, customerId, employeeId, comment}` where `docId = quote_number | work_order_number | sale_id` by type.
- Suspended page must render doc id, date in `config.dateformat`, table name, customer full name, employee full name, comment, and an unsuspend form.
- `unsuspendAction`: require `reports_sales`; load sale; only status SUSPENDED; clear cart first; copy sale; set mode from sale type; redirect/revalidate. Invalid/completed id must leave the current cart untouched.
- `discardSuspendedSaleAction`: require `reports_sales`; cancel via `deleteSuspendedSale` (release table + CANCELED) and clear cart only when it holds that suspended id.
- `getSuspendedSaleInfo` must filter `sale_status=SUSPENDED` like upstream.
**Acceptance:** port `SalesControllerTest.php:562-725` (cannot unsuspend completed; cashier without reports_sales gets 403; valid unsuspend replaces cart); unit tests for `docId` and customer filter `-1`.
**Upstream mapping:** `Sale.php:1211-1225,1343-1360,1397-1405`; `Sales.php:1807-1848`.

### O12 — Completion validation, mode branching, numbering
**Files:** `src/app/(secure)/sales/actions.ts`, `src/lib/sale/sale-model.ts`, `src/lib/token/index.ts`.
**Spec:**
- Before save: reject negative total outside return mode (`Sales.negative_total_invalid`); reject uncovered payments unless invoice or quote mode (`Sales.amount_due_not_covered`); reject empty cart.
- Branch by mode:
  - invoice → status COMPLETED, type INVOICE, number = manual or `render(sales_invoice_format, save=true)`, duplicate check only for new sale, render selected invoice type;
  - quote → status SUSPENDED, type QUOTE, number = manual or `render(sales_quote_format)` (supports `%y`, `{QSEQ:6}`), duplicate check, set `suspendedId`, render quote page;
  - work order → status SUSPENDED, type WORK_ORDER, `render(work_order_format)`, duplicate check, set suspendedId, render WO page;
  - else → status COMPLETED, type RETURN or POS, render receipt template.
- Require a selected customer in invoice/quote/WO modes (upstream only shows the finish button when customer set; enforce server-side).
- Handle sentinels `-1/-2/-3/-4` with localized errors and do not clear the cart.
- Add quote and work-order HTML pages (or redirect to their PDF routes if that is the chosen product decision; document it).
**Acceptance:** e2e: quote completes to suspended list with `Q<yy>000001`; WO likewise; invoice gets `{CO}`/configured format; zero-payment quote/invoice allowed; POS zero-payment blocked; duplicate invoice rejected; negative POS total blocked.
**Upstream mapping:** `Sales.php:758-1039`; `Token_lib.php:174-203`.

### O13 — Cash rounding end-to-end
**Files:** `src/lib/sale/sale-lib.ts`, `src/app/(secure)/sales/actions.ts`, `src/components/sales/register.tsx`, `src/lib/tax/index.ts`.
**Spec:**
- `resetCashRounding` per §2.4 and call it on every register load/action reload (upstream reload behavior).
- `getTotals` cash variants/threshold/return inversion per §4.4.
- Cash payment branch adds the adjustment row when `amountDue != salesTotal`; `getPaymentsTotal` excludes adjustments.
- Completion computes change from the cash-aware due and stores `cashRefund` (§5.7 step 5).
- UI must show cash total/due when cash mode; disable/adjust on non-cash types; display the adjustment row.
**Acceptance:** unit fixtures for HALF_FIVE (19.43→19.45, adjustment 0.02), HALF_UP at 5 decimals, cash then card disable, delete cash removes adjustment only when rounding enabled. e2e: cash rounding site completes a sale and receipt shows cash total/change.
**Upstream mapping:** `Sale_lib.php:590-615,675-789,1455-1470,1728-1734`; `Sales.php:519-527,841-857`.

### O14 — Token rendering parity
**Files:** `src/lib/token/index.ts`, `src/lib/config/index.ts`, `src/lib/sale/sale-model.ts`.
**Spec:**
- Implement upstream scan syntax (any token up to whitespace/`{}`/`:`, optional length) and replace **all** occurrences.
- Support `%` strftime via the valid format list (or document a deliberate migration and provide a config migration from `%` to `{}`).
- `ISEQ`/`QSEQ`/`WSEQ` must honour a supplied value and only increment when `save=true`.
- `CO` = invoice count; `SCO` = suspended invoices with invoice number; `YCO` = current-year invoice count; `QCO` (not `YQO`) = current-year quote count; `CU` = current session/customer.
- Quote/WO/invoice save paths must call the configured format renderer; preview must call with `save=false`.
**Acceptance:** unit tests per token; duplicate token replaces twice; preview does not increment; `Q%y{QSEQ:6}` renders e.g. `Q26000001`; `{SCO}` excludes suspended quotes without invoice numbers.
**Upstream mapping:** `Token_lib.php`; token classes; `Appconfig.php:147-187`.

### O15 — Document data builder, templates, print, email
**Files:** `src/lib/pdf/data.ts`, all `src/lib/pdf/*.tsx`, `src/app/(secure)/sales/{receipt,invoice,quote,work_order,tax_invoice}/**`, `src/lib/email/index.tsx`, new shared print component.
**Spec:**
- Replace `ReceiptData` with a document model carrying: company/logo/address/phone/account/tax id; customer info block; document number/date; lines with item number, name, description, serial, attributes, HSN, qty (signed), price, discount (+type), discounted total, print option, taxed flag; tax groups with rate/name/amount/print order; subtotal excluding included tax; total; payments (type split, amount negative, exclusion of adjustments from tender); cash refund; change/due with check-balance variant; giftcard remainder; comments/policy/messages; barcode.
- Implement template selection (`receipt_template`, `invoice_type`, fallback whitelists) and four invoice variants; render only `print_option==PRINT_YES` lines and honor `receipt_show_*` flags.
- Implement the print partial equivalent (browser print at minimum; printer selection/margins if the product retains the Firefox plugin behavior).
- Email: per-type HTML templates with token-rendered `invoice_email_message`, logo, and the correct PDF data; wire email buttons to `sendPdfAction`/receipt action; localized subjects/messages.
- Fix `/sales/invoice/[id]/pdf` to render `InvoiceDocument`/configured invoice type, not the receipt.
**Acceptance:** snapshot tests for each template with F1/F3/F6 fixtures (exact totals, negative return lines, tax labels); e2e print button opens print dialog stubs; email action captures PDF buffer and asserts non-empty content and totals.
**Upstream mapping:** `app/Views/sales/*`; `app/Views/partial/print_receipt.php`; `Sales.php:1041-1134,1202-1306,1427-1467`.

### O16 — Manage/search/getInfo/payment summary parity
**Files:** `src/lib/sale/sale-model.ts`, `src/app/(secure)/sales/manage/page.tsx`, new API route(s) for table data, new filters component.
**Spec:**
- Implement `getInfo` SQL semantics (§3.8): subtotal, tax, total, amount due/tendered/change, cash adjustment/refund, payment type concat, customer/name/email/comments.
- Implement search with: completed-only, date format config, customer/company/full-name search, numeric sale id, location via `sales_items.item_location`, selected-customer filter from a request/session value, payment-type filters, only-invoices, sort whitelist, pagination, row count.
- Payment summary aggregation with sale_type semantics and giftcard merging.
- Manage page: table with the upstream headers, totals row, payment summary, filters, print, delete/restore, receipt link, invoice link, edit modal.
**Acceptance:** unit: `getInfo` against seeded multi-line multi-payment sales with discounts/tax included/excluded; search filters; summary giftcard merge; e2e filters and totals row.
**Upstream mapping:** `Sale.php:43-318,1065-1209,1444-1568`; `tabular_helper.php:62-185`; `Sales.php:81-204`; `manage.php`.

### O17 — Edit-sale modal and save
**Files:** new `src/app/(secure)/sales/edit/[id]/page.tsx` (or modal), `src/lib/sale/sale-model.ts`, actions.
**Spec:**
- Load header, payments, balance due (`amount_due - amount_tendered + cash_refund`, clamp negative when rounding off), payment options without giftcard plus Cash Adjustment when rounding.
- Save header (date parsed with `config.dateformat/timeformat`, customer/employee nullable, comment, invoice number with duplicate check), payment rows: update by `payment_id`, insert new, delete zero-amount existing; non-cash refund conversion; overpayment cash refund; update inventory `trans_date` for `POS <id>` rows.
- Preserve items/inventory/taxes/rewards untouched.
**Acceptance:** unit tests for payment replacement/zero delete/non-cash refund/new payment refund; e2e edit comment/date/payment and verify receipt/takings.
**Upstream mapping:** `Sales.php:1469-1527,1585-1714`; `Sale.php:453-518`.

### O18 — Config flags, register modes, localization
**Files:** `src/lib/constants.ts`, `src/lib/sale/sale-lib.ts`, `src/lib/sale/sale-model.ts`, `src/components/sales/register.tsx`, locale files.
**Spec:**
- Register modes config-driven (`invoice_enable`, `work_order_enable`), labels `Receipt/Quote/Work Order/Invoice/Return`.
- Print/email behaviour flags `always|never|last` with session fallback (not `"1"` comparisons).
- Payment options ordered by `payment_options_order`, include Due/Check/UPI (country IN)/Bank Transfer/Wallet, giftcard/reward points when allowed, deposits in WO mode.
- Keyboard shortcuts from `key_*` config with defaults, help modal.
- `isValidReceiptTemplate` restricted to the two receipt templates; invoice whitelist separate.
- All user-facing strings through the i18n layer (payment types, document labels, errors).
**Acceptance:** unit tests for mode lists under config combinations, payment option ordering/labels, print/email behaviour; e2e toggling config values.
**Upstream mapping:** `Sale_lib.php:82-173,492-562`; `locale_helper.php:240-292`; `Sale.php:954-975`.

### O19 — Authorization hardening
**Files:** `src/lib/auth/with-permission.ts`, `src/app/(secure)/sales/**`, `src/app/(secure)/sales/actions.ts`.
**Spec:**
- Every server action/page that upstream gates needs the same grant: `reports_sales` (manage/row/search/edit/receipt/invoice/save/send/unsuspend), `sales_delete` (delete/restore/discard), `sales_change_price` (editItem price), module `sales` for register/cart actions.
- `requirePermission` currently treats `hasModuleGrant("reports")` as sufficient for `reports_sales`; tighten to exact `reports_sales` (or document the deliberate loosening). Add exact-grant helper `requireGrant("reports_sales")`.
- Do not trust client-side flags for price edits; compare to stored price.
- Restrict item-master mutation from sales (`changeItemNumber/Name/Description`) to `items` grant or remove.
- Whitelist `type` in `sendPdf` before view/lang lookup.
- Server actions are POST-equivalent and Next 16 enforces Origin checks; explicitly document CSRF posture versus upstream's global CSRF (GET delete endpoints are a known upstream weakness; do not reproduce GET mutations).
**Acceptance:** unit/integration tests mirroring `SalesControllerTest.php` access matrix; e2e cashier-without-reports cannot open manage/receipt/invoice/unsuspend; price change denied without grant.
**Upstream mapping:** `Secure_Controller.php:41-88`; `Employee.php:444-486`; `Sales.php` gate lines in §7.2.

### O20 — Test and CI gate
**Files:** `src/lib/sale/*.test.ts`, `src/lib/tax/*.test.ts`, `e2e/sales.spec.ts`, new `e2e/sales-documents.spec.ts`.
**Spec:**
- Port upstream suites listed in §8.12, then extend with the fixtures in §4.7.
- Add a parity fixture harness: seed a fixed DB (items, taxes, customer package, giftcard, dinner tables), execute both implementations? (upstream PHP suite is the oracle; in the target, encode expected values from this report).
- Required cases: fixed discount per unit; tax-included subtotal; receipt total incl. excluded tax; cash rounding HALF_FIVE; return sign preservation through save/render; giftcard/reward single debit + sentinels; sibling adjustment; CANCELED table release incl. discard; quote/WO SUSPENDED + numbers + unsuspend guard; token sequence/preview; change-price authz; payment amount/ref code validation; attribute copy; manage totals/payment summary.
**Acceptance:** `npm test` and `npm run test:e2e` green; coverage of every obligation O1–O19 by at least one unit and one e2e/integration test; no skipped parity tests.
**Upstream mapping:** all files in §8.12.

---

## 10. Unknowns and edge cases

### 10.1 Upstream quirks that must be consciously accepted or fixed

1. **Suspended sales debit giftcards/rewards at suspend time** (`Sale.php:579-618` runs for status SUSPENDED), then again when the resumed sale is completed. This can double-charge. Decide: reproduce for parity or fix and document. Target currently double-charges at add-time as well, so it is worse on both axes.
2. **`postChangeMode` always writes the posted dinner table**, even when the POST is empty/null (`Sales.php:280-308`). A mode switch without a table field can clear the table selection. Target `changeModeAction` does not touch tables at all.
3. **`set_invoice_number` casts to int** (`Sales.php:349`), so manually entered alphanumeric invoice numbers are truncated; the target stores strings. The edit-sale path stores the string. Reproduce or standardize.
4. **`check_work_order_number_exists` checks the wrong column** (`Sale.php:1037`). The target checks the right one. This is a deliberate divergence candidate; add a regression note either way.
5. **`restore` is unroutable** under improved auto-routing (`Feature.php:15`, `Routing.php:97`; method lacks a verb prefix at `Sales.php:1556`). If restore must work, upstream needs a route or a `postRestore` method. Do not copy the defect into the target.
6. **`Token_invoice_count` ignores its value** and `Token_customer` returns empty when given a customer array (email token bugs). Email bodies in upstream therefore do not substitute `$CU`/`{CU}` as intended. Target can fix, but then email text parity differs.
7. **`getInfo` tax aggregation** joins `sales_items_taxes_temp` (grouped per sale/item/line) with a payments temp keyed per sale; the `reference_code` group-by can split rows if multiple references exist, but the temp table's `GROUP_CONCAT` yields a single row per sale, so effectively one group. Verify with multi-reference payments if reproducing exactly.
8. **Rounding mode `HALF_FIVE` is implemented differently** for taxes (`round(amount/5)*5` without decimals, `Tax_lib.php:288-290`) and cash (`round(amount/5, decimals, HALF_EVEN)*5`, `Rounding_mode.php:80-82`). Also, `HALF_ODD` in `Tax_lib::round_taxes` is implemented as `PHP_ROUND_HALF_UP` (`Tax_lib.php:280-282`), whereas the target implements true half-odd. Do not unify them if parity is required.
9. **`get_payments_total()` enables `cash_mode` vacuously** when `cash_rounding` is on and there are no payments (the eligibility flag starts true and the loop never runs). Consequently the first reload of a cash-rounding site enters cash mode, and the first cash payment can create a `Cash Adjustment` row. Preserve this if parity is required.
10. **Quantity arithmetic mixes bcadd and native `+=`** (`get_quantity_already_added`, `out_of_stock`), so non-integer quantities can drift. Decide whether to preserve.
11. **`delete()` does not release the dinner table**, relying on the controller; `delete_list` used by bulk delete does not release tables at all. Target `cancelSale` releases per row, which diverges for bulk delete.
12. **`Sale::save_value` has no edit-completed-sale inventory reversal**; do not add one under the banner of "fixing editing". The upstream edit surface is header/payments only.
13. **`get_total()` uses `calculate_subtotal(true)`**, which includes tax when `tax_included`; adding excluded taxes afterward is correct, but the naming is confusing. Target's `getTotal` adds all taxes (wrong).
14. **`is_customer_taxable()` uses `or` not `||`** (`Sale_lib.php:1478-1484`); it is dead code, but if revived the precedence matters.
15. **`payments_cover_total` threshold** is half of the smallest currency unit; a due of exactly `0.005` with 2 decimals is not covered (`current_due < 0.005`). Preserve this boundary.
16. **Cash adjustment rows are excluded from payment totals but included in receipt payment loops**; receipts print adjustment rows as a payment line with negative amount because they do not filter `cash_adjustment`. Verify intended display.
17. **Quote/WO email templates reference data not supplied by `_load_sale_data`** (`tax_exclusive_subtotal`, associative tax iteration), so those email variants are likely broken upstream. The target may choose a corrected contract; note the divergence.

### 10.2 Target-specific risks / open questions

1. **Currency representation:** the target uses JS `number` (float) whereas upstream uses bcmath strings and decimal SQL columns. All parity tests must account for floating drift, especially with fixed discounts, included tax, and cash rounding. A decimal library or integer minor units is strongly recommended before implementing O3/O13.
2. **Server-action concurrency:** register edits fire per keystroke (`register.tsx:205,213,221`); each action reads/writes the whole cart JSON. Concurrent keystrokes can lose updates. Upstream posts one form per row on change/blur/Enter. Introduce debouncing or optimistic concurrency (cart version) as part of O2/O7.
3. **One cart per employee** (`cart-store.ts:13`) means two browser tabs share a cart, unlike upstream PHP sessions. Decide and document; add a per-tab id if required.
4. **Auth model:** upstream module grants include menu-group semantics and `has_module_grant` quirks; `with-permission.ts:13-20` uses `hasModuleGrant(moduleId) || hasGrant(target)`, which can grant `reports_sales` to anyone with any `reports_*` grant. Tighten or document.
5. **Config cache staleness:** `loadConfig()` caches forever per process (`config/index.ts:10-17`). Changes made in another worker are not observed; sale numbering and tax config can diverge across workers. Add TTL or invalidation.
6. **Rewards model divergence:** the target `rewards` table is used as a package list by the `/rewards` admin area, while upstream has both `customers_packages` and `sales_reward_points`. Unifying them without a migration will break either the admin UI or sale-points reporting. O1/O5 must settle this.
7. **Email transport differences:** upstream supports `protocol=mail`/sendmail and SMTP crypto `ssl|tls`; target nodemailer uses `smtp_crypto==='ssl'` for `secure` and `tls` for `requireTLS` (`email/index.tsx:43-47`). Verify behavior with real SMTP and with empty host (target returns `SMTP host not configured`; upstream would attempt `mail`).
8. **Printing:** upstream relies on a Firefox `jsPrintSetup` add-on and localStorage printer names. If the target is browser-agnostic, document that printer selection/margins are a product deviation; at minimum keep the print-after-sale auto-return delay.
9. **Image/logo handling:** upstream emails inline base64 for invoice/receipt and relative paths for quote/WO (broken). Target attaches `public/uploads/<logo>` by CID; verify path exists and mime type.
10. **Path/template selection:** `sendPdfAction` takes a `kind` union at compile time, but server actions are callable by clients with arbitrary values in JS; runtime validation is required (O19).
11. **No `custom_invoice`/`custom_tax_invoice` templates or routes** exist in the target; decide whether to alias them to invoice/tax_invoice or implement separately (upstream supports four `invoice_type` values).
12. **No quote/work-order HTML pages**: `completeSaleAction` redirects to `/sales/quote/{id}` and `/sales/work_order/{id}` (only `.../pdf` routes exist). This is a guaranteed 404 until O12/O15.
13. **Manage page totals** use `Σ price*abs(qty)` (`manage/page.tsx:31`), which is wrong for discounts/taxes/returns; do not build reporting on it.
14. **Receipt/invoice IDs:** templates print the DB `saleId` rather than `invoice_number`/`quote_number`/`work_order_number`; O15 must thread the document number through `ReceiptData`.
15. **Refund display:** target `SalePayment` has `cashRefund` but no field for `referenceCode` and no `paymentId` persisted; until O1/O4, no edit/delete/reprint flow can be correct.

### 10.3 Open questions for the product owner

1. Is exact upstream behavior (including quirks listed in §10.1) required, or is "fixed behavior with documented deviations" acceptable? This report assumes exact parity is the default and marks fixes as divergences.
2. Should suspended sales debit giftcards/rewards at suspend time (upstream behavior, double-charge risk) or only on completion?
3. Should the target keep a single shared cart per employee or introduce per-tab carts?
4. Are `custom_invoice` and `custom_tax_invoice` in scope for the first release?
5. Is Firefox `jsPrintSetup` printing in scope, or is browser print sufficient?
6. Should the rewards subsystem be migrated to upstream's `customers_packages` + `sales_reward_points` model, and how should existing target `rewards` rows map?
7. Which monetary representation is mandated (float, decimal.js, integer minor units)? This affects every obligation and the acceptance fixtures.

---

## Appendix A — Key file:line index

| Concern | Upstream | Target |
|---|---|---|
| Cart state methods | `app/Libraries/Sale_lib.php:177-1734` | `src/lib/sale/sale-lib.ts:1-877` |
| Item add/edit/delete | `Sale_lib.php:1043-1311` | `sale-lib.ts:107-187` |
| Returns/copy | `Sale_lib.php:1317-1409` | `sale-lib.ts:698-859` |
| Payments session | `Sale_lib.php:565-694` | `sale-lib.ts:521-646` |
| Totals | `Sale_lib.php:700-805,1529-1734` | `types.ts:77-149`; `sale-lib.ts:453-519` |
| Persistence | `app/Models/Sale.php:520-767` | `src/lib/sale/sale-model.ts:46-252` |
| Delete/restore/cancel | `Sale.php:799-872,1343-1392` | `sale-model.ts:489-547` |
| Search/manage SQL | `Sale.php:43-318,1065-1209` | `sale-model.ts:553-630`; `manage/page.tsx` |
| Controller actions | `app/Controllers/Sales.php:69-1970` | `src/app/(secure)/sales/actions.ts:1-247`; pages |
| Permissions | `Secure_Controller.php:41-88`; `Employee.php:444-486` | `src/lib/auth/with-permission.ts`; `rbac.ts` |
| Tokens | `Token_lib.php`; `app/Models/Tokens/*` | `src/lib/token/index.ts` |
| Documents | `app/Views/sales/*`; `partial/print_receipt.php` | `src/lib/pdf/*`; `src/app/(secure)/sales/**/page.tsx` |
| Schema | `sqlscripts/*.sql` (index in §3) | `src/db/schema/sales.ts`; `customers.ts`; `giftcards.ts` |
| Upstream tests | `tests/Controllers/SalesControllerTest.php`; `tests/Models/SaleTest.php`; `tests/Libraries/Sale_libPaymentTest.php`; `tests/Models/CustomerRewardPointsTest.php` | `src/lib/sale/sale-lib.test.ts`; `e2e/sales.spec.ts`; `src/lib/tax/tax.test.ts` |

End of report.









