# 02 — Items, Item Kits, Inventory, Quantities, Bulk Edit, CSV, Images, Barcodes

Analysis agent C. Source-parity study of OSPOS 3.4.3 (upstream, source of truth) against the
Next.js 16 + Drizzle port in `/home/yash/Desktop/yash/ospos-nextjs`.

- Upstream root: `/home/yash/ospos`, commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea` (verified with `git log -1`).
- Target root: `/home/yash/Desktop/yash/ospos-nextjs` (working tree; `docs/reconstruction/` was empty before this report).
- All `path:line` citations are to files as they exist at those roots. Upstream paths are relative to `/home/yash/ospos`; target paths are relative to the target root and start with `src/` or `drizzle/`.
- Scope: items, item kits, inventory, quantities, bulk edit, CSV import/export, item images, barcode generation, and the item form. Sales/receiving internals are cited only where they change item/quantity/inventory semantics.

Terminology used throughout:

- "ledger" = the append-only `inventory` table (`trans_inventory` signed delta, `trans_comment`, `trans_location`).
- "quantity row" = one row of `item_quantities` keyed by `(item_id, location_id)`.
- "kit row" = one row of `item_kits`; "component" = one row of `item_kit_items`.
- "upstream" = PHP/CodeIgniter 4 implementation; "target" = TypeScript/Drizzle implementation.

---

## 1. Route / action map

### 1.1 Upstream routing model

Upstream uses CodeIgniter 4 auto-routing: `app/Config/Routing.php:97` sets `public bool $autoRoute = true`.
Methods are reached by HTTP verb prefix:

- `getIndex()` → `GET /items`, `GET /item_kits`
- `getX()` → `GET /items/x`, `postX()` → `POST /items/x`
- A method with no `get`/`post` prefix (`suggest_search`, `check_kit_exists`, `saveItemAttributes`) is reachable by auto-routing under its literal name and is not verb-restricted by the router.

Access control is in `Secure_Controller::__construct()` (`app/Controllers/Secure_Controller.php:36-74`): it calls
`$this->employee->has_module_grant($module_id, person_id)` and throws `RedirectException("no_access/$module_id/$submodule_id")`
on failure. `Items` passes `'items'` (`app/Controllers/Items.php:49`); `Item_kits` passes `'item_kits'`
(`app/Controllers/Item_kits.php:21`). `'items'` and `'item_kits'` are both admin modules
(`app/Config/Constants.php:179`, `ADMIN_MODULES`).

The module grant is also read inside the item form: `Items::getView()` computes
`$data['item_kit_disabled'] = !$this->employee->has_grant('item_kits', ...)` (`app/Controllers/Items.php:372`) and
uses it to disable the "kit" item-type radio (`app/Views/items/form.php:140-142`).

### 1.2 `Items` controller — every public method

| # | Method | URL (auto-route) | Verb | Parameters | Permission | Response | Side effects |
|---|---|---|---|---|---|---|---|
| 1 | `getIndex` (`Items.php:75-103`) | `/items` | GET | none | `items` | HTML `items/manage` | sets session `allow_temp_items = 0` (line 77); reads `stock_location` GET and stores it via `Item_lib::set_item_location` through `get_item_location` fallback (lines 82-85); loads allowed locations (line 86), filter labels (89-97), restores filter state from query string via `restoreTableFilters` (line 100). |
| 2 | `getSearch` (`Items.php:109-163`) | `/items/search` | GET | `search`, `limit`, `offset`, `order`, `sort`, `stock_location`, `start_date`, `end_date`, `filters[]` | `items` | JSON `{total, rows}` | writes session `item_location` from `stock_location` (line 116); resolves attribute definitions with `SHOW_IN_ITEMS` (118); sanitizes sort over `itemSortColumns($definitionIds)` (121); builds the filter array (123-139), adds `SHOW_IN_SEARCH` definitions when `search_custom` is set (142-145); calls `Item::search` and `Item::get_found_rows`; **side effect:** for every row with a non-null `pic_filename` calls `update_pic_filename()` (157-159), which may write a corrected `pic_filename` back to the DB. |
| 3 | `getPicThumb` (`Items.php:215-255`) | `/items/PicThumb/{pic_filename}` | GET | filename path segment | `items` | image bytes with `mime_content_type` of the thumb (250-251); 400 for disallowed extension (232-234); empty 200 body when no file matches (239-252 never sets a body/status otherwise) | may generate a thumbnail file `uploads/item_pics/<base>_thumb.<ext>` (243-248). |
| 4 | `suggest_search` (`Items.php:262-273`) | `/items/suggest_search` | any (no prefix) | POST `term`, `search_custom`, `is_deleted` | `items` | JSON suggestion array `[{value?, label}]` | none. |
| 5 | `getSuggest` (`Items.php:280-286`) | `/items/suggest` | GET | `term` | `items` | JSON suggestions, `unique = true` (line 283) | none. |
| 6 | `getSuggestLowSell` (`Items.php:292-297`) | `/items/suggestLowSell` | POST or GET (`getPostGet`) | `name` | `items` | JSON suggestions | none. |
| 7 | `getSuggestKits` (`Items.php:303-308`) | `/items/suggestKits` | GET | `term` | `items` | JSON suggestions of **items rows with `item_type = ITEM_KIT`** (not `item_kits` rows) | none. |
| 8 | `getSuggestCategory` (`Items.php:315-320`) | `/items/suggestCategory` | GET | `term` | `items` | JSON category labels | none. |
| 9 | `getSuggestLocation` (`Items.php:327-332`) | `/items/suggestLocation` | GET | `term` | `items` | JSON labels | none. **Broken upstream:** `Item::get_location_suggestions` selects `location` from `items` (`app/Models/Item.php:1370-1374`), a column that does not exist on `items`; this endpoint errors/returns nothing on a real schema. |
| 10 | `getRow` (`Items.php:338-354`) | `/items/row/{itemIds}` | GET | colon-delimited ids in path | `items` | JSON map `item_id => dataRow` | reads item location from session (340). |
| 11 | `getView` (`Items.php:360-493`) | `/items/view/{item_id}` | GET | optional id (default `NEW_ENTRY`) | `items` | HTML `items/form` | none (read-only). |
| 12 | `getInventory` (`Items.php:502-524`) | `/items/inventory/{item_id}` | GET | optional id | `items` | HTML `items/form_inventory` | none. |
| 13 | `getCountDetails` (`Items.php:531-553`) | `/items/countDetails/{item_id}` | GET | optional id | `items` | HTML `items/form_count_details` | none. |
| 14 | `getGenerateBarcodes` (`Items.php:562-580`) | `/items/generateBarcodes/{item_ids}` | GET | colon-delimited ids | `items` | HTML `barcodes/barcode_sheet` | **writes `items.item_number`** for items whose number is empty when `barcode_generate_if_empty` is truthy — but writes the same empty value, see §6.3 (lines 570-575). |
| 15 | `getAttributes` (`Items.php:588-617`) | `/items/attributes/{item_id}` | GET | optional id, GET `definition_ids` (JSON map) | `items` | HTML `attributes/item` | none. |
| 16 | `postAttributes` (`Items.php:624-653`) | `/items/attributes/{item_id}` | POST | POST `definition_ids` (JSON) | `items` | HTML `attributes/item` | none. Duplicates `getAttributes` exactly. |
| 17 | `getBulkEdit` (`Items.php:661-686`) | `/items/bulkEdit` | GET | none | `items` | HTML `items/form_bulk` | none. |
| 18 | `postSave` (`Items.php:766-917`) | `/items/save/{itemId}` | POST | item fields, `tax_names[]`, `tax_percents[]`, `quantity_<location_id>` per location, `items_image` file, `attribute_links[definition_id]`, `attribute_ids[definition_id]`, `low_sell_item_id`, `tax_category_id` | `items` | JSON `{success, message, id}` | validation (768-772); image upload/move (`upload_image`, line 774); one DB transaction (836-916) covering: item insert/update, tax rows (non-destination tax only), quantity rows + ledger deltas, attribute delete/re-save. On any failure the whole transaction is rolled back. On image validation failure the DB work is also rolled back (905-916). |
| 19 | `postCheckItemNumber` (`Items.php:972-977`) | `/items/checkItemNumber` | POST | `item_number`, `item_id` | `items` | JSON string `"true"` when free, `"false"` when taken (note: inverted naming — see 2.2) | none. |
| 20 | `check_kit_exists` (`Items.php:984-993`) | `/items/check_kit_exists` | any | `item_number`, `name` | `items` | JSON string | **dead code**: calls `Item_kit::item_kit_exists_for_name()`, which does not exist (`app/Models/Item_kit.php` has no such method). |
| 21 | `getRemoveLogo` (`Items.php:1000-1006`) | `/items/removeLogo/{item_id}` | GET | id | `items` | JSON `{success}` | sets `items.pic_filename = null`; **does not delete the file** from disk. |
| 22 | `postSaveInventory` (`Items.php:1013-1047`) | `/items/saveInventory/{item_id}` | POST | `stock_location`, `newquantity`, `trans_comment` | `items` | JSON `{success, message, id}` | inserts one ledger row with `trans_inventory = parse_quantity(newquantity)` (delta, not absolute), then sets the quantity row to `current + delta` (1031-1038). No transaction; ledger write happens before the quantity write and is not rolled back if the quantity write fails. |
| 23 | `postBulkUpdate` (`Items.php:1053-1086`) | `/items/bulkUpdate` | POST | `item_ids` (colon string), whitelisted item fields, `tax_names[]`, `tax_percents[]` | `items` | JSON `{success, message, id}` | validation (1055-1059); `Item::filterBulkEditFields` (1062); `Item::updateMultiple` (1065); tax re-save when `$taxUpdated` (1069-1080). See §2.8 for the tax-loop bug. |
| 24 | `postDelete` (`Items.php:1091-1101`) | `/items/delete` | POST | `ids[]` | `items` | JSON `{success, message}` | `Item::delete_list` — soft delete, zero quantities, ledger adjustments (§3.4). |
| 25 | `getGenerateCsvFile` (`Items.php:1109-1118`) | `/items/generateCsvFile` | GET | none | `items` | CSV download named `import_items.csv` | none. |
| 26 | `getCsvImport` (`Items.php:1124-1127`) | `/items/csvImport` | GET | none | `items` | HTML `items/form_csv_import` | none. |
| 27 | `postImportCsvFile` (`Items.php:1134-1268`) | `/items/importCsvFile` | POST (multipart) | file field `file_path` | `items` | JSON `{success, message}` | `set_time_limit(240)` (1142); opens a transaction (1167-1168); per row: save item, taxes, quantities+ledger, attributes; any failed row rolls back the **entire** import (1250-1253); on full success commits and calls `Attribute::deleteOrphanedValues()` (1255-1258). |
| 28 | `saveItemAttributes` (`Items.php:1535-1562`) | `/items/saveItemAttributes/{itemId}` (auto-route, no verb prefix) | any | POST `attribute_links[definition_id]`, `attribute_ids[definition_id]` | `items` | JSON-ish bool (returned as body) | deletes all non-sale/non-receiving attribute links for the item then re-saves the posted ones; calls `deleteOrphanedValues`. Public but intended as a helper for `postSave` (line 901). |

### 1.3 `Item_kits` controller — every public method

| # | Method | URL | Verb | Parameters | Permission | Response | Side effects |
|---|---|---|---|---|---|---|---|
| 1 | `getIndex` (`Item_kits.php:65-70`) | `/item_kits` | GET | none | `item_kits` | HTML `item_kits/manage` | none. |
| 2 | `getSearch` (`Item_kits.php:75-94`) | `/item_kits/search` | GET | `search`, `limit`, `offset`, `sort`, `order` | `item_kits` | JSON `{total, rows}` | computes totals per kit via `_add_totals_to_item_kit` (line 89). |
| 3 | `suggest_search` (`Item_kits.php:99-105`) | `/item_kits/suggest_search` | any | POST `term` | `item_kits` | JSON suggestions (`value = "KIT <id>"`, `label = name|"KIT id"`) | none. |
| 4 | `getRow` (`Item_kits.php:111-117`) | `/item_kits/row/{row_id}` | GET | row id | `item_kits` | JSON single data row with computed totals | none. |
| 5 | `getView` (`Item_kits.php:123-158`) | `/item_kits/view/{item_kit_id}` | GET | optional id | `item_kits` | HTML `item_kits/form` | for `NEW_ENTRY` seeds defaults `price_option='0'`, `print_option=PRINT_ALL`, `kit_item_id=0`, `item_number=''`, `kit_discount=0` (127-133). |
| 6 | `postSave` (`Item_kits.php:164-224`) | `/item_kits/save/{item_kit_id}` | POST | `name`, `item_kit_number`, `kit_item_id`, `kit_discount`, `kit_discount_type`, `price_option`, `print_option`, `description`, `item_kit_qty[item_id]`, `item_kit_seq[item_id]` | `item_kits` | JSON `{success, message, id}` | insert/update `item_kits`, then `Item_kit_items::save_value` (delete-all + insert). No transaction spanning kit row and components. |
| 7 | `postDelete` (`Item_kits.php:229-241`) | `/item_kits/delete` | POST | `ids[]` | `item_kits` | JSON `{success, message}` | `Item_kit::delete_list` hard-deletes kit rows only; **does not delete `item_kit_items` rows** (no FK cascade declared in the upstream schema). |
| 8 | `postCheckItemNumber` (`Item_kits.php:249-253`) | `/item_kits/checkItemNumber` | POST | `item_kit_number`, `item_kit_id` | `item_kits` | JSON string `"true"`/`"false"` | none. |
| 9 | `getGenerateBarcodes` (`Item_kits.php:262-294`) | `/item_kits/generateBarcodes/{itemKitIds}` | GET | colon-delimited kit ids | `item_kits` | HTML `barcodes/barcode_sheet` | none; forces `C128` when configured type is neither `C39` nor `C128` (287-289). |

`_add_totals_to_item_kit` is private (`Item_kits.php:31-60`) and is the only pricing logic for kits (§7.3).

### 1.4 Target route / action map (as implemented)

Pages (`src/app/(secure)/...`), all server components; permission enforced with `requirePermission(...)`
(`src/lib/auth/with-permission.ts:6-19`, redirects to `/login` or `/no_access/...`):

| Target route | File | Permission | Data loaded |
|---|---|---|---|
| `/items` | `src/app/(secure)/items/page.tsx:9-90` | `items` (line 14) | `searchItems` with query-string filters (17-29), `getStockLocations`, `getDefinitionsByFlags(1)`, `getConfigBool("use_destination_based_tax")`. |
| `/items/new` | `src/app/(secure)/items/new/page.tsx:9-38` | `items` | all locations, suppliers, all non-deleted attribute definitions, tax categories only when destination tax is on. |
| `/items/[id]` | `src/app/(secure)/items/[id]/page.tsx:11-48` | `items` | item, taxes, quantities per location, attribute values, locations, suppliers, tax categories, all non-deleted definitions. `notFound()` if missing (line 16). |
| `/items/[id]/inventory` | `src/app/(secure)/items/[id]/inventory/page.tsx:6-50` | `items` | item, locations, quantities, last 50 ledger rows; renders `InventoryForm` and a read-only history table. |
| `/items/csv-import` | `src/app/(secure)/items/csv-import/page.tsx` | `items` | client `CsvImportForm`. |
| `/items/generate-barcodes` | `src/app/(secure)/items/generate-barcodes/page.tsx:25-101` | `items` (line 27) | `searchItems({searchText:"", limit:200})` then in-memory filter by `?ids=` (29-32); renders SVG previews and a PDF link. |
| `/item_kits` | `src/app/(secure)/item_kits/page.tsx:8-24` | `item_kits` | `select().from(itemKits).all()` (line 10) — no search, sort, paging, or totals. |
| `/item_kits/new/[id]` | `src/app/(secure)/item_kits/new/[id]/page.tsx:9-27` | `item_kits` | kit row (id > 0 only) and joined component rows. |

Server actions:

| Action | File:line | Permission | Notes |
|---|---|---|---|
| `saveItemAction(formData)` | `src/app/(secure)/items/actions.ts:68-122` | session presence only (`auth()` + `redirect("/login")`, lines 69-71) — **no module grant** | uploads picture first (77), parses Zod schema (91), duplicate-number check (96-98), `saveItem` (99-110), then attribute upserts (112-118), redirect `/items/{id}` (121). |
| `deleteItemAction(itemId)` | `actions.ts:124-130` | session only | unused by any component (verified by repo-wide grep). |
| `adjustInventoryAction(itemId, locationId, newQuantity)` | `actions.ts:132-137` | session only | `adjustInventory` then revalidate. |
| `bulkUpdateAction(itemIds, fields)` | `actions.ts:139-144` | session only | field type limited to `{category, supplierId, costPrice, unitPrice}`; no UI calls it. |
| `searchItemsAction`, `getItemRowAction`, `getItemByNumberOrIdAction`, `getItemInfoAction`, `getInventoryAction`, `suggest*Action`, `checkItemNumberAction`, `changeItemNumber/Name/DescriptionAction`, `undeleteItemAction`, `getAttributesAction`, `saveAttributesAction`, `generateBarcodesAction`, `getStockLocationsAction`, `getTaxCategoriesAction` | `actions.ts:146-275` | session only | several are unused by components; `undeleteItemAction` (233-238) has no UI. |
| `getItemTotalRowsAction()` | `actions.ts:277-279` | **none** (no `auth()`) | returns `getAllItems().length`, capped at the default 100. |
| item-kit actions | `src/app/(secure)/item_kits/actions.ts:10-77` | `item_kits` (`requirePermission`) | `saveItemKitAction` (10-51), `deleteItemKitAction` (53-62), `listItemsForSelectAction` (64-71), `searchItemKitsAction`, `getItemKitRowAction`, `getItemKitTotalRowsAction` (72-76). |

API routes (Next route handlers):

| Route | File | Permission | Notes |
|---|---|---|---|
| `POST /api/items/csv-import` | `src/app/api/items/csv-import/route.ts:8-188` | any authenticated session (line 10) — no `items` grant | see §9.6. |
| `GET /api/items/csv-template` | `src/app/api/items/csv-template/route.ts:6-29` | any authenticated session (line 8) | BOM + quoted headers; filename `items_template.csv` (line 26). |
| `GET /api/items/pic-thumb/[file]` | `src/app/api/items/pic-thumb/[file]/route.ts:7-27` | any authenticated session (line 9) | path-traversal guard at 12-16. |
| `GET /api/items/barcodes-pdf` | `src/app/api/items/barcodes-pdf/route.ts:5-26` | any authenticated session (line 7) | no `items` grant; renders PDF. |
| `GET /api/items/suggest` | `src/app/api/items/suggest/route.ts:4-13` | session | stock-only suggestions, GET `term`, `limit`. |
| `GET /api/items/kits-suggest` | `.../kits-suggest/route.ts:4-13` | session | items with `item_type = ITEM_KIT`. |
| `GET /api/items/low-sell-suggest` | `.../low-sell-suggest/route.ts:4-13` | session | low-sell suggestions. |
| `GET /api/items/category-suggest` | `.../category-suggest/route.ts:4-10` | session | category labels. |
| `GET /api/items/location-suggest` | `.../location-suggest/route.ts:4-10` | session | returns categories (see §9.1). |

`/items/[id]/count-details`, `/items/bulk-edit`, and `/items/[id]/delete` do not exist in the target.

---

## 2. `Item` model — exact semantics

### 2.1 Table surface, constants, allowed fields

`app/Models/Item.php:44-69`: table `items`, primary key `item_id`, auto-increment, no soft-delete support.
`$allowedFields` (48-69) lists `name, category, supplier_id, item_number, description, cost_price, unit_price,
reorder_level, allow_alt_description, is_serialized, deleted, stock_type, item_type, tax_category_id,
receiving_quantity, pic_filename, qty_per_pack, pack_name, low_sell_item_id, hsn_code`. Only the CI4 model
helpers honour this list; the model's own methods use the query builder, which bypasses it, so the list is
advisory except where a caller uses `insert()/update()` through the model API (none of the item paths do).

Public constants:

- `Item::ALLOWED_SUGGESTIONS_COLUMNS = ['name','item_number','description','cost_price','unit_price']` (`Item.php:22`).
- `Item::ALLOWED_SUGGESTIONS_COLUMNS_WITH_EMPTY = ['', ...same]` (`Item.php:23`).
- `Item::CLEAR_SUPPLIER_OPTION = 'NONE'` (`Item.php:30`) — non-numeric sentinel used by bulk edit to clear `supplier_id`.
- `Item::ALLOWED_BULK_EDIT_FIELDS = ['name','category','supplier_id','cost_price','unit_price','reorder_level','description','allow_alt_description','is_serialized']` (`Item.php:32-42`).

Relevant global constants (`app/Config/Constants.php`): `NEW_ENTRY = -1` (87), `HAS_STOCK = 0` / `HAS_NO_STOCK = 1`
(110-111), `ITEM = 0`, `ITEM_KIT = 1`, `ITEM_AMOUNT_ENTRY = 2`, `ITEM_TEMP = 3` (113-116), `NEW_ITEM = -1` (117),
`PRINT_ALL = 0`, `PRINT_PRICED = 1`, `PRINT_KIT = 2` (119-121), `PRICE_ALL = 0`, `PRICE_KIT = 1`,
`PRICE_KIT_ITEMS = 2` (126-128), `PRICE_OPTION_ALL = 0`, `PRICE_OPTION_KIT = 1`, `PRICE_OPTION_KIT_STOCK = 2`
(130-132), `NAME_SEPARATOR = ' | '` (134), `PERCENT = 0` / `FIXED = 1` (149-150), attribute constants
`GROUP/DROPDOWN/DECIMAL/DATE/TEXT/CHECKBOX` (97-102), `CATEGORY_DEFINITION_ID = -1` (104), `MAX_PRECISION = 1e14`
(171), `DEFAULT_PRECISION = 2` (172).

### 2.2 Identity resolution: `exists`, `item_number_exists`, `get_item_id`, `get_info_by_id_or_number`

**`exists(string $item_id, bool $ignore_deleted = false, bool $deleted = false): bool`** (`Item.php:74-87`)

- Matches `items.item_id = $item_id OR items.item_number = $item_id` (two independent `where`/`orWhere` inside `groupStart/groupEnd`, so the OR is parenthesised).
- When `$ignore_deleted` is false, adds `items.deleted = $deleted` (default 0 → only active rows count).
- Returns `getNumRows() >= 1`.
- Consequence: `exists(5)` is true if item 5 exists **or** any active item has barcode `'5'`.

**`item_number_exists(string $item_number, string $item_id = ''): bool`** (`Item.php:92-111`)

- Returns `false` immediately when config `allow_duplicate_barcodes` is truthy (96-98).
- Query: `item_number = $item_number AND deleted != 1 AND item_id != intval($item_id)` (100-103).
- Then, if `ctype_digit($item_id) && !str_starts_with($item_id, '0')`, it adds `item_id != intval($item_id)` a **second time** (107-109). The first exclusion is unconditional, so passing a non-numeric `$item_id` (e.g. when editing an item whose form posts a barcode string) still excludes `intval($nonNumeric) === 0`; passing a zero-prefixed barcode such as `00012345` does **not** exclude item 123 even though `intval` is 123.
- The leading-zero exception exists because a zero-prefixed barcode is a barcode, not an id (comment 105-106).
- Note the controller inverts this: `postCheckItemNumber` returns JSON `'true'` when the number is free (`!$exists`, `Items.php:976`) and the jQuery `remote` rule treats `"true"` as valid (`app/Views/items/form.php:549-559`).

**`get_item_id(string $item_number, bool $ignore_deleted = false, bool $deleted = false): bool|int`** (`Item.php:674-693`)

- Query: `item_number = $item_number OR item_id = $item_number` (unparenthesised `groupStart/groupEnd`), plus `items.deleted = $deleted` unless `ignore_deleted`.
- Returns the id only when **exactly one** row matches (`getNumRows() == 1`, line 688); returns `false` for 0 or
  >1 matches. This is the ambiguity guard: if barcode `42` exists on item 7 while item 42 exists, both match and
the call fails. Callers must not rely on `get_item_id` for barcode lookup.

**`get_info_by_id_or_number(string $item_id, bool $include_deleted = true): stdClass|string`** (`Item.php:640-669`)

- `item_number = $item_id` OR (`ctype_digit((string)$item_id) && !str_starts_with($item_id,'0')` → `item_id = $item_id`).
- Adds `deleted = 0` when `$include_deleted` is false.
- `limit(1)` deliberately: a barcode/id clash yields whichever row the DB returns first (comment 658-659).
- Returns `''` (empty string) when nothing matches — not `null` and not an object. Callers test `empty(...)`.
- Default `include_deleted = true`, which is why sale lines can refer to deleted items.

### 2.3 `search()` — full search contract

Signature: `search(string $search, array $filters, ?int $rows = 0, ?int $limitFrom = 0, ?string $sort = 'items.name',
?string $order = 'asc', ?bool $countOnly = false)` (`Item.php:314`).

Filter keys consumed (all read directly; missing keys raise warnings):

| Key | Type | Effect |
|---|---|---|
| `start_date`, `end_date` | string | When both non-empty, restricts `inventory.trans_date` between them (335-348). If config `date_or_time_format` is empty, dates are `rawurldecode`d and compared as `DATE_FORMAT(trans_date,"%Y-%m-%d")`; otherwise compared raw. |
| `stock_location_id` | int | `> -1` adds an **inner join** to `item_quantities` and `where location_id = ...` (377-380). `-1` means "all locations". |
| `empty_upc` | bool | `where item_number IS NULL` (425-427). Empty string is **not** included. |
| `low_inventory` | bool | Only when `stock_location_id > -1`: `item_quantities.quantity <= items.reorder_level` (428-430). |
| `is_serialized` | bool | `is_serialized = 1` (431-433). |
| `no_description` | bool | `items.description = ''` (434-436) — NULL is not included. |
| `is_deleted` | bool | `items.deleted = $filters['is_deleted']` (423) — one value or the other, never both. |
| `temporary` | bool | true → `items.item_type = ITEM_TEMP`; false → `item_type IN (ITEM, ITEM_KIT, ITEM_AMOUNT_ENTRY)` (437-442). Kits therefore appear in the item list; temp items are hidden unless requested. |
| `search_custom` | bool | Enables attribute search when `definition_ids` is non-empty and `$search` non-empty (350-352). |
| `definition_ids` | int[] | Attribute definitions allowed in the query; also enables the `GROUP_CONCAT` attribute columns (350-352, 538-547). |

Free-text columns (403-421, non-custom branch): `name`, `item_number`, `items.item_id`, `company_name`
(suppliers), `items.category`. **`description` is NOT searched** in the item list. All use CI4 `LIKE '%term%'`.

Custom attribute search (354-401, 538-547):

- `$customAttributeSearch = $attributesEnabled && $filters['search_custom'] && $search !== ''`.
- `parseAttributeSearch` (`Item.php:151-179`) parses `name: value`, `name:value`, `name:v1,v2` and optional `AND`/`OR` separators with regex `/([[:alpha:]][[:alnum:] _-]*?)\s*:\s*([0-9]+,[0-9]+|[^\s,]+)(?:\s*,\s*|\s+(?:AND|OR)\s+)?/iu` (line 162), returning `['terms'=>[remaining text], 'attributes'=>[lowercased name => values[]]]`.
- `applyNamedAttributeSearch` (`Item.php:193-262`) resolves names case-insensitively against `getDefinitionsByFlags(SHOW_IN_ITEMS|SHOW_IN_SEARCH, true)`, only for definitions in the allowed id list, and adds one `attribute_links` join + one `attribute_values` join per consumed name with alias `named_attr_links_<i>` / `named_attr_values_<i>`. Value comparison depends on definition type: `DECIMAL` → `attribute_decimal = parse_decimals(value)`; `DATE` → `attribute_date = DateTime::createFromFormat(config.dateformat, value)->format('Y-m-d')`; otherwise → `attribute_value = value`. If no value in a group parses, the builder adds `1 = 0`.
- Unconsumed attribute names/values are appended to the free text (390-401), so unknown `foo:bar` degrades to a free-text search rather than returning everything.
- In custom mode the free text is matched against `attribute_values.attribute_value`, `DATE_FORMAT(attribute_date, ...)` and `attribute_decimal` only (403-411) — not item name/number.
- `SET SESSION group_concat_max_len=49152` is issued whenever attributes are enabled (358-360).

Sorting (452-466, 553-560):

- `$sort` is whatever `sanitizeSortColumn` allowed from `itemSortColumns()`: all `item_headers()` keys plus one numeric entry per visible attribute id plus `'quantity'` (`app/Helpers/tabular_helper.php:410-424, 389-401`).
- `sort === 'quantity' && stock_location_id <= -1` → left join a derived table summing quantities per item and `ORDER BY MAX(total_quantity)` (454-461). With a location filter, `quantity` sorts by the joined quantity column.
- A numeric `$sort` is treated as an attribute definition id: `applyAttributeSort` (`Item.php:288-306`) left-joins that definition's link/value rows and orders by `MAX(attribute_value|attribute_decimal|attribute_date)` per type.
- Otherwise plain `orderBy($sort, $order)`.

Execution shape (308-563): Phase A resolves the matching `item_id`s with `GROUP BY items.item_id`
(444-445; this de-duplicates rows produced by the inventory join and by date-range reporting), applies
`countAllResults()` for `countOnly` (448-450), then Phase B re-queries `items` restricted to
`whereIn('items.item_id', $itemIds)` with `MAX(...)` aggregates over the second `suppliers`/`inventory`/`item_quantities`
joins, re-applies ordering, and returns the result (`478-562`). If Phase A yields no ids it returns an empty
`items` result (`474-476`).

Important consequences to preserve:

- The **inner join to `inventory`** (375, 522) means an item with no ledger rows can never appear in the item list.
- Phase B aggregates every column with `MAX()`, so multi-row joins cannot multiply values.
- `get_found_rows($search, $filters)` is just `search(..., countOnly: true)` (`Item.php:139-142`).

### 2.4 Suggestion family

**`get_search_suggestion_format(?string $seed)`** (`Item.php:890-908`): appends the configured
`suggestions_first_column` (fallback `name`), then `suggestions_second_column` and `suggestions_third_column` if
non-empty and each is in `ALLOWED_SUGGESTIONS_COLUMNS`. Config defaults: `suggestions_first_column = 'name'`,
second/third `''` (`app/Database/Migrations/sqlscripts/3.1.1_to_3.2.0.sql:81-84`).

**`get_search_suggestion_label(object $row)`** (`Item.php:914-949`): formats `cost_price`/`unit_price` with
`to_currency_no_money` (`format_result_numbers`, 968-976); with `multi_pack_enabled` appends `pack_name` to the
`name` field using `NAME_SEPARATOR` (931-936, `append_label` 984-1001); otherwise joins the configured columns with
`NAME_SEPARATOR` (936-946).

**`get_search_suggestions(string $search, array $filters = ['is_deleted'=>false,'search_custom'=>false], bool $unique = false, int $limit = 25)`**
(`Item.php:1010-1104`):

1. name `LIKE`, `item_type IN (ITEM, ITEM_AMOUNT_ENTRY)` (kits excluded), `deleted = filters.is_deleted`, order name asc → `{value: item_id, label}` (1015-1024).
2. item_number `LIKE`, same filters, order item_number asc (1026-1035).
3. If `!$unique`: distinct category `LIKE` → `{label: category}` (1039-1048); distinct supplier `company_name` `LIKE` with `deleted = filters.is_deleted` → `{label: company_name}` (1050-1063); description `LIKE` with `get_search_suggestion_format('item_id, name, pack_name, description')` (1066-1080); when `search_custom` is not `false`, attribute values where `definition_type = TEXT` (1083-1095).
4. Truncates to `$limit` and returns `array_unique($suggestions, SORT_REGULAR)` (1099-1103). The `array_walk` de-dup for description entries (1075-1079) is ineffective (`array_walk` returns bool, not the callback result), so duplicates can survive until `array_unique`.

**`get_stock_search_suggestions`** (`Item.php:1114-1212`): same as above with `stock_type = '0'` (HAS_STOCK) added to
every query, and the category search also constrained to non-kit + stocked types. Used by the receiving item picker.
Note line 1197 adds `stock_type` to the `attribute_links` join query, where that column does not exist — the
attribute branch of stock suggestions is broken upstream.

**`get_kit_search_suggestions`** (`Item.php:1221-1315`): queries `items` with `item_type = ITEM_KIT`; labels are
`name` (name search), `item_number` (number search), category, supplier, and description (label = name).
`$non_kit` at line 1224 is declared and unused.

**`get_low_sell_suggestions(string $search)`** (`Item.php:1321-1337`): `deleted = '0'`, `stock_type = '0'`,
`name LIKE`, order name asc, label via `get_search_suggestion_format('item_id, pack_name')`. No limit.
Used by the multi-pack "low sell item" autocomplete (`app/Views/items/form.php:492-500`).

**`get_category_suggestions`** (`Item.php:1343-1359`): distinct non-deleted category `LIKE`, labels only.

**`get_location_suggestions`** (`Item.php:1365-1380`): selects `location` from `items` — nonexistent column
(see §1.2 row 9).

**`get_categories`** (`Item.php:1385-1394`): distinct categories, never called (comment says so).

### 2.5 Read helpers

**`getInfo(int $item_id): object`** (`Item.php:592-611`): selects `items.*` plus three `GROUP_CONCAT` columns
`attribute_values`, `attribute_dvalues`, `attribute_dtvalues` (596-598), left-joins `attribute_links` and
`attribute_values`, groups by `items.item_id`. Two defects that downstream code tolerates but a port must decide on:

- The joins do **not** filter `sale_id IS NULL AND receiving_id IS NULL`, so attribute values attached to sales or receivings can bleed into the item form's concatenated strings; and there is no `DISTINCT`.
- When no row matches, `getEmptyObject('items')` (`618-635`) builds a `stdClass` from `db->getFieldData('items')`: integer/tinyint/decimal fields become `0`, except a primary key which becomes `NEW_ENTRY` (-1); all other types become `null`. So a missing item is an object with `item_id = -1` and zeroed numerics — the item form relies on this (`app/Controllers/Items.php:380-422`).

**`getMultipleInfo(array $itemIds, ?int $locationId): ResultInterface`** (`Item.php:698-725`):

- If `$locationId === null` → returns an intentionally empty result (`where item_id = -1`, lines 700-702). This is asserted by `tests/Models/ItemTest.php:79-87`.
- Otherwise joins `suppliers` (left), `item_quantities` (left, filtered by `location_id`), `attribute_links` (left, sale/receiving null), `attribute_values` (left); selects `items.*`, `MAX(company_name)`, three `GROUP_CONCAT` attribute columns with `DISTINCT`, and `MAX(quantity) AS quantity`; `whereIn(item_id)`, `GROUP BY item_id` (704-724).
- Because the `item_quantities` join is an inner-filtered relation (`where location_id = X` on a left join), items without a quantity row at that location are still returned (left join) but with `quantity = NULL`. `MAX()` over a single row is that row's value.
- Used by `getRow`, `getGenerateBarcodes`, and the barcode sheet (`Items.php:341, 566`).

**`get_all(int $stock_location_id = NEW_ENTRY, int $rows = 0, int $limit_from = 0)`** (`Item.php:568-587`): joins
`item_quantities` when `stock_location_id > -1`, filters `items.deleted = 0`, orders by `items.name` ascending,
optional limit/offset. **No `item_type` filter**, so temp items are included. Callers: none in the items UI; used
by sales/receiving controllers.

**`get_total_rows()`** (`Item.php:116-122`): `countAllResults()` over `items.deleted = 0` (all item types).

**`get_tax_category_usage(int $tax_category_id)`** (`Item.php:128-134`): counts items referencing a tax category;
documented as never called.

### 2.6 `save_value(array &$item_data, int $item_id = NEW_ENTRY): bool` — insert/update

`Item.php:730-755`. The reference parameter is important: callers read back the generated keys.

Algorithm:

1. `if ($item_id < 1 || !$this->exists($item_id, true))` → INSERT path (734).
2. Insert `$item_data` verbatim (query builder; every key present becomes a column; unknown keys are a DB error). On success:
   - `$item_data['item_id'] = (int) $this->db->insertID()` (736).
   - If the requested `$item_id < 1` (new record), immediately `UPDATE items SET low_sell_item_id = <new id> WHERE item_id = <new id>` (737-741). This is the self-reference invariant for multi-pack: a normal item is its own low-sell item.
   - Returns true.
3. Else (existing id): `$item_data['item_id'] = $item_id` (748) and `UPDATE items SET ... WHERE item_id = $item_id` (751-754).

Consequences / edge cases:

- Passing an id that exists but is **deleted** still updates (the `exists(..., ignore_deleted: true)`).
- Passing a positive id that does not exist takes the **insert** path with the supplied `item_id` still present in the array (the caller set it); the insert therefore attempts an explicit primary key. With MySQL that inserts at that id; with `NO_AUTO_VALUE_ON_ZERO` it is not treated as auto-increment. The CSV importer relies on this only after validating existence (`Items.php:1337-1344`), so the behaviour is effectively untested upstream.
- `low_sell_item_id` is only auto-set on the insert path. An update never re-derives it; the caller must post it.
- `save_value` does not touch taxes, quantities, attributes, or the image; `Items::postSave` orchestrates those.
- `Items::postSave` never includes `low_sell_item_id` when the multi-pack picker is absent; it posts the hidden field with the current item id (new: `-1`), so the insert stores `-1` briefly and then the self-update fixes it (`Items.php:810`; `app/Views/items/form.php:430-434`).

`Items::postSave` column construction (`Items.php:794-831`):

| Column | Source | Coercion |
|---|---|---|
| `name` | POST `name` | raw string, no sanitisation |
| `description` | POST `description`, `FILTER_SANITIZE_FULL_SPECIAL_CHARS` | HTML-escaped |
| `category` | POST `category` | raw |
| `item_type` | POST `item_type`, default `ITEM` when absent | `intval` |
| `stock_type` | POST `stock_type`, default `HAS_STOCK` | `intval` |
| `supplier_id` | POST `supplier_id` | empty → null, else `intval` |
| `item_number` | POST `item_number` | empty → **null** (empty barcode normalised to NULL) |
| `cost_price` | POST | `parse_decimals` (locale parser) |
| `unit_price` | POST | `parse_decimals` |
| `reorder_level` | POST | `parse_quantity` (quantity-decimals locale parser) |
| `receiving_quantity` | POST | `parse_quantity`; forced to `1` when it parses to `0.0` and type is not `ITEM_TEMP` (777-784) |
| `allow_alt_description` | POST presence | `!= null` → bool |
| `is_serialized` | POST presence | `!= null` → bool |
| `qty_per_pack` | POST `qty_per_pack` | absent → 1, else `parse_quantity` (808) |
| `pack_name` | POST `pack_name` | absent → `lang('Items.default_pack_name')` (809) |
| `low_sell_item_id` | POST hidden | absent → `$itemId` (=-1 for new), else `intval` (810) |
| `deleted` | POST `is_deleted` presence | bool (811) |
| `hsn_code` | POST `hsn_code` | absent → `''`, else raw (812) |

Then, if `item_type == ITEM_TEMP`, the code overrides `stock_type = HAS_NO_STOCK`, `receiving_quantity = 0`,
`reorder_level = 0` (815-819).

`tax_category_id` handling (821-827): if the POST key is **not set at all**, the column is written as `null`;
otherwise empty → null, else `intval`. The form always posts a hidden `tax_category_id`
(`app/Views/items/form.php:279`) only in destination-tax mode; in legacy-tax mode the key is absent and every save
nulls it.

`pic_filename` is written only when a new upload succeeded (`Items.php:829-831`); otherwise the column is untouched,
which is why editing without re-uploading keeps the old image.

Tax rows in `postSave` (848-867): only when `use_destination_based_tax` is false. `tax_names[]` and
`tax_percents[]` are paired **by position** via `$taxNameIndex`; a row is saved only if the name is non-empty after
trim and `is_numeric(parse_tax($percent))`. `parse_tax` returns the raw input when `empty($number)` (PHP `empty`
treats `'0'` as empty, so percent `'0'` survives as the string `'0'` and is numeric). Negative percents are blocked
earlier by validation (§2.8 validation rules). `Item_taxes::save_value` deletes all existing rows first
(`app/Models/Item_taxes.php:56-70`), so saving with both names empty **removes** all taxes for the item.

### 2.7 Delete / undelete

**`delete($item_id = null, bool $purge = false)`** (`Item.php:828-846`) — ignores `$purge`:

1. `transStart`.
2. `Item_quantity::reset_quantity($item_id)` → `UPDATE item_quantities SET quantity = 0 WHERE item_id = ...` (833-834; `app/Models/Item_quantity.php:109-115`).
3. `UPDATE items SET deleted = 1 WHERE item_id = ...` (836-838).
4. `Inventory::reset_quantity($item_id)` (840-841) — see §3.4 for its first-location-only defect.
5. `transComplete`, returns `transStatus()`.

**`undelete(int $item_id)`** (`Item.php:851-857`): `UPDATE items SET deleted = 0`. It does **not** restore
quantities (they were zeroed) nor the ledger.

**`delete_list(array $item_ids)`** (`Item.php:862-884`): same as `delete` but in bulk: `reset_quantity_list`
(`UPDATE item_quantities SET quantity = 0 WHERE item_id IN (...)`), `UPDATE items SET deleted = 1 WHERE item_id IN (...)`,
then `Inventory::reset_quantity` per id.

### 2.8 Bulk edit

**`filterBulkEditFields(array $input): array`** (`Item.php:766-805`):

- Iterates only `ALLOWED_BULK_EDIT_FIELDS`; anything else is dropped (injection defence).
- A field that is absent, `null`, `''`, or non-scalar is skipped → "leave column alone".
- `supplier_id`: sentinel `CLEAR_SUPPLIER_OPTION` (`'NONE'`) → `null`; otherwise accepted only when `ctype_digit((string)$value)` → `int`. Non-numeric suppliers are dropped (not saved, not cleared).
- `cost_price`/`unit_price` → `parse_decimals`; `reorder_level` → `parse_quantity`.
- `allow_alt_description`/`is_serialized` → only `'0'`/`'1'` accepted.
- If the parsed value is `false` (locale parse failure), the field is skipped (797-799).
- Zero values are kept (`'0'` is not `''`); this is asserted by `tests/Models/ItemBulkUpdateTest.php:323-328`.

**`updateMultiple(array $itemData, string $itemIds): bool`** (`Item.php:810-823`):

- Re-applies the whitelist with `array_intersect_key` because the query builder bypasses `$allowedFields` (812-813).
- Returns `false` if the resulting set is empty (815-817).
- `whereIn('item_id', explode(':', $itemIds))` then a single `UPDATE` (819-822). One statement for all ids. A `false` return does not necessarily mean "no rows updated"; `update()` returns false on SQL error.

Controller (`Items.php:1053-1086`): validation first; `$itemsToUpdate = getPost('item_ids')` is the colon string from
the JS (`app/Views/items/form_bulk.php:193-197`). If the filtered item data is empty **or** the update succeeds, it
proceeds to taxes:

```php
foreach ($taxPercents as $tax_percent) {
    if (!empty($taxNames[$tax_percent]) && is_numeric($taxPercents[$tax_percent])) {
        $taxUpdated = true;
        $itemsTaxesData[] = ['name' => $taxNames[$tax_percent], 'percent' => $taxPercents[$tax_percent]];
    }
}
```

`Items.php:1071-1076`. `$tax_percent` is the **value** of each percent (e.g. `'5'`), not its index, so it is used as
an array key into `tax_names`/`tax_percents`, whose keys are `0`/`1`. Unless a percent happens to equal `0` or `1`,
`$taxNames[$tax_percent]` is undefined and `$taxUpdated` stays false: **bulk tax editing is a silent no-op** while
the response still reports success. The upstream tests only assert the response
(`tests/Controllers/ItemsControllerTest.php:160-194`) and therefore do not catch it. `Item_taxes::save_multiple`
would otherwise delete and re-insert taxes per item id in a transaction (`app/Models/Item_taxes.php:75-98`).

Validation for both save and bulk (`Items.php:688-733`, `735-759`):

- `item_number` (only when non-empty): rule `alpha_numeric_punct`, message `Items.item_number_invalid`.
- `tax_names.*`: `permit_empty|max_length[255]|unicode_alpha_numeric_punct` → rejects `<`, `>` (stored-XSS vector) but accepts accents/apostrophes (`tests/Controllers/ItemsControllerTest.php:109-158`).
- `tax_percents.*`: `permit_empty|nonNegativeDecimal` → rejects negatives, accepts `0` (`tests/Controllers/ItemsControllerTest.php:196-255`). The rule name `nonNegativeDecimal` is a custom rule loaded by the app.
- Bulk uses `NEW_ENTRY` as the id for error payloads.

### 2.9 `change_cost_price` — weighted average

`Item.php:1408-1428`:

```php
if ($old_price === null) { $old_price = $this->getInfo($item_id)->cost_price; }
$old_total_quantity = SUM(item_quantities.quantity)
                      JOIN stock_locations ON stock_locations.location_id = item_quantities.location_id
                      WHERE item_id = ? AND stock_locations.deleted = 0;
$total_quantity = $old_total_quantity + $items_received;
$average_price = bcdiv(bcadd(bcmul($items_received, $new_price), bcmul($old_total_quantity, $old_price)),
                       $total_quantity);
return $this->save_value(['cost_price' => $average_price], $item_id);
```

Exact semantics:

- Quantity base is the **sum over active stock locations only** (`stock_locations.deleted = 0`, line 1419), not over all quantity rows.
- Scale: `bcscale()` is set globally to `max(2, totals_decimals() + tax_decimals())` at config load (`app/Events/Load_config.php:44`). With defaults (`currency_decimals = 2`, `tax_decimals = 2`) that is **4**. All three bc operations therefore truncate (not round) at 4 decimals: `bcmul` truncates each product to 4 dp, `bcadd` sums, `bcdiv` truncates the quotient to 4 dp. The target's rounding is a behavioural difference (§9.1).
- Timing is load-bearing and documented at `Item.php:1401-1405` ("must be used before item_quantities gets updated, otherwise the average price is wrong"). `Receiving::save_value` respects it: `change_cost_price` at `app/Models/Receiving.php:158`, quantity write at `162-171`.
- Gate: only called when `cost_price != line price` **and** config `receiving_calculate_average_price` is truthy (`Receiving.php:157`). The per-line received quantity is `receiving_quantity != 0 ? quantity * receiving_quantity : quantity` (`Receiving.php:154`).
- No divisibility guard upstream: `total_quantity` can be 0 (e.g. receiving 0 with no stock), which makes `bcdiv` raise a division-by-zero warning/exception depending on PHP version. Target adds guards (§9.1).
- The result is written through `save_value`, i.e. an `UPDATE items SET cost_price = ...`.

### 2.10 Other mutators and helpers

- `update_item_number(int $item_id, string $item_number)` (`Item.php:1435-1440`), `update_item_name` (1447-1452), `update_item_description` (1459-1464): direct single-column updates, `void` return. Used by the sales register when editing a temp item's description.
- `get_item_name(?string $as_name = null)` (`Item.php:1471-1488`): returns SQL expression `concat(items.name, ' | ', items.pack_name)` when `multi_pack_enabled`, else `items.name`, optionally `AS <alias>`. Used by sale/receiving queries. Note the separator is `NAME_SEPARATOR` interpolated into SQL, not escaped.
- `getEmptyObject` (`Item.php:618-635`) is also the "missing item" object factory for `getInfo`.

### 2.11 Item-type, stock-type, amount-entry, temp, serialized, multi-pack, HSN, reorder, low-sell

- **Item types** (`ITEM=0`, `ITEM_KIT=1`, `ITEM_AMOUNT_ENTRY=2`, `ITEM_TEMP=3`). The item form exposes: standard (always), kit (disabled when the employee lacks `item_kits`), amount-entry (only when `derive_sale_quantity == '1'`), temp (only when `$allow_temp_item == 1`) (`app/Views/items/form.php:112-168`). `allow_temp_item` comes from session `allow_temp_items`, set to `0` by `Items::getIndex` (`Items.php:77`) and to `1` by `Sales::getIndex` (`app/Controllers/Sales.php:71`). The computed value is then inverted by `Items.php:382`: a new item, or an existing non-temp item, always gets `1`; only an existing temp item opened from a non-sales context gets `0`. In practice the temp radio is shown on the item form for new items.
- **Stock types** (`HAS_STOCK=0`, `HAS_NO_STOCK=1`). Item form radios at `form.php:88-110`. Temp items are forced to `HAS_NO_STOCK` at save (`Items.php:815-819`). Sale completion only decrements quantity when `stock_type == HAS_STOCK` (`app/Models/Sale.php:650`); receiving always increments.
- **Amount entry** (`ITEM_AMOUNT_ENTRY`): the sales register lets the cashier type a `discounted_total` for such a line instead of a computed total (`app/Views/sales/register.php:224-231`). The item record itself is created like a standard item; `derive_sale_quantity` only controls whether the type is offered (`Items.php:419`, `form.php:145-155`). Amount-entry items are excluded from kit suggestions and are included in the normal item-type filter (`Item.php:440, 1013, 1117`).
- **Temp items** (`ITEM_TEMP`): stock, receiving quantity and reorder level are zeroed at save (`Items.php:815-819`); quantities are forced to 0 on save (874-876). In the cart, deleting a temp line calls `Item::delete()` on the item (`app/Libraries/Sale_lib.php:1300-1311`), and `remove_temp_items()` cleans up temp lines when the register is reset (272-281). Temp items are excluded from the item list unless the `temporary` filter is set (`Item.php:437-442`).
- **Serialized** (`is_serialized`): stored 0/1; in the cart, serialized lines never merge into an existing line and the quantity field becomes read-only (`Sale_lib.php:1115, 1152`; `register.php:205-212`). Item form checkbox at `form.php:388-398`.
- **Multi-pack** (`multi_pack_enabled`): item form shows `qty_per_pack`, `pack_name`, `low_sell_item_name` autocomplete + hidden `low_sell_item_id` (`form.php:400-437`). `low_sell_item_id` self-references on insert (§2.6). Suggestion labels and the list name append `pack_name` with `' | '` (`Item.php:931-936`; `app/Helpers/tabular_helper.php:485-487`). Sales append it too (`Sale_lib.php:1145-1147`).
- **HSN** (`include_hsn == '1'`): item form renders `hsn_code` (`form.php:285-299`); controller defaults the column to `''` when the field is absent (`Items.php:812`). The string is carried into sale lines (`Sale_lib.php:1184`).
- **Reorder level**: stored via `parse_quantity`; used only by the `low_inventory` filter and the sales out-of-stock warning (`Sale_lib.php:1207-1216`).
- **Low-sell calculation**: the only "low sell" logic is the autocomplete endpoint and the stored `low_sell_item_id` self-reference. No computed low-sell price exists in the item model; the sales side (`Sale_lib`/`Sale`) is where packs are converted. `get_low_sell_suggestions` restricts to `stock_type = 0` and non-deleted.

---

## 3. Inventory and quantities

### 3.1 `item_quantities` — composite key per location

Upstream DDL (`app/Database/Migrations/sqlscripts/initial_schema.sql:282-289`):

```sql
CREATE TABLE IF NOT EXISTS `ospos_item_quantities` (
  `item_id` int(11) NOT NULL,
  `location_id` int(11) NOT NULL,
  `quantity` decimal(15,3) NOT NULL DEFAULT '0',
  PRIMARY KEY (`item_id`,`location_id`),
  KEY `item_id`, KEY `location_id`
)
```

`Item_quantity` model (`app/Models/Item_quantity.php`):

- `exists(int $item_id, int $location_id)` → row count `== 1` (31-38).
- `save_value(array $location_detail, int $item_id, int $location_id)` → `INSERT` when the pair does not exist, `UPDATE` otherwise (46-58). The update writes **all keys present in `$location_detail`**, normally `item_id`, `location_id`, `quantity`; callers pass all three.
- `get_item_quantity(int $item_id, int $location_id)` (65-85): returns the row object; when absent it returns a model-shaped object with `quantity = 0` and every other field `''` (not a plain 0). Callers therefore write `->quantity` and get `0` safely, but `$itemQuantity->quantity` on the empty object is the **string** `0` in some paths and int `0` in others.
- `changeQuantity(int $itemId, int $locationId, float $quantityChange)` (93-104): single atomic upsert `quantity = quantity + <delta>`; creates the row when missing. **No floor guard** — negative stock is allowed. This is asserted by `tests/Models/ItemQuantityTest.php:50-84` (decrement, going negative, two concurrent decrements both apply).
- `reset_quantity(int $item_id)` / `reset_quantity_list(array $item_ids)` (109-126): set quantity to 0 for one/all.

### 3.2 The `inventory` ledger is append-only

`Inventory` model (`app/Models/Inventory.php`, table `inventory`, PK `trans_id` auto-increment):

- Columns: `trans_items` (item), `trans_user` (employee), `trans_date` (MySQL datetime), `trans_comment`, `trans_inventory` (signed decimal delta), `trans_location` (`Inventory.php:20-27`).
- `insert($data, false)` is used everywhere: the second argument disables CI4 validation; no row is ever updated or deleted by item flows.
- `get_inventory_data_for_item(int $item_id, bool $location_id = false)` (49-61): rows for the item, optionally a location, `ORDER BY trans_date DESC`. The count-details dialog consumes this (§3.5).
- `get_inventory_sum(int $item_id)` (91-99): `SUM(trans_inventory) AS sum, MAX(trans_location) AS location_id` grouped by `trans_location` — **the location is not the group key in the select**, only the sum is grouped; the returned location is the max location id in that group (which is the same as the group key because of the group by).
- `update($comment, $inventory_data)` (34-40) rewrites rows by comment; not used by items.
- `reset_quantity(int $item_id)` (67-85): iterates `get_inventory_sum()`, and for the **first** location whose sum is `> 0` inserts one row with `trans_inventory = -sum`, comment `lang('Items.is_deleted')`, current employee, and **returns immediately**. Only one location is ever corrected. This is a real upstream defect; a parity port must decide whether to reproduce it or fix it (see §10 obligation OBL-14).

### 3.3 Every write site for quantities and ledger

| Site | Quantity write | Ledger write |
|---|---|---|
| Item save, per undeleted location (`Items.php:869-900`) | `quantity = posted quantity_<loc>` via `save_value` | `trans_inventory = updatedQuantity - previousQuantity`; comment `lang('Items.manually_editing_of_quantity')`; date `date('Y-m-d H:i:s')`; user = logged-in employee. Written whenever the quantity differs **or** the item is new (line 886). Temp items force quantity 0. |
| `postSaveInventory` (`Items.php:1013-1047`) | `quantity = current + newquantity` | `trans_inventory = newquantity` (the delta), comment = POST `trans_comment` (may be empty). Ledger insert happens before the quantity write and is not transactional. |
| Receiving save (`app/Models/Receiving.php:161-183`) | `quantity = current + items_received` | `trans_inventory = items_received`, comment `'RECV <receiving_id>'`. |
| Receiving delete (`Receiving.php:230-245`) | `changeQuantity(..., -quantity_purchased * receiving_quantity)` | `trans_inventory = -quantity_purchased * receiving_quantity`, comment `'Deleting receiving <id>'`. |
| Sale completion (`app/Models/Sale.php:648-676`) | `changeQuantity(..., -quantity)` only when `stock_type == HAS_STOCK` and status `COMPLETED` | `trans_inventory = -quantity`, comment `'POS <sale_id>'`. A negative quantity (return) also triggers `Item::undelete` (line 662-665). |
| Sale cancel/delete (`Sale.php:845-870`) | `changeQuantity(..., +quantity_purchased)` | `trans_inventory = +quantity_purchased`, comment `'Deleting sale <id>'`. |
| Item delete / delete list (`Item.php:828-884`) | quantity reset to 0 | see §3.4. |
| CSV import (`Items.php:1435-1470`) | per location column | `trans_inventory = the full column value` (not a delta), comment `lang('Items.inventory_CSV_import_quantity')`. Skips locations with an empty column when the row is an update; writes 0 for new rows. |
| Item kit sale | no kit quantity row exists; components are decremented line by line by `Sale_lib::add_item_kit` → `Sale::save_value` | per component line `'POS <sale_id>'`. |

### 3.4 Delete semantics and the ledger

`Item::delete` order: zero quantity rows → mark `deleted = 1` → `Inventory::reset_quantity`. Because
`reset_quantity` inspects **ledger sums**, not quantity rows, the ledger correction does not necessarily match the
zeroing that already happened; and only one location is corrected. Expected observable behaviour:

- `item_quantities.quantity` = 0 for all locations.
- `items.deleted` = 1.
- At most one ledger row per delete, with `trans_inventory = -SUM(trans_inventory)` for the first location whose ledger sum is positive, comment `Item is deleted` (the English text of `lang('Items.is_deleted')`).

`undelete` restores only `deleted = 0`; stock stays 0, ledger unchanged.

### 3.5 Count details and inventory history UI

**Inventory adjust dialog** (`Items::getInventory`, view `app/Views/items/form_inventory.php`):

- Shows read-only item number, name, category (lines 17-60), a stock-location dropdown (63-66), read-only current quantity (69-80), a free `newquantity` field (83-91), and a `trans_comment` textarea (94-102).
- JS `fill_quantity(val)` updates the read-only quantity from the embedded map (139-142).
- Submits `POST items/saveInventory/<id>`; the delta semantics are in §3.3.

**Count details dialog** (`Items::getCountDetails`, view `app/Views/items/form_count_details.php`):

- Same header fields plus location dropdown and current quantity (17-79).
- A table headed `Items.inventory_data_tracking` with columns date / employee / in-out quantity / remarks (84-95). Rows are rendered purely client-side: the view loads all ledger rows for the item (`Inventory::get_inventory_data_for_item`) and the employee name for each row (97-109), then `display_stock(location_id)` filters client-side by `trans_location` and writes `trans_date`, employee name, `trans_inventory` to `quantity_decimals()` places, and `trans_comment` (113-159).
- Note the employee name array is built once for all rows and indexed by the same index as the ledger array, while the row filter skips other locations; the arrays stay aligned because both loops use the same index.
- The target has no equivalent page at all.

---

## 4. CSV import / export

### 4.1 Template — exact columns and order

`app/Helpers/importfile_helper.php:8-16`:

```
<BOM EF BB BF>Id,Barcode,"Item Name",Category,"Supplier ID","Cost Price","Unit Price","Tax 1 Name","Tax 1 Percent","Tax 2 Name","Tax 2 Percent","Reorder Level",Description,"Allow Alt Description","Item has Serial Number",Image,HSN
```

then, per allowed stock location in `Stock_location::get_allowed_locations()` order (id-keyed, ordered by
`sort_order`; `app/Models/Stock_location.php:68-79, 104-114`):

```
,"location_<location_name>"
```

(`importfile_helper.php:22-31`), then per attribute definition name from `Attribute::getDefinitionNames()`
(all non-deleted definitions, keyed by definition id, with pseudo-entry `-1 => lang('Common.none_selected_text')`)
except the `-1` entry (`importfile_helper.php:37-47`):

```
,"attribute_<definition_name>"
```

The BOM is emitted for Excel compatibility (`importfile_helper.php:10`). Header cells are quoted only where the
source string contains a comma/space in the literal above; the location/attribute cells are quoted.

Download name: `import_items.csv` (`Items.php:1112`). Template generation is exercised by
`tests/Controllers/ItemsControllerTest.php:302-372` (`testGenerateCsvHeaderBasic`, `...MultipleLocations`,
`...WithAttributes`, `testGenerateStockLocationHeaders`, `testGenerateAttributeHeaders`,
`testGenerateAttributeHeadersRemovesNegativeOneIndex`).

### 4.2 Parser and BOM

`get_csv_file(string $file_name): array` (`importfile_helper.php:54-80`):

- `fopen('r')`, `helper('security')`, `bom_exists()` (86-100) reads 3 bytes, rewinds, compares against `pack('CCC',0xef,0xbb,0xbf)`; if present `fseek(3)`.
- `fgetcsv($csv_file)` for the header row, then one associative array per row via `array_combine($headers, $row)`.
- A row equal to `[null]` (blank line) is skipped (70-74).
- No enclosure/escape arguments (defaults), no header trimming, no duplicate-header handling. A data row whose column count differs from the header makes `array_combine` throw `ValueError` on PHP 8, which the controller's outer `catch (Exception)` does **not** catch (`ValueError` extends `Error`, not `Exception`) — the request would fatal. Treated as unknown/edge (§11).
- Tests: `tests/Controllers/ItemsControllerTest.php:374-431` cover basic, BOM, multiple rows, and required-header detection; `496-526` cover `bom_exists`.

### 4.3 Header validation

`csvImportHasRequiredItemHeaders(array $csv_rows, array $stock_locations, array $attribute_names)`:
`importfile_helper.php:117-129`.

- Rebuilds the template header line with the same generator, strips the first 3 BOM bytes, `str_getcsv`, and requires **every** template header to be present in `array_keys(reset($csv_rows))` (`array_diff` on the required set). Extra columns are allowed; any missing column (including `Id`, `Supplier ID`, or a newly added location / attribute) fails the whole import.
- Empty CSV (no data rows) → false.
- Failure response: `lang('Items.csv_import_nodata_wrongformat')` (`Items.php:1149-1151`).
- Tests: `tests/Controllers/ItemsControllerTest.php:431-495` (`testRequiredHeadersDetectedForTemplate`, `testMissingIdHeaderIsRejected`, `testMissingSupplierIdHeaderIsRejected`, `testMissingAttributeColumnIsRejected`, `testEmptyCsvHasNoRequiredHeaders`).

### 4.4 Per-row pipeline (`Items.php:1170-1246`)

For each parsed row, keyed by zero-based `$key` (reported line = `$key + 2`):

1. `$itemId = (int)$row['Id']`, `$isUpdate = $itemId > 0` (1172-1173).
2. Build `$itemData` (1174-1185): `item_id`, `name`, `description` (sanitised `FILTER_SANITIZE_FULL_SPECIAL_CHARS`), `category`, `cost_price`, `unit_price`, `reorder_level`, `deleted = false`, `hsn_code`, `pic_filename = $row['Image']`.
3. Supplier: if `Supplier ID` non-empty, `supplier_id = Supplier::exists(id) ? id : null` (1187-1189).
4. Bool columns (1191-1197): update → `'' ? null : raw` (null means "leave alone" in the insert/update array filter); insert → `'' ? '0' : '1'`.
5. Barcode (1199-1202): if non-empty → `item_number`, and `$isFailedRow = item_number_exists(number, itemId)`.
6. Validation `validateCSVData(...)` when not already failed (1204-1211). The following `if (!empty($invalidLocations))` at 1207-1210 references a variable that is never defined in this scope — dead code.
7. `array_filter($itemData, fn($v) => $v !== null && strlen($v))` (1213-1216) — drops nulls and empty strings, keeps `'0'` (because `strlen('0') === 1`).
8. `Item::save_value($itemData, $itemId)` (1218). On success: `save_tax_data`, `save_inventory_quantities`, `saveCSVRowAttributeData`; if any returns false the row is failed (1219-1234) but the item has already been written. On failure the row is failed immediately (1239-1243).
9. On update, **after** the tax/quantity/attribute helpers, `$itemData` is merged with `get_object_vars(get_info_by_id_or_number($itemId))` (1236-1238); the merged array is never used again (effectively dead code). An update row with blank `supplier_id`/`stock_type`/`deleted` does not null those columns because those keys are absent from `$itemData` (step 7), not because of this merge.
10. Failed rows append `$key + 2` to `$failCodes` and `continue`; the parsed row is unset (1245).

`validateCSVData(array $row, array $itemData, array $allowedStockLocations, array $definitionNames, array $attributeData): bool`
(`Items.php:1318-1423`) — returns **true when the row failed**:

- Required non-empty for **new rows only**: `name`, `category`, `unit_price` (1324-1335).
- New rows: `cost_price = empty ? 0 : value` (allow zero wholesale, 1337-1338).
- Update rows: `Item::exists($itemId)` must be true (1339-1344).
- Numeric checks (non-empty values must be `is_numeric`): `cost_price`, `unit_price`, `reorder_level`, `Supplier ID`, `Tax 1 Percent`, `Tax 2 Percent`, and every `location_<allowed name>` (1347-1366).
- `item_number` must pass `FormatRules::alpha_numeric_punct` (1368-1376).
- Every `location_*` column name must be an exact (case-sensitive) member of the allowed location **names** (`validateCSVStockLocations`, 1291-1306, 1378-1383). Tests: `tests/Controllers/ItemsControllerTest.php:1217-1420` (`testImportCsvInvalidStockLocationColumn`, `...ValidStockLocationColumn`, `...MixedValidAndInvalidLocations`, `testValidateCsvStockLocations`, `testImportItemQuantityOnlyForValidLocations`, `testDetectCsvLocationColumns`, `testValidateLocationNamesCaseSensitivity`).
- Attributes (1385-1420): for each definition name, when `attribute_<name>` exists and is non-empty: `_DELETE_` (case-insensitive) is always allowed; `DROPDOWN` value must be in the definition's values plus `''`; `DECIMAL` must be numeric; `DATE` must satisfy `isValidDate()` (locale-format aware, `app/Helpers/locale_helper.php:658`); `TEXT`/`CHECKBOX` unrestricted.
- No validation of the `Image` column, of the `Allow Alt Description`/`Serialized` raw values, of HSN length, or of duplicate item numbers **within the same file** (only against the DB).

### 4.5 Quantity columns (`save_inventory_quantities`, `Items.php:1435-1470`)

For every allowed location (id => name):

- If `location_<name>` is non-empty **or exactly `'0'`**: quantity row set to that value; ledger row inserted with `trans_inventory = that value` (the full value, not the delta).
- Else if the row is an update: `continue` — no quantity/ledger change.
- Else (new row, empty column): quantity row inserted as `0` **and** a ledger row with `trans_inventory = 0` is inserted.
- Uses `Item_quantity::save_value` (upsert). Returns the AND of all results.
- Test evidence: `tests/Controllers/ItemsControllerTest.php:563-623` (quantity, inventory record), `900-927` (quantity zero), `1015-1127` (multiple locations), `1328-1380` (only valid locations).

### 4.6 Tax columns (`save_tax_data`, `Items.php:1479-1504`)

- Negative `Tax 1 Percent` or `Tax 2 Percent` → return false (row failed) (1483-1497).
- A tax is saved only when the percent is numeric, `>= 0`, and the corresponding name is non-empty.
- If no tax qualifies, the method returns **true without deleting existing taxes** — unlike `Item_taxes::save_value`, which deletes first. Consequence: re-importing an item with blank tax columns keeps its old taxes; re-importing with some taxes replaces them (because `save_value` deletes all first).
- Tests: `tests/Controllers/ItemsControllerTest.php:256-276` (`testSaveTaxData_RejectsNegativePercent`), `624-652`.

### 4.7 Attribute columns

`extractAttributeData(array $row)` (`Items.php:1270-1282`): collects keys starting with `attribute_`, stripping the
first 10 characters to recover the definition **name** (not id). `saveCSVRowAttributeData(array $attributeValues,
array $itemData, array $definitions)` (`app/Models/Attribute.php:942-975`) loops **all** definitions (not just the
columns present):

- `_DELETE_` (case-insensitive) → `deleteAttributeLinks(item_id, definition_id)` and continue (949-954).
- Empty/absent → no change.
- `CHECKBOX`: values `false`/`0` (case-insensitive) → `'0'`, everything else → `'1'` (958-962).
- Otherwise `storeCSVAttributeValue` (985-1017): find an existing value row by value+type, delete the item's links for that definition, then either re-link the existing value or create a new value+link; case-only changes to TEXT values update the stored capitalization (999-1008).
- `Attribute::attributeValueExists` matching is by value and type; DROPDOWN values therefore must already exist or they are created as new global dropdown values (upstream allows that — the validator only rejects unknown dropdown values, so the create path is for the `TEXT`/`DECIMAL`/`DATE`/`CHECKBOX` types and for a dropdown value that races with validation).
- Tests: `tests/Controllers/ItemsControllerTest.php:759-900` (`testImportDeleteAttributeFromExistingItem`, `testImportItemWithAttributeText`, `testImportItemWithAttributeDropdown`).

### 4.8 Image column

The `Image` column is copied verbatim into `items.pic_filename` (`Items.php:1184`). There is no upload, no
validation, no existence check, and no path normalisation: a CSV can reference any filename, including one that
does not exist (the list then shows no image) or one that exists on disk. Combined with the thumbnail route's
`glob()` lookup this is the upstream behaviour to replicate (see §5.3 for the security posture).

### 4.9 Transaction, rollback, duplicates, error reporting

- The entire import runs inside one transaction (`Items.php:1167-1168`).
- Any failed row appends its line number and, at the end, `transRollback()` is called and the response is `{success:false, message: lang('Items.csv_import_partially_failed', [count, 'line, line, ...'])}` (1250-1253). So there is **no partial import**: a single bad row discards every good row.
- On success: commit + `Attribute::deleteOrphanedValues()` (`Items.php:1254-1258`); message `lang('Items.csv_import_success')`.
- Duplicate handling: only `item_number_exists` (against the live DB, excluding the row being updated; deleted items are ignored because the model filters `deleted != 1`). Duplicate `Id` values inside the file are not detected; the second row updates the item created by the first.
- Missing/empty `Id` means insert; `Id` that is non-numeric casts to 0 → insert; `Id` for a deleted item passes `exists()` (which defaults to `deleted = 0`) only if not deleted, so updating a deleted item fails validation.
- Error text is written to the log with `log_message('error', ...)` at each check; the response only carries line numbers.
- `set_time_limit(240)` (1142); the file is read from `$_FILES['file_path']['tmp_name']` directly, not via the CI upload API (1138-1141), so there is no MIME/extension/size validation at all. A non-CSV file simply fails to parse (or fatals on inconsistent rows).
- CSV injection: values are stored raw (name/category/hsn/image); only `description` is HTML-escaped on import. Output escaping is the view's responsibility. A formula-injection payload (`=cmd|...`) is preserved in the DB.

### 4.10 Export

There is **no item data export** upstream — only the empty template (`getGenerateCsvFile`). Any target "export"
must be treated as a new feature, not parity.

---

## 5. Item images

### 5.1 Upload validation (`Items::upload_image`, `Items.php:923-963`)

- `$file = $this->request->getFile('items_image')`; if falsy → `[]` (no error).
- `helper(['form'])`, then CI4 validation rule set (931-943):
  - `uploaded[items_image]`
  - `is_image[items_image]`
  - `max_size[items_image,<config image_max_size>]`
  - `mime_in[items_image,image/png,image/jpg,image/jpeg,image/gif]`
  - `ext_in[items_image,<config image_allowed_types>]`
  - `max_dims[items_image,<config image_max_width>,<config image_max_height>]`
- Config defaults (`app/Database/Migrations/20200508000000_image_upload_defaults.php:16-19`): `image_allowed_types = 'gif|jpg|png'`, `image_max_height = 480`, `image_max_size = 128` (kilobytes), `image_max_width = 640`. The 3.4 conversion migration rewrites the pipe-separated list (`app/Database/Migrations/sqlscripts/3.4.0_CI4Conversion.sql:16`), so both `'|'` and `','` forms must be accepted by any consumer (the thumbnail route does exactly that at `Items.php:227-230`).
- On validation failure the method returns `['error' => validator->getError('items_image')]`; the controller then rolls back the whole save and returns the stripped error text as the JSON message (`Items.php:905-916`).
- `max_size` is in KB per CI4's `max_size` rule; the value is not converted anywhere.

### 5.2 Filename handling and storage path

`Items.php:949-962`:

- Original client name: `$file->getClientName()`; `pathinfo()` split.
- `$sanitized_name = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $info['filename'])` — every character outside `[A-Za-z0-9_.-]` becomes `_`; dots are allowed, so `..` survives inside the stem.
- Extension comes from `$file->guessExtension()` (MIME-based), **not** the client extension.
- Move target: `FCPATH . 'uploads/item_pics/' . raw_name . '.' . file_ext`, with overwrite = `true` (third argument true). An upload named `photo.png` overwrites any previous `photo.png`; two different items can therefore share one file. There is no randomisation or collision suffix.
- `pic_filename` stored in the DB is `<sanitized_name>.<guessed_ext>` (set in `Items.php:829-831`).
- Empty sanitized stem (e.g. client name `###.png` → stem `___`) is still accepted.
- No EXIF scrubbing, no re-encoding, no dimension downscale — the image is stored as uploaded if it passes `max_dims`.

### 5.3 Thumbnail route and path-traversal defence (`Items::getPicThumb`, `Items.php:215-255`)

- Path parameter is `rawurldecode`d and `basename()`d (221), so `..%2f..%2fetc%2fpasswd` collapses to `passwd`.
- Extension whitelist: lowercase `pathinfo` extension must be in the configured `image_allowed_types`, accepting both `|` and `,` separators, with fallback `'jpg,jpeg,gif,png,webp,bmp,tif,tiff'` (227-234). Rejection → HTTP 400 `Invalid file type`.
- Lookup: `glob("./uploads/item_pics/$pic_filename")` — the parameter is treated as a **glob pattern**, so a filename containing `*`, `?`, `[` would be interpreted; the upload sanitiser forbids those characters today, but legacy/CSV-set filenames may contain them.
- If at least one match: `$image_path = $images[0]`; `$thumb_path = <base>_thumb.<ext>`. Thumbnail generated only when `sizeof($images) < 2 && !file_exists($thumb_path)` — i.e. when exactly one file matches and the thumb is absent (243-248). Generation: `Services::image('gd2')->withFile(...)->resize(52, 32, true, 'height')` (master dimension = height, so the thumbnail is 32 px tall with width ≤ 52).
- Response: `Content-Type: mime_content_type($thumb_path)`, body = file bytes (250-251).
- If no file matches, the function returns the response with default (usually 200/empty) body — no 404.
- `getSearch` calls `update_pic_filename()` for rows with `pic_filename !== null` (`Items.php:157-159`), which repairs legacy rows whose `pic_filename` lacks an extension by globbing `uploads/item_pics/<name>.*` and writing the actual basename back (`Items.php:1511-1527`).

### 5.4 Display path in the item form (`Items::getView`, `Items.php:461-472`)

- `logo_exists = pic_filename !== null` (an empty string counts as existing).
- If set: when `pathinfo(...PATHINFO_EXTENSION)` is empty, glob `uploads/item_pics/<name>.*`, else glob the exact filename; `image_path` is the first match URL-encoded per path segment with `rawurlencode` (`implode('/', array_map('rawurlencode', explode('/', ltrim($images[0], './'))))`), or `''` when nothing matches.
- The form shows a 100x100 preview and a file input (`app/Views/items/form.php:354-374`).

### 5.5 Remove logo / default image

- `getRemoveLogo($item_id)` sets `pic_filename = null` (`Items.php:1000-1006`). The file remains on disk; a later upload with the same name overwrites it. The form's "remove image" anchor calls this via GET (`form.php:508-514`).
- Default image behaviour is "no image": the list cell prints nothing when `pic_filename` is empty or no file matches (`app/Helpers/tabular_helper.php:471-483`), and `getItemDataRow` returns `item_pic => null`.
- The list thumbnail URL uses `site_url('items/PicThumb/' . rawurlencode(basename($images[0])))` (`tabular_helper.php:481`), i.e. the same route as §5.3.

---

## 6. Barcodes

### 6.1 Supported types and configuration

`app/Libraries/Barcode_lib.php:19-52` — the supported list is a hard-coded map of Picqer constants to labels:

`C32` Code 32, `C39` Code 39, `C39+` Code 39 Checksum, `C39E` Code 39E, `C39E+` Code 39E Checksum, `C93` Code 93,
`S25` Standard 2 5, `S25+` Standard 2 5 Checksum, `I25` Interleaved 2 5, `I25+` Interleaved 2 5 Checksum, `C128`
Code 128, `C128A` Code 128 A, `C128B` Code 128 B, `C128C` Code 128 C, `EAN2` EAN 2, `EAN5` EAN 5, `EAN8` EAN 8,
`EAN13` EAN 13, `ITF14` ITF14, `UPCA` UPC A, `UPCE` UPC E, `MSI` Msi, `MSI+` MSI Checksum, `POSTNET` Postnet,
`PLANET` Planet, `RMS4CC` RMS4CC, `KIX` KIX, `IMB` IMB, `CODABAR` Codabar, `CODE11` Code 11, `PHARMA` Pharma Code,
`PHARMA2T` Pharma Code Two Tracks.

`get_barcode_config()` (`Barcode_lib.php:65-86`) returns the raw config values for:
`company`, `barcode_content`, `barcode_type`, `barcode_font`, `barcode_font_size`, `barcode_height`, `barcode_width`,
`barcode_first_row`, `barcode_second_row`, `barcode_third_row`, `barcode_num_in_row`, `barcode_page_width`,
`barcode_page_cellspacing`, `barcode_generate_if_empty`, `barcode_formats` (with `'null'` normalised to `[]`).

Config defaults from `app/Database/Migrations/sqlscripts/initial_schema.sql:28-41`:
`barcode_content = 'id'`, `barcode_type = 'Code39'`, `barcode_width = 250`, `barcode_height = 50`,
`barcode_quality = 100`, `barcode_font = 'Arial'`, `barcode_font_size = 10`, `barcode_first_row = 'category'`,
`barcode_second_row = 'item_code'`, `barcode_third_row = 'unit_price'`, `barcode_num_in_row = 2`,
`barcode_page_width = 100`, `barcode_page_cellspacing = 20`, `barcode_generate_if_empty = 0`. `barcode_formats`
default `'[]'` (`app/Database/Migrations/sqlscripts/3.0.2_to_3.1.1.sql:309`).

Compatibility wart to preserve deliberately or fix explicitly: the shipped default `barcode_type` is the **label**
`'Code39'`, while `generate_barcode` passes the string straight to Picqer (`Barcode_lib.php:113`), whose constants are
`'C39'` etc. A fresh install without a barcode-config save throws, is caught, echoes the exception text and returns
an empty barcode (114-119). The config UI stores the keys of `get_list_barcodes()` (`C39`, `C128`, ...), so the
problem disappears after one save (`app/Views/configs/barcode_config.php:20-25`; `app/Controllers/Config.php:1044`).

`barcode_content` values: `'id'` (radio, `barcode_config.php:103-108`) or `'number'` (radio, 111-116).

### 6.2 Value selection (`Barcode_lib::get_barcode_value`, lines 95-100)

```php
return $barcode_config['barcode_content'] !== 'id'
    ? ($item['item_number'] ?? $item['name'])
    : $item['item_id'];
```

- `'id'` → item id (as a string for Picqer).
- Anything else (including the UI's `'number'`) → `item_number` if the key is set, else `name`. Note `item_number` may be an empty string: `isset` is true, so an empty barcode is encoded and Picqer throws.
- The barcode string is never passed through `esc()` (only display rows are, §6.5).

### 6.3 Generate-if-empty — actual upstream behaviour (defect)

`Items::getGenerateBarcodes` (`Items.php:562-580`):

```php
foreach ($result as &$item) {
    if (isset($item['item_number']) && empty($item['item_number']) && $this->config['barcode_generate_if_empty']) {
        if (isset($item['item_id'])) {
            $save_item = ['item_number' => $item['item_number']];   // <-- the empty value
            $this->item->save_value($save_item, $item['item_id']);
        }
    }
}
```

It writes `item_number = ''` back (the variable is not regenerated; there is no number generator anywhere in the
codebase). Two observable effects: a write occurs per selected item with an empty barcode (harmless but a real DB
write and ledger-free update), and the barcode sheet then encodes the empty string. No `MAX(item_number)+1`
sequence, no id-derived barcode, exists upstream. Any target implementation of "auto number" is a new feature;
parity requires only that the flag is read and that empty numbers do not crash the sheet.

### 6.4 Barcode sheet layout

`app/Views/barcodes/barcode_sheet.php`:

- Standalone HTML document, `lang` from `current_language_code()`, title `Items.generate_barcodes` (12-17).
- Stylesheet `css/barcode_font.css` (18); `@font-face` families are named after the font file without `.ttf` (`Barcode_lib::get_font_name`, lines 222-225) and the body gets class `font_<name>` plus inline `font-size: <barcode_font_size>px` (27).
- Wrapper table: `border-spacing: <barcode_page_cellspacing>px; width: <barcode_page_width>%` (28).
- One `<td>` per item; a new `<tr>` is started every `barcode_num_in_row` items (`if ($count % $barcode_config['barcode_num_in_row'] == 0 && $count != 0)`, lines 32-38).
- Per-item cell (`Barcode_lib::display_barcode`, 144-159): an inner 4-row table — first-row text, barcode SVG, second-row text, third-row text.
- SVG size: `.barcode svg { height: <barcode_height>px; width: <barcode_width>px }` (20-23). The SVG itself is generated with `getBarcode($value, $type, 2, $barcode_height)` (113): the `2` is Picqer's width factor, the height is pixels.
- No page margins, no print CSS, no explicit page-break handling; page size comes from the browser print dialog. The `print_*_margin` config keys are not used here.
- There is no PDF export upstream; the sheet is meant to be printed from the browser.

### 6.5 Display rows, tokens, escaping

`manageDisplayLayout(string $layoutType, array $item, array $barcodeConfig)` (`Barcode_lib.php:167-189`):

- `name` → `esc($item['name'])`.
- `category` → `lang('Items.category') . ' ' . esc($item['category'])`.
- `cost_price` → `lang('Items.cost_price') . ' ' . to_currency($item['cost_price'])`.
- `unit_price` → `lang('Items.unit_price') . ' ' . to_currency($item['unit_price'])`.
- `company_name` → `esc($barcodeConfig['company'])` (config, not item).
- `item_code` → when `barcode_content !== 'id'` and `item_number` set: `esc($item['item_number'])`, else `esc($item['item_id'])`.
- Anything else (including `not_show` and `none`) → `''`.
- Result is truncated by `character_limiter($result, 40)` (188).
- Security tests: `tests/Libraries/Barcode_libTest.php:40-127` assert that name/item_code/category/company_name payloads are HTML-escaped and that clean text is unaffected.

Row options offered by the config UI (`app/Views/configs/barcode_config.php:145-208`):
first row: `not_show`, `name`, `category`, `cost_price`, `unit_price`, `company_name`; second/third rows:
`not_show`, `name`, `category`, `cost_price`, `unit_price`, `item_code`, `company_name`.
`manageDisplayLayout` accepts the superset regardless of row.

`display_barcode` guard (146-158): requires `(isset(item_number) || isset(name)) && isset(item_id)`; otherwise the
literal English string `"Item number or Item ID not found in the item array."` is returned (not translated).

### 6.6 Item-kit barcodes

`Item_kits::getGenerateBarcodes` (`Item_kits.php:262-294`):

- Splits the colon list; for each kit id computes totals with `_add_totals_to_item_kit` (so cost/unit rows show the kit aggregate), then overwrites `$itemKitId = 'KIT ' . $itemKitId`.
- Row shape: `name` = kit name, `item_id` = `item_number` = `"KIT <id>"`, `cost_price` = `total_cost_price`, `unit_price` = `total_unit_price`.
- Forces `barcode_type = 'C128'` unless the configured value is exactly `'C39'` or `'C128'` (287-289) because EAN formats cannot encode the `"KIT "` prefix (comment 285-286).
- The sheet view is shared with items.
- Tests: `tests/Controllers/ItemKitsControllerTest.php:100-129` (`testGenerateBarcodesDoesNotDecodeTripleEncodedPayload`, `testGenerateBarcodesWorksForPlainItemKitId`) pin the URL/payload handling.

### 6.7 `barcode_formats` token parsing (sales side)

`barcode_formats` is **not** used by `Barcode_lib`. It is a list of `Token_lib` patterns used when a scanned string
is entered at the register: `Token_lib::parse_barcode` (`app/Libraries/Token_lib.php:169-186`) loops the configured
formats, parses each with `Token_lib::parse` (188-215), extracts `W` (weight → `quantity = W/1000`), `I` (item id or
number) and `P` (price override), and falls back to quantity 1 when no format is configured. `Token_lib::scan`
(146-167) extracts `{TOKEN}` / `{TOKEN:length}` placeholders. The target has no token parser; item scanning is a
plain id/number lookup (§9.1).

### 6.8 Duplicate barcodes

- Config key `allow_duplicate_barcodes` default `'0'` (`app/Database/Migrations/sqlscripts/3.1.1_to_3.2.0.sql:89`). The same migration drops the unique index on `items.item_number` (94-96), so even with the flag off uniqueness is enforced only in application code.
- `Item::item_number_exists` returns false unconditionally when the flag is truthy (`Item.php:96-98`); so does `Item_kit::item_number_exists` (`app/Models/Item_kit.php:66-68`).
- When the flag is off, the check excludes deleted rows (`deleted != 1`) and the edited row.
- The item form runs the check asynchronously via `items/checkItemNumber` (`form.php:549-559`); the CSV importer checks per row (`Items.php:1199-1202`); the item-kit form checks `item_kits.item_kit_number` (`app/Views/item_kits/form.php:271-283`).

---

## 7. Item kits

### 7.1 CRUD and storage

- Tables: `item_kits` (PK `item_kit_id`, columns `item_kit_number`, `name`, `description`, `item_id`, `kit_discount`, `kit_discount_type`, `price_option`; `print_option` is selected but not in `$allowedFields`) and `item_kit_items` (`item_kit_id`, `item_id`, `quantity`, `kit_sequence`).
- `Item_kit` allowed fields (`app/Models/Item_kit.php:19-27`): `item_kit_number`, `name`, `description`, `item_id`, `kit_discount`, `kit_discount_type`, `price_option`. `print_option` is written by the controller (`Item_kits.php:173`) through the query builder, which bypasses `$allowedFields`.
- `Item_kit::save_value(array &$item_kit_data, int $item_kit_id = NEW_ENTRY)` (`Item_kit.php:161-177`): insert when `NEW_ENTRY` or `!exists()`; on insert sets `$item_kit_data['item_kit_id'] = insertID()` (note: no `(int)` cast, unlike `Item::save_value`). Update otherwise. No `low_sell` analogue.
- `Item_kit::delete($id)` hard-deletes the kit row (`Item_kit.php:182-187`); `delete_list(array $ids)` deletes by `whereIn` (`192-198`). Components are not touched (no cascade in the upstream DDL).
- `Item_kit_items::save_value(array &$data, int $item_kit_id)` (`app/Models/Item_kit_items.php:54-76`): transaction; `delete($item_kit_id)`; then insert each row with `item_kit_id` injected. `delete()` is by `item_kit_id` (81-86).
- `Item_kit::get_info(string $item_kit_id)` (`Item_kit.php:95-144`): left-joins `items ON item_kits.item_id = items.item_id`; selects kit fields plus item fields aliased `item_name`, `item_description`, `kit_item_id` (the kit's own `item_id`), `item_number`, prices, `item_type`, `stock_type`, `deleted`. `WHERE item_kit_id = ? OR item_kit_number = ?`; returns the row or an object whose fields are `''`. Because the id column is compared to a string parameter, both id and number lookup are supported.
- `Item_kit::get_multiple_info(array $ids)` (149-156): `whereIn`, order `name` asc.
- `Item_kit_items::get_info(int $item_kit_id)` (23-35): joins `items` and `item_kits`, selects `item_kits.item_kit_id, item_kit_items.item_id, quantity, kit_sequence, unit_price, item_type, stock_type`, `WHERE item_kits.item_kit_id = ? OR item_kit_number = ?`, order `kit_sequence` asc. `get_info_for_sale` (40-49) orders `kit_sequence` **desc** and is documented as unused.
- `Item_kit::get_total_rows` (85-90): count of all kit rows (no deleted flag exists).
- `Item_kit::exists` (32-38): `getNumRows() == 1`.
- No soft delete, no `deleted` column on kits: deleting a kit is permanent and removes it from sale lookups.

### 7.2 Kit items (components) and kit number

- The form posts `item_kit_qty[item_id]` and `item_kit_seq[item_id]` (`app/Views/item_kits/form.php:196-198`). The controller converts to `[{item_id, quantity: parse_quantity(qty) | 0, kit_sequence: intval(seq) | 0}]` (`Item_kits.php:185-196`) and calls `save_value`. Components with quantity 0 are accepted; duplicates in the POST cannot occur because the keys are item ids (the JS increments an existing row instead of adding a second, `form.php:216-226`).
- `kit_sequence` defaults to 0; the client defaults new rows to `0` and shows the current sequence (`form.php:196, 222`).
- `item_kit_number` is stored as posted, including empty/null; the form warns on duplicates through `item_kits/checkItemNumber` (`Item_kits.php:249-253`; `form.php:271-283`), which calls `Item_kit::item_number_exists` (with the leading-zero id exception, `Item_kit.php:62-80`).
- `Item_kit::is_valid_item_kit` (`Item_kit.php:43-57`): accepts `"KIT <id>"` (exactly two space-separated pieces and the first matches `/KIT/i`) or any string that matches `item_kit_number`. Used by the register to distinguish kits from items.

### 7.3 Pricing and totals (`_add_totals_to_item_kit`, `Item_kits.php:31-60`)

Let:
- `kit_item_info = Item::getInfo($item_kit->kit_item_id ?? $item_kit->item_id)`.
- `total_cost_price = Σ (component.cost_price × component.quantity)` over **all** components (line 45).
- `total_unit_price` starts at `kit_item_info->unit_price` (line 36), then adds `component.unit_price × component.quantity` for components selected by `price_option`:
  - `PRICE_OPTION_ALL` (0): always add.
  - `PRICE_OPTION_KIT` (1): never add — the condition only tests `PRICE_OPTION_KIT_STOCK`, so a kit-only option contributes no component prices (line 47).
  - `PRICE_OPTION_KIT_STOCK` (2): add only when the **component** has `stock_type == HAS_STOCK`.
- `$total_quantity` is accumulated but never used (line 49).
- Discount (53-57): `discount_fraction = bcdiv(kit_discount, '100')`; `total_unit_price = total_unit_price - round(type == PERCENT ? bcmul(total_unit_price, discount_fraction) : kit_discount, totals_decimals(), PHP_ROUND_HALF_UP)`.
  - Percent: subtracts `round(total * discount/100, currency_decimals)`.
  - Fixed: subtracts `round(kit_discount, totals_decimals())` (the `round()` wraps both branches of the ternary).
  - Discount can exceed the total (negative price) — no clamp.
- Form defaults for a new kit: `price_option = '0'`, `print_option = PRINT_ALL`, `kit_discount = 0`.
- The manage list and the single-row refresh both call this function (`Item_kits.php:89, 114`), so the displayed totals are computed on every request (N+1 queries per kit).

### 7.4 Price and print options

- `price_option` constants (`Constants.php:126-132`): `PRICE_ALL = 0`, `PRICE_KIT = 1`, `PRICE_KIT_ITEMS = 2`. The form uses numeric literals 0/1/2 with labels "kit and components", "kit only", "kit and stock" (`app/Views/item_kits/form.php:99-127`).
- `print_option` constants: `PRINT_ALL = 0`, `PRINT_PRICED = 1`, `PRINT_KIT = 2` (`Constants.php:119-121`); form labels "all", "priced only", "kit only" (`app/Views/item_kits/form.php:129-157`).
- Sale-side interpretation (`app/Libraries/Sale_lib.php:1058-1073`): for `PRICE_MODE_KIT`, a component's price is zeroed and its discount reset unless `kit_price_option == PRICE_OPTION_ALL`, or `kit_price_option == PRICE_OPTION_KIT && $item_type == ITEM_KIT`, or `kit_price_option == PRICE_OPTION_KIT_STOCK && $stock_type == HAS_STOCK`. Because components added by `add_item_kit` are ordinary items with `item_type == ITEM`, option 1 (kit only) zeroes **all** component prices — the intended "kit only" behaviour is only reachable when an `ITEM_KIT` row is itself a component.
- Print selection (`Sale_lib.php:1123-1140`): `PRINT_ALL` → print; `PRINT_KIT && item_type == ITEM_KIT` → print; `PRINT_PRICED && price > 0` → print; otherwise no print.

### 7.5 Kit tax handling

- `item_kits` has no tax columns. A kit row may point at an `items` row (`item_kits.item_id`); that item's `tax_category_id` is returned by `Item_kit::get_info` (selected column list, `Item_kit.php:98-123`).
- Sales of a kit are exploded into component lines (`Sales_lib::add_item_kit`, `Sale_lib.php:1343-1360`), so the taxes actually charged are each component's own tax rows, not a kit-level tax. A kit-level tax category affects nothing in the sale flow.
- No kit tax is saved by `Item_kits::postSave` (`Item_kits.php:166-175`).
- The target has no kit tax handling either, but also no linked-item field (§9.9).

### 7.6 Kit inventory semantics

- Kits carry no `item_quantities` row of their own; `Item_kit::get_info` may return `stock_type` from the linked item, but quantities are never maintained per kit.
- `Sale_lib::add_item_kit` (`Sale_lib.php:1343-1360`) splits `"KIT n"` (or a bare id), iterates `Item_kit_items::get_info($item_kit_id)`, and calls `add_item($component_id, $location, component_quantity, ..., PRICE_MODE_KIT, $kit_price_option, $kit_print_option)` for each component. Each component becomes its own cart line with `item_type`/`stock_type` of the component.
- Stock is therefore decremented per component when the sale is completed (`Sale.php:648-676`, only for `HAS_STOCK` components).
- Out-of-stock warning: the first component whose quantity is below zero/reorder produces the warning (`Sale_lib.php:1352-1356`); a kit can be sold with insufficient components unless the caller blocks it.
- Receivings: the receiving item picker uses `get_stock_search_suggestions`, which excludes kits (`Item.php:1117-1124`), so kits are not normally receivable. Receiving a kit id directly would create a quantity row for the kit row (kits are `items` rows only if a separate item of type kit exists — the `item_kits` table is not in `items`).
- Deleting a kit removes the kit and (via `postDelete` only) leaves its `item_kit_items` rows orphaned; the sale lookup then finds nothing because `get_info` joins `item_kits`.

### 7.7 Kit barcodes and suggestions

- Kit barcodes: §6.6.
- `Item_kit::get_search_suggestions(string $search, int $limit = 25)` (`Item_kit.php:205-235`): if the search contains `KIT ` (case-insensitive) it matches `item_kit_id` after stripping the prefix and labels `"KIT <id>"`; otherwise matches `name` or `item_kit_number` and returns `{value: "KIT <id>", label: name}`. Truncated at `$limit`. Used by `item_kits/suggest_search` (manage search bar).
- `Item_kit::search(string $search, ...)` (`Item_kit.php:248-285`): `LIKE` on `name`, `description`, `item_kit_number`; when the search contains `KIT `, also `LIKE item_kit_id` after stripping; `$count_only` selects `COUNT(item_kit_id) AS count` and returns that scalar; otherwise order/limit. There is no sort whitelist inside the model — the controller sanitises against `item_kit_headers()` (`Item_kits.php:80`; headers at `app/Helpers/tabular_helper.php:578-588`).

---

## 8. Item form behaviours (`app/Views/items/form.php` + `Items::getView`)

Field-by-field, in render order, with the state the controller supplies:

| Field | View lines | Controller data | Behaviour |
|---|---|---|---|
| `item_number` | 34-47 | `$item_info->item_number` | Free text with barcode icon. Remote duplicate check `POST items/checkItemNumber` with `item_id` (549-559); message `Items.item_number_duplicate`. Server rule `alpha_numeric_punct` when non-empty (`Items.php:688-706`). Empty → stored NULL. |
| `name` | 49-59 | `$item_info->name` | Required (client `name: 'required'`, line 547; message `Items.name_required`). No server-side length/required rule (only tax/number validation in `validateItemFields`) — a direct POST can create an empty name. |
| `category` | 61-80 | `$item_info->category`, `$selected_category`, `$categories` | If `config['category_dropdown'] === '1'`, a dropdown of `Attribute::getDefinitionValues(CATEGORY_DEFINITION_ID)` prefixed with `'' => lang('Items.none')` (`Items.php:388-395`); otherwise free text with `items/suggestCategory` autocomplete (502-506). Client-required, server not. |
| attributes inline editor | 82-86 | loaded via `$('#attributes').load('items/attributes/<id>')` | See §8.1. |
| `stock_type` | 88-110 | `$item_info->stock_type` | Two radios, values 0/1 (`Items.stock`, `Items.nonstock`). On a new item defaults to `HAS_STOCK` (`Items.php:405`). |
| `item_type` | 112-168 | `$item_info->item_type`, `$standard_item_locked`, `$item_kit_disabled`, `$allow_temp_item`, `config['derive_sale_quantity']` | Radios standard 0 / kit 1 / amount-entry 2 / temp 3. Kit radio disabled when `item_kit_disabled`; standard radio disabled when `standard_item_locked`, computed as `item_kit_disabled && item_type == ITEM_KIT && !allow_temp_item && !(derive_sale_quantity === '1')` (`Items.php:415-420`). |
| `supplier_id` | 170-175 | `$suppliers` ('' => `Items.none` plus all suppliers), `$selected_supplier` | Dropdown keyed by `person_id`, labels `company_name`. Supplier list is **all** rows (no deleted filter, `Items.php:424-430`). |
| `cost_price` | 177-196 | `$item_info->cost_price` formatted `to_currency_no_money` | Currency addon on the left/right per `is_right_side_currency_symbol()`. Client-required + remote `checkNumeric` (560-563); server locale-parsed. |
| `unit_price` | 198-217 | same | same rules. |
| `tax_names[]` / `tax_percents[]` (tax 1, 2) | 219-265 | `$item_tax_info[0..1]`, `$default_tax_1_rate`, `$default_tax_2_rate` | Only when `!use_destination_based_tax`. Names default to `config['default_tax_1_name']`/`_2_name`, percents to `to_tax_decimals(default_tax_X_rate)` for new items (`Items.php:397-399`). Percent field label suffix `%`. Client rule only for a non-existent field name `tax_percent` (582-585) — the `[]` fields are effectively unvalidated client-side; server rules in §2.8. |
| `tax_category` + hidden `tax_category_id` | 267-283 | `$tax_categories`, `$tax_category`, `$tax_category_id` | Only when destination-based tax. Text input with `taxes/suggestTaxCategories` autocomplete (476-484) and hidden id. On a new item the id defaults to `config['default_tax_category']` (`Items.php:410-412`). |
| `hsn_code` | 285-299 | `$hsn_code` when `include_hsn`, else `''` | Free text; stored `''` when absent. |
| `quantity_<location_id>` | 301-314 | `$stock_locations[location_id] = {location_name, quantity}` from `Item_quantity::get_item_quantity`, forced 0 for `NEW_ENTRY` | One required numeric field per **undeleted** location (`Stock_location::getUndeletedAll`, `Items.php:474-481`), prefixed label `Items.quantity <name>`. Saved per location with ledger delta (§3.3). |
| `receiving_quantity` | 316-327 | `$item_info->receiving_quantity`, default 1 for new (`Items.php:401`) | Required numeric, locale-quantity parsed. Forced to 1 on save when 0 and not temp. |
| `reorder_level` | 329-340 | default 1 for new (`Items.php:402`) | Required numeric; forced 0 for temp. |
| `description` | 342-352 | `$item_info->description` | Textarea; server HTML-sanitises. |
| image | 354-374 | `$logo_exists`, `$image_path` | 100x100 preview, file input `items_image` (`accept="image/*"`), "remove image" anchor that calls `items/removeLogo/<id>` (508-514). |
| `allow_alt_description` | 376-386 | checkbox value 1 | Save maps presence → bool. |
| `is_serialized` | 388-398 | checkbox value 1 | same. |
| `qty_per_pack` | 400-411 | only if `multi_pack_enabled == '1'`; default `to_quantity_decimals(0)` for new, but controller sets `qty_per_pack = 1` (`Items.php:407`) | free numeric. |
| `pack_name` | 412-422 | only if multi-pack; default `lang('Items.default_pack_name')` (`Items.php:408`) | free text. |
| `low_sell_item_name` + hidden `low_sell_item_id` | 423-436 | only if multi-pack; `$selected_low_sell_item` built as `implode(NAME_SEPARATOR, [name, pack_name])` when the item references another item (`Items.php:483-490`) | autocomplete `items/suggestLowSell` (486-500); hidden id posted, absence → current item id (§2.6). |
| `is_deleted` | 439-449 | checkbox value 1, checked when `deleted == 1` | The only delete/restore control in the item form. Saving with it checked soft-deletes; unchecking restores (quantities stay 0). |

Form mechanics:

- `form_open("items/save/$item_info->item_id", ['enctype' => 'multipart/form-data'])` (line 31): the id is in the URL, not the body.
- Submit is AJAX; on success `table_support.handle_submit('items', response, stay_open)` (537). "Save and new" (`#new`) forces `stay_open = true`, clears a whitelist of fields and resets the form action to `items/save/` (457-461, 525-539). "Submit" closes the dialog.
- `dialog_support`/`table_support` are global JS helpers; the response contract is `{success, message, id}` (`Items.php:909, 916`).

### 8.1 Inline attribute editor (`app/Controllers/Items.php:588-617`, `app/Views/attributes/item.php`)

- On load, the form fetches `items/attributes/<item_id>` with no `definition_ids`, so the controller returns only attributes already linked to the item (`Attribute::get_attributes_by_item`, `app/Models/Attribute.php:205-218`: definition join link, `item_id`, `sale_id IS NULL`, `receiving_id IS NULL`, `deleted = 0`, ordered by `definition_name`).
- The view renders a "definition name" dropdown containing every definition **not already rendered** (the controller removes rendered ids from `definition_names`, `Items.php:595-614`; the dropdown is populated from the remaining names). Selecting one reloads `items/attributes/<item_id>` with a POST/GET map `definition_ids` where the new definition maps to `''`; `get_values_by_definitions` (`Attribute::get_values_by_definitions`, 224-242) then adds that definition (and its child dropdown definitions where `definition_fk` matches), so an empty row appears.
- Per type (view 26-105):
  - `DATE`: text input with class `datetime`, value `to_date(...)` (today when empty).
  - `DROPDOWN`: `<select>` of the definition's values (`getDefinitionValues`), selected from the item's link.
  - `TEXT`: free text, class `valid_chars` (the JS rejects `|` and `_`, `form.php:516-518`).
  - `DECIMAL`: free text formatted with `to_decimals`.
  - `CHECKBOX`: hidden input value 0 plus a checkbox value 1.
  - Every row has a hidden `attribute_ids[definition_id]` with the current `attribute_id` and a remove button that deletes the DOM row (no server call).
- On save, `saveItemAttributes` deletes **all** non-sale/non-receiving links for the item and re-saves the posted `attribute_links[definition_id]` (`Items.php:1535-1562`):
  - DROPDOWN → `saveAttributeLink(item, definition, attribute_id)` (uses the posted id directly; `<= 0` → false).
  - DECIMAL → `parse_decimals` then `saveAttributeValue` (stores the decimal column).
  - Everything else (TEXT/DATE/CHECKBOX) → `saveAttributeValue(..., definitionType)` which maps to `attribute_value`/`attribute_date` via `getAttributeDataType` (`app/Helpers/attribute_helper.php:12-20`).
  - Ends with `deleteOrphanedValues()` (`Attribute::deleteOrphanedValues`, `Attribute.php:1100-1115`).
  - A removed DOM row is therefore deleted server-side; an emptied text field is stored as an empty value rather than deleted.

---

## 9. Target gap analysis (file by file)

Legend: **P** = parity (behaviour matches), **D** = divergent (works, different semantics), **M** = missing,
**X** = defect in the target. Line numbers are the target's.

### 9.1 `src/lib/items/repository.ts` (625 lines)

| Area | Lines | Status | Findings |
|---|---|---|---|
| `isItemId` | 49-51 | D | `/^\d+$/ && !startsWith("0")`. Matches the upstream leading-zero rule for id lookup but is used for the whole search term. |
| `searchItems` free text | 57-68 | D | Searches `name`, `itemNumber`, `category`, **`description`**, exact `itemId`. Upstream searches `name`, `item_number`, `items.item_id` (LIKE, so partial), `company_name` (supplier), `category`, and **not** description. Target omits supplier company and partial-id matching, adds description. |
| `emptyUpc` | 69 | P | `isNull(itemNumber)` matches upstream (`IS NULL` only). |
| `isSerialized` | 70 | P | `eq(isSerialized, true)`. |
| `noDescription` | 71 | X | `isNull(items.description)`; upstream is `description = ''`. NULL-description items are wrongly reported as "no description"; empty-string ones are not. |
| `isDeleted` | 72-76 | P/D | `deleted=1` shows only deleted; `deleted=0` only active; absent → active. Upstream identical for `is_deleted` filter, but upstream never shows both. No way to list all. |
| `temporary` | 77 | X | Only **adds** `item_type = ITEM_TEMP` when the filter is on. There is no `else` excluding temp items, so the default item list includes temp items. Upstream excludes `ITEM_TEMP` unless the filter is set (`Item.php:437-442`). |
| `lowInventory` | 38 (`lowInventory?`), never read | M | The filter is declared and passed by the page (`page.tsx:21`) but never applied. The checkbox in `ItemsTable` therefore does nothing. Upstream: `quantity <= reorder_level` with location join. |
| `searchCustom` | 42, never read | M | No attribute search. Upstream supports `color:blue` named search plus attribute-only free text. |
| `stockLocationId` | 117-130 | X | Location only changes the displayed quantity map (`where locationId = ?`), not the item set. Upstream inner-joins `item_quantities` for the location (items with no stock row at that location disappear) and applies `low_inventory` on that row. |
| `total` | 188-192 | X | `count(*)` over the **same** `where` but without location/attribute joins. When a location filter is active the count is not the number of visible rows. Upstream `get_found_rows` applies all filters. |
| sort/order | 111 | M | Hard-coded `desc(items.itemId)`. No `sort`/`order` parameters, no attribute sort, no `quantity` sort. Upstream supports all three (`Item.php:452-466`). |
| pagination | 112-113 | D | `limit = filters.limit ?? 25`, `offset`; the page hard-codes `limit: 100` (`page.tsx:27`) with no pager. No total-driven paging UI. |
| tax map | 132-152 | D | Always reads `items_taxes`; builds `"<percent>%,"` joined strings with `toFixed(2)` and `", "` separator (upstream: `to_tax_decimals(percent) . '%, '` and strips the last `, `; default `-`). In destination-tax mode the page displays `row.taxCategory` instead, but the map is still computed. Tax rows ordered by name (upstream: insertion order). |
| attribute map | 154-185 | D | Reads only `attribute_value` (TEXT). Upstream `getItemDataRow` merges `attribute_values`, `attribute_dtvalues` and `attribute_dvalues` through `expand_attribute_values` (`tabular_helper.php:646-675`), so DATE and DECIMAL attributes never render in the target list. Definitions are filtered by `(definitionFlags & 1) = 1` (all-bits semantics) vs upstream `definition_flags & 1` (any-bit). |
| raw SQL interpolation | 125, 140, 171-172, 505, 508, 561, 590 | X (risk) | `` sql`... IN (${ids.join(",")})` `` and `` sql`${items.category}` `` interpolate unparameterised fragments. Today every id comes from a DB row (numeric), so injection is not reachable, but the pattern is unsafe and diverges from a parameterised port. Also `${itemQuantities.locationId} = ${filters.stockLocationId}` interpolates a page-supplied integer. |
| `getItemByIdOrNumber` | 217-220 | D | Numeric non-zero input is resolved as an **id first**; upstream runs one query over `item_number OR item_id` with `LIMIT 1`, so a barcode that collides with another item's id is resolved arbitrarily upstream and to the id in the target. |
| `getItemByNumber` | 211-215 | D | No `LIMIT`, no deleted handling; `get()` returns the first row. Upstream `get_info_by_id_or_number` accepts deleted by default. |
| `getItemIdByNumber` | 496-501 | X | `if (ignoreDeleted && row.deleted === deleted) return null;` — the condition is inverted. With default `(false, false)` a deleted item's id is returned. Intended: `if (!ignoreDeleted && row.deleted !== deleted) return null`. |
| `getMultipleInfo` | 503-511 | D/X | Returns rows even when `locationId` is undefined; upstream returns an empty result for `null` (`ItemTest.php:79-87`). Joins no suppliers/attributes and returns no `company_name`/`attribute_*`/`quantity` when no location. `quantity` defaults to 0 per item rather than NULL. |
| `saveItem` | 294-382 | X | (a) `deleted: false` is always written (line 316) → **editing a deleted item resurrects it**, and there is no way to soft-delete from the form. (b) `lowSellItemId` is not accepted in `SaveItemInput` and never updated; only the insert self-reference at 326 is preserved. (c) `receivingQuantity` is written as received; no `0 → 1` normalisation for non-temp items (upstream `Items.php:777-784`). (d) `reorderLevel = 0` for temp is done (305) but `receivingQuantity` is not zeroed for temp (upstream zeroes it). (e) `stock_type` forced to `HAS_NO_STOCK` for temp (309) — parity. (f) No `hsn_code` default `''` (null written). (g) `packName` not defaulted to `lang('Items.default_pack_name')`. (h) No server validation of `item_number` characters (upstream `alpha_numeric_punct`). |
| `saveItem` taxes | 329-340 | X | Deletes all taxes, then inserts only when `t.name && t.percent` → **0 % taxes are dropped** (upstream saves percent 0). Truncates to the first 2 entries (upstream also has exactly 2 slots). Only called when `input.taxes` is defined; the action always sets it from JSON or leaves undefined (`actions.ts:43-46`). No negative-percent rejection (upstream validates `nonNegativeDecimal`). |
| `saveItem` quantities | 342-378 | D | Upserts per posted location and writes the delta ledger row **only when delta !== 0**; upstream writes a ledger row for every location when the item is new, even with delta 0 (`Items.php:886-899`). Comment text is the English literal `"Manually editing of quantity"` (matches the English lang value but not the translation mechanism). |
| `deleteItem` | 384-400 | D | Marks deleted; for every existing quantity row writes `-quantity` to the ledger (including zero/negative rows) and zeroes. Upstream uses inventory **sums** per location and only corrects the first positive one (`Inventory.php:67-85`). Target therefore produces a more complete ledger than upstream. No transaction boundary issue (whole delete is one transaction). No `low_sell_item_id` cleanup. |
| `adjustInventory` | 402-427 | P/D | Absolute set with delta ledger, default comment `"Manually editing of quantity"`. Upstream `postSaveInventory` computes `current + posted delta` where the posted number is the **delta**; the target's form labels the field "New Quantity" and sets absolute. Different UI contract, same end state only when the user enters the target value. No NaN guard (`parseFloat` can be NaN → `NaN` stored). |
| `itemNumberExists` | 429-436 | X | Ignores `allow_duplicate_barcodes` (config exists in the seed at `src/db/seed.ts:85`); does **not** exclude deleted rows (upstream `deleted != 1`); `excludeItemId` truthiness means `0`/`undefined` behave the same; only one row is checked (`get()`), so with duplicates it can miss. |
| `suggestItems` | 438-456 | D | Single `LIKE` over name/item_number/category, deleted=0, no `value/label` projection, no description/supplier suggestions, no `multi_pack` label appending, no `suggestions_*_column` config. `kitsOnly` and `stockOnly` are additive. Returns full `ItemRow[]`. |
| `getCategorySuggestions` | 458-470 | D | `DISTINCT` in SQL plus `limit(10)`; adds `ne(category, "")` (upstream doesn't exclude empty but they are noise). Returns strings, not `{label}`. |
| `getLocationSuggestions` | 586-596 | X | Returns **categories**. Upstream's version is also broken (nonexistent `items.location`), but the target silently mislabels categories as locations. |
| `bulkUpdate` | 472-480 | X | No whitelist (callers pass `Partial<ItemRow>`; the action type limits to 4 fields but the function is exported and accepts anything). No `CLEAR_SUPPLIER_OPTION` sentinel. No locale parsing, no bool validation, no tax support, no `reorder_level`/`description`/`allow_alt_description` support, no `employeeId` use (`void employeeId`, line 479). Loops one `UPDATE` per id instead of one `whereIn`. |
| `changeCostPrice` | 513-535 | X | (a) Rounds with `Math.round(avg*10000)/10000` → 4-dp **half-up**; upstream truncates at `bcscale` 4. For 10.77775 upstream yields `10.7777`, target `10.7778`. (b) `itemsReceived <= 0` → sets cost to `newPrice` (upstream always averages). (c) `totalQty <= 0` → sets cost to `newPrice` (upstream divides). (d) Uses JS floats rather than decimal strings. (e) Caller ignores `receiving_calculate_average_price` (`src/lib/receiving/receiving-model.ts:55-59`) and passes `line.quantity`, not `quantity × receiving_quantity` (receiving_quantity is hard-coded 1 at line 52, so currently equivalent). (f) Runs inside `db.transaction` but executes through `getDbSync()` on the same connection (SQLite), so it participates; on MySQL the whole items repository throws anyway (`getDbSync` guard, `src/lib/db/index.ts:29-34`). |
| `updateItemNumber/Name/Description` | 537-547 | P | Direct single-column updates; `itemNumber || null` and `description || null` convert empty to NULL (upstream writes the raw string). |
| `getItemName` | 549-552 | X | Ignores `multi_pack_enabled` and `NAME_SEPARATOR`; returns `items.name` either way. |
| `getAllItems` | 554-564 | D | `deleted = 0`, limit default 100; post-filters quantity in app code rather than SQL. Upstream `get_all` also includes temp items and accepts `-1` as "all locations". |
| `getStockSearchSuggestions` | 566-568 | D | `suggestItems({stockOnly})` — no `item_type` filter (upstream excludes kits/amount-entry by `non_kit`), no stock-type label semantics. |
| `getKitSearchSuggestions` | 570-572 | D | `suggestItems({kitsOnly})` → items with `item_type = ITEM_KIT`; matches upstream `Items::getSuggestKits`, but the label/format differs. |
| `getLowSellSuggestions` | 574-584 | D | Missing `stock_type = 0` restriction (upstream `Item.php:1328`); matches name **or** item_number (upstream name only); no `{value,label}` shape. |
| `getTotalRows` | 605-609 | P | Count active items. |
| `undeleteItem` | 611-613 | P | Sets `deleted = false` only. |
| `deleteItemList` | 615-617 | D | Loops `deleteItem` (N transactions). Upstream batches with one transaction and `reset_quantity_list`. |
| `updateMultiple` | 619-625 | D | Loops per id; no whitelist; not used by any action. |

### 9.2 `src/app/(secure)/items/actions.ts` and `form-data.ts`

- `ItemSchema` (`actions.ts:23-52`): `coerce.number` for prices/quantities, `coerce.boolean` for the two checkboxes, `z.record(z.coerce.number(), z.string().nullable())` for attributes. **No** `item_number` charset rule, no non-negative percent, no required-category rule, no max lengths, no `is_deleted`, no `lowSellItemId`.
- `saveUploadedPicture` (56-66): random `Date.now()_<6 chars>` base name, extension from the **client filename** (`path.extname(picture.name).toLowerCase()`), no MIME/size/dimension validation, writes to `process.cwd()/uploads/item_pics`. An upload named `x.html` is stored as `.html` and later served by the thumbnail route with a guessed `image/jpeg` MIME (see §9.7). No `image_max_size`/`max_dims` checks.
- `saveItemAction` (68-122): the only validation is Zod + duplicate barcode. It does not read `is_deleted`, `low_sell_item_id`, `qty_per_pack` default rules, or tax-category defaults; it redirects on success, so the client never receives the saved row. Zod failure returns `{error: fieldErrors}` (92-94) which the form renders as raw JSON (`item-form.tsx:68-70`). No transaction spans item save + attribute save (112-118): an attribute failure leaves the item saved with partial attributes.
- Attribute saving (112-118) calls `saveAttributeValue` for every key, including `''`/`null`, and **never deletes** links for attributes removed from the map. It also always writes the TEXT column (§9.12).
- `bulkUpdateAction` (139-144) is unreachable from the UI and unvalidated (negative prices, non-numeric supplier, invalid booleans all pass through to `bulkUpdate`).
- `getItemTotalRowsAction` (277-279) has no auth check and returns `getAllItems().length` (≤ 100), not a count.
- `deleteItemAction`/`undeleteItemAction` exist but no component imports them (`items-table.tsx`, `items/[id]/page.tsx` do not). There is no delete/restore/bulk-edit UI at all.
- `parseFormDataEntries` (form-data.ts:1-39): groups repeated keys, JSON-parses `taxes`/`quantities` entries only. Checkbox absence yields no key → Zod default. Note that `saveItemAction` reads `attributeValues` and then `formData.delete("attributeValues")` (89) before parsing — correct.

### 9.3 `src/components/items/item-form.tsx` (304 lines)

| Upstream field | Target status | Detail |
|---|---|---|
| item type radios (standard/kit/amount/temp) | M/X | No selector at all. `onSubmit` forces `fd.set("itemType", String(item?.itemType ?? 0))` (line 51), so a new item is always type 0 and the type can never change. `derive_sale_quantity`, `allow_temp_items`, and the `item_kits` grant gate are all absent. |
| stock type radios | X | A single checkbox named `stockType` value `"1"` (160-163) plus `fd.set("stockType", String(item?.stockType ?? 0))` at line 52. `FormData.set` replaces the checkbox entry, so **stock type can never be changed**, and new items always get 0. |
| supplier | P/D | Select of all suppliers, `""` → `null` via action line 106 (`data.supplierId || null`). |
| category dropdown config | M | Always free text (97-100); `category_dropdown` and `CATEGORY_DEFINITION_ID` are not implemented. Category autocomplete endpoint exists but the input is not wired. |
| tax 1/2 | D | Two name + percent inputs (172-194). Requires **both** name and percent to submit (`if (tax1Name && tax1Percent)`, 54-55), so a tax name with an empty percent is dropped (upstream also drops it) and percent `"0"` is dropped by `saveItem` (§9.1). Default names/rates for new items are not pre-filled (`new/page.tsx` passes `taxes={[]}`). No validation, no `<label for>`, percent step 0.01. |
| destination tax category | D | Select of non-deleted categories (195-204); hidden-id/autocomplete semantics differ but the stored column matches. |
| HSN | P | Rendered only when `include_hsn` (141-147). |
| receiving quantity / reorder level | P | Numeric inputs (121-130). Reorder `step="1"` ignores `quantity_decimals`. |
| qty per pack / pack name | D | Always shown, not gated by `multi_pack_enabled` (132-140). No low-sell item picker at all (`lowSellItemId` never posted). |
| description | P | Textarea; server stores raw (no HTML sanitisation like upstream). |
| allow alt description / serialized | P | Checkboxes with `value="true"` and `defaultChecked` (152-159). `z.coerce.boolean` parses `"true"` → true. |
| image | D | Preview via `/api/items/pic-thumb/<filename>` (208-212), file input `picture` (213-214). No remove button, no validation, no dimension/size enforcement; random filename. |
| attributes | D/X | Renders **all** non-deleted definitions including `GROUP` (217-270). DROPDOWN is a free-text input (234-241), not a select of `listDropdownValues`. GROUP renders as a text input (falls through to 257-263). Values are stored in `attribute_value` regardless of type (§9.12). No add/remove definition flow, no `valid_chars` rule. |
| quantity per location | D | Numeric inputs `qty_<id>` (272-288) with `step="0.001"`; the action JSON-parses each non-empty value (59-64) and `saveItem` upserts. Empty inputs mean "no change", whereas upstream submits every location as a required field and writes 0 when cleared. |
| is_deleted / restore | M | No checkbox; editing always writes `deleted: false` (§9.1) so deleted items are revived and cannot be deleted from the UI. |
| submit contract | D | Always redirects to `/items/{id}`; no "save and new", no stay-open, no `handle_submit` table refresh. Error display is `JSON.stringify(error)` (68-70). |

### 9.4 `src/components/items/items-table.tsx` and `src/app/(secure)/items/page.tsx`

- Columns (94-108): ID, Image, Barcode, Name, Category, Supplier, Cost, Price, Qty, Reorder, Tax, one column per attribute definition, Actions. Upstream headers also include the tax category/percent column (present here), image (present), attributes (present), and the two icon columns `inventory` (count entry dialog) and `stock` (count details). Target replaces both with explicit `Edit` / `Inventory` / `Barcodes` links (162-170) — there is **no count-details link**.
- Formatting: `$${row.costPrice.toFixed(2)}` etc. (146-147) hard-codes `$`, two decimals and `.` separators; upstream uses `to_currency` with `currency_symbol`, `number_locale`, `currency_decimals`, `thousands_separator` (`tabular_helper.php:495-497`). Quantity `toFixed(0)` ignores `quantity_decimals`.
- Tax cell (152-154): `taxCategory` in destination mode else `taxPercents`; upstream cell content is `-` when no taxes (target returns `-` from the repo, so mostly parity).
- Attribute cells (155-159): `row.attributeValues?.[id]` — only TEXT values, one value per definition (upstream concatenates all three typed columns per definition and formats DECIMAL with `to_decimals`).
- Multi-pack: name is not suffixed with `pack_name` (upstream `tabular_helper.php:485-487`).
- Filters (65-88): `empty_upc`, `low_inventory`, `serialized`, `no_description`, `deleted`, `temporary`; no `search_custom`. All are URL params; `low_inventory` is a no-op in the repo (§9.1), and the `deleted` checkbox only ever sets `deleted=1` (showing deleted items) because the unchecked case removes the param.
- No row selection (checkbox column), so no bulk delete / bulk edit / "generate barcodes for selected". Upstream's item table is selectable and its toolbar drives `items/delete`, `items/bulkEdit`, `items/generateBarcodes` (`app/Views/items/manage.php:104-140`).
- The page (`page.tsx`) supports `q`, `location`, the filter flags, and `limit: 100`; it does not support `start_date`/`end_date` (upstream default range starts 2010-01-01, `manage.php:46-56`), sort, or paging.
- No "new/updated" flash and no auto-refresh; a save redirects and the list is server-rendered.

### 9.5 Detail, inventory, and count pages

- `/items/[id]` (`src/app/(secure)/items/[id]/page.tsx`): loads everything the form needs; no delete/restore, no count details, no barcode link. Attribute definitions include GROUP and all definitions regardless of `SHOW_IN_ITEMS`.
- `/items/[id]/inventory` (`.../inventory/page.tsx`): renders `InventoryForm` plus a history table with Date, Delta, Comment (22-46). Missing vs upstream: employee column, in/out sign formatting via `quantity_decimals`, location filter for the history (the API accepts `locationId` but the page never passes it), and the count-details dialog (upstream `form_count_details.php`). Date formatting uses `new Date(transDate*1000).toLocaleString()` (37) — `trans_date` is stored as an epoch integer in the target schema (§9.10), unlike upstream's datetime string.
- `InventoryForm` (`src/components/items/inventory-form.tsx`): absolute "New Quantity" (46-54), no comment field (upstream has `trans_comment`), no current-quantity refresh after submit, no error display (`await adjustInventoryAction(...)` result ignored, 22-26), no NaN handling.
- No `countDetails` equivalent exists anywhere in the target.

### 9.6 CSV (`src/app/api/items/csv-import/route.ts`, `csv-template/route.ts`, `src/lib/csv/parse.ts`)

Template (`csv-template/route.ts`):

- Same 17 base headers in the same order (14-18), then `location_<name>` (19) and `attribute_<name>` (20).
- BOM emitted as `"﻿"` and **every** header quoted (22). Upstream quotes only some; a consumer that compares raw header text will differ, but both are valid CSV.
- Filename `items_template.csv` (26) vs upstream `import_items.csv`; no permission check beyond session (8).

Parser (`src/lib/csv/parse.ts:1-24`):

- Hand-rolled state machine; handles `""` escapes, `\n`/`\r\n`, drops fully blank rows (23).
- **Does not strip the UTF-8 BOM.** The first header becomes `"﻿Id"`, so `obj["Id"]` (route line 39) is always undefined → every row is treated as an insert, including rows produced by the target's own template. This is the single highest-impact CSV defect in the target.
- `toCsv` (26-33) is exported but unused; it does not add a BOM.

Import (`route.ts`):

| Upstream behaviour | Target | Status |
|---|---|---|
| Header validation against the full template | none — `rows.length < 2` only (19) | M |
| `Id` > 0 means update | `Id` parsed (39); BOM breaks it | X |
| Required name/category/unit_price for new rows | only `name` (41) | M |
| Cost/unit price non-negative | `costPrice < 0 || unitPrice < 0` throws (44) | P (stricter than upstream for cost; upstream allows any numeric incl. negative) |
| Supplier exists check | none (`supplierId` parsed raw, 49); a nonexistent id violates the FK / is stored if FKs are off | M |
| `Allow Alt Description` / serialized: update `''` → leave alone | always writes booleans derived from `"1"`/`"true"` (56-57), so an update with a blank column **clears** them | X |
| `item_number` charset check | none | M |
| Duplicate barcode check | none — duplicate barcodes are inserted silently | M |
| Location column name validation | none; unknown columns are ignored | M |
| Quantity per location; new rows get 0 + ledger 0 | only non-empty columns update; new rows get **no row and no ledger** for blank locations (92-123) | D |
| Ledger delta on CSV import = the full column value | delta computed from existing row (112), so a quantity change records the difference, not the value | D |
| `tx.update(itemQuantities).set({quantity}).where(eq(itemQuantities.itemId, newId))` (103-104) | **updates every location row of the item** to the first processed location's value; the same item's other locations are overwritten | X |
| Tax 1/2 saved when name + numeric ≥ 0; negative fails row | saved when name && percent truthy (77-90), so 0 % dropped, negative accepted, blank name with percent dropped; old taxes always deleted first (76) | X/D |
| `_DELETE_` deletes only that definition's links | `_DELETE_` deletes **all** attribute links of the item (129-131) | X |
| Attribute values stored in typed columns, existing link replaced | TEXT/DROPDOWN/CHECKBOX stored in `attribute_value`; DECIMAL/DATE insert a **new value row on every import** (154-169) with no dedupe; a new link is inserted without deleting the previous link for that definition (171-177) → duplicate links accumulate | X |
| `Image` column sets `pic_filename` | ignored entirely | M |
| Whole-import transaction, rollback on any failure | per-row transaction; failed rows roll back individually and the response is `{success, failed, errors}` (28-30, 187) — a partial import is reported as success for the good rows | D |
| `set_time_limit(240)` | none (Next has no equivalent; large files may time out) | D |
| HTML sanitisation of description | none | D |
| Permission `items` | session only (10) | M |

### 9.7 Images (`src/app/(secure)/items/actions.ts:54-66`, `src/app/api/items/pic-thumb/[file]/route.ts`)

| Upstream guarantee | Target | Status |
|---|---|---|
| `is_image`, `max_size` (KB), `mime_in`, `ext_in`, `max_dims` | none — any file is written | M |
| Sanitised, deterministic filename from client name | random `<epoch>_<rand>.<client-ext>` — avoids overwrite collisions but trusts the client extension | D |
| Thumbnail generated at 52x32 (height master) | route serves the **full-size** file; no thumbnail generation, no `_thumb` naming | M |
| Extension whitelist from `image_allowed_types` | none; MIME guessed from extension, defaulting to `image/jpeg` (20-25) | D |
| Path traversal defence (`basename` + extension whitelist) | `path.basename`, equality check, `..`/slash/backslash rejection (12-16) — solid | P |
| 400 for bad extension; empty body when missing | 400 for traversal only; 404 when missing (18) | P/D |
| Remove logo sets `pic_filename = null`, keeps file | no remove action / UI at all | M |
| Legacy filename repair (`update_pic_filename` in list) | none; a `pic_filename` without extension 404s | M |
| Auth: `items` module grant | any authenticated session (9) | M |
| `Cache-Control` | `private, max-age=300` (26); upstream sets none | D |

Additional risk: because the extension comes from the client and the route serves any file in `uploads/item_pics`
with a guessed image MIME, a file like `evil.svg`/`evil.html` is served as `image/jpeg` (browsers will not execute
it inline), but stored non-image content is still reachable to any logged-in user. A port should validate MIME,
size, and dimensions server-side.

### 9.8 Barcodes (`src/lib/barcode/index.tsx`, `generate-barcodes/page.tsx`, `api/items/barcodes-pdf/route.ts`)

| Upstream | Target | Status |
|---|---|---|
| Picqer `BarcodeGeneratorSVG`, height px, width factor 2 | `bwip-js` `toSVG`/`toBuffer`; `width: opts.width ?? 2`, `scale: 2`, `height` (54-65, 140-142) | D (library and sizing model differ) |
| 32-type Picqer list with distinct checksum variants | `SUPPORTED_BARCODES` 32 keys but `+` checksum variants collapse to the same bcid (4-14), so `C39+` encodes as plain `code39` | X |
| `barcode_content`: `'id'` → item id, anything else → `item_number` or name | `getBarcodeValue` (71-75) handles only `'id'`, `'item_number'`, `'name'`; the config UI/seed stores `'number'`, which falls through to `String(itemId)` — **wrong barcode for the shipped `'number'` setting** | X |
| `barcode_generate_if_empty` writes a number | flag read into `BarcodeConfig.generateIfEmpty` (50) and never used anywhere (grep: only declarations); no auto-numbering | M |
| `barcode_formats` token parsing (Token_lib) | absent | M |
| Sheet: `barcode_num_in_row`, `barcode_page_width` %, `barcode_page_cellspacing`, font size/family, `barcode_height`/`width` | Preview CSS grid with `repeat(numInRow, ...)`, `maxWidth: pageWidth%`, `margin: cellspacing px` (79-90); PDF: A4 page, `padding: 16`, `width: 100/numInRow %`, `margin: cellspacing`, `border: 1pt`, font Helvetica unless a non-Arial name (145-160) | D |
| First/second/third rows support `name`, `category`, `cost_price`, `unit_price`, `item_code`, `company_name`, `not_show` | supports `id`, `item_number`, `name`, `category`, `unit_price`, `cost_price`; **no `item_code`, no `company_name`**, `not_show` → "" (92-128). Values are raw numbers / unformatted prices with no localized prefix (`displayBarcode`) | X |
| `esc()` + `character_limiter(40)` on row text | preview renders row text through JSX (auto-escaped) — safe; PDF uses react-pdf `<Text>` — safe; SVG inserted with `dangerouslySetInnerHTML` (page line 92) from bwip-js output (library-generated, not user text) | P/D |
| Kit barcodes: `"KIT <id>"`, forced C128, aggregate prices | no kit barcode route/page/action at all | M |
| Items selected via item table; all ids honoured | page and PDF route call `searchItems({searchText:"", limit:200})` then filter in memory (page 29-32; route 12-14) — items beyond the first 200/50 are silently omitted, and deleted items are excluded | X |
| `items` module grant | page requires it (27); PDF route only requires a session (7); suggestion API routes only a session | M/D |
| Upstream barcode endpoint writes `item_number` | target never writes | M (matches the upstream defect's *effect* but not the write) |

### 9.9 Item kits (`src/lib/item_kits/repository.ts`, `src/app/(secure)/item_kits/actions.ts`, `src/components/item_kits/*`, pages)

| Upstream | Target | Status |
|---|---|---|
| `item_kits` CRUD with `item_id` (kit item link), `print_option` | `saveItemKitAction` writes `itemKitNumber, name, description, kitDiscount, kitDiscountType, priceOption, printOption` (23-26); **`item_id` is never written** and `ItemKitRow`/`Initial` have no such field | M |
| `kit_discount_type` percent/fixed; discounted totals | discount stored, never applied anywhere (no totals computation) | M |
| `price_option` 0/1/2 with kit-only / kit-stock semantics (`PRICE_OPTION_ALL=0, KIT=1, KIT_STOCK=2`) | Target constants are `PRICE_OPTION_ALL=0, KIT_STOCK=1, KIT_AND_STOCK=2, KIT=3` (`src/lib/constants.ts:13-16`) — **different numeric mapping**; the form labels 0..3 (95-98) and `sale-lib.ts:774-778` treats `priceOption === 3` as kit mode and uses `kit.priceOption` as the line price (0/1/2/3) rather than the component price. Kit sale pricing is not parity. | X |
| `print_option` 0/1/2 | stored; passed to cart line `printOption` (`sale-lib.ts:788`); form adds a 4th option "Do not print" (107) | D |
| Components: `item_kit_qty[item_id]`/`item_kit_seq[item_id]`, sequence order, quantity parsed locale-aware | JSON `items` array of `{itemId, quantity, kitSequence}` (37-46); `kitSequence` is client-supplied and defaults to index+1 in `repository.saveValue` (77-79); no locale parsing; quantity 0/negative accepted | D |
| `Item_kit_items::get_info` returns component unit price/stock type | target `getItems` returns raw component rows; form joins item name/number for display (page 13-24) | D |
| `get_info` supports lookup by number or id | only by id (`getInfo`, 40-46) | D |
| `search` on name/description/number, `KIT ` prefix | `search` on name only (88-92) | M |
| `suggest_search`, `getRow`, `getTotalRows` endpoints | `searchItemKitsAction`/`getItemKitRowAction`/`getItemKitTotalRowsAction` exist (76-78) but are unused; no kit suggestions API | M |
| Kit number duplicate check | none; `itemKitNumber` stored raw (16) | M |
| Delete removes kit row; components orphaned upstream | target deletes components then kit in one transaction (57-58) — cleaner, but no FK cascade in the target DDL either (`drizzle/sqlite/0000_skinny_power_man.sql:91-111`) | D |
| List shows computed total cost/price, sortable headers | list selects raw kit rows (page line 10), table shows number/name/description only (`item-kit-table.tsx:20-40`) | M |
| Barcodes for kits | absent | M |
| Kit tax via linked item | absent (no link) | M |
| Kit inventory: components decremented on sale | `addItemKit` pushes one cart line per component (`sale-lib.ts:773-790`), so completion decrements components; pricing bug above | D/X |
| `item_kit_items` PK includes `(item_kit_id, item_id, quantity)` upstream | target table has no PK/unique at all (`drizzle/sqlite/0000_skinny_power_man.sql:91-98`), so duplicate components are possible via direct writes | D |
| New-kit defaults `price_option=0`, `print_option=PRINT_ALL`, `kit_discount=0` | form defaults from `initial?.… ?? 0` (95-108) — effectively 0, so parity | P |

### 9.10 Schema and migrations (`src/db/schema/items.ts`, `drizzle/sqlite/0000_skinny_power_man.sql`)

- `items` columns (schema 4-27; DDL 121-145) match upstream's item columns, with these type differences:
  - `cost_price`, `unit_price`, `reorder_level`, `receiving_quantity`, `qty_per_pack` are `real`; upstream `decimal(15,3)` for quantities/prices (3 dp). Floating-point storage will diverge on the 4-dp weighted average.
  - `allow_alt_description`, `is_serialized`, `deleted` are boolean-mode integers with `DEFAULT false`.
  - `item_number` is **not unique** in either system; target has no index on it (upstream keeps a plain index).
- `items_taxes` (29-33; DDL 146-152): no primary key. Upstream PK is `(item_id, name, percent)` (`initial_schema.sql:228-233`), so upstream silently rejects exact-duplicate tax rows; target allows them.
- `item_quantities` (35-39; DDL 113-119): **no primary key / no unique index on `(item_id, location_id)`**. Upstream PK is that pair (`initial_schema.sql:282-289`). `Item_quantity::save_value`'s read-then-write upsert and every `update … where item_id and location_id` assume uniqueness; duplicates (possible under concurrency or the CSV import's full-item update bug) make `get()`/`update()` ambiguous.
- `inventory` (41-49; DDL 76-89): `trans_date` is an **integer epoch** (`$defaultFn(Date.now()/1000)`), whereas upstream stores a MySQL `datetime` string. Item search's date-range filter, the inventory history display, and any CSV/report date handling must agree; the target has none of the date-range logic.
- `item_kits`/`item_kit_items` (51-66; DDL 91-111): no PK/unique on `item_kit_items`; `item_kits.item_id` FK exists in the target but is never populated.
- `items.deleted` is `boolean` in the target vs `int(1)` upstream; code comparisons (`=== true/false`) are used.
- The target seeds config `barcode_type: "C128"`, `barcode_page_width: "150"`, `barcode_page_cellspacing: "5"`, `barcode_first_row: "name"`, `barcode_second_row: "category"`, `barcode_third_row: "cost_price"`, `barcode_generate_if_empty: "1"` (`src/db/seed.ts:42-53`) — deliberately different from upstream defaults (§6.1). If parity is the goal these must be re-seeded or the divergence documented.

### 9.11 `src/lib/items/item-lib.ts` (stock-location scoping)

- `getItemLocation(personId)` reads an app-config key `item_location_<personId>` with a fallback to the default location (9-11). Upstream keeps this in the **session** (`app/Libraries/Item_lib.php:29-48`), which means the location choice is per browser session and never persisted.
- `setItemLocation(personId, locationId)` validates existence then discards both values (`void personId`, 13-20): it never writes the config, so the "remember my location" behaviour does not exist. `clearItemLocation` is a no-op (22-24).
- `getDefaultLocationId(kind)` returns the **first undeleted location by insertion order** (30-34); upstream `getDefaultLocationId()` orders by `is_default DESC, sort_order ASC` and joins permissions/grants (`app/Models/Stock_location.php:138-153`). The `kind` argument is ignored.
- `isAllowedLocation` ignores the employee: every undeleted location is "allowed" (45-49). Upstream `getUndeletedAll()` joins `permissions`/`grants` for the logged-in person (`Stock_location.php:68-79`), so all location dropdowns and the CSV template's location columns are employee-scoped upstream and global in the target.
- The item list, item form, CSV template, and inventory page all use `getStockLocations()` / `getAllStockLocations()` (`repository.ts:232-241`, `item-lib.ts:36-38`), so none of them apply this scoping.

### 9.12 Attributes as they touch items (`src/lib/attributes/repository.ts`)

- `getAttributesByItem` (123-137) joins definitions/values by `attribute_value` only; it does not filter `sale_id IS NULL`/`receiving_id IS NULL` (so sale-time links can appear in the item form) and does not return the typed columns.
- `saveAttributeValue` (139-156) always writes `attributeValues.attributeValue`, never `attributeDate`/ `attributeDecimal`, and decides by "does any link exist for (definition, item)" — so a DECIMAL definition stores text in the wrong column, and clearing a value overwrites the shared value row (which may be referenced by other items/links) rather than creating/deleting a link. Upstream creates a new value row per distinct value and re-links (`Attribute::saveAttributeValue`, `Attribute.php:882-930`).
- No `deleteAttributeLinks` analogue on item save: removing an attribute from the form leaves the stale link.
- `deleteOrphanedValues(definitionId)` (200-209) takes a definition id and deletes only non-item-linked values for that definition; upstream's `deleteOrphanedValues()` has no argument and deletes every value with no link at all (`Attribute.php:1100-1115`). Not called from the item save action.
- `getDefinitionsByFlags(flags)` (176-181) uses `(definitionFlags & flags) = flags` (all bits). Upstream uses `definition_flags & $flags` (any bit, `Attribute.php:273`). Only equivalent for single-bit flags.
- The item form receives `listDefinitions()` (all definitions, including `GROUP`) rather than `getDefinitionsByFlags(SHOW_IN_ITEMS)`; `SHOW_IN_ITEMS` is only used for the list column set (`items/page.tsx:32`).

### 9.13 Tests in the target

- `src/lib/items/repository.test.ts` covers only `changeCostPrice`: weighted average and 4-dp **rounding** (`repository.test.ts:33-50`) — the rounding contradicts upstream truncation (§2.9). Nothing tests search, save, delete, bulk, CSV, images, barcodes, kits, or the form.
- `e2e/items.spec.ts` (5 tests): list empty state, create+edit, inventory heading, CSV heading, barcode heading; no filters, quantities, delete/restore, validation, or tax persistence. `e2e/items-barcodes.spec.ts`: preview + PDF download for one item. `e2e/item-kits.spec.ts`: create/edit/delete a kit with one component, list text only (no totals or pricing). `src/lib/sale/sale-lib.test.ts` touches items only incidentally.
- Upstream coverage that has no target analogue (see §10): `ItemsControllerTest.php` (1419 lines, 46 tests), `ItemTest.php`, `ItemSearchTest.php` (21), `ItemBulkUpdateTest.php` (20), `ItemQuantityTest.php`, `ItemTaxesMultipleTest.php`, `ItemKitsControllerTest.php`, `Barcode_libTest.php`, `GetItemDataRowTest.php`.

### 9.14 Verdict summary

- **Critical:** CSV import (BOM breaks updates, no header/duplicate/attribute validation, per-location update bug, `_DELETE_` too broad); schema missing unique keys on quantities/taxes/kit items.
- **High:** item save cannot change item/stock type, cannot delete/restore and resurrects deleted items; search lacks location scoping, `low_inventory`, attribute search, sort/paging and leaks temp items; taxes drop 0 %; attributes are stored as TEXT only; bulk edit has no UI and no taxes; images lack validation and thumbnails; barcode `'number'` content is wrong, kit barcodes and generate-if-empty are missing; kits lack the linked item, totals and correct price-option constants; several entry points are session-only instead of module-granted.
- **Medium:** inventory history lacks the employee/remarks layout and the count-details dialog; the barcode sheet layout is approximate; kit delete/totals and list columns diverge.
- **Low:** CSV template filename/quoted headers; suggestion response shapes; `getItemIdByNumber` defect.

---

## 10. Implementation obligations

Each obligation names the target files to change, the data contract to hold, and acceptance tests. "Upstream
test" means the parity test that already exists in `/home/yash/ospos/tests` and should be mirrored (or used as the
specification) in the target; "new test" means a test that must be added because upstream has no direct analogue.

### OBL-01 — Item search contract

- **Files:** `src/lib/items/repository.ts` (`ItemSearchFilters`, `searchItems`), `src/app/(secure)/items/page.tsx`, `src/components/items/items-table.tsx`.
- **Contract:** - `ItemSearchFilters`: `searchText`, `stockLocationId`, `emptyUpc`, `lowInventory`, `isSerialized`, `noDescription`, `searchCustom`, `isDeleted`, `temporary`, `filters[]` (array of the seven filter keys), `startDate`, `endDate`, `sort`, `order`, `limit`, `offset`; return `{rows, total}` where `total` is computed with the identical predicates (including location and attribute joins).
  - Free text matches name, item_number, category, supplier company name, and item id (partial match permitted), and **must not** match description in the item-list search (decision required: upstream omits it; the target currently includes it — record whichever is chosen in the contract).
  - Location filter is applied to the item **set** via `item_quantities` for that location, not only the displayed quantity. `low_inventory` compares that location's quantity to `reorder_level`.
  - `noDescription` matches `description IS NULL OR description = ''` only if the divergence is accepted; strict parity is `description = ''`.
  - Default item types exclude `ITEM_TEMP`; `temporary` shows only temp items.
  - Sorting accepts the whitelist from §2.3 (including dynamic attribute ids and `quantity`); default `items.name ASC` with `quantity` summing across all locations when no location filter.
  - `searchCustom` implements the named-attribute grammar of §2.3, including unknown names degrading to free text.
- **Acceptance:** upstream `tests/Models/ItemSearchTest.php` (all 21 tests), `tests/Helpers/GetItemDataRowTest.php`; new unit tests for BOM-safe filter parsing and for `total` with a location filter; e2e filter round-trip.

### OBL-02 — Item identity resolution

- **Files:** `src/lib/items/repository.ts` (`getItemByIdOrNumber`, `getItemByNumber`, `getItemInfo`, `getInfoByIdOrNumber`, `getItemIdByNumber`, `itemNumberExists`, `exists`).
- **Contract:** - Numeric input without a leading zero resolves as `item_number OR item_id` in one query with `LIMIT 1` (document the tie-break; upstream is unspecified).
  - Leading-zero input resolves only as `item_number`.
  - `includeDeleted` defaults to **true** for `get_info_by_id_or_number` parity.
  - `getItemIdByNumber(itemNumber, ignoreDeleted = false, deleted = false)` returns null when not exactly one active/deleted row matches; fix the inverted condition at `repository.ts:499`.
  - `itemNumberExists` reads `allow_duplicate_barcodes`; ignores deleted rows; supports the zero-prefixed barcode exception; excludes the edited item.
- **Acceptance:** upstream `tests/Models/ItemTest.php` (item-number semantics), new tests for `00012345`, for a barcode colliding with a live item id, and for `allow_duplicate_barcodes = 1`.

### OBL-03 — Item save pipeline

- **Files:** `src/lib/items/repository.ts` (`SaveItemInput`, `saveItem`), `src/app/(secure)/items/actions.ts` (`ItemSchema`, `saveItemAction`), `src/app/(secure)/items/form-data.ts`, `src/components/items/item-form.tsx`.
- **Contract (all in one DB transaction, item + taxes + quantities + ledger + attributes):** - Inputs: `itemId?`, `name` (required, non-empty), `category` (required), `itemNumber` (optional; charset `^[A-Za-z0-9 .,\-_/&+%#*()!?@:;'"]*` equivalent to CI4 `alpha_numeric_punct` — choose the exact regex and test it), `description`, `costPrice`, `unitPrice`, `reorderLevel`, `receivingQuantity`, `allowAltDescription`, `isSerialized`, `stockType`, `itemType`, `taxCategoryId`, `qtyPerPack`, `packName`, `lowSellItemId`, `hsnCode`, `deleted`, `picFilename`, `taxes[]`, `quantities[{locationId, quantity}]`, `attributeValues`.
  - `receivingQuantity` 0 → 1 unless `ITEM_TEMP`; `packName` defaults to the localized `default_pack_name` when empty; `hsnCode` defaults to `''`; `lowSellItemId` defaults to the new item's own id (self-reference) and is persisted on both insert and update.
  - `ITEM_TEMP` forces `stockType = HAS_NO_STOCK`, `receivingQuantity = 0`, `reorderLevel = 0`, quantities 0.
  - Taxes: replace-all when the legacy tax mode is active; keep percent `0`; reject negatives; pair names/percent by position.
  - Quantities: write every location row; write a ledger row per location whenever the value changed **or** the item is new (delta 0 allowed), comment = localized `manually_editing_of_quantity`.
  - `deleted` is persisted (delete/restore through the form), never unconditionally false.
  - Duplicate `item_number` rejected using OBL-02.
- **Acceptance:** upstream `tests/Controllers/ItemsControllerTest.php:109-275` (tax-name/percent rules, save), new tests for delete/restore through the form, temp-item zeroing, `lowSellItemId` self-reference (insert and update), quantity ledger rows for a new item with 0 stock, and attribute replacement.

### OBL-04 — Delete / restore

- **Files:** `repository.ts` (`deleteItem`, `deleteItemList`, `undeleteItem`), items action/UI.
- **Contract:** one transaction: zero all quantity rows; set `deleted`; ledger correction based on the upstream rule. Decide explicitly between (a) strict parity: only the first location whose ledger sum is > 0 gets a negative adjustment (`Inventory.php:67-85`), or (b) corrected: every location with a positive ledger sum gets one. Whichever is chosen must be documented in the contract and covered by a test. `undelete` sets `deleted = false` only. Bulk delete uses one transaction and one `whereIn`, not N calls.
- **Acceptance:** new unit tests for one-location and two-location delete, for delete of an item with zero stock (no ledger row), and for undelete; e2e delete/restore once the UI exists.

### OBL-05 — Bulk edit

- **Files:** new `src/components/items/bulk-edit-form.tsx`, new route `/items/bulk-edit` (or a modal on the list), `actions.ts` (`bulkUpdateAction`), `repository.ts` (`filterBulkEditFields`, `updateMultiple`), `items-table.tsx` (selection + toolbar).
- **Contract:** whitelist exactly `Item::ALLOWED_BULK_EDIT_FIELDS` plus the `CLEAR_SUPPLIER_OPTION = 'NONE'` sentinel; absent/empty/non-scalar = leave alone; prices locale-parsed; reorder locale-parsed; booleans only `'0'`/`'1'`; supplier only `ctype_digit` or the sentinel; `updateMultiple` intersects the whitelist again before the SQL and applies one `UPDATE … WHERE item_id IN (...)`. Taxes: implement the **intended** behaviour (pair by index, save all items' taxes via delete+insert per item), not the upstream key bug; add a regression test that proves a tax row is actually written.
- **Acceptance:** upstream `tests/Models/ItemBulkUpdateTest.php` (20 tests, especially `testFilterBulkEditFields*` and `testUpdateMultipleIgnoresNonWhitelistedColumns`); new test that bulk tax edit persists rows for every selected item (this would fail against upstream's controller and must pass here); `tests/Controllers/ItemsControllerTest.php:160-255` validation cases.

### OBL-06 — Weighted-average cost price

- **Files:** `repository.ts` (`changeCostPrice`), `src/lib/receiving/receiving-model.ts`.
- **Contract:** - `oldTotalQty = SUM(item_quantities.quantity)` over quantity rows joined to `stock_locations.deleted = 0`.
  - `average = truncate4( itemsReceived*newPrice + oldTotalQty*oldPrice ) / totalQty`, where every multiplication and the division truncate to `max(2, currency_decimals + tax_decimals)` decimals using decimal arithmetic (integer minor units or a decimal library), **not** binary floats and **not** rounding.
  - Caller: only when `receiving_calculate_average_price` is enabled and the line price differs from the current cost; pass `quantity × receiving_quantity`, not `quantity`.
  - Must be invoked before the receiving quantity write (keep the current ordering).
  - Define behaviour for `totalQty = 0` (upstream divides by zero; recommend leaving cost unchanged and logging).
- **Acceptance:** replace/expand `src/lib/items/repository.test.ts:33-50`; cases: 10@10 + 10@20 → 15.0000; 3@10 + 7@11.1111 → 10.7777 (truncation, not 10.7778); negative/zero received; stock spread over two locations; call-order test proving the pre-update quantity is used.

### OBL-07 — Inventory adjustments and history

- **Files:** `repository.ts` (`adjustInventory`), `src/lib/inventory/index.ts`, `src/components/items/inventory-form.tsx`, `src/app/(secure)/items/[id]/inventory/page.tsx`.
- **Contract:** adjustment takes an absolute new quantity and a comment; validates finite number; writes the quantity row and the ledger delta in one transaction; exposes the ledger with location id, comment, employee id, signed delta, timestamp. History UI shows date, employee name, in/out quantity formatted with `quantity_decimals`, comment, and filters by location (server-side). Add the count-details dialog as a separate route/dialog if parity is required.
- **Acceptance:** new unit tests for delta ledger, no ledger row when the value is unchanged, negative results allowed; e2e adjust + history refresh; upstream `ItemQuantityTest` analogue for an atomic `changeQuantity` helper (see OBL-15).

### OBL-08 — CSV template and parser

- **Files:** `src/lib/csv/parse.ts`, `src/app/api/items/csv-template/route.ts` (or a shared `src/lib/csv/items-template.ts`).
- **Contract:** - Header array, in order: `Id, Barcode, Item Name, Category, Supplier ID, Cost Price, Unit Price, Tax 1 Name, Tax 1 Percent, Tax 2 Name, Tax 2 Percent, Reorder Level, Description, Allow Alt Description, Item has Serial Number, Image, HSN`, then `location_<allowed location name>` for each allowed location, then `attribute_<definition name>` for every definition name except the pseudo-entry `-1`.
  - BOM `EF BB BF` prepended to the download; parser strips a leading BOM before reading the header row.
  - Download filename: choose `import_items.csv` for parity (target currently `items_template.csv`).
  - Parser returns `string[][]`, skips blank rows, and must not throw on a row with a different column count (pad/truncate or report the row).
- **Acceptance:** upstream `tests/Controllers/ItemsControllerTest.php:302-431` (header generators, `get_csv_file`, BOM, required headers); new parser tests for BOM, CRLF, quoted commas, short/long rows.

### OBL-09 — CSV import pipeline

- **Files:** `src/app/api/items/csv-import/route.ts` (or move logic to `src/lib/csv/items-import.ts`).
- **Contract:** - Validate the header set against the template (§4.3); reject with the `csv_import_nodata_wrongformat` equivalent if any required column is missing.
  - Per row: `Id > 0` = update (must exist, else fail); `name`, `category`, `unit_price` required for inserts; `cost_price` defaults to 0 for inserts; numeric checks for cost/unit/reorder/supplier/tax percents/location columns; `item_number` charset; location column names must match allowed names exactly; attribute values validated by type (DROPDOWN membership, DECIMAL numeric, DATE locale parse).
  - Supplier existence → null when unknown.
  - Booleans: insert `''` → 0; update `''` → leave unchanged.
  - Barcode duplicate check with `allow_duplicate_barcodes` and the edited-row exclusion.
  - Quantities: per location column, set quantity and write a ledger row with `trans_inventory = column value`; new rows with an empty column get quantity 0 plus a ledger row of 0; update rows with an empty column are skipped. **Fix the target bug where the update is not scoped to the location.** - Taxes: save only name+percent with percent numeric and ≥ 0; a negative percent fails the row; blank tax columns leave existing taxes untouched.
  - Attributes: `_DELETE_` removes only that definition's links; typed storage per definition; replace the item's link for that definition instead of inserting a duplicate value/link.
  - `Image` column writes `pic_filename` verbatim.
  - Transaction policy: either whole-file rollback (upstream) or per-row with an accurate partial report — pick one and document it. The response contract must distinguish committed vs rolled-back rows.
  - Permission: require the `items` grant, not merely a session.
- **Acceptance:** upstream `tests/Controllers/ItemsControllerTest.php:527-1420` (all import tests); new tests for BOM round-trip of the target's own template, duplicate barcode, per-location isolation, `_DELETE_` scope, attribute dedupe, and the `Image` column.

### OBL-10 — Image upload, serving, removal

- **Files:** `actions.ts` (`saveUploadedPicture`, new `removeItemLogoAction`), `src/app/api/items/pic-thumb/[file]/route.ts`, `src/components/items/item-form.tsx`, `items-table.tsx`.
- **Contract:** - Server-side validation: magic-byte/MIME in `{png,jpeg,gif,webp}` (config `image_allowed_types` may narrow), size ≤ `image_max_size` KB, dimensions ≤ `image_max_width` × `image_max_height`, reject otherwise with a field error.
  - Store a sanitized random name with an extension derived from the validated MIME; record `<name>.<ext>` in `pic_filename`.
  - Thumbnail: generate a height-32 (max width 52) derivative on first request or at upload, cache on disk; serve the thumbnail; 404 when the source is missing; keep the basename + extension-whitelist traversal guard.
  - Remove: set `pic_filename = null` and delete the file (or document that the file is retained for parity); wire the remove button in the form.
  - Permission `items` on the thumb route; `Cache-Control: private`.
- **Acceptance:** new unit tests for validation rejections (SVG, oversize, oversized dimensions, non-image), filename sanitisation, traversal attempts (`..%2f`, `%2e%2e/`, absolute paths), 404, and remove; e2e upload + preview + remove.

### OBL-11 — Barcode value, types, generate-if-empty

- **Files:** `src/lib/barcode/index.tsx`, `src/app/(secure)/items/generate-barcodes/page.tsx`, `src/app/api/items/barcodes-pdf/route.ts`.
- **Contract:** - `barcode_content`: `'id'` → item id; any other value (including `'number'`) → `item_number` when non-empty, else `name`. Never fall back to the id for `'number'` unless the item number is empty.
  - Type map must preserve checksum variants (`C39+` ≠ `C39`, `I25+` ≠ `I25`, `MSI+` ≠ `MSI`, `S25+` ≠ `S25`).
  - Read `barcode_generate_if_empty`: if the intended upstream behaviour is "generate", define the generator (recommended: item id or a `MAX+1` sequence) and write `item_number`; otherwise document that the upstream feature is a no-op and keep only the read.
  - Load barcode items by explicit id list (a query by id), not by fetching 200 rows and filtering.
  - Add item-kit barcode generation (`KIT <id>`, forced C128 unless C39/C128, aggregate cost/unit).
- **Acceptance:** upstream `tests/Libraries/Barcode_libTest.php` (escaping), `tests/Controllers/ItemKitsControllerTest.php` (kit payload); new tests for `'number'` content, empty item_number fallback to name, checksum variants mapping, generate-if-empty on/off, and id-list completeness (>200 items).

### OBL-12 — Barcode sheet layout

- **Files:** `src/lib/barcode/index.tsx` (`displayBarcode`, `generateBarcodesPdf`), the preview page.
- **Contract:** rows per page = `barcode_num_in_row`; page width = `barcode_page_width` %; cell spacing = `barcode_page_cellspacing`; cell contains row1/row2/row3 with the configured columns; height = `barcode_height`; font family = configured font (fall back to a bundled font), font size = `barcode_font_size`. Row tokens: `not_show` → empty, `name`, `category`, `cost_price`, `unit_price`, `item_code` (number, or id when content is id), `company_name` (config company). Prefix labels with the localized `Items.category`/`Items.cost_price`/ `Items.unit_price` and format currency with `to_currency`; truncate to 40 characters.
- **Acceptance:** upstream `GetItemDataRowTest` is unrelated; use `Barcode_libTest` escaping tests plus new rendering tests that assert row selection per token, truncation, and grid counts for 1/2/3 items per row.

### OBL-13 — Item form parity

- **Files:** `src/components/items/item-form.tsx`, `src/app/(secure)/items/new/page.tsx`, `src/app/(secure)/items/[id]/page.tsx`, `actions.ts` (`ItemSchema`).
- **Contract:** - Item type radios (standard/kit/amount-entry/temp) with visibility rules: kit disabled without the `item_kits` grant; amount-entry only when `derive_sale_quantity = '1'`; temp only when the allow-temp context is active. `itemType` must be posted, not overwritten from the loaded record.
  - Stock type radios (stock/non-stock) that actually change the value; remove the `FormData.set("stockType", …)` override.
  - Category input must switch to a definition-backed dropdown when `category_dropdown = '1'`.
  - Tax defaults for new items from `default_tax_1_name/_rate`, `default_tax_2_name/_rate`; destination mode uses `default_tax_category` and a category autocomplete.
  - Multi-pack block (`qty_per_pack`, `pack_name`, `low_sell_item_name` + hidden id) only when `multi_pack_enabled = '1'`, with the low-sell autocomplete returning `{value,label}`.
  - `is_deleted` checkbox so delete/restore is reachable; a delete button as an alternative.
  - Image preview + remove.
  - Attribute editor: only `SHOW_IN_ITEMS` definitions (plus already-linked ones), GROUP skipped, DROPDOWN rendered as a select of definition values, DATE as a date input, DECIMAL as a locale number, CHECKBOX as hidden 0 + checkbox 1; removal deletes the link on save; empty text must not create an empty value row.
  - Client validation: name/category required, cost/unit numeric and non-negative, quantity/reorder numeric, tax percent non-negative; server enforces the same (`alpha_numeric_punct` for item number, tax name rules).
- **Acceptance:** upstream `tests/Controllers/ItemsControllerTest.php:109-275, 277-300` (tax name XSS/unicode, negative percent, attributes escaping); new component tests for each visibility rule and for a stock-type change round-trip; e2e: create kit-type item, create temp item, delete and restore, multi-pack pack name in the list.

### OBL-14 — Delete ledger rule decision

- **Files:** `src/lib/items/repository.ts` (`deleteItem`), `src/lib/inventory/index.ts` (`resetQuantity`).
- **Contract:** `resetQuantity` must be the single implementation used by both `deleteItem` and the inventory module. Choose and document:
  - strict parity: first location whose **ledger sum** is positive gets `-sum`;
  - corrected: every location whose ledger sum is positive gets `-sum`, or every quantity row gets `-quantity`. Whichever is chosen, the ledger must not double-correct across repeated deletes (upstream's sum-based rule is idempotent; a quantity-row-based rule is not).
- **Acceptance:** new tests for two-location delete, double delete, delete after a partial sale, and undelete. No upstream test exists; this is an explicit divergence point.

### OBL-15 — Atomic quantity delta helper

- **Files:** `src/lib/inventory/index.ts` (new `changeQuantity`), `src/lib/sale/sale-model.ts`, `src/lib/receiving/receiving-model.ts`, `repository.ts`.
- **Contract:** one SQL statement `INSERT … ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = quantity + delta` (requires the unique key from OBL-20). No floor guard (negative stock allowed). Returns a boolean and is used by sale completion, sale delete, and receiving delete.
- **Acceptance:** upstream `tests/Models/ItemQuantityTest.php` (decrement, negative result, two concurrent decrements both apply); plus a concurrency test in the target's style.

### OBL-16 — Item kits: link, totals, options

- **Files:** `src/lib/item_kits/repository.ts`, `src/app/(secure)/item_kits/actions.ts`, `src/components/item_kits/item-kit-form.tsx`, `src/app/(secure)/item_kits/new/[id]/page.tsx`, `src/app/(secure)/item_kits/page.tsx`, `src/lib/constants.ts`.
- **Contract:** - Persist `item_id` (the kits `kit_item_id`) from a kit-item picker (`items?item_type=ITEM_KIT` suggestions).
  - Compute and display `total_cost_price` = Σ(component cost × qty) and `total_unit_price` = base item unit price + per the price-option rule, then apply the discount (percent: round to `currency_decimals`; fixed: subtract).
  - Align `PRICE_OPTION` constants with upstream: `ALL=0`, `KIT=1`, `KIT_STOCK=2`; `PRINT_ALL=0`, `PRINT_PRICED=1`, `PRINT_KIT=2`; remove the extra `KIT_AND_STOCK`/`DO_NOT_PRINT`/`priceOption===3` interpretations or document them as an extension.
  - Component rows: sequence, quantity (locale-parsed), no duplicates; validate the item exists and is not a kit itself (choose a rule; upstream permits nesting).
  - Kit number duplicate check and search (`name`/`description`/number/`KIT ` prefix) plus suggestions.
  - Delete: components and kit in one transaction (target is already correct here) — record the divergence from upstream's orphan-leaving delete.
- **Acceptance:** upstream `tests/Controllers/ItemKitsControllerTest.php`, new unit tests for totals with each price option and discount type, for `KIT <id>` lookup, for duplicate numbers, and for component sequence ordering; e2e edit a kit and assert the displayed totals.

### OBL-17 — Kit sales pricing

- **Files:** `src/lib/sale/sale-lib.ts` (`addItemKit`), `src/lib/sale/types.ts` if price helpers change.
- **Contract:** for `PRICE_MODE_KIT`, a component is priced (and keeps its discount) only when the kit option is: `ALL`; `KIT` and the component is itself an `ITEM_KIT`; `KIT_STOCK` and the component is `HAS_STOCK`. Otherwise price and discount are 0. A zero price forces discount 0; a fixed discount is capped at the price and the remainder carried back to the caller's discount variable. Print option selected per §7.4.
- **Acceptance:** new unit tests per option and per component stock/item type; upstream `tests/Libraries/Sale_libPaymentTest.php` does not cover kits, so this is a new test area.

### OBL-18 — Permissions

- **Files:** every items/item-kits action and API route listed in §1.4.
- **Contract:** any entry point that reads or mutates item/kit data requires `requirePermission("items")` or `requirePermission("item_kits")`; the thumb, template, CSV, PDF, and suggestion routes included. Location lists and CSV location columns are scoped to the employee's allowed locations (`Stock_location::get_allowed_locations`). `permissions`/`grants` tables exist in the target schema (used by `rbac`), so this is implementable.
- **Acceptance:** new route-level tests: unauthenticated → 401/redirect; authenticated without the grant → 403 or `/no_access`; admin → 200; employee with a location grant sees only that location in the item form, the list filter, and the CSV template.

### OBL-19 — Config keys and defaults

- **Files:** `src/db/seed.ts`, `src/lib/config/tabs.ts`, `src/lib/barcode/index.tsx`, `page.tsx`, `repository.ts`.
- **Contract:** read (and seed to upstream defaults or document the chosen defaults for): `barcode_content`, `barcode_type` (store Picqer codes, not labels; migrate `'Code39'` → `'C39'`), `barcode_width`, `barcode_height`, `barcode_font`, `barcode_font_size`, `barcode_first_row`, `barcode_second_row`, `barcode_third_row`, `barcode_num_in_row`, `barcode_page_width`, `barcode_page_cellspacing`, `barcode_generate_if_empty`, `barcode_formats`, `allow_duplicate_barcodes`, `image_allowed_types`, `image_max_size`, `image_max_width`, `image_max_height`, `suggestions_first_column`, `suggestions_second_column`, `suggestions_third_column`, `multi_pack_enabled`, `category_dropdown`, `include_hsn`, `derive_sale_quantity`, `use_destination_based_tax`, `default_tax_category`, `default_tax_1_name`, `default_tax_1_rate`, `default_tax_2_name`, `default_tax_2_rate`, `receiving_calculate_average_price`, `quantity_decimals`, `tax_decimals`, `currency_decimals`, `currency_symbol`, `number_locale`, `thousands_separator`, `lines_per_page`, `date_or_time_format`.
- **Acceptance:** config-default test asserting the seed values match the documented choice; a test that `barcode_content = 'number'` uses the item number.

### OBL-20 — Schema integrity

- **Files:** `src/db/schema/items.ts`, new drizzle migration (sqlite + mysql).
- **Contract:** add `PRIMARY KEY (item_id, location_id)` (or a unique index) to `item_quantities`; `PRIMARY KEY (item_id, name, percent)` to `items_taxes`; a unique/primary key on `item_kit_items` (`item_kit_id, item_id` at minimum; upstream includes quantity, which is not a useful key — document the choice); an index on `items.item_number`; keep `inventory` append-only. Decide datetime representation: either keep epoch integers everywhere (and convert in the item search/date filters) or change `trans_date` to a text datetime for upstream parity. Whichever is chosen, the CSV/date-range/search code must use one representation.
- **Acceptance:** migration applies on a fresh SQLite DB and on the existing `ospos.db`; tests that duplicate quantity rows are rejected by the DB, and that `Item_quantity` upserts still work.

### OBL-21 — Count details / inventory history UI

- **Files:** new `src/app/(secure)/items/[id]/count-details/page.tsx` (or a dialog component), `inventory/page.tsx`, `repository.ts` (`getInventoryHistory`), new `getInventoryEmployees` join.
- **Contract:** per location: current quantity and a ledger table with date, employee name, signed in/out quantity formatted with `quantity_decimals`, and remark. Location selector filters server-side. Link from the item list (`stock` icon) and the inventory page.
- **Acceptance:** new e2e: adjust quantity, open count details, see one row with the delta and the employee name; location switch changes the rows.

### OBL-22 — Suggestions API shape and semantics

- **Files:** `repository.ts` (`get_search_suggestions` equivalent), `src/app/api/items/*-suggest/route.ts`, sales/receiving actions that consume them.
- **Contract:** return `[{value?: number|string, label: string}]`; item suggestions = name, number, category, supplier and (when enabled) description; low-sell restricted to stocked, non-deleted items and name-only search; kit suggestions restricted to `items.item_type = ITEM_KIT`; multi-pack appends `' | ' + pack_name` to name labels; cost/unit price formatted with `to_currency_no_money` when configured as label columns. Apply `suggestions_*_column` with the allow-list.
- **Acceptance:** new unit tests per suggestion family, including the multi-pack label and the allowed-column sanitisation (upstream `tests/Models/ItemTest.php:31-72` asserts the constants only; add behavioural tests).

### OBL-23 — CSV export (new feature, not parity)

- **Files:** new `src/lib/csv/items-export.ts` + route.
- **Contract:** if implemented, export the same columns as the template with real values (Id, barcode, name, category, supplier id, prices, taxes, reorder, description, booleans, image, HSN, per-location quantities, attributes); quote per RFC 4180; prepend the BOM; never include formula-leading cells unescaped (`'` prefix).
- **Acceptance:** round-trip test: export → import → identical item/quantity/tax/attribute state.

### OBL-24 — Regression tests to port

Add unit tests (vitest) mirroring these upstream files, adapted to the target's in-memory SQLite harness:

| Upstream file | Area | Target location |
|---|---|---|
| `tests/Models/ItemSearchTest.php` (21) | search filters, named attributes, sort, pagination, deleted/temp | `src/lib/items/search.test.ts` |
| `tests/Models/ItemBulkUpdateTest.php` (20) | whitelist, filter, sentinel, zero values | `src/lib/items/bulk-edit.test.ts` |
| `tests/Models/ItemQuantityTest.php` (3) | atomic delta, negative stock, concurrency | `src/lib/inventory/quantity.test.ts` |
| `tests/Models/ItemTaxesMultipleTest.php` (3) | `getInfoMultiple` grouping, empty input | `src/lib/items/taxes.test.ts` |
| `tests/Models/ItemTest.php` (6) | suggestion constants, `getMultipleInfo` null location | `src/lib/items/repository.test.ts` |
| `tests/Controllers/ItemsControllerTest.php` (46) | tax validation, CSV generators/parser/import, attributes | `src/lib/items/form-validation.test.ts`, `src/lib/csv/*.test.ts` |
| `tests/Controllers/ItemKitsControllerTest.php` (2) | kit barcode payloads | `src/lib/item_kits/barcode.test.ts` |
| `tests/Libraries/Barcode_libTest.php` (6) | row escaping | `src/lib/barcode/rows.test.ts` |
| `tests/Helpers/GetItemDataRowTest.php` (4) | tax map, attribute expansion, pack name | `src/components/items/row.test.ts` |

### OBL-25 — Data contracts (TypeScript shapes to standardise)

```ts
// Search
interface ItemSearchFilters {
  searchText?: string; stockLocationId?: number;
  filters?: Array<"empty_upc"|"low_inventory"|"is_serialized"|"no_description"|"search_custom"|"is_deleted"|"temporary">;
  startDate?: string; endDate?: string;
  sort?: string; order?: "asc"|"desc"; limit?: number; offset?: number;
}
interface ItemListRow extends ItemRow {
  quantity: number | null;      // null when no location filter (upstream MAX() over left join)
  taxPercents: string;          // "-" or "8.00%, 5.00%"
  taxCategory: string | null;
  attributeValues: Record<number, string>;  // typed columns merged, DECIMAL formatted
  companyName: string | null;
}

// Save
interface SaveItemInput {
  itemId?: number; name: string; category: string; supplierId: number | null;
  itemNumber: string | null; description: string | null;
  costPrice: number; unitPrice: number; reorderLevel: number; receivingQuantity: number;
  allowAltDescription: boolean; isSerialized: boolean; stockType: 0|1; itemType: 0|1|2|3;
  taxCategoryId: number | null; qtyPerPack: number; packName: string | null;
  lowSellItemId: number | null; hsnCode: string; deleted: boolean;
  picFilename?: string | null;
  taxes?: Array<{ name: string; percent: number }>;
  quantities?: Array<{ locationId: number; quantity: number }>;
  attributeValues?: Record<number, string | null>;
  employeeId: number;
}

// Barcode
interface BarcodeConfig {
  content: "id" | "number"; type: string; height: number; width: number;
  font: string; fontSize: number;
  firstRow: RowToken; secondRow: RowToken; thirdRow: RowToken;
  numInRow: number; pageWidth: number; pageCellspacing: number;
  generateIfEmpty: boolean; formats: string[];
}
type RowToken = "not_show"|"name"|"category"|"cost_price"|"unit_price"|"item_code"|"company_name";

// Item kit
interface ItemKitInput {
  itemKitId?: number; itemKitNumber: string | null; name: string; description: string | null;
  itemId: number | null; kitDiscount: number; kitDiscountType: 0|1;
  priceOption: 0|1|2; printOption: 0|1|2;
  items: Array<{ itemId: number; quantity: number; kitSequence: number }>;
}
```

---

## 11. Unknowns and open questions

1. **CI4 empty-upload semantics.** Whether editing an item without choosing a file yields `getFile() === null` (no validator error) or an `UploadedFile` with `UPLOAD_ERR_NO_FILE` (validator error → rollback) depends on `IncomingRequest::getFile`, not vendored in `/home/yash/ospos`. Controller tests post without files and expect success; browser behaviour is unverified. Treat "no file" as "keep existing image" (target already does).
2. **`bcscale` outside the app.** `app/Events/Load_config.php:44` sets `bcscale(max(2, totals_decimals()+tax_decimals()))`; CLI/test bootstraps may not fire it. Tests save/restore `bcscale` explicitly (`Sale_libPaymentTest.php:31-37`). Production truncation scale is 4 by default but configurable; a port must read `currency_decimals + tax_decimals`.
3. **`get_found_rows` with grouping.** `countAllResults()` on a builder with `GROUP BY items.item_id`; CI4's generated SQL (subquery vs plain COUNT) was not inspected. Upstream `testGetFoundRowsMatchesActualCount` passes, so the total equals the group count; re-verify per dialect.
4. **`item_id = 0` inside CSV import.** `array_filter` keeps `'0'`, so a new row reaches the insert with `item_id = 0`. MySQL auto-increments; SQLite may store 0. Upstream CSV tests pass `item_id => null`, so the controller path is not asserted. Omit `itemId` for inserts.
5. **`Item_kit::get_info` string id comparison.** Integer PK compared to a string parameter ORed with the number column; MySQL coercion of `'KIT 1'` varies by version. Controllers pass numeric ids, limiting the risk to `is_valid_item_kit`/register lookups.
6. **Date-range semantics of `date_or_time_format`.** Undocumented; only controls `rawurldecode` and the `DATE_FORMAT` wrapper. The target has no date filter, so the intended UX is unverified.
7. **`Item::getInfo` attribute concatenation.** Missing sale/receiving filters can leak sale-time links into the `GROUP_CONCAT`s; no test asserts contents, and the form re-queries links via `get_attributes_by_item` (filtered). Confirm whether the concatenated fields are used beyond the form contract.
8. **Legacy `barcode_type = 'Code39'`.** Whether an install has `'C39'` (saved via config UI) or the label (never saved) depends on history; a read-time mapping is needed either way. Target seeds `'C128'`.
9. **Image `max_dims` behaviour.** Requires GD/Imagick; exact error text and behaviour for animated GIFs or EXIF-rotated JPEGs is untested upstream.
10. **Kit delete orphan rows.** Upstream leaves `item_kit_items` after deleting a kit; no test shows whether reports or number-based lookups break. Target cascade-deletes; decide whether parity requires the orphans.
11. **CSV `Image` trust.** The column is copied verbatim, so it can point at another item's file or contain glob metacharacters interpreted by the thumbnail route's `glob()`. Untested upstream; decide on sanitisation.
12. **Amount-entry arithmetic.** `derive_sale_quantity` only gates the radio; the "type the total" behaviour lives in `register.php:224-231` and `Sale_lib::edit_item` (1268-1291). The quantity-from-total arithmetic is outside this scope; the sales report must cover it.
13. **Multi-pack low-sell conversion.** Only `low_sell_item_id` storage is in scope; pack→low-sell conversion and `qty_per_pack` arithmetic live in sales code, and upstream has no cycle guard (`A → B → A`) and no test.
14. **Target MySQL support.** Every item repository function calls `getDbSync()`, which throws for `DB_DRIVER=mysql` (`src/lib/db/index.ts:29-34`) while MySQL migrations exist (`drizzle/mysql/0000_demonic_darkstar.sql`). The port is SQLite-only in practice; MySQL parity is unstated.
15. **Shipped database state.** `ospos.db`/`sqlite.db` may not match current migrations and may already contain duplicate `item_quantities` rows; adding unique keys could fail on shipped data. Not inspected.

---

*End of report. Scope covered: routes, model semantics, inventory/quantities, CSV, images, barcodes, kits, form
behaviour, target gaps, obligations, and unknowns. No source files were modified.*

