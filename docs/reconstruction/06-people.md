# 06 — People subsystem (customers, suppliers, employees, persons, login/RBAC)

**Analysis agent:** G (source-parity project)
**UPSTREAM (source of truth):** `/home/yash/ospos` — OSPOS 3.4.3, commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`
**TARGET:** `/home/yash/Desktop/yash/ospos-nextjs` — Next.js 16 + Drizzle port
**Status of this document:** analysis only; no source file was modified. All citations are `path:line` against the roots above.

Citation convention: `app/Models/Customer.php:49` is upstream; `src/lib/persons/repository.ts:73` is target.

---

## 0. Files read for this report

Upstream (full reads):

- `app/Models/Person.php` (221), `app/Models/Customer.php` (461), `app/Models/Supplier.php` (314), `app/Models/Employee.php` (596), `app/Models/Module.php` (161), `app/Models/Customer_rewards.php`, `app/Models/Rewards.php`, `app/Models/Tax_code.php:52`
- `app/Controllers/Persons.php` (76), `Customers.php` (493), `Suppliers.php` (192), `Employees.php` (324), `Login.php` (159), `Secure_Controller.php` (185), `Home.php` (137), `Office.php` (37), `No_access.php`
- `app/Views/people/manage.php`, `people/form_basic_info.php`, `customers/form.php`, `customers/form_csv_import.php`, `suppliers/form.php`, `employees/form.php`, `home/home.php`, `home/office.php`, `home/form_change_password.php`, `login.php`, `no_access.php`, `partial/header.php`
- `app/Libraries/Mailchimp_lib.php` (337), `app/Helpers/importfile_helper.php` (129), `app/Helpers/tabular_helper.php` (people rows), `app/Helpers/locale_helper.php`, `app/Helpers/migration_helper.php`
- `app/Filters/IsLoggedIn.php`, `app/Filters/Throttle.php`, `app/Config/Filters.php`, `app/Config/Routes.php`, `app/Config/Routing.php`, `app/Config/Constants.php`, `app/Config/Validation/OSPOSRules.php`
- Schema/seed sources: `app/Database/Migrations/sqlscripts/initial_schema.sql`, `3.0.2_to_3.1.1.sql`, `3.1.1_to_3.2.0.sql`, `3.2.0_to_3.2.1.sql`, `3.2.1_to_3.3.0.sql`, `3.3.0_indiagst*.sql`, `3.3.0_attributes.sql`, `3.3.2_saleschangeprice.sql`, `3.4.0_database_optimizations.sql`, `app/Database/Migrations/20230412000001_drop_account_number_index.php`
- Tests: `tests/Models/EmployeeTest.php`, `tests/Controllers/EmployeesControllerTest.php`, `tests/Controllers/CustomersCsvImportTest.php`, `tests/Controllers/LoginTest.php`, `tests/Controllers/HomeTest.php`, `tests/Models/CustomerRewardPointsTest.php`, `tests/Support/EmployeeFixtureTrait.php`

Target (full reads): `src/lib/persons/repository.ts`, `src/lib/employees/repository.ts`, `src/lib/suppliers/repository.ts`, `src/lib/auth/{options,password,rbac,rbac.test,with-permission}.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(secure)/{customers,suppliers,employees,home,office,change-password,no_access}/**`, `src/components/{customers,suppliers,employees,shared}/**`, `src/app/api/{customers,suppliers}/suggest/route.ts`, `src/db/schema/{auth,customers,mysql/index}.ts`, `src/db/seed.ts`, `src/lib/{mailchimp,csv,i18n,config}`, `src/proxy.ts`, `e2e/{customers,employees,home,office,auth}.spec.ts`, `e2e/helpers.ts`, `drizzle/sqlite/0000_skinny_power_man.sql`.

`app/Helpers/migration_helper.php` contains no employee/customer/person code (it only executes SQL migration scripts; grep for `employee|person|grant|permission|customer|supplier` returns nothing). The only people-relevant migration logic is the SQL scripts cited above. This is recorded as an upstream-doc correction.

---

## 1. Person model (`app/Models/Person.php`)

### 1.1 Shape

| Property | Value | Cite |
|---|---|---|
| Table | `people` | `app/Models/Person.php:14` |
| Primary key | `person_id` (auto-increment) | `Person.php:15-16` |
| Soft deletes | **false** — people rows are never soft-deleted; subtype tables carry `deleted` | `Person.php:17` |
| `$allowedFields` | `first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments, gender` | `Person.php:18-31` |

There is **no address entity**: address is 6 flat columns (`address_1`, `address_2`, `city`, `state`, `zip`, `country`) on `people` (`Person.php:23-28`; DB definition `initial_schema.sql:325-340`).

Gender is a single `int(1) NULL` column (`initial_schema.sql:328`), rendered by the shared partial `app/Views/people/form_basic_info.php:32-55`:

- radio value `1` = male (`form_basic_info.php:37-42`), label `lang('Common.gender_male')` = `"M"` (`app/Language/en/Common.php:34`)
- radio value `0` = female (`form_basic_info.php:44-51`), label `lang('Common.gender_female')` = `"F"` (`Common.php:33`)
- unchecked/unknown = `NULL`; `lang('Common.gender_undefined')` = `''` (`Common.php:35`)
- checked comparison is strict string: `$person_info->gender === '1'` / `=== '0'` (`form_basic_info.php:41,50`)
- `basic_version` (an optional view var) turns the label into a required field; none of customers/suppliers/employees views set `$basic_version`, so gender is optional everywhere in-repo (`form_basic_info.php:33`)

Language is **not** on `people`. It lives on `employees`: `language` (VARCHAR(48) NULL) and `language_code` (VARCHAR(8) NULL), added by `3.1.1_to_3.2.0.sql:79-81`.

### 1.2 Validation

The Person model has **no validation at all** — no `$validationRules`, no callbacks. All validation is elsewhere:

- client-side jQuery-validate rules per form (`customers/form.php:485-518`, `suppliers/form.php:91-104`, `employees/form.php:209-248`)
- server-side only for: employee username uniqueness lookup (`Employees::getCheckUsername`, `Employees.php:319-323`), customer email/account-number lookups (`Customers::postCheckEmail/postCheckAccountNumber`, `Customers.php:323-344`), customer CSV email syntax (`Customers.php:425-429`)
- every controller writes whatever POST data arrives into `people`; `save_value` inserts/updates the raw array (`Person.php:143-160`)

Uniqueness facts (DB):

- `people.email` is a **non-unique** index added at `3.0.2_to_3.1.1.sql:213-214`; the 3.4.0 optimization adds a composite index `(first_name,last_name,email,phone_number)` (`3.4.0_database_optimizations.sql:69-70`)
- email uniqueness is enforced **only** by the customer form's remote AJAX rule, scoped to non-deleted customers (`Customer.php:191-208`)
- `employees.username` has `UNIQUE KEY username` (`initial_schema.sql:123`)
- `suppliers.account_number` has `UNIQUE KEY account_number` (`initial_schema.sql:727`) and still does in 3.4.3
- `customers.account_number` had `UNIQUE KEY` in the initial schema (`initial_schema.sql:102`) but migration `20230412000001_drop_account_number_index.php:15-16` **drops** the unique and re-adds a plain index. So in 3.4.3 customer account numbers are only app-checked, not DB-unique.

### 1.3 Save / delete semantics

`save_value(array &$person_data, int $person_id = NEW_ENTRY): bool` (`Person.php:143-160`):

- if `$person_id == NEW_ENTRY` (`-1`, `app/Config/Constants.php:87`) **or the person does not exist**, it inserts, then writes the new id back into the caller's array by reference: `$person_data['person_id'] = $this->db->insertID();` (`Person.php:147-152`). This by-reference side effect is load-bearing: every `saveCustomer`/`save_supplier`/`save_employee` depends on it.
- otherwise it updates by `person_id` and returns the update result (`Person.php:157-159`).
- an update that affects 0 rows returns `true` in CI4 (`update()` returns bool, not affected-rows), which is why `Employee::save_employee` has the comment at `Employee.php:164-167` about "a 0-row affected update on an existing data is a no-op, not a failure".

`exists(int $person_id)` counts rows with `getNumRows() == 1` (`Person.php:40-46`).

`get_all(int $limit = 10000, int $offset = 0)` orders by `last_name asc` — note it does **not** filter `deleted` (`Person.php:54-62`), unlike every subtype `get_all`.

`get_total_rows()` filters `deleted = 0` on `people` — but `people` has no `deleted` column, so this is dead/broken code (`Person.php:69-75`).

`getInfo(int)` returns the joined row or an "empty object" synthesized from the DB field metadata: integer-ish fields (`int`, `tinyint`, `decimal`) become `0`, except a primary key which becomes `NEW_ENTRY` (`-1`); string fields become `null` (`Person.php:84-119`). This empty-object contract is what the forms render against when creating (`customers/form.php:41`, `suppliers/form.php:22`, `employees/form.php:52`).

`get_multiple_info(array)` returns rows via `whereIn('person_id', …)`, ordered by `last_name asc` (`Person.php:127-134`).

`get_search_suggestions(string $search, int $limit = 25)` is **broken** on purpose-of-code: the filtering block is commented out (`Person.php:175-186`) and it currently returns `[{label: person_id}, …]` for **every** row in `people`, sliced to `$limit` (`Person.php:188-197`). Only `Persons::getSuggest` uses it (`app/Controllers/Persons.php:38-44`); customer/supplier/employee controllers all override it.

`delete()` and `delete_list()` are dummy base functions that always return `true` (`Person.php:206-220`).

---

## 2. Customer model + controller

### 2.1 Model shape (`app/Models/Customer.php`)

| Property | Value | Cite |
|---|---|---|
| Class | `class Customer extends Person` | `Customer.php:12` |
| Table | `customers` | `Customer.php:14` |
| PK | `person_id`, `useAutoIncrement = false` | `Customer.php:15-16` |
| `$allowedFields` | `account_number, taxable, tax_id, sales_tax_code_id, deleted, discount, discount_type, company_name, package_id, points, date, employee_id, consent` | `Customer.php:18-32` |

Final 3.4.3 `customers` column set and provenance:

| Column | Type / default | Added by |
|---|---|---|
| `person_id` | int PK, FK → people | `initial_schema.sql:94-103`, FK `3.4.0_database_optimizations.sql:18` |
| `company_name` | varchar(255) NULL | `initial_schema.sql:96` |
| `account_number` | varchar(255) NULL | `initial_schema.sql:97` |
| `taxable` | tinyint(1) NOT NULL default 1 | `initial_schema.sql:98`, modified `3.4.0_database_optimizations.sql:14` |
| `discount` | decimal(15,2) NOT NULL default 0 (renamed from `discount_percent`) | `3.2.1_to_3.3.0.sql:28-30` |
| `discount_type` | tinyint(2) NOT NULL default 0 (`0` = percent, `1` = fixed) | `3.2.1_to_3.3.0.sql:30`; constants `Constants.php:141-142` |
| `deleted` | tinyint(1) NOT NULL default 0 | `initial_schema.sql:100`, `3.4.0_database_optimizations.sql:15` |
| `package_id` | int(11) NULL, FK → customers_packages | `3.0.2_to_3.1.1.sql:121-123`, FK `3.0.2_to_3.1.1.sql:295-297` |
| `points` | int(11) NULL | `3.0.2_to_3.1.1.sql:121-123` |
| `sales_tax_code` → later `sales_tax_code_id` | varchar(32) default '1' → int(11) NULL | `3.0.2_to_3.1.1.sql:188-189`, `3.3.0_indiagst.sql:31-33`, FK `3.3.0_dbfix.sql:6-9` |
| `tax_id` | varchar(32) NOT NULL default '' | `3.3.0_indiagst.sql:31-32` |
| `date` | timestamp NOT NULL default CURRENT_TIMESTAMP | `3.2.0_to_3.2.1.sql:7-10` |
| `employee_id` | int(10) NOT NULL | `3.2.0_to_3.2.1.sql:7-10` |
| `consent` | int(1) NOT NULL default 0 | `3.2.0_to_3.2.1.sql:7-10` |

Note `points` is `int(11)` while `adjustRewardPoints()` takes a `float $delta` (`Customer.php:249`; percentage earn is float at `app/Models/Sale.php:1427-1429`) — MySQL truncates on assignment. Recorded as an upstream quirk to preserve or explicitly document.

### 2.2 Lookups

- `exists(int)` joins `people`, `getNumRows() == 1` (`Customer.php:38-44`).
- `check_account_number_exists(string $account_number, string $person_id = '')` queries **only the `customers` table**, `account_number = ?`, and `person_id != ?` when a non-empty person id is given; **no `deleted` filter** (`Customer.php:49-59`). It does **not** consult `suppliers`.
- `check_email_exists(string $email, string $customer_id = '')` joins `people`; empty email short-circuits to `false`; filters `customers.deleted = 0`; excludes the current customer (`Customer.php:191-208`). It checks **customers only** (an employee or supplier with the same email does not block a customer).
- `get_total_rows()` filters `deleted = 0` on `customers` (`Customer.php:64-70`).
- `get_all(int $limit = 0, int $offset = 0)` joins people, `deleted = 0`, orders `last_name asc`, applies limit only when `> 0` (`Customer.php:75-87`).
- `getInfo(?int)` joins people, returns row or an empty object built from `parent::getInfo(NEW_ENTRY)` overlaid with `customers` field metadata (`Customer.php:92-126`).
- `get_multiple_info(array)` joins people, `whereIn`, orders `last_name asc` (`Customer.php:178-186`).

### 2.3 Save (`saveCustomer`, `Customer.php:213-233`)

Wrapped in `transStart()`/`transComplete()`; returns `$success && transStatus()`.

1. `parent::save_value($personData, $customerId)` — inserts or updates `people`; on insert, `$personData['person_id']` is populated.
2. If `$customerId == NEW_ENTRY || !$customerId || !$this->exists($customerId)`: set `$customerData['person_id'] = $personData['person_id']`, insert into `customers`.
3. Else update `customers` where `person_id = $customerId`, and set `$customerData['person_id'] = $customerId` (so the controller can echo the id back).

There is **no duplicate validation inside the model** — account-number/email checks are controller/JS concerns.

### 2.4 Stats (`get_stats`, `Customer.php:132-173`)

MySQL-specific; this is the hardest part to port to SQLite and is currently absent in the target.

1. Builds a **temporary MEMORY table** `{prefix}sales_items_temp` with `INDEX(sale_id)`, containing one row per `sale_id` for the customer:
   `SELECT sales.sale_id, AVG(sales_items.discount) AS avg_discount, SUM(sales_items.quantity_purchased) AS quantity FROM sales JOIN sales_items ON sales_items.sale_id = sales.sale_id WHERE sales.customer_id = ? GROUP BY sale_id` (`Customer.php:139-148`). Note: **no `sale_status` filter** here.
2. Main aggregate over `sales ⋈ sales_payments ⋈ sales_items_temp` where `sales.customer_id = ?` **and `sales.sale_status = COMPLETED` (0)** (`Customer.php:151-166`), returning:
   - `total` = `SUM(payment_amount - cash_refund)`
   - `min`, `max`, `average` = `MIN/MAX/AVG(payment_amount - cash_refund)`
   - `avg_discount` = `ROUND(AVG(sales_items_temp.avg_discount), totals_decimals)`
   - `quantity` = `ROUND(SUM(sales_items_temp.quantity), quantity_decimals)`
3. Drops the temp table (`Customer.php:168-170`) and returns the row (or `null`).

Callers treat `empty($stats)` as "no sales" and substitute an object of zeros (`Customers.php:64-73`, `101-111`).

### 2.5 Reward points

- `update_reward_points_value(int $customer_id, int $value)` — unconditional set; **no callers remain** in-repo (grep confirms) (`Customer.php:238-243`).
- `adjustRewardPoints(int $customerId, float $delta): bool` — atomic signed delta. For negative deltas it adds `points >= abs(delta)` to the WHERE; the SET is a raw expression `points + <escaped abs>` / `points - <escaped abs>`; returns `update() && affectedRows() > 0` (`Customer.php:249-262`). This is the concurrency-safe contract exercised by `tests/Models/CustomerRewardPointsTest.php`:
  - increment 10 + 5 → 15 (`testAdjustRewardPointsIncrementSucceeds`)
  - 100 − 40 → 60 (`testAdjustRewardPointsDecrementSucceedsWithSufficientPoints`)
  - 20 − 40 → false, balance stays 20 (`testAdjustRewardPointsDecrementFailsWithInsufficientPoints`)
  - 40 − 40 → true, 0 (`testAdjustRewardPointsDecrementExactBalanceSucceeds`)
  - two concurrent −60 on 100 → exactly one wins, final 40 (`testAdjustRewardPointsConcurrentDecrementsOneWins`)
- Callers: rewards payment spend (`app/Models/Sale.php:594-601`, returns `INSUFFICIENT_REWARD_POINTS` = `-3`, `Constants.php:93`), and earn at sale completion: `pointsPercent = customer_packages.points_percent` for `customers.package_id`, `earned = total_amount * pointsPercent / 100`, then `adjustRewardPoints` plus a `sales_reward_points` row (`Sale.php:1417-1434`). Gated by config `customer_reward_enable` (`Sale.php:1419`).

Rewards package (upstream) = `customers_packages` table: `package_id` PK autoincrement, `package_name` varchar(255) NULL, `points_percent` float NOT NULL default 0, `deleted` int(1) NOT NULL default 0 (`3.0.2_to_3.1.1.sql:79-85`), seeded `Default 0, Bronze 10, Silver 20, Gold 30, Premium 50` (`3.0.2_to_3.1.1.sql:87-92`). Model `Customer_rewards` (`app/Models/Customer_rewards.php:13-20`) — note `$table = 'customer_packages'` (typo, actual table `customers_packages`; all real queries use `customers_packages` explicitly, e.g. `exists()` at line 30). Also `customers_points` (`3.0.2_to_3.1.1.sql:98-105`) and `sales_reward_points` (`3.0.2_to_3.1.1.sql:111-117`, model `Rewards.php:11-18`).

### 2.6 Delete / restore (`Customer.php:269-327`)

- `delete($customer_id, $purge = false)` — two modes:
  - **privacy enforcement** (`config['enforce_privacy']` true): scrambles `people` (first_name/last_name = the numeric id, phone/email/address/city/state/zip/country/comments = `''`, gender = `null`) and `customers` (`consent=0`, `company_name=null`, `account_number=null`, `tax_id=''`, `taxable=0`, `discount=0.00`, `discount_type=0`, `package_id=null`, `points=null`, `sales_tax_code_id=null`, `deleted=1`) (`Customer.php:274-307`)
  - otherwise just `UPDATE customers SET deleted = 1` (`Customer.php:308-313`)
- `delete_list(array $person_ids)` — bulk `UPDATE customers SET deleted = 1`, **always bypassing privacy scrambling** (`Customer.php:321-327`).
- **There is no restore/undelete path anywhere.** `deleted` is a one-way flag. (`Config` GDPR utility may flip it elsewhere, but no People API exposes restore.)
- Controller `postDelete` loops over `get_multiple_info($ids)` and calls `delete()` per row, also calling `removeMember` on Mailchimp; success requires `count == count($customers_to_delete)` (`Customers.php:350-374`).

### 2.7 Controller (`app/Controllers/Customers.php`)

Constructor: `parent::__construct('customers')`; builds `Mailchimp_lib`, `Customer_rewards`, `Customer`, `Tax_code`; decrypts `mailchimp_list_id` into `$_list_id` (empty string when unset) (`Customers.php:25-41`).

Endpoint map (auto-routing; `app/Config/Routing.php:97` `autoRoute = true`, `app/Config/Feature.php:15` `autoRoutesImproved = true`; explicit routes only cover login/migrate/no_access/reports at `app/Config/Routes.php:8-43`):

| URL | Method | Controller method | Behavior |
|---|---|---|---|
| `customers` | GET | `getIndex` | `people/manage` view with `get_customer_manage_table_headers()` (`Customers.php:46-51`) |
| `customers/search` | GET | `getSearch` | AJAX; params `search,limit,offset,sort,order`; returns `{total, rows}`; computes `get_stats` per row and formats via `get_customer_data_row` (`Customers.php:86-117`) |
| `customers/suggest` | GET | `getSuggest` | `get_search_suggestions($term)` with defaults `limit 25, unique=true` (`Customers.php:123-129`) |
| `customers/suggest_search` | GET/POST | `suggest_search` | `get_search_suggestions($term, 25, false)` (`Customers.php:134-140`) |
| `customers/view/{id}` | GET | `getView` | edit modal; builds `person_info`, `employee` display name, `sales_tax_code_label`, `packages`, `selected_package`, `use_destination_based_tax`, `stats`, `mailchimp_info`, `mailchimp_activity` (`Customers.php:146-235`) |
| `customers/save/{id}` | POST | `postSave` | JSON `{success,message,id}` (`Customers.php:241-315`) |
| `customers/checkEmail` | POST | `postCheckEmail` | JSON `"true"`/`"false"` (string), not boolean (`Customers.php:323-331`) |
| `customers/checkAccountNumber` | POST | `postCheckAccountNumber` | JSON `"true"`/`"false"` (`Customers.php:339-344`) |
| `customers/delete` | POST | `postDelete` | JSON (`Customers.php:350-374`) |
| `customers/csv` | GET | `getCsv` | downloads `writable/uploads/importCustomers.csv` as `importCustomers.csv` (`Customers.php:382-387`) |
| `customers/csvImport` | GET | `getCsvImport` | the upload modal (`Customers.php:395-398`) |
| `customers/importCsvFile` | POST | `postImportCsvFile` | multipart `file_path`; JSON result (`Customers.php:406-492`) |

`postSave` field mapping (`Customers.php:243-280`) — exact contract:

- `first_name`, `last_name` are run through `nameize()` (`Persons.php:67-75`): `Tamtamchik\NameCase\str_name_case` then a `preg_replace_callback` that lowercases HTML entities (`/&[a-zA-Z0-9#]+;/`).
- `email` = `strtolower(getPost('email', FILTER_SANITIZE_EMAIL))`.
- `gender` = `FILTER_SANITIZE_NUMBER_INT` (string) into person data.
- `phone_number`, `address_1`, `address_2`, `city`, `state`, `zip`, `country`, `comments` are raw `getPost`.
- `date` is parsed with `date_create_from_format($config['dateformat'] . ' ' . $config['timeformat'], $post['date'])` then `->format('Y-m-d H:i:s')` (`Customers.php:266,277`) — an unparseable date fatals (null deref), and the accepted input format is locale-config-driven.
- `consent` = `getPost('consent') != null` (boolean).
- `account_number` = `'' → null`, else raw string.
- `company_name` = `'' → null`.
- `discount` = `'' → 0.00`, else `parse_decimals(...)` (locale-aware decimal parser).
- `discount_type` = `null → PERCENT (0)`, else int.
- `package_id` = `'' → null`.
- `taxable` = `getPost('taxable') != null`.
- `employee_id` = int (hidden field, carries the creating employee).
- `sales_tax_code_id` = `'' → null`, else int.

Success message strings: `lang('Customers.successful_adding')` = `"You have successfully added customer"` (`app/Language/en/Customers.php:49`), `successful_updating` (`:51`), `error_adding_updating` = `"Customer add or update failed."` (`:29`), each concatenated with `" $first_name $last_name"`. New-customer response id is `$customer_data['person_id']` (written by reference in the model); update response id is `$customer_id` (`Customers.php:294-307`).

After any successful save the controller **always** calls Mailchimp `addOrUpdateMember(list, email, first_name, last_name, status_or_"", ['vip' => bool])` — unconditionally, even with an empty list id and an empty email (`Customers.php:283-292`).

`getView` details (`Customers.php:146-235`):

- defaults `date = now('Y-m-d H:i:s')` and `employee_id = logged-in employee` when `person_id`, `date`, or `employee_id` is empty (`:157-160`)
- employee display name from `employee->getInfo(...)` as `first . ' ' . last` (`:162-163`)
- tax-code label = `tax_code . ' ' . tax_code_name` when found, else `''` (`:165-171`); `Tax_code::get_info(null)` returns an all-null object (`Tax_code.php:52-72`)
- packages dropdown values: `'' => lang('Items.none')` then each `customer_packages` row `[package_id => package_name]` (`:173-177`)
- stats merged into `person_info` properties and passed as `stats` (`:183-189`)
- Mailchimp member info + activity stats (total/open/unopen/click/lastopen) only when the customer has an email and the API answers (`:191-232`)

### 2.8 Search / filter / date / deleted

`search(string $search, ?int $rows = 0, ?int $limit_from = 0, ?string $sort = 'last_name', ?string $order = 'asc', ?bool $count_only = false)` (`Customer.php:420-460`):

- nulls normalise to `0,0,'last_name','asc',false` (`:422-427`)
- count mode: `SELECT COUNT(customers.person_id) as count` (`:432-434`)
- join `people` (`:436`)
- LIKE group: `first_name`, `last_name`, `email`, `phone_number`, `account_number`, `company_name`, `CONCAT(first_name, " ", last_name)` (`:437-445`)
- `deleted = 0` (`:446`)
- count mode returns `$row->count` (string from MySQL; PHP coerces to int on the method's `: int` return) (`:449-451`)
- `orderBy($sort, $order)`; `limit($rows, $limit_from)` only when `$rows > 0` (`:453-457`)

No date-range filter and no "show deleted" option exist for customers. Sorting is whitelisted by the shared `sanitizeSortColumn()` against `customer_headers()` with default `'people.person_id'` (`Secure_Controller.php:76-89`, `Customers.php:91`).

Table headers (`get_customer_manage_table_headers`, `app/Helpers/tabular_helper.php:268-283`): id, last_name, first_name, email, phone_number, `total` (title `lang('Common.total_spent')`, `sortable => false`) (`tabular_helper.php:253-266`); the `messages` column is appended only when the **logged-in** employee has the `messages` grant (`:275-281`). Rows (`get_customer_data_row`, `:285-317`): `people.person_id`, names, `email` as a `mailto:` anchor or `''`, `phone_number`, `total` = `to_currency($stats->total)`, optional SMS `messages` anchor, `edit` anchor to `{controller}/view/{id}`. `people/manage.php` wires `uniqueId: 'people.person_id'`, `pageSize: $config['lines_per_page']`, and an Email toolbar button that collects `mailto:` hrefs (`app/Views/people/manage.php:15-31,46-55`). The CSV import button is rendered **only when `$controller_name === 'customers'`** (`manage.php:36-40`).

### 2.9 Suggestions (`Customer.php:332-407`)

Signature `get_search_suggestions(string $search, int $limit = 25, bool $unique = true)`.

- Base group (always): `first_name`, `last_name`, `CONCAT(first_name," ",last_name)` LIKE; when `$unique`, also `email`, `phone_number`, `company_name`; `deleted = 0`; order `last_name asc`.
- Label: `"{first} {last}"` + `" [{company_name}]"` if company + `" [{phone_number}]"` if phone (`:353-356`).
- When `$unique === false`, three extra blocks are appended: emails (label = email, ordered by email), phones (label = phone), account numbers (label = account_number), company names (label = company_name) (`:359-399`).
- Result is sliced to `$limit` (`:401-404`).
- Value is always `person_id`.

### 2.10 Mailchimp (`app/Libraries/Mailchimp_lib.php`)

- `MailchimpConnector` builds `https://<dc>.api.mailchimp.com/3.0/` from the part after the `-` in the API key; API key decrypted from config (`Mailchimp_lib.php:39-62`); `call()` returns `false` when no key (`:71-78`); cURL with 10 s timeout, `CURLOPT_SSL_VERIFYPEER = true` (`:103-123`).
- `Mailchimp_lib::addOrUpdateMember(string $list_id, string $email, string $first_name, string $last_name, string $status, array $parameters = [])` → `PUT /lists/{id}/members/{md5(lower(email))}` with `email_address, status, status_if_new='subscribed', merge_fields{FNAME,LNAME}` (`Mailchimp_lib.php:323-336`).
- `removeMember` → `DELETE /lists/{id}/members/{md5}` (`:281-284`). `getMemberInfo` (`:226-229`), `getMemberActivity` (`:240-243`).

Two upstream call-site bugs to preserve-or-fix explicitly:

1. CSV import calls `addOrUpdateMember($this->_list_id, $person_data['email'], $person_data['first_name'], '', $person_data['last_name'])` (`Customers.php:473`) — arguments 4/5 are `last_name` and `status`, so the **last name is sent as the Mailchimp status** and `LNAME` is empty.
2. `Customers::postSave` passes `status = ""` when the form did not supply `mailchimp_status` (`Customers.php:284-292`), which Mailchimp rejects for new members (`status` must be one of subscribed/unsubscribed/cleaned/pending/transactional).

The customer form surfaces `mailchimp_status` (dropdown subscribed/unsubscribed/cleaned/pending), `mailchimp_vip` (checkbox), read-only member rating and activity counters, only when both `mailchimp_info` and `mailchimp_activity` are non-empty (`app/Views/customers/form.php:28-32,330-442`).

---

## 3. Supplier model + controller

### 3.1 Model shape (`app/Models/Supplier.php`)

| Property | Value | Cite |
|---|---|---|
| Class | `class Supplier extends Person` | `Supplier.php:10` |
| Table | `suppliers` | `Supplier.php:12` |
| PK | `person_id`, no auto-increment | `Supplier.php:13-14` |
| `$allowedFields` | `company_name, account_number, tax_id, deleted, agency_name, category` | `Supplier.php:16-23` |

Final 3.4.3 columns:

| Column | Type / default | Added by |
|---|---|---|
| `person_id` | int PK, FK → people | `initial_schema.sql:720-728`, FK `3.4.0_database_optimizations.sql:108` |
| `company_name` | varchar(255) NOT NULL | `initial_schema.sql:722` |
| `agency_name` | varchar(255) NOT NULL | `initial_schema.sql:723` |
| `account_number` | varchar(255) NULL, **UNIQUE** | `initial_schema.sql:724,727` |
| `deleted` | int(1)/tinyint NOT NULL default 0 | `initial_schema.sql:725` |
| `tax_id` | varchar(32) NULL → NOT NULL default '' | `3.3.0_indiagst.sql:76-77`, normalised `3.3.0_indiagst1.sql:1-7` |
| `category` | TINYINT NOT NULL (0 goods, 1 cost) | `3.2.1_to_3.3.0.sql:109-113` |

Supplier categories: `GOODS_SUPPLIER = 0`, `COST_SUPPLIER = 1` (`app/Config/Constants.php:165-166`). `get_categories()` returns `[0 => lang('Suppliers.goods'), 1 => lang('Suppliers.cost')]` = `"Goods Supplier"` / `"Cost Supplier"` (`Supplier.php:293-299`, `app/Language/en/Suppliers.php:12,14`). `get_category_name(int $supplier_type)` returns goods for `0` and cost for **anything else** (`Supplier.php:306-313`) — note it is `== 0` on the raw value, so `"0"` string from the DB is goods.

### 3.2 Lookups / reads

- `exists(int)` joins people (`Supplier.php:28-35`).
- `get_total_rows()` `deleted = 0` (`:40-46`).
- `get_all(int $limit = 0, int $offset = 0, int $category = GOODS_SUPPLIER)` — joins people, filters `category = $category` **and** `deleted = 0`, orders `company_name asc`, limit only when `> 0` (`:51-64`). This default is important: a naive "list suppliers" call returns only goods suppliers.
- `getInfo(?int)` joins people; on miss it takes `parent::getInfo(NEW_ENTRY)` and appends every `suppliers` field set to `''` (empty **string**, not null, not 0) (`:69-89`).
- `get_multiple_info(array)` joins people, `whereIn`, `last_name asc` (`:94-102`).
- `save_supplier(array &$person_data, array &$supplier_data, int $supplier_id = NEW_ENTRY)` — transaction; `parent::save_value`; insert with `person_id` from the person array, or update by `person_id`; returns `$success && transStatus()` (`:107-130`). Note it does **not** write `supplier_data['person_id']` on the update branch (customers do).
- `delete($id)` / `delete_list(array)` — only `UPDATE suppliers SET deleted = 1`; no grants/persons touch, no privacy scrambling, no restore (`:135-152`).

### 3.3 Search (`Supplier.php:248-288`)

`search(string $search, ?int $rows = 25, ?int $limit_from = 0, ?string $sort = 'last_name', ?string $order = 'asc', ?bool $count_only = false)` — note default `$rows = 25` (customers/employees default 0).

- LIKE group: `first_name`, `last_name`, `company_name`, `agency_name`, `email`, `phone_number`, `account_number`, `CONCAT(first_name," ",last_name)` (`:265-274`)
- `deleted = 0` (`:275`)
- count mode `COUNT(suppliers.person_id) as count` (`:260-262`), returns `$row->count` (`:277-279`)
- order/limit (`:281-286`)

`get_found_rows($search)` delegates with `rows=0, sort=last_name, asc, count_only=true` (`:240-243`).

### 3.4 Suggestions (`Supplier.php:157-235`)

Signature `get_search_suggestions(string $search, int $limit = 25, bool $unique = false)` — note the parent is `(string, int)`; this adds a third optional param (`:157`).

- Block 1: `company_name` LIKE, `deleted = 0`, order company_name; label = company_name.
- Block 2: `agency_name` LIKE, `distinct()`, `agency_name IS NOT NULL`, order agency_name; label = agency_name.
- Block 3: first/last/`CONCAT` LIKE, `deleted = 0`, order last_name; label = `first last`.
- Block 4 (`!$unique`): email, phone_number, account_number blocks, label = the matching value.
- Slice to `$limit` (`:229-232`).

**Controller argument bugs (must be reproduced deliberately or fixed with a documented deviation):**

- `Suppliers::getSuggest` calls `get_search_suggestions($search, true)` (`app/Controllers/Suppliers.php:76`). The second parameter is `int $limit`; no file in the repo declares `strict_types`, so `true` coerces to `1` → **the endpoint returns at most one suggestion**.
- `Suppliers::suggest_search` calls `get_search_suggestions($search, false)` (`Suppliers.php:87`) → `$limit = 0` → `array_slice($suggestions, 0, 0)` → **always `[]`**. It also reads `term` from **POST** (`Suppliers.php:86`) while every other `suggest_search` uses GET.
- `Supplier::get_search_suggestions` also accepts `$unique` as a bool but never uses it for the "include deleted" distinction (unlike employees); it only gates block 4.

### 3.5 Controller (`app/Controllers/Suppliers.php`)

Constructor: `parent::__construct('suppliers')`, `$this->supplier = model(Supplier::class)` (`:13-18`).

| URL | Method | Controller method | Notes |
|---|---|---|---|
| `suppliers` | GET | `getIndex` | `people/manage` + `get_suppliers_manage_table_headers()` (`:23-28`) |
| `suppliers/search` | GET | `getSearch` | `{total, rows}`; each row's `category` replaced by the translated name (`:47-67`) |
| `suppliers/suggest` | GET | `getSuggest` | see bug above (`:73-79`) |
| `suppliers/suggest_search` | POST | `suggest_search` | always `[]` (`:84-90`) |
| `suppliers/view/{id}` | GET | `getView` | form + `categories` (`:98-108`) |
| `suppliers/save/{id}` | POST | `postSave` | JSON (`:116-172`) |
| `suppliers/delete` | POST | `postDelete` | `delete_list($ids)` (`:179-191`) |
| `suppliers/row/{id}` | GET | `getRow` | single row JSON with translated category (`:35-41`) |

`postSave` mapping (`Suppliers.php:118-147`):

- first/last: `FILTER_SANITIZE_FULL_SPECIAL_CHARS` then `nameize()`
- `gender`: raw `getPost('gender')` (no int filter)
- email: `strtolower(FILTER_SANITIZE_EMAIL)`
- phone/address/city/state/zip/country/comments: `FILTER_SANITIZE_FULL_SPECIAL_CHARS`
- `company_name`, `agency_name`: `FILTER_SANITIZE_FULL_SPECIAL_CHARS`
- `category`: `FILTER_SANITIZE_FULL_SPECIAL_CHARS` (string into tinyint)
- `account_number`: `'' → null`, else full-special-chars sanitised
- `tax_id`: **`FILTER_SANITIZE_NUMBER_INT`** (`:146`) — even though the column is varchar(32); an alphanumeric VAT id is stripped to digits by the controller

Success messages: `Suppliers.successful_adding` / `successful_updating` / `error_adding_updating` + `" " . $company_name` (`app/Language/en/Suppliers.php:18-20`); delete uses `successful_deleted` + count + `one_or_multiple` = `"Supplier(s)"` (`Suppliers.php:184-190`). `cannot_be_deleted` = `"Could not delete selected Supplier(s). One or more have Sales."` (`Suppliers.php:189`, lang `:6`).

Supplier form (`app/Views/suppliers/form.php`):

- fields: `company_name` (required, `html_entity_decode`'d for display, `:22`), `category` dropdown (required, `:28-32`), `agency_name` (`:34-44`), the shared `people/form_basic_info` (`:46`), `account_number` (`:48-58`), `tax_id` (`:60-70`)
- client rules: `company_name`, `first_name`, `last_name` required, `email: 'email'` (`:91-96`); **no duplicate account-number rule**
- note the form action is `suppliers/save/{person_id}` (`:12`) — `person_id` (not "supplier id")
- there is **no supplier CSV import or export anywhere** in upstream (grep for `csv` in `app/Controllers`, `app/Views`, `app/Models`, `app/Libraries` returns only customer/items hits). Deliverable item "supplier CSV import/export" resolves to: **none exists**; any target implementation would be an addition, not parity.

Supplier headers/rows (`tabular_helper.php:319-387`): id, company_name, agency_name, category, last_name, first_name, email, phone_number; `messages` appended when the logged-in employee has `messages` grant (`:336-351`); rows decode HTML entities in `company_name` (`:356`).

---

## 4. Employee model + RBAC

### 4.1 Model shape (`app/Models/Employee.php`)

| Property | Value | Cite |
|---|---|---|
| Class | `class Employee extends Person` | `Employee.php:15` |
| Table | `Employees` (capital E; MySQL table names are case-insensitive on default Linux configs only when `lower_case_table_names=1`) | `Employee.php:18` |
| PK | `person_id`, no auto-increment | `Employee.php:19-20` |
| `$allowedFields` | `username, password, deleted, hashversion, language, language_code` | `Employee.php:22-29` |
| Session | `public Session $session` injected in the constructor | `Employee.php:17,31-35` |

DB columns (`initial_schema.sql:116-124` + `3.1.1_to_3.2.0.sql:79-81`): `username varchar(255) NOT NULL UNIQUE`, `password varchar(255) NOT NULL`, `person_id int PK FK`, `deleted int(1) NOT NULL default 0`, `hash_version int(1) NOT NULL default 2`, `language varchar(48) NULL`, `language_code varchar(8) NULL`.

**Naming trap:** the PHP property is `hashversion` in `$allowedFields` (`Employee.php:26`) but the column and every query use `hash_version` (`Employee.php:387,400,526,530`, form field `hash_version` in `Employees::postSave` `:206,225`). `$allowedFields` is effectively unused because every write goes through the query builder.

### 4.2 Lookups / search

- `exists(int)` joins people (`Employee.php:40-47`).
- `username_exists(int $employee_id, string $username)` — `username = ?` AND `person_id <> ?`; counts `== 1` (`:54-61`). Note argument order: id first.
- `get_total_rows()` `deleted = 0` (`:66-72`).
- `get_all(int $limit = 10000, int $offset = 0)` joins people, `deleted = 0`, `last_name asc`, always applies limit/offset (`:77-87`).
- `getInfo(int)` joins people; on miss returns `parent::getInfo(NEW_ITEM)` (`-1`, `Constants.php:117`) with every `employees` field set to `null` (`:92-113`).
- `get_multiple_info(array)` joins people, `whereIn`, `last_name asc` (`:118-126`).
- `search(string $search, ?int $rows = 0, ...)` — LIKE group `first_name, last_name, email, phone_number, username, CONCAT(first_name," ",last_name)`; `deleted = 0`; count mode `COUNT(employees.person_id) as count` (`:334-373`).
- Suggestions `get_search_suggestions(string $search, int $limit = 25, bool $unique = false)` (`:251-321`):
  - first/last/CONCAT block; email block; **username** block; phone block
  - the flag is inverted relative to customers: `if (!$unique) { where deleted = 0 }` (`:263-265,276-278,290-292,304-306`) — so `$unique = true` **includes deleted employees**.
  - controller call sites: `getSuggest` passes `(search, 25, true)` → deleted included (`Employees.php:57`); `suggest_search` passes defaults → `unique=false` → deleted excluded (`Employees.php:68`), and reads `term` from POST (`:67`).

### 4.3 `save_employee` (`Employee.php:131-186`)

Signature `save_employee(array &$person_data, array &$employee_data, array &$grants_data, int $employee_id = NEW_ENTRY): bool`.

1. `$isNewEmployee = ($employee_id == NEW_ENTRY || !$this->exists($employee_id))`.
2. `$grantChangeDisallowed = filter_var(getenv('DISALLOW_GRANT_CHANGE'), FILTER_VALIDATE_BOOLEAN)`.
3. Open transaction.
4. **If grant changes are disallowed AND this is a new employee AND grants were submitted → return `false` before inserting anything** (`:140-144`). This is how "demo mode" blocks creating users with grants; `tests/Models/EmployeeTest.php::testNewEmployeeCreationWithGrantsRejectedWhenGrantChangeDisallowed` and `tests/Controllers/EmployeesControllerTest.php::testNewEmployeeCreationWithGrantsFailsWhenGrantChangeDisallowed` assert that no `employees` row is created.
5. `parent::save_value($person_data, $employee_id)`; for a new employee a failed person insert aborts with `false` (`:146-153`).
6. Insert when new (`$employee_data['person_id'] = $employee_id = $person_data['person_id']`) or update by `person_id` (`:155-162`).
7. Grant replacement when **`!$grantChangeDisallowed && !empty($grants_data)`** (`:167-179`): `DELETE FROM grants WHERE person_id = ?` then insert one row per grant `{permission_id, person_id, menu_group}`. Consequences:
   - empty `$grants_data` **does not clear** grants (upstream behaviour: submitting an employee form with no boxes ticked leaves existing grants in place);
   - a non-empty submission always replaces the whole set;
   - the delete/insert is **not** conditional on the employee row update actually changing anything (`:164-167` comment).
8. Returns `$success && transStatus()`.

Note `grants` PK is `(permission_id, person_id)` (`initial_schema.sql:407-411`) — duplicate grant rows are impossible; a repeated grant insert would fail the whole save.

### 4.4 Delete rules (`Employee.php:191-246`)

- `delete($employee_id)`: refuses when the target equals the **logged-in** employee (`$this->get_logged_in_employee_info()->person_id`) → `false` (`:195-198`). Otherwise transaction: `DELETE FROM grants WHERE person_id = ?`, then `UPDATE employees SET deleted = 1` (`:201-212`). Returns `$success` only (no `transStatus()`).
- `delete_list(array $person_ids)`: refuses when the logged-in id is **in** the list (`:224-227`). Transaction: `DELETE FROM grants WHERE person_id IN (...)`, `UPDATE employees SET deleted = 1 WHERE person_id IN (...)`, returns `$success &= transStatus()` (`:232-244`).
- Neither method refuses to delete an admin; that policy lives in the controller (`Employees::postDelete`, `:294-300`) and in `Home`/`Employees` view guards.
- No restore path.

### 4.5 Login / password (`Employee.php:378-558`)

`login(string $username, string $password): bool` (`:378-411`):

1. `SELECT * FROM employees WHERE username = ? AND deleted = 0 LIMIT 1`.
2. `hash_version === '1'` (string compare) and `password === md5($password)`:
   - rehash with `password_hash($password, PASSWORD_DEFAULT)`, `UPDATE employees SET hash_version = 2, password = <hash> WHERE person_id = ?`
   - only if that update succeeds: `session_status() === PHP_SESSION_ACTIVE` → `$this->session->regenerate(true)`; then `set('person_id', $row->person_id)`
   - returns the update result (`true` on success)
3. `hash_version === '2'` and `password_verify($password, $row->password)`:
   - regenerate session (when active), set `person_id`, return `true`
4. Otherwise `false`. A legacy md5 user whose stored hash does not match, or any unknown hash_version, cannot log in.

`logout()` → `session()->destroy()` (`:416-419`). `is_logged_in()` → `session->get('person_id') != false` (`:424-427`). `get_logged_in_employee_info()` → `getInfo(person_id)` or `false` (`:432-439`).

`check_password(string $username, string $password)` uses `password_verify` only (no md5 upgrade, no session) (`:522-536`) — used by the change-password flow.

`change_password(array $employee_data, $employee_id = false)` honours `DISALLOW_PASSWORD_CHANGE` (returns `false` without writing), otherwise transaction + update by `person_id` (`:541-558`).

Password policy: **8 characters minimum**, enforced only in the change-password controller on the **raw** password before hashing (`Home.php:93-101`; lang `Employees.password_minlength` = `"Password must be at least 8 characters in length."`, `app/Language/en/Employees.php:31`). `Employees::postSave` does **not** length-check the password server-side; the form does (`employees/form.php:218-223`, `minlength: 8`), and the username minimum length is 5 (`:212-217`, lang `:49`). The `HomeTest` suite exists specifically to keep the raw-length-before-hash ordering (`tests/Controllers/HomeTest.php:1-20` and `testPasswordMinLength_Rejects7Characters` / `Accepts8Characters` / `RejectsEmptyString` / `WhitespaceOnlyPasswordCountsTowardLength` / `AcceptsSpecialCharacters` / `RejectsPreviousBehavior`).

### 4.6 Permissions primitives (exact semantics)

`has_module_grant(string $permission_id, int $person_id): bool` (`Employee.php:444-456`):

```
count = SELECT COUNT(*) FROM grants WHERE permission_id LIKE '<permission_id>%' AND person_id = ?
if count != 1: return (count != 0)
return has_subpermissions(permission_id)
```

`has_subpermissions(string $permission_id): bool` (`:461-467`):

```
return (SELECT COUNT(*) FROM permissions WHERE permission_id LIKE '<permission_id>_%') == 0
```

Therefore, with 3.4.3 data:

- module with **no** subpermissions (e.g. `customers`, `suppliers`, `giftcards`, `messages`, `config`): exactly one grant → allowed; zero grants → denied.
- module **with** subpermissions (e.g. `items` has `items_stock`, `sales` has `sales_stock`+`sales_delete`+`sales_change_price`, `receivings` has `receivings_stock`, `reports` has 12 `reports_*`): a user holding **only** the parent grant gets `count == 1` → `has_subpermissions` → `false` → **denied**. A user holding ≥2 matching grants (parent + at least one sub, or two subs) → `true`. A user holding one sub and no parent → `count == 1` → `has_subpermissions` → `false` → **denied**.
- The LIKE underscore is a single-character SQL wildcard: `LIKE 'sales_%'` also matches a hypothetical permission `salesX…`, and `LIKE '<module>%'` matches any permission id sharing the prefix (e.g. asking for `item` would match `items`, `item_kits`; asking for `items` does **not** match `item_kits` because the next char is `_` vs `s`). Prefix collisions are possible for any future ids; this is an upstream characteristic, not a target-specific bug.

`has_grant(?string $permission_id, ?int $person_id): bool` (`:472-486`):

- `null` permission → `true` (allow)
- `null` person → `false`
- exact row match `(person_id, permission_id)`; `== 1`

(No admin bypass inside `has_grant`; `isAdmin` builds on it.)

`get_menu_group(string $permission_id, ?int $person_id): string` — selects `menu_group` for the exact grant; **defaults to `'home'`** when no row (`:491-506`).

`get_employee_grants(int $person_id): array` — `getResultArray()` of all grant rows for the employee (`:511-517`), used by the `DISALLOW_GRANT_CHANGE` diff.

`isAdmin(int $person_id): bool` (`:564-577`):

- `person_id === 1` → `true` (identical comparison against the int `1`)
- else `true` only if `has_grant($module, $person_id)` is true for **every** entry of `ADMIN_MODULES` = `['customers','employees','giftcards','items','item_kits','messages','receivings','reports','sales','config','suppliers']` (`Constants.php:179`)

`canModifyEmployee(int $target_person_id, int $current_person_id): bool` (`:584-595`):

```
if target == current: return !isAdmin(target) || isAdmin(current)
if isAdmin(target) && !isAdmin(current): return false
return true
```

i.e. self-editing is always allowed in the model (the "self-modification of grants requires admin" rule is enforced separately by the controller's minimum-grant check); a non-admin cannot touch an admin; an admin can touch anyone; non-admins can touch non-admins. `tests/Models/EmployeeTest.php` locks all five branches.

### 4.7 Controller (`app/Controllers/Employees.php`)

Constructor `parent::__construct('employees')`; `$this->module = model('Module')` (`:18-23`).

| URL | Method | Controller method | Notes |
|---|---|---|---|
| `employees` | GET | inherited `Persons::getIndex` | `people/manage` + `get_people_manage_table_headers()` (`app/Controllers/Persons.php:27-32`) |
| `employees/search` | GET | `getSearch` | sorts on `person_headers()`, default `people.person_id` (`:30-47`) |
| `employees/suggest` | GET | `getSuggest` | includes deleted (`:54-60`) |
| `employees/suggest_search` | POST | `suggest_search` | excludes deleted (`:65-71`) |
| `employees/view/{id}` | GET | `getView` | 403-equivalent: `RedirectException('no_access/employees/employees')` when `canModifyEmployee` fails (`:82-84`); builds `all_modules` (`grant`, `menu_group`) and `all_subpermissions` (`:92-108`) |
| `employees/save/{id}` | POST | `postSave` | JSON (`:117-256`) |
| `employees/delete` | POST | `postDelete` | JSON (`:289-310`) |
| `employees/checkUsername/{id}` | GET | `getCheckUsername` | JSON `"true"`/`"false"` (`:319-323`) |

`getView` subpermission handling (`:101-108`): iterates `get_all_subpermissions()`, replaces spaces with underscores in `permission_id` (`:103`) — a compatibility shim for stock-location-derived permission ids whose location name may contain spaces (migration `20190712150200_fix_empty_reports.php:22-27` already normalises the seeded ones; `str_replace` here guards legacy rows) — then sets `grant` from `has_grant`.

`postSave` (`:117-256`) — exact order of checks:

1. `$currentUser = get_logged_in_employee_info()`.
2. If editing an existing id and `canModifyEmployee(target, current)` fails → `{success:false, message: lang('Employees.error_updating_admin') = "You cannot modify an admin user.", id: NEW_ENTRY}` (`:121-130`).
3. Sanitise first/last (`FILTER_SANITIZE_FULL_SPECIAL_CHARS`) + `nameize()`; email lowercased; all person fields `FILTER_SANITIZE_FULL_SPECIAL_CHARS`; gender `FILTER_SANITIZE_NUMBER_INT` (`:132-153`).
4. Build `$grantsArray` from `get_all_permissions()`: for each permission, read `grant_<permission_id>`; the checkbox **value must equal the permission id** (`if ($grant == $permission->permission_id)`, `:162`). If the current user is **not** admin and does **not** hold that permission, `continue` (silent drop, `:163-165`). `menu_group_<permission_id>` is read (default `'--'`) and stored per grant (`:167`).
5. Minimum-grant rule: `$minimumGrants = ['employees','home','office']`; if the editor is admin, is editing **themselves**, and any are missing → `{success:false, message: lang('Employees.error_cannot_remove_own_minimum_grant')}` (`:172-181`).
6. If `DISALLOW_GRANT_CHANGE` and `hasGrantsChanged(...)` → `{success:false, message: lang('Employees.error_grant_change_disallowed')}` (`:183-190`). `hasGrantsChanged` (`:262-283`) compares sorted permission-id lists: current grants (for existing employees only; for non-admins filtered to permissions the editor himself holds) vs. submitted grants.
7. If a password was posted, `ENVIRONMENT != 'testing'`, and `DISALLOW_PASSWORD_CHANGE` → `{success:false, message: lang('Employees.error_password_change_disallowed')}` (`:192-198`).
8. Employee data:
   - with password: `{username, password: password_hash(pwd, PASSWORD_DEFAULT), hash_version: 2, language_code: exploded[0], language: exploded[1]}` — the `language` POST value is `"<code>:<language>"`, e.g. `en:english` (`:201-209`)
   - without password: `{username, language_code, language}`; plus, **in the testing environment only**, a new employee gets `password = password_hash('test-placeholder')` and `hash_version = 2` because the column is NOT NULL (`:210-227`)
9. `save_employee(...)`; response messages `Employees.successful_adding` / `successful_updating` / `error_adding_updating` + `" $firstName $lastName"`; new id is `$employeeData['person_id']`, update id is `$employeeId` (`:229-255`).
10. When an employee edits **themselves**, the session `language_code` and `language` are updated (`:238-242`).

`postDelete` (`:289-310`): reads `ids` with `FILTER_SANITIZE_FULL_SPECIAL_CHARS` (array of strings), and if the current user is not admin, rejects the whole request when **any** target is an admin (`{success:false, message: lang('Employees.error_deleting_admin') = "You cannot delete an admin user."}`). Then `delete_list($ids)` — the code comment at `:302` notes it passes an array (fine) though typed `array $person_ids`. Success message `successful_deleted` + `count($ids)` + `one_or_multiple`.

Employee view (`app/Views/employees/form.php`) — three tabs:

1. **basic information** — the shared `people/form_basic_info` (first/last/gender/email/phone/address/city/state/zip/country/comments) (`:29-33`)
2. **login information** (`:35-109`) — `username` (required, min 5, remote-unique check against `employees/checkUsername/{employee_id}`, `:212-217`), `password`, `repeat_password` (equalTo; password required only for new employees, min 8, `:218-226`), **language** dropdown built from `get_languages()` plus `':' => lang('Employees.system_language')`; the selected value is `"<language_code>:<language>"`, and when the employee has no personal language it shows the system language option (`:83-107`)
3. **permission information** (`:111-157`) — a hidden `module_validation=1`; for each module a checkbox `grant_<module_id>` with value = module id and a `menu_group_<module_id>` dropdown with `home`/`office`/`both` (`:119-128`); beneath it, for every permission whose `module_id` matches and whose id contains `_`, a checkbox `grant_<permission_id>` (value = permission id) plus a hidden `menu_group_<permission_id> = "--"` (`:132-152`). The label for a subpermission is `lang("<Module>.<suffix>")` if that key exists, otherwise `ucwords(str_replace('_',' ',$suffix))` (`:136-138`)
4. JS behaviour (`:162-251`): disabling a module unchecks and disables all of its subpermissions; the `module` validator errors with `lang('Employees.subpermission_required')` (`"Add at least one grant for each module."`) when a module is checked but has no checked subpermission (`:169-179`); first/last required; email format.

`Employees::getView` also exposes `all_modules` with `grant` and `menu_group` computed per module (`:92-99`).

### 4.8 `DISALLOW_*` environment flags

- `DISALLOW_GRANT_CHANGE` — read in `Employee::save_employee` (`Employee.php:135`) and in `Employees::postSave` (`Employees.php:183`); boolean via `filter_var(..., FILTER_VALIDATE_BOOLEAN)` so `true/1/on/yes` enable.
- `DISALLOW_PASSWORD_CHANGE` — `Employees::postSave:192` and `Employee::change_password:545`.
- Both are bypassed in `ENVIRONMENT === 'testing'` for the password path only (`Employees.php:192,201,223`).

---

## 5. Authentication flows and filters

### 5.1 Global filter chain (`app/Config/Filters.php`)

`$globals['before']` (`Filters.php:64-72`):

1. `honeypot`
2. `isLoggedIn` **except** `login|migrate`
3. `csrf` **except** `login|migrate`
4. `invalidchars`

`$globals['after']`: `toolbar`, `honeypot`, `secureheaders` (`Filters.php:73-78`).

`$filters = ['throttle' => ['before' => ['login','migrate']]]` (`Filters.php:101-103`).

The constructor removes the `csrf` filter when `CI_ENVIRONMENT === 'testing'` (`Filters.php:105-119`).

Consequences:

- every non-login route requires a logged-in session before anything else, so `Secure_Controller`'s grant check only ever runs for authenticated users
- CSRF is enforced on all POSTs except `login` and `migrate`
- `login` and `migrate` are the only throttled routes

### 5.2 `IsLoggedIn` (`app/Filters/IsLoggedIn.php`)

- loads `Employee`; if `!is_logged_in()`:
  - AJAX request → HTTP **401** JSON `{"success":false,"message":"Session expired. Please log in again."}` (`IsLoggedIn.php:16-24`)
  - otherwise `throw new RedirectException('login')` (`:26`)
- otherwise passes through.

### 5.3 `Throttle` (`app/Filters/Throttle.php`)

- only acts on `POST` (`:19-21`); GET `/login` is never throttled (locked by `tests/Controllers/LoginTest.php::testGetRequestToLoginIsNeverThrottled`).
- capacity from `env('throttle.capacity')`: missing/non-numeric → **5**; `<= 0` disables throttling (`:23-33`); window from `env('throttle.seconds')`: missing/non-numeric → **60**, clamped to `>= 1` (`:35-41`).
- two keys, each an HMAC-SHA256 of the value with a secret from `checkThrottleEncryption()` (`helper('security')`):
  - `login-ip-<hmac(ip)>`
  - `login-user-<hmac(strtolower(username))>` — omitted when the username is empty (`:45-55`)
- both are checked with CI's cache-backed `Throttler`; any failure → HTTP **429** JSON `{"success":false,"message": lang('Login.too_many_attempts')}` = `"Too many attempts. Please wait a moment and try again."` (`:57-72`; lang `app/Language/en/Login.php:28`), plus a `log_message('warning', 'Login throttled for IP {ip} (username: {username})')`.
- the counter is consumed by every POST, including successful logins — so the 6th POST from the same IP/username inside the window is rejected (`LoginTest::testSixthFailedAttemptIsThrottled`, and `testCorrectLoginStillWorksUnderThrottleCapacity` with 3 failures then success).

### 5.4 Login controller (`app/Controllers/Login.php`)

`GET /` and `GET|POST /login` → `Login::index` (`app/Config/Routes.php:8-10`). `POST /migrate` → `Login::migrate` (`:11`).

`index()` (`Login.php:24-98`):

1. If already logged in → `redirect()->to('home')` (`:97`).
2. Instantiate `MY_Migration`, read config, `gcaptcha_enabled = config['gcaptcha_enable'] ?? false` (`:28-34`).
3. `$migration->migrateToCI4()`; `$currentVersion = MY_Migration::getCurrentVersion()`; when `null` → HTTP **503** JSON `{success:false, message: lang('Login.migration_error_connection')}` (`:37-44`).
4. View data: `hasErrors=false`, `isNewInstall = ($currentVersion === 0)`, `isLatest = ($latestVersion === $currentVersion)`, `latestVersion`, `gcaptchaEnabled`, `config`, `validation` (`:46-58`).
5. Non-POST → render `app/Views/login.php` (`:60-62`).
6. If not latest **or** new install → the POST is treated as a migration trigger: `ignore_user_abort(true)`, `set_time_limit(3600)`, `$migration->setNamespace('App')->runLocked()`; on `"Migration already in progress"` it re-renders the login view with `hasErrors` and validation error `lang('Login.migration_running')`; on success `redirect()->to('login')` (`:64-80`).
7. Otherwise validate `['username' => 'required|login_check[data]']` with messages `Login.required_username` and `Login.invalid_username_and_password` (`:82-94`). Failure re-renders the login view with `hasErrors`; success falls through to `redirect()->to('home')`.

`login_check` rule (`app/Config/Validation/OSPOSRules.php:31-62`):

1. `installation_check()` — requires PHP extensions `bcmath, intl, gd, openssl, mbstring, curl, xml, json`; failure sets error `lang('Login.invalid_installation')` (`:103-127`)
2. when `gcaptcha_enable`, POST `g-recaptcha-response` must verify against `https://www.google.com/recaptcha/api/siteverify` with `secret`, `response`, `remoteip`; failure → `lang('Login.invalid_gcaptcha')` (`:64-95`)
3. `Employee::login($username, $password)`; failure → `lang('Login.invalid_username_and_password')` = `"Invalid username and/or password."` (`app/Language/en/Login.php:11`)

`migrate()` (`Login.php:100-158`): 503 when version unknown; if not a new install it first re-applies the same `login_check` credentials rule and returns **401** `{success:false,message: invalid_username_and_password}` on failure; runs `runLocked()`; returns `{success:true,message:'Migration completed successfully'}`; `"Migration already in progress"` → **202** with `Login.migration_running`; other exceptions → log + **500** `{success:false,message:'Migration failed: …'}`.

Login view (`app/Views/login.php`) — contract that matters for parity:

- `<title>{company} | OSPOS | {Login.login}</title>`, `noindex,nofollow` (`:24-26`)
- theme selection: empty/`paper`/`readable` → `flatly`, else the configured theme; stylesheet `resources/bootswatch5/{theme}/bootstrap.min.css` (`:28-35`)
- company logo when `config['company_logo']` non-empty, else the OSPOS SVG (`:44-52`)
- heading: new install → `Login.initialization_required`; outdated → `Login.migration_required`; else `Login.welcome` with `{OSPOS}` (`:57-65`)
- migration warning, success, progress, error blocks (`:67-104`)
- two `login_form` layouts: default/floating labels, or `input_groups` (`:107-135`); in `ENVIRONMENT == "testing"` the inputs are pre-filled `admin` / `pointofsale` (`:109,113,124,133`)
- optional reCAPTCHA widget when `gcaptchaEnabled` (`:137-140`)
- submit button label `Login.initialize` / `Module.migrate` / `Login.go` (`:143-153`)
- inline JS drives the migration POST to `site_url('migrate')` with `{csrfToken: csrfHash, username, password}` and updates the heading/progress/success/error states (`:179-324`)

### 5.5 Logout

- Header link `anchor('home/logout', lang('Login.logout'))` (`app/Views/partial/header.php:63`).
- `Home::__construct` inspects `urldecode(request->getUri()->getSegment(2))`; when it is exactly `logout` it only resolves the Employee model and **returns before `Secure_Controller::__construct`**, so logout works even without the `home` grant (`Home.php:14-22`). `testLogoutStillBypassesGrantCheckAfterFix` and `testNonLogoutMethodStillEnforcesModuleGrantCheck` in `tests/Controllers/HomeTest.php` pin exactly this.
- `getLogout()` → `employee->logout()` (destroys the session) → `redirect()->to('login')` (`Home.php:39-43`).
- `Office::logout()` calls the same but is a bare method with no `get`/`post` prefix, so improved auto-routing will not reach it — dead code (`Office.php:31-36`).

### 5.6 Session regeneration and `menu_group`

- Successful login regenerates the CI session with **destroy = true** (`Employee::login:394,402`).
- `Secure_Controller::__construct(string $module_id = '', ?string $submodule_id = null, ?string $menu_group = null)` (`Secure_Controller.php:36-74`):
  1. load `Employee` + `Module` + config + validation service
  2. resolve logged-in employee info
  3. **grant gate**: throw `RedirectException("no_access/$module_id/$submodule_id")` when `!has_module_grant($module_id, person)` **or** (submodule set **and** `!has_module_grant($submodule_id, person)`) (`:44-49`). Note the OR-of-negations is an AND of requirements. One latent defect: `Persons::__construct(?string $module_id = null)` (`Persons.php:17-22`) forwards `$module_id` to `Secure_Controller::__construct(string $module_id = '')` (`Secure_Controller.php:36`); in PHP 8 a `null` argument to a non-nullable userland `string` parameter raises a `TypeError` (null is not coerced for userland scalar params). This is unreachable today because every concrete subclass passes a module id, but it means the abstract `Persons` endpoints (`getIndex`/`getSuggest`/`getRow`, `Persons.php:27-55`) cannot be served under a subclass that omits the id.
  4. `menu_group`: if the controller passed one, it is written to the session; otherwise the session value is read. So `Home` permanently sets `menu_group='home'` and `Office` sets `'office'` for subsequent requests (including `no_access` rendering) (`:52-57`).
  5. allowed modules = `get_allowed_home_modules(person)` when `menu_group == 'home'`, else `get_allowed_office_modules(person)`; the result becomes `global_view_data['allowed_modules']` (`:59-66`).
  6. `global_view_data += ['user_info' => ..., 'controller_name' => $module_id, 'config' => ...]`, then `view('viewData', …)` so every later view can read them (`:68-73`).
- `sanitizeSortColumn($headers, $field, $default)` — flattens each header's first key and returns `$field` only if it is in that whitelist, else `$default`; `null` → default (`:76-89`).
- `validateFields(array $rules, array $messages, $id = NEW_ENTRY)` returns a JSON `{success:false,message:<first error>,id}` response on failure (`:99-108`).
- `getCheckNumeric()` returns JSON `"true"`/`"false"` depending on `parse_decimals()` over all GET values (`:115-123`).
- Base stubs `getIndex`, `getSearch`, `suggest_search`, `getView`, `postSave`, `postDelete` all return `false` (`:139-184`).

### 5.7 `no_access`

Routes (`app/Config/Routes.php:13-14`): `no_access/index/(:segment)` and `no_access/index/(:segment)/(:segment)`. `Secure_Controller` throws `no_access/<module>/<submodule>` and improved auto-routing resolves it to `No_access::getIndex($module_id)` (`app/Controllers/No_access.php:29-35`).

`No_access::getIndex(string $module_id = '', string $permission_id = '')` (`No_access.php:29-54`):

- `module_name = Module::get_module_name($module_id)` → `lang('Module.' . module_id)` or `lang('Error.unknown')` (`app/Models/Module.php:27-39`)
- for a **false** user info or an **AJAX** request, returns just the `no_access` view (fragment)
- otherwise renders `partial/header` + `no_access` + `partial/footer`, with `allowed_modules` computed for the session `menu_group` (so navigation still works), plus `user_info` and `config`

The message text is exactly:

```
lang('Error.no_permission_module') . " $module_name" . (!empty($permission_id) ? " ($permission_id)" : '')
```

= `"You do not have permission to access the module named" + " " + <translated module name> + optional " (<permission>)"` (`app/Views/no_access.php:6`; lang `app/Language/en/Error.php:5`). The view also disables an element with id `submit` via inline JS (`no_access.php:8`).

---

## 6. Module model, menus and sidebar rendering

`app/Models/Module.php`:

| Method | Semantics | Cite |
|---|---|---|
| `get_module_name(string $module_id)` | exact row lookup; returns `lang('Module.<module_id>')`, else `lang('Error.unknown')` | `:27-39` |
| `get_module_desc(string)` | `lang('Module.<module_id>_desc')`, else `Error.unknown` (unused upstream) | `:45-57` |
| `get_all_permissions()` | `SELECT * FROM permissions` (this is what the employee form iterates; despite the name it returns permissions, not modules) | `:62-67` |
| `get_all_subpermissions()` | `permissions JOIN modules ON modules.module_id = permissions.module_id WHERE modules.module_id != permissions.permission_id` (unquoted second operand, `where(..., false)`) — i.e. all rows whose permission id differs from its module id (`items_stock`, `reports_*`, `sales_delete`, …) | `:72-81` |
| `get_all_modules()` | all modules `ORDER BY sort asc` | `:86-92` |
| `get_allowed_home_modules(int $person_id)` | `modules JOIN permissions ON permissions.permission_id = modules.module_id JOIN grants ON permissions.permission_id = grants.permission_id WHERE grants.person_id = ? AND grants.menu_group IN ('home','both') AND modules.sort != 0 ORDER BY modules.sort asc` | `:98-110` |
| `get_allowed_office_modules(int $person_id)` | same with `IN ('office','both')` | `:116-128` |
| `set_show_office_group(bool)` | sets `modules.sort = 999` when true, `0` when false, for `module_id = 'office'` | `:134-147` |
| `get_show_office_group(): int` | `SELECT sort FROM modules WHERE module_id = 'office'` | `:153-160` |

Important consequences:

- the join is on `permissions.permission_id = modules.module_id`, so **only grants for the parent permission make a module appear**; being granted only subpermissions (e.g. `reports_sales`) yields **no sidebar entry for that module**.
- `sort != 0` is the "visible" flag. The `office` module is `sort = 999` when the office group is enabled in config and `0` when disabled (`set_show_office_group`); `home` is seeded `sort = 1` (`3.1.1_to_3.2.0.sql:9-10`) so it is always visible.
- `menu_group` is per-grant and can be `home`, `office`, `both`, or `--` (the `'--'` used for subpermissions and `sales_delete`/`sales_change_price`), so a permissive query would also need to handle `'--'` (it never appears as a module-level grant because module grants always get a real group from the dropdown).

Sidebar rendering (`app/Views/partial/header.php:85-101`):

- iterates `$allowed_modules` (already filtered by the current `menu_group`) in sort order
- each item: `<li class="active">` when `module_id == uri segment(1)`; `<a href=base_url(module_id)><img src="images/menubar/<module_id>.svg"><br>lang('Module.<module_id>')</a>`
- top-right anchors: `home/changePassword/<person_id>` (opens modal) and `home/logout` (`header.php:58-64`)
- the menubar SVG assets are **not in the git tree** (`public/images/menubar/.gitkeep` only; `.gitignore:5-6` ignores `public/images/menubar/*`) — they ship with release archives.

Home/office page grids (`app/Views/home/home.php:15-22`, `app/Views/home/office.php:15-22`) are the same loop: a `.module_item` with `title=lang("Module.<id>_desc")`, an `<img>` icon at `height:64px; max-width:64px`, and a name link. `home.php` uses `#home_module_list`, `office.php` uses `#office_module_list`.

Module/permission seed data (final 3.4.3 state):

Modules (18): `config` (sort 110→900), `customers` 10, `employees` 80, `giftcards` 90, `items` 20, `item_kits` 30, `messages` 100→98, `receivings` 60, `reports` 50, `sales` 70, `suppliers` 40 (`initial_schema.sql:311-323`); `office` and `home` sort 1 (`3.1.1_to_3.2.0.sql:8-10`); `office` later 999 (`3.1.1_to_3.2.0.sql:105-108`); `cashups` 110 (`3.2.1_to_3.3.0.sql:52-53`); `expenses` 108, `expenses_categories` 109 (`3.1.1_to_3.2.0.sql:121-123`); `attributes` 107 (`3.3.0_attributes.sql:48-49`); `taxes` 105 (`3.0.2_to_3.1.1.sql:200-201`); `migrate` was created then deleted (`3.0.2_to_3.1.1.sql:238-239`, `3.1.1_to_3.2.0.sql:88-90`).

Permissions (35): the 22 base (`initial_schema.sql:372-394`) + `items_stock`, `sales_stock`, `receivings_stock` (location 1, `:396-399`) + `home`, `office` (`3.1.1_to_3.2.0.sql:12-15`) + `sales_delete` (`:64-66`) + `expenses`, `expenses_categories`, `reports_expenses_categories` (`3.1.1_to_3.2.0.sql:125-129`) + `attributes` (`3.3.0_attributes.sql:51-52`) + `cashups` (`3.2.1_to_3.3.0.sql:55-56`) + `reports_sales_taxes` (`3.3.0_indiagst.sql:96-97`) + `sales_change_price` (`3.3.2_saleschangeprice.sql:1-2`).

Admin defaults (`person_id = 1`): every base permission (`initial_schema.sql:418-446`), the three stock perms (`:437-439`), `office` with `menu_group='home'` and `home` with `menu_group='office'` (`3.1.1_to_3.2.0.sql:16-19`), then `config, home, employees, taxes, migrate` re-grouped to `office` (`:21-24`), `sales_delete` with `menu_group='--'` (`:67-68`), expenses group (`:130-134`), attributes with `office` (`3.3.0_attributes.sql:54-55`), cashups (`3.2.1_to_3.3.0.sql:58-59`), `reports_sales_taxes` with `home` (`3.3.0_indiagst.sql:99-100`), `sales_change_price` with `'--'` (`3.3.2_saleschangeprice.sql:4-7`).

---

## 7. Home and Office dashboards

### 7.1 `Home` controller (`app/Controllers/Home.php`)

- constructor bypass described in §5.5; otherwise `parent::__construct('home', null, 'home')` — requires the `home` grant and forces session `menu_group='home'` (`:21`).
- `getIndex()` returns `view('home/home')`; the `$logged_in` variable is computed and unused (`:27-31`).
- content: welcome heading `lang('Common.welcome_message')`, then the grid of allowed **home** modules (each links to `base_url(module_id)`), plus `dialog_support.init("a.modal-dlg")` (`app/Views/home/home.php:9-22`). No metrics, no shortcuts, no charts.
- `getChangePassword(int $employeeId = NEW_ENTRY)` and `postSave(int $employeeId = NEW_ENTRY)` (`:51-136`):
  - default target id = the logged-in person (`$employeeId === NEW_ENTRY ? $currentPersonId : $employeeId`)
  - **authorization**: a non-admin may only target themselves; otherwise HTTP **403** with body `lang('Employees.unauthorized_modify')` = `"You are not authorized to modify this employee."` (GET) or JSON `{success:false,message:…}` (POST) (`:58-60`, `:83-88`)
  - GET renders `home/form_change_password` with `person_info`
  - POST requires `current_password`; `check_password(username, current_password)` must pass, else `{success:false, message: lang('Employees.current_password_invalid')}` (`:90-128`)
  - then raw-password `strlen < 8` → `{success:false, message: lang('Employees.password_minlength'), id: NEW_ENTRY}` (`:93-101`)
  - then `{username, password: password_hash(new, PASSWORD_DEFAULT), hash_version: 2}` via `change_password`, `{success:true, message: lang('Employees.successful_change_password'), id: employeeId}` or `unsuccessful_change_password` (`:103-121`)
  - an empty/absent `current_password` yields `current_password_invalid` (`:129-135`)
  - the change-password view (`app/Views/home/form_change_password.php`) shows the username read-only, `current_password`, `password`, `repeat_password`; client rules: all required, min length 8, `password` must differ from `current_password` (`notEqualTo`, message `Employees.password_not_must_match` = `"Current password and new password must be unique."`), `repeat_password` equalTo `#password` (`:104-127`).

### 7.2 `Office` controller (`app/Controllers/Office.php`)

- `parent::__construct('office', null, 'office')` — requires the `office` grant and forces session `menu_group='office'` (`:15-18`)
- `getIndex()` returns `view('home/office')` — welcome heading + grid of allowed **office** modules (`:23-26`)
- `logout()` dead code (§5.5).

---

## 8. CSV contracts

### 8.1 Customer import template (the exact artifact)

`Customers::getCsv()` does not generate anything — it streams a static file:

```
$data = file_get_contents(WRITEPATH . "uploads/importCustomers.csv");
return $this->response->download($name, $data);   // $name = 'importCustomers.csv'
```

(`app/Controllers/Customers.php:382-387`). The file at `writable/uploads/importCustomers.csv` is 272 bytes, **ASCII, no BOM, LF line endings** (verified with `xxd`: first bytes are `46 69 72 73 74` = `First`; last byte `0a`).

Byte-exact content (3 lines):

```
First Name,Last Name,Gender,Consent,Email,Phone Number,Address 1,Address2,City,State,Zip,Country,Comments,Company,Account Number,Discount,Discount_Type,Taxable
Bob,Smith,1,y,bsmith@nowhere.com,585-555-1111,123 Nowhere Street,Apt 4,Awesome,NY,11111,USA,Awesome guy,,,5,0,y
```

(one sample row; the file ends with a newline). Notes that must be reproduced literally if byte-parity matters: header cell `Address2` has **no space** while `Address 1` does; `Discount_Type` uses an **underscore**; `Phone Number` has a space.

Column index contract used by the importer (0-based, `Customers.php:431-455`):

| Idx | Header | Mapped to | Notes |
|---|---|---|---|
| 0 | First Name | `people.first_name` | raw, no `nameize` |
| 1 | Last Name | `people.last_name` | raw |
| 2 | Gender | `people.gender` | raw string coerced to int by MySQL |
| 3 | Consent | gate + `customers.consent` | non-empty → `1`, empty → `0`; **empty consent means the row is skipped** |
| 4 | Email | `people.email` | `strtolower(filter_var(..., FILTER_SANITIZE_EMAIL))` |
| 5 | Phone Number | `people.phone_number` | |
| 6 | Address 1 | `people.address_1` | |
| 7 | Address2 | `people.address_2` | |
| 8 | City | `people.city` | |
| 9 | State | `people.state` | |
| 10 | Zip | `people.zip` | |
| 11 | Country | `people.country` | |
| 12 | Comments | `people.comments` | |
| 13 | Company | `customers.company_name` | |
| 14 | Account Number | `customers.account_number` | only set when non-empty; duplicate check performed |
| 15 | Discount | `customers.discount` | raw string |
| 16 | Discount_Type | `customers.discount_type` | raw string |
| 17 | Taxable | `customers.taxable` | non-empty → `1`, empty → `0` |

### 8.2 Import algorithm (`Customers.php:406-492`)

1. If `$_FILES['file_path']['error'] != UPLOAD_ERR_OK` → `{success:false, message: lang('Customers.csv_import_failed')}` = `"CSV import failed"`.
2. `fopen(tmp_name,'r')`; if it fails → `{success:false, message: lang('Customers.csv_import_nodata_wrongformat')}` = `"The uploaded file has no data or is incorrectly formatted."`
3. `fgetcsv($handle)` **skips exactly one row** — there is no header validation and no BOM handling (a UTF-8 BOM would end up inside the first data row's first cell only if the file had no header; it is discarded with the header).
4. For each subsequent row (`$rowNumber` starts at 1 and counts **data rows only**, not file lines):
   - `$consent = $data[3] == '' ? 0 : 1`
   - **gate**: `if (sizeof($data) >= 16 && $consent)` — note the threshold is 16 but the code reads indexes up to 17; a 16- or 17-column row triggers PHP "Undefined array key" warnings and stores `null`/`''` for discount/taxable rather than being rejected.
   - email: `$email = filter_var(strtolower($data[4]), FILTER_SANITIZE_EMAIL)`; empty is allowed; when non-empty it must pass `FILTER_VALIDATE_EMAIL`, else the row is recorded as `"Row {n}: Invalid email format"` and skipped (`:425-429`).
   - person data as the column table above; customer data `{consent, company_name, discount, discount_type, taxable, date: now('Y-m-d H:i:s'), employee_id: logged-in person_id}`; `account_number` added only when non-empty.
   - duplicate handling: `$invalidated = check_email_exists($email)` (so **two rows with empty email do not conflict** because the check short-circuits on empty); when `account_number != ''`, `$invalidated &= check_account_number_exists($account_number)`.
   - if invalid → `$failCodes[] = $rowNumber` and `log_message('error', "Row $rowNumber was not imported: Either email or account number already exist or data was invalid.")`.
   - else `saveCustomer(...)`; on success sync to Mailchimp (with the argument-order bug of §2.10); on save failure `$failCodes[] = $rowNumber`.
5. Result:
   - `count($failCodes) > 0` → `{success:false, message: lang('Customers.csv_import_partially_failed', [count, implode(', ', $failCodes)])}` = `"{0} customer(s) failed to import on line(s): {1}."` (`app/Language/en/Customers.php:19`) — the `{1}` list mixes bare row numbers and the special `"Row n: Invalid email format"` strings.
   - else `{success:true, message: lang('Customers.csv_import_success')}` = `"Customer import successful."`

Failure semantics worth pinning: it is **not** transactional — valid rows are imported even when other rows fail; the response is `success:false` for *any* failure. Duplicate detection is per-file and against the DB at row time (so a duplicated email within the same upload is caught because the first row is already saved).

### 8.3 Import UI / upload contract (`app/Views/customers/form_csv_import.php`)

- `form_open_multipart('customers/importCsvFile/')`, id `csv_form` (`:3`)
- a link to `customers/csv` labelled `Common.download_import_template` (`:8`)
- a bootstrap-fileinput control with `<input type="file" id="file_path" name="file_path" accept=".csv">` (`:17`) — the **form field name is `file_path`** and the controller reads `$_FILES` directly, not `$this->request->getFile()`
- client rule `file_path: 'required'`, message `Common.import_full_path` (`:43-49`)
- on submit: `ajaxSubmit` → `dialog_support.hide()` → `table_support.handle_submit('customers', response)` (`:32-38`)

### 8.4 Customer "export"

There is **no customer export**. `getCsv` only downloads the blank-ish template (one sample row). The only People-related "export" feature in upstream is the template download. (`items` has the real CSV import/export pair via `generate_import_items_csv()` in `app/Helpers/importfile_helper.php:8-15`.)

### 8.5 `importfile_helper.php` (items only, cited for shared CSV machinery)

- `generate_import_items_csv(array $stock_locations, array $attributes)` — begins with a UTF-8 BOM `pack('CCC', 0xef,0xbb,0xbf)` and the header `Id,Barcode,"Item Name",Category,"Supplier ID","Cost Price","Unit Price","Tax 1 Name","Tax 1 Percent","Tax 2 Name","Tax 2 Percent","Reorder Level",Description,"Allow Alt Description","Item has Serial Number",Image,HSN` followed by `,"location_<name>"` and `,"attribute_<name>"` columns (`:8-40`).
- `get_csv_file(string $file_name)` — strips a BOM with `bom_exists()` + `fseek($csv_file, 3)`, reads the header row with `fgetcsv`, then `array_combine($headers, $row)` per row, skipping `[null]` rows (`:46-63`). `bom_exists()` compares the first 3 bytes and rewinds (`:69-86`).
- `csvImportHasRequiredItemHeaders(...)` — validates the parsed rows expose every template header (`:100-119`).

The customer importer does **none** of this: no BOM skip, no header validation, no per-column mapping by name.

### 8.6 Encoding / duplicate / message summary

| Item | Customer CSV | Item CSV (for contrast) |
|---|---|---|
| BOM in template | no | yes (`importfile_helper.php:10`) |
| BOM in upload handled | no | yes (`:52-54`) |
| Header skip | one unconditional `fgetcsv` | header used for `array_combine` |
| Header validation | none | `csvImportHasRequiredItemHeaders` |
| Row-level validation | email syntax; consent non-empty; `sizeof >= 16` | required headers; per-item rules |
| Duplicate key | email (customers only, non-deleted) + account number (customers only) | item number/barcode rules |
| Partial success | yes, non-transactional | yes |
| Messages | `Customers.csv_import_failed`, `csv_import_nodata_wrongformat`, `csv_import_partially_failed {0}/{1}`, `csv_import_success` | items equivalents |

---

## 9. Target gap analysis (file by file)

Legend: **MATCH** = semantically equivalent; **DIFF** = behaviour differs; **MISSING** = not implemented; **EXTRA** = target-only behaviour with no upstream counterpart.

### 9.1 `src/db/schema/auth.ts` (sqlite)

| Item | Upstream | Target | Verdict |
|---|---|---|---|
| `people` columns | first_name NOT NULL, last_name NOT NULL, gender int default NULL, phone/email/address/city/state/zip/country NOT NULL (empty string default), comments text NOT NULL | `lastName` nullable, `gender` default 0, strings nullable | DIFF (nullable and default-0 changes; upstream distinguishes NULL vs '' for gender and requires empty strings for address) |
| `employees` | table `Employees`, `hashversion` in allowedFields, `language` varchar(48), `language_code` varchar(8) | `employees`, `hashVersion`, languages unbounded text | MATCH functionally (naming) |
| `modules` | `module_id`, `name_lang_key`, `desc_lang_key`, `sort` int NOT NULL, unique on desc/name lang keys | same + unique only on desc | DIFF (missing unique on `name_lang_key`) |
| `permissions` | `permission_id` PK, `module_id` NOT NULL (no FK upstream), `location_id` NULL | FK to modules with `ON DELETE CASCADE`; FK to `stock_locations` | DIFF (cascade delete of permissions when a module row is removed — upstream has no FK) |
| `grants` | PK `(permission_id, person_id)`, `menu_group` varchar(32) default `'home'` | **no PK/unique** in SQLite; `menu_group` text default `'both'`; FKs cascade | DIFF — duplicate grants are possible in SQLite, and `saveEmployee`'s `onConflictDoNothing()` (persons repo `:158`) silently inserts duplicates because there is no conflict target |
| `sessions`, `cartSessions` | CI session table / no cart table | present | EXTRA |

Target migration proof: `drizzle/sqlite/0000_skinny_power_man.sql:20-26` (grants has no key), `:8-19` (employees), `:28-35` (modules), `:36-50` (people), `:52-58` (permissions). MySQL schema does define the composite PK (`src/db/schema/mysql/index.ts:60-66`) — so behaviour differs by driver.

### 9.2 `src/db/schema/customers.ts`

| Upstream column | Target | Verdict |
|---|---|---|
| `person_id` PK FK | yes (`:6`) | MATCH |
| `company_name` | yes (`:7`) | MATCH |
| `account_number` (non-unique in 3.4.3) | yes, no index (`:8`) | MATCH (no index at all vs. plain index upstream — acceptable; but see app-level check below) |
| `taxable` tinyint default 1 | boolean default true (`:9`) | MATCH |
| `discount` decimal(15,2) | **`real`** (`:10`) | DIFF (floating point money; MySQL schema uses `decimal(15,4)` at `mysql/index.ts:164`) |
| `discount_type` | yes (`:11`) | MATCH |
| `points` int(11) **NULL** | integer NOT NULL default 0 (`:12`) | DIFF (upstream nullable; `Customer::delete` sets `points = null`) |
| `sales_tax_code_id` | yes, FK taxCodes (`:13`) | MATCH (schema) — but no form/UI/controller support (§9.4) |
| `deleted` | yes (`:14`) | MATCH |
| `tax_id` varchar(32) NOT NULL default '' | **MISSING** | MISSING |
| `date` timestamp | **MISSING** | MISSING |
| `employee_id` int NOT NULL | **MISSING** | MISSING |
| `consent` tinyint | **MISSING** | MISSING |
| `package_id` FK customers_packages | **MISSING** (target has a different `rewards`/`customer_rewards` model) | MISSING / DIFF |
| `customers_packages` table | **MISSING**; target `rewards` (`:32-37`) + `customer_rewards` join (`:39-42`) is a different data model | DIFF |
| `customers_points`, `sales_reward_points` | **MISSING** | MISSING |
| `suppliers.tax_id` | **MISSING** | MISSING |
| `suppliers.category` | **MISSING** | MISSING |
| `suppliers.company_name` NOT NULL | nullable (`:19`) | DIFF |
| `suppliers.agency_name` NOT NULL | nullable (`:20`) | DIFF |
| `suppliers.account_number` UNIQUE | `.unique()` (`:21`) | MATCH |

### 9.3 `src/lib/persons/repository.ts`

| Function | Upstream counterpart | Verdict |
|---|---|---|
| `getPerson` `:45-48` | `Person::getInfo` | DIFF — returns raw row or `undefined`; no empty-object synthesis, no `NEW_ENTRY` semantics |
| `getCustomer` `:50-55` | `Customer::getInfo` (join) | DIFF — two queries + spread; returns `null` when either side is missing; **no `people ⋈ customers` join** means name/field collisions would silently resolve to the customer row; no empty object for new records |
| `getSupplier` `:57-62` | `Supplier::getInfo` | DIFF (same pattern) |
| `getEmployee` `:64-71` | `Employee::getInfo` + grants | DIFF — returns grants array nested; no empty object; exposes `password`/`hashVersion` to callers (upstream `getInfo` also returns them, so not a new leak) |
| `saveCustomer` `:73-102` | `Customer::saveCustomer` | DIFF — (a) no `date`, `employee_id`, `consent`, `tax_id`, `salesTaxCodeId`, `packageId`; (b) on update it **overwrites** all customer fields with `?? null/0/true` defaults, so a partial form wipes data; (c) calls `getPerson` *inside* the transaction using the non-transactional handle (`:77`); (d) returns `id!` and never reports failure (throws instead); (e) transaction has no explicit rollback path |
| `saveSupplier` `:104-127` | `Supplier::save_supplier` | DIFF — no `category`, `tax_id`; same partial-overwrite and tx-handle issues; does not write `person_id` back on update |
| `saveEmployee` `:129-167` | `Employee::save_employee` | DIFF — no `DISALLOW_GRANT_CHANGE`, no `menu_group` per grant (defaults `"both"`, `:161`), always `hashVersion: 2`, empty `grants` array **deletes all grants** (`if (employee.grants)` is true for `[]`), `onConflictDoNothing` without a unique constraint |
| `deleteCustomer` `:169-172` | `Customer::delete` | DIFF — no `enforce_privacy` scrambling; no `delete_list` |
| `deleteSupplier` `:174-177` | `Supplier::delete` | MATCH for the simple path; no list variant |
| `deleteEmployee` `:179-185` | `Employee::delete` | DIFF — no self-delete guard, no admin policy, no controller check in repo; deletes grants (like upstream) |
| `searchCustomers` `:187-220` | `Customer::search` | DIFF — no `CONCAT(first_name,' ',last_name)`; no sort/order/offset/count-only; hard default limit 25 (callers use 100); LIKE on NULL columns behaves the same (no match) |
| `searchSuppliers` `:222-252` | `Supplier::search` | DIFF — missing `phone_number` and `CONCAT`; no `category` filter; no sort/offset/count |
| `searchEmployees` `:254-281` | `Employee::search` | DIFF — missing `phone_number` and `CONCAT`; no sort/offset/count |
| `suggestCustomers` `:283-289` | `Customer::get_search_suggestions` | DIFF — label = company or `first last`, plus an **extra `sublabel`** field; no `[company]`/`[phone]` suffixes; no `unique=false` variant |
| `listAllPermissions` `:291-301` | `Module::get_all_permissions` | DIFF — joins modules (upstream returns raw `permissions`); returns `moduleName` = `modules.name_lang_key` which the target seed stores as a display label |
| `listEmployeeGrants` `:303-306` | `Employee::get_employee_grants` | MATCH (shape is rows, not ids) |
| `emailExists` `:308-315` | `Customer::check_email_exists` | **DIFF and stricter** — checks **all `people` rows** (employees/suppliers included), no `deleted = 0` scope, exact match. Upstream checks non-deleted customers only |
| `accountNumberExists` `:317-330` | `Customer::check_account_number_exists` | **DIFF and stricter** — checks customers **and suppliers**; upstream checks customers only. (The deliverable's "uniqueness across customers+suppliers" is *not* upstream behaviour; it is target-only.) |
| `usernameExists` `:332-339` | `Employee::username_exists` | MATCH (excludes current id) |

Additional target-only omission: there is **no `get_stats`**, **no `adjustRewardPoints`**, **no `update_reward_points_value`**, **no `get_found_rows`**, **no bulk `get_multiple_info`**.

### 9.4 `src/app/(secure)/customers/**` and `src/components/customers/**`

| Upstream | Target | Verdict |
|---|---|---|
| Modal-based CRUD on `people/manage` (jQuery tables, AJAX JSON) | Full-page list + full-page form, server actions that `redirect()` | DIFF (UX contract) — acceptable if the plan keeps App Router conventions, but the JSON contracts are absent |
| `postSave` returns `{success,message,id}` | `saveCustomerAction` throws `Error` on failure; success redirects (`actions.ts:12-49`) | DIFF — no JSON envelope, no machine-readable success/message |
| No server-side email/account uniqueness on `postSave` | **server-side** checks before save (`actions.ts:19-25`) | DIFF (stricter; also blocks emails that belong to employees) |
| Fields: consent, gender, discount_type, discount, company_name, account_number, tax_id, rewards package, available points, taxable, sales tax code, date (read-only), employee (read-only), comments | fields: first/last/company/account/email/phone/discount/discountType/address1/2/city/state/zip/country/**points (editable!)**/taxable/comments (`customer-form.tsx:43-67`) | DIFF — missing consent, tax_id, salesTaxCodeId, date, employeeId, package; **points editable** whereas upstream shows a disabled `available_points` (`customers/form.php:135-146`); gender omitted from the form even though the action reads it (`actions.ts:29`) |
| Date/employee auto-stamped from session and config date format | none | MISSING |
| Stats tab (total/max/min/average/quantity/avg_discount) | none | MISSING |
| Mailchimp tab + status/vip on save | none (`mailchimp` lib exists but is not called by customer actions) | MISSING (sync), lib partially present |
| CSV import modal + template download + `postImportCsvFile` | none (no route, no action, no button; `src/lib/csv/parse.ts` is only used by items) | MISSING |
| Delete → Mailchimp `removeMember` + privacy scrambling | delete sets `deleted = true` only (`persons/repository.ts:169-172`) | DIFF/MISSING |
| Search includes CONCAT full name; sortable columns; page size from config | `q` substring across 6 fields; hard limits (`searchCustomers(q, 100)`) | DIFF |
| Table shows total spent, SMS action, email mailto | table shows name/company/email/phone/account/discount (`customers-table.tsx:25-56`) | DIFF |
| Suggestions `{value,label}` | `{value,label,sublabel}` (`repository.ts:283-289`) | DIFF (extra field; label format differs) |

### 9.5 `src/app/(secure)/suppliers/**`, `src/lib/suppliers/repository.ts`

- **Two parallel supplier implementations.** `src/lib/persons/repository.ts` (`saveSupplier`, `searchSuppliers`, `getSupplier`, `deleteSupplier`) is what the pages/actions import; `src/lib/suppliers/repository.ts` is only used by `src/app/api/suppliers/suggest/route.ts` (`getSearchSuggestions`). They diverge in filters (the second has no people join requirement, uses `leftJoin`, orders by `person_id desc`).
- Missing entirely: `category` (goods/cost), `tax_id`, category translation (`get_category_name`), `get_categories`, `get_all(category)` default filter, `agency_name` distinct suggestions, account-number **duplicate** check (target does check via `accountNumberExists`, stricter than upstream which has none), CSV (upstream has none — nothing to port).
- `suppliers/repository.ts:81-88` `getCategories()` returns distinct **agency_name** values — semantically unrelated to upstream supplier categories; `getCategoryName(agencyName)` returns an agency name (`:90-94`). This is an invented API and should be re-pointed at a real `category` column.
- `suppliers/repository.ts:151` `void like;` — dead import marker; harmless.
- Suggestions: `getSearchSuggestions` (`:58-79`) searches company/first/last/account but **not** agency, email, phone; returns rows, not `{value,label}`; the route returns them raw (`src/app/api/suppliers/suggest/route.ts`).

### 9.6 `src/lib/employees/repository.ts` vs `src/lib/persons/repository.ts` (duplicate employee stacks)

`employees/repository.ts` is imported only by `change-password/actions.ts` and `home/actions.ts` (`changePassword`), plus nothing else. It nevertheless defines a second, divergent suite:

| Function | Issue | Cite |
|---|---|---|
| `getAll` | orders by `employees.username` (upstream `last_name asc`), default limit 25 (upstream 10000) | `:27-32` |
| `getInfo`/`getInfoByUsername` | no grants, no language fields in `getInfo` | `:34-40` |
| `search` | LIKE only username/first/last; no email/phone/CONCAT; no sort/offset | `:81-86` |
| `checkPassword(personId, password)` | **plaintext comparison** `emp.password === password` — always false for real bcrypt hashes | `:107-111` |
| `changePassword` | writes hash + version; no `DISALLOW_PASSWORD_CHANGE`; no transaction | `:113-116` |
| `saveEmployee` | separate from `persons.saveEmployee`; grants inserted **without menu_group** and with `onConflictDoNothing`; no `DISALLOW_GRANT_CHANGE` | `:125-162` |
| `deleteEmployee`/`deleteList` | no grants deletion, no self guard | `:164-173` |

This duplication is a defect risk: the two stacks have different grant semantics and either can be imported accidentally.

### 9.7 `src/lib/auth/rbac.ts`

| Contract | Upstream | Target | Verdict |
|---|---|---|---|
| `ADMIN_MODULES` | `Constants.php:179` (11 ids) | identical list (`rbac.ts:5-8`) | MATCH |
| `isAdmin` | `person_id === 1` or all modules granted | identical, but computes by loading all grants and using a Set (`:18-29`) — equivalent result, no `has_grant` call | MATCH (semantics) |
| `hasGrant` | exact row; `null` permission → true; `null` person → false | same **plus `if (isAdmin(personId)) return true;`** (`:34`) | **DIFF** — admin bypass changes `has_grant('messages', 1)`-style checks (table header "messages" column, form checkmarks) from "row exists" to "always true". For person 1 all rows exist anyway, but for a user granted all ADMIN_MODULES but not a specific subpermission the bypass grants it |
| `hasModuleGrant` | count LIKE prefix; `count != 1 → count != 0`; `count == 1 → no <id>_ permission rows` | `matching = LIKE '<module>%'`; `0 → exact lookup`; `1 → if the single grant is the module id return true, else return (no '<module>_%' permissions)`; `>= 2 → true` (`:44-71`) | **DIFF** — the single-match branch is wrong on both sides: (a) parent-only grant returns `true` where upstream returns `false` whenever the module has subpermissions (this is exactly the case the target's own test enshrines at `rbac.test.ts:58-62` using `sales`, which has `sales_delete`); (b) a single subpermission grant returns `(subperms.length === 0)` which is `false` whenever the module has subpermissions — coincidentally equal to upstream here, but reached by inverted logic |
| `hasModuleGrant` zero-match fallback | upstream returns false | target re-queries exact grant then returns it (`:52-59`) | equivalent (dead branch) |
| `getAllowedModules(personId, menuGroup)` | two functions; `menu_group IN (home/both)` or `(office/both)`; `sort != 0`; join via permissions | one function; `where(and(eq(grants.personId, …), eq(modules.sort, sql\`0\`)))` (`:85`) then a JS filter that keeps everything when `menuGroup === "both"` (`:87`) and de-dupes by module id (`:88-93`) | **DIFF — two defects**: (1) `eq(modules.sort, sql\`0\`)` selects `sort = 0` whereas upstream requires `sort != 0` (inverted; hides every visible module and shows the hidden ones) — the rendered sidebar only works because the seed sets every module's sort to `0` except `office`; (2) `menuGroup === "both"` disables menu-group filtering entirely, so the target sidebar mixes home and office modules in one list instead of rendering the session's group |
| `getAllGrantedPermissions` | no direct counterpart | extra helper | EXTRA |

**"RBAC LIKE space bug" verification result.** I searched every `like(`/`LIKE` in `src` (26 hits). There is **no** literal-space pattern in any LIKE (`${moduleId}%`, `${moduleId}_%`, `%term%` only). What the target actually gets wrong relative to the documented upstream rule is the single-match branch of `hasModuleGrant` plus the admin short-circuit in `hasGrant`, not a space. Two real wildcard caveats that both sides share and that should be documented rather than "fixed" silently: SQL `_` is a single-char wildcard, so `'<id>_%'` also matches `<id>X…`; and `LIKE '<module>%'` matches any future permission sharing the prefix. If the intent is to reproduce PHP exactly, the target must implement `count !== 1 ? count !== 0 : has_subpermissions(id)` with `has_subpermissions(id) = (COUNT(permissions WHERE permission_id LIKE '<id>_%') === 0)`, without the `perm === moduleId → true` shortcut.

### 9.8 `src/lib/auth/with-permission.ts` vs `Secure_Controller`

Upstream gate: `has_module_grant(module) AND (submodule ? has_module_grant(submodule) : true)` → redirect `no_access/{module}/{submodule}`.

Target (`with-permission.ts:5-19`):

1. no session → `/login` (upstream: `IsLoggedIn` redirects before the controller)
2. `if (isAdmin(personId)) return session` (extra short-circuit)
3. `target = submoduleId ? `${moduleId}_${submoduleId}` : moduleId`
4. `if (!hasModuleGrant(moduleId, personId) && !hasGrant(target, personId)) redirect(...)` — **OR**, not AND (`hasModuleGrant AND hasGrant` would still be wrong because the submodule check must be `has_module_grant(submodule)` on its own prefix, not an exact grant). A user with a single exact grant `reports_sales` therefore passes `requirePermission("reports","sales")` even if `has_module_grant("reports")` is false.
5. redirect path is built as `/no_access/${moduleId}${submodule ? '/'+submodule : ''}` — when no submodule is supplied this yields `/no_access/<module>`, but the only route directory is `src/app/(secure)/no_access/[module]/[submodule]/page.tsx`, so the single-segment form **404s**.

### 9.9 `src/app/(secure)/no_access/[module]/[submodule]/page.tsx`

- upstream prints `"You do not have permission to access the module named <ModuleName> (<permission>)"` inside the global header/footer, and degrades to a fragment for AJAX
- target prints a fixed "Access Denied / You do not have permission to access this module. / Return to Home" and never displays the module name or permission id (`page.tsx:1-15`)
- target requires the `[submodule]` segment (no optional catch-all) → single-segment redirects 404 (see §9.8)
- target page has no permission check itself (fine, upstream `No_access` is a plain controller)

### 9.10 Auth: `src/lib/auth/options.ts`, `password.ts`, `src/app/(auth)/login/page.tsx`, `src/proxy.ts`

| Upstream | Target | Verdict |
|---|---|---|
| CI session + server-side `person_id` | NextAuth **JWT** strategy, 7-day max age (`options.ts:17`) | DIFF — no server-side revocation, no `session->regenerate`, logout only clears the JWT |
| `hash_version = 1` md5 + upgrade to bcrypt | implemented (`password.ts:44-54`), upgrade written with `hashVersion: 2` | MATCH (md5 hex digest compared; bcrypt cost 10 vs PHP `PASSWORD_DEFAULT` cost 10 today — acceptable, note version coupling) |
| reject `deleted != 0` | `if (!row || row.deleted) return null` (`:42`) | MATCH |
| reject unknown hash versions | target `else` branch treats **any** non-1 version as bcrypt — an unknown version would attempt `compare()` instead of failing closed | DIFF (minor) |
| login page heading/labels per theme, gcaptcha, migration UI, `login_form` variants | fixed Tailwind card, hardcoded "Welcome back", "Invalid username or password", default-credentials hint (`login/page.tsx:47-116`) | DIFF — no i18n, no gcaptcha, no migration flow, no `Login.welcome` variants |
| invalid credentials error text `Login.invalid_username_and_password` | `"Invalid username or password"` | DIFF (text) |
| redirect to `home` | `callbackUrl ?? "/"` then `router.push` (`login/page.tsx:10-31`) | DIFF (works only because `(secure)/page.tsx` redirects `/` → `/home`) |
| throttle 5/60s per IP + username, 429 JSON | **none** (no middleware or action rate limit; `src/proxy.ts` only does host + auth checks) | MISSING |
| CSRF on all mutations except login/migrate | no explicit CSRF tokens; relies on Next server-action origin checks and NextAuth's internal CSRF | DIFF (must be stated as a decision, and covered by tests) |
| `IsLoggedIn` AJAX → 401 JSON `{success:false,message:"Session expired. Please log in again."}` | `proxy.ts` redirects even for `fetch`/XHR; `api/customers/suggest` returns `[]` with 401 (`route.ts:6`) | DIFF |
| `no_access` redirect on failed grant | `redirect()` from a server component (307) — equivalent user-visible behaviour, but the URL shape is broken (§9.8) | DIFF |
| login page pre-filled credentials in testing env | absent | DIFF (only matters for tests) |
| `Login::migrate` with credential re-check, 202/401/500 codes | `src/app/api/migrate/route.ts` runs `npm run db:migrate` with no auth check, returns `{ok:true}`/500 | DIFF (unauthenticated migration endpoint; response envelope `ok` vs `success`) |

### 9.11 `src/app/(secure)/home/page.tsx`, `office/page.tsx`, `home/actions.ts`, `change-password/**`

- **Home**: upstream is a module launcher grid driven by `allowed_home_modules`; target renders a metrics dashboard (sales today, items in stock, suspended sales, total items) and four hardcoded quick actions (`home/page.tsx:9-98`). `requirePermission("home")` is **not** called on the page — only inside the unused `getHomeStatsAction` (`home/actions.ts:24-27`, which returns all zeros). So a user without the `home` grant can open `/home` — upstream redirects to `no_access/home`.
- **Office**: upstream is a module grid driven by `allowed_office_modules`; target hardcodes Reports/Settings/POS (`office/page.tsx:4-18`) and has **no permission check at all** (any authenticated user). Upstream requires the `office` grant.
- **Change password**: two implementations:
  - `change-password/actions.ts:9-21` — no `current_password` verification, min length **4**, redirects `/home?changed=1`; no 403 authorization logic (it can only change the caller's own id, so there is no IDOR, but the current-password requirement is missing)
  - `home/actions.ts:10-22` — identical duplicate
  - `employees/actions.ts:91-101` `changePasswordAction(oldPassword, newPassword)` — calls `verifyPassword(oldPassword, emp.password)`, but `verifyPassword(username, password)` looks up an **employee by username** (`password.ts:20-40`), so this call passes the old password as the username and the stored hash as the password → always `null`. The subsequent `if (!verifyPassword(...)) throw` therefore always throws. (Unused by UI but exported.)
  - upstream `Home::postSave` requires `current_password`, verifies with `check_password`, enforces 8 chars, updates `username` too, returns `{success,message,id}` with four distinct messages. Target has none of these.
- **`getHomeStatsAction`** calls `requirePermission("home")` and returns zeros — dead/placeholder.

### 9.12 `src/app/(secure)/employees/**`, `src/components/employees/**`

| Upstream | Target | Verdict |
|---|---|---|
| `getView` rejects when `canModifyEmployee` fails (redirect `no_access/employees/employees`) | edit page only calls `requirePermission("employees")`; no `canModifyEmployee` check (`employees/new/[id]/page.tsx:5-23`) | MISSING — non-admin can open the admin edit form |
| `postSave` enforces `canModifyEmployee` | only `personId === 1 && !isAdmin(current)` (`actions.ts:20-22`) — a non-admin can edit another **admin** (id ≠ 1) | DIFF |
| Delegate only permissions the editor holds; silently drop others | no check — any editor can submit any `grant_*` (`actions.ts:34-41`) | **MISSING (privilege escalation)** |
| Minimum grants `employees,home,office` for self-edit by admin | none | MISSING |
| `DISALLOW_GRANT_CHANGE` / `DISALLOW_PASSWORD_CHANGE` | none | MISSING |
| Reject whole request if any delete target is admin (non-admin deleter) | `deleteEmployeeAction` requires `isAdmin` for **all** deletes and refuses self and id 1 (`actions.ts:66-74`) — stricter in one way (non-admins can never delete) and misses the "admin flag" definition (uses id 1 only) | DIFF |
| Grant checkbox value = permission id, `menu_group_*` select | checkbox default value `"on"`; action accepts `v === "on"`; **no menu_group at all** (`employee-form.tsx:72-77`; `actions.ts:36-40`) | DIFF — the submitted contract is incompatible with upstream form names/values. If any external client posts `grant_x=x`, the target grants nothing |
| Subpermission hierarchy (module → its `_` children with `lang()` labels), module toggle disabling children, "at least one subpermission" validator | flat list of all permissions grouped by module id with raw permission-id labels; no toggle, no validator (`employee-form.tsx:66-79`) | MISSING |
| Language dropdown `code:name` from `get_languages()` + system option; session language update on self-edit | raw `language` and `languageCode` text inputs (`employee-form.tsx:59-60`); action stores them verbatim; no session update | DIFF |
| Username min 5, remote unique check, password min 8, repeat equality | only server-side non-empty `username` and uniqueness (`actions.ts:26-31`); no min length, no repeat field, no remote check | MISSING |
| New employee must have password (server) | yes (`actions.ts:31`) | MATCH |
| Testing-environment placeholder password behaviour | not applicable (no CI testing env) | N/A |
| `hash_version = 2` on new password | yes (`hash` + repo `hashVersion: 2`) | MATCH |
| Employee table columns: id, last_name, first_name, email, phone_number (+ messages) | Name, Username, Email, Language (`employees-table.tsx:20-31`) | DIFF |
| Delete button hidden for admin (based on `isAdmin`, not `id === 1`) | hidden only for `personId === 1` (`employees-table.tsx:38`) | DIFF |
| `getCheckUsername` endpoint | `checkUsernameAction` exists (`actions.ts:86-89`) but no route/UI uses it | MISSING UI |

### 9.13 `src/app/(secure)/customers/actions.ts`, `suppliers/actions.ts`, `employees/actions.ts` — cross-cutting

- all mutations are server actions that `redirect()` on success; callers swallow thrown errors into a local `error` state (`customer-form.tsx:35-38`). This loses the upstream `{success,message,id}` contract and any partial-failure messaging (e.g. CSV).
- `revalidatePath` used on list paths — no equivalent upstream (full page reload after modal submit).
- `hash` imported in `customers/actions.ts:10` and unused.
- `saveSupplierAction` never sets `category`/`taxId` (fields do not exist in the target form).
- `saveEmployeeAction` stores `languageCode`/`language` from free text (`"en"`/`"en-US"` defaults in the form at `employee-form.tsx:59-60`), not from the locale list.

### 9.14 `src/db/seed.ts`

| Upstream seed | Target | Verdict |
|---|---|---|
| 18 modules with sorts 1/10/20/30/40/50/60/70/80/90/98/105/107/108/109/110/900/999 depending on version | 18 modules, **all sort 0 except office 999** (`seed.ts:105-124`) | DIFF — the sort values feed `getAllowedModules`'s inverted filter; fixing rbac without fixing sorts will empty the sidebar |
| `name_lang_key`/`desc_lang_key` are i18n keys (`module_customers`, `module_customers_desc`) | stored **display labels** (`"Customers"`, `"Customers"`) (`seed.ts:106-124`) | DIFF — sidebar renders `m.nameLangKey` directly, so it shows labels; upstream renders `lang('Module.<id>')`. Also `desc_lang_key` must be UNIQUE upstream (`initial_schema.sql:310`) and the target sets duplicate-ish values that happen to be unique |
| 35 permissions incl. `reports_expenses_categories`, `reports_sales_taxes` | 37 incl. a nonexistent `module_home` (`seed.ts:157`), missing `reports_expenses_categories` and `reports_sales_taxes`, extra `reports_expenses` (`:143`), `reports_cashups` (`:147`) | DIFF |
| Admin grants per-permission menu groups (`home`, `office`, `both`, `'--'`) | every permission granted with `menuGroup: "both"` (`seed.ts:216-222`) | DIFF |
| `customers_packages` seeded Default/Bronze/Silver/Gold/Premium | no `customers_packages`; `rewards` empty | MISSING |
| `app_config` includes `customer_reward_enable`, `enforce_privacy`, `suggestions_*`, `login_form`, `gcaptcha_*`, `account_number`, … | `APP_CONFIG_DEFAULTS` (`seed.ts:12-103`) lacks `customer_reward_enable`, `enforce_privacy`, `login_form`, `gcaptcha_site_key`/`secret`, `suggestions_first/second/third_column`, `account_number`, `default_sales_discount_type`, `dateformat` is present (`:36`) | DIFF (config keys are agent-07/02 scope but customer flags are needed here) |
| Admin person id = 1 (first autoincrement) | same (`seed.ts:181-193`) | MATCH (assumed; SQLite re-uses ids after table recreation — a fresh seed is the only supported path) |

### 9.15 `src/proxy.ts`, `src/app/(secure)/layout.tsx`, `src/components/shared/sidebar.tsx`

- `proxy.ts:38-58`: public paths are `/login`, `/api/auth*`, `/api/migrate*`; everything else redirects unauthenticated requests to `/login?callbackUrl=<path>`. There is **no 401 JSON for AJAX** and **no hostname enforcement on non-production** (matches upstream intent), and the production host check returns a plain-text 403 without the upstream's `ALLOWED_HOSTNAMES` boot failure (options.ts:5-10 throws, proxy.ts:8-12 only logs).
- `(secure)/layout.tsx:7-11`: requires `session.user.personId`, calls `getAllowedModules(personId, "both")` — **no menu_group** and no `home/office` split, so the sidebar is a single flat list plus a hardcoded "Office" block (`sidebar.tsx:67-109`).
- `sidebar.tsx:26-44` `ROUTE_MAP` is the only mapping from module id to target route; several entries are target-invented (`attributes`, `expenses`, `taxes`, `cashups`, `home: "/"`). Modules with no entry fall back to `/${moduleId}`.
- Sidebar labels are `m.nameLangKey` (raw DB text), not `lang('Module.<id>')`.
- Sidebar "Office" section lists only `reports` and `config` (`sidebar.tsx:97-105`) regardless of the user's allowed office modules.
- Icons are lucide-react components (`sidebar.tsx:46-65`); upstream uses `public/images/menubar/<module>.svg` (absent from the git tree anyway, `.gitignore:5-6`).

### 9.16 `src/lib/i18n/index.ts` and `src/messages/*`

- `locales = ["en"]` only, messages loaded from `@/messages/<safe>/common.json` (`i18n/index.ts:3-14`).
- `src/messages/en/common.json` is literally `{}` (3 bytes). All People UI strings are hardcoded English in components.
- Upstream ships ~45 locale files (`app/Language/<locale>/…`, `get_languages()` at `app/Helpers/locale_helper.php:52-…`) and every People string is keyed (`Customers.*`, `Suppliers.*`, `Employees.*`, `Login.*`, `Module.*`, `Error.no_permission_module`). Employee `language`/`language_code` only have meaning if this catalogue exists.

---

## 10. Implementation obligations (ordered)

Each obligation states: target file(s), the upstream contract it must satisfy (with citations), and the acceptance test that proves it. "Parity" is judged against upstream behaviour, not against what the current target happens to do.

### O-01 — Grants table identity (foundation for all RBAC)

**Target:** `src/db/schema/auth.ts:48-52`, `src/db/schema/mysql/index.ts:60-66`, `drizzle/sqlite/*` (new migration), `src/db/seed.ts:216-222`.

**Contract:** `grants` is keyed by `(permission_id, person_id)` with `menu_group varchar(32) DEFAULT 'home'` (`initial_schema.sql:407-411`; `3.1.1_to_3.2.0.sql:5-6`). Duplicate rows are impossible. MySQL schema already has the composite PK; SQLite does not.

**Data contract:** `grants(permission_id TEXT NOT NULL, person_id INTEGER NOT NULL, menu_group TEXT NOT NULL DEFAULT 'home', PRIMARY KEY(permission_id, person_id))`.

**Acceptance:** new unit test `src/lib/auth/rbac.test.ts` case: inserting the same `(permission, person)` twice fails or is ignored; `saveEmployee` with a duplicate grant list yields exactly one row per permission.

### O-02 — RBAC primitives exact parity

**Target:** `src/lib/auth/rbac.ts`.

**Contract (must match verbatim):**

1. `isAdmin(personId)`: `personId === 1` OR `hasGrant(module, personId)` for every `ADMIN_MODULES` (`Employee.php:564-577`, `Constants.php:179`). Remove reliance on the Set shortcut only if results are identical (they are; keep or simplify, but do not add a bypass inside `hasGrant`).
2. `hasGrant(permissionId, personId)`: `null` permission → `true`; `null` person → `false`; otherwise exact row, **no admin bypass** (`Employee.php:472-486`). Remove `if (isAdmin(personId)) return true;` (`rbac.ts:34`).
3. `hasModuleGrant(permissionId, personId)`:
   ```
   count = COUNT(grants WHERE permission_id LIKE '<id>%' AND person_id = ?)
   return count !== 1 ? count !== 0 : hasSubpermissions(permissionId)
   ```
   `hasSubpermissions(id) = COUNT(permissions WHERE permission_id LIKE '<id>_%') === 0` (`Employee.php:444-467`). Delete the `perm === moduleId → true` shortcut and the zero-match exact re-query (`rbac.ts:52-68`).
4. `getMenuGroup(permissionId, personId)`: exact row, default `'home'` (`Employee.php:491-506`).
5. `canModifyEmployee(target, current)` exactly as §4.6 (`Employee.php:584-595`).

**Acceptance (mirror `tests/Models/EmployeeTest.php`):**

- `isAdmin(1) === true`
- `isAdmin(2) === true` when every ADMIN_MODULES grant exists (mock `hasGrant`)
- `isAdmin(3) === false` when `config` is missing
- `canModifyEmployee`: self non-admin → true; self admin → true; non-admin → admin → false; admin → non-admin → true; non-admin → non-admin → true
- `hasGrant('employees', 1) === true`; `hasGrant('nonexistent_permission', 1) === false`
- `hasModuleGrant('reports', clerkWithOnlyReportsSales) === false`
- `hasModuleGrant('reports', clerkWith2ReportGrants) === true`
- **`hasModuleGrant('sales', personWithOnlySalesGrant) === false`** (upstream truth; the current target test at `rbac.test.ts:58-62` asserts the opposite and must be changed)
- `hasModuleGrant('customers', personWithCustomersGrant) === true` (module without subpermissions)

### O-03 — `requirePermission` = `Secure_Controller` gate

**Target:** `src/lib/auth/with-permission.ts`.

**Contract:** require `hasModuleGrant(moduleId, personId)` **AND**, when a submodule is supplied, `hasModuleGrant(submoduleId, personId)` (`Secure_Controller.php:44-49`). On failure redirect to `/no_access/<moduleId>` (single segment) or `/no_access/<moduleId>/<submoduleId>` (two segments). Do not short-circuit on `isAdmin` unless the admin definition is applied first (`isAdmin` implies all parent grants, but **not** the submodule requirement — upstream still runs the submodule check for admins; if you keep the short-circuit, document it as a deviation and test that an admin without a submodule grant still passes, which is the upstream result only when the submodule prefix count ≠ 1).

**Also fix the route shape:** add `src/app/(secure)/no_access/[module]/page.tsx` (or change `[submodule]` to an optional catch-all) so single-segment redirects render instead of 404.

**Acceptance:**

- non-admin with `customers` grant can load `/customers`; without it → redirect `/no_access/customers` and that URL returns 200.
- user with only an exact `reports_sales` grant is **denied** `requirePermission("reports")` (upstream: single sub grant → count 1 → hasSubpermissions false → denied).
- `requirePermission("reports","sales")` requires `hasModuleGrant("reports")` and `hasModuleGrant("sales")`.
- unauthenticated → `/login`.

### O-04 — `getAllowedModules` (home/office menus)

**Target:** `src/lib/auth/rbac.ts:73-94`, `src/app/(secure)/layout.tsx:11`, `src/components/shared/sidebar.tsx`, `src/db/seed.ts:105-124`.

**Contract:** two queries matching `Module.php:98-128`: `modules JOIN permissions ON permissions.permission_id = modules.module_id JOIN grants ON permissions.permission_id = grants.permission_id WHERE grants.person_id = ? AND grants.menu_group IN ('home','both'|'office','both') AND modules.sort != 0 ORDER BY modules.sort ASC`. Replace `eq(modules.sort, sql\`0\`)` with `ne(modules.sort, 0)`. Sidebar must be built for the **session's** `menu_group` (`home` on `/home` and its descendants, `office` on `/office`), not for `"both"`.

**Data contract:** `AllowedModule { moduleId, nameLangKey, descLangKey, sort, menuGroup }`.

**Seed obligation:** module sorts must be the upstream values (customers 10, items 20, item_kits 30, suppliers 40, reports 50, receivings 60, sales 70, employees 80, giftcards 90, messages 98, home 1, taxes 105, attributes 107, expenses 108, expenses_categories 109, cashups 110, config 900, office 999/0), otherwise `sort != 0` hides everything.

**Acceptance:** `getAllowedModules(personWithHomeSales, 'home')` contains `sales` with `menuGroup 'home'`; does not contain a module granted only as `office`; admin sees `office` only when session group is office; `sort = 0` modules never appear (`office` after `setShowOfficeGroup(false)`).

### O-05 — Employee model parity (persist layer)

**Target:** consolidate `src/lib/persons/repository.ts:129-185` and `src/lib/employees/repository.ts:125-173` into one employee repository with the upstream semantics, and delete/redirect the duplicate (`employees/repository.ts` should keep only `changePassword`-adjacent helpers or be removed).

**Contract (from `Employee.php:131-246`):**

1. `saveEmployee(personId, personData, employeeData, grants)` in one transaction:
   - new = `personId == null` or person row missing
   - `DISALLOW_GRANT_CHANGE` true + new + non-empty grants → return `false` **without writing**
   - person insert/update; employee insert/update; on insert `person_id` = person id
   - grants: only when `!DISALLOW_GRANT_CHANGE && grants.length > 0`; `DELETE` all then insert `{permissionId, personId, menuGroup}`; **empty array leaves grants untouched**
2. `deleteEmployee(id)`: refuse self (`get_logged_in_employee_info().person_id`); transaction `DELETE grants` + `UPDATE employees SET deleted = 1`.
3. `deleteEmployeeList(ids)`: refuse if self is in the list; bulk grants delete + bulk deleted flag; return transaction status.
4. No restore.

**Data contracts:** `employeeData` may contain `{username, password?, hashVersion?, language?, languageCode?}`; `grants` items are `{permissionId, menuGroup}`.

**Acceptance:**

- new employee with grants when `DISALLOW_GRANT_CHANGE=true` → false and no `employees` row (upstream `testNewEmployeeCreationWithGrantsRejectedWhenGrantChangeDisallowed`, controller `testNewEmployeeCreationWithGrantsFailsWhenGrantChangeDisallowed`).
- existing employee + `DISALLOW_GRANT_CHANGE=true` → save succeeds, **original grants preserved** (upstream `testExistingEmployeeKeepsOriginalGrantsWhenGrantChangeDisallowed`).
- existing employee + grants allowed → grants replaced exactly (upstream `testExistingEmployeeGrantsUpdateWhenGrantChangeAllowed`).
- empty grants array on an existing employee → grants unchanged.
- delete self → false; delete other → grants gone, `deleted = true`.

### O-06 — Employee controller policy

**Target:** `src/app/(secure)/employees/actions.ts`, `src/app/(secure)/employees/new/[id]/page.tsx`.

**Contract:**

1. **View**: `canModifyEmployee(target, current)` false → redirect `no_access/employees/employees` (`Employees.php:82-84`).
2. **Save**: same check → `{success:false, message:"You cannot modify an admin user.", id:-1}` (`Employees.php:121-130`).
3. **Grant delegation**: for each submitted `grant_<permission_id>` (value equal to the permission id), if the editor is not admin and does not hold that permission → drop it silently (`Employees.php:158-170`).
4. **Minimum grants** `["employees","home","office"]` when an admin edits self and any are missing → `{success:false, message:"You cannot remove your own minimum module access grants.", id:employeeId}` (`Employees.php:172-181`).
5. **`DISALLOW_GRANT_CHANGE`** diff: sorted current ids (for non-admins filtered to the editor's own grants) vs sorted submitted ids, unequal → `{success:false, message:"Grant changes are disabled in this demo.", id:employeeId}` (`Employees.php:183-190,262-283`).
6. **Password change disallowed** when `DISALLOW_PASSWORD_CHANGE` and a password is posted → `{success:false, message:"Password changes are disabled in this demo."}` (`Employees.php:192-198`).
7. Password path: hash with bcrypt, `hashVersion = 2`, language parsed from `"<code>:<language>"`; no-password path must not touch the hash; self-edit updates the session language (`Employees.php:200-247`).
8. **Delete**: non-admin may not delete an admin (`isAdmin`, not `id === 1`); non-admin **may** delete non-admins (remove the target's blanket `Admin only` guard); self delete refused (`Employees.php:289-310`, `Employee.php:195-198`).
9. JSON envelope `{success, message, id}` for every mutation; `id` = `-1` on failure, person id on success.

**Acceptance (mirror `tests/Controllers/EmployeesControllerTest.php`):**

- non-admin cannot view `/employees/new/1` → redirect containing `no_access`
- non-admin cannot save `/employees/save/1` → 200 `{success:false, message contains "admin"}`
- non-admin cannot delete admin `ids:["1"]` → `{success:false, message contains "admin"}`
- non-admin cannot grant `config`/`giftcards` it does not hold → those grants absent
- admin can modify any account → success
- admin can delete any non-admin → success
- user can modify own account → success
- admin can grant any permission → success
- `DISALLOW_GRANT_CHANGE=true` and a genuine grant change → `{success:false}`, grants unchanged
- `DISALLOW_GRANT_CHANGE=false` and a grant change → success, exact replacement
- new employee with grants + allowed → row exists + grant exists

### O-07 — Employee form parity

**Target:** `src/components/employees/employee-form.tsx`.

**Contract:**

- fields: first/last/gender (shared block), email/phone/address/city/state/zip/country/comments, username, password, repeat_password, language select (`code:name` from the locale list plus a "System Language" option)
- grants: module checkbox `grant_<module_id>` (value = module id) + `menu_group_<module_id>` select (`home|office|both`, default from `getMenuGroup`), then each `<module>_<suffix>` permission as `grant_<permission_id>` (value = permission id) + hidden `menu_group_<permission_id> = "--"`; children disabled/unchecked when the module is off; validator requires at least one child when a module is on (`employees/form.php:111-194`)
- client rules: username min 5 + remote uniqueness (`employees/checkUsername/<id>`), password min 8 required only for new, repeat equality, email format (`employees/form.php:209-248`)
- permission labels from `lang("Module.<Module>.<suffix>")` with `ucwords(str_replace('_',' '))` fallback (`employees/form.php:136-138`)

**Acceptance:** e2e `e2e/employees.spec.ts` extended: create employee with a module + one subpermission and a menu group; reopen and assert both checked and the group preserved; toggle a module off and assert children disabled; submit module-without-subpermission and assert the error message; username shorter than 5 blocked; password shorter than 8 blocked; password mismatch blocked.

### O-08 — Customer model parity (schema + persistence)

**Target:** `src/db/schema/customers.ts`, `drizzle/sqlite/*` migration, `drizzle/mysql/*`, `src/lib/persons/repository.ts:73-102`, `src/app/(secure)/customers/actions.ts`.

**Contract:**

1. Add columns: `tax_id TEXT NOT NULL DEFAULT ''`, `date INTEGER NOT NULL` (unix ts), `employee_id INTEGER NOT NULL`, `consent INTEGER NOT NULL DEFAULT 0`, `package_id INTEGER NULL REFERENCES customers_packages(package_id)`, `sales_tax_code_id INTEGER NULL REFERENCES tax_codes(tax_code_id)` (already present).
2. Keep `points` nullable to match upstream (`3.0.2_to_3.1.1.sql:122`) or document the NOT NULL deviation; `delete`/privacy path writes `points = null`.
3. `discount` must use a decimal representation, not float (`decimal(15,2)` upstream, `3.2.1_to_3.3.0.sql:28`; target MySQL already `decimal(15,4)`).
4. `saveCustomer(personData, customerData, id)` — transaction; person insert/update first (person id written back); customer insert/update; return the id; **no field may be silently reset to a default when omitted**. If the target keeps a partial `CustomerInput`, the repository must build the SET clause only from provided keys.
5. `getCustomer(id)` must produce an "empty" record for a new id: all person fields `null`, all ints `0`, `person_id = -1` for the PK (`Customer.php:109-126`, `Person.php:102-119`).
6. `get_stats(customerId)` — SQLite equivalent of `Customer.php:132-173`:
   - per-sale aggregate CTE: for the customer, `sale_id`, `AVG(sales_items.discount)`, `SUM(sales_items.quantity_purchased)` (no status filter)
   - totals over `sales ⋈ sales_payments ⋈ per-sale` for `sale_status = 0`: `total = SUM(payment_amount - cash_refund)`, `min`, `max`, `average`, `avg_discount = ROUND(AVG(perSale.avg_discount), totals_decimals)`, `quantity = ROUND(SUM(perSale.quantity), quantity_decimals)`
   - returns `null` when no rows
7. `deleteCustomer(id)` honours `enforce_privacy` exactly as `Customer.php:274-307`; `deleteCustomers(ids)` bulk sets `deleted = 1` only.
8. `adjustRewardPoints(customerId, delta)` — single atomic `UPDATE customers SET points = points ± abs(delta) WHERE person_id = ? [AND points >= abs(delta)]`, return affected > 0.
9. `checkEmailExists(email, excludeId)` scoped to **customers** with `deleted = 0` and `people.email = ?`; empty → false.
10. `checkAccountNumberExists(accountNumber, excludeId)` scoped to **customers** only, no `deleted` filter.
11. `searchCustomers` with `CONCAT(first_name || ' ' || last_name)`, sort whitelist, offset, count-only, `deleted = 0`.
12. `suggestCustomers(search, limit, unique)` shapes `{value, label}` with the exact label format `"first last [company] [phone]"` and the four extra blocks when `unique=false`.

**Acceptance (mirror `tests/Models/CustomerRewardPointsTest.php`):**

- increment 10 + 5 → 15
- 100 − 40 → 60
- 20 − 40 → false, still 20
- 40 − 40 → true, 0
- two concurrent −60 on 100 → exactly one true, final 40
- duplicate email in a non-deleted customer is detected; the same email after soft delete is not
- `getStats` on a customer with 2 completed sales returns total/min/max/average/quantity/avg_discount consistent with the seeded sales; a customer with only suspended sales → `null`
- privacy delete: person fields scrambled, `account_number`/`tax_id` blank, `deleted = 1`

### O-09 — Customer CSV import/export

**Target:** new `src/app/(secure)/customers/csv/route.ts` (template download), `src/app/(secure)/customers/csv-import/page.tsx` or a modal, a server action or `src/app/api/customers/import-csv/route.ts`, and a template asset `public/importCustomers.csv` (or generated bytes).

**Contract:** §8.1–8.3 verbatim, including:

- exact header `First Name,Last Name,Gender,Consent,Email,Phone Number,Address 1,Address2,City,State,Zip,Country,Comments,Company,Account Number,Discount,Discount_Type,Taxable`, **no BOM**, LF
- one sample row `Bob,Smith,1,y,bsmith@nowhere.com,585-555-1111,123 Nowhere Street,Apt 4,Awesome,NY,11111,USA,Awesome guy,,,5,0,y` (272 bytes total for the whole file, including the header line and trailing newline)
- form field name `file_path`; error `UPLOAD_ERR_OK` check → `csv_import_failed`
- skip exactly one row (header); row numbering starts at 1 for **data rows**
- consent empty → row skipped; `sizeof >= 16` gate (or, if you choose a stricter 18 with a documented deviation, add a test)
- email empty allowed, invalid → `"Row n: Invalid email format"` failure entry
- duplicate email/account handling; non-transactional partial import
- messages: `CSV import failed` / `The uploaded file has no data or is incorrectly formatted.` / `{n} customer(s) failed to import on line(s): {list}.` / `Customer import successful.`
- success/failure envelope `{success, message}`

**Acceptance (mirror `tests/Controllers/CustomersCsvImportTest.php`):**

- valid email row imports and is findable by email
- invalid email → `success:false`, message contains `Row 1` and `Invalid email format`, no row imported
- XSS payload in email is sanitized (`<script>` gone) and the row imports
- mixed valid/invalid rows → both valid rows import, invalid one does not, `success:false`
- quoted email `test"user@example.com` sanitized and imported without `"`
- empty email accepted, imported with `email = ''`
- duplicate email across two rows → second fails
- template download is byte-identical to the upstream file (sha256)

### O-10 — Mailchimp on customer save/delete/import

**Target:** `src/app/(secure)/customers/actions.ts`, `src/lib/mailchimp/index.ts`.

**Contract:** after a successful save call `addOrUpdateMember(listId, email, firstName, lastName, status, {vip})` where status is the posted `mailchimp_status` or `""`; call `removeMember(listId, email)` for every deleted customer; call the import variant for imported rows (reproducing the upstream argument bug is not recommended — instead fix it and document the deviation, or mirror it exactly if byte-parity of network calls is required). `addOrUpdateMember` must send `status_if_new: 'subscribed'` and `merge_fields{FNAME,LNAME}` and PUT to `/lists/{id}/members/{md5(lower(email))}` (`Mailchimp_lib.php:323-336`). Target's current signature lacks the `status` parameter and merge-field mapping is caller-supplied (`src/lib/mailchimp/index.ts:64-72`).

**Acceptance:** unit test with a mocked `fetch`: save without status sends `status: ""` (or the fixed equivalent), correct md5 path, `FNAME`/`LNAME`; delete sends DELETE; empty `mailchimp_list_id` performs no call.

### O-11 — Customer/Supplier forms and list parity

**Target:** `src/components/customers/customer-form.tsx`, `customers-table.tsx`, `src/components/suppliers/supplier-form.tsx`, `suppliers-table.tsx`, the corresponding pages.

**Contract:**

- Customer form must expose: consent (required checkbox, default checked when `!enforce_privacy` — `customers/form.php:41`), gender radio (M/F), discount type (percent/fixed), discount, company, account number, tax id, rewards package select (only when `customer_reward_enable`), **disabled** available points, taxable, sales tax code autocomplete + hidden id (only when `use_destination_based_tax`), read-only date (formatted with `dateformat`+`timeformat`), read-only employee name + hidden `employee_id`, comments. New records default date=now and employee=current user (`Customers.php:157-160`).
- Supplier form must expose: company name (required, HTML-decoded), category select (goods/cost, required), agency name, the shared person block, account number, tax id (**text**, not digits-only — the upstream controller's `FILTER_SANITIZE_NUMBER_INT` on `tax_id` is a bug; decide and document).
- Supplier list must filter by category (default goods) and show/translate the category column (`Supplier.php:51-64,306-313`).
- Delete must use `delete_list`/bulk semantics and message `"Could not delete selected …"` on failure; customers additionally remove from Mailchimp.
- Lists must support sort/order/offset/page size and show the upstream columns (customer: id, last, first, email, phone, total spent, messages, edit; supplier: id, company, agency, category, last, first, email, phone, messages, edit).

**Acceptance:** e2e `customers.spec.ts` / `suppliers.spec.ts` extended: create with consent unchecked → blocked; create with tax id/account number persisted and shown after reopen; supplier category cost → appears only when filtering cost; delete removes row; duplicate account number blocked on both forms with the upstream message text.

### O-12 — Auth flow parity

**Target:** `src/lib/auth/options.ts`, `src/lib/auth/password.ts`, `src/app/(auth)/login/page.tsx`, `src/proxy.ts`, `src/app/api/migrate/route.ts`.

**Contract:**

1. `verifyPassword`: `hashVersion === 1` → md5 hex + upgrade to bcrypt + `hashVersion = 2`; `hashVersion === 2` → bcrypt compare; **any other version → reject** (`Employee.php:378-411`).
2. Session regeneration: with NextAuth JWT there is no CI session; if parity of revocation is required, move to a database session (see plan ADR-03) and rotate the session id on login. At minimum document the deviation and expire/rotate the JWT on password change.
3. `login` page: i18n keys (`Login.welcome`, `Login.username`, `Login.password`, `Login.go`, `Login.invalid_username_and_password`, `Login.required_username`, `Login.initialization_required`, `Login.migration_required`, …), optional gcaptcha, optional `login_form` variants (floating labels / input groups), company logo, migration panel behaviour, redirect to `/home`.
4. Throttle `login` and `migrate` POSTs: capacity 5, window 60 s, by IP and lowercased username, HMAC keys, 429 `{success:false, message:"Too many attempts. Please wait a moment and try again."}`; GET never throttled; 0/negative capacity disables.
5. Unauthenticated AJAX → 401 `{success:false, message:"Session expired. Please log in again."}`; unauthenticated navigation → `/login`.
6. `/api/migrate` must require admin credentials when the DB is not a fresh install (401 with `Login.invalid_username_and_password`), return 202 on "already in progress", 500 with the message on failure, and 503 when the connection/version check fails (`Login.php:100-158`).
7. CSRF: keep server-action origin enforcement but document it; add a token check for any new route handler (import CSV, migrate) so mutating endpoints are covered.

**Acceptance (mirror `tests/Controllers/LoginTest.php`):**

- valid credentials → redirect `/home`
- invalid credentials → error text `Invalid username and/or password.`
- 6th failed POST within the window → 429 with the exact message
- 3 failures then a correct login → success
- 10 GETs → all 200, never throttled
- `hash_version = 1` fixture → login succeeds and the row is upgraded to version 2 with a bcrypt hash
- deleted employee → rejected

### O-13 — Home / Office dashboards

**Target:** `src/app/(secure)/home/page.tsx`, `src/app/(secure)/office/page.tsx`.

**Contract:** both pages gate on their module (`requirePermission("home")` / `requirePermission("office")`) and render the upstream module grid for that menu group (welcome heading `Common.welcome_message`, one tile per allowed module with name `lang('Module.<id>')` and description `lang('Module.<id>_desc')`). If the target keeps its dashboard cards/quick actions, they must be **additive** and must not replace the module launcher; every quick action must itself be permission-checked (the target currently links to `/items/new`, `/reports`, `/receivings/register`, `/sales/register` unconditionally).

**Acceptance (update `e2e/home.spec.ts`, `e2e/office.spec.ts`):** user without `home` grant → redirect to `no_access/home`; admin sees a tile per home module; office page for a user without `office` grant → `no_access/office`; tiles navigate to the module root.

### O-14 — Change password parity

**Target:** `src/app/(secure)/change-password/{page,actions}.ts`, `src/app/(secure)/home/actions.ts`, `src/lib/employees/repository.ts`.

**Contract:** single implementation backing `/home/changePassword/<id>` and `POST /home/save/<id>`:

- default id = current user
- non-admin may only target self → 403 body `"You are not authorized to modify this employee."` (GET) / `{success:false,message}` (POST)
- require `current_password`; verify against the **username** in the form with `check_password` (password_verify)
- new password raw `strlen >= 8`
- update `{username, password: bcrypt, hash_version: 2}`
- messages `Employees.current_password_invalid`, `Employees.password_minlength`, `Employees.successful_change_password`, `Employees.unsuccessful_change_password`
- UI: username read-only, current/new/repeat, `notEqualTo` current, equalTo new
- remove the duplicate `home/actions.ts` implementation and the broken `employees/actions.ts` `changePasswordAction` (or fix its argument order and use `verifyPassword(username, oldPassword)`)

**Acceptance (mirror `tests/Controllers/HomeTest.php`):**

- 7-char new password → `{success:false, id:-1}`, password unchanged
- 8 chars accepted, `password_verify` passes, `id` = target
- empty → rejected
- 8 spaces accepted (strlen semantics)
- non-admin GET/POST for admin id → 403 and admin password unchanged
- user can view/change own password
- admin can view/change any password
- default id uses current user
- non-admin cannot view/change another non-admin → 403
- logout works without the `home` grant; non-logout `home` methods still enforce the grant

### O-15 — Rewards-package link on customers

**Target:** `src/db/schema/customers.ts`, `src/lib/rewards/repository.ts` (or a new `customer_rewards` repository), `src/components/customers/customer-form.tsx`, `src/lib/sale/sale-lib.ts:540-560`.

**Contract:** upstream `customers.package_id → customers_packages(package_id)` with `{package_id, package_name, points_percent, deleted}` and `customers.points`, `sales_reward_points{sale_id, earned, used}`, `customer_package` semantics. The target's `rewards`/`customer_rewards` join table is a different model; either re-point it to a package model with `packageName`/`pointsPercent` and a `customers.packageId` FK, or document an intentional deviation with the consequences for `sale-lib` (which currently reads `cust.points` at `src/lib/sale/sale-lib.ts:549`). Gated by `customer_reward_enable` (default `0`, `3.0.2_to_3.1.1.sql:124`), which is missing from `seed.ts`.

**Acceptance:** reward earn on a completed sale = `total * pointsPercent / 100` rounded per the upstream float math; spend uses the atomic decrement and fails with the rewards-insufficient sentinel; points shown read-only in the customer form.

### O-16 — i18n and language fields

**Target:** `src/lib/i18n/index.ts`, `src/messages/**`, `src/components/employees/employee-form.tsx`.

**Contract:** People strings must be keys, not literals: `Customers.*`, `Suppliers.*`, `Employees.*`, `Login.*`, `Module.*`, `Common.first_name/last_name/gender/gender_male/gender_female/email/phone_number/address_1/address_2/city/state/zip/country/comments`, `Error.no_permission_module`, `Error.unknown`. Employee `language`/`language_code` must be selected from `get_languages()` (`locale_helper.php:52-…`, 45 locales) with a "System Language" option, and the value must round-trip as `"<code>:<language>"`.

**Acceptance:** snapshot/unit test asserting the rendered labels match the upstream English strings; employee form options include every upstream locale; saving `de_DE:german` persists both columns and updates the session language on self-edit.

### O-17 — `no_access` page content

**Target:** `src/app/(secure)/no_access/[module]/[submodule]/page.tsx` (+ new single-segment page).

**Contract:** message `"You do not have permission to access the module named" + " " + <translated module name> + (permission ? " (<permission>)" : "")` (`no_access.php:6`), rendered inside the normal shell (sidebar/header), with a working way back. Module name resolution: `Module::get_module_name` → `lang('Module.<id>')` else `lang('Error.unknown')`.

**Acceptance:** navigating to a denied module shows the module's translated name and the permission id; single-segment and two-segment URLs both render.

### O-18 — Seed parity for People

**Target:** `src/db/seed.ts`.

**Contract:** add the missing config keys used here (`customer_reward_enable: "0"`, `enforce_privacy: "0"`, `login_form: ""`, `suggestions_first_column: "name"`, `suggestions_second_column: ""`, `suggestions_third_column: ""`, `account_number: ""`), seed `customers_packages` (Default 0, Bronze 10, Silver 20, Gold 30, Premium 50), fix module sorts, fix the permission list (`reports_expenses_categories`, `reports_sales_taxes` in; `module_home`, `reports_expenses`, `reports_cashups` out unless the target's reports registry uses them — if it does, keep them and log the deviation), and grant the admin the upstream menu groups (`office`/`home` cross, `--` for `sales_delete`/`sales_change_price`).

**Acceptance:** a seeded DB has 18 modules, the exact upstream permission id set, all admin grants with the exact menu groups, and the five reward packages.

### O-19 — Tests to add/repair (consolidated map)

| Upstream test | Target test to create | Covers |
|---|---|---|
| `tests/Models/EmployeeTest.php` | `src/lib/auth/rbac.test.ts` (rewrite) + `src/lib/employees/repository.test.ts` | isAdmin, canModifyEmployee, hasGrant, hasModuleGrant, DISALLOW_GRANT_CHANGE save paths |
| `tests/Controllers/EmployeesControllerTest.php` | `e2e/employees.spec.ts` + route/action unit tests | view/save/delete authorization, delegation, minimum grants, JSON envelope |
| `tests/Controllers/CustomersCsvImportTest.php` | `src/app/api/customers/import-csv/route.test.ts` (or action test) | entire CSV contract |
| `tests/Controllers/LoginTest.php` | `src/lib/auth/login.test.ts` + `e2e/auth.spec.ts` | credentials, throttle 429, GET never throttled, hash upgrade, deleted |
| `tests/Controllers/HomeTest.php` | `src/app/(secure)/change-password/actions.test.ts` + `e2e/home.spec.ts` | raw-length 8, 403 authorization, logout without grant |
| `tests/Models/CustomerRewardPointsTest.php` | `src/lib/persons/repository.rewards.test.ts` | atomic decrement, insufficient points, concurrency |

---

## 11. Unknowns and open questions

1. **Drizzle generated SQL for `eq(modules.sort, sql\`0\`)`** — `node_modules` is absent in the target checkout, so I could not execute a `toSQL()` probe. Reading `drizzle-orm`'s `eq` semantics this compiles to `"modules"."sort" = 0` (selects the hidden modules), which is the inverse of upstream's `sort != 0`. Verify with a unit test once dependencies are installed; the obligation in O-04 assumes the inverse.
2. **PHP `true`→`int` coercion in `Suppliers::getSuggest` / `suggest_search`** — no file declares `strict_types`, so `get_search_suggestions($search, true)` is `limit = 1` and `($search, false)` is `limit = 0` (empty result). If any upstream deployment has `declare(strict_types=1)` added by a fork, behaviour would be a `TypeError` instead. I treat the shipped repo as coercive.
3. **`Customer::get_stats` on a database with only suspended sales** — the temp-table query includes suspended sales but the outer aggregate filters `sale_status = 0`, so the result is `null` (no row) even though `quantity`/`avg_discount` were computed. I assume callers' `empty($stats)` substitution is the intended contract; no test covers this exact case upstream.
4. **`customers.account_number` uniqueness in 3.4.3** — the unique index is dropped by `20230412000001_drop_account_number_index.php`; the parallel `suppliers` unique index remains. Whether the *intent* is "unique per table" or "unique across both tables" is not stated in code. The target's cross-table check is an invention; decide explicitly (O-08/O-11).
5. **Supplier `tax_id` sanitisation** — upstream strips it to digits (`FILTER_SANITIZE_NUMBER_INT`, `Suppliers.php:146`) although the column is `varchar(32)`; no test asserts this. Decide whether to preserve the bug or fix it.
6. **`Employee::$table = 'Employees'`** — capital E. On case-sensitive MySQL filesystems (`lower_case_table_names=0`) this would fail if the actual table is `ospos_employees`. The migrations create `ospos_employees`, so the model likely relies on MySQL's case-insensitive table-name resolution on the default configuration. Not resolvable from source alone.
7. **`points` integer-vs-float truncation** — `adjustRewardPoints` writes a float delta into `int(11)`; MySQL rounds/truncates depending on SQL mode. `CustomerRewardPointsTest` only uses integer deltas. The target must decide whether points are integer or decimal; upstream schema says integer.
8. **Mailchimp behaviour when `mailchimp_list_id` is empty** — every customer save calls the API with `list_id = ''`, which cURL-builds `/lists//members/...` and fails. The method returns `false` silently on no API key (`Mailchimp_lib.php:71-78`). Whether upstream intends "no-op when unconfigured" is unstated; the target should no-op explicitly.
9. **`login_form` config values** — the login view supports `''`/`floating_labels` and `input_groups` (`login.php:107-135`); the config default is absent from the migrations I read (`add_missing_config` may add it). Not verified which values the config UI allows.
10. **`gcaptcha` keys** — `gcaptcha_site_key`/`gcaptcha_secret_key` exist in migrations (`3.0.2_to_3.1.1.sql:311-313`) but the target seed omits them; whether the login page must render reCAPTCHA is therefore a config-parity question for agent 07.
11. **`home`/`office` module grant with `menu_group` `'--'`** — upstream seeds the `office` grant with `menu_group='home'` and the `home` grant with `'office'`, which looks inverted. I report it as-is; no test asserts the intended grouping. The target seed granting "both" everywhere sidesteps it but breaks the sidebar split.
12. **Employee `getInfo` fallback constant `NEW_ITEM`** (`Employee.php:104`) is a different constant that also equals `-1`; harmless, noted for completeness.
13. **Menubar SVG assets** — absent from the upstream git tree (`.gitignore:5-6`); exact icons cannot be reproduced from source. Target uses lucide icons; parity of iconography cannot be byte-verified.
14. **Whether `Home` and `Office` must show the module grid *instead of* the target dashboard** — the plan's ADR-01/ADR-05 allow App Router UX changes, but §7.1 of the plan requires "sidebar uses `get_allowed_home_modules`/`get_allowed_office_modules`". I treat the grid as required content and the extra cards as additive; if the project decides the dashboard replaces the grid, that is a documented deviation, not parity.
15. **`Reports` permission key for the target's `/sales/manage`** — target gates it with `requirePermission("reports","sales")`, upstream `Sales` gates on `sales` only (`Sales.php:49`). This is outside my scope but intersects `requirePermission`; flagged for agent 01/08.




