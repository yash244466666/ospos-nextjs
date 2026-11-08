# 05 — Attribute EAV Subsystem: Upstream Behaviour and Target Parity Analysis

- **Upstream (source of truth):** `/home/yash/ospos` — OSPOS 3.4.3, commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`.
- **Target:** `/home/yash/Desktop/yash/ospos-nextjs` — Next.js 16 + Drizzle port (SQLite primary, MySQL secondary schema).
- **Scope:** attribute definitions, values, links; item/sale/receiving integration; CSV; UI; target gaps; implementation obligations.
- **Method:** every upstream method in `app/Models/Attribute.php` read in full; controller, helper, views, migrations, model integration and tests read directly; target files read directly. Nothing in this document has been implemented.

---

## 0. Executive summary

1. Upstream is a three-table EAV: `attribute_definitions` (typed definition, optional GROUP parent, visibility bit flags), `attribute_values` (one of three typed columns), `attribute_links` (polymorphic link to item / sale / receiving; `NULL item_id` = dropdown option).
2. The 3.4.3 UI has **no attribute modal in sales or receivings**. Attributes are edited only on the item form. At sale/receiving save time, item-level links are **copied** into `sale_id` / `receiving_id` rows (`app/Models/Sale.php:680`, `app/Models/Receiving.php:184`), and displayed in cart/receipts (`app/Views/sales/register.php:186`, `app/Views/receivings/receiving.php:139`). The task premise "sale/receiving attribute modal" does not exist in this commit.
3. Upstream has elaborate definition-type conversion machinery (`TEXT`→`DATE`/`DECIMAL`/`DROPDOWN`/`CHECKBOX`, `DROPDOWN`→`CHECKBOX`, everything else silently allowed) with data validation, value re-linking, shared checkbox `0`/`1` rows, and orphan cleanup. The target has **none** of it.
4. Upstream `attribute_values` is globally unique per typed column and values are **shared** between items (text "Red" is one row for all items). The target inserts one `attribute_values` row per item edit and has no uniqueness at all — a fundamental data-model divergence.
5. The target's sale integration is a stub that writes `attribute_links(attribute_id=NULL, definition_id=0, item_id, sale_id)` inside a swallowed `try/catch` (`src/lib/sale/sale-model.ts:168-175`). Receiving has no attribute code at all (`src/lib/receiving/` contains zero "attribute" references).
6. The target's `getAttributesByItem` returns objects keyed `attributeValue`, but the item edit page reads `a.value` (`src/app/(secure)/items/[id]/page.tsx:20` vs `src/lib/attributes/repository.ts:125-136`) — item attributes never prefill.
7. Dialect parity is broken twice: SQLite has no unique constraints/FKs for attributes (`src/db/schema/attributes.ts`), and the MySQL generated column is `CONCAT(definition_id,'-',item_id)` unconditionally (`src/db/schema/mysql/index.ts:319-323`), so sale/receiving rows collide instead of being `NULL`.
8. CSV import only partially mirrors upstream: no validation of DROPDOWN/DECIMAL/DATE values, `_DELETE_` deletes *all* links instead of the named definition's link, DECIMAL/DATE rows are written to the wrong column and never reused, and no per-definition replace happens.
9. Upstream has **no dedicated `AttributeTest`** or `AttributesControllerTest`; attribute behaviour is covered indirectly by `tests/Controllers/ItemsControllerTest.php` (CSV `_DELETE_`, text/dropdown import), `tests/Models/ItemSearchTest.php` (named-attribute search), `tests/Helpers/GetItemDataRowTest.php` (display expansion) and `tests/Support/ItemSearchFixtureTrait.php` (EAV fixture helpers). The target has only `e2e/attributes.spec.ts` (definition CRUD) and no unit tests.

---

## 1. Data model (upstream)

### 1.1 Physical schema

Created by `app/Database/Migrations/sqlscripts/3.3.0_attributes.sql`:

| Table | Columns | Notes |
|---|---|---|
| `attribute_definitions` | `definition_id INT(10) AUTO_INCREMENT PK`, `definition_name VARCHAR(255) NOT NULL`, `definition_type VARCHAR(45) NOT NULL`, `definition_flags TINYINT(4) NOT NULL`, `definition_fk INT(10) NULL`, `deleted TINYINT(1) NOT NULL DEFAULT 0` | lines 2-11; `KEY definition_fk`; self-FK `fk_ospos_attribute_definitions_ibfk_1` (`definition_fk` → `definition_id`), line 37-38 |
| `attribute_values` | `attribute_id INT AUTO_INCREMENT PK`, `attribute_value VARCHAR(255) UNIQUE NULL`, `attribute_datetime DATETIME NULL` | lines 14-19; `attribute_datetime` renamed to `attribute_date DATE NULL` by `3.3.0_fix_attribute_datetime.sql:1` |
| `attribute_links` | `attribute_id INT NULL`, `definition_id INT NOT NULL`, `item_id INT NULL`, `sale_id INT NULL`, `receiving_id INT NULL` | lines 22-34; five plain indexes; `UNIQUE attribute_links_uq1 (attribute_id, definition_id, item_id, sale_id, receiving_id)` |

Additional columns added later:

- `attribute_decimal DECIMAL(7,3) DEFAULT NULL AFTER attribute_datetime` and `definition_unit VARCHAR(16) DEFAULT NULL AFTER definition_type` (`3.3.0_decimal_attribute_type.sql:1-5`).
- `definition_flags` narrowed to `tinyint(1) NOT NULL`; indexes on `definition_name` and `definition_type` (`3.4.0_database_optimizations.sql:6-8`).
- `UNIQUE(attribute_date)` and `UNIQUE(attribute_decimal)` on `attribute_values` (`3.4.0_database_optimizations.sql:2-3`).

Final effective uniqueness on `attribute_values`: one unique key on `attribute_value` (from CREATE TABLE), one on `attribute_date`, one on `attribute_decimal`. Because MySQL unique indexes permit multiple `NULL`s, a DATE row and a TEXT row coexist freely; only same-typed values collide.

### 1.2 `attribute_links` NULL semantics (critical)

- `item_id NOT NULL AND sale_id IS NULL AND receiving_id IS NULL` → attribute assigned to an item (the canonical current value).
- `item_id IS NULL AND sale_id IS NULL AND receiving_id IS NULL` → **dropdown option** ("definition values" pool). Multiple rows per definition are legal.
- `item_id NOT NULL AND sale_id NOT NULL` → historical snapshot of an item's attributes for a sale.
- `item_id NOT NULL AND receiving_id NOT NULL` → historical snapshot for a receiving.
- `attribute_id` is nullable only for legacy rows created by the 3.3.0 custom-field migration (`3.3.0_attributes.sql:70-89` inserts links before values are attached).

The link-scope convention is relied on everywhere: almost every read adds `sale_id IS NULL AND receiving_id IS NULL` for "current" item attributes (`Attribute.php:94-95`, `209-211`, `327`, `693-695`, `724-727`, `745-746`).

### 1.3 Unique constraints on `attribute_links` (full migration history)

| Migration | Effect |
|---|---|
| `20181015100000_attributes` → 3.3.0 SQL | `uq1(attribute_id, definition_id, item_id, sale_id, receiving_id)` |
| `20210422000001_remove_duplicate_links.php` | De-duplicates item links (`item_id, definition_id, attribute_id`, sale/receiving NULL) by delete+`saveAttributeLink` (lines 34-55) |
| `20240826000000_fix_duplicate_attributes.php` | De-dupes one row per `(item_id, definition_id)` keeping `MIN(attribute_id)` (lines 40-65); drops all 5 FKs; runs 3.4.0 SQL |
| `3.4.0_attribute_links_unique_constraint.sql` | Adds `generated_unique_column VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN sale_id IS NULL AND receiving_id IS NULL AND item_id IS NOT NULL THEN CONCAT(definition_id,'-',item_id) ELSE NULL END) STORED`, `UNIQUE attribute_links_uq3`; re-adds FKs 1/2 as `ON DELETE RESTRICT`, 3/4/5 plain (lines 3-16) |
| `20250213000000_fix_attributes_cascading_delete.php` | Drops `uq3` and the generated column (lines 19-20); re-adds FKs 1/2 as `ON DELETE CASCADE` (lines 22-25) |
| `20250519000000_MigrationOptimizationIndices.php` | Adds `UNIQUE attribute_links_uq2 (item_id, receiving_id, sale_id, definition_id, attribute_id)` (lines 20-30) |
| `20250522000000_AttributeLinksUniqueConstraint.php` | Drops FKs 1/2, drops the column if present, runs 3.4.1 SQL (lines 16-24) |
| `3.4.1_attribute_links_unique_constraint.sql` | Re-adds the same generated column + `uq3`; re-adds FKs 1/2 as `ON DELETE RESTRICT` (lines 4-14) |
| `20260405000000_Mysql84Utf8mb4Conversion.php` → `3.4.3_mysql84_utf8mb4_conversion.sql:4-6` | Converts all three attribute tables to `utf8mb4` / `utf8mb4_unicode_520_ci` (case-insensitive comparison is preserved) |

**Final state:** the effective uniqueness for current item attributes is one link per `(definition_id, item_id)` via `uq3`; rows for sales/receivings and dropdown options have `generated_unique_column = NULL` and are therefore *not* constrained (MySQL allows many NULLs). `uq2` is practically inert because it contains nullable columns. FKs: definition/value `RESTRICT`, receiving `CASCADE` (from `3.3.2_modify_attr_links_constraint.sql:4-8`), item/sale plain (RESTRICT-like).

Consequences:
- Deleting a receiving hard-deletes its `attribute_links` rows (cascade) — `Receiving::delete_value` only deletes `receivings_items` + `receivings` (`app/Models/Receiving.php:249-256`), relying on the cascade.
- Deleting a sale does **not** delete links (sale is soft-cancelled, `app/Models/Sale.php:866`), so historical sale attributes survive cancellation.
- `Sale::clear_suspended_sale_detail` (`app/Models/Sale.php:1366-1393`) deletes `sales_items` etc. but **not** `attribute_links`; stale `sale_id` link rows can remain when a suspended sale is re-saved.

### 1.4 Target schema

SQLite (`src/db/schema/attributes.ts:4-27`, materialised in `drizzle/sqlite/0000_skinny_power_man.sql:153-179`):

- `attribute_definitions`: `definition_id` PK autoincrement, `definition_name` NOT NULL, `definition_type` text enum, `definition_unit` text, `definition_flags` integer NOT NULL default 0, `definition_fk` integer, `deleted` boolean default false.
- `attribute_values`: `attribute_id` PK, `attribute_value` text, `attribute_date` text, `attribute_decimal` **real**.
- `attribute_links`: `attribute_id` FK → values (no action), `definition_id` FK NOT NULL → definitions (no action), `item_id` FK → items **ON DELETE CASCADE**, `sale_id`, `receiving_id`; no PK, no unique index.

MySQL (`src/db/schema/mysql/index.ts:294-323`, materialised in `drizzle/mysql/0000_demonic_darkstar.sql:7-34`):

- `attribute_values`: `attribute_value` `text` (no unique, no length), `attribute_date varchar(255)` (not DATE), `attribute_decimal decimal(15,4)` (upstream `7,3`).
- `attribute_links`: `generated_unique_column varchar(255) GENERATED ALWAYS AS (CONCAT(definition_id,'-',item_id)) STORED` with `UNIQUE attribute_links_generated_unique_column_idx` — **no CASE guard**.
- FKs: attribute→values no action, definition→definitions no action, item→items cascade; no FK for `sale_id`/`receiving_id`.

### 1.5 Data-model divergences (summary)

| Aspect | Upstream | Target |
|---|---|---|
| `attribute_value` unique | yes, case-insensitive collation | none (SQLite) / none (MySQL text) |
| `attribute_date` unique | yes, DATE type | none, `text` / `varchar(255)` |
| `attribute_decimal` unique | yes, DECIMAL(7,3) | none, `real` / `decimal(15,4)` |
| link uniqueness | `uq1`, `uq2`, generated `uq3` one-per-definition-per-item | none (SQLite); unconditional generated unique (MySQL) |
| link FKs | definition/value RESTRICT, receiving CASCADE, item/sale plain | item CASCADE; no sale/receiving FKs |
| `definition_flags` default | NOT NULL, no default; upstream controller always supplies | default 0 |
| `definition_unit` | VARCHAR(16) | text / varchar(255) |

---

## 2. Constants and type system

`app/Config/Constants.php:97-105`:

```
GROUP = 'GROUP'; DROPDOWN = 'DROPDOWN'; DECIMAL = 'DECIMAL';
DATE = 'DATE'; TEXT = 'TEXT'; CHECKBOX = 'CHECKBOX';
NO_DEFINITION_ID = 0; CATEGORY_DEFINITION_ID = -1;
DEFINITION_TYPES = [GROUP, DROPDOWN, DECIMAL, TEXT, DATE, CHECKBOX];
```

`app/Models/Attribute.php:41-44`:

```
SHOW_IN_ITEMS = 1; SHOW_IN_SALES = 2; SHOW_IN_RECEIVINGS = 4; SHOW_IN_SEARCH = 8;
```

Type → column mapping (`app/Helpers/attribute_helper.php:12-20`): `DATE => attribute_date`, `DECIMAL => attribute_decimal`, everything else (TEXT, DROPDOWN, CHECKBOX, GROUP) => `attribute_value`. Allowed storage columns are validated by `validateAttributeValueType()` (`attribute_helper.php:28-35`), which throws `InvalidArgumentException` for anything outside `['attribute_value','attribute_decimal','attribute_date']`.

Other constants used: `NEW_ENTRY = -1`, `ACTIVE = 0`, `DELETED = 1` (`Constants.php:87-91`), `NOW = time()` (`Constants.php:46`).

Target constants: `src/lib/attributes/repository.ts:5-10` defines the same type list (different order: `... "CHECKBOX", "GROUP"`) and only flags `SHOW_IN_ITEMS = 1`, `SHOW_IN_SALES = 2`, `SHOW_IN_RECEIVINGS = 4` — **`SHOW_IN_SEARCH = 8` is absent**.

---

## 3. Definition CRUD (upstream)

### 3.1 Read paths

- `exists($definition_id, $deleted = false)` — `Attribute.php:74-81`; counts rows with `definition_id` and `deleted = $deleted`.
- `getAttributeInfo($definition_id)` — `145-167`; left-joins parent definition to expose `definition_group` (parent `definition_name`). On miss returns an empty `stdClass` with every field of `attribute_definitions` set to `''` (`getFieldNames`).
- `search($search, $rows, $limit_from, $sort = 'definition.definition_name', $order = 'asc')` — `172-197`; LIKE on `definition_name` OR `definition_type`, `deleted = 0`, dynamic order, optional limit. Sorting is sanitised through `sanitizeSortColumn(attribute_definition_headers(), ..., 'definition_id')` (`Controllers/Attributes.php:46`; helper `Secure_Controller.php:76-89`).
- `get_total_rows()` / `get_found_rows()` — `355-369`.
- `getDefinitionByName($name, $type = false)` — `582-594`; first non-deleted row, optionally type-constrained. Used by CSV import.
- `getDefinitionNames(bool $groups = true)` — `300-314`; all non-deleted definitions ordered by `definition_name ASC`, excluding GROUP when `$groups = false`; returns `[-1 => lang('Common.none_selected_text')] + (definition_id => definition_name)`. The `-1` sentinel is removed for CSV headers (`importfile_helper.php:40`).
- `getDefinitionsByFlags(int $flags, bool $include_types = false)` — `270-292`; `WHERE (definition_flags & $flags)` (ANY bit set, raw SQL), `deleted = 0`, `definition_type <> GROUP`, order `definition_id ASC`. With `$include_types = true` returns `[definition_id => ['name' => ..., 'type' => ...]]`; otherwise `[definition_id => definition_name]`.
- `getDefinitionsByType($type, $definition_id = 0)` — `249-263`; `definition_type = $type`, `deleted = 0`, `where('definition_fk')` (single-argument CI4 predicate, see Unknowns U1), excludes the current `definition_id` unless it is `CATEGORY_DEFINITION_ID`. Used to populate the Group selector; returns `definition_id => definition_name`.
- `getDefinitionValues($definition_id)` — `320-337`; only for `definition_id > 0` or `= -1`; joins `attribute_links` → `attribute_values` where `item_id IS NULL`, ordered by `attribute_value ASC`; returns `[attribute_id => attribute_value]`. This is both the dropdown-option pool and the category pool.
- `get_attributes_by_item($item_id)` — `205-218`; definitions inner-joined to item-level links (`sale_id/receiving_id NULL`, `deleted = 0`), ordered by `definition_name ASC`, keyed by `definition_id`.
- `get_values_by_definitions(?array $definition_ids)` — `224-242`; returns definition rows whose `definition_fk` is one of the keys OR whose `definition_id` is one of the keys (`229-232`), type != GROUP, `deleted = 0`, keyed by `definition_id`. This is what expands a selected GROUP into its child definitions in the item editor.
- `get_attributes_by_definition($definition_id)` — `1160-1168`; all link rows for a definition joined to values (used by conversion).
- `get_suggestions($definition_id, $term)` — `847-865`; DISTINCT `attribute_value, attribute_id` joined through links/definitions, `deleted = 0`, `definition_id` filter, LIKE term, ordered by value; returns `[['value' => attribute_id, 'label' => attribute_value], ...]`.
- `get_attribute_values($item_id)` — `811-821`; declared with a TODO ("Is this function used anywhere?"); it is **not called anywhere** in the repository.

### 3.2 Create

`saveDefinition(array &$definitionData, int $definitionId = NO_DEFINITION_ID)` — `Attribute.php:528-573`:

1. `transStart()`.
2. If `definitionId === 0` **or** the row does not exist as non-deleted:
   - if it exists as deleted (`exists($definitionId, true)`), `undelete($definitionId)` only — **the supplied data is ignored**;
   - else `insert($definitionData)`; then `definitionData['definition_id'] = $definitionId !== CATEGORY_DEFINITION_ID ? insertID() : $definitionId`.
     The controller explicitly puts `definition_id = -1` into the data (`Controllers/Config.php:434-438`), so the category definition is inserted with PK `-1`.
3. Else (update) — see 3.3.
4. `transComplete()`; return `$success & transStatus()`.

Controller `postSaveDefinition` (`Controllers/Attributes.php:112-190`):

- `definition_flags`: POST `definition_flags[]` array; OR-ed with `|=` (numeric strings); missing → `0`.
- `definition_group` POST is validated by `validateDefinitionGroup` (`199-216`): `''`/`null` → `null`; otherwise cast to int; must be `> 0`, non-deleted, and `definition_type === GROUP`; else returns `false` and the controller responds `{success:false, message: lang('Attributes.definition_invalid_group'), id: NEW_ENTRY}`.
- `definition_unit`: `null` when empty string.
- `definition_type`: POST is an **index into `DEFINITION_TYPES`** (`DEFINITION_TYPES[$this->request->getPost('definition_type')]`), i.e. `0=GROUP, 1=DROPDOWN, 2=DECIMAL, 3=TEXT, 4=DATE, 5=CHECKBOX`.
- For **new** definitions only, POST `definition_values` must be a JSON array of strings; otherwise `{success:false, message: lang('Attributes.definition_error_adding_updating', [name]), id: NEW_ENTRY}`. On success, each value is saved with `saveAttributeValue($value, $definition_data['definition_id'])` — default type `DROPDOWN` (`Attribute.php:882`), so option rows are inserted with a `NULL item_id` link.
- Responses: `{success:true, message, id}`; new id is the inserted definition id.

### 3.3 Update and type conversion

Update path (`Attribute.php:545-566`):

1. Select current `definition_type` (non-deleted row).
2. `update($definitionData)` (includes name, unit, flags, fk, type).
3. If `from_type !== to_type`, call `convert_definition_data($id, $from, $to)`. If it returns false: `transRollback()`; return false (controller reports `definition_error_adding_updating`).

`convert_definition_data` (`437-503`) matrix (**exact behaviour, including upstream failures**):

| from \ to | TEXT | DROPDOWN | DECIMAL | DATE | CHECKBOX | GROUP |
|---|---|---|---|---|---|---|
| TEXT | — | true (no data conversion) | conditional¹ | conditional¹ | true (shared 0/1 rewrite) | **false** (no branch sets success) |
| DROPDOWN | **false** (bug: `in_array` includes TEXT but no success assignment) | — | false | false | true (shared 0/1 rewrite) | false |
| DECIMAL | true | true | — | true | true | true |
| DATE | true | true | true | — | true | true |
| CHECKBOX | true | true | true | true | — | true |
| GROUP | true | true | true | true | true | — |

¹ TEXT→DATE/DECIMAL runs `check_data_validity` then `attribute_cleanup`; false → whole update rolled back.

Details:

- `check_data_validity($definition_id, TEXT, $to)` — `377-409`. Selects DISTINCT `attribute_value` of the definition joined through links. For every value it sets `$success = isValidDate($value)` or `valid_decimal($value)` (`app/Helpers/locale_helper.php:658-672`; date must round-trip the configured `dateformat`; decimal regex `^(\d*\.)?\d+$`). On invalid it logs `"Attribute_value: 'X' cannot be converted to $to. Affected Items: ..."`. **Bug:** `$success` is overwritten per row, so only the *last* row decides the return value; an earlier invalid value merely logs. Empty set returns `true`.
- `attribute_cleanup($attributes, $definition_id, $to_type)` — `1135-1152`. `transBegin()`; for each link row (`attribute_id, item_id, attribute_value, attribute_decimal, attribute_date`) calls `saveAttributeValue($attribute_value, $definition_id, false, $attribute_id, $to_type)` then `saveAttributeLink($item_id, $definition_id, $new_attribute_id)`. Note the 4th argument is inert (see 4.1). Finally `delete_orphaned_links($definition_id)`; `transCommit()`. Sale/receiving copy rows are processed too: `saveAttributeLink` only updates the item-level (sale/receiving NULL) link or inserts a new item-level one; historical rows keep their old `attribute_id`.
- TEXT/DROPDOWN→CHECKBOX — duplicated raw SQL (`452-471` and `477-494`):
  `UPDATE attribute_links links JOIN attribute_values vals ON vals.attribute_id = links.attribute_id SET links.attribute_id = IF((attribute_value IN ('false','0','') OR attribute_value IS NULL), <zero_id>, <one_id>) WHERE definition_id = <id>`.
  `<zero_id>/<one_id>` come from `checkbox_attribute_values()` (`509-523`): look up global value rows with `attribute_value = '0'`/`'1'` via `attributeValueExists('0')` (TEXT search) and, if missing, create them via `saveAttributeValue('0', $definition_id, false, false, CHECKBOX)` — which also creates a `NULL item_id` link for this definition.
- After any conversion (success or failure) `delete_orphaned_links($definition_id)` and `deleteOrphanedValues()` run (`500-501`).
- DATE/DECIMAL/CHECKBOX/GROUP → anything: no data movement at all. Old typed values remain in the old column; the widget for the new type reads a different column, so values visually disappear until re-entered.

Dropdown option lifecycle: there is **no inline option rename**. Options are added via `postSaveAttributeValue` and removed via `postDeleteDropdownAttributeValue` (section 4.4). Updating a definition does not receive `definition_values` (the form only posts it when `is_new`, `Views/attributes/form.php:225-232`).

### 3.4 Delete / undelete

- `deleteDefinition($id)` — `1025-1033`: `deleteAttributeLinksByDefinitionId($id)` then `UPDATE attribute_definitions SET deleted = 1`. All link rows (including sale/receiving history) are deleted; value rows are left orphaned (no `deleteOrphanedValues` call).
- `deleteDefinitionList(array $ids)` — `1039-1047`: same in bulk; controller `postDelete` (`Controllers/Attributes.php:288-298`) posts `ids`, responds with `definition_successful_deleted + count + definition_one_or_multiple` or `definition_cannot_be_deleted`.
- `deleteAttributeLinksByDefinitionId(int|array)` — `1054-1063`: `DELETE FROM attribute_links WHERE definition_id IN (...)` — no sale/receiving guard.
- `undelete($id)` — `1120-1126`: `UPDATE ... SET deleted = 0`. Not exposed by the UI; reachable only by posting an existing-but-deleted `definition_id` into `saveDefinition` (which then ignores the submitted field values).

### 3.5 GROUP semantics

- A GROUP definition is a container: `definition_fk` on other definitions points at it.
- GROUP definitions are excluded from `getDefinitionsByFlags` (`275`), from `get_values_by_definitions` (`231`), and from `get_definition_names(false)` (`307`).
- The definition form's Group selector lists GROUP definitions from `getDefinitionsByType(GROUP, $definitionId)` plus a `'' => none_selected_text` entry (`Controllers/Attributes.php:272-273`). The select is rendered for every definition type.
- Selecting a GROUP in the item editor causes `get_values_by_definitions` to include every definition whose `definition_fk` equals the group (`229-230`), i.e. the group expands into child attribute widgets.
- The definition manage table has a "Group" column showing the parent name via the `definition_group` alias (`tabular_helper.php:718`).
- GROUP visibility flags are irrelevant (`getDefinitionsByFlags` drops them; `get_link_values` drops GROUP links by `definition_type <> GROUP`).

---

## 4. Value and link CRUD (upstream)

### 4.1 `saveAttributeValue` — the core upsert

`Attribute.php:882-930`:

```
saveAttributeValue(string $attributeValue, int $definitionId,
                   int|bool $itemId = false, int|bool $attributeId = false,
                   string $definitionType = DROPDOWN): int
```

1. `$dataType = getAttributeDataType($definitionType)`.
2. If `DATE`, parse with the configured `dateformat`; on success rewrite to `Y-m-d`; on failure keep the raw string.
3. `transStart()`.
4. `$existingAttributeId = attributeValueExists($attributeValue, $definitionType)` — `114-140`:
   - DATE: convert via `dateformat` to `Y-m-d` (or raw on failure), search `attribute_date`.
   - DECIMAL: search `attribute_decimal` with the raw value.
   - default: search `attribute_value`.
   Returns the first `attribute_id` or `false`.
5. If an existing value row is found:
   - reuse it;
   - **case-only update:** if `$dataType === 'attribute_value'` and `strcasecmp($stored, $new) === 0` and `$stored !== $new`, rewrite the stored capitalization via `updateAttributeValue()`.
   Because `attribute_value` is unique under a CI collation, "exact but differently-cased" values map to the same row; this is how the system converges on the newest capitalization.
6. Else insert into the type's column and take `insertID()`.
7. If `$definitionId` is non-empty, `saveAttributeLink($itemId, $definitionId, $attributeId)`; if that fails → `transRollback()`, return `0`.
8. `transComplete()`; return `$attributeId`.

**Important:** the 4th parameter `$attributeId` is never read in the body. The item editor's hidden `attribute_ids[...]` mechanism (`Views/attributes/item.php:30,114-117`) and `attribute_cleanup`'s pass-through are therefore decorative. Existing-value reuse is driven solely by value equality.

`updateAttributeValue($attributeId, $dataType, $value)` — `1209-1235`:
1. update the named column of `attribute_values`;
2. count links where `attribute_id = ?` AND `definition_id = -1` (`CATEGORY_DEFINITION_ID`);
3. if any, `UPDATE items SET category = <new> WHERE category = <new>` — under the collation this rewrites all items whose category equals the new text ignoring case, so it re-capitalises `items.category` for category dropdown values.

`getAttributeValueByAttributeId($id, $dataType)` — `768-780`: validates the column via `validateAttributeValueType` and returns the column value or `null`.

### 4.2 `saveAttributeLink`

`Attribute.php:604-657`:

1. `if ($attributeId <= 0) return false;`
2. Normalise: `itemId = empty($itemId) ? null : $itemId`; same for attribute id.
3. `transStart()`; look up `definition_type` via `getAttributeInfo` (`''` when missing).
4. If `definition_type === DROPDOWN && $itemId === null` (dropdown option):
   - count existing links `(item_id NULL, definition_id, attribute_id, sale_id NULL, receiving_id NULL)`;
   - insert only if absent. This is the only path that permits multiple links per definition.
5. Otherwise:
   - if `attributeLinkExists($itemId, $definitionId)` (`90-105`: item link with sale/receiving NULL) → update that row's `attribute_id`;
   - else insert `{attribute_id, item_id, definition_id}`.
   The definition-level uniqueness is now also enforced by `attribute_links_uq3`.
6. `transComplete()`; return `transStatus()`.

Note `attributeLinkExists` with `$definition_id = false/0` checks "any item-level link with a non-null definition and a null attribute id" (`100-101`) — a legacy predicate.

### 4.3 `deleteAttributeLinks`

`Attribute.php:668-682`: deletes by `item_id` (+ optional `definition_id`) with `sale_id IS NULL AND receiving_id IS NULL`. Used by item save (delete-all-then-recreate) and CSV import (per-definition replace). It never touches sale/receiving rows.

### 4.4 `deleteDropdownAttributeValue($value, $definition_id)`

`Attribute.php:45-59`:

1. `$attribute_id = getAttributeIdByValue($value)` — `1174-1180`; selects by `attribute_value` **only**, no definition filter (first match).
2. `deleteAttributeLinksByDefinitionIdAndAttributeId($definition_id, $attribute_id)` — `1190-1198`; deletes only `sale_id IS NULL AND receiving_id IS NULL` links for that definition+attribute.
3. `DELETE FROM attribute_values WHERE attribute_value = ? AND attribute_id NOT IN (SELECT attribute_id FROM attribute_links)`.
   - Any same-text value row with no links at all is also deleted (no definition scoping).
   - If the option value is still used by an item for the definition, that link keeps the row alive, so the option disappears from the dropdown pool but the item keeps displaying the value.
   - Sale/receiving links are never removed.

Controller `postDeleteDropdownAttributeValue` (`Controllers/Attributes.php:89-103`) rejects non-string/empty values and returns `{success: bool}`. The form posts `{definition_id, attribute_value}` to `attributes/DeleteDropdownAttributeValue/` (`Views/attributes/form.php:163-166, 188-191`).

### 4.5 Orphan cleanup

- `delete_orphaned_links($definition_id)` — `1071-1093`: if the definition's type is not DROPDOWN, delete `attribute_links` where `item_id IS NULL` for that definition. (Dropdown option links are preserved; CHECKBOX/TEXT/etc. `NULL item` rows are removed.) Returns `transStatus()`.
- `deleteOrphanedValues()` — `1100-1115`: `DELETE FROM attribute_values WHERE attribute_id NOT IN (SELECT attribute_id FROM attribute_links)`. Global, unscoped. Called after every conversion, after item save (`Controllers/Items.php:1562`) and after a successful CSV import (`Controllers/Items.php:1256`), and by the 2021 optimisation migration (`20210422000000_database_optimizations.php:46`).
- Together they can delete shared `0`/`1` checkbox value rows when no item uses them.

### 4.6 Reads used by widgets

- `get_link_value($item_id, $definition_id)` — `689-700`: first item-level link row (`sale_id/receiving_id NULL`), used to preselect a dropdown by `attribute_id`.
- `get_link_values($item_id, $sale_receiving_fk, $id, $definition_flags)` — `709-733`:
  - `GROUP_CONCAT(attribute_value SEPARATOR ', ') AS attribute_values`;
  - `GROUP_CONCAT(DATE_FORMAT(attribute_date, <dateformat_mysql>) SEPARATOR ', ') AS attribute_dtvalues`;
  - joins values and definitions; `definition_type <> GROUP`; `deleted = ACTIVE`; `item_id = ?`;
  - if `$id` is non-empty: `WHERE <sale_id|receiving_id> = $id` **and** `WHERE (definition_flags & $definition_flags)` (ANY bit);
  - if `$id` empty: `WHERE sale_id IS NULL AND receiving_id IS NULL` **and no flags filter at all**.
  This powers the cart line text for sales/receivings and for receipts.
- `getAttributeValue($item_id, $definition_id)` — `740-755`: joins `attribute_values` → `attribute_links` where item-level; returns the row or an empty object with `attribute_id = NEW_ENTRY (-1)` (`getEmptyObject`, `787-804`).

### 4.7 `copy_attribute_links` (item → sale/receiving)

`Attribute.php:829-838`:

```
SELECT <item_id literal>, definition_id, attribute_id, <id literal>
FROM attribute_links
WHERE item_id = :item AND sale_id IS NULL AND receiving_id IS NULL
```
inserted batch-wise with `ignore(true)` into `attribute_links(item_id, definition_id, attribute_id, <sale_id|receiving_id>)`.

- Called once per cart line inside the save transaction, **unconditionally** (not gated on stock type): `app/Models/Sale.php:680` and `app/Models/Receiving.php:184`.
- Copy includes links whose `attribute_id` is NULL (legacy rows).
- Because only item-level rows are copied, later edits to the item do not alter historical sale/receiving rows.

---

## 5. Categories (`CATEGORY_DEFINITION_ID = -1`)

- Category dropdown is a configuration toggle (`category_dropdown`). When enabled, `Config::postBatchSave` sends `definition_name = 'ospos_category'`, `definition_type = 'DROPDOWN'`, `definition_flags = 0`, `definition_id = -1`, `deleted = 0` into `saveDefinition(..., -1)` (`app/Controllers/Config.php:430-437`). Disabling calls `deleteDefinition(-1)` (`app/Controllers/Config.php:438-439`).
- `getDefinitionValues(-1)` returns the category option pool (`Attribute.php:324`).
- Item form: when `category_dropdown === '1'`, `$categories = ['' => lang('Items.none')] + array_combine(options, options)` and `$selected_category = $item_info->category` (`Controllers/Items.php:388-392`; `Views/items/form.php:66-80`). Categories are saved in `items.category` (not as an attribute link).
- Adding a category value uses the normal attribute-value endpoint with `definition_id = -1`, creating a `NULL item_id` link.
- Case-only rewrite of a category value propagates to `items.category` via `updateAttributeValue` (`Attribute.php:1220-1234`).
- The definition form special-cases `definition_id == -1`: name and type disabled, group and flags hidden (`Views/attributes/form.php:124-132`); the values list is editable, so category options are added/removed through the same UI.
- The category definition never appears in `getDefinitionsByFlags` because `definition_flags = 0`.

Item-scoped vs category-scoped: item attributes live only in `attribute_links`; categories live in `items.category` plus the `-1` option pool. The only bridge is the capitalisation sync above. Target has no `category_dropdown` support at all (no references in `src/`, and `getDefinition()` rejects ids `<= 0`, `src/lib/attributes/repository.ts:27-31`).

---

## 6. Item / sale / receiving integration (upstream)

### 6.1 Item editor partial (`items/attributes/<id>`)

`Controllers/Items.php:588-616` (GET) and `624-652` (POST; both render `Views/attributes/item.php`):

```
definition_values = get_attributes_by_item(item) + get_values_by_definitions(json_decode(definition_ids))
definition_names  = getDefinitionNames()
for each definition:
    attribute_value = getAttributeValue(item, definition_id)
    values['attribute_id']    = attribute_value->attribute_id or null
    values['attribute_value'] = attribute_value
    values['selected_value']  = ''
    if type == DROPDOWN:
        values['values']         = getDefinitionValues(definition_id)      // attribute_id => text
        values['selected_value'] = get_link_value(item, definition_id)->attribute_id or ''
    if !empty(definition_ids[definition_id]):
        values['selected_value'] = definition_ids[definition_id]           // unsaved current value survives refresh
    unset(definition_names[definition_id])
```

`Views/attributes/item.php` widgets:

- definition add-select (`13-20`): `definition_name`, options `definition_names` (includes `-1 => none`), selected `-1`.
- DATE (`34-43`): readonly `.datetime` input, value `to_date(strtotime(attribute_date))` or `NOW`; `data-definition-id`.
- DROPDOWN (`44-53`): `form_dropdown` with `options = values`, `selected = selected_value`.
- TEXT (`54-62`): text input, `valid_chars` class.
- DECIMAL (`63-71`): text input, `to_decimals((float)$value)`, `valid_chars`.
- CHECKBOX (`72-91`): hidden input value `0` followed by checkbox value `1` (unchecked posts `0`).
- Each row has hidden `attribute_ids[definition_id]` and a trash button (`94-96`).
- JS (`103-167`): deletes the row client-side; `change` on any `attribute_links` input clears the hidden `attribute_ids`; autocomplete source `attributes/suggestAttribute/<definition_id>?term=`; `refresh()` re-loads the partial with `definition_ids` = all current values plus the newly selected id (`154-161`).

### 6.2 Item save

`Controllers/Items.php:1535-1562` (`saveItemAttributes`, called at `901` inside the item-save transaction):

1. `deleteAttributeLinks($itemId)` — removes **all** item-level links (removed rows disappear).
2. For each posted `attribute_links[definitionId] => value`:
   - `DROPDOWN`: treat the posted value as an `attribute_id` and call `saveAttributeLink($itemId, $definitionId, $value)` (no ownership validation);
   - `DECIMAL`: `parse_decimals($value)` then fall through;
   - default (TEXT/DATE/CHECKBOX/GROUP): `saveAttributeValue($value, $definitionId, $itemId, $attributeIds[$definitionId] ?? null, $definitionType)`; success requires id > 0.
3. Return `success && deleteOrphanedValues()` (`Controllers/Items.php:1561`).

Item list/search display:

- Item table headers append one column per `getDefinitionsByFlags(SHOW_IN_ITEMS, true)` definition (`Helpers/tabular_helper.php:429-450`; sort columns `410-424`).
- Search row values are produced by `Item::search` using `GROUP_CONCAT(DISTINCT CONCAT_WS('_', definition_id, attribute_value) ORDER BY definition_id SEPARATOR '|')` plus `attribute_dtvalues`/`attribute_dvalues` (`app/Models/Item.php:542-547`), and `expand_attribute_values` splits on `|` then `_` to produce `[definition_id => value]`, formatting DECIMAL with `to_decimals` (`tabular_helper.php:629-675`). `getItemDataRow` merges those columns after the fixed item columns (`463-532`).
- `Item::getInfo` also concatenates `attribute_values`, `attribute_dvalues`, `attribute_dtvalues` (`app/Models/Item.php:596-600`; used by the item form's `get_info_by_id_or_number` path and by CSV update merging).

### 6.3 Sale/receiving

- On add-to-cart: `Sale_lib::get_item_display` calls `get_link_values($item_id, 'sale_id', $sale_id, SHOW_IN_SALES)` and stores `attribute_values` / `attribute_dtvalues` in the cart line (`app/Libraries/Sale_lib.php:1149, 1161-1162`). `Receiving_lib::add_item` does the same with `'receiving_id'` and `SHOW_IN_RECEIVINGS` (`app/Libraries/Receiving_lib.php:327, 339-340`).
- Because `$sale_id`/`$receiving_id` is normally `null` at add time, the **flags filter is not applied** (`Attribute.php:729-731` only filters when `$id` is non-empty). All non-GROUP item attributes are shown.
- Cart display: `Views/sales/register.php:186` and `Views/receivings/receiving.php:139` append `implode(' ', [attribute_values, attribute_dtvalues])` to the item name.
- Save: `copy_attribute_links` per line (`Sale.php:680`, `Receiving.php:184`) creates the historical rows.
- Receipts/invoices: `Views/sales/receipt_default.php:67`, `receipt_short.php:58`, `receipt_email.php:62`, `invoice.php:146`, `Views/receivings/receipt.php:75` append `attribute_values` only (no date values).
- Receiving hard delete cascades links; sale cancel keeps them.
- `get_link_values` with a non-empty sale/receiving id + flags is used when a cart is reconstructed from an existing suspended sale (`Sale_lib.php:1372` passes `$sale_id` for suspended sales).
- **There is no sale/receiving attribute editor/modal anywhere in `app/Views/sales/*` or `app/Views/receivings/*`**; the only attribute-related markup is display (see citations above).

### 6.4 Reports

- Detailed sales: `getDefinitionsByFlags(SHOW_IN_SALES, true)` builds extra detail columns (`Controllers/Reports.php:1826, 1850-1855`); `Detailed_sales::getData` joins `attribute_links` on `(item_id, sale_id)` with `definition_id IN (...)` and concatenates values/dates/decimals (`app/Models/Reports/Detailed_sales.php:190-196`); rendering uses `expand_attribute_values` (`Reports.php:1897, 1911`).
- Detailed receivings: symmetric with `SHOW_IN_RECEIVINGS` and `receiving_id` (`Reports.php:2041, 2093, 2102`; `Detailed_receivings.php:137-141`).

---

## 7. CSV integration (upstream)

### 7.1 Template

`Items::getGenerateCsvFile` (`Controllers/Items.php:1109-1122`) calls `generate_import_items_csv($allowed_locations, getDefinitionNames())`.

`app/Helpers/importfile_helper.php`:

- Header order (`8-16`): `Id, Barcode, "Item Name", Category, "Supplier ID", "Cost Price", "Unit Price", "Tax 1 Name", "Tax 1 Percent", "Tax 2 Name", "Tax 2 Percent", "Reorder Level", Description, "Allow Alt Description", "Item has Serial Number", Image, HSN` then `location_<name>` for every allowed location (`22-31`) then `attribute_<definition_name>` for every definition (`37-47`).
- BOM (`\xEF\xBB\xBF`) is written first (`10`).
- `generate_attribute_headers` removes only the `-1` sentinel (`40`); GROUP definitions are included as columns.
- `csvImportHasRequiredItemHeaders` (`117-129`) requires **every** template header to be present in the uploaded file, else the whole import is rejected with `lang('Items.csv_import_nodata_wrongformat')` (`Controllers/Items.php:1149-1150`).

### 7.2 Import pipeline

`Controllers/Items.php:1134-1262`:

1. Read CSV with `get_csv_file()` (BOM-aware, `array_combine` headers).
2. `$attributeDefinitionNames = getDefinitionNames()`, `unset([NEW_ENTRY])`.
3. Build `$attributeData[definitionName] = getDefinitionByName(name)`; for DROPDOWN add `['dropdown_values'] = getDefinitionValues(definition_id)` (`1155-1165`).
4. Per row: `validateCSVData(...)` (`1318-1424`) returns `true` for **invalid** (inverted naming). Attribute checks (`1385-1420`):
   - skip empty and `_DELETE_` (case-insensitive);
   - DROPDOWN: value must be in `dropdown_values` (plus `''`), else log and fail the row;
   - DECIMAL: `is_numeric` or empty;
   - DATE: `isValidDate` or empty.
5. `extractAttributeData($row)` (`1270-1281`): every CSV key starting with `attribute_` maps `substr(key, 10) => value` (i.e. definition name → cell).
6. `saveCSVRowAttributeData($csvAttributeValues, $itemData, $attributeData)`.
7. On success, `deleteOrphanedValues()`.

### 7.3 `saveCSVRowAttributeData` exact semantics

`Attribute.php:942-975`:

```
foreach ($definitions as $definition) {
    $name  = $definition['definition_name'];
    $value = $attributeValues[$name] ?? null;
    if (isset($value) && strcasecmp($value, '_DELETE_') === 0) {
        deleteAttributeLinks($itemData['item_id'], $definition['definition_id']); // per-definition replace
        continue;
    }
    if (!empty($value) || $value === '0') {
        if ($definition['definition_type'] === CHECKBOX) {
            $value = (strcasecmp($value,'false')===0 || $value==='0') ? '0' : '1';
            $attribute_id = storeCSVAttributeValue($value, $definition, $itemId);
        } elseif (!empty($value) || $value === '0') {  // redundant inner condition
            $attribute_id = storeCSVAttributeValue($value, $definition, $itemId);
        } else {
            return false;                              // unreachable
        }
        if (!$attribute_id) return false;
    }
}
return true;
```

Empty cells (including whitespace-only and `null`) mean **no change**; `_DELETE_` is case-insensitive; CHECKBOX treats case-insensitive `false` and exact `0` as unchecked, everything else as checked.

`storeCSVAttributeValue($value, $definition, $itemId)` (`985-1017`):

1. `transStart()`; `attributeValueExists($value, type)`.
2. `deleteAttributeLinks($itemId, $definition_id)` — replaces the item's link for that definition only.
3. If the value row does not exist → `saveAttributeValue(...)` (creates value + link).
4. Else if TEXT-family and case-only difference → `saveAttributeValue(...)` (rewrites capitalisation and links).
5. Else `saveAttributeLink($itemId, $definition_id, $attributeId)`; false → return false.
6. `transComplete()`; false if `transStatus()` fails; else return the attribute id.

Multi-value handling: one column per definition → at most one value per definition per row. Multiple rows with the same item Id each replace that definition's link, so the **last row wins**. There is no multi-value syntax.

Errors surfaced through this path are: link-save failure (row marked failed, transaction rolled back and `Items.csv_import_partially_failed` returned) and the controller-side validation logs. Unknown definitions cannot occur here because iteration is driven by the definitions table; unknown **values** are only rejected for DROPDOWN at the controller stage.

---

## 8. UI behaviours (upstream)

### 8.1 Manage page (`Views/attributes/manage.php`)

- Bootstraps the generic `table_support` grid with resource `attributes`, page size `config['lines_per_page']`, `uniqueId: 'definition_id'` (`11-21`).
- "New Attribute" button opens a modal-dlg at `attributes/view` (`24-28`); toolbar has a bulk Delete button (`30-36`); table is `<table id="table">` (`38-40`).
- Columns (`tabular_helper.php:677-690`): Id, Attribute Name, Attribute Type, Attribute Visibility, Group. `get_attribute_definition_data_row` (`700-730`) returns `definition_flags` already translated to an array of localized names by `Attributes::get_attributes` (`Controllers/Attributes.php:248-257`), plus an edit link (`anchor("$controller/view/$id", ..., ['class'=>'modal-dlg'])`).
- `definition_flags` display: if the model's flag set is empty → `none_selected_text`; if `$attribute->definition_type == GROUP` → `"-"` (note: reads the *model property* rather than the row — upstream bug, so GROUP rows usually fall to `implode(', ', flags)`); else `implode(', ', array_of_language_names)`.
- Data endpoint `GET attributes/search` returns `{total, rows}`; sorting restricted to the header keys with default `definition_id`; LIKE on name/type (`Controllers/Attributes.php:41-59`).
- `GET attributes/row/<id>` returns a single data row (`235-242`).

### 8.2 Definition add/edit modal (`Views/attributes/form.php`)

- Fields: `definition_name` (required), `definition_type` (select over `DEFINITION_TYPES`, selected index from `array_search(current, DEFINITION_TYPES)`; for a new definition `array_search('')` is `false`, so the **first** option, GROUP, is selected by the browser), `definition_group` (select), hidden flag multiselect `definition_flags[]`, hidden `definition_unit`, hidden `definition_value` + add button + `definition_list_group`.
- `disable_definition_types()` (`109-122`): if current type is DATE, GROUP (existing only) or DECIMAL → the type select is **disabled** (so type cannot be changed away from those); if DROPDOWN or CHECKBOX → hide GROUP/DATE/DECIMAL options; if TEXT → hide GROUP.
- `disable_category_dropdown()` (`124-132`): for `definition_id == -1`, disable name and type, hide group and flags.
- `show_hide_fields()` (`134-150`): values UI visible only for DROPDOWN (`val === '1'`); unit visible only for DECIMAL (`val === '2'`); flags visible unless GROUP (`val === '0'`); always applies for non-category definitions.
- Value list behaviour: add via `POST attributes/saveAttributeValue` for existing definitions, or accumulate in JS for new ones (`171-198`); remove via `POST attributes/DeleteDropdownAttributeValue` for existing definitions (`157-169`). Values containing `_` or `|` are rejected client-side (`214-216`) with `lang('Attributes.attribute_value_invalid_chars')`.
- Submit: re-enables disabled inputs (`218-220`), injects a hidden `definition_values` JSON only for new definitions (`225-232`), AJAX-submits and calls `table_support.handle_submit`.
- New definition default visibility: `selected_definition_flags = get_attributes($showAll)` when `definition_flags === ''` (`Controllers/Attributes.php:276-279`), i.e. all four flags (items, sales, receivings, search) pre-selected.

### 8.3 JSON endpoints

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `attributes/suggestAttribute/<definition_id>` | GET | `term` | `[{value: attribute_id, label: attribute_value}]` (`Controllers/Attributes.php:224-229`; `Attribute.php:847-865`) |
| `attributes/saveAttributeValue` | POST | `attribute_value` (string, non-empty), `definition_id`, optional `item_id`, optional `attribute_id` | `{success: bool}` (`66-82`) |
| `attributes/DeleteDropdownAttributeValue` | POST | `definition_id`, `attribute_value` | `{success: bool}` (`89-103`) |
| `attributes/saveDefinition/<id>` | POST | name, type index, flags[], group, unit, values JSON (new only) | `{success, message, id}` (`112-190`) |
| `attributes/search` | GET | `search`, `limit`, `offset`, `sort`, `order` | `{total, rows}` (`41-59`) |
| `attributes/row/<id>` | GET | — | data row object (`235-242`) |
| `attributes/delete` | POST | `ids[]` | `{success, message}` (`288-298`) |

### 8.4 Item form / cart / receipt display

Covered in sections 6.1-6.3. Additional: `Views/items/form.php:82-86` asynchronously loads the attribute partial into `#attributes`; validation adds a `valid_chars` rule shared with attribute values (`518-519`); after a "stay open" save the form clears `[name^="attribute_links"]` and `#definition_name` (`531`), which resets the attribute editor.

---

## 9. Target parity audit (file-by-file)

### 9.1 `src/db/schema/attributes.ts` (26 lines)

| Line | Content | Gap |
|---|---|---|
| 4-12 | definitions table | `definitionFlags` default 0 (upstream requires explicit; UI default is 15) |
| 14-19 | values table (`attribute_value` text, `attribute_date` text, `attribute_decimal` real) | no unique keys on any typed column; wrong date type; wrong decimal precision |
| 21-27 | links table | no unique/PK; `itemId` FK **ON DELETE CASCADE** (upstream item FK is plain); no `sale_id`/`receiving_id` FKs; no generated unique column |

### 9.2 `src/db/schema/mysql/index.ts:294-323`

- `definition_flags` default 0; `definition_unit varchar(255)` (upstream 16).
- `attribute_values.attribute_value text` (no unique, cannot index `text` without prefix); `attribute_date varchar(255)`; `attribute_decimal decimal(15,4)`.
- `attribute_links.generated_unique_column GENERATED ALWAYS AS (CONCAT(definition_id, '-', item_id)) STORED` with a unique index. **Missing the upstream `CASE WHEN sale_id IS NULL AND receiving_id IS NULL AND item_id IS NOT NULL ... ELSE NULL END` guard.** Therefore every sale/receiving link row of the same item+definition collides, and `onConflictDoNothing` silently drops most copies. Materialised identically in `drizzle/mysql/0000_demonic_darkstar.sql:24-25`.
- No `sale`/`receiving` FKs; definition/value FKs lack `ON DELETE RESTRICT/CASCADE` semantics.
- Verified in the live SQLite DB: `sqlite3 ospos.db ".schema attribute_links"` → no constraints beyond the three FKs.

### 9.3 `src/lib/attributes/repository.ts` (222 lines)

- `listDefinitions()` (22-25): no ordering; includes GROUP.
- `getDefinition()` (27-31): returns `null` for `definitionId <= 0` — **CATEGORY_DEFINITION_ID (-1) is unreachable**.
- `listDropdownValues()` (33-41): selects all links with `itemId IS NULL` for the definition; no `ORDER BY attribute_value`; no definition-type check; no deleted filter on values. Fine for option pool but ordering diverges.
- `saveDefinition()` (43-84):
  - destructures away `definitionId`, so **cannot insert id -1** (category definition impossible);
  - update path never checks whether the row exists (silent no-op);
  - **no undelete path**;
  - **no type-conversion logic at all** — changing TEXT→DATE/DECIMAL/CHECKBOX leaves values in `attribute_value` and links unchanged; DROPDOWN/TEXT conversions never rewrite links;
  - applies `values` on update too (upstream only creates options on create; edits add via separate endpoint), and **never deletes removed options**;
  - inserts option links without `saleId/receivingId` (implicitly NULL, correct);
  - dedupes values with case-sensitive `===` over `attributeValue` (SQLite) and **does not handle case-only capitalisation updates**;
  - no GROUP-parent validation, no flags validation.
- `deleteDefinition()` (86-92): deletes all links then soft-deletes — matches upstream `deleteDefinition` (no orphan cleanup, same as upstream).
- `undeleteDefinition()` (94-97): exists but **unused** (0 call sites).
- `definitionExists()` (99-107): unused; not part of upstream contract.
- `searchDefinitions()` (109-113): name only (upstream name OR type); no pagination/total; only reachable from unused actions.
- `getAttributesByItem()` (123-137): inner joins definition+value; filters `itemId` and `definition.deleted` only — **missing `saleId IS NULL AND receivingId IS NULL`**, missing type-aware read (only `attributeValue`), and the declared return type says `value` while the select aliases `attributeValue` → consumers reading `.value` get `undefined`.
- `saveAttributeValue()` (139-156): finds link by `(definitionId, itemId)` only; if found, **mutates the shared attribute_values row** (dangerous once CSV dedupes share rows); if not found, inserts a brand-new value row **for every item and every edit** (no global dedupe); writes `attributeValue` regardless of definition type (DATE/DECIMAL go to the wrong column); no date-format normalisation; no case-only handling; no `attributeId` reuse; no link validation; returns the value id.
- `deleteAttributeValue()` (158-164): deletes **all** links for the attribute id (including sale/receiving history) and then the value row (even if still referenced elsewhere — with FKs off in SQLite this orphans/hard-deletes history). Upstream contract is `deleteDropdownAttributeValue(value, definitionId)` with sale/receiving-preserving semantics.
- `copyAttributeLinks(fromItemId, toItemId)` (166-174): item→item copy; **unused** except an unused import in items actions. Upstream is item→sale/receiving with `sale_id`/`receiving_id` columns.
- `getDefinitionsByFlags()` (176-181): `WHERE (definition_flags & flags) = flags` (ALL bits) and **does not exclude GROUP**; order by name. Upstream: ANY bit, excludes GROUP, order by `definition_id`.
- `getDefinitionNames()` (183-188): returns `{definitionId, definitionName}[]`, no `-1` sentinel, no GROUP filter; unused (0 call sites).
- `getTotalDefinitionRows()` (190-194), `getSuggestions()` (196-198): `getSuggestions` searches **definitions**, while upstream's suggestion endpoint searches **values** for a definition; unused in UI.
- `deleteOrphanedValues(definitionId)` (200-209): different contract — deletes option links + values only for the given definition where `itemId IS NULL`; **never called** (0 call sites). Upstream is global `NOT IN (SELECT attribute_id FROM links)`.
- `getLinkValue()` (211-219): no sale/receiving NULL filters and no type/deleted filters; unused.
- Dead-code imports `ne`, `or`, `desc` silenced at 221-223.

### 9.4 `src/app/(secure)/attributes/**` and `src/components/attributes/**`

- `page.tsx` (19 lines): list only; no search, sort, pagination, bulk delete, ID/Group columns.
- `actions.ts` (96 lines):
  - `saveAttributeAction` (31-56): `requirePermission("attributes")`, reads fields; flags computed from checkbox *names* via `FLAG_MAP` (1/2/4 only — **no search flag**); `definitionFk` from a `"0"` option is stored as `0`, not `null`; no group validation; `JSON.parse(values)` unguarded; redirect.
  - `deleteAttributeAction` (58-63): single delete.
  - `searchAttributesAction`, `getAttributeRowAction`, `getAttributeValuesAction`, `saveAttributeValueAction`, `deleteAttributeValueAction`, `getAttributesByItemAction` (65-95): **all have zero UI call sites** (verified by grep over `*.tsx`).
- `attribute-table.tsx` (47 lines): Name/Type/Unit/Visible In/actions; flags labels only 1/2/4; no Group, no ID, no selection; delete uses `confirm()`.
- `attribute-form.tsx` (119 lines):
  - type select always editable, all six types always offered (no DATE/GROUP/DECIMAL lock, no option hiding) — upstream prevents converting away from those types and hides invalid options;
  - unit always visible (upstream only DECIMAL);
  - flags are three checkboxes named `show_in_items|show_in_sales|show_in_receivings`; new definitions default to **no flags** (upstream defaults all four to selected);
  - Parent Group selector rendered only when type === GROUP (upstream renders for all types); posts `"0"` for none;
  - values UI only for DROPDOWN, with per-line add/remove buttons, but removal in edit mode **does not delete the option from the DB** (no per-value POST); values are submitted as a JSON array on every save (create or edit);
  - no `_`/`|` validation; no category (-1) lockout; no disabled-input re-enable on submit (not needed under React).
- `new/[id]/page.tsx` (12 lines): `getDefinition(definitionId)`; for id `-1` returns null → a new blank form that on save would insert a *new* definition; `groups` filters GROUP definitions (but excludes only self, not ordering).

### 9.5 Item integration

- `src/app/(secure)/items/[id]/page.tsx:19-20`: maps `a.value` from rows that actually expose `attributeValue` → **all values undefined**; no flags filter; loads all definitions including GROUP (line 29) with no ordering.
- `src/app/(secure)/items/new/page.tsx:19-32`: all non-deleted definitions incl GROUP, insertion order.
- `src/components/items/item-form.tsx:217-271`: renders one widget per definition, including GROUP (falls through to a text input):
  - CHECKBOX → checkbox with `"1"`/`"0"` state (line 227-233);
  - DROPDOWN → **free-text input** reading/writing the text value (234-241) — no option list, no attribute_id semantics, so dropdown options have no effect;
  - DATE → HTML date input (242-248) — value comes from `attributeValue` column, but CSV-imported DATE is in `attribute_date` → blank; stores into `attribute_value` on save;
  - DECIMAL → number input step 0.0001 (249-257) — stores into `attribute_value`;
  - TEXT/GROUP → text input (258-266).
  There is **no remove control** (upstream's per-row trash deletes the link on save), no autocomplete/suggestions, no `attribute_ids` hidden field, no per-definition form-group.
- `src/app/(secure)/items/actions.ts:110-118`: after `saveItem`, iterates `attributeValues` and calls `saveAttributeValue` for each; it **does not delete links first**, so cleared/removed attributes persist; it passes values for every key present (only changed keys are present because state starts from the (broken) initial map); no type handling; no `deleteOrphanedValues`; no DROPDOWN id path.
- `src/lib/items/repository.ts:133-199`: item list attribute map:
  - definitions filtered by raw `(definitionFlags & 1) = 1` but **not** `definitionType <> GROUP`;
  - reads only `attribute_value` (DATE/DECIMAL columns invisible);
  - filters `saleId IS NULL AND receivingId IS NULL` (correct);
  - builds `attributeMap` keyed by definition id.
- `src/components/items/items-table.tsx:105-113, 155-159`: one column per definition (GROUP included), displays `row.attributeValues?.[id]` — DATE/DECIMAL blank.
- `searchCustom` filter (`items/page.tsx:24`, `repository.ts:42`) is parsed but **never used** in the query; upstream performs attribute matching (section 6.2, `Item.php:356-421`, named syntax `color: blue` via `parseAttributeSearch`, `Item.php:151-179`).

### 9.6 Sale integration

- `src/lib/sale/sale-model.ts:168-175`:
  ```
  try {
    tx.insert(attributeLinks).values({
      attributeId: null, definitionId: 0, itemId: line.itemId, saleId,
    }).onConflictDoNothing().run();
  } catch { /* ignore */ }
  ```
  This is **not** a copy of item links; it inserts an invalid definition `0` row with a NULL attribute id. SQLite FK enforcement is enabled (`src/lib/db/sqlite.ts:16` — `pragma foreign_keys = ON`) and `definition_id` has an FK to `attribute_definitions`, so in SQLite this insert throws and the swallowed `catch` hides it: **no attribute links are ever written for sales**. In MySQL the FK would fail the same way; if it did not, the unconditional generated column would compute `"0-<itemId>"` and collide across sales.
- `src/lib/sale/sale-lib.ts:54-69`: `getAttributesByItem` joined helper exists but is **never called**; `buildCartLineFromItem` (71-81) and the return-entire-sale builder (720-721, 807-808) set `attributeValues: ""` / `attributeDtvalues: ""`.
- `src/lib/sale/types.ts:8-9`: cart line carries the two fields, never populated.
- `src/components/sales/register.tsx:196` renders only `l.itemName`; no attribute text.
- Receipt/invoice PDFs (`src/lib/pdf/receipt_default.tsx`, `receipt_short.tsx`, `invoice.tsx`, `quote.tsx`, `work_order.tsx`) contain no attribute handling.

### 9.7 Receiving integration

- `src/lib/receiving/receiving-lib.ts`, `receiving-model.ts`, `receiving-store.ts`: **zero** attribute references. `ReceivingLine` (`receiving-store.ts:6-22`) has no attribute fields; `completeReceiving` (`receiving-model.ts:15-…`) writes `receivingsItems` and inventory only, with no `copy_attribute_links` equivalent.
- `src/components/receivings/register.tsx:68` renders only `l.itemName`.

### 9.8 CSV

- `src/app/api/items/csv-template/route.ts:12-20`: headers include `attribute_<definitionName>` for all non-deleted definitions (GROUP included, matching upstream's inclusion) and `location_<name>`; no `-1` sentinel exists in target. BOM is written (`﻿`).
- `src/app/api/items/csv-import/route.ts:126-179`:
  - iterates all definitions; column `attribute_<definitionName>`;
  - skips empty/whitespace cells;
  - `_DELETE_` check is **case-sensitive** (`raw === "_DELETE_"`) and deletes **all links for the item** (line 130), not just that definition's link;
  - TEXT/DROPDOWN: reuses a value row by exact case-sensitive text (135-152);
  - DECIMAL: **always inserts a new row into `attributeDecimal`** (156); no reuse, no dedupe, no validation; `parseFloat(raw)||0` silently converts garbage to 0;
  - DATE: inserts raw string into `attributeDate` (159); no locale parsing/validation;
  - CHECKBOX: normalises to `"1"`/`"0"` (only `"1"`/case-insensitive `"true"` count as true), dedupes globally (163-170) — here target does share 0/1 rows, unlike its item form;
  - inserts a link unconditionally (172-177), so re-importing the same row creates **duplicate links** (no unique constraint, no per-definition delete);
  - no required-header validation; unknown header columns silently ignored; no orphan cleanup; no per-row failure semantics beyond the outer try/catch (whole row rolled back, `failed++`).
- `src/app/(secure)/items/csv-import/page.tsx` is a thin wrapper over `CsvImportForm`; no attribute documentation.

### 9.9 Seed / permissions / sidebar

- `src/db/seed.ts:119` registers module `attributes` (sort 0, upstream SQL used sort 107) and `:159` permission `attributes`; grants are seeded elsewhere in the file, so the admin path works.
- `src/components/shared/sidebar.tsx:38,51` maps `attributes` → `/attributes` with a Tags icon.
- No attribute demo/seed data, including no category `-1` definition.

### 9.10 Tests

- `e2e/attributes.spec.ts` (55 lines): create TEXT, edit name, create DROPDOWN with two values, delete. It does not assert values persisted, flags, groups, item integration, conversions, or CSV.
- No unit tests for the repository; `src/lib/sale/sale-lib.test.ts` only carries the `attributeValues: ""` fields in fixtures.
- Upstream has no dedicated attribute model/controller test either; see section 11 for the exact indirect coverage to port.

### 9.11 Hypothesis verification table

| Hypothesis from the brief | Verdict | Evidence |
|---|---|---|
| Type conversion missing | **Confirmed** | `repository.ts:43-84` has no `from/to` comparison, no validation, no `attribute_cleanup` equivalent |
| Dropdown option deletion missing | **Confirmed** | No `deleteDropdownAttributeValue`; `saveDefinition` never deletes; `deleteAttributeValue` is unused and over-broad (`repository.ts:158-164`); `attribute-form.tsx:28,110` only removes UI rows |
| Case-only update missing | **Confirmed** | No `strcasecmp` anywhere in attributes code; dedupe is `===` (`repository.ts:66`); CSV uses exact compare (`csv-import/route.ts:136,146,163`) |
| Checkbox shared 0/1 rows violated | **Confirmed (partially inverted)** | Item form creates per-item `"0"`/`"1"` value rows (`item-form.tsx:231`, `repository.ts:139-156`); CSV dedupes globally but never creates the per-definition `NULL item` option link; no conversion path creates them |
| Unique constraint missing / dialect differences | **Confirmed** | SQLite: none (`attributes.ts:14-27`); MySQL: generated column without CASE guard (`mysql/index.ts:319-323`, `0000_demonic_darkstar.sql:24`) |
| Inline editing incomplete | **Confirmed** | No remove button, no suggestions, DROPDOWN as free text, DECIMAL/DATE stored in wrong column, no `attribute_ids` (`item-form.tsx:217-271`) |
| Sale/receiving links `definitionId=0` stub | **Confirmed** | `sale-model.ts:168-175`; receiving has no code at all |
| Sale/receiving attribute modal exists | **Refuted** | None in upstream 3.4.3 views; only display + copy |
| Item attribute prefill works in target | **Refuted by inspection** | `items/[id]/page.tsx:20` reads `a.value`; repository returns `attributeValue` (`repository.ts:125-136`) |

### 9.12 Additional target gaps not in the brief

1. `SHOW_IN_SEARCH` (8) entirely absent from constants, UI and filtering (`repository.ts:8-10`).
2. `getDefinitionsByFlags` uses ALL-bits semantics and includes GROUP (`repository.ts:176-181`) vs upstream ANY-bits + GROUP excluded (`Attribute.php:273-276`).
3. `getDefinitionNames` sentinel `-1` and GROUP filter missing (`repository.ts:183-188`).
4. `getLinkValue` and `getAttributesByItem` omit `sale_id/receiving_id IS NULL` (`repository.ts:123-137, 211-219`), so historical links would leak into item display once sale links are real.
5. Attribute suggestions endpoint shape replaced by definition search (`repository.ts:196-198`).
6. No definition search/sort/pagination/bulk-delete on the manage page (`attributes/page.tsx`, `attribute-table.tsx`).
7. New-definition default flags = 0 (`attribute-form.tsx:80`), so new attributes are invisible in items/sales/receivings until explicitly checked; upstream default = 15.
8. `definitionFk` stores `0` instead of `NULL` for "none" (`attribute-form.tsx:90`, `actions.ts:41-42`).
9. No `definition_unit` conditional display; no GROUP parent listing for non-GROUP definitions.
10. No category-dropdown config support anywhere in `src/`.
11. Report attribute columns not implemented (`src/lib/reports`, `src/app/(secure)/reports` — zero attribute references).
12. Attribute repository is synchronous SQLite-only; under `DB_DRIVER=mysql` every call throws (`src/lib/db/index.ts:32-36`).
13. CSV DATE/DECIMAL never reuse or dedupe rows; item form and CSV disagree on checkbox value sharing.
14. `copyAttributeLinks` is item→item and unused (`repository.ts:166-174`); `getAttributesByItemAction` et al. are dead server actions.
15. No EAV fixtures/tests in the target; only the four e2e definition CRUD tests.

---

## 10. Implementation obligations (ordered)

Each obligation states target files, upstream behaviour to reproduce, data contract, and acceptance tests. Where upstream has a defect (DROPDOWN→TEXT/GROUP conversion failure, last-row-wins validation, GROUP flag display bug), the obligation is to reproduce **observable** behaviour unless the parity owner explicitly rules a fix; mark those `DECISION` items.

### O1. Schema parity (SQLite first, then MySQL)

**Files:** `src/db/schema/attributes.ts`, `src/db/schema/mysql/index.ts`, new `drizzle/sqlite/0003_*.sql`, `drizzle/mysql/0002_*.sql`.

**Contract:**

- `attribute_values`:
  - `attribute_value` sized (255) with a unique constraint whose comparison is case-insensitive (SQLite: `UNIQUE` + `COLLATE NOCASE` or a `lower(attribute_value)` unique expression index; MySQL: `varchar(255)` + unique under a `*_ci` collation).
  - `attribute_date` DATE (SQLite: text ISO `YYYY-MM-DD`) with unique.
  - `attribute_decimal` `DECIMAL(7,3)` (SQLite: numeric) with unique.
- `attribute_links`:
  - unique `(attribute_id, definition_id, item_id, sale_id, receiving_id)` (uq1);
  - unique `(item_id, receiving_id, sale_id, definition_id, attribute_id)` (uq2 equivalent);
  - generated/expression unique enforcing one current item link per `(definition_id, item_id)` **only when `sale_id IS NULL AND receiving_id IS NULL AND item_id IS NOT NULL`** (SQLite: partial unique index on a generated column or a `WHERE` partial index; MySQL: `CASE` generated column exactly as `3.4.1_attribute_links_unique_constraint.sql:5-11`);
  - FKs: `definition_id` → definitions `ON DELETE RESTRICT`, `attribute_id` → values `ON DELETE RESTRICT`, `receiving_id` → receivings `ON DELETE CASCADE`, `sale_id`/`item_id` plain (no cascade).
- `attribute_definitions.definition_unit` varchar(16); `deleted` tinyint NOT NULL default 0; flags NOT NULL (no implicit 15 at the DB layer).

**Acceptance tests (unit, in-memory SQLite):**
1. `attribute_values` rejects a duplicate `attribute_value` differing only by case; allows same text in `attribute_value` vs `attribute_date`.
2. Two current links for `(definition 1, item 1)` are rejected; a second sale link `(definition 1, item 1, sale 2)` is accepted.
3. `sale_id`/`receiving_id` rows allow duplicated `(definition, item)` pairs.
4. Deleting a receiving removes its links; deleting an item is blocked or does not cascade (must match upstream: no cascade).
5. Deleting a definition with links is blocked at DB level (repository deletes links first).

### O2. Definition repository: create/update/delete with full conversion engine

**Files:** `src/lib/attributes/repository.ts` (rewrite), new `src/lib/attributes/conversion.ts` if needed.

**Contract (functions to expose):**

- `saveDefinition(data: {definitionId: number; definitionName; definitionType; definitionUnit: string|null; definitionFlags: number; definitionFk: number|null; deleted?: boolean}, values: string[]): {id: number; success: boolean}` — must:
  - insert with explicit `definitionId = -1` when supplied (category), otherwise autoincrement;
  - on update of a soft-deleted id: undelete **and ignore submitted fields** (upstream parity);
  - compare old type; run conversion matrix (section 3.3) in one transaction; rollback on false;
  - only create dropdown options for **new** definitions (upstream posts `definition_values` on create only);
  - new options are saved with type DROPDOWN (attribute_value + NULL-item link).
- `convertDefinitionData(definitionId, from, to)` implementing:
  - `checkDataValidity` with upstream's per-row overwrite semantics `DECISION` (parity) — recommended test covers single-value and multi-value ordering;
  - `attributeCleanup` re-linking every link row through `saveAttributeValue(value, definitionId, false, oldAttrId, toType)` then `saveAttributeLink(itemId, definitionId, newId)`, followed by `deleteOrphanedLinks` + `deleteOrphanedValues`;
  - duplicate TEXT/DROPDOWN→CHECKBOX SQL as an equivalent UPDATE JOIN (or per-row loop) mapping `'false'|'0'|''|NULL` → shared zero id, else shared one id; ensure shared `0`/`1` value rows and per-definition NULL-item links are created exactly like `checkbox_attribute_values`;
  - conversion result matrix exactly as section 3.3, including `TEXT→GROUP` and `DROPDOWN→TEXT` returning failure `DECISION`.
- `deleteDefinition(id)` / `deleteDefinitionList(ids)` — delete all links for the definitions, then `deleted = 1`.
- `undeleteDefinition(id)` — `deleted = 0` (expose; currently dead).
- `getDefinitionInfo(id)` — parent group name alias, empty-object fallback.
- `getDefinitionByName(name, type?)`.
- `getDefinitionsByFlags(flags, includeTypes?)` — ANY-bit semantics, GROUP excluded, order by definition_id.
- `getDefinitionNames(groups = true)` — `-1 => '[SELECT]'` sentinel, name ASC, GROUP filter.
- `getDefinitionsByType(type, excludeId)` — top-level GROUP list (see U1).
- `getDefinitionValues(definitionId)` — `item_id IS NULL` options, ordered by value, `attribute_id => value`; accept `-1`.

**Acceptance tests (new `src/lib/attributes/repository.test.ts` + fixtures):**
1. Create TEXT definition → rows in definitions; no values.
2. Create DROPDOWN with values → one `attribute_values` row per distinct value + one NULL-item link each.
3. Update TEXT→DATE with all-valid values → each item link still points to one row, now with `attribute_date` set and `attribute_value` NULL; item count unchanged.
4. Update TEXT→DATE with one invalid value (invalid last) → update rejected, original type and data intact (parity: last-row-wins means last valid would pass; add both orderings to pin the documented behaviour).
5. Update TEXT→CHECKBOX → all links point to shared `0`/`1` ids; `attribute_values` has exactly one `'0'` and one `'1'` globally.
6. Update DROPDOWN→TEXT → returns failure and rolls back `definition_type` (`DECISION` if fixing).
7. Update TEXT→GROUP → failure/rollback (`DECISION`).
8. Update DATE→TEXT → allowed, no column movement (old values in `attribute_date`).
9. Update a soft-deleted definition id → undeleted with old name (submitted name ignored).
10. Category: create with id `-1` and `definition_type= DROPDOWN`; `getDefinitionValues(-1)` returns options.
11. Delete definition removes its links but leaves orphan values (upstream behaviour), and value rows remain until `deleteOrphanedValues`.

### O3. Value/link CRUD parity

**Files:** `src/lib/attributes/repository.ts` (+ `src/lib/attributes/values.ts` optional).

**Contract:**

- `attributeValueExists(value: string|number, definitionType): number | null` — typed column lookup; DATE normalises via the configured locale format to `YYYY-MM-DD`; DECIMAL compares numeric.
- `saveAttributeValue(value, definitionId, itemId|null, attributeId|null, definitionType): number` (0 = failure) — exact algorithm in section 4.1, including global dedupe, case-only rewrite, date normalisation, transaction, `saveAttributeLink`.
- `updateAttributeValue(attributeId, dataType, value)` — write column; if linked to definition `-1`, update `items.category` case-insensitively.
- `saveAttributeLink(itemId|null, definitionId, attributeId): boolean` — DROPDOWN + null item inserts only if absent; otherwise update-or-insert item-level link.
- `deleteAttributeLinks(itemId, definitionId?)` — item-level only.
- `deleteDropdownAttributeValue(value, definitionId): boolean` — section 4.4 exact ordering.
- `deleteOrphanedValues()` — global delete of unreferenced values.
- `deleteOrphanedLinks(definitionId)` — delete `item_id IS NULL` links for non-DROPDOWN definitions.
- `getSuggestions(definitionId, term)` — `[{value: attributeId, label: value}]` joined through links.
- `getLinkValue(itemId, definitionId)`, `getLinkValues(itemId, fk, id, flags)` producing `attribute_values` and `attribute_dtvalues` with `, ` separators, GROUP excluded, flags only when id non-null.

**Acceptance tests:**
1. Saving "Red" for two items creates **one** value row and two links.
2. Saving "red" after "Red" updates the stored value to "red" and keeps the same row id (case-only rewrite), and does not create a second row.
3. Saving a dropdown option (`itemId = null`) twice does not duplicate the link; two distinct options create two NULL-item links.
4. `deleteDropdownAttributeValue`: option link removed; value row deleted when unreferenced; value row retained when an item still links it; sale/receiving links untouched.
5. `deleteOrphanedValues` removes values not referenced by any link (including old checkbox `0`/`1` when unused).
6. DATE save normalises `dd/mm/yyyy` (configured) to `YYYY-MM-DD`.
7. DECIMAL save writes `attribute_decimal` only.
8. `getSuggestions` returns values for the definition across items (including options), ordered, limited by term.

### O4. Item integration and editor parity

**Files:** `src/lib/items/repository.ts`, `src/app/(secure)/items/actions.ts`, `src/app/(secure)/items/[id]/page.tsx`, `src/app/(secure)/items/new/page.tsx`, `src/components/items/item-form.tsx`, `src/components/items/items-table.tsx`.

**Contract:**

- `getAttributesByItem(itemId): {definitionId, definitionName, definitionType, attributeId, attributeValue, attributeDate, attributeDecimal}[]` — filter `saleId IS NULL AND receivingId IS NULL`, `deleted = 0`, name ASC.
- Item page maps `attributeValue` (fix `.value` bug) and pre-fills typed widgets from the correct column.
- `saveItemAttributes(itemId, postedLinks, postedIds)`:
  1. `deleteAttributeLinks(itemId)`;
  2. DROPDOWN → `saveAttributeLink(itemId, definitionId, postedAttributeId)`;
  3. DECIMAL → parse locale decimal then `saveAttributeValue(..., 'DECIMAL')`;
  4. default → `saveAttributeValue(value, definitionId, itemId, postedId, type)`;
  5. `deleteOrphanedValues()`.
- Item form widgets per section 6.1/8.4: DATE picker, DROPDOWN select fed by `getDefinitionValues`, TEXT with suggestions, DECIMAL formatted, CHECKBOX hidden 0 + checkbox 1, per-row remove button, group expansion via `getValuesByDefinitions` (selected GROUP includes children), definition add-select with `-1` sentinel.
- Item list columns: definitions from `getDefinitionsByFlags(SHOW_IN_ITEMS)` (GROUP excluded), values formatted from all three columns with DECIMAL `to_decimals`.
- Item search: implement `searchCustom` (free-text attribute match across value/date/decimal) and the named-attribute syntax (`name:value`, comma/AND/OR separators, unknown names must not match all — see `tests/Models/ItemSearchTest.php:231-449`), plus attribute-column sorting (`app/Models/Item.php:270-307`) over the search filter block (`app/Models/Item.php:350-421`).

**Acceptance tests:**
1. Edit item page pre-fills each type (regression for `a.value`).
2. Saving an item with a removed attribute row deletes only that link.
3. Dropdown selection persists the option's `attribute_id`; changing the option's text later does not change the item.
4. DATE/DECIMAL item values survive a save and are read from the correct columns.
5. Item table renders DATE/DECIMAL attribute columns; GROUP definitions produce no columns.
6. `search_custom`: text, DEIMAL (locale decimal), DATE match; unknown named attribute returns zero rows; named + free text combine.
7. Flags: definition with flags=1 shows in item columns; flags=8 only participates in search.

### O5. Category definitions

**Files:** `src/lib/attributes/repository.ts`, config persistence, item form.

**Contract:** `CATEGORY_DEFINITION_ID = -1`; config toggle creates/soft-deletes the `ospos_category` DROPDOWN definition with explicit id -1; `getDefinition` and `getDefinitionValues` accept -1; item form uses category options when `category_dropdown` is on, stores the text in `items.category`; category value rename syncs items.

**Acceptance tests:**
1. Enabling the toggle inserts a definition row with `definition_id = -1` and type DROPDOWN.
2. Disabling soft-deletes it and removes its option links.
3. Adding/removing category options through the attribute-values endpoints affects the item category select.
4. Case-only rewrite of a category option rewrites `items.category`.

### O6. Sale / receiving integration

**Files:** `src/lib/sale/sale-model.ts`, `src/lib/sale/sale-lib.ts`, `src/lib/sale/types.ts`, `src/lib/receiving/receiving-model.ts`, `src/lib/receiving/receiving-lib.ts`, `src/lib/receiving/receiving-store.ts`, sale/receiving register components, receipts/PDFs.

**Contract:**

- Add `copyAttributeLinks(itemId, fk: "sale_id"|"receiving_id", id)` to the attribute repository: copy every item-level link (including `attribute_id` NULL) into a new row with the fk set, inside the caller's transaction, per cart line, unconditionally.
- Sale save replaces `sale-model.ts:168-175` with this copy (no swallowed exception).
- Receiving `completeReceiving` adds the same call after each `receivingsItems` insert.
- Cart line construction populates `attributeValues`/`attributeDtvalues` via `getLinkValues` (id null → item-level, all non-GROUP attributes; id set → flags filter).
- Register components and receipts/invoices render `name + " " + attributeValues + " " + attributeDtvalues` (receipts: values only, upstream parity).
- Receiving delete relies on cascade (after O1) or explicitly deletes links.

**Acceptance tests:**
1. Completing a sale with an item carrying TEXT + DATE attributes inserts sale links equal to the item links (same `attribute_id`s).
2. Completing a receiving does the same with `receiving_id`.
3. Two sales of the same item produce two independent sale link sets (no unique collision).
4. Cart/receipt rendering includes the values; DATE renders in the configured locale.
5. Cancelling a sale keeps links; hard-deleting a receiving removes them.
6. Editing the item after the sale does not change the sale's historical values.

### O7. Reports

**Files:** `src/lib/reports/*`, `src/app/(secure)/reports/*`.

**Contract:** detailed sales columns from `SHOW_IN_SALES`, detailed receivings from `SHOW_IN_RECEIVINGS`, joined on `(item_id, sale_id/receiving_id)` with `definition_id IN (...)`, values/dates/decimals expanded into columns (upstream `Detailed_sales.php:190-196`, `Detailed_receivings.php:137-141`).

**Acceptance tests:** report with 2 flagged definitions shows 2 extra columns; sale/receiving rows display historical values; unflagged definitions produce none.

### O8. CSV parity

**Files:** `src/app/api/items/csv-import/route.ts`, `src/app/api/items/csv-template/route.ts`, attribute repository.

**Contract:**

- Template: exact upstream header list/order, `location_<name>`, `attribute_<definitionName>`, BOM; include GROUP columns; no `-1` sentinel.
- Import preflight: require every template header (`csvImportHasRequiredItemHeaders`) else reject the file.
- Row validation: DROPDOWN value must be in `getDefinitionValues` (+empty); DECIMAL numeric; DATE `isValidDate`; on failure log and fail the row (whole import rolls back with partial-failure message).
- `saveCSVRowAttributeData(rowValues, itemId, definitions)`:
  - `_DELETE_` (case-insensitive) → `deleteAttributeLinks(itemId, thatDefinitionId)` only;
  - empty/whitespace → no change (not a delete);
  - CHECKBOX `false`/`0` → `'0'`, else `'1'`;
  - otherwise `storeCSVAttributeValue` (typed column, global dedupe, case-only rewrite, per-definition link replace);
  - return false if any link fails.
- On import completion call `deleteOrphanedValues()`.

**Acceptance tests:**
1. Template header set equals upstream for the same locations/definitions.
2. Missing `attribute_<name>` column → whole import rejected.
3. DROPDOWN invalid value → row failed, import rolled back.
4. DATE `_DELETE_` (lower-case) removes only that definition's item link.
5. Re-import same row twice → one link (no duplicates).
6. DATE/DECIMAL values land in `attribute_date`/`attribute_decimal` and reuse existing rows.
7. CHECKBOX `false` → `'0'` and uses the shared 0 row; `true` → `'1'`.
8. Case-only text difference rewrites capitalization and links to the same row.

### O9. Attributes UI parity

**Files:** `src/app/(secure)/attributes/**`, `src/components/attributes/**`.

**Contract:**

- Manage page: ID, Name, Type, Visibility, Group columns; search; sort; pagination (config lines per page); bulk delete with confirm (`confirm_delete`); flags display translated and `-` for GROUP.
- Form: type conversion locks (DATE/GROUP/DECIMAL disabled when current), hide GROUP/DATE/DECIMAL options for DROPDOWN/CHECKBOX, hide GROUP for TEXT; unit only for DECIMAL; values list only for DROPDOWN; flags multiselect including `SHOW_IN_SEARCH`, default all four on create; group select always shown (except category), `''` for none (store NULL); category `-1` lockout (name/type disabled, group/flags hidden); value add/remove posts to value endpoints for existing definitions; `_`/`|` validation; new definitions post `values` JSON; edit does not post values.
- Wire the currently dead server actions (suggest, save value, delete value, get values, get row, search).

**Acceptance tests:**
1. Create a new attribute without touching flags → visible in items, sales, receivings and search (all four flags).
2. Editing a DATE definition hides/ locks the type select.
3. Removing a dropdown option in edit mode deletes its `attribute_links` NULL-item row and only unlinks the value if unused.
4. Posting `definition_group = ''` stores NULL; posting a non-GROUP id is rejected with an error message.
5. Category definition form locks name/type and hides group/flags.
6. Values containing `_`/`|` are rejected.
7. Bulk delete removes selected definitions and their links.

### O10. Suggestions and item widget endpoints

**Files:** attribute repository, item form component, new route(s) or server actions.

**Contract:** `suggestAttribute(definitionId, term)` returns value objects `{value: attributeId, label: value}` (upstream shape), used by the item editor for TEXT/DECIMAL/DATE autocomplete and by the definition form for option autocomplete. (The target's current `getSuggestions` definition search must be repurposed or removed.)

**Acceptance tests:** suggestions are scoped to the definition and term; response shape matches upstream; item editor autocomplete populates the input without creating a value until save.

### O11. Search parity (items)

Already covered by O4 item 6; keep separate only if the search implementation lands in a dedicated module. Upstream behaviour reference: `Item.php:151-179` (parser), `193-282` (named joins), `288-307` (sort), plus tests `ItemSearchTest.php:231-449`.

### O12. Tests and fixtures

**Files:** new `src/lib/attributes/repository.test.ts`, `src/lib/attributes/conversion.test.ts`, `src/lib/items/search-attributes.test.ts`, updated `e2e/attributes.spec.ts`, new e2e `items-attributes.spec.ts`, new `src/lib/test-fixtures/attributes.ts`.

**Contract / fixtures:**

- `createAttributeDefinition(name, type = TEXT, flags = 15): number`
- `linkAttributeValue(itemId, definitionId, value, type?)` using `saveAttributeValue`
- `linkDropdownOption(definitionId, value): attributeId`
- `createItemWithAttributes(...)`
- Seeded category definition fixture (`definition_id = -1`).

**Acceptance tests to port from upstream:** `ItemsControllerTest::testImportDeleteAttributeFromExistingItem`, `testImportItemWithAttributeText`, `testImportItemWithAttributeDropdown`, header tests `testGenerateCsvHeaderWithAttributes`, `testGenerateAttributeHeaders`, `testGenerateAttributeHeadersRemovesNegativeOneIndex`, `testMissingAttributeColumnIsRejected`, plus `ItemSearchTest` named-attribute cases and `GetItemDataRowTest::testDefinitionNamesPassedThroughToExpandAttributeValues`.

### Ordering rationale

1. **O1** first: uniqueness/FK semantics gate every write path; without it duplicate links and sale collisions persist.
2. **O2/O3** next: the conversion engine and value/link primitives are prerequisites for items, CSV, sale/receiving.
3. **O4** (item editor) exposes the primitives to users and fixes the `a.value` bug.
4. **O8** (CSV) depends on O3 semantics.
5. **O5** (category) depends on O2 explicit `-1` insert and O3 value primitives.
6. **O6** (sale/receiving) depends on O1 uniqueness and O3 link reads.
7. **O7** (reports), **O9/O10** (UI refinements), **O11** (search) afterwards.
8. **O12** fixtures/tests are written incrementally with each obligation; the listed tests are the exit gate.

---

## 11. Upstream test coverage note

There is **no `tests/Models/AttributeTest.php` and no `tests/Controllers/AttributesControllerTest.php`** (verified directory listings). Attribute behaviour is exercised indirectly:

- `tests/Controllers/ItemsControllerTest.php`:
  - `testGetAttributesEscapesMaliciousDefinitionName` (273-303) — definition names are escaped in the item attribute partial;
  - `testGenerateCsvHeaderWithAttributes` / `testGenerateAttributeHeaders` / `testGenerateAttributeHeadersRemovesNegativeOneIndex` (334-372);
  - `testMissingAttributeColumnIsRejected` (476-...);
  - `testImportDeleteAttributeFromExistingItem` (759-803) — `_DELETE_` removes the link and `getAttributeValue` then returns `NEW_ENTRY`;
  - `testImportItemWithAttributeText` (805-846) and `testImportItemWithAttributeDropdown` (848-...).
- `tests/Models/ItemSearchTest.php:231-449` — named attribute syntax, comma separator, combined free text, decimal/date typed matching, locale decimals, unknown attribute returns zero.
- `tests/Helpers/GetItemDataRowTest.php:78-99` — `definition_id => value` expansion.
- `tests/Support/ItemSearchFixtureTrait.php:95-132` — `createAttributeDefinition`, `linkAttributeValue` (reuses existing value rows, noting the unique constraint), `linkTypedAttributeValue`.
- `tests/Libraries/Sale_libPaymentTest.php` and `tests/Controllers/SalesControllerTest.php` only carry incidental `attributeValues` fixture fields.

This means the target's obligations need a new dedicated EAV test suite; upstream gives semantics but not a runnable oracle for conversion.

---

## 12. Unknowns

- **U1 — `where('definition_fk')` semantics.** `Attribute.php:254` calls CI4 `where()` with one argument. `vendor/` is not installed in `/home/yash/ospos`, so the generated predicate could not be verified. The two candidates are `definition_fk IS NULL` (a top-level-group filter, which is semantically sensible) and `definition_fk = 1` (nonsensical). The observable test is: with one top-level GROUP and one child GROUP, the definition form's Group select must list only the top-level group. Resolve before implementing O2's `getDefinitionsByType`.
- **U2 — final live DB state.** The migration chain in this commit ends with `3.4.1` (RESTRICT FKs) but a real deployment upgraded through `20250213` may still have CASCADE FKs if migrations were partially applied; no schema dump exists in the repo. The report assumes the full migration chain ran.
- **U3 — DECIMAL precision.** Upstream `DECIMAL(7,3)` vs target `decimal(15,4)`/`real`. Rounding/overflow behaviour (e.g. 12345.678 accepted upstream? `7,3` allows 4 integer digits) differs. Needs an explicit decision for the target schema.
- **U4 — collation.** Upstream uniqueness and case-insensitive comparisons depend on MySQL `utf8mb4_unicode_520_ci`/`utf8_general_ci`; SQLite's default `BINARY` collation is case-sensitive. The target must emulate case-insensitivity deliberately; whether the parity owner wants exact byte-level uniqueness or case-insensitive uniqueness per dialect is unresolved.
- **U5 — intended behaviour of `saveAttributeValue`'s unused `$attributeId`.** Either dead legacy (likely) or an intended update-in-place feature that never landed. The target should not replicate the parameter but should replicate the value-equality reuse behaviour.
- **U6 — `check_data_validity` last-row bug.** Whether to reproduce the "only last row decides" behaviour or fix it. This affects whether a mixed-validity TEXT→DATE conversion succeeds. Marked `DECISION` in O2.
- **U7 — `DROPDOWN→TEXT` and `TEXT→GROUP` failures.** Both return false from `convert_definition_data` and roll back (`Attribute.php:441-498`). Whether these are intended restrictions or bugs is not documented; O2 treats them as parity `DECISION` items.
- **U8 — GROUP flag display.** `get_attribute_definition_data_row` reads `$attribute->definition_type` (model property, not row) at `tabular_helper.php:708`, so the `"-"` branch is effectively dead. Target parity for the Group column display is ambiguous (show `-` by intent, or reproduce the bug).
- **U9 — orphaned links on suspended-sale reuse.** `clear_suspended_sale_detail` does not clear `attribute_links` rows for the sale; the unique constraints may or may not prevent new copies. Behavioural impact on suspended-sale re-saves is untested upstream.
- **U10 — category attribute values and item deletion.** `items.category` is only synced on case-only rewrites; a category option deletion does not update items that already use it. Whether target should do more is undefined by upstream.
- **U11 — MySQL driver parity.** The target's attribute repository is `getDbSync()` only; the MySQL schema exists but no attribute code path can run under `DB_DRIVER=mysql`. Whether parity requires dual-driver attribute support or SQLite-only is a project-level decision.
- **U12 — target's intended dropdown semantics.** Because `define_values` in the target are never surfaced to the item form, it is unclear whether the port intended dropdown-as-text or the upstream option pool. O2/O3/O4 assume upstream option-pool semantics.
