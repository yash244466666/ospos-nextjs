# Ancillary subsystems reconstruction report (giftcards, rewards, dinner tables, expenses, cashups, messages/SMS)

Status: analysis-only. Source of truth: `/home/yash/ospos` at commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea` (OSPOS 3.4.3, CodeIgniter 4).
Target: `/home/yash/Desktop/yash/ospos-nextjs` (Next.js 16 + Drizzle ORM; SQLite primary, MySQL mirror).
Scope: giftcards, customer reward packages/points, dinner tables, expenses, expense categories, cashups, messages/SMS (plus the Email/Mailchimp touch points that messages could plausibly use).

Every claim cites `path:line`. Where the target has no corresponding file or behavior, that is stated explicitly. The report does **not** implement anything; section 12 enumerates implementation obligations, data contracts and acceptance criteria in dependency order.

---

## 0. Method and shared upstream mechanics

### 0.1 Routing and authorization

- CI4 improved auto-routing is enabled (`app/Config/Routing.php:97` `public bool $autoRoute = true;`), so each of these subsystems is reachable as `GET|POST /<controller>/<method-with-get-post-prefix-stripped>`. There are no explicit routes for giftcards/expenses/cashups/messages/dinner tables in `app/Config/Routes.php`.
- All six controllers extend `Secure_Controller` with the module id:
  - `Giftcards::__construct` → `parent::__construct('giftcards')` (`app/Controllers/Giftcards.php:16`).
  - `Expenses::__construct` → `parent::__construct('expenses')` (`app/Controllers/Expenses.php:18`).
  - `Expenses_categories::__construct` → `parent::__construct('expenses_categories')` (`app/Controllers/Expenses_categories.php:15`).
  - `Cashups::__construct` → `parent::__construct('cashups')` (`app/Controllers/Cashups.php:22`).
  - `Messages::__construct` → `parent::__construct('messages')` (`app/Controllers/Messages.php:16`).
  - Dinner tables and reward packages have **no controller of their own**; they are edited through the Config controller (`parent::__construct('config')`, `app/Controllers/Config.php:50`), specifically `postSaveTables` (`:898`) and `postSaveRewards` (`:987`).
- `Secure_Controller::__construct` throws `RedirectException("no_access/$module_id/$submodule_id")` when the logged-in employee lacks the module grant (`app/Controllers/Secure_Controller.php:41-49`).
- CSRF is enforced globally for all non-`login|migrate` requests (`app/Config/Filters.php:81`). Consequently every mutating endpoint below (`postSave`, `postDelete`, `send`, `send_form`, `ajax_cashup_total`, `postCheckNumberGiftcard`, `postSaveTables`, `postSaveRewards`) is CSRF-protected in upstream. The Next port uses Server Actions, which carry Next's built-in action protection; there is no per-form CSRF token in the target forms.

### 0.2 Module/permission seed facts

| Module | Defined at | Permission row | Admin grant |
|---|---|---|---|
| `giftcards` | `app/Database/Migrations/sqlscripts/initial_schema.sql:315` | `:386` | `:432` |
| `messages` | `initial_schema.sql:318` | `:389` | `:435` |
| `expenses` | `3.1.1_to_3.2.0.sql:122` | `:127` | `:131` |
| `expenses_categories` | `3.1.1_to_3.2.0.sql:123` | `:126` | `:132` |
| `reports_expenses_categories` (sub-permission of `reports`) | `3.1.1_to_3.2.0.sql:128` | same | `:133` |
| `cashups` | `3.2.1_to_3.3.0.sql:52-59` | `:55-56` | `:58-59` |
| `rewards` / `dinner_tables` | **do not exist** | — | — |

The target seed mirrors most of this (`src/db/seed.ts:109,120-123,130,147,160-163`) but adds non-upstream permission ids `reports_cashups` (`:147`) and omits the upstream `reports_expenses_categories` (`3.1.1_to_3.2.0.sql:128`).

Upstream has **no** `rewards` or `dinner_tables` permission, and no `reports_giftcards`/`reports_cashups` permission. Target code nevertheless references `requirePermission("rewards")` and `requirePermission("dinner_tables")` in dead helper actions (see §11.2).

### 0.3 Tabular helper rows (exact columns and formatting)

`app/Helpers/tabular_helper.php` owns the JSON row shapes consumed by the Bootstrap-table `table_support` JS.

- Giftcards: headers `giftcard_id, last_name, first_name, giftcard_number, value` (`:534-543`); row adds `edit` anchor (`:556-576`); `value` formatted with `to_currency` (`:565`).
- Expense categories: headers `expense_category_id, category_name, category_description` (`:732-739`); row + `edit` anchor (`:752-770`).
- Expenses: headers `expense_id, date, supplier_name, supplier_tax_code, amount, tax_amount, payment_type, category_name, description, created_by` (`:772-786`); row formats `date` with `to_datetime(strtotime(...))`, money with `to_currency`, `created_by` = `first_name . ' ' . last_name` (`:799-824`); a synthetic last row sums `amount`/`tax_amount` and labels the row `lang('Sales.total')` (`:829-846`); payment summary HTML is `payment_type: to_currency(amount)` per group (`:851-863`).
- Cashups: headers `cashup_id, open_date, open_employee_id, open_amount_cash, transfer_amount_cash, close_date, close_employee_id, closed_amount_cash, note, closed_amount_due, closed_amount_card, closed_amount_check, closed_amount_total` (`:865-882`); `note` is rendered as a check/remove glyph and the header is `escape => false` (`:876`); row resolves open/close employee names (`:898-926`).
- Customers/suppliers table gain a `messages` action column when the viewer has the `messages` grant (`:209-210`, `:229-240` for customers, `:275-276`, `:296-307` for suppliers); the link is disabled when `phone_number` is empty (`:229-232`).

### 0.4 Money/date helpers used by these subsystems

- `parse_decimals(string $number, ?int $decimals = null)` parses through `NumberFormatter` with `number_locale`/`currency_decimals`, rejects `false`, values `> MAX_PRECISION` or `> 1.e14`, and returns float (`app/Helpers/locale_helper.php:477-510`). It does **not** reject negative values.
- `to_currency_no_money()` (`locale_helper.php:379`) formats a raw number without currency symbol; used in forms and the cashup AJAX total.
- `get_payment_options()` returns ordered localized payment labels driven by `payment_options_order`, then appends `Due`, `Check`, `UPI` (when country code contains `IN`), `Bank Transfer`, `Wallet` (`locale_helper.php:240-283`). `get_reference_code_payment_types()` returns only `Debit`/`Credit` (`:286-291`).
- `date_or_time_format` config flips date filtering between `DATE(...)`/`DATE_FORMAT(...)` and raw timestamp comparisons in Expense, Cashup, reports (`Expense.php:148-152`, `Cashup.php:139-143`, `Summary_payments.php:46-50`).

---

## 1. Giftcards

### 1.1 Schema

Upstream table `giftcards` (SQLite-equivalent columns; physical MySQL below):

```sql
CREATE TABLE `ospos_giftcards` (
    `record_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `giftcard_id` int(11) NOT NULL AUTO_INCREMENT,
    `giftcard_number` int(10) NOT NULL,
    `value` decimal(15,2) NOT NULL,
    `deleted` int(1) NOT NULL DEFAULT '0',
    `person_id` INT(10) DEFAULT NULL,
    PRIMARY KEY (`giftcard_id`),
    UNIQUE KEY `giftcard_number` (`giftcard_number`),
    KEY `person_id` (`person_id`)
)
```
(`app/Database/Migrations/sqlscripts/initial_schema.sql:139-148`; FK `giftcards_ibfk_1` → `people.person_id` at `:874-877`.)

Later migrations:
- `giftcard_number` widened from int to `VARCHAR(255) NULL` (`3.0.2_to_3.1.1.sql:222-224`), unique index retained from the original definition.
- `value` re-declared `decimal(15,2) NOT NULL` (`3.0.2_to_3.1.1.sql:338`).
- New config key `giftcard_number` seeded with `'series'` (`3.0.2_to_3.1.1.sql:229`).
- Table converted to `utf8_general_ci` (`:354`), then `utf8mb4_unicode_520_ci` (`3.4.3_mysql84_utf8mb4_conversion.sql` list).

Model declaration: `protected $table = 'giftcards'`, PK `giftcard_id`, no soft-delete trait; allowed fields are exactly `giftcard_number, value, deleted, person_id, record_time` (`app/Models/Giftcard.php:14-24`).

### 1.2 Model API (exact semantics)

| Method | Behavior | Cite |
|---|---|---|
| `exists(int $giftcard_id): bool` | row count == 1 where `giftcard_id` **and `deleted = 0`** | `Giftcard.php:29-36` |
| `get_max_number(): ?object` | `SELECT CAST(giftcard_number AS UNSIGNED) AS giftcard_number WHERE giftcard_number REGEXP '^[0-9]+$' ORDER BY giftcard_number DESC LIMIT 1` | `:41-50` |
| `get_total_rows(): int` | count where `deleted = 0` | `:55-61` |
| `get_info(int $giftcard_id): object` | LEFT JOIN `people`; `deleted = 0`; one row → row object; otherwise `getEmptyObject('giftcards')` where int/tinyint/decimal fields become `0` and the PK becomes `NEW_ENTRY` (-1), other fields `null` | `:66-104` |
| `getGiftcardId(string $giftcardNumber): int|false` | `deleted = 0`; exactly one row → `giftcard_id`; else `false` | `:109-122` |
| `get_multiple_info(array ids)` | `whereIn giftcard_id`, `deleted = 0`, order by `giftcard_number asc` | `:127-135` |
| `save_value(array &$data, int $id = NEW_ENTRY)` | if `id == NEW_ENTRY || !exists(id)` → insert; **after insert it overwrites `$data['giftcard_number']` and `$data['giftcard_id']` with `insertID()`**; otherwise update `where giftcard_id = id` | `:140-158` |
| `update_multiple(array $data, array $ids)` | `whereIn` update; documented as never called | `:163-169` |
| `delete($id, $purge=false)` | soft delete `deleted = 1` | `:174-180` |
| `delete_list(array $ids)` | `whereIn` UPDATE `deleted = 1` | `:185-191` |
| `get_search_suggestions(string $search, int $limit = 25)` | two queries: (a) giftcards `giftcard_number LIKE %term%`, `deleted=0`, order asc; (b) **customers joined to people**, `first_name OR last_name OR CONCAT(first_name," ",last_name) LIKE`, `deleted=0`; returns a flat list of `['label' => ...]`; slice to `$limit` | `:196-229` |
| `get_found_rows(string $search)` | `search(..., count_only: true)` | `:234-237` |
| `search(string $search, ?int $rows=0, ?int $limit_from=0, ?string $sort='giftcard_number', ?string $order='asc', ?bool $count_only=false)` | joins `people AS person`; search group: person first/last/full name, `giftcards.giftcard_number`, `giftcards.person_id`; `giftcards.deleted = 0`; count-only returns `COUNT(giftcard_id)`; order by caller sort/order; `limit($rows, $limit_from)` only when `$rows > 0` | `:242-287` |
| `get_giftcard_value(string $number): float` | if `!exists(getGiftcardId(number))` return `0`; otherwise select `value` by number | `:292-302` |
| `update_giftcard_value(string $number, float $value): void` | unconditional `UPDATE value` by number | `:307-312` |
| `decrementGiftcardValue(string $number, float $amount): bool` | rejects `<= 0`; single atomic `UPDATE ... WHERE giftcard_number=? AND deleted=0 AND value >= amount SET value = value - amount`; returns `update() && affectedRows() > 0` | `:314-327` |
| `incrementGiftcardValue(string $number, float $amount): bool` | rejects `<= 0`; atomic `value = value + amount` where number + `deleted=0` | `:329-341` |
| `exists_giftcard_name($name): bool` | uppercases, compares `giftcard_number` with `deleted = 0` | `:346-355` |
| `generate_unique_giftcard_name(string $value): string` | `str_replace('.', 'DE', $value)`; `bin2hex(openssl_random_pseudo_bytes(3))`; name `"$random-$value"`; if it collides, calls itself but **discards the recursive return value**; returns uppercased name | `:360-371` |
| `get_giftcard_customer(string $number): int|null` | returns `0` when the card does not exist; otherwise `person_id` (which may be `null`) | `:379-389` |

The upstream giftcard tests pin the decrement/increment contract exactly: sufficient balance succeeds; insufficient leaves the value untouched; negative and zero amounts are rejected; exact balance zeroes the card; a deleted card cannot be decremented/incremented; two concurrent decrements must produce exactly one success (`tests/Models/GiftcardTest.php:59-191`). This is the strongest behavioral contract in this subsystem and must be replicated.

### 1.3 Number generation and uniqueness

There are two upstream modes driven by config `giftcard_number`:

1. `series` (the migration default, `3.0.2_to_3.1.1.sql:229`):
   - View prefills `1 + max(CAST(giftcard_number AS UNSIGNED))` over numeric-looking numbers (`app/Controllers/Giftcards.php:103-105`, `Giftcard.php:41-50`).
   - The field is marked `required` and validated `required, number` **and** remote uniqueness against `giftcards/checkNumberGiftcard` (`app/Views/giftcards/form.php:118-131`, `:139-145`).
2. `random`:
   - View leaves the number empty for new cards; the field is not required (`Giftcards.php:100-102`, `form.php:33-37`).
   - On save, when the submitted number is blank **and** the record is new, the controller calls `generate_unique_giftcard_name('')` (`Giftcards.php:121-123`). With the actual code that yields a string shaped `"<6 UPPER HEX>-"` (for example `A1B2C3-`), because the `$value` argument is empty.

Uniqueness enforcement is layered:
- DB unique index on `giftcard_number` (`initial_schema.sql:147`).
- `exists_giftcard_name` uppercases and consults live rows (`Giftcard.php:346-355`).
- `postCheckNumberGiftcard` compares `getGiftcardId(number)` to the posted `giftcard_id`; returns the JSON **string** `"true"`/`"false"` (`Giftcards.php:162-170`).
- Only live rows are considered by `getGiftcardId` (`deleted=0`, `:109-122`), so a number belonging to a soft-deleted card passes the remote check but fails on insert against the unique index; the user then sees the generic `error_adding_updating` message.

Known upstream defects to preserve or consciously fix:
- The recursive collision path in `generate_unique_giftcard_name` does not return the retried name (`:366-368`).
- `save_value` replaces the number in the response array with `insertID()` (`:146-147`), so the success toast for a new card prints the id, not the generated number. The stored DB row keeps the submitted/generated number.
- `postCheckNumberGiftcard` sanitizes the number with `FILTER_SANITIZE_NUMBER_INT` (`:165`), which strips non-digits, so it is only meaningful in `series` mode.

### 1.4 Value range and validation

- Controller parses the submitted `giftcard_amount` through `parse_decimals` (`Giftcards.php:128`); there is no min/max, no non-negative check, and no upper bound (`locale_helper.php:477-510`).
- Form requires the value field and applies a remote numeric check (`form.php:132-135`, `:146-149`). Note: the referenced route `giftcards/checkNumeric` **is not implemented anywhere** in the upstream tree; a grep over `app/` finds only view references (`app/Views/giftcards/form.php:134`, `app/Views/expenses/form.php:232-235`, `app/Views/items/form.php:562-584`). With jQuery Validate this makes the remote rule fail closed/erratic; treat the server-side `parse_decimals` as the real validation.
- `value` is `decimal(15,2)` upstream; a submitted value with more than two decimals is rounded by MySQL.
- Redemption math uses `min(amount_due, card_value)` and clamps the remainder to `>= 0` (`Sales.php:485-490`).

### 1.5 CRUD, search, deleted, date

- Listing/search has **no date filter and no deleted filter**: `search()` always pins `giftcards.deleted = 0` (`Giftcard.php:273`). Deleted rows are invisible in the UI.
- Search covers person first/last/full name, giftcard number, and `person_id` (`:266-272`).
- `getSearch` returns `{total, rows}`; `total` comes from `get_found_rows` and rows from `get_giftcard_data_row` (`app/Controllers/Giftcards.php:34-51`).
- `postDelete` accepts `ids` and soft-deletes the list (`:175-187`). There is no restore endpoint and no deleted checkbox on the giftcard form.
- `getView` is used both for new and edit; `get_info` returns the empty object for `NEW_ENTRY` (`Giftcards.php:93-111`).

### 1.6 Person linkage

- `person_id` is nullable and FK to `people.person_id` (`initial_schema.sql:145,874-877`).
- The form has a `person_name` autocomplete sourced from `customers/suggest` and a hidden `person_id` (`form.php:19-30`, `:88-97`).
- Controller stores `null` when the posted `person_id` is empty, otherwise the sanitized integer (`Giftcards.php:129`).
- At sale time the customer linkage is enforced: a card owned by a different customer cannot be used (`Sales.php:477-483`; message `Giftcards.cannot_use`, `app/Language/en/Giftcards.php`).
- `get_giftcard_customer` returns `0` for a nonexistent card, and the sale controller tests `isset($currentGiftcardCustomer) && $currentGiftcardCustomer != $customerId && $currentGiftcardCustomer != null` (`Sales.php:480`), so `0` from a bad number does not by itself produce `cannot_use`; the balance check then produces the remaining-balance error.

### 1.7 Redemption at sale (exact flow)

1. Payment dropdown includes `lang('Sales.giftcard')` because `Sale::get_payment_options($giftcard=true, $reward_points=true)` adds it (`app/Models/Sale.php:954-964`; called from `Sale_lib::get_payment_options`).
2. `postAddPayment` (`app/Controllers/Sales.php:405-543`):
   - Rejects malformed payment type strings that merely contain the giftcard/rewards label unless they are exactly the label (`:417-425`).
   - Giftcard rule: `amount_tendered` is `trim|required|integer` (`:430-432`) — the "amount" field is reused as the giftcard **number**.
   - `$giftcardNumber = parse_decimals(posted)` (`:470-471`); `$paymentType = lang('Sales.giftcard') . ':' . $giftcardNumber` (`:474`). This is the canonical payment-id contract: **`Gift Card: <number>`**.
   - Existing amount for the same card (`:475`), current card value (`:476`), current card owner (`:477`), current cart customer (`:478`).
   - owner mismatch → `Giftcards.cannot_use` (`:480-481`).
   - `(value - already_added_for_this_card) <= 0` in `sale` mode → `Giftcards.remaining_balance` (`:482-483`).
   - otherwise remainder = `value - amount_due`, clamped to 0; stored in session `sales_giftcard_remainder`; warning `remaining_balance`; actual payment amount = `min(amount_due, value)` (`:485-492`).
3. Persistence at completion (`app/Models/Sale.php:579-602`):
   - Split payment type on the first `:` only (`explode(':', ..., 2)`).
   - Prefix equals `lang('Sales.giftcard')` → `applyGiftcardPayment(number, amount, saleType, saleStatus)`.
   - `applyGiftcardPayment` (`:702-721`): return-mode credit (`SALE_TYPE_RETURN` and amount < 0) increments the card when the sale is `COMPLETED`; a non-completed return credit is a no-op success; missing number fails; otherwise it calls `decrementGiftcardValue`.
   - Any failure rolls back the whole sale transaction and returns `INSUFFICIENT_GIFTCARD_BALANCE` = `-2` (`app/Config/Constants.php:90`).
4. Controller translates `-2` into `lang('Sales.insufficient_giftcard_balance')` and reloads the register for every sale mode (`Sales.php:894-899`, `:934-939`, `:974-979`, `:1008-1013`).
5. Deleting a cart payment refunds nothing at this stage: the card is only touched when the sale is saved (upstream has no add-time deduction), so abandoned carts never spend the card.

### 1.8 Giftcard UI (upstream)

- `giftcards/manage.php`: Bootstrap table against `giftcards` with `uniqueId: giftcard_id`, new button (`modaldlg` to `giftcards/view`), bulk delete toolbar, no date picker, no filter dropdown (`app/Views/giftcards/manage.php:11-39`).
- `giftcards/form.php`: customer autocomplete + hidden id, number field (required only in `series`), currency-symbol-wrapped amount, jQuery validation with remote number-uniqueness and remote numeric (`:16-72`, `:99-151`).
- Success/failure contract: `{success:bool, message:string, id:int}`; new-card message appends `$giftcard_data['giftcard_number']` (the insert id, see §1.3), update appends the posted number, failure id is `NEW_ENTRY` (`Giftcards.php:132-153`).

### 1.9 Target implementation (files and behavior)

Files:
- Schema: `src/db/schema/giftcards.ts:4-10`; MySQL mirror `src/db/schema/mysql/index.ts:399-405`; generated SQLite DDL `drizzle/sqlite/0000_skinny_power_man.sql:400-405`.
- Repository: `src/lib/giftcards/repository.ts` (1-91).
- Server actions: `src/app/(secure)/giftcards/actions.ts` (1-62).
- Pages: `src/app/(secure)/giftcards/page.tsx` (1-23), `src/app/(secure)/giftcards/new/[id]/page.tsx` (1-22).
- Components: `src/components/giftcards/giftcard-form.tsx` (1-39), `src/components/giftcards/giftcards-table.tsx` (1-39).
- API: `src/app/api/giftcards/suggest/route.ts` (1-11) — **no caller anywhere in `src/`**.

Observed target behavior:
- Columns: `giftcard_id, giftcard_number (text, notNull, unique), value (real), person_id, deleted` (`src/db/schema/giftcards.ts:4-10`). **`record_time` is absent.**
- `getAll` filters `deleted=false`, orders by `giftcard_id DESC`, default limit 25 (`repository.ts:15-20`); the page ignores pagination and selects **all** rows directly (`page.tsx:11`).
- `getInfo` does **not** filter `deleted` (`repository.ts:22-25`), so a deleted card is still editable via `/giftcards/new/<id>`.
- `getGiftcardValue` filters `deleted=false` and returns `{giftcardNumber, value, personId}` or `null` (`:27-32`). `getGiftcardCustomer` also returns name (`:34-41`).
- `saveValue` updates number/value/person or inserts (`:43-56`); it is **not used** by the action (the action writes Drizzle directly).
- `deleteGiftcard` soft-deletes (`:58-61`); `deleteList` loops (`:83-88`).
- `search` matches **only** `giftcard_number LIKE %term%` (`:63-67`); `getSearchSuggestions` delegates to `search` — no customer-name suggestions, and returns rows instead of `{label}` (`:79-81`).
- Action `saveGiftcardAction` (`actions.ts:16-47`):
  - Auto-number: 14 random digits, up to 10 attempts, uniqueness checked against **all** rows including deleted (`:10-14`, `:24-30`).
  - Explicit number: conflict check against all rows (`:31-34`).
  - `value = parseFloat(...) || 0`; negative accepted; more than 2 decimals accepted as `real` (`:21`).
  - Always redirects to `/giftcards`; success/failure is not surfaced as JSON; only thrown errors render (`giftcard-form.tsx:14-17`).
  - There is no `record_time`, no config awareness (`giftcard_number` series/random), no max+1 series prefill.
- Form fields: number text input (blank = auto), numeric value, customer `<select>` built from all non-deleted customers (`new/[id]/page.tsx:13-20`, `giftcard-form.tsx:19-33`).
- Table: Number, Value, Customer (raw `personId`, not a name), Edit/Delete; no ID column, no last/first name columns, no bulk delete (`giftcards-table.tsx:13-36`).

### 1.10 Giftcard gaps (numbered)

| ID | Gap | Upstream cite | Target cite |
|---|---|---|---|
| G-GC-1 | `record_time` column missing from both SQLite and MySQL schemas and never written; upstream writes `date('Y-m-d H:i:s')` on every save | `Giftcard.php:23`, `Giftcards.php:126`, `initial_schema.sql:140` | `src/db/schema/giftcards.ts:4-10`, `mysql/index.ts:399-405` |
| G-GC-2 | `giftcard_number` config (`series`/`random`) not read; auto-generation is 14 digits instead of upstream `"<6 hex>-"`; no max+1 prefill; no required/number validation | `Giftcards.php:100-105,121-123`; `Giftcard.php:360-371`; `form.php:33-48,118-131` | `actions.ts:10-14,24-34`; `giftcard-form.tsx:20-22` |
| G-GC-3 | Uniqueness check must be live-only (deleted excluded) plus DB unique index; target checks deleted rows too and has no remote uniqueness endpoint | `Giftcard.php:109-122,346-355`; `Giftcards.php:162-170` | `actions.ts:27,32`; no endpoint |
| G-GC-4 | Search must cover customer first/last/full name, card number, person id; target matches number only. Suggestions must return giftcard numbers **and** customer names with `{label}` shape and must be exposed at a `/giftcards/suggest` API | `Giftcard.php:196-229,242-287`; `Giftcards.php:59-76` | `repository.ts:63-67,79-81`; API exists but returns rows and is unused |
| G-GC-5 | Listing must be server-paginated/sorted with `{total, rows}` and the five upstream columns (id, last name, first name, number, value), with `value` currency-formatted and customer name resolved | `tabular_helper.php:534-576`; `Giftcards.php:34-51` | `page.tsx:11-20`; `giftcards-table.tsx:15-35` |
| G-GC-6 | Soft-deleted cards must be invisible to `get_info`; target `getInfo` returns them and allows editing | `Giftcard.php:66-80` | `repository.ts:22-25`; `new/[id]/page.tsx:12` |
| G-GC-7 | Bulk delete contract `{success, message, ids}` and bulk toolbar are missing; target deletes one row at a time with `confirm()` | `Giftcards.php:175-187`; `manage.php:29-35` | `giftcards-table.tsx:30-32`; `actions.ts:49-55` |
| G-GC-8 | No person-name autocomplete (upstream uses `customers/suggest` with `{label,value}`); target uses a full `<select>` of every customer | `form.php:88-97`; `Customers.php:123-129` | `new/[id]/page.tsx:13-20`; `giftcard-form.tsx:29-32` |
| G-GC-9 | Value validation is weaker than upstream: no currency symbol, no locale parse, no remote numeric rule; both accept negatives | `Giftcards.php:128`; `locale_helper.php:477-510` | `actions.ts:21` |
| G-GC-10 | No deleted/restore UI at all (parity with upstream, but upstream at least returns `get_empty_object` for missing ids); target silently 404s to an empty form | `Giftcard.php:75-79` | `new/[id]/page.tsx:12` |
| G-GC-11 | Giftcard redemption is not wired end to end (see §2.8/§3.8 sale integration): register checks `paymentType === "giftcard"` while the option value is `"Gift Card: "`; no number is appended; no balance/customer checks; no `INSUFFICIENT_GIFTCARD_BALANCE` sentinel | `Sales.php:430-492`; `Sale.php:579-602,702-721`; `Constants.php:90` | `register.tsx:410-417`; `sale-lib.ts:529-542`; `sale-model.ts:96-101` |
| G-GC-12 | Target decrements the card **twice**: once in `addPayment` and again inside `saveSale` (for a correctly formed `Gift Card: <n>` payment), and `deletePayment` restores the value even though the sale was never saved | `Sale.php` never decrements before save | `sale-lib.ts:534-542,624-632`; `sale-model.ts:96-101` |
| G-GC-13 | No `record_time` ordering/audit; target orders lists by `giftcard_id DESC` (upstream sorts by number asc by default) | `Giftcard.php:242-243` | `repository.ts:15-20` |

### 1.11 Giftcard acceptance tests (behavioral contract to port)

Derived from `tests/Models/GiftcardTest.php` and the controller:

1. `decrementGiftcardValue("N", 60)` on a 100 card → true, value 40.
2. `decrementGiftcardValue("N", 60)` on a 50 card → false, value 50.
3. Reject `-500` and `0` without touching the value.
4. Exact balance (60 from 60) → true, value 0.
5. Deleted card → decrement false, value unchanged.
6. Concurrent decrements of 60 from 100 → exactly one success, value 40 (SQLite: single-statement conditional UPDATE or `BEGIN IMMEDIATE`).
7. `incrementGiftcardValue` succeeds on live card, fails on deleted card, rejects negative/zero (`GiftcardTest.php:144-191`).
8. Controller: new card with blank number under `giftcard_number=random` receives a generated unique number; under `series`, the view prefills max numeric + 1 and the number is required/numeric/unique among live rows.
9. Sale save returns `INSUFFICIENT_GIFTCARD_BALANCE` and rolls back payments/items when the payment amount exceeds the live card value; return-mode credit increments the card.
10. Customer-mismatch returns `Giftcards.cannot_use`; zero/negative remaining returns `Giftcards.remaining_balance`.

---

## 2. Customer rewards: packages, points, sale earn/redeem

### 2.1 Schema (three tables plus two customer columns)

**`customers_packages`** (package catalogue):
```sql
CREATE TABLE `ospos_customers_packages` (
  `package_id` int(11) NOT NULL AUTO_INCREMENT,
  `package_name` varchar(255) DEFAULT NULL,
  `points_percent` float NOT NULL DEFAULT '0',
  `deleted` int(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`package_id`)
)
```
(`app/Database/Migrations/sqlscripts/3.0.2_to_3.1.1.sql:79-85`; `deleted` tightened to `tinyint(1) DEFAULT 0 NOT NULL` by `3.4.0_database_optimizations.sql:23`.)

Seeded packages (`3.0.2_to_3.1.1.sql:87-92`):
`1 Default 0`, `2 Bronze 10`, `3 Silver 20`, `4 Gold 30`, `5 Premium 50`.

**`customers_points`** (declared but unused by application code):
```sql
CREATE TABLE IF NOT EXISTS `ospos_customers_points` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `person_id` int(11) NOT NULL,
  `package_id` int(11) NOT NULL,
  `sale_id` int(11) NOT NULL,
  `points_earned` int(11) NOT NULL,
  PRIMARY KEY (`id`)
)
```
(`3.0.2_to_3.1.1.sql:98-105`; FKs at `:283-289`.) A repo-wide grep finds **no reads or writes** of this table in `app/`; only migration and charset statements reference it (`3.4.0_database_optimizations.sql:19`, `3.4.3_mysql84_utf8mb4_conversion.sql:10`). It is effectively a dead table in 3.4.3.

**`sales_reward_points`** (one ledger row per rewarded sale):
```sql
CREATE TABLE IF NOT EXISTS `ospos_sales_reward_points` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sale_id` int(11) NOT NULL,
  `earned` float NOT NULL,
  `used` float NOT NULL,
  PRIMARY KEY (`id`)
)
```
(`3.0.2_to_3.1.1.sql:111-117`; FK `sale_id` at `:291-293`.)

**Customer columns** added in the same migration (`3.0.2_to_3.1.1.sql:121-123`):
`customers.package_id int(11) DEFAULT NULL AFTER discount_percent`, `customers.points int(11) DEFAULT NULL AFTER package_id`. They are part of `Customer::$allowedFields` (`app/Models/Customer.php:17-33`, notably `package_id` `:27` and `points` `:28`).

**Config key**: `customer_reward_enable` seeded as `'0'` (`3.0.2_to_3.1.1.sql:127-128`).

### 2.2 `Customer_rewards` model (package CRUD) — exact semantics

Declaration (`app/Models/Customer_rewards.php:11-24`):
- `protected $table = 'customer_packages'` — **a typo**; every query in the class uses `customers_packages` (`:29`, `:49`, `:53`, `:65`, `:77`, `:88`, `:99`). The inherited CI4 Model table name is therefore wrong but unused because all access goes through the query builder.
- PK `package_id`, no soft-delete trait, allowed fields `package_name, points_percent, deleted`.

| Method | Behavior | Cite |
|---|---|---|
| `exists(int $package_id)` | row count `>= 1`; **does not filter deleted** | `:27-33` |
| `save_value(array $data, int $package_id)` | builds `{package_name, deleted: 0, points_percent}`; inserts when `!exists`, otherwise updates by `package_id`; note the forced `deleted = 0` means saving an existing package **undeletes** it | `:40-57` |
| `get_name(int)` | `package_name` by id; no deleted filter | `:63-69` |
| `get_points_percent(int)` | `points_percent` by id; no deleted filter | `:75-81` |
| `get_all()` | all rows with `deleted = 0` | `:86-92` |
| `delete($id, $purge=false)` | soft delete `deleted = 1` | `:97-103` |

There is **no uniqueness constraint** on `package_name` at DB level; duplicate prevention is only client-side (`app/Views/configs/reward_config.php:100-110`, `customer_reward` validator + `valid_chars` rejecting `_`).

### 2.3 `Rewards` model (`sales_reward_points`)

`app/Models/Rewards.php:11-43`: table `sales_reward_points`, PK `id`, allowed fields `sale_id, earned, used`. `save_value(array &$data, bool $rewards_id = false)` inserts when the id is falsy **or** when `exists()` is false — but `exists()` is not defined in this class (documented TODO at `:29`). On insert it writes `$data['id'] = insertID()`. There is never an `exists()` call with a truthy id from the only caller (`Sale::save_customer_rewards` passes no id, `Sale.php:1433`), so it always inserts.

`sales_reward_points` is consumed by report detail queries:
- `app/Models/Reports/Detailed_sales.php:203-206` selects `used, earned` per sale.
- `app/Models/Reports/Specific_customer.php:156`, `Specific_employee.php:150`, `Specific_discount.php:153` do the same.

### 2.4 Package configuration UI and bulk-save semantics

Reward packages are edited inside **Config → Rewards**, not in a dedicated module:

- `Config::getIndex` loads all live packages into `$data['customer_rewards']` (`app/Controllers/Config.php:238-239`).
- `app/Views/configs/reward_config.php`: checkbox `customer_reward_enable` (`:16-24`), a repeatable block per package with `customer_reward_<package_id>` (name) and `reward_points_<package_id>` (points percent) (`app/Views/partial/customer_rewards.php:10-44`), add/remove clone logic and duplicate/`_` validation (`reward_config.php:46-130`).
- `Config::postSaveRewards()` (`app/Controllers/Config.php:987-1030`):
  1. Saves `customer_reward_enable` as a boolean (`:991-993`).
  2. **Only when enabled**, scans every POST key containing `customer_reward` (except the enable flag) as a package name and every key containing `reward_points` as the percent, extracting the trailing `_<id>` (`:995-1008`).
  3. `save_value` each package with `{package_name, points_percent}` (`:1010-1014`).
  4. Soft-deletes every live package whose id is not in the posted set (`:1017-1024`) — i.e. removing the row from the form deletes the package.
  5. Wraps everything in a transaction and returns `{success, message}` (`:1026-1030`).
- Re-render endpoint `Config::getCustomerRewards()` returns the partial HTML (`app/Controllers/Config.php:744-749`).

There is **no dedicated create/edit/delete page per package**, no pagination, no search and no restore.

### 2.5 Customer assignment UI and persistence

- Customer form shows the package dropdown and read-only available points **only when `customer_reward_enable` is truthy** (`app/Views/customers/form.php:122-147`). Options are `'' => lang('Items.none')` followed by live package names (`app/Controllers/Customers.php:173-178`).
- `Customers::postSave` stores `package_id` as `null` when blank (`app/Controllers/Customers.php:275`).
- Points are never edited from the customer form (`available_points` input is `disabled`, `form.php:135-146`); they change only through sales (`Customer::adjustRewardPoints`).

### 2.6 Points earn/redeem calculation (exact)

**Redemption (payment add)** — `app/Controllers/Sales.php:494-517`:
1. Requires a selected customer whose `package_id` is non-empty (`:496-497`). If the customer has no package, the branch silently does nothing (no error, no payment).
2. Reads `customers.points`, null → 0 (`:498-499`).
3. Sums payments already recorded under the exact label `lang('Sales.rewards')` (`:501-502`).
4. If `points - already_used <= 0` → error `Sales.rewards_remaining_balance` + formatted current points (`:505-506`).
5. Else remainder = `points - amount_due`, clamped to 0, stored in session `sales_rewards_remainder`, warning shown, payment amount = `min(amount_due, points)` (`:508-515`).
6. Payment id is exactly `lang('Sales.rewards')` (no suffix) (`:515`).

**Persistence** — `app/Models/Sale.php:594-602`:
- Prefix equals `lang('Sales.rewards')` → `Customer::adjustRewardPoints($customerId, -payment_amount)`.
- `adjustRewardPoints` is a single atomic UPDATE that, for negative deltas, adds `WHERE points >= abs(delta)`, and returns `update() && affectedRows() > 0` (`app/Models/Customer.php:246-260`). A failure rolls back the sale and returns `INSUFFICIENT_REWARD_POINTS` = `-3` (`app/Config/Constants.php:91`; controller mapping at `Sales.php:897-899` etc.).
- `totalAmountUsed` accumulates reward payment amounts (`Sale.php:601`).

**Earn** — `Sale::save_customer_rewards` (`app/Models/Sale.php:1413-1436`):
1. Gate: non-empty `customer_id` **and** config `customer_reward_enable` (`:1417`).
2. Customer's `package_id` must be non-empty (`:1422-1424`).
3. `pointsPercent = customers_packages.points_percent` for that package, null → 0 (`:1425-1426`).
4. `totalAmountEarned = totalAmount * pointsPercent / 100` (`:1427`).
5. `adjustRewardPoints(customerId, +totalAmountEarned)` (`:1429`).
6. Insert `sales_reward_points` row `{sale_id, earned: totalAmountEarned, used: totalAmountUsed}` (`:1431-1433`).

Critical: `$totalAmount` at the call site is the sum of **all** payment amounts minus cash refunds, including giftcard and rewards payments (`Sale.php:617`, call at `:620`). Earning is therefore computed on the gross paid amount, **not** net of points redeemed. The target subtracts `totalAmountUsed` (see §2.8), which is a behavioral divergence.

There is no per-item points rule and no separate percent-vs-fixed mode: the only policy is a single percentage of the sale total per customer package.

### 2.7 Reports / register display

- Register displays a small rewards panel (`package_name`, available points) when the controller found a customer package (`app/Views/sales/register.php:330-338`; data built at `app/Controllers/Sales.php:1160-1175`).
- Sale detail reports select `used, earned` from `sales_reward_points` (`Detailed_sales.php:203-206`, `Specific_customer.php:156`, `Specific_employee.php:150`, `Specific_discount.php:153`).
- There is no dedicated rewards report and no package-level report.

### 2.8 Target implementation and mismatch analysis

Files:
- Schema: `src/db/schema/customers.ts:32-42` (`rewards`, `customerRewards`), customers table `:5-15` (has `points`, **no `package_id`**); MySQL mirror `src/db/schema/mysql/index.ts:159-198`.
- Repos: `src/lib/rewards/repository.ts` (1-51), `src/lib/customer_rewards/repository.ts` (1-50).
- Actions: `src/app/(secure)/rewards/actions.ts` (1-38).
- Pages/UI: `src/app/(secure)/rewards/page.tsx`, `rewards/new/[id]/page.tsx`, `src/components/rewards/rewards-form.tsx`, `src/components/rewards/rewards-table.tsx`.
- Sale integration: `src/lib/sale/sale-model.ts:92-119,217-232,681-693`; `src/lib/sale/sale-lib.ts:543-552,633-640`; register UI `src/components/sales/register.tsx:380-425`.

Target shape vs upstream:

| Upstream | Target | Verdict |
|---|---|---|
| `customers_packages(package_id, package_name, points_percent, deleted)` | `rewards(reward_id, name, points_percent, deleted)` | **Renamed table and columns.** All DDL/seed/report code must be rewritten or aliased; SQLite/MySQL migrations already shipped with the wrong names. |
| `customers.package_id` FK → packages | absent; only `customers.points` exists (`customers.ts:12`) | **Column missing.** No way to assign a package. |
| one package per customer | `customer_rewards(customer_id, reward_id)` many-to-many join table (`customers.ts:39-42`) | **Different model.** The sale path loops all links and awards points once per linked reward. |
| `sales_reward_points(sale_id, earned, used)` | absent | **Table missing.** No earn/used ledger; reports cannot show rewards. |
| `customers_points(...)` dead table | absent | Parity acceptable (dead upstream), but schema-parity audit may still require it. |
| `customer_reward_enable` config gate | code checks `use_customer_rewards` (`sale-model.ts:219`), while Config UI writes `customer_reward_enable` (`src/lib/config/tabs.ts:205`) | **Key mismatch → rewards permanently disabled** unless a user manually inserts `use_customer_rewards`. Seed contains neither key (`src/db/seed.ts` has no `customer_reward_enable`). |
| earn on gross total (`totalAmount * pct`) | `(totalAmount - totalAmountUsed) * pct` (`sale-model.ts:226`) | **Formula divergence.** |
| one package, one award | loop over `customerRewards` adds points N times (`sale-model.ts:221-231`) | **Multi-award bug.** |
| redeem requires non-empty `package_id` | redeems whenever a customer is selected (`sale-lib.ts:543-551`), no package check | **Missing gate.** |
| atomic decrement with `points >= amount`; returns INSUFFICIENT_REWARD_POINTS | direct `points - actualAmount`, no guard, can go negative (`sale-lib.ts:547-548`; duplicated at `sale-model.ts:104-105`) | **Missing atomicity/guard and sentinel.** |
| decrement only at sale save | decrement at `addPayment` **and** again at `saveSale` → double spend; refund on `deletePayment` (`sale-lib.ts:633-639`) even though the sale never persisted | **Double deduction / phantom refunds.** |
| package CRUD inside Config tabs, bulk save, delete-on-absence | standalone `/rewards` CRUD pages, `requirePermission("config")` for writes (`rewards/actions.ts:11,29`) but `requirePermission("rewards")` for read helpers (`:36-37`) — `rewards` permission does not exist in seed | **Architecture drift + dead/denied actions.** |
| customer package dropdown (config-gated) | no package UI; customer form exposes **editable** `points` (`src/components/customers/customer-form.tsx:58`; save at `src/app/(secure)/customers/actions.ts:45`) | **Privilege/behavior regression:** any operator can mint points by editing a customer. |
| register rewards panel | absent | UI gap. |
| `customer_rewards` repo | `getName`/`getPointsPercent` are stubs returning `null`/`0` (`customer_rewards/repository.ts:32-38`) and are unused | Dead code. |

### 2.9 Reward gaps (numbered)

| ID | Gap |
|---|---|
| G-RW-1 | Rename `rewards` → `customers_packages` with columns `package_id, package_name, points_percent, deleted`; update both SQLite and MySQL schemas, migrations, seed defaults (`Default/Bronze/Silver/Gold/Premium`). |
| G-RW-2 | Add `customers.package_id` (nullable FK to packages); remove or constrain direct `points` editing. |
| G-RW-3 | Add `sales_reward_points(sale_id, earned, used)` and write it on every rewarded sale. |
| G-RW-4 | Decide fate of `customers_points`: reproduce as dead table for schema parity or document an explicit deviation. |
| G-RW-5 | Drop/repurpose `customer_rewards` join table unless the project intentionally extends upstream; if kept, it must not multiply points. |
| G-RW-6 | Fix config gate to `customer_reward_enable` and seed it with `"0"`; add the Config → Rewards tab with package rows and bulk-save/delete-on-absence semantics. |
| G-RW-7 | Replace `(total - used)` with upstream gross `total` formula. |
| G-RW-8 | Redeem only when `package_id` is non-empty; use one atomic guarded UPDATE; return `INSUFFICIENT_REWARD_POINTS` (-3) on failure and roll the sale back. |
| G-RW-9 | Remove the add-time point mutation; deduct only in `saveSale`; never refund on cart payment deletion. |
| G-RW-10 | Restore the register rewards panel (package name + available points). |
| G-RW-11 | Add `used`/`earned` columns to sale detail/specific reports once the ledger exists. |
| G-RW-12 | Fix permissions: writes `config`, reads either `config` or the real module; remove `rewards`/`dinner_tables` permission references not present in upstream or seed. |

### 2.10 Reward acceptance tests (port of `tests/Models/CustomerRewardPointsTest.php`)

1. `adjustRewardPoints(+5)` from 10 → true, 15.
2. `adjustRewardPoints(-40)` from 100 → true, 60.
3. `adjustRewardPoints(-40)` from 20 → false, still 20.
4. `adjustRewardPoints(-40)` from 40 → true, 0.
5. Concurrent `-60` twice from 100 → exactly one success, 40 remaining (`tests/Models/CustomerRewardPointsTest.php:73-129`).
6. Sale with package 10% on a 100.00 total → `customers.points += 10`, `sales_reward_points` row `{earned:10, used:0}`.
7. Sale redeeming 30 points on a 100.00 total with a 10% package → points `-30` at save, then `+10` earned (upstream order), ledger `{earned:10, used:30}`.
8. Redemption with insufficient points → sale fails with `INSUFFICIENT_REWARD_POINTS` and no payments/items persist.
9. Redemption with a customer but null/0 `package_id` → no rewards payment is added (and upstream shows no error).
10. `customer_reward_enable = 0` → no points earned, no ledger row.

---

## 3. Dinner tables

### 3.1 Schema and seed

`dinner_tables(dinner_table_id PK autoincrement, name, status, deleted)`:
- Added by `app/Database/Migrations/sqlscripts/3.0.2_to_3.1.1.sql:33-39` (table block immediately before the sales alteration).
- Seeded rows: `(1,'Delivery',0,0)`, `(2,'Take Away',0,0)` (`3.0.2_to_3.1.1.sql:41-43`).
- `sales.dinner_table_id int(11) NULL AFTER invoice_number` (`3.0.2_to_3.1.1.sql:47-48`), FK `sales_suspended_ibfk_3` → `dinner_tables.dinner_table_id` (`:60-61`).
- Config key `dinner_table_enable` seeded `'0'` (`3.0.2_to_3.1.1.sql:72`).

Model: table `dinner_tables`, PK `dinner_table_id`, allowed `name, status, deleted` (`app/Models/Dinner_table.php:11-21`).

### 3.2 Model semantics (including status/occupancy rules)

| Method | Behavior | Cite |
|---|---|---|
| `exists(int)` | count `>= 1`, **no deleted filter** | `Dinner_table.php:27-33` |
| `save_value(array $data, int $id)` | saves **only `name` and `deleted = 0`**; insert when `!exists`, else update by id. `status` is never saved by this method — inserts rely on the DB default 0, updates leave status untouched | `:40-52` |
| `get_empty_tables(?int $current_dinner_table_id)` | query: `where status = 0` then `orWhere dinner_table_id = current` then `where deleted = 0`; returns `[dinner_table_id => name]`. Due to operator precedence the effective predicate is `status = 0 OR (dinner_table_id = current AND deleted = 0)`, so deleted tables with status 0 can appear | `:57-72` |
| `get_name(?string $id)` | empty id → `''`; else name by id (no deleted filter) | `:78-88` |
| `is_occupied(int $id)` | empty id → false; else `status == 1` (loose comparison) | `:94-104` |
| `get_all()` | `deleted = 0` | `:109-115` |
| `delete($id, $purge=false)` | soft delete | `:120-126` |
| `occupy(int $id)` | if `id > 2` set `status = 1`; ids 1 and 2 (Delivery, Take Away) are **never occupied** and return true | `:132-141` |
| `release(int $id)` | if `id > 2` set `status = 0`; ids 1/2 return true | `:146-155` |
| `swap_tables(int $release_id, int $occupy_id)` | `release($release_id) && occupy($occupy_id)` | `:160-163` |

Rules that follow:
- SUSPENDED sales occupy (`status=1`); COMPLETED sales release (`status=0`); CANCELED sales release.
- "Delivery"/"Take Away" are sentinel pseudo-tables and never show as occupied.
- Table selection is per register session (`Sale_lib::get_dinner_table/set_dinner_table/clear_table`, `app/Libraries/Sale_lib.php:896-921`); when `dinner_table_enable` is truthy and no session value exists, it defaults to id `1` (`:897-903`).
- `Sales::postChangeMode` enforces "one active sale per table" as follows (`app/Controllers/Sales.php:283-293`): read the newly selected `dinner_table` and the currently held `released_dinner_table`; if the **currently held** table is occupied and the selection changed, `swap_tables(released, occupied_new)` — which releases the old table and marks the new one occupied. Then the session selection is updated. The occupancy flag therefore follows the session, not the sale row, while the register is open.
- `Sale::save_value` mirrors the status on persistence: when `dinner_table_enable`, COMPLETED releases the passed table, any other status occupies it (`app/Models/Sale.php:688-695`). Note the release/occupy calls receive possibly-null ids; `occupy/release` accept ints and the id>2 guard makes null/1/2 no-ops in practice.
- Additional release paths, all gated on `dinner_table_enable`: `delete_suspended_sale` (`Sale.php:1343-1360`), `clear_suspended_sale_detail` before re-saving a sale (`:1366-1389`), and `Sales::postCancel` (`app/Controllers/Sales.php:1722-1724`). `Sale::restore_list` merely sets status SUSPENDED and does **not** occupy the table (`Sale.php:813-820`).
- `Sale::get_dinner_table($sale_id)` reads `sales.dinner_table_id` (`Sale.php:1227-1236`).

### 3.3 Configuration UI (upstream)

Dinner tables are edited inside Config → Tables:
- `Config::getIndex` loads all live tables (`app/Controllers/Config.php:238`).
- `app/Views/configs/table_config.php`: `dinner_table_enable` checkbox (`:16-24`), per-table text inputs cloned client-side (`partial/dinner_tables.php:10-34`), duplicate/`_` validation (`table_config.php:57-130`).
- `Config::postSaveTables()` (`app/Controllers/Config.php:898-943`):
  1. Saves the enable flag (`:908-910`).
  2. **Only if enabled**, iterates all POST keys containing `dinner_table` (except the flag), extracts trailing `_<id>`, and `save_value(['name' => value], id)` — note a *new* row can only be created by submitting a numeric id that does not yet exist, because ids come from the input names (`:912-926`).
  3. Soft-deletes every live table not present in the post (`:928-935`).
  4. Transaction + `{success, message}` (`:937-943`).
- Re-render endpoint `Config::getDinnerTables()` (`app/Controllers/Config.php:714-723`).
- There is no dedicated dinner-table module/page, no search, no pagination, no restore, and no status editing.

### 3.4 Target implementation and gaps

Files: `src/db/schema/customers.ts:25-30` (table), `src/lib/dinner_tables/repository.ts` (1-89), `src/app/(secure)/dinner_tables/actions.ts` (1-38), `page.tsx`, `new/[id]/page.tsx`, `src/components/dinner_tables/*`. MySQL mirror `mysql/index.ts:179-184`.

Target behavior:
- Table columns match upstream (`dinner_table_id, name, status, deleted`) (`customers.ts:25-30`).
- No default rows: seed inserts no Delivery/Take Away (`src/db/seed.ts` has no dinner table inserts).
- `getAll` excludes deleted, orders by name (`repository.ts:12-17`).
- `isOccupied` ignores the `status` column and instead asks whether a **suspended sale** exists for the table (`repository.ts:33-41`: `sales.saleStatus = 1`). This flips the source of truth and will return false while a register session holds an unsaved table.
- `saveValue` writes name + status (`:43-54`); the edit page/form never submits status, so status is preserved on update, but `saveDinnerTableAction` on update writes only `name` (`actions.ts:17-19`), matching the effective upstream behavior.
- `occupy`/`release` are unconditional (no `id > 2` guard) (`:56-64`).
- `swapTables(fromId, toId)` is wrong: it copies the **name** of the source table onto the destination and sets the destination to free (`:71-79`); upstream releases the source and occupies the destination without touching names.
- `getEmptyTables` does not exist.
- Delete is per-row soft delete (`actions.ts:27-33`) with no check for a live suspended sale and no bulk semantics.
- Permission: page/save/delete use `requirePermission("config")` (`page.tsx:9`, `actions.ts:11,28`), which is close to upstream (Config module); helper actions use `requirePermission("dinner_tables")` (`actions.ts:35-37`) — a permission that does not exist.
- `setDinnerTableAction` in the register just assigns the id and **clears all payments** (`src/app/(secure)/sales/actions.ts:132-140`); there is no swap/occupancy check.
- `saveSale` occupies on SUSPENDED and releases on COMPLETED (`sale-model.ts:203-209`); `cancelSale` always releases (`:529-535`); `clearSuspendedSaleDetail` does not release (`:234-239`).

| ID | Gap |
|---|---|
| G-DT-1 | Seed the two sentinel tables (`Delivery`, `Take Away`) with ids 1 and 2. |
| G-DT-2 | Make `status` the occupancy source of truth for `isOccupied`; treat a suspended sale query only as a consistency check. |
| G-DT-3 | Implement `getEmptyTables(currentId)` with the upstream predicate intent (fix the precedence bug deliberately): free, non-deleted tables plus the currently selected one, mapped `id → name`. |
| G-DT-4 | Fix `swapTables` to `release(from) && occupy(to)`; add the `id > 2` sentinel guard to `occupy`/`release`. |
| G-DT-5 | Enforce one active sale per table on table change: if the held table is occupied and the selection differs, swap; do not silently clear payments. |
| G-DT-6 | Gate occupy/release on `dinner_table_enable`, including cancel/delete-suspended/clear-detail paths. |
| G-DT-7 | Replace standalone CRUD with Config → Tables bulk-save semantics (add/rename/delete-on-absence and enable flag) or explicitly document the deviation; keep config permission. |
| G-DT-8 | Add `dinnerTableEnabled` guard in the register (already present) **and** only offer table selection when enabled. |
| G-DT-9 | Remove the nonexistent `dinner_tables` permission references. |

### 3.5 Dinner table acceptance tests (to add; no upstream test file exists)

1. Seed contains ids 1=`Delivery`, 2=`Take Away`, both status 0 and never occupiable.
2. `occupy(3)` → `status=1`; `release(3)` → `status=0`; `occupy(1)`/`release(2)` are no-ops returning true.
3. `getEmptyTables(3)` includes status-0 non-deleted tables and table 3 even when occupied; excludes deleted status-0 tables.
4. `swapTables(3,4)` → 3 status 0, 4 status 1, names unchanged.
5. Suspend a sale on table 3 → `status=1`; complete it → `status=0`; cancel a suspended sale → `status=0`.
6. Register table change while table 3 is occupied and table 4 is selected → 3 free, 4 occupied.
7. Deleting a table soft-deletes and hides it from `getAll`, but does not touch an existing sales row.

---

## 4. Expenses

### 4.1 Schema

Created in `app/Database/Migrations/sqlscripts/3.1.1_to_3.2.0.sql:148-157`:

```sql
CREATE TABLE IF NOT EXISTS `ospos_expenses` (
  `expense_id` int(10) NOT NULL,
  `date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `amount` decimal(15,2) NOT NULL,
  `payment_type` varchar(40) NOT NULL,
  `expense_category_id` int(11) NOT NULL,
  `description` varchar(255) NOT NULL,
  `employee_id` int(10) NOT NULL,
  `deleted` int(1) NOT NULL DEFAULT '0'
)
```

Then:
- PK, keys on `expense_category_id` and `employee_id`, autoincrement (`:167-184`).
- FKs to `expense_categories` and `employees` (`:187-191`).
- Extra columns `supplier_name varchar(255) NULL`, `supplier_tax_code varchar(255) NULL`, `tax_amount decimal(15,2) NULL` (`:194-199`).
- Supplier linkage migration: `supplier_id int(10) NULL`, backfill by matching `supplier_name = suppliers.company_name`, copy unmatched names into `description` as `\nSupplier name: …`, FK to `suppliers.person_id`, then **drop `supplier_name`** (`3.2.1_to_3.3.0.sql:120-146`).
- `deleted` tightened to `tinyint(1) DEFAULT 0 NOT NULL` (`3.4.0_database_optimizations.sql` expenses block).

Final upstream column set: `expense_id, date, amount, payment_type, expense_category_id, description, employee_id, deleted, supplier_tax_code, tax_amount, supplier_id` — exactly the model's `$allowedFields` (`app/Models/Expense.php:19-30`).

### 4.2 Model API

| Method | Behavior | Cite |
|---|---|---|
| `exists(int)` | count `== 1`; no deleted filter | `Expense.php:35-41` |
| `get_expense_category(int)` / `get_employee(int)` | convenience lookups; documented as never called | `:46-66` |
| `get_multiple_info(array)` | `whereIn`, order by `expense_id asc`; **no deleted filter** | `:72-79` |
| `get_found_rows(string $search, array $filters)` | search count-only | `:84-87` |
| `search(string $search, array $filters, ?rows, ?limit_from, ?sort='expense_id', ?order='asc', ?count_only=false)` | see §4.3 | `:101-190` |
| `get_info(int)` | joins people/expense_categories/suppliers; selects all needed fields incl. `deleted`; one row → object; else `getEmptyObject('expenses')` with extra `supplier_name/first_name/last_name = null` | `:195-257` |
| `save_value(array &$data, int $id = NEW_ENTRY)` | insert when `NEW_ENTRY` or `!exists`, writing `$data['expense_id'] = insertID()`; else update by id | `:262-279` |
| `delete_list(array $ids)` | transaction + `UPDATE deleted = 1` whereIn; `success &= transStatus()` | `:284-296` |
| `get_payments_summary(string $search, array $filters)` | group by `payment_type`: `COUNT(amount) as count, SUM(amount) as amount`; applies deleted, date range, only_* filters; `$search` unused | `:301-339` |
| `get_payment_options()` | delegates to helper `get_payment_options()` | `:344-347` |
| `get_expense_payment(int)` | raw `where expense_id` result (returns at most the expense row, not a payments table — there is no payments table for expenses) | `:352-358` |

### 4.3 Search/filter semantics (exact)

`search()` (`Expense.php:101-190`):
- Select list (non-count): `expense_id`, `MAX(date)`, `MAX(supplier company_name)`, `MAX(supplier_tax_code)`, `MAX(amount)`, `MAX(tax_amount)`, `MAX(payment_type)`, `MAX(description)`, `MAX(employees.first_name)`, `MAX(employees.last_name)`, `MAX(expense_categories.category_name)`.
- Joins: `people AS employees` on `employee_id`, `expense_categories` on `expense_category_id`, `suppliers` on `supplier_id` (all LEFT).
- Search group (`:136-144`): employee first name, `expenses.date`, employee last name, `payment_type`, `amount`, `category_name`, `CONCAT(first_name," ",last_name)` — all `LIKE %term%`.
- `expenses.deleted = $filters['is_deleted']` (`:146`). The filter is named "Deleted": selecting it shows **only deleted** rows; default false shows only live rows (`Expenses.php:38`, `:65`).
- Date range (`:148-152`): if `date_or_time_format` empty → `DATE_FORMAT(expenses.date, "%Y-%m-%d") BETWEEN start AND end`; else raw `expenses.date BETWEEN rawurldecode(start) AND rawurldecode(end)`.
- Payment filters, each `LIKE` against the localized label (`:154-175`): `only_debit` (`Expenses.debit`), `only_credit`, `only_cash` (also matches `payment_type IS NULL`), `only_due`, `only_check`. They are independent, so multiple selections OR together via separate `WHERE` clauses? No — separate `LIKE` clauses are ANDed; selecting two payment types yields no rows. This is upstream behavior.
- Count-only returns `COUNT(DISTINCT expense_id)` (`:113-115`, `:177-179`); otherwise `GROUP BY expense_id`, order by caller sort/order, optional limit/offset (`:181-189`).

`get_payments_summary()` differs slightly: it does not add the `IS NULL` branch for cash, and it applies the same independent `LIKE` filters (`:316-334`), then groups by `payment_type` (`:336-338`).

### 4.4 Controller actions

- `getIndex` (`app/Controllers/Expenses.php:27-45`): table headers; filter map `only_cash, only_due, only_check, only_credit, only_debit, is_deleted` with localized labels (`:31-39`); restores filters from the URL query via `restoreTableFilters` (`:42`).
- `getSearch` (`:50-86`): GET `search, limit, offset, sort, order`; filters initialized false for all six plus `start_date/end_date`; `filters[]` GET values are converted to a set with `array_fill_keys` and merged (`:69-70`); returns `{total, rows, payment_summary}`; appends a final totals row when `total_rows > 0` (`:81-83`).
- `getView` (`:92-138`):
  - Loads `get_info` (new → empty object) and overwrites `expense_id` from the object (`:96-97`).
  - Employee assignment authorization: `can_assign_employee = has_grant('employees', current)`. If allowed, lists all employees; otherwise exposes only the stored employee (new → logged-in user) (`:99-112`).
  - Category dropdown = all non-deleted categories (`:114-118`).
  - New record defaults: `date = now`, `employee_id = current` (`:120-123`).
  - Payments block is populated from `get_expense_payment($expense_id)` (effectively empty for new; for existing it returns the expense row itself) (`:125-132`).
  - Payment options come from `get_payment_options()` (`:135`).
- `postSave` (`:156-200`):
  - Parses `date` with `date_create_from_format($config['dateformat'] . ' ' . $config['timeformat'], $newdate)` (`:159-161`). Invalid input makes `$date_formatter` false and the subsequent `->format()` fatal — no graceful validation.
  - Employee rules: without the `employees` grant, new expenses are forced to the logged-in user and edits keep the existing employee; with the grant, the submitted `employee_id` wins (`:163-175`).
  - Data: `date (Y-m-d H:i:s)`, `supplier_id` (null when blank), `supplier_tax_code`, `amount`/`tax_amount` via `parse_decimals`, `payment_type`, `expense_category_id`, `description`, `employee_id`, `deleted = (post deleted != null)` (`:177-188`).
  - JSON `{success, message, id}` for add/update/failure (`:190-199`).
- `postDelete` (`:205-214`): `ids` → `delete_list`; JSON `{success, message, ids}`.
- `getRow` (`:144-150`): one tabular row for AJAX.

### 4.5 UI

- `expenses/manage.php`: Bootstrap table, `uniqueId expense_id`, date-range picker, multiselect filter dropdown, print button (`takings_printer`), delete toolbar; on load, appends the payment summary HTML and bold-styles the final totals row (`:15-58`, `:61-94`).
- `expenses/form.php`: fields in order — expense id label, date (readonly datetime picker, required), supplier autocomplete + hidden id + remove button, supplier tax code, amount (currency symbol, required), tax amount, payment dropdown, category dropdown, employee dropdown or hidden+readonly when not authorized, description textarea, `deleted` checkbox for existing (`:18-164`). Validation: supplier name required, `category`/`expense_category_id` required, date required, amount required + remote `expenses/checkNumeric`, tax amount remote numeric (`:208-254`). The remote route is not implemented (see §1.4).
- There is no CSV import/export and no invoice concept for expenses; `payment_type` is a free-text label selected from the shared payment options list.

### 4.6 Target implementation and gaps

Files: `src/db/schema/expenses.ts` (1-22), MySQL `mysql/index.ts:366-383`, repository `src/lib/expenses/repository.ts` (1-93), actions `src/app/(secure)/expenses/actions.ts` (1-51), pages, `src/components/expenses/expense-form.tsx`, `expenses-table.tsx`, reports `src/lib/reports/registry.ts:283-317`.

Target columns: `expense_id, expense_time (integer epoch), amount (real), payment_type (text), expense_category_id, description, employee_id, deleted` (`expenses.ts:4-13`). **Missing: `date` (renamed), `supplier_id`, `supplier_tax_code`, `tax_amount`, `supplier_name` migration history.** MySQL mirror identical (`mysql/index.ts:367-376`); generated SQLite DDL confirms (`drizzle/sqlite/0000_skinny_power_man.sql:375-384`).

Repository:
- `baseQuery` joins categories and subselects the employee name (`repository.ts:26-42`), but the `employeeName` field is never rendered by the table.
- `getAll`/`getInfo` do not filter deleted (`:18-24`); `getInfo` includes deleted rows.
- `search` accepts only `{startDate, endDate, description}`, always pins `deleted=false`, and never filters by category, employee, payment type, or `is_deleted` (`:71-77`).
- `getEmptyRow` hardcodes `paymentType: "Cash"` and now (`:44-46`).
- `saveValue` does not write `deleted` on update (so the edit path cannot soft-delete/undelete) (`:48-65`).
- `deleteList` loops instead of a single UPDATE (`:85-88`).

Actions:
- `saveExpenseAction` (`actions.ts:11-32`): amount `parseFloat` with `amount <= 0` → error (stricter than upstream, which permits any parsed decimal); `paymentType` defaults `"cash"`; `expenseCategoryId` `0` → null; `description`; **`employeeId` is always `session.user.personId`** — the submitted employee is ignored and there is no `employees` grant check; no date field at all (always insert-default now); no supplier/tax fields; no `deleted` handling; redirects instead of returning JSON.
- `deleteExpenseAction` soft-deletes and revalidates but does not redirect (`:34-39`).
- Dead helper actions `searchExpensesAction/getExpenseRowAction/getExpenseTotalRowsAction` require the existing `expenses` permission but are never referenced by the UI (`:41-50`).

Form:
- Fields: amount, category select, hardcoded payment select (`cash, credit, check, bank_transfer`) (`expense-form.tsx:26-45`), description; no date picker, no supplier, no tax amount, no employee selector, no deleted checkbox.
- The hardcoded labels differ from upstream localized payment labels, which breaks string-matching consumers (e.g. cashup expense subtraction and expense report grouping).

Table:
- Date (localized from epoch), category, amount, payment, description, edit/delete; no supplier/tax/employee columns, no totals row, no payment summary, no filters/date range/print (`expenses-table.tsx:21-48`).

| ID | Gap |
|---|---|
| G-EX-1 | Rename `expense_time` → `date` (keep epoch storage if the project standard is integer timestamps) and mirror in MySQL; keep upstream semantics (`timestamp NULL DEFAULT CURRENT_TIMESTAMP`). |
| G-EX-2 | Add `supplier_id` (FK suppliers), `supplier_tax_code`, `tax_amount`; if reproducing 3.1.x pre-migration shape, also `supplier_name`; implement the 3.2.1→3.3.0 backfill rules. |
| G-EX-3 | Restore full search contract: search over employee first/last/full name, date, payment type, amount, category name; filters `only_cash/due/check/credit/debit`; `is_deleted` boolean with deleted-only semantics; date or datetime range driven by `date_or_time_format`. |
| G-EX-4 | Restore `{total, rows, payment_summary}` response plus totals row and per-payment summary. |
| G-EX-5 | Restore employee assignment authorization (employees grant) and the logged-in fallback for new/non-privileged edits. |
| G-EX-6 | Restore date input with configured format/time format parsing and server-side validation (avoid the upstream fatal on invalid date). |
| G-EX-7 | Restore supplier autocomplete + tax code + tax amount fields and persistence. |
| G-EX-8 | Restore `deleted` checkbox on edit and the ability to see deleted rows via the filter. |
| G-EX-9 | Replace the hardcoded payment list with `get_payment_options()` parity (config order, localized labels, UPI country rule, Bank Transfer/Wallet). |
| G-EX-10 | Restore list columns: supplier, tax code, tax amount, created-by employee; print/takings printer support. |
| G-EX-11 | Align amount validation: upstream accepts any parsed decimal (including 0/negative); decide whether to keep target's positive-only rule and document the deviation. |
| G-EX-12 | Fix `getInfo` deleted filtering to match listing behavior and ensure update cannot resurrect deleted rows implicitly. |

### 4.7 Expense acceptance tests (add; upstream has fixture traits only)

Reuse `tests/Support/ExpenseFixtureTrait.php` semantics conceptually. Target tests (vitest + in-memory SQLite, pattern from `src/lib/sale/sale-lib.test.ts:1-19`):

1. Create expense with amount/tax/category/employee/supplier → row persists with all fields and `deleted=0`.
2. Search by employee name, category name, payment type, amount, and date substring returns the row; searching a deleted row returns nothing unless `is_deleted`.
3. Date range respects `date_or_time_format` (date-only vs datetime).
4. `only_cash` includes `payment_type IS NULL` in search; excludes other types.
5. Payment summary groups by `payment_type` with `{count, amount}` sums.
6. Non-privileged user cannot assign another employee; new expenses force self; edits keep stored employee.
7. Soft delete via list sets `deleted=1`; delete via edit checkbox matches; deleted row reappears under the deleted filter.
8. Totals row equals sum of visible `amount` and `tax_amount`.

---

## 5. Expense categories

### 5.1 Schema

`app/Database/Migrations/sqlscripts/3.1.1_to_3.2.0.sql:138-143`:

```sql
CREATE TABLE IF NOT EXISTS `ospos_expense_categories` (
  `expense_category_id` int(10) NOT NULL,
  `category_name` varchar(255) DEFAULT NULL,
  `category_description` varchar(255) NOT NULL,
  `deleted` int(1) NOT NULL DEFAULT '0'
)
```

Indexes: PK and **`UNIQUE KEY category_name (category_name)`** (`:162-164`), autoincrement (`:175-178`). There is no hierarchy/parent column. `deleted` tightened by `3.4.0_database_optimizations.sql` (expense categories block), and charset conversions in `3.2.1_to_3.3.0.sql:97`.

Model `app/Models/Expense_category.php:12-23`: table `expense_categories`, PK `expense_category_id`, allowed `category_name, category_description, deleted`.

### 5.2 Model semantics

| Method | Behavior | Cite |
|---|---|---|
| `exists(int)` | count `== 1`; no deleted filter | `Expense_category.php:27-33` |
| `get_total_rows()` | count `deleted = 0` | `:38-44` |
| `get_info(int)` | `deleted = 0`; one row → row; else object with **every column initialized to `''`** (including `expense_category_id`) | `:49-69` |
| `get_all(int $rows=0, int $limit_from=0, bool $no_deleted=false)` | optional `deleted=0`, order `category_name asc`, optional limit | `:74-89` |
| `get_multiple_info(array)` | `whereIn`, order by name; no deleted filter | `:94-101` |
| `save_value(array &$data, int $id = NEW_ENTRY)` | insert when `NEW_ENTRY`/`!exists` (writes `expense_category_id`), else update by id | `:106-123` |
| `delete_list(array)` | single `whereIn` UPDATE `deleted = 1` | `:128-134` |
| `get_found_rows(search)` | count-only search | `:139-142` |
| `search(search, rows, limit_from, sort='category_name', order='asc', count_only=false)` | LIKE on `category_name` OR `category_description`; **`deleted = 0` always** (so deleted categories are never listed, even with a deleted filter — there is none) | `:147-181` |

Deletion rules: only soft-delete; no dependency check against expenses (deleting a category leaves `expenses.expense_category_id` pointing at a soft-deleted row; the FK prevents hard delete but soft delete succeeds). No restore UI. Unique name is enforced only by the DB index; saving a duplicate produces a generic failure and the controller erroneously reports `success: true` (see §5.4).

### 5.3 Controller and UI

- `getIndex` returns headers (`app/Controllers/Expenses_categories.php:23-28`); `getSearch` returns `{total, rows}` (`:33-50`); `getRow` (`:56-61`); `getView` renders `expenses_categories/form` (`:67-72`).
- `postSave` (`:78-107`): data `{category_name, category_description}`; on failure the JSON has **`'success' => true`** with `error_adding_updating` message (`:100-106`) — a real upstream bug. `id` is insert id on create, posted id on update.
- `postDelete` (`:112-126`): `ids` → `delete_list`; `{success, message}` (no `ids` in the response).
- `expenses_categories/manage.php`: table, new button, bulk delete; filter handler is wired to `#filters` even though no filter dropdown is rendered (`:11-46`, especially `:23-26`).
- `expenses_categories/form.php`: `category_name` (required), `category_description` textarea, jQuery validation required-only (`:14-36`, `:44-65`).

### 5.4 Target implementation and gaps

Files: `src/db/schema/expenses.ts:15-20` (table), MySQL `mysql/index.ts:378-383`, repository `src/lib/expenses_categories/repository.ts` (1-71), actions `src/app/(secure)/expenses_categories/actions.ts` (1-39), pages, components `src/components/expenses/category-form.tsx`, `categories-table.tsx`.

Target columns: `expense_category_id, category, description, deleted` — **both names diverge** from upstream (`category_name`, `category_description`) and there is **no unique index** (`expenses.ts:15-20`; `drizzle/sqlite/0000_skinny_power_man.sql` category DDL). Repository `search` matches `category` only, `orderBy category` (`repository.ts:53-57`); `getInfo` does not filter deleted (`:19-23`); `saveValue`/`deleteList` mirror the simple CRUD (`:33-69`).

Actions:
- `saveCategoryAction`/`deleteCategoryAction` use `requirePermission("expenses_categories")` (correct module) (`actions.ts:11,30`).
- **The dead read helpers use `requirePermission("expense_categories")`** (singular) at `actions.ts:36-37` — a permission id that does not exist in the seed or upstream, so those endpoints would always redirect to no_access.
- No duplicate-name handling; the DB has no unique constraint, so duplicate categories can be created. No hierarchy (parity).
- Form fields `category`, `description`; table Category/Description (`category-form.tsx:20-26`, `categories-table.tsx:15-22`).

| ID | Gap |
|---|---|
| G-EC-1 | Rename columns to `category_name`, `category_description`; update SQLite/MySQL schemas, repo, forms, reports (`registry.ts:291-314` uses `ec.category`) and queries. |
| G-EC-2 | Add `UNIQUE(category_name)` and surface a proper duplicate error instead of a generic/success-true response. |
| G-EC-3 | Search must match name **and** description; deleted always excluded (upstream has no deleted filter). |
| G-EC-4 | `get_info` must exclude deleted and return the all-empty object for missing ids (form behavior). |
| G-EC-5 | Restore bulk-delete `{success, message}` contract and bulk toolbar. |
| G-EC-6 | Fix permission ids (`expense_categories` → `expenses_categories`) or delete the dead helpers. |
| G-EC-7 | Ensure expense reports/joins use the renamed columns; `summary_expenses_categories` currently selects `ec.category`. |

### 5.5 Category acceptance tests

1. Create/update/delete category; `get_all` sorted by name and excludes deleted.
2. Duplicate name rejected by DB constraint and reported as failure.
3. Search matches description as well as name.
4. Soft-deleting a category does not mutate expenses and removes it from the expense form dropdown (`Expenses.php:114-118` parity).
5. `get_info(-1)` returns an object whose fields are `''` (not null).

---

## 6. Cashups

### 6.1 Exact schema

Created in `app/Database/Migrations/sqlscripts/3.2.1_to_3.3.0.sql:63-92`:

```sql
CREATE TABLE `ospos_cash_up` (
  cashup_id int(10) NOT NULL,
  open_date timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  close_date timestamp NULL,
  open_amount_cash decimal(15,2) NOT NULL,
  transfer_amount_cash decimal(15,2) NOT NULL,
  note int(1) NOT NULL,
  closed_amount_cash decimal(15,2) NOT NULL,
  closed_amount_card decimal(15,2) NOT NULL,
  closed_amount_check decimal(15,2) NOT NULL,
  closed_amount_total decimal(15,2) NOT NULL,
  description varchar(255) NOT NULL,
  open_employee_id int(10) NOT NULL,
  close_employee_id int(10) NOT NULL,
  deleted int(1) NOT NULL DEFAULT '0'
)
```

- PK `cashup_id`; keys on `open_employee_id`, `close_employee_id`; FKs to `employees(person_id)` (`:82-87`); autoincrement (`:91-92`).
- `closed_amount_due decimal(15,2) NOT NULL` added afterwards (`:100-103`).
- `deleted` tightened to `tinyint(1) DEFAULT 0 NOT NULL` (`3.4.0_database_optimizations.sql` cash_up block); FK re-adds at `:40-41`.
- Model `$allowedFields` matches exactly: `open_date, close_date, open_amount_cash, transfer_amount_cash, note, closed_amount_cash, closed_amount_card, closed_amount_check, closed_amount_total, description, open_employee_id, close_employee_id, deleted, closed_amount_due` (`app/Models/Cashup.php:20-35`).

Note the semantic of `note`: upstream is a boolean flag (`int(1)`), rendered as a checkbox and as a check/cross glyph in the list. It is not a free-text note; `description` is the free-text field.

### 6.2 Model API

| Method | Behavior | Cite |
|---|---|---|
| `exists(int)` | count `== 1`; no deleted filter | `Cashup.php:40-46` |
| `get_employee(int)` | broken/dead: reads a non-existent `cash_up.employee_id` | `:51-59` |
| `get_multiple_info(string $cashup_ids)` | typed string but used with an array; `whereIn`, order by `cashup_id asc` | `:65-72` |
| `get_found_rows($search, $filters)` | count-only `search` | `:77-80` |
| `search($search, $filters, ?rows, ?limit_from, ?sort='cashup_id', ?order='asc', ?count_only=false)` | see §6.3 | `:85-159` |
| `get_info(int)` | joins `people AS open_employees` / `close_employees`; selects all columns plus `open_first_name, open_last_name, close_first_name, close_last_name`; missing → `getEmptyObject('cash_up')` (PK = `NEW_ENTRY`, numeric fields 0, others null) | `:164-222` |
| `save_value(array &$data, $cashup_id = NEW_ENTRY)` | condition is written `if (!$cashup_id == NEW_ENTRY || !$this->exists($cashup_id))` — parsed as `(!$cashup_id) == NEW_ENTRY`. Behavior in practice: id `0`/`NEW_ENTRY` inserts because `!exists(-1)` is true; an existing id updates; a nonzero nonexistent id also inserts via `!exists` | `:228-245` |
| `delete_list(array)` | transaction + `whereIn` UPDATE `deleted = 1`; returns `$success` without `transStatus()` | `:250-260` |

### 6.3 Search/filter semantics

`search()` (`Cashup.php:85-159`):
- Non-count select uses `MAX(...)` for every field, plus `MAX(open_employees.first_name/last_name)` and `MAX(close_employees.first_name/last_name)` (`:101-120`); joins the two people aliases (`:123-124`).
- Search group (`:126-135`): `cash_up.open_date`, open employee first/last name, close employee first/last name, `cash_up.closed_amount_total`, open full name, close full name — all `LIKE %term%`.
- `cash_up.deleted = $filters['is_deleted']` (`:137`) → selecting the "Deleted" filter shows deleted cashups only; default false shows live ones.
- Date range applies to **`open_date` only** (`:139-143`): `DATE_FORMAT(open_date, "%Y-%m-%d") BETWEEN …` when `date_or_time_format` is empty, else raw `open_date BETWEEN rawurldecode(...)`.
- Count-only returns `COUNT(cash_up.cashup_id)` (`:98-99`, `:145-147`); otherwise `GROUP BY cashup_id`, sort/order, optional limit (`:149-157`).

### 6.4 Open/close workflow and totals math

The form doubles as the "open session" and "close session" screen; there is no separate close endpoint.

`Cashups::getView` (`app/Controllers/Cashups.php:79-98`):
1. Builds an employee lookup of all employees (`:103-115`).
2. `normalizeCashupInfo` calls `get_info` (`:121-130`).
3. If `cashup_id == NEW_ENTRY` → `initializeNewCashup`: `open_date = now`, `close_date = now`, both employee ids = logged-in user (`:136-142`).
4. Else if `isPendingClose` — all four of `closed_amount_cash`, `closed_amount_due`, `closed_amount_card`, `closed_amount_check` are numerically `0` — → `closeCashup` (`:148-154`, `:160-184`).

`closeCashup` (`:160-184`):
- `close_date = now`.
- `closed_amount_cash = open_amount_cash + transfer_amount_cash` (`:166`).
- Build report inputs (`:190-216`): date-only mode truncates `open_date`/`close_date` to `substr(...,0,10)`; datetime mode uses them verbatim; `sale_type = 'complete'`, `location_id = 'all'`.
- Fetch `Summary_payments::getData($inputs)` and `applyPaymentTotals` (`:223-241`):
  - only rows with `trans_group == lang('Reports.trans_payments')` are inspected;
  - `trans_type == lang('Sales.cash')` → `closed_amount_cash += trans_amount`;
  - `trans_type == lang('Sales.due')` → `closed_amount_due +=`;
  - `trans_type == lang('Sales.debit') || credit` → `closed_amount_card +=`;
  - `trans_type == lang('Sales.check')` → `closed_amount_check +=`.
- Subtract cash expenses (`:248-265`): `get_payments_summary('', inputs + only_cash=true, all other only_* false, is_deleted=false)` and `closed_amount_cash -= amount` for each returned payment-type group.
- `closed_amount_total = calculateTotal(...)` (`:176-183`).

`calculateTotal` (`:383-386`):
```
closedAmountCash - openAmountCash - transferAmountCash + closedAmountDue + closedAmountCard + closedAmountCheck
```
This algebra means the stored total is effectively `cash sales - cash expenses + due + card + check` (because `closed_amount_cash` already includes open + transfer at close time). The upstream test fixes these numbers: open 100 / transfer 10 / cash sale 50 / cash expense 15 / due 20 → closed cash 145, due 20, total 55 (`tests/Controllers/CashupControllerTest.php:183-208`); and `100 - 20 - 5 + 15 + 40 + 25 = 155` for the AJAX total (`:139-157`).

`postSave` (`:283-293`):
- Parses both dates with `date_create_from_format(dateformat . ' ' . timeformat, raw)` (`:299-302`).
- Reads the six amounts through `parse_decimals` (`:391-401`), builds data (`:310-330`):
  `open_date, close_date, open_amount_cash, transfer_amount_cash, closed_amount_cash, closed_amount_due, closed_amount_card, closed_amount_check, closed_amount_total (recomputed server-side), note (boolean from POST != null), description, open_employee_id (logged-in user), close_employee_id (logged-in user), deleted (POST != null)`.
- **The submitted `closed_amount_total` is ignored**; the server recomputes it. The submitted `open_employee_id`/`close_employee_id` are also ignored and forced to the authenticated user. Both properties are pinned by `CashupControllerTest.php:76-137`.
- JSON `{success, message, id}` (`:338-351`); delete returns `{success, message, ids}` (`:356-365`).

`postAjax_cashup_total` (`:373-378`) recomputes and returns `{total: to_currency_no_money(total)}`; the form calls it on keyup of all six amount inputs (`app/Views/cashups/form.php:295-309`).

`isPendingClose` subtlety: a genuinely new cashup with all-zero closed amounts is "pending close" on every later view and will be recomputed each time. There is no explicit state flag; the all-zero heuristic is the state machine.

### 6.5 Search/UI/print

- `getIndex` exposes only the `is_deleted` filter, restores query filters, and renders `cashups/manage` (`app/Controllers/Cashups.php:33-44`).
- `manage.php`: table with `uniqueId cashup_id`, date-range picker, `is_deleted` multiselect, print button bound to `takings_printer`, delete toolbar, new button (`app/Views/cashups/manage.php:15-85`).
- `form.php`: id label; open date + open employee; open cash; in/out cash; close date + close employee; closed cash; `note` **checkbox**; due; card; check; read-only total; description; `deleted` checkbox for existing (`:16-246`). Datetime pickers use `dateformat_bootstrap(config dateformat/timeformat)` and meridian detection from the last char of `timeformat` (`:255-293`). Live total via AJAX (`:295-309`). Validation rules block is empty and only messages exist (`:321-341`) — no client-side enforcement of the amount inputs.
- Permissions: the `cashups` module grant only (`Cashups.php:22`); no sub-permissions or grant checks inside the controller.

### 6.6 Target implementation and gaps

Files: `src/db/schema/cashups.ts` (1-14), MySQL `mysql/index.ts:385-396`, repository `src/lib/cashups/repository.ts` (1-102), actions `src/app/(secure)/cashups/actions.ts` (1-56), pages, `src/components/cashups/cashup-form.tsx`, `cashups-table.tsx`. Report `src/lib/reports/registry.ts:317-334` (`summary_cashups`), chart map `:476`.

Target columns: `cashup_id, open_date (integer epoch), close_date (integer epoch), open_amount_cash, transfer_amount_cash, closed_amount_cash, note (text), employee_id, deleted` (`cashups.ts:4-13`). **Missing: `closed_amount_due`, `closed_amount_card`, `closed_amount_check`, `closed_amount_total`, `description`, `open_employee_id`, `close_employee_id`.** `note` changed from boolean to free text; a single `employee_id` replaces the open/close pair. Table name `cashups` instead of upstream `cash_up`.

Repository:
- `calculateTotal(open, transfer, closedCash, closedDue, closedCard, closedCheck)` exists and matches upstream algebra (`repository.ts:44-46`) but is **never called anywhere** (grep finds only the definition).
- `search` supports only `{startDate, endDate, employeeId}` on `open_date`/`employee_id`; always `deleted=false` (`:69-77`).
- `getAll`/`listCashups` exclude deleted, order `openDate desc` (`:17-20`, `:48-53`); no pagination in the page (`page.tsx:8` uses `listCashups()`).
- `getEmployee` joins employees/people (`:90-100`).
- `getMultipleInfo` builds a raw `IN (ids.join(","))` SQL fragment (`:59-63`) — works but is string-built.

Actions/form:
- `saveCashupAction` reads `openDate`, `closeDate` from `datetime-local` strings converted to epoch seconds; amounts open/transfer/closed cash; free-text `note`; optional `employeeId` from a dropdown; calls `saveCashup`; redirects (`actions.ts:8-33`).
- No due/card/check/total fields, no description field, no deleted checkbox, no server-side total recomputation, no AJAX total, no note boolean.
- Form fields limited to open date, close date, open cash, transfer cash, closed cash, employee, note textarea (`cashup-form.tsx:36-66`).
- Table columns: open date, close date, open cash, transfer, closed cash, edit/delete (`cashups-table.tsx:28-35`); no employee names, note glyph, due/card/check/total, no filters/date range/print.
- `getCashupTotalRowsAction` has no permission check (`actions.ts:52-54`); other helper actions are dead.

| ID | Gap |
|---|---|
| G-CU-1 | Rename table to `cash_up` and add all missing columns (`closed_amount_due/card/check/total`, `description`, `open_employee_id`, `close_employee_id`); restore `note` as boolean. |
| G-CU-2 | Restore the open/close state machine: initialize new rows with now/open+close employee = logged-in user; treat all-zero closed amounts as "pending close" and recompute on view. |
| G-CU-3 | Implement the payment aggregation (`Summary_payments` equivalent): completed sales in the open→close range, grouped payment types, cash/due/card(debit+credit)/check mapping, giftcards aggregated as one type. |
| G-CU-4 | Subtract cash expenses in the same range (`only_cash`, `is_deleted=false`). |
| G-CU-5 | Restore `calculateTotal` usage and server-side recomputation; ignore client-submitted totals. |
| G-CU-6 | Force open/close employees to the authenticated user; ignore submitted owner ids. |
| G-CU-7 | Add `ajax_cashup_total` equivalent (server action returning formatted total) and wire it to all six amount inputs. |
| G-CU-8 | Restore list/search contract: search over open date, both employee names, closed total; `is_deleted` filter; `open_date` date range; `{total, rows}`. |
| G-CU-9 | Restore full form fields (due/card/check/read-only total, description, note checkbox, deleted checkbox for existing) and the print/takings-printer button. |
| G-CU-10 | Restore delete `{success, message, ids}` and transaction status handling in `delete_list`. |
| G-CU-11 | Fix or remove the invented `summary_cashups` report (upstream has no such report); if kept, extend columns to the full cashup set. |
| G-CU-12 | Keep `cashups` module permission parity (already correct: page/save/delete use `cashups`). |

### 6.7 Cashup acceptance tests (port `CashupControllerTest`)

1. POST save with tampered `closed_amount_total=1000` but components summing to 60 → stored total 60 (`CashupControllerTest.php:76-104`).
2. Components `100-20-5+15+40+25` → total 155 and open/close employee forced to the logged-in cashier despite posted 777/888 (`:106-137`).
3. AJAX total for the same components returns the formatted string `"155.00"` (`:139-157`).
4. New-entry view prefills today's date (`:159-168`).
5. Existing closed cashup (closed cash 75) is not recalculated on view (`:170-181`).
6. Pending-close cashup with open 100 / transfer 10, a completed cash sale 50, a completed due sale 20, and a cash expense 15 → form shows closed cash 145, due 20, total 55 (`:183-208`).
7. Search date range applies to `open_date`; `is_deleted` shows only deleted rows.
8. Delete list soft-deletes all ids in a transaction.

---

## 7. Messages / SMS (and email/mailchimp applicability)

### 7.1 Config keys and encryption

| Key | Default | Purpose | Cite |
|---|---|---|---|
| `msg_msg` | `''` | default SMS body pre-filled in the per-person form and editable in Config | `initial_schema.sql:69`; `3.4.2_missing_config_keys.sql:3`; `app/Views/messages/form_sms.php:42`; `app/Views/configs/message_config.php:66-76` |
| `msg_uid` | `''` | gateway username | `initial_schema.sql:70`; required in Config form (`message_config.php:16-27,99-105`) |
| `msg_src` | `''` | originator/source number; Config form displays `company` as the fallback when null | `initial_schema.sql:71`; `message_config.php:50-64` |
| `msg_pwd` | `''` | gateway password, encrypted at rest | `initial_schema.sql:72`; `Config.php:604-619` |

`Config::postSaveMessage` (`app/Controllers/Config.php:604-624`): if encryption is available and a non-empty password is posted, encrypt it; otherwise keep the previously stored `msg_pwd` verbatim (`:606-612`). It then batch-saves all four keys and returns `{success, message}` (`:614-623`). `msg_pwd_set` is exposed to the view as a boolean (`Config.php:271`), and the input uses a placeholder instead of echoing the secret (`message_config.php:33-47`).

Adjacent email defaults added in the same migration (`3.4.2_missing_config_keys.sql:7-11`): `smtp_timeout=5000`, `smtp_crypto=tls`, `smtp_port=587`, `mailpath=/usr/bin/sendmail`, `protocol=sendmail`. Note `Email_lib` treats `smtp_timeout` as seconds (`app/Libraries/Email_lib.php:53`), so the seeded 5000 is an upstream inconsistency.

### 7.2 `Sms_lib` — exact behavior

`app/Libraries/Sms_lib.php:17-77`:
- `sendSMS(int $phone, string $message): bool`.
- Decrypts `msg_pwd` through `Services::encrypter()` when non-empty (`:27-32`).
- Reads `msg_uid`, `msg_src` (`:34-35`).
- Returns `false` if **any** of username, password, phone, message, originator is empty (`:40-46`).
- Otherwise sets `$response = true`, URL-encodes the message (`:48-51`), and contains **only commented-out examples** of third-party gateways (generic HTTP, Textmarketer UK) (`:53-72`). It never performs a network call.
- Return value is therefore a configuration-presence check, not a delivery result. The controller reports success purely on this boolean.

Consequences to preserve or consciously change:
- No gateway abstraction, no API shapes, no HTTP client, no delivery receipt, no per-gateway config, no retry, no logging.
- The phone parameter is typed `int`, so comma-separated multiple recipients (advertised by `Messages.multiple_phones`, `app/Language/en/Messages.php` and `sms.php:16`) cannot be passed without a TypeError on a value like `"123,456"`. A leading `+` is accepted by PHP's numeric-string coercion; spaces/dashes are not.
- Empty message is rejected by the library even though the form only requires non-empty client-side.

### 7.3 Controller and routes/UI

`app/Controllers/Messages.php`:
- Constructor instantiates `Sms_lib` (`:16-19`).
- `getIndex` → `view('messages/sms')` (`:24-27`).
- `getView(int $person_id = NEW_ENTRY)` → `Person::getInfo` → `messages/form_sms` (`:33-44`). Reachable as `GET /messages/view/{person_id}` via auto-routing, linked from customer/supplier list rows (`tabular_helper.php:209-240,275-307`).
- `postSend` (`:49-61`): POST `phone`, `message`; calls `sendSMS`; returns `{success, message}` where message is `Messages.successfully_sent` + escaped phone or `Messages.unsuccessfully_sent` + escaped phone. No phone-format validation, no message-template substitution, no persistence.
- `send_form(int $person_id = NEW_ENTRY)` (`:70-90`): same, plus `person_id` in the JSON (`person_id` on success, `NEW_ENTRY` on failure).

Views:
- `messages/sms.php`: standalone page with a `multipart/form-data` form to `messages/send/`; phone field with the "multiple phones" help text; message textarea; AJAX submit with `$.notify` success/danger (`:7-57`). No server-rendered history, no CSRF token markup (CI4 injects/validates globally).
- `messages/form_sms.php`: per-person modal; first/last name readonly; phone (required, numeric); message prefilled from `$config['msg_msg']` (required); AJAX submit; error container (`:12-87`).

Email/Mailchimp applicability:
- Messages uses **only** `Sms_lib` (`Messages.php:5`); `Email_lib` is not referenced by the Messages controller or views. `Email_lib` is used for sale PDFs/receipts (`app/Libraries/Email_lib.php:63-84` configures protocol/mailpath/SMTP host/user/pass/port/timeout/crypto and attaches optional files; logo helpers at `:89-120`).
- `Mailchimp_lib` is used only by Customers/Config (`app/Controllers/Customers.php:19,28,36-37,194-228,284-291,360,473`; `app/Controllers/Config.php:6,631`), not by Messages. There is no email path for messages to reproduce beyond the shared SMTP config semantics.

### 7.4 Target implementation and gaps

Files: `src/lib/sms/index.ts` (1-36), `src/app/(secure)/messages/actions.ts` (1-21), `src/app/(secure)/messages/page.tsx` (1-7), `src/components/messages/messages-form.tsx` (1-33). Config tab keys `src/lib/config/tabs.ts:154-157`; seed `src/db/seed.ts:86-89`; encryption set `tabs.ts:218-220`; config save `src/app/(secure)/config/actions.ts:21-27`.

Target behavior:
- `sendSMS(to, body)` reads `msg_uid`, decrypted `msg_pwd`, `msg_src` (`sms/index.ts:6-8`); if any missing → `{ok:false, message:"SMS not configured"}` (`:9-11`).
- **Sends via Twilio's REST API** at `https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` with Basic auth and form params `To/From/Body` (`:13-31`). Returns `{ok, message}` with Twilio status/text on failure (`:28-31`) or `"SMS sent"`.
- `msg_msg` is not read at all; the form starts empty (`messages-form.tsx:24-26`).
- No phone validation (placeholder `+8801XXXXXXXXX` only), no message-length check, no multi-recipient splitting.
- `sendSmsAction` requires the `messages` permission, requires both fields, returns `{ok, message}`; the client renders `result.message` in a neutral grey box, not success/danger styling (`actions.ts:7-15`; `messages-form.tsx:18`).
- `getMessageHistoryAction` is a stub returning `[]` with a comment that no messages table exists (`actions.ts:17-21`) — it is unreferenced.
- No per-person SMS page or customer/supplier "messages" action; `/messages` is a single generic form.
- The UI itself says the provider is stubbed (`messages-form.tsx:30`), which contradicts the Twilio implementation.
- Config `msg_pwd` is correctly treated as an encrypted key and decrypted on read (`tabs.ts:156,218-220`; `sms/index.ts:7`), matching upstream.

| ID | Gap |
|---|---|
| G-MSG-1 | Replace Twilio-specific code with a gateway-neutral `sendSMS` contract; upstream's contract is "configured → true, otherwise false". If a real gateway is desired, make it explicit config (e.g. provider + endpoint) and document the deviation. |
| G-MSG-2 | Restore `msg_msg` as the default body for per-person messages. |
| G-MSG-3 | Restore per-person SMS form (`/messages/view/{person_id}`) and the customers/suppliers row action gated by the `messages` grant and phone presence. |
| G-MSG-4 | Restore phone validation parity (required, numeric upstream) and decide on multi-recipient handling; the current library signature cannot accept comma lists. |
| G-MSG-5 | Restore success/danger notification semantics and the escaped-phone message text (`Messages.successfully_sent`/`unsuccessfully_sent`). |
| G-MSG-6 | Add a persisted or at least logged send history only if the project explicitly extends upstream (upstream has none); otherwise remove the dead `getMessageHistoryAction`. |
| G-MSG-7 | Fix the UI copy that claims the provider is stubbed, or make it true. |
| G-MSG-8 | Confirm Seed/Config parity: all four keys seeded empty (target already does, `seed.ts:86-89`) and `msg_pwd` encrypted-at-rest (already does). |
| G-MSG-9 | Optional, cross-cutting: align `smtp_timeout` units with `Email_lib` if the email path is reconstructed (target `getConfig` treats it as seconds at `src/lib/email/index.tsx:38-40`). |

### 7.5 Messages acceptance tests

1. With empty `msg_uid`/`msg_pwd`/`msg_src`, send returns failure and the UI shows the failure message.
2. With configured values (mock fetch / mock transport), send returns success; the message text escaping mirrors `esc($phone)`.
3. Per-person form prefills first/last/phone and `msg_msg`, and is unreachable when the `messages` grant is absent.
4. Phone empty → required error; message empty → required error.
5. `msg_pwd` is never echoed back into the Config form (placeholder only) and is decrypted only at send time.

---

## 8. Cross-cutting target gap analysis

### 8.1 Schema parity matrix

| Upstream table | Upstream columns (final) | Target table | Target columns | Verdict |
|---|---|---|---|---|
| `giftcards` (`initial_schema.sql:139-148`) | `record_time, giftcard_id, giftcard_number (varchar 255), value decimal(15,2), deleted, person_id` | `giftcards` (`src/db/schema/giftcards.ts:4-10`) | `giftcard_id, giftcard_number text unique, value real, person_id, deleted` | Missing `record_time`; number notNull vs upstream nullable; value real vs decimal; otherwise compatible |
| `customers_packages` (`3.0.2_to_3.1.1.sql:79-85`) | `package_id, package_name, points_percent float, deleted` | `rewards` (`customers.ts:32-37`) | `reward_id, name, points_percent, deleted` | Wrong names; seed defaults missing |
| `customers_points` (`:98-105`) | `id, person_id, package_id, sale_id, points_earned` | absent | — | Missing (dead upstream table) |
| `sales_reward_points` (`:111-117`) | `id, sale_id, earned float, used float` | absent | — | Missing; breaks reward ledger and report columns |
| `customers.package_id` (`:121-123`) | nullable int FK | absent (`customers.ts:5-15`) | only `points` | Missing; no package assignment |
| `dinner_tables` (`3.0.2_to_3.1.1.sql:33-39`) | `dinner_table_id, name, status, deleted` | `dinner_tables` (`customers.ts:25-30`) | identical | Compatible; seed rows missing |
| `cash_up` (`3.2.1_to_3.3.0.sql:63-103`) | see §6.1 | `cashups` (`cashups.ts:4-13`) | 9 of 15 columns | Missing due/card/check/total/description/open+close employee; note type changed |
| `expenses` (`3.1.1_to_3.2.0.sql:148-157` + `3.2.1_to_3.3.0.sql:120-146`) | `expense_id, date, amount, payment_type, expense_category_id, description, employee_id, deleted, supplier_tax_code, tax_amount, supplier_id` | `expenses` (`expenses.ts:4-13`) | `expense_id, expense_time, amount, payment_type, expense_category_id, description, employee_id, deleted` | `date` renamed; supplier/tax columns missing |
| `expense_categories` (`3.1.1_to_3.2.0.sql:138-143`) | `expense_category_id, category_name, category_description, deleted` + UNIQUE(name) | `expense_categories` (`expenses.ts:15-20`) | `expense_category_id, category, description, deleted` | Both column names wrong; unique index missing |

Generated SQLite DDL confirms the target shape (`drizzle/sqlite/0000_skinny_power_man.sql:181-207,375-405`). Drizzle migrations have already shipped these names, so any correction requires a new migration, not an edit of `0000`.

### 8.2 Config-key parity

| Key | Upstream default | Target seed | Target consumers | Verdict |
|---|---|---|---|---|
| `giftcard_number` (`3.0.2_to_3.1.1.sql:229`) | `series` | **absent** (`src/db/seed.ts` has no such key) | none | Missing default **and** logic |
| `customer_reward_enable` (`:128`) | `0` | **absent** | Config tab writes it (`tabs.ts:205`); sale code reads `use_customer_rewards` (`sale-model.ts:219`) | Broken gate |
| `dinner_table_enable` (`:72`) | `0` | `"0"` (`seed.ts:80`) | register (`register/page.tsx:57`), sale model | Parity |
| `msg_msg` (`initial_schema.sql:69`) | `''` | `""` (`seed.ts:86`) | not read by SMS lib | Key present, template unused |
| `msg_uid` (`:70`) | `''` | `""` (`seed.ts:87`) | `sms/index.ts:6` | Parity |
| `msg_src` (`:71`) | `''` | `""` (`seed.ts:88`) | `sms/index.ts:8` | Parity |
| `msg_pwd` (`:72`) | `''` | `""` (`seed.ts:89`) | `sms/index.ts:7` (decrypted) | Parity |
| `date_or_time_format` (`3.0.2_to_3.1.1.sql:66`) | `''` | **absent** (`src/db/seed.ts`, `src/lib/config/tabs.ts` contain no such key) | expense/cashup filters | Missing default; target filters also ignore the flag entirely; see G-EX-3/G-CU-8 |

`customer_reward_enable` and `giftcard_number` are the two load-bearing omissions. Both are seeded upstream at the exact migration lines cited; the target seed's absence is verifiable by grep (`src/db/seed.ts` contains neither string).

### 8.3 Seed data parity

- Packages: upstream seeds five rows (`3.0.2_to_3.1.1.sql:87-92`); target seeds none and the table itself is named `rewards`.
- Dinner tables: upstream seeds Delivery/Take Away (`:41-43`); target seeds none.
- Permissions/modules: target seed `src/db/seed.ts:109-164` matches the upstream ids for `giftcards`, `messages`, `expenses`, `expenses_categories`, `cashups`, but adds `reports_cashups` (`:147`) and omits `reports_expenses_categories` (`3.1.1_to_3.2.0.sql:128`).
- Giftcard demo rows: upstream initial schema's dump section is empty in this tree; target seeds none (parity).

### 8.4 Sale-path integration status (summary)

| Concern | Upstream | Target | Cite |
|---|---|---|---|
| Giftcard payment id | `Gift Card: <number>`, split on first `:` | constant `GIFT_CARD_PREFIX = "Gift Card: "` exists, but the register never produces `<number>` (checks `"giftcard"`) | `Sales.php:474`; `src/lib/constants.ts:98`; `register.tsx:410-417` |
| Giftcard balance check | `value >= amount` atomic decrement; insufficient → -2 | direct subtraction in `saveSale`; can go negative; no -2 | `Giftcard.php:314-327`; `sale-model.ts:96-101` |
| Giftcard add-time mutation | none | decrement in `addPayment`, restore on `deletePayment` | `sale-lib.ts:534-542,624-632` |
| Giftcard customer check | `Giftcards.cannot_use` | absent | `Sales.php:477-483` |
| Rewards payment id | exact `Rewards` | exact `Rewards` (`REWARDS_PREFIX`) | `Sales.php:515`; `constants.ts:99` |
| Rewards gate | customer `package_id` non-empty | none | `Sales.php:496-497` |
| Rewards atomicity | guarded atomic UPDATE; -3 sentinel | unguarded subtract; no sentinel | `Customer.php:246-260`; `sale-lib.ts:547-548` |
| Rewards double spend | only at save | addPayment + saveSale | `Sale.php:594-599`; `sale-lib.ts:543-552`; `sale-model.ts:102-108` |
| Earn formula | gross `totalAmount * pct/100` | `(total - used) * pct/100` | `Sale.php:1427`; `sale-model.ts:226` |
| Earn ledger | `sales_reward_points` insert | absent | `Sale.php:1431-1433` |
| Dinner occupy/release | config-gated, id>2 guard, COMPLETED releases / else occupies | status set directly, no config gate on cancel, no guard | `Sale.php:688-695`; `sale-model.ts:203-209,529-535` |
| Table swap | release(current)+occupy(new) | copies name onto destination | `Dinner_table.php:160-163`; `Sales.php:283-293`; `dinner_tables/repository.ts:71-79` |
| Cashup aggregation | Summary_payments + cash expenses | none | `Cashups.php:160-265` |

### 8.5 File-by-file gap matrix

Legend: **M** = missing, **P** = partial, **D** = divergent behavior/name, **OK** = parity, **X** = dead/unused code.

| Upstream | Target counterpart | Status | Notes |
|---|---|---|---|
| `app/Models/Giftcard.php` | `src/lib/giftcards/repository.ts` | P/D | no atomic increment/decrement, no record_time, no get_max_number, search too narrow, no suggestions of customers |
| `app/Controllers/Giftcards.php` | `src/app/(secure)/giftcards/actions.ts` + pages | P/D | no config modes, no checkNumber endpoint, no JSON contract, no bulk delete |
| `app/Views/giftcards/*` | `src/components/giftcards/*` | P/D | columns/fields differ; select vs autocomplete |
| `app/Models/Customer_rewards.php` | `src/lib/rewards/repository.ts` | D | wrong table/columns; no exists-based upsert; no forced deleted=0 |
| `app/Models/Rewards.php` | none (no `sales_reward_points` repo) | M | ledger absent |
| `app/Controllers/Config.php:744-749,987-1030` | `src/app/(secure)/rewards/actions.ts` + pages | D | standalone CRUD instead of config bulk save; wrong permission for reads |
| `app/Models/Customer.php:246-260` | direct writes in `sale-lib.ts`/`sale-model.ts` | D/M | no `adjustRewardPoints` equivalent |
| `app/Views/partial/customer_rewards.php`, `configs/reward_config.php` | `src/components/rewards/*` | D | no add/remove row cloning, no duplicate validation |
| `app/Models/Dinner_table.php` | `src/lib/dinner_tables/repository.ts` | P/D | isOccupied wrong source, swap broken, no empty-tables, no id>2 guard |
| `app/Controllers/Config.php:714-723,898-943` | `src/app/(secure)/dinner_tables/*` | D | standalone CRUD; config permission though |
| `app/Views/partial/dinner_tables.php`, `configs/table_config.php` | `src/components/dinner_tables/*` | D | no bulk add/remove, no enable toggle in the same screen |
| `app/Models/Expense.php` | `src/lib/expenses/repository.ts` | P/M | missing supplier/tax, full search/filters, payment summary |
| `app/Controllers/Expenses.php` | `src/app/(secure)/expenses/actions.ts` + pages | P/M | no employee grant logic, no date, no JSON contract, no totals |
| `app/Views/expenses/*` | `src/components/expenses/*` | P/M | missing fields/columns and print |
| `app/Models/Expense_category.php` | `src/lib/expenses_categories/repository.ts` | D | names, unique, get_info shape, search fields |
| `app/Controllers/Expenses_categories.php` | `src/app/(secure)/expenses_categories/actions.ts` | P/D | success-true bug not reproduced (target errors are thrown), permission typo in helpers |
| `app/Models/Cashup.php` | `src/lib/cashups/repository.ts` | P/M | half the columns; calculateTotal dead |
| `app/Controllers/Cashups.php` | `src/app/(secure)/cashups/actions.ts` | M | no close/recompute/aggregation/total |
| `app/Views/cashups/*` | `src/components/cashups/*` | P/M | missing fields, totals, filters, print |
| `app/Libraries/Sms_lib.php` | `src/lib/sms/index.ts` | D | Twilio vs stub; msg_msg unused; no validation |
| `app/Controllers/Messages.php` | `src/app/(secure)/messages/actions.ts` + page | P/M | no per-person form, no JSON contract/target messaging |
| `app/Views/messages/*` | `src/components/messages/messages-form.tsx` | P | single generic form |
| `app/Libraries/Email_lib.php` | `src/lib/email/index.tsx` | OK-ish | separate subsystem; not used by messages upstream or target |
| `app/Libraries/Mailchimp_lib.php` | `src/lib/mailchimp/index.ts` | out of scope | not used by messages |

---

## 9. Implementation obligations (ordered)

Order is dependency-first: schema corrections unblock repositories, which unblock actions/UI, which unblock tests. Each obligation names target files, the exact data contract, and acceptance tests.

### Phase 1 — Schema and seed corrections (blocking everything else)

**O1. Giftcards schema.**
- Files: `src/db/schema/giftcards.ts`, `src/db/schema/mysql/index.ts:398-405`, new Drizzle migration under `drizzle/sqlite/` (and MySQL generation).
- Contract: add `record_time` (epoch integer in SQLite, `timestamp DEFAULT CURRENT_TIMESTAMP` in MySQL); keep `giftcard_number` as text (upstream now varchar(255), nullable); `value` stays numeric (real/decimal), `deleted` boolean, `person_id` FK `people`.
- Acceptance: insert without `record_time` receives now; generated DDL contains the column; MySQL generation matches `src/db/schema/mysql/index.ts`.

**O2. Rewards schema.**
- Files: `src/db/schema/customers.ts`, `mysql/index.ts:158-198`.
- Contract:
  - `customers_packages { package_id PK, package_name, points_percent real, deleted boolean }`.
  - `customers.package_id` nullable FK to `customers_packages.package_id`.
  - `sales_reward_points { id PK, sale_id FK sales, earned real, used real }`.
  - Decide `customers_points` reproduction (explicit deviation note if omitted).
  - Deprecate `rewards`/`customer_rewards` or keep only as documented extensions.
- Acceptance: schema-generation tests; FK constraints enforced in SQLite (`PRAGMA foreign_keys` assumed on by the project).

**O3. Cashup schema.**
- Files: `src/db/schema/cashups.ts`, `mysql/index.ts:385-396`.
- Contract: table `cash_up` with all fifteen upstream columns; `open_employee_id`/`close_employee_id` FKs to employees; `note` boolean/integer; `description` text; `closed_amount_*` numeric.
- Acceptance: DDL parity test comparing column names/types against the upstream list in §6.1.

**O4. Expense/category schema.**
- Files: `src/db/schema/expenses.ts`, `mysql/index.ts:366-383`.
- Contract: `expenses.date` (epoch/timestamp), `supplier_id` FK suppliers, `supplier_tax_code`, `tax_amount`; `expense_categories.category_name` UNIQUE, `category_description`.
- Acceptance: duplicate name insert fails; expense insert with supplier/tax round-trips.

**O5. Seed defaults.**
- File: `src/db/seed.ts`.
- Contract: add config `giftcard_number: "series"`, `customer_reward_enable: "0"`; seed `customers_packages` rows (Default 0, Bronze 10, Silver 20, Gold 30, Premium 50); seed `dinner_tables` ids 1 `Delivery`, 2 `Take Away`; add `reports_expenses_categories` permission (or remove the target-only `reports_cashups` if the extra reports are dropped).
- Acceptance: fresh `npm run db:seed` produces those rows idempotently (`onConflictDoUpdate` pattern already used at `seed.ts:239-243`).

### Phase 2 — Repositories / domain logic

**O6. Giftcard repository/service.**
- Files: `src/lib/giftcards/repository.ts`, new `src/lib/giftcards/service.ts` if needed.
- Contract:
  - `getInfo(id)` excludes deleted; missing → empty row with `giftcardId = -1`.
  - `getMaxNumber()` returns numeric max or null.
  - `search(term, {rows, limitFrom, sort, order, countOnly})` covers person first/last/full name, number, person id; returns `{total, rows}`.
  - `getSuggestions(term, limit)` returns `[{label}]` for cards **and** customer names.
  - `decrementValue(number, amount)` and `incrementValue(number, amount)` as single conditional UPDATEs rejecting `<= 0`, deleted rows, and insufficient balance; exact balance succeeds.
  - `saveValue` upserts and sets `record_time` on create (and upstream also refreshes it on update).
- Acceptance: §1.11 tests 1-7; search tests; deleted-invisibility tests.

**O7. Reward service.**
- Files: `src/lib/rewards/repository.ts`, `src/lib/customer_rewards/repository.ts` (or replace with `src/lib/rewards/service.ts`), `src/lib/persons/repository.ts`.
- Contract:
  - Package CRUD with `exists`-based upsert forcing `deleted=0`.
  - `adjustRewardPoints(customerId, delta)` atomic guarded UPDATE returning boolean.
  - `saveCustomerRewards(customerId, saleId, grossTotal, used)` writing `sales_reward_points`.
  - Config gate `customer_reward_enable`.
- Acceptance: §2.10 tests 1-10.

**O8. Dinner table repository.**
- Files: `src/lib/dinner_tables/repository.ts`.
- Contract: `isOccupied` reads `status === 1`; `getEmptyTables(currentId)`; `occupy/release` with id>2 guard; `swapTables` release+occupy; `getAll` excludes deleted.
- Acceptance: §3.5 tests.

**O9. Expense/category repository.**
- Files: `src/lib/expenses/repository.ts`, `src/lib/expenses_categories/repository.ts`.
- Contract: full search/filter object `{startDate, endDate, onlyCash, onlyDue, onlyCheck, onlyCredit, onlyDebit, isDeleted, search}`; payment summary; category search by name+description; deleted semantics.
- Acceptance: §4.7, §5.5.

**O10. Cashup service.**
- Files: `src/lib/cashups/repository.ts`, new `src/lib/cashups/calculation.ts` (payment aggregation + expense subtraction) reusing the reports data layer or a dedicated query.
- Contract: `calculateTotal` used; `aggregatePayments(start, end)` mapping cash/due/debit+credit/check, giftcard aggregation; `subtractCashExpenses`; `isPendingClose` all-zero test; `initializeNew`.
- Acceptance: §6.7 tests 1-6.

### Phase 3 — Server actions / pages / UI

**O11. Giftcards.**
- Files: `src/app/(secure)/giftcards/actions.ts`, `page.tsx`, `new/[id]/page.tsx`, `src/components/giftcards/*`, `src/app/api/giftcards/suggest/route.ts`.
- Contract:
  - Save response `{success, message, id}` (or redirect + flash) with message text matching upstream language strings; number generation config-aware.
  - List response/table with `giftcard_id, last_name, first_name, giftcard_number, value`; value currency-formatted; customer name resolved.
  - Bulk delete; customer autocomplete endpoint shape `{label, value}`.
- Acceptance: e2e `giftcards.spec.ts` extended for series prefill, random generation, duplicate rejection, bulk delete.

**O12. Rewards/package config.**
- Files: `src/app/(secure)/rewards/*`, `src/components/rewards/*`, `src/lib/config/tabs.ts`, `src/app/(secure)/config/*`, `src/components/customers/customer-form.tsx`, `src/app/(secure)/customers/actions.ts`.
- Contract: Config -> Rewards tab with enable flag + repeatable package rows (name, points percent) and delete-on-absence; customer form package dropdown + read-only points when enabled; remove direct points editing (or gate it behind config/admin with an explicit deviation note).
- Acceptance: config round-trip test; customer package persists; points field not user-editable.

**O13. Dinner tables.**
- Files: `src/app/(secure)/dinner_tables/*`, `src/components/dinner_tables/*`, `src/app/(secure)/sales/actions.ts`, `src/components/sales/register.tsx`.
- Contract: Config-style bulk edit or explicit deviation; register selection gated by `dinner_table_enable`; swap semantics; sentinel tables excluded from occupancy.
- Acceptance: §3.5 plus e2e selection/suspend/complete.

**O14. Expenses/categories.**
- Files: `src/app/(secure)/expenses/*`, `src/app/(secure)/expenses_categories/*`, components, `src/lib/reports/registry.ts`.
- Contract: full form fields (date/supplier/tax/payment/category/employee/description/deleted), employee grant logic, list filters/date range/payment summary/totals/print; category unique names and renamed columns.
- Acceptance: §4.7, §5.5, e2e updates.

**O15. Cashups.**
- Files: `src/app/(secure)/cashups/*`, `src/components/cashups/*`, `src/lib/reports/registry.ts`.
- Contract: open/close form with all fields, server recompute, force employee, AJAX total action, filters/search, print, delete response.
- Acceptance: §6.7 tests 1-8, e2e cashups extended.

**O16. Messages/SMS.**
- Files: `src/lib/sms/index.ts`, `src/app/(secure)/messages/*`, `src/components/messages/*`, customer/supplier tables.
- Contract: `sendSMS(phone, message)` gateway-neutral; `msg_msg` default body; per-person form; phone validation; success/danger UI; optional provider config.
- Acceptance: §7.5.

### Phase 4 — Sale-path integration (must not be skipped)

**O17. Giftcard redemption.**
- Files: `src/lib/sale/sale-lib.ts`, `src/lib/sale/sale-model.ts`, `src/components/sales/register.tsx`, `src/app/(secure)/sales/actions.ts`.
- Contract:
  - Register: when the selected option is `Gift Card: `, prompt for number, append it to the payment id (`Gift Card: <number>`), fetch value, enforce ownership and remaining balance, set `giftcardRemainder`, add `min(amountDue, value)`.
  - Remove add-time mutation from `addPayment`; remove restore from `deletePayment`.
  - At `saveSale`, decrement atomically; on failure rollback and return a sentinel (`INSUFFICIENT_GIFTCARD_BALANCE = -2`); return-mode credit increments.
  - Surface the error string in the register.
- Acceptance: §1.11 tests 8-10 plus concurrency test.

**O18. Rewards redemption.**
- Files: same plus `src/lib/persons` or new reward service.
- Contract: require `customers.package_id`; atomic guarded decrement; sentinel `-3`; remove add-time mutation; gross earn formula; ledger insert.
- Acceptance: §2.10 tests 6-10.

**O19. Dinner table occupancy in sales.**
- Files: `src/lib/sale/sale-model.ts`, `src/lib/sale/sale-lib.ts`, `src/app/(secure)/sales/actions.ts`.
- Contract: config gate; COMPLETED release, SUSPENDED occupy; cancel/delete-suspended/clear-detail release; table swap on selection change; sentinel ids 1/2 never occupied.
- Acceptance: §3.5 tests 5-7.

**O20. Cashup aggregation dependency.**
- Files: `src/lib/sale/*` / reports registry (payment rows) and `src/lib/cashups/calculation.ts`.
- Contract: completed sales only, `sale_time` between open/close (date vs datetime), payments grouped with `cash_refund` netting, expenses cash-only.
- Acceptance: cashup test 6 above with seeded sales/payments/expense.

### Test-file obligations (explicit)

| Upstream test | Target test to create | Notes |
|---|---|---|
| `tests/Models/GiftcardTest.php` | `src/lib/giftcards/repository.test.ts` | port all 11 tests; concurrency via two SQLite connections/processes or a serialized `BEGIN IMMEDIATE` test |
| `tests/Models/CustomerRewardPointsTest.php` | `src/lib/rewards/repository.test.ts` | port 5 tests + earn/redeem integration |
| `tests/Controllers/CashupControllerTest.php` | `src/lib/cashups/repository.test.ts` + `src/lib/cashups/calculation.test.ts` | port 8 behavioral tests; UI-level checks via e2e |
| (none upstream for expenses) | `src/lib/expenses/repository.test.ts` | §4.7 |
| (none upstream for dinner tables) | `src/lib/dinner_tables/repository.test.ts` | §3.5 |
| (none upstream for messages) | `src/lib/sms/index.test.ts` | §7.5 with mocked fetch |
| `tests/Support/ExpenseFixtureTrait.php`, `CashupFixtureTrait.php`, `SaleFixtureTrait.php` | `src/test-support/fixtures.ts` helpers | not present in target; the e2e `fixtures.ts` is Playwright-only (`e2e/fixtures.ts:1-16`) |

Target test harness facts to follow: vitest with `environment: "node"` and alias `@` (`vitest.config.ts:1-15`), in-memory SQLite via `process.env.DATABASE_URL = ":memory:"` before imports (`src/lib/sale/sale-lib.test.ts:1-7`), and mocking `@/lib/auth/options` (`:5-7`).

---

## 10. Unknowns and open decisions

1. **Epoch vs timestamp storage.** The target consistently stores dates as integer epoch seconds (`saleTime`, `expenseTime`, `openDate`), while upstream uses SQL `timestamp`. Whether to keep epoch and only rename columns, or to use text timestamps, is a project-wide convention decision not settled by any single subsystem. All obligations above assume "keep epoch, rename to upstream column names".
2. **Dead upstream defects.** Several upstream behaviors are bugs. This report documents them, but the project must decide whether parity means bug-for-bug reproduction: giftcard recursion (`Giftcard.php:366-368`), response number overwritten with insert id (`:146-147`), `get_empty_tables` precedence (`Dinner_table.php:60-62`), expense-category failure returning `success: true` (`Expenses_categories.php:100-106`), cashup `save_value` `!$id == NEW_ENTRY` (`Cashup.php:230`), and `Cashup::get_employee` referencing a nonexistent column (`:51-59`).
3. **Giftcard `record_time` type.** Upstream uses a timestamp default; if the project uses epochs, the migration must choose epoch. No target precedent exists for an auto `record_time` audit column.
4. **Rewards extension.** The target's many-to-many `customer_rewards` and standalone `/rewards` module could be an intentional product extension. If so, the upstream single-package semantics must be layered on top (one package per customer) or the extension must be documented as a deviation. No design document in the repo states the intent (only `OSPOS_100_PERCENT_IMPLEMENTATION_PLAN.md` and other reconstruction reports exist).
5. **`customers_points`.** Its purpose cannot be inferred from 3.4.3 code (no reads/writes). Whether to reproduce it for schema-parity tooling is undecided.
6. **Cashup "note".** Upstream's boolean flag is clearly not a free-text note, but the target shipped a textarea. Reconciling the UI (flag vs note) is a product decision; the column type must follow the choice.
7. **Expense `supplier_name`.** It was dropped in `3.2.1_to_3.3.0.sql:145-146`. If the target is expected to migrate old 3.1.x data, the intermediate column and backfill rules matter; for greenfield parity only the final `supplier_id` set is required.
8. **SMS provider.** Upstream has no provider. The target implements Twilio. Whether a real provider is in scope (and which credentials/config keys) is unspecified; the current `msg_*` keys are gateway-generic, so adding a provider selector would be a new config surface.
9. **Extra target reports.** `summary_expenses`, `summary_cashups`, `summary_giftcards` (`src/lib/reports/registry.ts:283-348`) are not upstream. Their permissions (`reports_cashups` seeded, `reports_giftcards` not seeded) are inconsistent. Retention vs removal is a reports-subsystem decision (see report 08).
10. **MySQL drift.** All target repositories call `getDbSync()` (SQLite-only) and throw under `DB_DRIVER=mysql` (`src/lib/db/index.ts:32-36`). The MySQL mirrors exist but no subsystem in scope exercises them; parity of the MySQL migration path cannot be verified from the current code.
11. **Language/i18n.** Upstream uses `lang()` keys for every message; target pages hardcode English labels (e.g. `giftcard-form.tsx:16-33`, `cashups-table.tsx:29-34`). The i18n reconstruction is tracked elsewhere; these pages will need key-based strings once that lands.
12. **No upstream tests for expenses/dinner/messages.** Acceptance criteria in §4.7/§3.5/§7.5 are derived from code reading, not from executable upstream tests, so they are "probable" rather than "confirmed" parity.
13. **`checkNumeric` endpoint.** Upstream views reference `expenses/checkNumeric` and `giftcards/checkNumeric` but no implementation exists anywhere in `app/`. It is unknown whether a missing route/legacy helper was intended; the target should prefer server-side validation rather than reproducing the dead remote rule.
14. **Cashup closing without save.** The all-zero "pending close" heuristic means merely opening an existing all-zero cashup recomputes and displays values that are only persisted if the user submits. Whether a separate close action was intended is not documented.

---

## 11. Appendix — exact target reference index

### 11.1 Target files read for this report

- `src/db/schema/giftcards.ts:1-10`; `src/lib/giftcards/repository.ts:1-91`; `src/app/(secure)/giftcards/actions.ts:1-62`; `src/app/(secure)/giftcards/page.tsx:1-23`; `src/app/(secure)/giftcards/new/[id]/page.tsx:1-22`; `src/components/giftcards/giftcard-form.tsx:1-39`; `src/components/giftcards/giftcards-table.tsx:1-39`; `src/app/api/giftcards/suggest/route.ts:1-11`.
- `src/db/schema/customers.ts:1-42`; `src/lib/rewards/repository.ts:1-51`; `src/lib/customer_rewards/repository.ts:1-50`; `src/app/(secure)/rewards/actions.ts:1-38`; `src/app/(secure)/rewards/page.tsx:1-23`; `src/app/(secure)/rewards/new/[id]/page.tsx:1-14`; `src/components/rewards/rewards-form.tsx:1-36`; `src/components/rewards/rewards-table.tsx:1-33`.
- `src/lib/dinner_tables/repository.ts:1-89`; `src/app/(secure)/dinner_tables/actions.ts:1-38`; `src/app/(secure)/dinner_tables/page.tsx:1-23`; `src/app/(secure)/dinner_tables/new/[id]/page.tsx:1-14`; `src/components/dinner_tables/dinner-tables-form.tsx:1-32`; `src/components/dinner_tables/dinner-tables-table.tsx:1-33`.
- `src/db/schema/expenses.ts:1-22`; `src/lib/expenses/repository.ts:1-93`; `src/lib/expenses_categories/repository.ts:1-71`; `src/app/(secure)/expenses/actions.ts:1-51`; `src/app/(secure)/expenses/page.tsx:1-24`; `src/app/(secure)/expenses/new/[id]/page.tsx:1-15`; `src/components/expenses/expense-form.tsx:1-55`; `src/components/expenses/expenses-table.tsx:1-51`; `src/app/(secure)/expenses_categories/actions.ts:1-39`; `src/app/(secure)/expenses_categories/page.tsx:1-23`; `src/app/(secure)/expenses_categories/new/[id]/page.tsx:1-15`; `src/components/expenses/category-form.tsx:1-33`; `src/components/expenses/categories-table.tsx:1-33`.
- `src/db/schema/cashups.ts:1-14`; `src/lib/cashups/repository.ts:1-102`; `src/app/(secure)/cashups/actions.ts:1-56`; `src/app/(secure)/cashups/page.tsx:1-20`; `src/app/(secure)/cashups/new/[id]/page.tsx:1-24`; `src/components/cashups/cashup-form.tsx:1-72`; `src/components/cashups/cashups-table.tsx:1-56`.
- `src/lib/sms/index.ts:1-36`; `src/app/(secure)/messages/actions.ts:1-21`; `src/app/(secure)/messages/page.tsx:1-7`; `src/components/messages/messages-form.tsx:1-33`; `src/lib/config/tabs.ts:154-157,202-206,218-220`; `src/db/seed.ts:50-95,109-164`; `src/lib/config/index.ts:1-70`.
- Sale integration: `src/lib/sale/sale-lib.ts:1-20,500-646,720-780`; `src/lib/sale/sale-model.ts:1-250,400-540,660-700`; `src/components/sales/register.tsx:1-60,380-425`; `src/app/(secure)/sales/actions.ts:1-248`; `src/app/(secure)/sales/register/page.tsx:1-60`; `src/lib/constants.ts:1-120`.
- Reports/UI/test harness: `src/lib/reports/registry.ts:283-348`; `src/components/shared/sidebar.tsx:20-70`; `src/lib/auth/with-permission.ts:1-24`; `vitest.config.ts:1-15`; `src/lib/sale/sale-lib.test.ts:1-60`; `e2e/{giftcards,rewards,cashups,expenses,expense-categories,dinner-tables,messages}.spec.ts`.
- MySQL mirror: `src/db/schema/mysql/index.ts:150-216,360-405`; generated SQLite DDL `drizzle/sqlite/0000_skinny_power_man.sql:181-207,375-405`.

### 11.2 Target dead-code / permission anomalies found

- `src/app/(secure)/giftcards/actions.ts:56-62`, `src/app/(secure)/expenses/actions.ts:46-50`, `src/app/(secure)/expenses_categories/actions.ts:35-38`, `src/app/(secure)/rewards/actions.ts:35-38`, `src/app/(secure)/dinner_tables/actions.ts:34-38`: repository re-export/helper actions that no component calls.
- `src/app/(secure)/expenses_categories/actions.ts:36-37`: `requirePermission("expense_categories")` (singular) — permission does not exist.
- `src/app/(secure)/rewards/actions.ts:36-37`: `requirePermission("rewards")` — permission does not exist.
- `src/app/(secure)/dinner_tables/actions.ts:35-37`: `requirePermission("dinner_tables")` — permission does not exist.
- `src/app/(secure)/cashups/actions.ts:52-54`: `getCashupTotalRowsAction` has no permission check.
- `src/app/api/giftcards/suggest/route.ts`: no caller.
- `src/lib/customer_rewards/repository.ts:32-38`: stubbed `getName`/`getPointsPercent`.
- `src/lib/cashups/repository.ts:44-46`: `calculateTotal` never called.
- `src/lib/sale/sale-model.ts:681-693`: `saveCustomerRewardPoints` duplicate/alternate earn path, never called.
- `src/lib/sale/sale-model.ts:119` vs `:217`: earn path exists but is gated by the wrong config key.

### 11.3 Upstream defects intentionally documented (not fixed here)

- Giftcard `save_value` overwrites the response number with insert id (`Giftcard.php:146-147`).
- Giftcard recursive uniqueness retry discards its result (`:366-368`).
- `Giftcard::get_search_suggestions` limit param coerced from bool `true` to `1` at the controller call (`Giftcards.php:62`).
- Expense-category failure JSON returns `success: true` (`Expenses_categories.php:100-106`).
- `Cashup::save_value` operator-precedence condition (`Cashup.php:230`).
- `Cashup::get_multiple_info` typed `string` but used with arrays (`:65`).
- `Dinner_table::get_empty_tables` precedence (`Dinner_table.php:60-62`).
- `Dinner_table::delete`/`save_value` do not guard against active sales (`:40-52,120-126`).
- `Expenses::postSave` fatals on an unparsable date (`Expenses.php:159-161,178`).
- `get_payment_options` order is config-driven and localized; target hardcodes English labels (`locale_helper.php:240-283`).
- `Sms_lib` accepts a single integer phone (`Sms_lib.php:23`) while the UI advertises comma-separated recipients (`sms.php:16`).

### 11.4 Confidence

- **Confirmed**: schema definitions, column lists, model method behavior, controller flows, totals formulas, permission seeds, target schema/code contents — all directly cited line-by-line.
- **Probable**: the exact impact of missing routes (`checkNumeric`), and the intent behind target-only `rewards`/`customer_rewards`/extra reports — inferred from code absence/presence, not from a design document.
- **Speculative**: whether any target subsystem will actually exercise the MySQL mirror; no in-scope code path uses the async `getDb()`.

---

End of report.
