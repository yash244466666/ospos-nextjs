# Receivings / purchasing subsystem reconstruction report

Upstream source of truth: `/home/yash/ospos` (OSPOS 3.4.3, commit
`603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`).
Target: `/home/yash/Desktop/yash/ospos-nextjs` (Next.js 16 + Drizzle port).

Scope: the entire receivings/purchasing subsystem. This report is analysis only.
It records upstream behaviour exhaustively, then the target gaps, then ordered
implementation obligations and acceptance tests. Citations use repo-relative
`path:line` for readability; the repository roots are named above.

Confidence conventions used below:

- "Verified" = read directly in source at the cited line.
- "Quirk" = behaviour that looks unintended but is what 3.4.3 does.
- "Defect" = behaviour that is actually broken at runtime (or provably so).
- "Unknown" = cannot be settled from source alone; listed in section 11.

---

## 1. Route / action map (upstream)

### 1.1 Routing mechanism

`app/Config/Routing.php:97` sets `$autoRoute = true` and
`app/Config/Feature.php:15` sets `$autoRoutesImproved = true`. There are no
explicit receivings routes in `app/Config/Routes.php` (only
`reports/detailed_receivings` at line 36). Therefore every public method below
is reachable by URL convention:

- `getX` handlers are reached with GET at `/receivings/x`
- `postX` handlers are reached with POST at `/receivings/x`

Every request passes through `Receivings::__construct()`
(`app/Controllers/Receivings.php:32-47`), which calls
`parent::__construct('receivings')`. `Secure_Controller` then:

- loads the logged-in employee,
- throws `RedirectException("no_access/receivings/...")` if the employee lacks
  the `receivings` module grant (`app/Controllers/Secure_Controller.php:43-49`),
- injects `controller_name = 'receivings'` and the DB-backed `config` array into
  every view (`Secure_Controller.php:68-73`).

Per-action `reports_receivings` checks are added manually in four actions
(`getEdit`, `postDelete`, `getReceipt`, `postSave`). There is no `receivings`
index/history action; the history screen is the report
`reports/detailed_receivings`.

### 1.2 Action table

| # | Method | URL | Verb | Params | Permission | Response | Side effects |
|---|--------|-----|------|--------|------------|----------|--------------|
| 1 | `getIndex` (`:52-55`) | `/receivings` | GET | none | `receivings` module | HTML `receivings/receiving` via `_reload()` | Initialises `recv_mode=receive`, `recv_supplier=-1`, `recv_cart=[]` through library getters; reads default stock source/destination |
| 2 | `getItemSearch` (`:63-70`) | `/receivings/itemSearch` | GET | `term` | `receivings` | JSON array of `{value,label}` | None. Merges `Item::get_search_suggestions` + `Item_kit::get_search_suggestions` (used by sales register, not receiving view) |
| 3 | `getStockItemSearch` (`:78-85`) | `/receivings/stockItemSearch` | GET | `term` | `receivings` | JSON array of `{value,label}` | None. `Item::get_stock_search_suggestions` (stocked items only) + kit suggestions; source of the receiving autocomplete |
| 4 | `postSelectSupplier` (`:93-101`) | `/receivings/selectSupplier` | POST | `supplier` (int) | `receivings` | HTML reload | If `Supplier::exists(id)` then `recv_supplier=id`; otherwise silently ignored |
| 5 | `postChangeMode` (`:109-126`) | `/receivings/changeMode` | POST | `mode`, `stock_source` (int), `stock_destination` (string) | `receivings` | HTML reload | If source/destination unchanged or absent: `clear_reference()` + `set_mode(mode)`. Else if source is an allowed `receivings` location: `set_stock_source(source)` + `set_stock_destination(destination)` (destination not itself validated) |
| 6 | `postSetComment` (`:133-137`) | `/receivings/setComment` | POST | `comment` | `receivings` | JSON `{"success":true}` | `recv_comment=comment` (AJAX on keyup) |
| 7 | `postSetPrintAfterSale` (`:144-148`) | `/receivings/setPrintAfterSale` | POST | `recv_print_after_sale` (any non-null) | `receivings` | JSON `{"success":true}` | `recv_print_after_sale=bool` (AJAX on change) |
| 8 | `postSetReference` (`:155-159`) | `/receivings/setReference` | POST | `recv_reference` | `receivings` | JSON `{"success":true}` | `recv_reference=string` (AJAX on keyup) |
| 9 | `postAdd` (`:167-188`) | `/receivings/add` | POST | `item` (item id, item number, `KIT n`, or receipt/reference) | `receivings` | HTML reload, optional `error` key | Token parses barcode into quantity/price; return-mode receipt triggers `return_entire_receiving`; `KIT`/kit-number triggers `add_item_kit`; otherwise `add_item` |
| 10 | `postEditItem` (`:197-227`) | `/receivings/editItem/{line}` | POST | `price`, `quantity`, `receiving_quantity`, `description`, `serialnumber`, `discount`, `discount_type` | `receivings` | HTML reload, optional `error` | Validates locale decimals then `edit_item(line,...)` |
| 11 | `getEdit` (`:235-272`) | `/receivings/edit/{receiving_id}` | GET | path id | `reports_receivings` (redirect on failure) | HTML `receivings/form` | Reads supplier list, employee list, joined receiving info; no writes |
| 12 | `getDeleteItem` (`:281-286`) | `/receivings/deleteItem/{line}` | GET | path line number (named `item_number`) | `receivings` | HTML reload | `delete_item(line)` removes one cart line |
| 13 | `postDelete` (`:294-314`) | `/receivings/delete` or `/receivings/delete/{id}` | POST | `ids[]` (array, when id omitted), optional path id, optional `update_inventory` bool | `reports_receivings` (403 JSON) | JSON `{success,message,ids}` | `Receiving::delete_list(ids, employee, update_inventory)`; reverses stock + inventory log, deletes lines + header |
| 14 | `getRemoveSupplier` (`:322-328`) | `/receivings/removeSupplier` | GET | none | `receivings` | HTML reload | `clear_reference()`, `remove_supplier()` |
| 15 | `postComplete` (`:337-391`) | `/receivings/complete` | POST | `payment_type`, `amount_tendered`, `comment`, `recv_reference`, `recv_print_after_sale` (form fields) | `receivings` | HTML `receivings/receipt` | Persists header+lines+inventory+quantities; generates barcode; clears the cart on success. Uses session comment/reference, not the POSTed form values |
| 16 | `postRequisitionComplete` (`:400-415`) | `/receivings/requisitionComplete` | POST | same form fields as complete | `receivings` | HTML reload (`error`) or receipt | Converts every cart line into destination (+q) and source (-q) lines, then calls `postComplete()`; refuses if source==destination |
| 17 | `getReceipt` (`:424-468`) | `/receivings/receipt/{receiving_id}` | GET | path id | `reports_receivings` (redirect on failure) | HTML `receivings/receipt` | Copies stored receiving into the live cart, renders receipt from cart, then `clear_all()`; destroys any in-progress receiving |
| 18 | `postSave` (`:518-563`) | `/receivings/save/{receiving_id}` | POST | `date`, `supplier_id`, `employee_id`, `comment`, `reference` | `reports_receivings` (403 JSON); employee assignment additionally needs `employees` grant | JSON `{success,message,id}` | `Inventory::update('RECV <id>', {trans_date})` then `Receiving::update(id, header)`; does not touch lines |
| 19 | `postCancelReceiving` (`:571-576`) | `/receivings/cancelReceiving` | POST | none | `receivings` | HTML reload | `clear_all()` (mode, cart, supplier, comment, reference); print flag and stock locations persist |

Notes:

- Actions 6/7/8 are the only JSON "setter" endpoints; all other mutations return
  a full HTML fragment (`receivings/receiving`) that the front end swaps in.
- The finish form posts `comment` and `recv_reference`
  (`app/Views/receivings/receiving.php:328-358,377-383`), but `postComplete`
  ignores those POST values and reads the session
  (`Receivings.php:346-347`); the AJAX keyup handlers are what actually keep the
  session synchronised.
- `postDelete` is reached through `table_support.do_delete`, which serialises
  `ids[]=<id>` in a POST body (`public/js/manage_tables.js:154-187,332`).

### 1.3 JSON shapes

- `itemSearch` / `stockItemSearch`: `[{ "value": "<item_id or 'KIT n'>",
  "label": "<configured suggestion columns joined by ' | '>" }, ...]`
  (`app/Models/Item.php:914-950`, `app/Models/Item_kit.php:205-235`).
- `setComment`, `setPrintAfterSale`, `setReference`: `{"success": true}`.
- `postDelete`: `{"success": bool, "message": string, "ids": [int,...]}`.
- `postSave`: `{"success": bool, "message": string, "id": int}`.

---

## 2. `Receiving_lib` state model (every property and method)

`app/Libraries/Receiving_lib.php` is a thin session-backed cart. It has no
persistent properties besides the models it constructs (`:22-28`) and the
CodeIgniter `Session` (`:39`). All state lives in the session. This is the
complete state contract.

### 2.1 Session keys and defaults

| Session key | Written by | Read by | Type / default | Notes |
|---|---|---|---|---|
| `recv_cart` | `set_cart` (`:58-61`) | `get_cart` (`:45-52`) | array; `[]` if missing | Keyed by line number |
| `recv_supplier` | `set_supplier` (`:87-90`) | `get_supplier` (`:74-81`) | int; `-1` if missing | `-1` is the "no supplier" sentinel (`:77`) |
| `recv_mode` | `set_mode` (`:116-119`) | `get_mode` (`:103-110`) | string; `'receive'` if missing | `receive`, `return`, `requisition` |
| `recv_stock_source` | `set_stock_source` (`:218-221`) | `get_stock_source` (`:132-142`) | ?int; default location id if unset | Default resolved from `Stock_location::getDefaultLocationId('receivings')` |
| `recv_stock_destination` | `set_stock_destination` (`:250-253`) | `get_stock_destination` (`:234-244`) | ?string; default location id as string | String because the controller sanitises it as full-special-chars |
| `recv_comment` | `set_comment` (`:158-161`) | `get_comment` (`:147-152`) | string; `''` if missing | |
| `recv_reference` | `set_reference` (`:183-186`) | `get_reference` (`:174-177`) | string; `''` if missing | Stored in `receivings.reference` varchar(32) |
| `recv_print_after_sale` | `set_print_after_sale` (`:209-212`) | `is_print_after_sale` (`:199-203`) | bool; `false` | Accepts `'true'`/`'1'` as true |

Clearing methods: `empty_cart` (`:66-69`), `remove_supplier` (`:95-98`),
`clear_mode` (`:124-127`), `clear_comment` (`:166-169`),
`clear_reference` (`:191-194`), `clear_stock_source` (`:226-229`),
`clear_stock_destination` (`:258-261`).

`clear_all()` (`:474-481`) clears **mode, cart, supplier, comment, reference
only**. It deliberately does **not** clear `recv_print_after_sale`,
`recv_stock_source`, or `recv_stock_destination`. This is a real behavioural
contract: print-after-sale and the stock source survive completion/cancel.

### 2.2 Cart line shape produced by `add_item`

`add_item` (`:278-364`) builds each line with exactly these keys (`:329-352`):

| Key | Value / source |
|---|---|
| `item_id` | canonical `itemInfo->item_id` |
| `item_location` | argument (stock source) |
| `item_number` | `items.item_number` |
| `stock_name` | `Stock_location::getLocationName(item_location)` |
| `line` | `max(existing line) + 1`, or 1 for an empty cart (`:290-305`) |
| `name` | `items.name`; if `multi_pack_enabled`, `name . NAME_SEPARATOR . pack_name` (`:310-312`) |
| `description` | passed description, else `items.description` (`:337`) |
| `serialnumber` | passed serial, else `''` (`:338`) |
| `attribute_values` | `Attribute::get_link_values(item, 'receiving_id', receivingId, SHOW_IN_RECEIVINGS)` (`:327`) |
| `attribute_dtvalues` | same call (date attributes) |
| `allow_alt_description` | `items.allow_alt_description` |
| `is_serialized` | `items.is_serialized` |
| `quantity` | argument (packs for receive/requisition, negative packs for return) |
| `discount` | argument (default from config in `postAdd`) |
| `discount_type` | argument (`PERCENT=0` / `FIXED=1`) |
| `in_stock` | `Item_quantity::get_item_quantity(item, location).quantity` |
| `price` | argument if non-null else `itemInfo->cost_price` (`:308`) |
| `receiving_quantity` | argument if non-null else `itemInfo->receiving_quantity` (`:323-325`); may be 0 |
| `receiving_quantity_choices` | `[1 => 'x1']` when item rq is 0 or 1; else `[rq => 'xN', 1 => 'x1']` (`:314-321`) |
| `total` | `get_item_total(quantity, price, discount, discount_type, receiving_quantity)` (`:350`) |

Lookup semantics: `Item::get_info_by_id_or_number($itemId, $includeDeleted)`
(`app/Models/Item.php:640-669`) matches `items.item_number` first and also
`items.item_id` when the input is all digits and does not start with `0`
(barcode-vs-id clash resolved by `LIMIT 1`). An empty result makes `add_item`
return false (`Receiving_lib.php:281-285`).

### 2.3 Add-item branches

1. **Existing cart line**: match is `item_id` AND `item_location`
   (`Receiving_lib.php:299-303`). Quantity is incremented and `total` is
   recomputed using the *argument* price (fresh cost from the caller), the
   *argument* discount/type, and the **existing** line's receiving quantity
   (`:354-356`). The stored `price`/`discount`/`discount_type` are **not**
   updated, so the line `total` can disagree with `get_total()` and the view's
   recomputed total (quirk); the receipt uses the stored `total`.
2. **New line**: `$items += $item` keyed by `$insertKey` (max line + 1,
   `:357-359`); collisions should not occur.
3. **Missing item**: returns false; the controller exposes
   `Receivings.unable_to_add_item`.

### 2.4 `edit_item` (`:377-398`)

Sets `description`, `serialnumber`, `quantity`, `receiving_quantity`,
`discount`, `discount_type` (only when non-null), `price`, and recomputes
`total` via `get_item_total`. It returns `false` unconditionally (explicit TODO
at `:397`). If `$line` is not a cart key, silently does nothing.

Controller-side parsing and validation (`Receivings.php:201-221`):

- price/quantity/discount validated with `decimal_locale` (`required`,
  `permit_empty` for discount), implemented as `parse_decimals(...) !== false`
  (`app/Config/Validation/OSPOSRules.php:134-137`).
- `quantity` uses `parse_quantity` (quantity_decimals), `price` uses
  `parse_decimals` (currency decimals), `receiving_quantity` uses
  `parse_quantity`.
- `discount` is parsed as quantity decimals when `discount_type` is truthy,
  otherwise as currency decimals (`:214-216`).
- Any validation failure returns `Receivings.error_editing_item` in the reload
  HTML; no exception.

### 2.5 `delete_item` (`:403-408`)

`unset($items[$line]); set_cart($items)`. Takes the line number despite the
controller parameter being named `$item_number` (`Receivings.php:281`).

### 2.6 `return_entire_receiving` (`:414-434`)

Signature is `int $receipt_receiving_id` even though callers pass a string
(`Receivings.php:180`). Steps:

1. `explode(' ', $input)`; if `preg_match('/(RECV|KIT)/', $pieces[0])`, take
   `$pieces[1]` as the receiving id; otherwise resolve the id through
   `Receiving::get_receiving_by_reference($input)`.
2. `empty_cart()`, `remove_supplier()`, `clear_comment()` (note: does NOT clear
   reference, does NOT set mode).
3. For each stored line, `add_item(item_id, -quantity_purchased, item_location,
   discount, discount_type, item_unit_price, description, serialnumber,
   receiving_quantity, receiving_id, includeDeleted=true)` (`:429-431`).
   Negative quantities are inserted immediately; the `receiving_id` argument
   makes `get_link_values` return attribute links attached to the original
   receiving (filtered by `SHOW_IN_RECEIVINGS`).
4. `set_supplier(receiving.supplier_id)`.

Defects:

- The `int` parameter plus a non-numeric string such as `"RECV 5"` or a
  non-numeric reference throws a PHP `TypeError` under weak typing (verified
  with PHP CLI: `f("RECV 5")` -> TypeError). So the intended "scan a receipt in
  return mode" path is broken in 3.4.3. The same call chain passes
  `-$row->quantity_purchased` (a decimal string like `"-3.000"`) into an `int`
  parameter; PHP truncates fractional quantities (verified; emits a
  deprecation for non-integer numeric strings).
- If the reference lookup finds nothing, `->getRow()->receiving_id` on null is a
  fatal error (`:422`).
- Quantity sign is baked into the cart here, unlike the target's mode-based
  sign.

### 2.7 `add_item_kit` (`:443-452`)

- Parses `"KIT n"` (uses `$pieces[1]` when there is more than one piece),
  otherwise treats the input as the kit id/number.
- `Item_kit_items::get_info($id)` (`app/Models/Item_kit_items.php:23-35`) joins
  `items` and `item_kits`, matches either `item_kits.item_kit_id` or
  `item_kits.item_kit_number`, ordered by `kit_sequence`.
- For each component calls `add_item(item_id, quantity, location, discount,
  discount_type)` — no price, no description, no serial, no receiving quantity;
  therefore components use the item's cost price, item description, empty
  serial, and the item's own `receiving_quantity`.
- Component quantity comes from the DB as a decimal string and is coerced to the
  `int` parameter (fractional component quantities truncate).

`Item_kit::is_valid_item_kit` (`app/Models/Item_kit.php:43-57`) decides whether
`postAdd` routes here: `"KIT n"` (case-insensitive regex) with an existing kit,
otherwise `item_kits.item_kit_number` existence (unless duplicate barcodes are
allowed, in which case item-number matching returns false — `:62-68`).

### 2.8 `copy_entire_receiving` (`:458-469`)

`empty_cart()`, `remove_supplier()`, then re-add every stored line with the
stored positive `quantity_purchased`, stored item location, discount, type,
unit price, description, serial, receiving quantity, the source `receiving_id`,
and `includeDeleted=true`; finally `set_supplier(...)`. It does **not** copy the
comment and does **not** copy the reference (commented out at `:468`). It is
used by `getReceipt` to reconstruct the receipt from the cart, not by a user
"copy" button (the view has no such button).

### 2.9 Totals

`get_item_total(quantity, price, discount, discount_type, receiving_quantity)`
(`:491-503`):

```
extended = bcmul(quantity, receiving_quantity)
total    = bcmul(extended, price)
if discount_type == PERCENT:
    discount_amount = bcmul(total, bcdiv(discount, 100))
else:
    discount_amount = discount            # one flat amount per line
return bcsub(total, discount_amount)      # string, bcscale digits
```

`bcscale` is set globally to `max(2, currency_decimals + tax_decimals)`
(`app/Events/Load_config.php:44`), i.e. 4 with default config. bcmath truncates
to that scale; it does not round.

`get_total()` (`:508-516`) sums the per-line totals with `bcadd`.

Discount semantics: a percent discount is applied to the extended
(`quantity * receiving_quantity`) amount; a fixed discount is subtracted once
per line, not per unit and not multiplied by receiving quantity.

`receiving_quantity == 0` makes the extended quantity and therefore the line
total `0`, while `save_value` still adds `quantity` units to stock (fallback
path, section 3). Verified upstream quirk. There is no suspend/resume concept
for receivings (`Sale_lib` has it; `Receiving_lib` does not); the cart simply
remains in the PHP session until `clear_all`/`empty_cart` or session expiry.

---

## 3. `Receiving` model persistence (every method)

`app/Models/Receiving.php` declares `$table='receivings'`,
`$primaryKey='receiving_id'`, auto-increment, no soft deletes, and allowed
fields `receiving_time, supplier_id, employee_id, comment, receiving_id,
payment_type, reference` (`:15-27`).

There is **no** `get_multiple_info`, **no** `receivings_payments` table or
model, **no** tax handling, **no** restore/undelete, and **no** invoice-number
field in 3.4.3.

### 3.1 Read methods

- `get_info(int $receiving_id)` (`:33-41`): `receivings` LEFT JOIN `people` and
  `suppliers` on `supplier_id`, filtered by id. Returns a `ResultInterface`
  (callers use `getRowArray()`); no not-found handling.
- `get_receiving_by_reference(string $reference)` (`:48-53`): exact match on the
  `reference` column, no limit/order.
- `is_valid_receipt(string $input)` (`:59-73`):
  - if empty -> false;
  - `explode(' ')`; if exactly 2 pieces and `preg_match('/(RECV|KIT)/',
    $pieces[0])` (unanchored, case-sensitive), return `exists($pieces[1])`;
  - otherwise return `get_receiving_by_reference($input)->getNumRows() > 0`.
  So a plain reference such as `PO-123` is a valid "receipt" input.
- `exists(int $id)` (`:79-85`): exactly one row.
- `get_receiving_items(int $id)` (`:266-272`): raw `receivings_items` rows, no
  ordering.
- `get_supplier(int $id)` (`:278-285`): reads `receivings.supplier_id`, then
  `Supplier::getInfo`; null supplier produces an empty supplier object.
- `get_payment_options()` (`:290-301`): returns an associative array whose keys
  and values are the localized labels for `Sales.cash`, `sales.check`,
  `sales.debit`, `sales.credit`, `sales.due`, `sales.bank_transfer`,
  `sales.wallet` (`app/Language/en/Sales.php:10-208` -> `Cash`, `Check`,
  `Debit Card`, `Credit Card`, `Due`, `Bank Transfer`, `Wallet`).

### 3.2 `save_value` — the only receiving write path (`:103-190`)

Signature: `save_value(array $items, int $supplier_id, int $employee_id, string
$comment, string $reference, ?string $payment_type, int $receiving_id =
NEW_ENTRY): int`. The seventh argument is named `$receiving_id` and is
immediately overwritten with `insertID()`; callers pass the stock location there
and it is silently discarded (`:103` TODO, `:129`). There is no header-level
location column upstream.

Order of operations:

1. Resolve models: `Attribute`, `Inventory`, `Item`, `Item_quantity`,
   `Supplier` (`:105-109`).
2. Empty items -> return `-1` (`:111-113`).
3. Build header (`:115-122`):
   - `receiving_time = date('Y-m-d H:i:s')` (server now, not caller-supplied);
   - `supplier_id = $supplier->exists($supplier_id) ? $supplier_id : null`;
   - `employee_id`, `payment_type`, `comment`, `reference` as supplied.
4. `transStart()` (`:125`).
5. Insert header, capture `$receiving_id = insertID()` (`:127-129`).
6. For each cart line, keyed by line number (`:133-185`):
   a. Read `$cur_item_info = Item::getInfo(item_id)` fresh for every line.
   b. Insert one `receivings_items` row (`:137-152`) with:
      - `receiving_id`, `item_id`, `line`, `description`, `serialnumber`,
      - `quantity_purchased = cart quantity` (already signed for returns),
      - `receiving_quantity = cart receiving quantity`,
      - `discount`, `discount_type`,
      - `item_cost_price = $cur_item_info->cost_price` (**current DB cost at save
        time**, not the cart's price),
      - `item_unit_price = cart price`,
      - `item_location = cart item location`.
   c. Compute extended stock move (`:154`):
      `items_received = receiving_quantity != 0 ? quantity * receiving_quantity : quantity`.
   d. If `item_cost_price != cart price` **and**
      `config['receiving_calculate_average_price']` is truthy:
      `Item::change_cost_price(item_id, items_received, cart price, current cost)`
      (`:156-159`). This must run **before** the quantity update (explicit
      caution in `app/Models/Item.php:1404-1405`).
   e. Update stock (`:161-171`): read the current
      `item_quantities.quantity` for `(item, item_location)`
      (`Item_quantity::get_item_quantity`, `app/Models/Item_quantity.php:65-85`,
      returns quantity 0 for a missing row) and write
      `quantity = current + items_received` via `Item_quantity::save_value`
      (`:46-58`, insert-or-update, read-modify-write, not atomic).
   f. Insert an inventory log row (`:173-183`): `trans_date = now`,
      `trans_items`, `trans_user = employee`, `trans_location`, 
      `trans_comment = 'RECV ' . $receiving_id`, `trans_inventory =
      items_received` (signed).
   g. `Attribute::copy_attribute_links(item_id, 'receiving_id', receiving_id)`
      (`app/Models/Attribute.php:829-838`): copies the item's attribute links
      that currently have both `sale_id IS NULL` and `receiving_id IS NULL`,
      inserting duplicates pointing at this receiving (INSERT IGNORE semantics).
7. `transComplete()`; return `transStatus() ? receiving_id : -1` (`:187-189`).

Consequences:

- One receiving can contain positive lines (receive), negative lines (return),
  and mixed lines (requisition), all stored with the same header id.
- `item_cost_price` is the pre-change DB cost; `item_unit_price` is the entered
  cost. Reports use both (profit = unit price basis minus DB cost basis).
- The inventory row is the audit trail used by receipt editing (`postSave`
  updates `trans_date` by `trans_comment = 'RECV <id>'`) and by stock history.
- No stock validation: quantities may go negative. `Item_quantity::changeQuantity`
  documents that negative results are allowed (`app/Models/Item_quantity.php:88-92`).
- The supplier is validated with `Supplier::exists` (`app/Models/Supplier.php:28-36`,
  joins `suppliers` and `people`).
- Attribute copy is per line; duplicate calls are safe because of `ignore(true)`.

### 3.3 `change_cost_price` (`app/Models/Item.php:1408-1428`)

```
old_total_quantity = SUM(item_quantities.quantity)
                     JOIN stock_locations ON location_id
                     WHERE item_id = ? AND stock_locations.deleted = 0
total_quantity = old_total_quantity + items_received
average = (items_received * new_price + old_total_quantity * old_price)
          / total_quantity
store cost_price = average
```

- bcmath with the global scale (4 by default) => the computed string is
  truncated at 4 dp, then MySQL `items.cost_price DECIMAL(15,2)` rounds it to
  2 dp (`app/Database/Migrations/sqlscripts/initial_schema.sql:193`).
- `old_total_quantity` spans all non-deleted locations, not only the receiving
  location.
- No zero-division guard: if `old_total + items_received == 0` (e.g. returning
  the entire stock at the same price), `bcdiv` by zero raises
  `DivisionByZeroError` on PHP 8. (Runtime confirmation listed in Unknowns
  because bcmath was unavailable in the analysis container.)
- The guard `cost_price != price` is a loose comparison of decimal strings/floats.
- Returns can therefore change the average cost: stock 10 @ 10, return 5 @ 8
  => ( -5*8 + 10*10 ) / 5 = 12, cost rises.

### 3.4 Delete / cancel (`delete_list`, `delete_value`)

`delete_list(array $receiving_ids, int $employee_id, bool
$update_inventory = true)` (`:196-213`):

- starts a transaction, loops `delete_value` per id with `$success &= ...`,
  completes and ANDs `transStatus()`.

`delete_value(int $receiving_id, int $employee_id, bool $update_inventory =
true)` (`:218-260`):

1. `transStart()` (nested inside `delete_list`; CI4 uses savepoints).
2. If `update_inventory`:
   - load `get_receiving_items(id)`;
   - per line insert an inventory row with
     `trans_comment = 'Deleting receiving ' . $receiving_id`,
     `trans_inventory = quantity_purchased * (-receiving_quantity)`;
   - call `Item_quantity::changeQuantity(item, location,
     quantity_purchased * (-receiving_quantity))` — atomic upsert by
     `(item_id, location_id)` with `quantity = quantity + delta`
     (`app/Models/Item_quantity.php:93-104`).
3. Delete all `receivings_items` rows for the id, then the `receivings` row.
4. `transComplete()`, return status.

Defects/quirks:

- If `receiving_quantity == 0`, save used the fallback `quantity` but delete
  multiplies by `-0`, so the stock reversal is `0` and stock is never restored.
- Attribute links pointing at the deleted receiving are not deleted (orphans).
- No cost-price reversal (the average cost stays as changed).
- No restore/undelete exists (hard delete only).
- `delete_list` accepts ids from the request; `update_inventory` defaults true
  and is not exposed in the UI.

### 3.5 Editing a persisted receiving (`Receiving::update`, `postSave`)

`Receiving::update($id, $data)` (`:92-98`) is a simple where+update of the
header table; it overrides CodeIgniter's `Model::update` signature.

`postSave` (`Receivings.php:518-563`):

- requires `reports_receivings` (403 JSON otherwise);
- parses `date` with `date_create_from_format($config['dateformat'] . ' ' .
  $config['timeformat'], $newdate)`; an invalid string returns false and the
  subsequent `->format()` is a fatal error (no `date_required` validation);
- `supplier_id`: posted value if truthy, else `null` (no existence check);
- `employee_id`: if the caller lacks the `employees` grant, it is forced to the
  stored receiving's employee; otherwise the posted id is used;
- `comment` and `reference`: reference becomes `null` when posted empty;
- `Inventory::update('RECV ' . $id, ['trans_date' => $receiving_time])`
  (`app/Models/Inventory.php:34-40`) updates every inventory row whose comment
  matches the receiving; this covers all lines including requisition
  source/destination lines;
- returns JSON success/failure with the id.

The edit form (`app/Views/receivings/form.php`) exposes only header fields
(date, supplier, reference, employee, comment), a link to the receipt, and a
Delete button. It does not edit lines or payment type.

### 3.6 Invoice numbering/format

Upstream 3.4.3 has **no receiving invoice number**. Verified:

- `receivings` table columns are `receiving_time, supplier_id, employee_id,
  comment, receiving_id, payment_type, reference`
  (`app/Database/Migrations/sqlscripts/initial_schema.sql:449-461`);
- `Receiving::$allowedFields` contains no invoice field (`Receiving.php:19-27`);
- `save_value` inserts no invoice field (`:115-122`);
- the config key `recv_invoice_format` exists (`app/Views/configs/invoice_config.php:41-47`,
  `app/Controllers/Config.php:1154`) but is **never read by any receiving code**
  (only the config UI and language files reference it);
- there is no `Receiving::get_payment_options`-style invoice renderer.

The only identifiers are the numeric `receiving_id`, rendered as `RECV <id>`,
and the free-text `reference` varchar(32), indexed.

### 3.7 Search / date filtering (`create_temp_table`)

`create_temp_table(array $inputs)` (`:306-356`) builds
`receivings_items_temp` for the detailed-receivings report:

- filter: when `receiving_id` is empty, `DATE(receiving_time) BETWEEN start AND
  end` or raw `receiving_time BETWEEN rawurldecode(start/end)` depending on
  `date_or_time_format`; otherwise `receivings_items.receiving_id = id`;
- selects per `(receiving_id, item_id, line)`: MAX of date/time, comment,
  item_location, reference, payment_type, employee_id, supplier_id,
  quantity_purchased, `item_receiving_quantity`, item_cost_price,
  item_unit_price, discount, discount_type, serialnumber, description;
- subtotal/total:
  `item_unit_price * quantity_purchased * receiving_quantity` minus either
  `... * discount / 100` (percent) or flat `discount`;
- profit: the same total minus `item_cost_price * quantity_purchased`
  — **missing the receiving_quantity factor on cost** (quirk/inconsistency);
- cost: `item_cost_price * quantity_purchased * receiving_quantity` (includes
  the factor);
- `CREATE TEMPORARY TABLE IF NOT EXISTS ... (INDEX(...)) AS (select)`.

There is no generic receiving search/list method. The target's
`getReceivings`/`searchReceivings` are inventions (see section 9).

---

## 4. Requisition / transfer flow

### 4.1 Mode semantics

A requisition is a stock transfer from `recv_stock_source` to
`recv_stock_destination`. It reuses the receiving cart and the `postComplete`
persistence path; it is not a separate document type. There is no literal
`transfer` mode.

- `postAdd` signs quantity positive for `receive` **and** `requisition`
  (`Receivings.php:174`).
- Price editing and discount editing are hidden in requisition mode
  (`app/Views/receivings/receiving.php:144,172`), so the line price stays the
  item cost price.
- The on-screen total is hidden (`receiving.php:310-316`); the receipt hides the
  payment block but still prints a total (`app/Views/receivings/receipt.php:93-99`).

### 4.2 Entering / exiting

- Available only when `count(Stock_location::get_allowed_locations('receivings'))
  > 1`; `_reload` adds `modes['requisition']` only then and supplies
  `stock_source`/`stock_destination` (`Receivings.php:479-485`).
- Selecting the mode in the dropdown submits `mode_form` to
  `receivings/changeMode` (`receiving.php:41-74`).
- In requisition mode the destination dropdown appears (`receiving.php:60-68`).
- Changing either location dropdown also submits `changeMode`.
- Exiting: switch mode back to receive/return, or finish/cancel
  (`clear_all` clears the mode; the next `get_mode` defaults to `receive`).
- Source/destination persist across cancels because `clear_all` does not clear
  them.

### 4.3 `postRequisitionComplete` exact algorithm (`Receivings.php:400-415`)

```
if (get_stock_source() != get_stock_destination()):
    for each item in get_cart():
        delete_item(item['line'])
        add_item(item['item_id'],  item['quantity'], get_stock_destination(), item['discount_type'])
        add_item(item['item_id'], -item['quantity'], get_stock_source(),      item['discount_type'])
    return postComplete()
else:
    return _reload(['error' => Receivings.error_requisition])
```

Verified semantics and defects:

1. Loose int-vs-string comparison (`recv_stock_destination` is a string) still
   detects equal locations correctly via PHP numeric-string comparison.
2. **No stock availability check and no quantity validation**; the source may go
   negative (allowed by the quantity model).
3. **Defect:** the fourth positional argument of `add_item` is `$discount`, but
   the code passes `$item['discount_type']` (0 or 1), so each transfer line gets
   a flat discount of 0 or 1 currency unit with default type PERCENT. An item
   with discount_type 1 yields destination `+q*price - 1`, source
   `-q*price - 1`, net header total `-2`, skewing report totals.
4. The original line's `receiving_quantity`, `description`, `serialnumber`, and
   `price` are **lost**; `add_item` re-derives item cost, item description,
   empty serial, and the item's own receiving quantity.
5. Line numbers are reassigned (append at max+1), so stored pairs are not in
   the original order. The `foreach` iterates a snapshot, so deleting by
   `$item['line']` is safe.
6. `postComplete()` writes one header (mode `requisition`, empty payment type,
   no amount tendered), two `receivings_items` per cart line
   (`+q` destination, `-q` source, current item cost as `item_cost_price`,
   same unit price), two `item_quantities` updates, two `inventory` rows with
   `RECV <id>` (positive and negative), and attribute copies for both lines.
7. Average cost normally does not move (`price == current cost` guard); it moves
   only if the item cost changed between add time and save time. The receipt
   and reports show both sides, with a header total of approximately zero
   (minus defect 3).

### 4.4 UI bug: destination-only change

`postChangeMode` takes the early branch whenever the posted source is absent or
equals the current source, even if the destination differs
(`Receivings.php:114-119`). The form always posts both dropdowns, so a
destination-only change is ignored; it applies only when the source changes in
the same submission. Verified quirk.

---

## 5. Receiving register UI flow (`app/Views/receivings/receiving.php`)

### 5.1 Layout and controls

1. **Mode bar** (`:41-74`): mode dropdown (`receive`/`return`, plus
   `requisition` when >1 allowed location). When locations are shown
   (`count($stock_locations) > 1`), a stock-source dropdown is shown; in
   requisition mode a stock-destination dropdown is also shown. All three
   submit the mode form on change.
2. **Add item bar** (`:76-102`): text input `item` with jQuery UI autocomplete
   sourced from `receivings/stockItemSearch` (`:436`); Enter submits; a "New
   Item" button opens the item modal (`items/view`) and, on submit, puts the
   returned id into the input and submits the add form (`:515-529`).
3. **Cart table** (`:106-239`), newest line first (`array_reverse($cart, true)`,
   `:130`). Columns: delete, item number, item name (+ attribute values and
   `[in_stock in location]`), cost, quantity, ship pack, discount, total,
   update. Each row is its own form posting to
   `receivings/editItem/{line}` (`:133`).
   - Cost is editable only with the `items` grant and mode != requisition;
     otherwise printed and sent hidden (`:144-158`, `to_currency_no_money`).
     Quantity is always editable (`:161`); ship pack is a dropdown over
     `receiving_quantity_choices` (`:164-170`).
   - Discount input plus a bootstrap toggle switching `%`/currency, editable
     only with the `items` grant and mode != requisition (`:172-195`); the
     toggle injects hidden `discount_type` (1=FIXED checked, 0=PERCENT) and
     submits (`:535-539`). The total cell recomputes `get_item_total` inline
     (`:197`), not from the stored `total`.
   - Alternate-description row: editable when `allow_alt_description == 1`,
     else static description or "no description" (`:205-230`). Any change to
     price/quantity/receiving_quantity/discount/description/serialnumber
     submits the row form (`:531-533`); Enter submits the nearest form
     (`:509-513`).
4. **Supplier pane** (`:246-306`): if a supplier is set, shows company, email,
   address, city/zip and a remove button; otherwise a supplier autocomplete
   sourced from `suppliers/suggest` (`:482-490`) plus a "New Supplier" modal
   (`suppliers/view`). Selecting a supplier submits `selectSupplier`.
5. **Totals** (`:308-318`): currency-formatted cart total; hidden for
   requisition.
6. **Finish pane** (`:320-429`), rendered only when the cart is non-empty:
   - comment textarea, AJAX-posted on keyup (`:460-464`);
   - requisition mode: comment + Cancel + Finish, posting to
     `receivings/requisitionComplete`;
   - otherwise: comment, "Print After Sale" checkbox (AJAX-posted on change,
     `:472-476`), reference input only in `receive` mode (AJAX-posted on keyup,
     `:466-470`), payment dropdown from `Receiving::get_payment_options`
     (default selection is the first option, Cash, because the selected array
     is empty, `:390-400`), amount tendered input (`:404-412`), Cancel and
     Finish, posting to `receivings/complete`.
   - Cancel confirms (`confirm_cancel_receiving`) and re-points the same form at
     `receivings/cancelReceiving` (`:502-507`).

### 5.2 End-to-end flows

**Load register** (`GET /receivings`): grant check, then `_reload` reads cart,
modes/mode, allowed locations, total, items-grant flag, comment, reference,
payment options, supplier details and print flag, and renders the register.

**Add item** (`POST /receivings/add` with `item`):

1. `Token_lib::parse_barcode($quantity, $price, $input)`
   (`app/Libraries/Token_lib.php:169-186`): for each configured
   `barcode_formats` entry it runs `parse()`; `W` (weight) -> `(int)W / 1000`
   as quantity, `I` -> item id/number, `P` -> price. Without configured formats
   quantity is 1 and price null. **Quirk/defect:** the quantity is a float
   (e.g. 2500 -> 2.5) but `add_item` declares `int $quantity`, so PHP truncates
   it (2.5 -> 2, 0.5 -> 0); fractional/weight barcodes lose precision.
2. Quantity is negated when mode is `return` (`Receivings.php:174`).
3. Item location is always the current stock source (`:175`), even for returns
   of a stored receipt (that path re-adds with the stored location inside
   `return_entire_receiving`).
4. Discount defaults come from `config['default_receivings_discount']` and
   `config['default_receivings_discount_type']` (`:176-177`; defaults 0/0 from
   `app/Database/Migrations/sqlscripts/3.2.1_to_3.3.0.sql:149-150`).
5. Branch order: return-mode valid receipt -> `return_entire_receiving`; valid
   item kit -> `add_item_kit`; else `add_item`; failure -> error message.

**Edit line**: change event submits the row form; controller validates and
calls `edit_item` (no dedicated update endpoint). **Delete line**: GET
`receivings/deleteItem/{line}`. **Supplier**: POST `selectSupplier` (existence
checked) or GET `removeSupplier` (clears reference + supplier). **Comments/
reference/print flag**: AJAX setters, session only.

**Complete**: POST `complete`; `postComplete` assembles receipt data, saves,
renders the receipt, and clears the cart. On `RECV -1` the receipt view prints
`Receivings.transaction_failed` and `exit`s (`receipt.php:21-25`), so
`clear_all()` is skipped and the cart survives a failed completion.

**Cancel in-process**: `cancelReceiving` -> `clear_all()`; no DB delete.
**Return entire receiving**: enter return mode, scan `RECV n`, `KIT n`, or a
stored reference (broken at runtime per 2.6). **Copy**: no UI; used indirectly
by `getReceipt` (7.3). **Suspend/resume**: not implemented for receivings.

---

## 6. Totals and cost math (exact)

### 6.1 Decimal primitives

- bcmath scale is global: `max(2, currency_decimals + tax_decimals)`
  (`app/Events/Load_config.php:44`). Defaults: `currency_decimals=2`,
  `tax_decimals=2` -> scale 4 (`app/Helpers/locale_helper.php:313-344`).
- bcmath results are **truncated** at that scale, not rounded. Display
  formatting (`to_currency`, `to_currency_no_money`, `to_quantity_decimals`)
  uses `NumberFormatter` with `currency_decimals` / `quantity_decimals`
  (`locale_helper.php:370-452`); `parse_decimals` parses locale input and
  rejects values above `MAX_PRECISION = 1e14`
  (`locale_helper.php:477-509`, `app/Config/Constants.php:171`).
- Constants: `PERCENT = 0`, `FIXED = 1` (`app/Config/Constants.php:149-150`);
  item types `ITEM=0, ITEM_KIT=1, ITEM_AMOUNT_ENTRY=2, ITEM_TEMP=3`
  (`Constants.php:113-116`); `NEW_ENTRY = -1` (`:87`);
  `NAME_SEPARATOR = ' | '` (`:134`).

### 6.2 Line formula (cart and receipt)

```
extended_qty   = quantity * receiving_quantity        (bc, scale 4)
gross          = extended_qty * price                 (bc, scale 4)
discount_amt   = gross * (discount / 100)             if discount_type == PERCENT
               = discount                             if discount_type == FIXED
line_total     = gross - discount_amt                 (bc, scale 4)
```

The fixed discount is one amount per line, independent of quantity and pack
size; the percent discount applies to the full extended amount. The header
total is the bcadd of all line totals: no receiving tax, no rounding step, no
payment-due computation; `amount_tendered`/`amount_change` exist only on the
receipt view (`Receivings.php:351-354`).

### 6.3 Cost-price update (weighted average)

Per line, before its stock update:

```
old_qty   = SUM(quantity) over non-deleted stock locations
new_qty   = items_received                     (quantity*rq, or quantity if rq==0)
total_qty = old_qty + new_qty
avg       = (new_qty*new_price + old_qty*old_price) / total_qty   (bc, scale 4)
stored    = DECIMAL(15,2) of avg                                  (MySQL rounds)
```

### 6.4 Worked examples (default config, scale 4)

| Case | Inputs | Upstream result |
|---|---|---|
| Plain line | qty 4, rq 2, price 12, disc 0 | ext 8.0000, total 96.0000 |
| Percent | qty 3, rq 4, price 5, disc 10 PERCENT | ext 12.0000, gross 60.0000, discount 6.0000, total 54.0000 |
| Fixed | qty 3, rq 4, price 5, disc 10 FIXED | gross 60.0000, total 50.0000 |
| Avg cost, no stock | cost 10, old qty 0, receive 10 @ 20 | avg = 200/10 = 20.0000 -> cost 20.00 |
| Avg cost, stock | cost 10, old qty 10, receive 4 packs rq 2 (8 units) @ 12 | (8*12 + 10*10)/18 = 196/18 = 10.8888 -> DECIMAL(15,2) = 10.89 |
| Avg cost, exact | cost 10, old qty 10, receive 6 @ 20 | 220/16 = 13.7500 -> 13.75 |
| Return | cost 10, old qty 10, return 5 @ 8 | (-40 + 100)/5 = 12.0000 -> cost 12.00 |
| rq = 0 | item rq 0, qty 4, price 5 | extended 0, total 0.0000, but stock +4 and receipt prints `x1` |
| Delete reversal | saved qty 4 rq 2 -> +8 | delete delta = 4 * -2 = -8 |
| Delete, rq = 0 | saved qty 4 (fallback) -> +4 | delete delta = 4 * -0 = 0 (stock not restored) |
| Avg cost, division by zero | old qty 5 @ 10, return 5 @ 10 | total_qty = 0 -> bcdiv by zero (PHP 8 throws) |
| Merge quirk | add existing line again with config discount 10 | stored `total` recomputed with 10 but stored `discount` remains old, so `get_total()` disagrees with the receipt's stored total |

Target equivalence note: the target rounds to 4 dp (`Math.round(x*10000)/10000`)
instead of truncating at bcscale, and then keeps 4 dp in SQLite instead of
MySQL `DECIMAL(15,2)`. Example: 196/18 -> target 10.8889; upstream stored 10.89.
The target's own test expects 10.7778 for a case where upstream stores 10.78
(`src/lib/items/repository.test.ts:40-48` vs `app/Models/Item.php:1423-1427`
plus `initial_schema.sql:193`).

---

## 7. Receipt rendering, print, email

### 7.1 View data built by `postComplete` (`Receivings.php:340-386`)

`cart`, `total` (bc string), `transaction_time` (formatted now), `mode`,
`comment`, `reference` (session), `payment_type` (POST, sanitised),
`show_stock_locations` (count of allowed receiving locations > 1),
`stock_location` (stock source), optional `amount_tendered` and `amount_change`
(formatted currency string), `employee` (first+last), supplier block
(`supplier` company name, `first_name`, `last_name`, `supplier_email`,
`supplier_address`, `supplier_location` = zip + space + city), `receiving_id`
string `'RECV <id>'`, `barcode` (Code128 SVG of `RECV <id>`, generated by
`Barcode_lib::generate_receipt_barcode`, `app/Libraries/Barcode_lib.php:126-135`),
`print_after_sale` (session flag), optional `error_message`.

### 7.2 `app/Views/receivings/receipt.php`

- Error short-circuit: prints `Receivings.transaction_failed` and `exit`s
  (`:21-25`).
- Includes `partial/print_receipt` for the print button/printer handling
  (`:27`). **Upstream defect:** the call passes a list-style array
  `['print_after_sale', $print_after_sale, 'selected_printer' => ...]`, so the
  partial's `$print_after_sale` is undefined and auto-print never triggers for
  receivings. (Sales passes it correctly:
  `app/Views/sales/receipt.php:48`.) The manual Print button still works.
- Header: optional company logo image from `uploads/`, optional company name
  controlled by `receipt_show_company_name`, address (`nl2br`), phone,
  "Receivings Receipt" label, formatted transaction time
  (`:37-52`).
- General info: supplier, `Receivings.id` as `RECV n`, reference when non-empty,
  employee (`:54-63`).
- Lines: item name + attribute values, unit price, quantity formatted as
  `qty [stock_name] x receiving_quantity_or_1`, line total from the cart's
  stored `total` (`:73-79`); a serialnumber row is always printed (`:80-82`);
  discount row printed when discount > 0: fixed -> currency amount, percent ->
  "discount included" with the percentage (`:83-91`).
- Total row always printed (`:93-98`).
- Payment block omitted for requisition (`:99-122`): payment type, and when
  `amount_change` is set, amount tendered and change.
- Return policy from config (`:125-127`).
- Barcode block: SVG plus text `RECV n` (`:129-132`).
- Print CSS class `print_hide` on the control buttons; `printdoc()` from the
  partial (`partial/print_receipt.php:7-64`).
- No email, no invoice, no tax rows, no description/serial config flags. The
  `receipt_show_taxes`, `receipt_show_total_discount`, `receipt_show_description`
  and `receipt_show_serialnumber` flags affect sales receipts, not receiving
  receipts.

### 7.3 `getReceipt` (`Receivings.php:424-468`)

- Requires `reports_receivings`.
- Loads the header row; calls `copy_entire_receiving(id)` to rebuild the cart
  from stored lines; builds the same receipt data from the cart.
- `transaction_time` comes from the stored `receiving_time`; `payment_type`
  from the stored header; `print_after_sale = false`.
- **Quirk:** `$data['reference'] = $this->receiving_lib->get_reference()`
  reads the *current session* reference, not `receiving_info['reference']`, so
  reprinting a historical receipt shows the wrong reference (or empty).
- It then calls `clear_all()` (`:465`), destroying any in-progress receiving
  that the user had on the register.
- A missing receiving id is not handled: empty row, empty cart, a receipt with
  warnings.
- No email route exists for receivings.

---

## 8. Permissions, validation, security (per action)

### 8.1 Authorization

| Action | Module grant | Extra grant | Behaviour on failure |
|---|---|---|---|
| All actions | `receivings` | - | `RedirectException` to no_access (`Secure_Controller.php:43-49`) |
| `getEdit` | `receivings` | `reports_receivings` | `redirect()->to('no_access/receivings/reports_receivings')` (`Receivings.php:239-241`) |
| `getReceipt` | `receivings` | `reports_receivings` | same redirect (`:428-430`) |
| `postDelete` | `receivings` | `reports_receivings` | 403 JSON (`:298-300`) |
| `postSave` | `receivings` | `reports_receivings`; `employees` for employee reassignment | 403 JSON (`:522-524`); employee forced to stored id without `employees` (`:534-539`) |
| Register price/discount editing | `receivings` | `items` (view-level only) | UI hides inputs (`receiving.php:144,172`) |

Security notes:

- The `items` grant on price/discount is enforced only in the view. The server
  `postEditItem` does not re-check it (`Receivings.php:197-227`), so a crafted
  POST can change cost price with only the `receivings` grant.
- `postChangeMode` validates the stock **source** with
  `Stock_location::is_allowed_location($source, 'receivings')`
  (`:120`, `app/Models/Stock_location.php:121-132`) but does not validate the
  destination.
- `postDelete` trusts the `ids[]` POST array; `delete_list` does not verify that
  the ids exist before attempting deletes.
- `postSave` does not validate supplier existence (unlike `save_value`), and a
  bad date string is a fatal rather than a validation error.
- `getReceipt` clears the live cart as a side effect of a GET.

### 8.2 Validation

- Only `postEditItem` uses the validator (`price` required decimal_locale,
  `quantity` required decimal_locale, `discount` permit_empty decimal_locale;
  `:201-220`).
- `postAdd` has no validation beyond item lookup/barcode parse.
- `postComplete` has no validation of payment type, amount tendered, supplier,
  or cart contents (empty cart is rejected inside `save_value` by returning -1).
- `postSave` has no validation; `date_required` language string exists but is
  unused.
- `Receiving::save_value` validates only the supplier (exists -> id else null).

### 8.3 Request hygiene

`supplier`, `stock_source` and `employee_id` use
`FILTER_SANITIZE_NUMBER_INT`; mode/comment/reference/description/serial/
payment_type use `FILTER_SANITIZE_FULL_SPECIAL_CHARS`; discount/price use
`FILTER_SANITIZE_NUMBER_FLOAT`. Endpoints are ordinary form posts/AJAX beyond
the framework filters.

---

## 9. Target gap analysis (file by file)

### 9.1 Target route/action surface

Pages:

- `src/app/(secure)/receivings/register/page.tsx` — `requirePermission("receivings")`,
  loads cart via `getReceivingCart()`, totals via `getReceivingTotals`, all
  undeleted stock locations, all undeleted suppliers, renders `Register`.
- `src/app/(secure)/receivings/manage/page.tsx` — same permission, lists all
  `receivings` ordered by `receivingTime` desc; no filters/pagination.
- `src/app/(secure)/receivings/receipt/[id]/page.tsx` — same permission,
  renders a read-only receipt.
- There is **no** `/receivings` index page (upstream `/receivings` is the
  register); the sidebar links to `/receivings/register`
  (`src/components/shared/sidebar.tsx:34`).

Server actions (`src/app/(secure)/receivings/actions.ts:16-137`):
`getReceivingCartAction`, `addItemAction`, `editItemAction`, `deleteItemAction`,
`selectSupplierAction`, `removeSupplierAction`, `setCommentAction`,
`setInvoiceNumberAction`, `setReferenceAction`, `setLocationAction`,
`changeModeAction`, `completeReceivingAction`, `searchReceivingsAction`,
`getReceivingRowAction`, `itemSearchAction`, `stockItemSearchAction`,
`addItemKitAction`, `returnEntireReceivingAction`, `copyEntireReceivingAction`,
`cancelReceivingAction`, plus re-exports `isValidReceipt`/`getReceivings`.
Only add/edit/delete, supplier, setters, mode and complete are used by the UI;
the rest (searches, kit, return, copy, cancel stored, row/cart getters) are dead.
API: `src/app/api/reports/[key]/detailed-receivings-row/route.ts` (unused;
returns `{receiving, items, supplier}` after an auth-only check).

### 9.2 `src/lib/receiving/receiving-store.ts`

Cart is persisted as JSON in `cart_sessions` under `recv:<personId>`
(`:50-63,65-75`); `emptyReceivingCart()` (`:36-48`) has `mode`
`"receive"|"return"`, `supplierId`, `employeeId`, `comment`, `invoiceNumber`,
`reference`, `locationId` (hardcoded 1), `printAfterSale`. Gaps: no requisition
or source/destination (`:28-33`); `employeeId`/`printAfterSale` are never
meaningfully used; `reference` is never persisted; location defaults to 1
rather than `getDefaultLocationId("receivings")`
(`src/lib/items/item-lib.ts:26-35`); no distinguish between active and
suspended (upstream has no suspend either, but the target persists across
sessions).

### 9.3 `src/lib/receiving/receiving-lib.ts`

- `addItem` (`:13-64`):
  - no barcode parsing (`Token_lib::parse_barcode` equivalent
    `src/lib/token/index.ts:72-107` is not called);
  - no item-kit detection; a `"KIT n"` string is looked up in `items` and
    fails (`:30-33`);
  - no receipt/reference detection (that only happens in the unused
    `returnEntireReceiving`);
  - merge key is `itemId` only (`:37`) instead of `itemId + itemLocation`;
    therefore a second add for the same item at a different location folds into
    the first line and keeps the first location;
  - merge total uses stored price/discount but excludes
    `receivingQuantity` (`:40`);
  - new-line total excludes `receivingQuantity` (`:58`) even though the field
    is stored (`:57`); the correct formula exists only in the dead `getItemTotal`
    (`:282-284`);
  - no `stockName`, `in_stock`, `allow_alt_description`, attribute values/
    dates, or `receiving_quantity_choices` (upstream cart contract, section 2.2);
  - no `multi_pack_enabled` name suffix;
  - no default receiving discount/type from config;
  - missing item throws (`:33`) instead of returning false and surfacing
    `unable_to_add_item`;
  - `opts.line` lets a caller force a line number; merge path ignores it.
- `computeLineTotal` (`:66-71`): no receiving-quantity factor; rounds to 4 dp
  instead of upstream bcscale truncation.
- `editItem` (`:73-84`): no validation; clamps quantity to >=0, price to >=0,
  percent discount to <=100 (upstream does none of this); accepts arbitrary
  `Partial<ReceivingLine>` keys from the client; excludes receiving quantity
  from the total.
- `deleteItem` (`:86-90`): correct.
- `selectSupplier` (`:92-96`): no existence validation (upstream
  `Supplier::exists`).
- `removeSupplier` (`:98-104`): clears `invoiceNumber` and `reference`
  (upstream clears only reference before removing supplier).
- `setInvoiceNumber` (`:112-116`): upstream has no invoice number at all.
- `changeMode` (`:130-135`): only `receive`/`return`; clears reference
  (matches upstream's first branch) but cannot enter requisition.
- `getReceivingTotals` (`:137-140`): sums stored `total`; `subtotal === total`;
  no rq.
- `returnEntireReceiving` (`:146-203`):
  - RECV branch loads lines and sets **positive** quantities with
    `mode = "return"` (`:156-175`); sign is applied at completion, unlike
    upstream's negative cart quantities. Switching mode after loading changes
    the direction of the stock move.
  - does not clear the comment (upstream does) and does not handle missing
    receiving with an error (silently returns).
  - total uses `quantityPurchased * itemUnitPrice` only (`:171`): ignores
    discount and receiving quantity.
  - KIT branch (`:177-200`) loads an **item kit definition** and adds its
    components with price 0; upstream treats `KIT n` as a **receiving id**
    (`Receiving_lib.php:414-434`). Internally inconsistent with
    `isValidReceipt`, whose KIT id is a receiving id (`:294-295`).
  - no reference lookup (`Receiving::get_receiving_by_reference` absent).
  - `itemName` empty and `itemNumber` null, so the UI shows blank line names.
- `addItemKit` (`:205-235`): appends components without merging into existing
  lines (upstream `add_item` merges), does not use kit-number lookup beyond
  `itemKitId`, ignores `item_kit_items.kitSequence` ordering (drizzle `.all()`
  has no order), and sets price from the item cost.
- `copyEntireReceiving` (`:237-264`): copies `comment` and `invoiceNumber`
  (upstream does not) and not reference; totals ignore discount/rq.
- `clearAllReceiving` (`:266-280`): hardcodes `locationId: 1`, resets
  `printAfterSale` (upstream preserves it) and has no caller.
- `getItemTotal`/`getReceivingTotal` (`:282-288`): dead code.
- `isValidReceipt` (`:290-297`): only anchored, case-insensitive `RECV n` /
  `KIT n`; no reference; return type advertises `"ITEM"` but never returns it.
- Imports are voided at `:299-304` (`ITEM_TYPE`, `STOCK_TYPE`, `SALE_STATUS`,
  `getItemLocation`, `recordDelta`, `FIXED`) — evidence of unfinished wiring.

### 9.4 `src/lib/receiving/receiving-model.ts`

- `completeReceiving` (`:15-89`):
  - invents an invoice number from `recv_invoice_format` (default `{CO}`,
    `:20-25`). Upstream has no receiving invoice number, and the target's
    `{CO}` token counts **sales** with a non-null invoice number
    (`src/lib/token/index.ts:112-115`), so it is not a receiving sequence.
    `{ISEQ}` would increment the sales `last_used_invoice_number`.
  - no empty-cart guard (the action checks, the model does not; a direct call
    inserts an empty header with a generated invoice number).
  - no supplier existence validation.
  - never persists `cart.reference`; the target schema has no reference column
    (see 9.7).
  - `receivingQuantity: 1` hardcoded (`:52`) — the ship-pack factor is lost on
    every persisted line.
  - omits `serialnumber` and `transferItemLocation`.
  - `item_cost_price` comes from the cart snapshot (`line.costPrice`, `:47`),
    not from the item's current DB cost at save time (upstream
    `Receiving.php:135,147`).
  - average-cost update (`:55-60`) ignores `receiving_calculate_average_price`;
    it runs for every receive line with price>0 and quantity>0. It passes
    `line.quantity` (not `quantity*rq`); it is called before the quantity
    update, which is the correct order (see 9.9 for the historical double-count).
  - quantity update is read-modify-write with a fallback insert (`:62-76`); it
    mirrors upstream's non-atomic update and its upsert, but the target's SQLite
    `item_quantities` has no composite PK (see 9.7), so duplicate rows are
    possible.
  - inventory comment is `"Receiving"` / `"Receiving return"` (`:83`) instead of
    `RECV <id>`; this breaks the receipt-edit contract that `postSave` uses
    (updating inventory `trans_date` by comment).
  - no attribute-link copy, no `-1` failure sentinel (exceptions propagate), no
    barcode generation, no print flag, no payment options/amount tendered.
  - return mode negates `line.quantity` at persistence (`:40`); upstream relies
    on already-negative cart quantities. Divergent cart contract.
- `getReceiving` / `getReceivingItems` (`:91-99`): flat reads, no joins.
- `getReceivings` / `searchReceivings` (`:102-120`): invented list/search API,
  unused by the UI; filters are numeric epoch ranges, supplier id, and invoice
  number substring. No reference/date-format handling, no pagination UI, no
  total/employee/supplier enrichment.
- `cancelReceiving` (`:122-145`):
  - named "cancel" but performs a hard delete of a persisted receiving
    (upstream distinguishes `cancelReceiving` = clear in-process cart from
    `postDelete` = delete stored receiving);
  - no `reports_receivings` check, no existence check, no batch ids, no
    `update_inventory` toggle;
  - reversal subtracts `line.quantityPurchased` (correct sign for returns) but
    ignores `receiving_quantity` (upstream multiplies by `-rq`);
  - if no `item_quantities` row exists it does nothing (upstream's
    `changeQuantity` upserts a negative row);
  - relies on `ON DELETE CASCADE` for `receivings_items` (FK is enabled in
    `src/lib/db/sqlite.ts:19`), whereas upstream explicitly deletes lines first;
  - writes inventory comment `"Receiving cancelled"` and does not touch
    attribute links or cost price (upstream also does not touch cost).
- Missing entirely: `save_value`, `update` (stored receiving header edit),
  `deleteList`, `getReceivingByReference`, `exists`, `isValidReceipt` in the
  model, `getSupplier`, `getPaymentOptions`, `createTempTable`.

### 9.5 `src/components/receivings/register.tsx`

- Add form is free text + quantity (`:28-51`), no autocomplete, so partial
  names fail; quantity is clamped >=1 only in the UI (`:44`), not server-side.
- Cart table (`:65-91`) has name/description, price, quantity, discount, total,
  delete; missing item number, stock name/in-stock, attributes, ship pack/rq,
  discount-type toggle, serial/description editing, update button, cost editing.
  Edits fire a server action on every keystroke (`:77,85`), not on change/blur.
- Mode control is receive/return only (`:95-103`); no requisition/source/
  destination. Side panel (`:110-147`) is a supplier select (no autocomplete or
  new-supplier modal), location select, invoice number, reference, comment; no
  supplier email/address, print toggle, payment options, amount tendered,
  destination, or cancel button. Complete hardcodes `"cash"` (`:152`), disables
  only on empty cart, and has no confirmation. No receipt scan, copy, stored
  delete, print, email, or barcode.
- `initialCart` is a prop and mutations call `revalidatePath`, so every change
  re-renders the whole page; no optimistic local state.

### 9.6 Pages

`register/page.tsx`:

- lists **all** undeleted stock locations, ignoring `receivings_stock` grants
  (`:14`; upstream uses `get_allowed_locations('receivings')`);
- lists all suppliers with no limit and a company-or-name label (`:15-24`);
- permission is `receivings`, matching upstream module access.

`manage/page.tsx`:

- permission should be `reports_receivings` (upstream report/edit/delete
  surface); it uses `receivings` (`:8`);
- shows id/date/invoice/supplier id/comment with supplier as a numeric id
  (`:34`); no name, total, payment, reference, or actions; executes and
  discards a per-row items query (`:27-28`, dead N+1); no filters, pagination,
  search, edit modal, or delete. Upstream's history is
  `reports/detailed_receivings`, whose row links an edit modal (receipt and
  delete).

`receipt/[id]/page.tsx`:

- permission `receivings` (upstream `getReceipt` needs `reports_receivings`);
- total is `sum(itemCostPrice * abs(quantityPurchased))` (`:23`), ignoring
  `itemUnitPrice`, discounts, and rq (upstream uses cart line total);
- label uses `description` not item name (`:38`); omits serial, unit price,
  quantity x pack, discount rows, stock location;
- shows invoice number and comment (`:31-32`) but no reference, employee,
  payment, amount tendered/change;
- no company header/logo/address/phone/return policy, barcode, print button/CSS,
  `print_after_sale`, email, or requisition handling;
- has "Receiving not found" (`:13`), unlike upstream.

### 9.7 `src/db/schema/receivings.ts` and migrations

`receivings` (`:5-15`) vs upstream:

- `receivingTime` integer epoch vs MySQL timestamp;
- `supplierId` references `people.personId` (upstream FK is
  `suppliers.person_id` — same id space but looser);
- `receivingRef: integer("receiving_ref")` is **not** upstream's
  `reference varchar(32)`; the SQLite migration even makes it a self-referencing
  FK to `receivings.receiving_id` (`drizzle/sqlite/0000_skinny_power_man.sql:231,236`).
  No code writes it, and the real business reference has no column;
- `invoiceNumber` is invented (upstream has no such column);
- `receivingLocation` is invented (upstream stores location per line only);
- no index on reference/receiving_time; no unique constraints.

`receivings_items` (`:17-30`) vs upstream (`initial_schema.sql:471-489` plus
`3.2.1_to_3.3.0.sql:36-38`):

- columns largely match (including `discount`/`discount_type`);
- `transferItemLocation` is invented and never written;
- SQLite DDL has **no composite primary key** `(receiving_id,item_id,line)`
  (`drizzle/sqlite/0000_skinny_power_man.sql:240-257`); the MySQL DDL does
  (`src/db/schema/mysql/index.ts:291-293`);
- `item_location` is nullable in SQLite, while upstream is NOT NULL;
- real vs decimal(15,3)/(15,2) precision (see 6.5).

Related schema:

- `item_quantities` SQLite has no `(item_id, location_id)` primary key
  (`drizzle/sqlite/0000_skinny_power_man.sql:113-119`), unlike upstream
  (`initial_schema.sql:282-289`).
- `cart_sessions` (`src/db/schema/auth.ts:61-66`) is the target's session store.
- No `receivings_payments` table exists in either system; upstream receiving
  payments are a single `payment_type` string on the header.

### 9.8 `src/lib/items/repository.ts` — `changeCostPrice` (`:513-535`)

- `itemsReceived <= 0` -> set cost to `newPrice` (`:517-520`). Upstream would
  compute an average with a negative received quantity (and may divide by zero
  at zero total). The target's guard is a behavioural divergence.
- old-quantity sum over non-deleted locations (`:521-525`) matches upstream.
- `totalQty <= 0` -> set `newPrice` (`:528-531`) instead of throwing; 4-dp
  rounding (`:533`) vs upstream truncate-then-DECIMAL(15,2).
- accepts/ignores `employeeId` and takes no transaction handle; uses
  `getDbSync()` internally, so it works on the same better-sqlite3 connection
  inside `completeReceiving`'s transaction but throws under `DB_DRIVER=mysql`
  (`src/lib/db/index.ts:32-36`).
- caller passes `line.quantity` only; must become `quantity * receivingQuantity`.

`src/lib/items/item-lib.ts`: `getDefaultLocationId` (`:30-35`) returns the
first undeleted location instead of ordering by `is_default DESC, sort_order
ASC` with `receivings_stock` grants (`Stock_location.php:138-153`);
`isAllowedLocation` (`:39-43`) ignores grants; `getReceivingLocation` (`:26-28`)
is unused by the cart.

`src/lib/suppliers/repository.ts`: `getSearchSuggestions` (`:58-79`) is unused
by receiving and matches company/first/last/account instead of
agency/email/phone (`Supplier.php:157-216`); there is no `exists()` helper and
`selectSupplier` performs no validation.

### 9.9 Verification of the four specific suspicions

1. **Requisition/transfer missing** — confirmed: no mode, source/destination,
   action, transfer lines; `transferItemLocation` is never written
   (`receiving-store.ts:28`, `receiving-model.ts:41-53`).
2. **`receiving_quantity` always 1** — confirmed at `receiving-model.ts:52`;
   totals (`receiving-lib.ts:40,58,81`), cancel (`:131`), receipt
   (`receipt/[id]/page.tsx:38-39`) and UI (`register.tsx:65-91`) all ignore it.
3. **Average-cost double count** — not present in current code:
   `changeCostPrice` (`receiving-model.ts:55-60`) runs before the quantity
   update (`:62-76`), matching `app/Models/Item.php:1404-1405`. Git history
   shows the earlier version (commit `2d73454`, superseded by `2d491d6`)
   computed after the update and did double-count. Remaining defects: missing
   config gate and equal-price guard, missing rq factor, 4-dp/real precision.
4. **Receipt/reference/barcode/supplier/payment** — missing as detailed in
   9.3-9.7: no RECV/KIT/reference detection in `addItemAction`; `isValidReceipt`
   cannot return references and conflicts with `returnEntireReceiving` on KIT;
   `parseBarcode` is never called; supplier is a preloaded select with no
   existence check; payment is hardcoded `"cash"`.

---

## 10. Implementation obligations (ordered)

Every item below states the target file(s), the data contract, and the tests
that prove parity. "Upstream contract" means the behaviour verified in sections
2-8, including documented defects where parity is explicitly waived.

### Phase A — data contract (blocking)

A1. **Receivings schema.**
Files: `src/db/schema/receivings.ts`, `src/db/schema/mysql/index.ts`,
new Drizzle migrations.
Contract:
- replace `receivingRef: integer` with `reference: text("reference")`
  (nullable, upstream varchar(32));
- keep or remove `invoiceNumber` only after an explicit product decision; if
  kept, it is an extension not present upstream (section 3.6);
- `receivingLocation` is an extension; upstream has no header location, so
  receipt/report code must not depend on it;
- drop or justify `transferItemLocation`; if the target wants an explicit
  transfer source column, it must be written by the requisition path;
- `receivings_items` SQLite needs the composite primary key
  `(receiving_id,item_id,line)` and `item_location` NOT NULL semantics;
- `item_quantities` needs the composite primary key `(item_id,location_id)`.
Tests: migration test that duplicate `(item_id,location_id)` inserts fail; a
receiving line with a duplicate `(receiving_id,item_id,line)` fails.

A2. **Cart state contract.**
File: `src/lib/receiving/receiving-store.ts`.
Add to `ReceivingLine`: `serialnumber`, `stockName`, `attributeValues`,
`attributeDateValues`, `allowAltDescription`, `inStock`,
`receivingQuantityChoices`. Add to `ReceivingCart`: `mode:
"receive"|"return"|"requisition"`, `stockSource`, `stockDestination`.
Keep `invoiceNumber`/`reference` only per A1. `emptyReceivingCart` must use the
employee's default receiving location, not 1.
Tests: default location resolution follows `is_default` then `sort_order`;
cart round-trips all fields through `cart_sessions`.

A3. **Decimal arithmetic contract.**
File: new `src/lib/receiving/decimal.ts` (or shared decimal helper).
Contract: totals and cost use decimal arithmetic truncated at
`max(2, currency_decimals + tax_decimals)`; persisted money columns keep
currency scale (2 by upstream schema) and quantity columns quantity scale (3).
Tests: 196/18 -> 10.8888 intermediate, stored cost 10.89 on MySQL-scale;
10.77777 -> 10.7777 -> 10.78.

### Phase B — cart library parity

B1. **`addItem`.**
File: `src/lib/receiving/receiving-lib.ts`.
Contract:
- lookup: item_number first, then item_id when all-digits and not leading `0`,
  `LIMIT 1`; `includeDeleted` honoured; missing -> `false`/typed error, not an
  exception (surface `unable_to_add_item`);
- barcode: call `parseBarcode` with `barcode_formats`; apply W -> quantity,
  P -> price, I -> item; preserve fractional quantity (do not repeat upstream's
  int truncation defect; document divergence);
- kit: `KIT n` or `item_kits.item_kit_number` -> explode via `item_kit_items`
  ordered by `kit_sequence`, merging each component into existing lines;
- merge key `(itemId, itemLocation)`, and do not merge serialized items or
  entries with a serial number;
- defaults: price = item cost, discount = `default_receivings_discount`,
  discount type = `default_receivings_discount_type`, receiving quantity = item
  receiving quantity, description = item description, serial = `""`;
- line total uses `quantity * receivingQuantity`;
- build `stockName` from the location, `inStock` from `item_quantities`,
  `allowAltDescription`, attribute values/dates (`SHOW_IN_RECEIVINGS`
  semantics: unlinked attributes for a new receiving, receiving-linked for
  copy/return), `receivingQuantityChoices`;
- multi-pack: append `NAME_SEPARATOR + pack_name` when `multi_pack_enabled`.
Tests: add by id, by number, by leading-zero barcode; missing item; merge
same item+location increments; same item different location creates a second
line; serialized item does not merge; kit adds components; barcode quantity
fraction preserved; default discount applied; multi-pack label.

B2. **`editItem` / `deleteItem`.**
Contract: validate the numeric fields (price/quantity required decimal,
discount optional decimal), do not silently clamp; update all editable fields
including receiving quantity and recompute total with rq; return a real
success/failure; delete by line.
Tests: edit quantity/price/discount/type/rq updates total; invalid decimal
rejected; delete removes only the target line.

B3. **Totals.**
Contract: `getItemTotal(quantity, price, discount, type, rq)` as section 6.2
with decimal truncation; `getTotal` sums; expose the computed total for the UI
without relying on the stored `total` (or keep both consistent on merge).
Tests: percent/fixed/rq cases in section 6.5.

B4. **Mode and locations.**
Contract: modes `receive`/`return`/`requisition`; requisition offered only when
more than one **allowed** receiving location exists; source/destination
defaults from the default receiving location; `changeMode` clears the reference
only when the locations are unchanged; source must be an allowed location;
destination should be an allowed location too (fix the upstream omission).
Tests: requisition hidden with one location; source change applies both;
destination-only change works (fix upstream defect); reference cleared on mode
change only.

B5. **`returnEntireReceiving` / `copyEntireReceiving` / `isValidReceipt`.**
Contract:
- `isValidReceipt`: `RECV n` / `KIT n` (2 pieces, prefix match) -> exists; else
  exact reference lookup; both case handling and whitespace defined;
- return: empty cart/supplier/comment; add stored lines with negative quantities
  (or keep cart positive + mode return, but choose one authoritative sign
  contract and document it), preserving location, discount, type, unit price,
  description, serial, rq, and include-deleted items; set supplier; do not set
  mode implicitly if the caller already did;
- copy: rebuild with positive quantities and stored fields; set supplier only
  (do not copy comment/reference/invoice);
- `KIT n` must mean a receiving id, not an item-kit definition.
Tests: return by `RECV 5`, by `KIT 5`, by reference `PO-1`; missing reference
errors cleanly; fractional stored quantities preserved; copy does not carry
comment/reference.

B6. **`clearAll` / cancel semantics.**
Contract: in-process cancel clears mode/cart/supplier/comment/reference and
preserves print-after-sale and stock locations (upstream); stored receiving
deletion is a separate operation; UI needs a Cancel button.
Tests: cancel leaves print flag and locations; delete removes rows and reverses
stock.

### Phase C — persistence parity

C1. **`saveValue`/`completeReceiving`.**
File: `src/lib/receiving/receiving-model.ts`.
Contract:
- reject empty cart with the upstream `-1` sentinel (or a typed failure the
  caller maps to `transaction_failed`);
- header: server time, supplier exists-or-null, employee, payment type, comment,
  reference;
- transaction: insert header, then per line insert the exact upstream column
  set including `serialnumber`, signed `quantity_purchased`, `receiving_quantity`,
  discount/type, `item_cost_price = current DB cost`, `item_unit_price = cart
  price`, `item_location`;
- `itemsReceived = rq != 0 ? quantity*rq : quantity` (including the rq==0
  fallback; document the rq=0 total-0 quirk or fix it explicitly);
- average cost only when `receiving_calculate_average_price` is truthy and
  `current cost != cart price`, called before the quantity update, using the
  same extended quantity; guard total_qty == 0 deliberately (choose and
  document: throw vs set new price);
- `item_quantities` upsert;
- inventory row with `trans_comment = RECV <id>` and signed extended quantity;
- copy unlinked attribute links to `receiving_id`;
- no invoice number unless A1 keeps it, and then with a real receiving sequence,
  not the sales `{CO}` count.
Tests: port of `tests/Models/ReceivingTest.php:80-107` (5 @1 -> +5, delete -> 0);
rq 4x2 -> +8 and delete -> -8; rq 0 -> +4 and delete -> 0 (decide/document);
cost example 10/10@10 + 8@12 -> 10.89; config off -> cost unchanged; return
line -> negative stock and negative inventory; reference persisted; attribute
links copied; empty cart -> failure.

C2. **Stored-receiving edit.**
File: new model function plus `src/app/(secure)/receivings/edit/[id]/page.tsx`
and action.
Contract: update `receiving_time`, supplier (validated), employee (grant-
controlled), comment, reference; update inventory `trans_date` for
`trans_comment = RECV <id>`; do not edit lines or payment type; require
`reports_receivings`.
Tests: header update round-trip; inventory trans_date updated for all receiving
lines; employee forced when the caller lacks the grant; bad date rejected.

C3. **Delete.**
File: `cancelReceiving` -> rename/split into `deleteReceivings(ids,
updateInventory)`.
Contract: per-line inventory reversal `quantity_purchased * -receiving_quantity`
and `item_quantities` upsert (create a negative row if absent); delete lines
then header in one transaction; delete attribute links for the receiving (fix
upstream orphan defect or document); permission `reports_receivings`; batch ids;
`update_inventory` option.
Tests: upstream delete test; delete with a missing quantity row; delete a
return receiving restores stock; delete with rq 0 behaviour documented; bulk
delete.

C4. **Requisition completion.**
File: new `requisitionComplete` model function + action.
Contract: require source != destination; for each cart line create exactly two
lines destination `+q`, source `-q`, preserving price/description/serial/
receiving quantity; no discount (do not replicate the upstream
discount_type-as-discount defect); persist through the same transaction path;
no stock check (upstream) or add an explicit negative-stock policy; header
payment/amount handling per receipt rules.
Tests: two lines with net zero total; destination +q and source -q in
`item_quantities` and `inventory`; source may go negative; same-location error;
edited receiving quantity preserved; no cost change.

C5. **List/search.**
Contract: upstream-compatible date filtering (date vs datetime mode), receiving
id, reference, supplier, payment; totals via rq and discount; employee and
supplier names; used by manage page and detailed-receivings report.
Tests: date range, reference substring/exact, supplier, totals with rq and
percent/fixed discounts.

### Phase D — UI parity

D1. **Register (`src/components/receivings/register.tsx`).**
- autocomplete using `stockItemSearchAction` returning `{value,label}`;
- barcode submit path;
- cart columns per section 5.1; cost/discount editing gated by `items` grant
  (enforced server-side too); ship-pack dropdown; discount %/fixed toggle;
  description/serial editing; per-line update;
- supplier autocomplete + new-supplier modal; supplier email/address display;
- mode incl. requisition, source/destination dropdowns;
- comment/reference/print-after-sale, payment options, amount tendered;
- cancel (clear in-process cart) with confirmation;
- return-mode receipt scan input;
- no per-keystroke server writes (use change/blur or debounce).
Tests: e2e add/edit/delete/complete/return/requisition; permission hides cost
editing; cancel clears cart and preserves print flag.

D2. **Manage (`src/app/(secure)/receivings/manage/page.tsx`).**
Contract: `reports_receivings` permission; supplier name; reference; total;
payment; date filters; pagination; edit modal; delete with inventory toggle;
links to receipt. Tests: permission denial for a receivings-only employee;
filters; edit/delete round-trip.

D3. **Receipt (`src/app/(secure)/receivings/receipt/[id]/page.tsx`).**
Contract: render from stored rows using `itemUnitPrice * quantity * rq - discount`
(not cost price), item name, serial, discount rows, payment type, reference,
employee, supplier block, company header/flags, return policy, barcode
Code128 `RECV n`, print button/auto-print honouring `print_after_sale`, and
requisition mode hiding the payment block. No email (upstream has none).
Tests: totals with rq and discounts; reference/employee/payment shown; print
flag triggers print; requisition receipt has no payment rows.

### Phase E — authorization and validation

E1. Every server action must call `requirePermission("receivings")` (or the
relevant submodule) server-side; price/discount mutation must additionally
check the `items` grant; delete/edit/receipt must check `reports_receivings`.
E2. Validate add quantity > 0 for receive mode and reject NaN/infinite/absurd
values; validate payment type against `getPaymentOptions`; validate supplier
exists; validate location is allowed for the employee.
E3. Reject empty cart in the model; surface `transaction_failed` equivalent.
Tests: direct action invocation by an unauthorized employee is rejected; crafted
price edit without `items` grant is rejected; invalid supplier/location/payment
rejected.

### Phase F — tests to add (target)

F1. `src/lib/receiving/receiving-model.test.ts` — port
`tests/Models/ReceivingTest.php` plus the C1 cases.
F2. `src/lib/receiving/receiving-lib.test.ts` — cart/add/edit/merge/kit/return/
copy/totals (B1-B5).
F3. `src/lib/receiving/requisition.test.ts` — C4.
F4. `src/lib/receiving/delete.test.ts` — C3, including the upstream regression
assertion that stock returns to 0.
F5. `e2e/receivings.spec.ts` — extend the smoke test with barcode add, price/
qty/rq edit, non-cash completion, return by `RECV`, requisition, print flag,
and permission denial.
F6. `src/app/(secure)/receivings/actions.test.ts` (or e2e) — authorization
matrix.

---

## 11. Unknowns and edge cases

1. **Return-by-receipt is broken upstream**: `return_entire_receiving(int ...)`
   receives `"RECV 5"` / non-numeric references; PHP weak typing throws
   `TypeError` (verified coercion; no controller test covers it).
2. **`print_after_sale` for receivings**: the malformed view-data array
   (`receipt.php:27`) leaves `$print_after_sale` undefined in
   `partial/print_receipt.php:54-68`; confirm live behaviour.
3. **`bcdiv` by zero** when a return brings the stock total to zero is expected
   to throw on PHP 8; confirm (bcmath unavailable in the analysis container).
4. **`postDelete` scalar filter on an array field** (`ids[]`): CI4's behaviour
   is not verified; the delete path depends on getting an array back.
5. **Destination-only `changeMode`** is ignored by the early branch; decide
   whether to preserve the defect or fix it.
6. **Fractional quantity truncation** in upstream `add_item`/`add_item_kit`/
   `return_entire_receiving` is verified PHP behaviour; product impact depends
   on whether fractional quantities are used.
7. **Target `receivingRef`**: self-referencing integer FK in SQLite, never
   read/written; presumably a mis-generated mapping of `reference`.
8. **Target `invoiceNumber`**: desired extension or accident? If wanted, it
   needs its own sequence; `{CO}` currently counts sales invoices.
9. **Target MySQL**: the subsystem calls `getDbSync()`, which throws under
   `DB_DRIVER=mysql` (`src/lib/db/index.ts:32-36`); confirm whether required.
10. **Target item kits** live only in `item_kits`/`item_kit_items` (no `items`
    row with `item_type=1`), unlike upstream; affects KIT semantics/search.
11. **Upstream report profit** omits the rq factor on cost while `cost`
    includes it (`Receiving.php:342-343`); decide replicate vs correct.
12. **`DECIMAL(15,2)` rounding mode** is assumed half-up; confirm if cent
    parity matters.
13. **Receiving config defaults** (`default_receivings_discount`,
    `receiving_calculate_average_price`) are seeded upstream but absent from the
    target seed; confirm the target bootstrap.
14. **Missing-id handling** for `getEdit`/`getReceipt` upstream produces
    warnings/empty receipts; target returns "not found". Choose a contract.
15. **`getReceipt` destroys the in-progress cart** upstream; recommend not
    reproducing, but document the divergence.

---

## Appendix — most-cited file:line anchors

Upstream: `app/Controllers/Receivings.php` (all 19 actions, `:32-576`),
`app/Libraries/Receiving_lib.php:45-516`, `app/Models/Receiving.php:33-356`,
`app/Models/Item.php:1404-1428`, `app/Models/Item_quantity.php:46-104`,
`app/Models/Inventory.php:34-61`, `app/Models/Stock_location.php:85-153`,
`app/Models/Supplier.php:28-90,157-216`,
`app/Libraries/Token_lib.php:169-186`, `app/Libraries/Barcode_lib.php:126-135`,
`app/Views/receivings/{receiving,receipt,form}.php`,
`app/Views/partial/print_receipt.php`, `initial_schema.sql:282-289,449-461,
471-489`, `tests/Models/ReceivingTest.php:80-107` (the only upstream receiving
test; the dinner_tables/stock_locations partials are not used by receivings).

Target: `src/lib/receiving/{receiving-lib,receiving-model,receiving-store}.ts`,
`src/app/(secure)/receivings/{actions.ts,register,manage,receipt}`,
`src/components/receivings/register.tsx`, `src/db/schema/receivings.ts`,
`drizzle/{sqlite/0000_skinny_power_man.sql:226-257,mysql/0000_demonic_darkstar.sql:245-268}`,
`src/lib/items/repository.ts:513-535`, `src/lib/items/item-lib.ts:26-43`,
`src/lib/suppliers/repository.ts:58-79`, `src/lib/token/index.ts:72-107`,
`src/db/schema/auth.ts:61-66`, `src/lib/reports/registry.ts:114-133`,
`src/lib/items/repository.test.ts:9-49`, `e2e/receivings.spec.ts:4-19`.
