# 09 — Configuration, Authentication / RBAC, Installation & i18n (Reconstruction Analysis)

**Upstream:** OSPOS 3.4.3 at commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`, `/home/yash/ospos`
**Target:** `/home/yash/Desktop/yash/ospos-nextjs`
**Status of this document:** analysis only. No source file was modified.
**Evidence convention:** upstream paths are relative to `/home/yash/ospos`; target paths are
relative to `/home/yash/Desktop/yash/ospos-nextjs`. Every factual claim carries `path:line`.
Where the target has no counterpart yet, the obligation IDs in §7 are the contract.

---

## Table of contents

0. [Scope, method, definitions](#0-scope-method-definitions)
1. [Configuration system](#1-configuration-system)
   - 1.1 [Storage, PHP-side cache and the settings singleton](#11-storage-php-side-cache-and-the-settings-singleton)
   - 1.2 [UI surface, tabs and dispatch](#12-ui-surface-tabs-and-dispatch)
   - 1.3 [Complete `app_config` key catalog (138 upstream keys)](#13-complete-app_config-key-catalog-138-upstream-keys)
   - 1.4 [Save behaviour and conditional visibility per tab](#14-save-behaviour-and-conditional-visibility-per-tab)
   - 1.5 [Invoice / quote / work-order sequence acquisition](#15-invoice--quote--work-order-sequence-acquisition)
   - 1.6 [File upload, sanitisation and logo rules](#16-file-upload-sanitisation-and-logo-rules)
   - 1.7 [Consumption map / invalidation requirements](#17-consumption-map--invalidation-requirements)
2. [Authentication, RBAC and security](#2-authentication-rbac-and-security)
   - 2.1 [Login / hash upgrade / session regenerate / logout](#21-login--hash-upgrade--session-regenerate--logout)
   - 2.2 [Password change and password policy](#22-password-change-and-password-policy)
   - 2.3 [Exact RBAC SQL semantics](#23-exact-rbac-sql-semantics)
   - 2.4 [Controller guard, menu groups and module lists](#24-controller-guard-menu-groups-and-module-lists)
   - 2.5 [Filters, CSRF, host and secure headers](#25-filters-csrf-host-and-secure-headers)
   - 2.6 [Throttle](#26-throttle)
   - 2.7 [Session storage and encryption key bootstrap](#27-session-storage-and-encryption-key-bootstrap)
3. [Install, upgrade, migration and session mechanics](#3-install-upgrade-migration-and-session-mechanics)
   - 3.1 [Fresh install vs upgrade gate](#31-fresh-install-vs-upgrade-gate)
   - 3.2 [Migration runner, lock and version table](#32-migration-runner-lock-and-version-table)
   - 3.3 [The 47 migrations and destructive steps](#33-the-47-migrations-and-destructive-steps)
   - 3.4 [Migrate route and permission](#34-migrate-route-and-permission)
4. [i18n framework](#4-i18n-framework)
5. [Commands, events and deployment requirements](#5-commands-events-and-deployment-requirements)
6. [Target gap analysis, file by file](#6-target-gap-analysis-file-by-file)
7. [Ordered implementation obligations](#7-ordered-implementation-obligations)
8. [Unknowns](#8-unknowns)

---

## 0. Scope, method, definitions

**Scope actually audited.** Upstream: `app/Controllers/Config.php`, `Login.php`,
`Secure_Controller.php`, `No_access.php`; `app/Models/Appconfig.php`, `Employee.php`,
`Module.php`; `app/Config/{OSPOS,App,Cache,Session,Security,Encryption,Email,Routing,Feature,
Filters,Routes}.php`; all 18 `app/Views/configs/*.php`; `app/Views/partial/{header,footer,
header_js,lang_lines,visibility_js,shortcuts}.php`; `app/Filters/{IsLoggedIn,Throttle}.php`;
`app/Libraries/{MY_Migration,CI3SecretConverter,MY_Language}.php`;
`app/Helpers/{migration_helper,security_helper,locale_helper}.php`;
`app/Commands/*.php`; `app/Events/*.php`; `.env.example` (repo root; the requested
`env/.env.example` does not exist in this checkout); `docker/`; `docs/`; all 47 migration
classes and their SQL scripts; the upstream test suite under `tests/`. The requested
`app/Views/partial/shortcuts.php` does not exist; the only shortcut view is
`app/Views/configs/shortcuts_config.php`, which was read instead.
Target: the whole of `src/lib/config`, `src/lib/auth`, `src/lib/encryption`,
`src/app/(secure)/config`, `src/app/(auth)/login`, `src/app/(secure)/change-password`,
`src/app/(secure)/no_access`, `src/app/api/migrate`, `src/proxy.ts`, `src/db/seed.ts`,
`src/db/schema/config.ts`, `src/lib/i18n`, `src/messages/*/common.json`,
`src/app/api/auth/[...nextauth]/route.ts`, `docker/`, `next.config.ts`, plus tests.
Path corrections: the requested `app/Validation/OSPOSRules.php` is actually
`app/Config/Validation/OSPOSRules.php`; the requested target `auth.ts` does not exist —
`src/lib/auth/options.ts` is the NextAuth configuration module it refers to. Both were read
at their real paths.

**Definitions.**

- **Key** — a row of `ospos_app_config` (`key` PK, `value`). Upstream DDL is
  `key varchar(50) NOT NULL`, `value varchar(500) NOT NULL`, PK `key`
  (`app/Database/Migrations/sqlscripts/initial_schema.sql:5-9`). The target uses
  `text('key').primaryKey()`, `text('value').notNull()` (`src/db/schema/config.ts:3-6`).
- **Tab** — a Bootstrap tab in `app/Views/configs/manage.php:15-52`. There are 12 visible
  tabs; the last one (`system_tab`) nests five sub-tabs (`app/Views/configs/system_config.php:2-8`).
- **Saved** — a POST that reaches `Appconfig::batch_save()`/`save()` and therefore writes
  `app_config`. Display-only fields (printers, licences, system info) are **not** saved.
- **Transient field** — a POST field that is not written to `app_config` (e.g.
  `stock_location_order`, `save_number_locale`, `show_office_group`).
- **Effective key count** — 138 rows is the final migrated database state
  (`docs/reconstruction/11-database.md:1473-1620`). The config UI can additionally create
  `mailchimp_api_key` and `mailchimp_list_id` on first save (`app/Controllers/Config.php:672-700`),
  which are absent from the 138-row list because no migration inserts them (grep of
  `app/Database/Migrations` finds no such insert). So the total *possible* key vocabulary is
  140, of which 138 exist after migrations.
- **"Consumed"** in §1.3 means the upstream runtime reads `$config['key']` (view data),
  `settings['key']` (`Config\OSPOS`), or `config(OSPOS::class)->settings['key']`. It does not
  count translations that happen to reuse the same array key.

**Upstream test anchors referenced in §7:** `tests/Config/*`,
`tests/Models/AppconfigTest.php`, `tests/Controllers/ConfigControllerTest.php`,
`tests/Controllers/LoginTest.php`, `tests/Filters/ThrottleTest.php`,
`tests/Helpers/security_helperTest.php`, `tests/LanguageFilesTest.php`.
(Existence and contents verified in §7; the paths are literal.)

---

## 1. Configuration system

### 1.1 Storage, PHP-side cache and the settings singleton

#### 1.1.1 `Appconfig` model

- Table `app_config`, primary key `key`, no auto-increment, no soft deletes, allowed fields
  `key`,`value` — `app/Models/Appconfig.php:17-24`.
- `exists($key)`: `SELECT ... WHERE key = ?` and true only when exactly one row
  (`Appconfig.php:32-38`).
- `get_all()`: all rows ordered by `key ASC` (`Appconfig.php:45-51`).
- `get_value($key, $default='')`: one row, returns `value` or the caller default
  (`Appconfig.php:58-68`).
- `save($data)` is **single-key only**: it takes the first array key/value, builds
  `['key'=>..., 'value'=>...]`, delegates to `parent::save()`, and on success calls
  `config(OSPOS::class)->update_settings()` (`Appconfig.php:77-90`). A multi-element array
  passed here silently saves only the first element — this is why batch saves exist.
- `batch_save(array $data)`: opens a DB transaction, calls `parent::save()` for every
  key/value, completes the transaction, ANDs in `transStatus()`, and only then refreshes the
  settings singleton **once** (`Appconfig.php:100-119`). Note `$success &= parent::save(...)`
  keeps executing all rows even after a failure; the transaction is the atomicity boundary.
- `delete($id)`: hard delete `WHERE key = ?`; `delete_all()` empties the table
  (`Appconfig.php:128-142`).
- No `updated_at`/`created_at`, no soft delete, no per-key type. Values are opaque strings.

#### 1.1.2 `Config\OSPOS` settings singleton

`Config\OSPOS` is a `BaseConfig` subclass with `public array $settings = []` and
`public string $commit_sha1 = 'dev'` (`app/Config/OSPOS.php:15-19`). Its constructor runs
`set_settings()` (`OSPOS.php:21-26`):

1. Read cache key `settings` (`OSPOS.php:33`).
2. If present, decode it with `decode_array()` and use it verbatim (`OSPOS.php:35-38`).
3. Otherwise connect to the DB, reset the connection's data cache, and if `app_config` does
   **not** exist (fresh pre-migration install) use a hard-coded 6-key default map
   (`OSPOS.php:40-47`, `59-69`):
   `language=english`, `language_code=en`, `company=Home`, `barcode_type=Code39`,
   `invoice_enable=1`, `work_order_enable=0`.
4. Otherwise load every row into `settings[key]=value` and save the array to cache
   (`OSPOS.php:49-53`).
5. On **any** exception, fall back to the same 6 defaults (`OSPOS.php:54-56`).

`update_settings()` deletes cache `settings`, then re-runs `set_settings()` (`OSPOS.php:74-78`).
Cache is CI4's default cache config: handler `file`, backup `dummy`, configured `ttl` 300
(`app/Config/Cache.php:25,36,59`), but the file warns that framework handlers hard-code a
60-second TTL (`app/Config/Cache.php:52-58`). Therefore any write to `app_config` outside
the model (direct SQL, another process) is invisible until the cache entry expires (≈60 s
with the stock file handler; 300 s only if the handler honours the configured TTL); writes
through the model refresh immediately.

**Target equivalent:** `src/lib/config/index.ts:7-17` keeps a process-global
`Map<string,string>` populated by `SELECT * FROM app_config`, with no TTL, no invalidation
across processes, and no negative-cache/`null` distinction. `setConfig` mutates the map
in place (`index.ts:47-54`). There is no default fallback map at all; absent keys yield `""`
or the caller default.

#### 1.1.3 Fresh-install defaults vs migrated defaults

The 6-key fallback is only for a database with no `app_config` table. After migrations, the
138-row catalog in `docs/reconstruction/11-database.md:1480-1620` is authoritative; the
fresh-install `initial_schema.sql:16-85` seeds 69 of those rows, and later migrations insert
the rest. Section 1.3 below reproduces the final values.

### 1.2 UI surface, tabs and dispatch

`Config` extends `Secure_Controller` with module id `config`
(`app/Controllers/Config.php:29-30,48-50`), so the `config` grant (or admin) is required.
Constructor also instantiates `Barcode_lib`, `Sale_lib`, `Receiving_lib`, `Tax_lib`,
`Appconfig`, `Attribute`, `Customer_rewards`, `Dinner_table`, `Module`, `Stock_location`,
`Tax`, reads `config(OSPOS::class)->settings`, connects the DB, and calls `checkEncryption()`
followed by `Services::encrypter()` when it succeeds (`Config.php:52-71`).

`getIndex()` assembles the view model (`Config.php:234-297`): config array, stock locations,
dinner tables, customer rewards, supported barcodes, font list, logo existence/source,
line-sequence / register-mode / invoice-type / keyboard-shortcut / rounding / tax-code /
tax-category / tax-jurisdiction option lists, `show_office_group` from `modules.sort`,
`currency_code`, MySQL server version (via `mysqli_get_server_info`), licences, themes,
image types, encryption-derived Mailchimp state, and Mailchimp lists.

`manage.php` renders 12 tabs (`app/Views/configs/manage.php:15-52`), each including one view:

| # | Tab id | Label key | View |
|---|--------|-----------|------|
| 1 | `info_tab` | `Config.info` | `configs/info_config.php` |
| 2 | `general_tab` | `Config.general` | `configs/general_config.php` |
| 3 | `tax_tab` | `Config.tax` | `configs/tax_config.php` |
| 4 | `locale_tab` | `Config.locale` | `configs/locale_config.php` |
| 5 | `barcode_tab` | `Config.barcode` | `configs/barcode_config.php` |
| 6 | `stock_tab` | `Config.location` | `configs/stock_config.php` |
| 7 | `receipt_tab` | `Config.receipt` | `configs/receipt_config.php` |
| 8 | `invoice_tab` | `Config.invoice` | `configs/invoice_config.php` |
| 9 | `shortcuts_tab` | `Config.shortcuts` | `configs/shortcuts_config.php` |
| 10 | `reward_tab` | `Config.reward` | `configs/reward_config.php` |
| 11 | `table_tab` | `Config.table` | `configs/table_config.php` |
| 12 | `system_tab` | `Config.system_conf` | `configs/system_config.php` (5 sub-tabs) |

`system_config.php` nests: System Info (`system_info.php`), Email (`email_config.php`),
Message/SMS (`message_config.php`), Integrations (`integrations_config.php`), License
(`license_config.php`) — `app/Views/configs/system_config.php:2-15`.

**Save endpoints** (all AJAX POST, all in `Config`):

| Endpoint | Controller method | Tabs served |
|---|---|---|
| `config/saveInfo` | `postSaveInfo` (`Config.php:306`) | info |
| `config/saveGeneral` | `postSaveGeneral` (`Config.php:386`) | general |
| `config/checkNumberLocale` | `postCheckNumberLocale` (`Config.php:457`) | locale (validation probe) |
| `config/saveLocale` | `postSaveLocale` (`Config.php:498`) | locale |
| `config/saveEmail` | `postSaveEmail` (`Config.php:551`) | system/email |
| `config/saveMessage` | `postSaveMessage` (`Config.php:604`) | system/message |
| `config/checkMailchimpApiKey` | `postCheckMailchimpApiKey` (`Config.php:653`) | system/integrations |
| `config/saveMailchimp` | `postSaveMailchimp` (`Config.php:672`) | system/integrations |
| `config/saveLocations` | `postSaveLocations` (`Config.php:771`) | stock |
| `config/saveTables` | `postSaveTables` (`Config.php:904`) | table |
| `config/saveTax` | `postSaveTax` (`Config.php:951`) | tax |
| `config/saveRewards` | `postSaveRewards` (`Config.php:987`) | reward |
| `config/saveBarcode` | `postSaveBarcode` (`Config.php:1041`) | barcode |
| `config/saveReceipt` | `postSaveReceipt` (`Config.php:1073`) | receipt |
| `config/saveShortcuts` | `postSaveShortcuts` (`Config.php:1109`) | shortcuts |
| `config/saveInvoice` | `postSaveInvoice` (`Config.php:1148`) | invoice |
| `config/removeLogo` | `postRemoveLogo` (`Config.php:1191`) | info |
| `config/stockLocations` | `getStockLocations` (`Config.php:708`) | stock reload |
| `config/dinnerTables` | `getDinnerTables` (`Config.php:718`) | table reload |
| `config/customerRewards` | `getCustomerRewards` (`Config.php:744`) | reward reload |

The controller has `protected $helpers = ['security']` (`Config.php:31`), loads
`helper('security')` in the constructor (`Config.php:66`), and therefore has access to
`checkEncryption()` and `sanitize_filename()`.

### 1.3 Complete `app_config` key catalog (138 upstream keys)

Defaults are the **final post-migration** values from
`docs/reconstruction/11-database.md:1480-1620`. "Control" is the rendered HTML control in
the view. "Validation" lists *server-side* rules/coercion first, then client-side rules where
they add constraints. "Enc" = written through CI4 `Encrypter` (see §2.7). "Consumed" gives
the most load-bearing reader(s).

#### 1.3.1 `info` tab — 8 keys

Source view: `app/Views/configs/info_config.php`; saved by `postSaveInfo`
(`app/Controllers/Config.php:306-331`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `company` | `Open Source Point of Sale` | text, required | none server-side; `required` client (`info_config.php:177`) | no | `Views/login.php:24`; `Libraries/Barcode_lib.php:69`; `Views/sales/receipt_default.php:29` |
| `company_logo` | `` (empty) | file upload + filename text; saved only when upload succeeds | `uploaded`, `is_image`, `max_size[..,1024]`, `mime_in[png,jpg,jpeg,gif]`, `ext_in[png,jpg,gif]`, `max_dims[..,800,680]` (`Config.php:345-356`); name sanitised with `sanitize_filename()` (`Config.php:364-374`) | no | `Views/login.php:44-45`; `Views/sales/invoice.php:86-87`; receipts |
| `address` | `123 Nowhere street` | textarea, required | client `required` (`info_config.php:178`) | no | `Views/sales/receipt_default.php:32`; `Views/receivings/receipt.php:48` |
| `website` | `` | text/url | `FILTER_SANITIZE_URL` (`Config.php:317`) | no | invoice/receipt views (e.g. `Views/sales/receipt_default.php`) |
| `email` | `changeme@example.com` | email | `FILTER_SANITIZE_EMAIL` + `strtolower` (`Config.php:315`); client `email` (`info_config.php:180`) | no | invoice/receipt views |
| `phone` | `555-555-5555` | tel, required | client `required` (`info_config.php:179`) | no | `Views/sales/receipt_default.php:33`; `Views/receivings/receipt.php:49` |
| `fax` | `` | tel | none | no | invoice/receipt views |
| `return_policy` | `Test` | textarea, required | client `required` (`info_config.php:181`) | no | `Views/sales/receipt_default.php:168`; `Views/sales/invoice.php:229` |

`company_logo` is also cleared by `postRemoveLogo` → `save(['company_logo'=>''])`
(`Config.php:1191-1196`).

#### 1.3.2 `general` tab — 26 keys

Source view: `app/Views/configs/general_config.php`; saved by `postSaveGeneral`
(`app/Controllers/Config.php:386-449`). `show_office_group` is **not** an `app_config` key:
it calls `Module::set_show_office_group()` which writes `modules.sort` for module `office`
(999 when checked, 0 otherwise) (`Config.php:425`; `app/Models/Module.php:134-147`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `theme` | `flatly` | select from `resources/bootswatch` dirs (`Config.php:212-229`) | server `permit_empty\|themeExists` (`Config.php:388-394`; rule `app/Config/Validation/OSPOSRules.php:193-209`) | no | `Views/partial/header.php:23`; `Views/login.php:29` |
| `login_form` | `` (empty) | select `floating_labels`, `input_groups` (`general_config.php:44-50`) | none; empty means default | no | `Views/login.php:107` |
| `default_sales_discount` | `0` | number 0–100 | `parse_decimals()` (`Config.php:400`); client min/max (`general_config.php:63-64`) | no | sales/report views |
| `default_sales_discount_type` | `0` | checkbox (toggle) | `!= null` → bool, then stored by model as `1`/`0`; UI means 1=currency, 0=percent (`general_config.php:68-78`) | no | `Views/reports/date_input.php:62`; `Views/reports/specific_input.php:37` |
| `default_receivings_discount` | `0` | number 0–100 | `parse_decimals()` (`Config.php:402`) | no | receiving views |
| `default_receivings_discount_type` | `0` | checkbox (toggle) | `!= null` → bool (`Config.php:401`) | no | receiving views |
| `enforce_privacy` | `0` | checkbox | `!= null` → bool (`Config.php:403`) | no | `Models/Customer.php:275`; `Views/customers/form.php:41` |
| `receiving_calculate_average_price` | `` (empty) | checkbox | `!= null` → bool (`Config.php:404`) | no | `Models/Receiving.php:157` |
| `lines_per_page` | `25` | number 10–1000 | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:405`); client min/max + numeric remote (`general_config.php:150-152,477-480`) | no | list/manage views (e.g. `Views/cashups/manage.php:41`) |
| `notify_horizontal_position` | `center` | select `left`,`center`,`right` (`general_config.php:172-177`) | none | no | `Views/partial/header_js.php:30` |
| `notify_vertical_position` | `bottom` | select `top`,`bottom` (`general_config.php:161-166`) | none | no | `Views/partial/header_js.php:31` |
| `image_max_width` | `640` | number 128–3840 | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:408`) | no | image upload code |
| `image_max_height` | `480` | number 128–3840 | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:409`) | no | image upload code |
| `image_max_size` | `128` | number 128–2048 (KiB) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:410`) | no | image upload code |
| `image_allowed_types` | `gif,jpg,png` | multi-select of `jpg,jpeg,gif,svg,webp,bmp,png,tif,tiff` (`Config.php:264-266`); `implode(',', ...)` (`Config.php:411`) | none | no | image upload code |
| `gcaptcha_enable` | `0` | checkbox | `!= null` → bool (`Config.php:412`); login reads it (`Controllers/Login.php:31-33`) | no | `Controllers/Login.php:32`; login view |
| `gcaptcha_site_key` | `` | text (required when enabled) | none server-side; client `required: "#gcaptcha_enable:checked"` (`general_config.php:485-490`) | no | `Views/login.php:139` |
| `gcaptcha_secret_key` | `` | text (required when enabled) | none server-side | no | `Config/Validation/OSPOSRules.php:75` (reCAPTCHA verify) |
| `suggestions_first_column` | `name` | select `name`,`item_number`,`unit_price`,`cost_price` (`general_config.php:308-318`) | `validateSuggestionsColumn(...,'first')` against `Item::ALLOWED_SUGGESTIONS_COLUMNS`, fallback `name` (`Config.php:415,1205-1218`) | no | `Models/Item.php:894` |
| `suggestions_second_column` | `` | select empty + same four (`general_config.php:324-335`) | allowed-with-empty, fallback `''` (`Config.php:416`) | no | `Models/Item.php:899` |
| `suggestions_third_column` | `` | select empty + same four (`general_config.php:341-352`) | allowed-with-empty, fallback `''` (`Config.php:417`) | no | `Models/Item.php:903` |
| `giftcard_number` | `series` | radio `series`,`random` (`general_config.php:360-375`) | none server-side | no | `Controllers/Giftcards.php:100`; `Views/giftcards/form.php:34` |
| `derive_sale_quantity` | `0` | checkbox | `!= null` → bool (`Config.php:419`) | no | `Views/items/form.php:145` |
| `multi_pack_enabled` | `0` | checkbox | `!= null` → bool (`Config.php:420`) | no | `Models/Item.php:932`; `Libraries/Receiving_lib.php:310`; `Helpers/tabular_helper.php:485` |
| `include_hsn` | `0` | checkbox | `!= null` → bool (`Config.php:421`) | no | item/sale forms |
| `category_dropdown` | `` (empty) | checkbox | `!= null` → bool (`Config.php:422`); when true also creates attribute definition id `CATEGORY_DEFINITION_ID` (`Config.php:430-440`) | no | `Views/items/form.php:67` |

**Conditional side-effect (important):** `category_dropdown` is coupled to
`attribute_definitions`. Truthy → `saveDefinition(['definition_name'=>'ospos_category',
'definition_type'=>'DROPDOWN','definition_id'=>CATEGORY_DEFINITION_ID,'deleted'=>0])`;
falsy but `== NO_DEFINITION_ID` → `deleteDefinition(CATEGORY_DEFINITION_ID)`
(`Config.php:429-440`). The whole save runs in one DB transaction and the final success is
`attributeSuccess && batch_save(...) && transStatus()` (`Config.php:427,442-446`).

**Quirk:** `image_allowed_types` is saved with
`implode(',', $this->request->getPost('image_allowed_types'))` (`Config.php:411`). If the
multi-select is empty, `getPost()` returns `null` and PHP 8 throws a `TypeError`
(`implode(): Argument #2 must be of type array, null given`), producing a 500 instead of a
validation error. A faithful port should decide whether to preserve or fix this; the
upstream form defaults to `gif,jpg,png` (`Config.php:266`), so it only bites when the admin
clears every option.

#### 1.3.3 `tax` tab — 10 keys

Source view: `app/Views/configs/tax_config.php`; saved by `postSaveTax`
(`app/Controllers/Config.php:951-978`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `tax_id` | `` | text | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:970`) | no | invoice/tax views |
| `tax_included` | `0` | checkbox | `!= null` → bool (`Config.php:965`) | no | `Models/Sale.php:55`; `Helpers/locale_helper.php:392` |
| `default_tax_1_name` | `` | text, placeholder falls back to `Items.sales_tax_1` (`tax_config.php:49`) | none | no | `Views/items/form.php:227`; `Views/items/form_bulk.php:94` |
| `default_tax_1_rate` | `` (empty) | text + `%` | `parse_tax(FILTER_SANITIZE_NUMBER_FLOAT\|ALLOW_FRACTION)`; negative rejected with `Config.default_tax_rate_non_negative` (`Config.php:953-958`); displayed via `to_tax_decimals` (`tax_config.php:58`) | no | tax calculation (`Models/Sale.php`, `Libraries/Tax_lib.php`) |
| `default_tax_2_name` | `` | text, placeholder `Items.sales_tax_2` (`tax_config.php:72`) | none | no | `Views/items/form.php:250` |
| `default_tax_2_rate` | `` (empty) | text + `%` | `parse_tax`, negative rejected (`Config.php:954-958`) | no | tax calculation |
| `use_destination_based_tax` | `0` | checkbox | `!= null` → bool (`Config.php:966`) | no | `Helpers/tabular_helper.php:437`; `Controllers/Items.php:173` |
| `default_tax_code` | `` | select from `tax_code_options` (`tax_config.php:103-108`) | none | no | `Models/Tax_code.php:261` |
| `default_tax_category` | `Standard` | select from `tax_category_options` (`tax_config.php:115-120`) | none | no | item defaults |
| `default_tax_jurisdiction` | `` | select from `tax_jurisdiction_options` (`tax_config.php:127-132`) | none | no | destination tax |

Client-side visibility: when `use_destination_based_tax` is checked, the three destination
selects are enabled and `tax_included` + both legacy tax name/rate pairs are **disabled**;
when unchecked the reverse (`tax_config.php:150-164`). Disabled fields are still posted with
empty values (browser behaviour), so toggling this setting can blank the other group unless
the user re-enters it. This is upstream behaviour to preserve or deliberately fix.

#### 1.3.4 `locale` tab — 18 keys

Source view: `app/Views/configs/locale_config.php`; saved by `postSaveLocale`
(`app/Controllers/Config.php:498-542`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `number_locale` | `en_US` | text | `required` server-side (`Config.php:501`); ICU `NumberFormatter` probe (`Config.php:457-489`); client remote (`locale_config.php:358-389`) | no | `Helpers/locale_helper.php:302` |
| `thousands_separator` | `1` | checkbox | `!= null` → bool (`Config.php:524`) | no | `Helpers/locale_helper.php:446` |
| `currency_symbol` | `$` | text | `htmlspecialchars()` applied (`Config.php:517`) | no | `Helpers/locale_helper.php:303` |
| `currency_code` | `` | text (ISO 4217) | none | no | `Helpers/locale_helper.php`; locale probe returns it (`Config.php:468`) |
| `currency_decimals` | `2` | select `0`,`1`,`2` (`locale_config.php:79-88`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:526`) | no | `Helpers/locale_helper.php:325` |
| `tax_decimals` | `2` | select `0`–`4` (`locale_config.php:95-106`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:527`) | no | `Helpers/locale_helper.php:343` |
| `quantity_decimals` | `0` | select `0`–`3` (`locale_config.php:113-124`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:528`) | no | `Helpers/locale_helper.php:316` |
| `cash_decimals` | `2` | select `-1`,`0`,`1`,`2` (`locale_config.php:130-140`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:534`) | no | `Helpers/locale_helper.php:334` |
| `cash_rounding_code` | `0` | select from `rounding_mode::get_rounding_options()` (`Config.php:249`) | none | no | cash rounding |
| `payment_options_order` | `cashdebitcredit` | select `cashdebitcredit`, `debitcreditcash`, `debitcashcredit`, `creditdebitcash`, `creditcashdebit` (`locale_config.php:164-175`) | none | no | `Helpers/locale_helper.php:246` |
| `country_codes` | `us` | text | `htmlspecialchars()` (`Config.php:529`) | no | `Helpers/locale_helper.php:272`; customer form |
| `language` | `english` | select from `get_languages()` (`locale_config.php:219-224`) | must be a key of `get_languages()` (`Config.php:509-512`); value posted as `code:name`, split on `:` (`Config.php:514-520`) | no | `Events/Load_config.php:52`; `Helpers/locale_helper.php:46` |
| `language_code` | `en` | hidden/derived (`code` half of the language select) | derived from split, not independent input (`Config.php:514,519`) | no | `Events/Load_config.php:49`; `Helpers/locale_helper.php:25` |
| `timezone` | `America/New_York` | select from `get_timezones()` (`locale_config.php:231-236`) | none | no | `Events/Load_config.php:42` |
| `dateformat` | `m/d/Y` | select from `get_dateformats()` (`locale_config.php:243-248`) | none | no | `Helpers/locale_helper.php:353` |
| `timeformat` | `H:i:s` | select from `get_timeformats()` (`locale_config.php:250-256`) | none | no | `Helpers/locale_helper.php:363` |
| `date_or_time_format` | `` (empty) | checkbox | `!= null` → bool (`Config.php:533`) | no | `Models/Cashup.php:139`; `Models/Item.php:335` |
| `financial_year` | `1` | select `1`–`12` (`locale_config.php:275-293`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:536`) | no | `Views/partial/daterangepicker.php:59` |

Additional locale fields that are **not** keys:

- `payment_reference_code_min` / `payment_reference_code_max` are posted and validated
  (`required|integer|greater_than[0]`, `required|integer|gte_field[...]` —
  `Config.php:500-507`) but are **not** inserted by any migration and **not** in the 138-row
  catalog. In a clean install `postSaveLocale` will insert them on first save (because
  `batch_save` uses `parent::save()` which upserts by PK). The views default them to 3 and
  40 (`locale_config.php:186-192`).
- `save_number_locale` is a hidden helper for the ICU probe (`locale_config.php:26`).

#### 1.3.5 `barcode` tab — 15 keys

Source view: `app/Views/configs/barcode_config.php`; saved by `postSaveBarcode`
(`app/Controllers/Config.php:1041-1064`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `barcode_type` | `C39` | select from `Barcode_lib::get_list_barcodes()` (`Config.php:240`); e.g. `C39`, `C128`, `EAN13`, `UPCA` | none | no | `Libraries/Barcode_lib.php:71` |
| `barcode_width` | `250` | number 60–350 step 5 (`barcode_config.php:31-40`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1045`) | no | `Libraries/Barcode_lib.php:75` |
| `barcode_height` | `50` | number 10–120 (`barcode_config.php:47-55`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1046`) | no | `Libraries/Barcode_lib.php:74` |
| `barcode_font` | `Arial` | select from `Barcode_lib::listfonts('fonts')` (`Config.php:241`) | none | no | `Libraries/Barcode_lib.php:72` |
| `barcode_font_size` | `10` | number 1–30 (`barcode_config.php:70-78`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1048`) | no | `Libraries/Barcode_lib.php:73` |
| `allow_duplicate_barcodes` | `0` | checkbox | `!= null` → bool (`Config.php:1056`) | no | `Models/Item.php:96`; `Models/Item_kit.php:66` |
| `barcode_content` | `id` | radio `id`,`number` (`barcode_config.php:101-116`) | none | no | `Libraries/Barcode_lib.php:70` |
| `barcode_generate_if_empty` | `0` | checkbox (`barcode_config.php:120-125`) | `!= null` → bool (`Config.php:1055`) | no | `Libraries/Barcode_lib.php:82` |
| `barcode_formats` | `[]` | multi-select/tagsinput (`barcode_config.php:133-141`) | `json_encode(post array)` (`Config.php:1058`) | no | `Libraries/Barcode_lib.php:83`; `Libraries/Token_lib.php:172` |
| `barcode_first_row` | `category` | select `not_show`,`name`,`category`,`cost_price`,`unit_price`,`company_name` (`barcode_config.php:150-162`) | none | no | `Libraries/Barcode_lib.php:76` |
| `barcode_second_row` | `item_code` | same + `item_code` (`barcode_config.php:168-181`) | none | no | `Libraries/Barcode_lib.php:77` |
| `barcode_third_row` | `unit_price` | same + `item_code` (`barcode_config.php:187-200`) | none | no | `Libraries/Barcode_lib.php:78` |
| `barcode_num_in_row` | `2` | number | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1052`) | no | `Libraries/Barcode_lib.php:79` |
| `barcode_page_width` | `100` | number 0–100 (%) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1053`) | no | `Libraries/Barcode_lib.php:80` |
| `barcode_page_cellspacing` | `20` | number (px) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1054`) | no | `Libraries/Barcode_lib.php:81` |

Note: `barcode_formats` is the only key where the UI posts an array and stores JSON; readers
must `json_decode` it (`barcode_config.php:134`). If the multi-select is empty the field is
absent, `getPost()` returns `null`, and `json_encode(null)` stores the literal string
`null` rather than `[]` (`Config.php:1058`). The upstream reader
(`config('OSPOS')->settings['barcode_formats']` + `json_decode`) then gets `null`, which the
form treats as an empty option list (`barcode_config.php:134-140`).

#### 1.3.6 `stock` tab — 0 `app_config` keys

The stock tab edits the `stock_locations` table, not `app_config`
(`app/Views/configs/stock_config.php:7-33`; `postSaveLocations`,
`app/Controllers/Config.php:771-801`). POST fields are `stock_location[<id>]`,
`stock_location_new[]`, `stock_location_order` (comma-separated ids / `new-N` tokens), and
`stock_location_default`. Semantics:

- `stock_location_order` is built client-side from the DOM order
  (`stock_config.php:84-101`).
- Existing locations are saved with `Stock_location::saveValue($data,$id)`;
  empty name means "keep the row but skip name update" (`Config.php:836-850`).
- Removed locations are deleted **before** saves so a reused name cannot collide with the old
  permission id (`Config.php:785-790`; comment at `:787`).
- New rows are inserted with `NEW_ENTRY`; inserted ids then resolve `new-N` tokens in
  submission order (`Config.php:871-885`).
- Default location is applied only if it is in the surviving id set (`Config.php:891-894`).
- Every successful add/rename clears sale and receiving session state
  (`Config.php:849,865`; `_clear_session_state` at `:754-763`).
- Duplicate and underscore-in-name rules are client-side only
  (`stock_config.php:105-117`); the server trims names (`Config.php:806-818`) but does not
  enforce uniqueness.

#### 1.3.7 `receipt` tab — 18 keys

Source view: `app/Views/configs/receipt_config.php`; saved by `postSaveReceipt`
(`app/Controllers/Config.php:1073-1101`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `receipt_template` | `receipt_default` | select `receipt_default`,`receipt_short` (`receipt_config.php:19-24`) | server whitelist `Sale_lib::isValidReceiptTemplate()`, fallback `receipt_default` (`Config.php:1076-1078`) | no | receipt rendering |
| `receipt_font_size` | `12` | number 0–20 px (`receipt_config.php:33-41`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1079`) | no | `Views/sales/receipt_default.php:20` |
| `print_delay_autoreturn` | `0` | number 0–30 s (`receipt_config.php:51-59`) | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1080`) | no | `Views/partial/print_receipt.php:66` |
| `email_receipt_check_behaviour` | `last` | radio `always`,`never`,`last` (`receipt_config.php:68-91`) | none (not whitelisted server-side) | no | sale email flow |
| `print_receipt_check_behaviour` | `last` | radio `always`,`never`,`last` (`receipt_config.php:98-121`) | none | no | sale print flow |
| `receipt_show_company_name` | `1` | checkbox | `!= null` → bool (`Config.php:1083`) | no | `Views/sales/receivings`/invoice headers |
| `receipt_show_taxes` | `0` | checkbox | `!= null` → bool (`Config.php:1084`) | no | `Views/sales/receipt_default.php:110` |
| `receipt_show_tax_ind` | `0` | checkbox | `!= null` → bool (`Config.php:1085`) | no | `Views/sales/receipt_default.php:58` |
| `receipt_show_total_discount` | `1` | checkbox | `!= null` → bool (`Config.php:1086`) | no | `Views/sales/receipt_default.php:70` |
| `receipt_show_description` | `1` | checkbox | `!= null` → bool (`Config.php:1087`) | no | `Views/sales/receipt_default.php:76` |
| `receipt_show_serialnumber` | `1` | checkbox | `!= null` → bool (`Config.php:1088`) | no | `Views/sales/receipt_default.php:80` |
| `print_silently` | `1` | checkbox | `!= null` → bool (`Config.php:1089`) | no | `Views/partial/print_receipt.php:43` |
| `print_header` | `0` | checkbox | `!= null` → bool (`Config.php:1090`) | no | `Views/partial/print_receipt.php:19` |
| `print_footer` | `0` | checkbox | `!= null` → bool (`Config.php:1091`) | no | `Views/partial/print_receipt.php:25` |
| `print_top_margin` | `0` | number 0–20 px | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1092`) | no | `Views/partial/print_receipt.php:14` |
| `print_left_margin` | `0` | number 0–20 px | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1093`) | no | `Views/partial/print_receipt.php:15` |
| `print_bottom_margin` | `0` | number 0–20 px | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1094`) | no | `Views/partial/print_receipt.php:16` |
| `print_right_margin` | `0` | number 0–20 px | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1095`) | no | `Views/partial/print_receipt.php:17` |

`receipt_printer`, `invoice_printer`, `takings_printer` are **display-only**: they are
populated from `jsPrintSetup` inside the browser and persisted in `localStorage`, never
POSTed to the server (`receipt_config.php:234-252,340-361`). They are listed in the form but
`postSaveReceipt` ignores them.

#### 1.3.8 `invoice` tab — 14 keys

Source view: `app/Views/configs/invoice_config.php`; saved by `postSaveInvoice`
(`app/Controllers/Config.php:1148-1182`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `invoice_enable` | `1` | checkbox | `!= null` → bool (`Config.php:1151`); after save, sets sale mode to `default_register_mode` or `sale` (`Config.php:1171-1179`) | no | `Helpers/tabular_helper.php:83`; `Models/Sale.php:425` |
| `invoice_type` | `invoice` | select from `Sale_lib::get_invoice_type_options()` (`Config.php:246`); observed values `invoice`,`tax_invoice`,`custom_invoice`,`custom_tax_invoice` | server whitelist `Sale_lib::isValidInvoiceType()`, fallback `invoice` (`Config.php:1164-1166`) | no | invoice selection |
| `recv_invoice_format` | `{CO}` | text | none | no | receiving invoice numbers |
| `invoice_default_comments` | `This is a default comment` | textarea | none | no | `Views/sales/invoice.php:227` |
| `invoice_email_message` | `Dear {CU}, In attachment the receipt for sale {ISEQ}` | textarea | none | no | invoice email |
| `line_sequence` | `0` | select from `Sale_lib::get_line_sequence_options()` (`Config.php:244`) | none | no | `Models/Sale.php:915` |
| `sales_invoice_format` | `{CO}` | text | none | no | invoice number formatting |
| `last_used_invoice_number` | `0` | number | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1158`); manual reset point | no | `Models/Appconfig.php:150` |
| `sales_quote_format` | `Q%y{QSEQ:6}` | text | none | no | quote number formatting |
| `last_used_quote_number` | `0` | number | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1159`) | no | `Models/Appconfig.php:165` |
| `quote_default_comments` | `This is a default quote comment` | textarea | none | no | `Views/sales/quote.php:198` |
| `work_order_enable` | `0` | checkbox | `!= null` → bool (`Config.php:1161`) | no | work-order flow |
| `work_order_format` | `W%y{WSEQ:6}` | text | none | no | work-order formatting |
| `last_used_work_order_number` | `0` | number | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:1163`) | no | `Models/Appconfig.php:180` |

Conditional visibility (client only): all invoice fields are disabled when `invoice_enable`
is off; `work_order_format` and `last_used_work_order_number` are additionally disabled when
`work_order_enable` is off; unchecking invoice also unchecks work order
(`invoice_config.php:204-227`). `beforeSerialize` re-enables everything so disabled values
are submitted (`:233-238`).

#### 1.3.9 `shortcuts` tab — 10 keys

Source view: `app/Views/configs/shortcuts_config.php`; saved by `postSaveShortcuts`
(`app/Controllers/Config.php:1109-1139`). Keys are built as `key_<name>` for the fixed name
list `cancel, items, customers, suspend, suspended, amount, payment, complete, finish, help`
(`shortcuts_config.php:12-23`).

| Key | Default | Control | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `key_cancel` | `27 \| ESC` | select from `Sale_lib::getKeyShortcutsOptions()` | must be in allowed option keys else keep current (`Config.php:1118-1120`) | no | `Sale_lib::getKeyShortcuts()` |
| `key_items` | `49 \| ALT + 1` | select | same | no | same |
| `key_customers` | `50 \| ALT + 2` | select | same | no | same |
| `key_suspend` | `51 \| ALT + 3` | select | same | no | same |
| `key_suspended` | `52 \| ALT + 4` | select | same | no | same |
| `key_amount` | `53 \| ALT + 5` | select | same | no | same |
| `key_payment` | `54 \| ALT + 6` | select | same | no | same |
| `key_complete` | `55 \| ALT + 7` | select | same | no | same |
| `key_finish` | `56 \| ALT + 8` | select | same | no | same |
| `key_help` | `57 \| ALT + 9` | select | same | no | same |

Uniqueness: after coercion the method rejects duplicate binding values
(`array_count_values > 1`) with `Config.shortcuts_duplicate_bindings`
(`Config.php:1125-1131`). Empty/unknown values fall back to the current stored value.
Note the stored literal includes the human-readable suffix (`"27 | ESC"`), and
`Sale_lib::getKeyShortcuts()` splits it (see §1.6/§4).

#### 1.3.10 `reward` tab — 1 key + child table

`customer_reward_enable` default `0`; checkbox (`reward_config.php:15-25`);
`!= null` → bool (`Config.php:991`). Consumed by `Models/Sale.php:1417`;
`Views/customers/form.php:122`; `Views/reports/tabular_details.php:43`.
The tab also CRUDs `customers_packages` rows from `customer_reward_<id>` and
`reward_points_<id>` POST fields, deleting packages absent from the POST when enabled
(`Config.php:987-1032`). All of it is inside one transaction.

#### 1.3.11 `table` tab — 1 key + child table

`dinner_table_enable` default `0`; checkbox (`table_config.php:15-25`);
`!= null` → bool (`Config.php:908`). Consumed by `Models/Sale.php:688`;
`Views/sales/register.php:80`; `Views/sales/suspended.php:25`.
The tab CRUDs `dinner_tables` from `dinner_table_<id>` fields and deletes rows absent from
the POST when enabled (`Config.php:904-942`).

#### 1.3.12 system → `email` sub-tab — 8 keys

Source view: `app/Views/configs/email_config.php`; saved by `postSaveEmail`
(`app/Controllers/Config.php:551-595`).

| Key | Default | Control (allowed values) | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `protocol` | `mail` | select `mail`,`sendmail`,`smtp` (`email_config.php:18-28`) | none (controls mailpath rule) | no | email library selection |
| `mailpath` | `/usr/sbin/sendmail` | text | if protocol == `sendmail`: `required\|valid_path_strict`; otherwise `permit_empty\|valid_path_strict` (`Config.php:564-575`). `valid_path_strict` allows only `[A-Za-z0-9_\-/.: \]` (`OSPOSRules.php:269-276`) | no | sendmail invocation |
| `smtp_host` | `` | text | none | no | SMTP |
| `smtp_port` | `465` | number | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:587`) | no | SMTP |
| `smtp_crypto` | `ssl` | select `` , `tls`, `ssl` (`email_config.php:71-80`) | none | no | SMTP |
| `smtp_timeout` | `5` | number | `FILTER_SANITIZE_NUMBER_INT` (`Config.php:588`) | no | SMTP |
| `smtp_user` | `` | text | none | no | SMTP |
| `smtp_pass` | `` | password, never re-displayed | if `checkEncryption()` and posted non-empty → `encrypter->encrypt()`; otherwise preserve existing ciphertext (`Config.php:553-559`) | **yes** | `Libraries/Email_lib` |

Client-side conditional: with `sendmail` only `mailpath` is enabled; with `smtp` all SMTP
fields plus password are enabled; with `mail` all are disabled (`email_config.php:145-158`).
The form is `multipart/form-data` but no file is used (`email_config.php:8`).

#### 1.3.13 system → `message` sub-tab — 4 keys

Source view: `app/Views/configs/message_config.php`; saved by `postSaveMessage`
(`app/Controllers/Config.php:604-624`).

| Key | Default | Control | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `msg_uid` | `` | text, required | client `required` (`message_config.php:99`); no server rule | no | `Libraries/Sms_lib.php:34` |
| `msg_pwd` | `` | password | posted non-empty + `checkEncryption()` → encrypted, else preserve (`Config.php:606-612`) | **yes** | `Libraries/Sms_lib.php:29` |
| `msg_src` | `` | text, required | client `required` (`message_config.php:100`); UI falls back to `company` when empty (`message_config.php:60`) | no | `Libraries/Sms_lib.php:35` |
| `msg_msg` | `` | textarea | none | no | `Views/messages/form_sms.php:42` |

#### 1.3.14 system → `integrations` sub-tab — 2 keys (not in the 138-row catalog)

Source view: `app/Views/configs/integrations_config.php`; saved by
`postSaveMailchimp` (`app/Controllers/Config.php:672-700`).

| Key | Default | Control | Validation / coercion | Enc | Consumed |
|---|---|---|---|---|---|
| `mailchimp_api_key` | absent (empty on read) | password | if `checkEncryption()`: non-empty → encrypt, empty → preserve (`Config.php:677-684`) | **yes** | `Libraries/Mailchimp_lib` |
| `mailchimp_list_id` | absent (empty on read) | select populated by API probe | `checkEncryption()` → non-empty → encrypt, empty → preserve (`Config.php:682-684`) | **yes** | Mailchimp subscribe flow |

`getIndex()` decrypts `mailchimp_list_id` for display (`Config.php:282-284`) and only
exposes `api_key_set` (never the key itself) (`Config.php:279-281`). When encryption is
unavailable it shows empty values (`Config.php:288-292`). It also calls `removeBackup()`
after use (`Config.php:287`) — a side effect of the key-migration helper (§2.7).

#### 1.3.15 system → `license` and `system_info` — 0 keys

`license_config.php` renders read-only textareas for `license/*.version` + `*.license`,
plus Composer/npm licence JSON, assembled by `_licenses()` (`Config.php:77-206`). It has no
save endpoint (`license_config.php:7` posts to `''`). `system_info.php` renders server
diagnostics and writability/security checks (`system_info.php:11-190`) — also no keys.
`system_info` computes `dbVersion` with `mysqli_get_server_info()` (`Config.php:255`), so it
is MySQL-specific despite the target SQLite support.

#### 1.3.16 Keys present in the 138-row catalog but not editable in the UI — 5 keys

| Key | Default | Why it exists | Consumed |
|---|---|---|---|
| `account_number` | `` | inserted by `20230412000000_add_missing_config.php:16`; comment says "used in Sales" | sales/customer search paths |
| `payment_message` | `` | same migration `:23` | `Views/sales/invoice.php:226`; `Views/sales/quote_email.php:146` |
| `default_register_mode` | `sale` | `sqlscripts/3.0.2_to_3.1.1.sql:68` | `Config.php:1175` (mode reset after invoice save); sale register |
| `default_tax_rate` | `8` | legacy `initial_schema.sql:18` | legacy/default tax fallback |
| `statistics` | `1` | `initial_schema.sql:83`; privacy/statistics flag | (no runtime `$config` read found; see §8) |

#### 1.3.17 Value-type summary and traps

- Boolean keys are stored by `Appconfig::save()` as PHP `true`/`false`, not `'1'`/`'0'`.
  CI4's model converts them to `1`/`0` in the database for MySQL/SQLite. Readers compare
  `== 1` (e.g. `general_config.php:121`), so a stored empty string or `'true'` behaves as
  false; the target's `getConfigBool()` accepts `"1"` and `"true"`/`"TRUE"`
  (`src/lib/config/index.ts:23-27`), which is *more* permissive than upstream.
- `$this->request->getPost('x') != null` means "field present in POST", not "field truthy".
  A checkbox that is unchecked simply is not posted, so the key becomes `false`. This is why
  every checkbox save path must be paired with a form that posts all fields of the tab.
- `FILTER_SANITIZE_NUMBER_INT` strips grouping separators and non-digits; e.g. a decimal
  discount is *not* sanitised with it (only numeric-int fields are), while discounts use
  `parse_decimals()`.
- `htmlspecialchars()` is applied only to `currency_symbol` and `country_codes`
  (`Config.php:517,529`). Other free-text fields are stored raw and escaped at render time
  (e.g. `esc($config['company'])`).

### 1.4 Save behaviour and conditional visibility per tab

#### 1.4.1 Cross-cutting save contract

Every save endpoint is a POST that returns JSON `{success: bool, message: string}`
(e.g. `app/Controllers/Config.php:330,448,541,594,623,699,800,941,977,1031,1063,1100,1138,1181`).
The message is `lang('Config.saved_successfully')` or `...saved_unsuccessfully`
(`Config.php:327,448,541,...`). There is no redirect and no HTML error page.

Request processing order for these endpoints:

1. `Secure_Controller::__construct('config')` checks the `config` module grant and throws
   `RedirectException("no_access/config/")` when absent (`app/Controllers/Secure_Controller.php:43-49`).
2. `isLoggedIn` global filter runs for all paths except `login|migrate`
   (`app/Config/Filters.php:77-83`); an AJAX request without a session gets HTTP 401 JSON
   (`app/Filters/IsLoggedIn.php:17-25`).
3. `csrf` filter runs globally except `login|migrate` (`Filters.php:80-81`), token name
   `csrf_ospos_v4`, session mode, no regeneration, redirect on failure only in production
   (`app/Config/Security.php:18,27,36,74,85`).
4. The controller validates a subset of fields and coerces everything else with
   `FILTER_SANITIZE_NUMBER_INT` or `parse_decimals()`; see the per-tab tables in §1.3.
5. `Appconfig::batch_save()` wraps writes in a transaction and refreshes the settings
   cache exactly once (`app/Models/Appconfig.php:100-119`).
6. Some tabs wrap an **outer** transaction as well (general, stock, table, rewards), so the
   config rows and child-table rows commit together (`Config.php:427-446,783-798,906-939,989-1029`).

CSRF token plumbing is client-side: `partial/header_js.php` monkey-patches `$.ajax` to add
`csrf_ospos_v4` to every POST, refreshes hidden inputs on `ajaxComplete`, and redirects to
`/login` on any 401 (`app/Views/partial/header_js.php:37-62,80-90`). Therefore a non-JS POST
from a page other than login will be rejected by the CSRF filter in production.

#### 1.4.2 Per-tab save semantics

| Tab | Endpoint | Writes | Atomicity | Post-save side effects |
|---|---|---|---|---|
| info | `saveInfo` | 8 keys (+ logo rename) | one `batch_save` | logo file moved into `public/uploads/`; upload failure still saves text fields but reports failure (`Config.php:306-331`) |
| general | `saveGeneral` | 26 keys | outer transaction + `batch_save` | `modules.sort` for `office`; create/delete `attribute_definitions` row `CATEGORY_DEFINITION_ID` (`Config.php:425-446`) |
| locale | `saveLocale` | 18 keys + optional `payment_reference_code_min/max` | one `batch_save` | none |
| tax | `saveTax` | 10 keys | one `batch_save` | none |
| barcode | `saveBarcode` | 15 keys | one `batch_save` | none |
| stock | `saveLocations` | `stock_locations` only | outer transaction | deletes, inserts, reorder, default; clears sale/receiving session state per changed row (`Config.php:785-894`) |
| receipt | `saveReceipt` | 18 keys | one `batch_save` | none |
| invoice | `saveInvoice` | 14 keys | one `batch_save` | on success sets sale register mode from `default_register_mode` when invoicing is enabled, else `sale` (`Config.php:1171-1179`) |
| shortcuts | `saveShortcuts` | 10 `key_*` keys | one `batch_save` | rejects duplicate bindings; unknown values revert to current (`Config.php:1109-1139`) |
| reward | `saveRewards` | `customer_reward_enable` + `customers_packages` | outer transaction | deletes packages absent from POST when enabled (`Config.php:987-1032`) |
| table | `saveTables` | `dinner_table_enable` + `dinner_tables` | outer transaction | deletes tables absent from POST when enabled; clears session state per saved table (`Config.php:904-942`) |
| email | `saveEmail` | 8 keys | one `batch_save` | encrypts non-empty `smtp_pass`; otherwise preserves ciphertext (`Config.php:551-595`) |
| message | `saveMessage` | 4 keys | one `batch_save` | encrypts non-empty `msg_pwd`; otherwise preserves ciphertext (`Config.php:604-624`) |
| integrations | `saveMailchimp` | 2 keys (created on first save) | one `batch_save` | encrypts non-empty key/list id when encryption is available (`Config.php:672-700`) |
| license/system info | — | nothing | — | read-only (`license_config.php:7`; `system_info.php:11`) |

**Upstream has no "sales" tab.** The target's `sales` tab
(`src/lib/config/tabs.ts:67-78`) mixes keys that upstream saves from three different tabs:
`default_sales_discount`/`lines_per_page` (general, `app/Views/configs/general_config.php:54-155`),
`payment_options_order`/`cash_rounding_code` (locale, `locale_config.php:149-177`), and
`dinner_table_enable`/`multi_pack_enabled` (table/general,
`table_config.php:15-25`; `general_config.php:407-417`). A faithful reconstruction should
either restore the upstream placement or document the regrouping and keep the same save
endpoints/keys.

#### 1.4.3 Conditional visibility (client-side only)

All conditional behaviour is implemented in jQuery in the tab views. The server receives
whatever the browser posts and does not enforce the same conditions:

- **general:** gcaptcha site/secret inputs are disabled unless `gcaptcha_enable` is checked
  (`app/Views/configs/general_config.php:457-470`); `beforeSerialize` re-enables them so
  they post even when the user did not touch them (`:510-515`).
- **tax:** destination-based tax toggles enabled/disabled state for the three destination
  selects versus `tax_included` and the legacy tax name/rate inputs
  (`tax_config.php:150-164`).
- **invoice:** all invoice fields disabled when `invoice_enable` is off; work-order fields
  disabled when `work_order_enable` is off; unchecking invoice unchecks work order
  (`invoice_config.php:204-227`); `beforeSerialize` re-enables everything (`:233-238`).
- **email:** protocol selects which field group is enabled (`email_config.php:145-158`).
- **reward/table:** child editor inputs disabled until the enable checkbox is on
  (`reward_config.php:46-58`; `table_config.php:46-57`). The stock-location editor has no
  enable checkbox and is always editable (`stock_config.php:20-23`).
- **receipt:** margin/header/footer/printer fields are disabled when `jsPrintSetup` is not
  present (`receipt_config.php:354-360`).
- **shortcuts:** no conditional visibility; all ten selects always enabled
  (`shortcuts_config.php:33-46`).

Because disabled controls are not posted by browsers, toggling a section off silently
clears the other side unless `beforeSerialize` re-enables it. The tax tab lacks that guard,
which is why destination-based tax and legacy tax values can overwrite each other; preserve
this quirk only if fidelity is required, otherwise fix it deliberately.

### 1.5 Invoice / quote / work-order sequence acquisition

Upstream (`app/Models/Appconfig.php:147-187`):

```php
$last_used = (int) $config['last_used_invoice_number'] + 1;  // cached settings
if ($save) { $this->save(['last_used_invoice_number' => $last_used]); }
return $last_used;
```

- All three methods (`acquire_next_invoice_sequence`, `acquire_next_quote_sequence`,
  `acquire_next_work_order_sequence`) read the **cached** `Config\OSPOS` settings array, not
  a fresh `SELECT ... FOR UPDATE`, add one, and optionally persist (`save()` refreshes the
  cache) (`Appconfig.php:149-156,164-171,179-186`).
- Return type is declared `string` but the returned value is an `int` coerced by PHP on
  return; callers treat it as a number.
- Call sites: `App\Models\Tokens\Token_invoice_sequence.php:39`,
  `Token_quote_sequence.php:34`, `Token_work_order_sequence.php:40`. The token value is
  empty by default, causing acquisition during number rendering; a non-empty token value
  bypasses acquisition (`Token_invoice_sequence.php:36-42`).
- Consequences: there is **no concurrency control**. Two requests that read the same cached
  value both produce the same number; the last writer wins. The cache itself is shared via
  the file handler, but the read-modify-write is not atomic. A config save also resets the
  in-memory sequence to whatever the admin typed, which is the intended "reset counter"
  feature (`invoice_config.php:103-113,128-138,178-188`).
- The sequence keys are editable in the invoice tab by design; the form labels them
  "last used ... number" and posts them with `FILTER_SANITIZE_NUMBER_INT`
  (`Config.php:1158-1163`).

Target (`src/lib/config/index.ts:56-72`) replaces this with a single SQL statement:

```ts
db.update(appConfig)
  .set({ value: sql`CAST(CAST(${appConfig.value} AS INTEGER) + 1 AS TEXT)` })
  .where(eq(appConfig.key, key))
  .returning({ value: appConfig.value })
```

This is atomic for SQLite and starts a missing row at `1` (same result as upstream's
absent→0→1). It is **not portable to MySQL** (`CAST(... AS INTEGER)` is invalid; MySQL needs
`SIGNED`). It has no `save=false` probe variant. It is called from
`src/lib/token/index.ts:116-121` and `src/lib/sale/sale-model.ts:57-59`, so the behaviour is
live, but both callers also use `getDbSync()` (`token/index.ts:110`) and therefore only work
on SQLite — a second MySQL portability gap. Under concurrency SQLite serialises the
`UPDATE`, so duplicate numbers are avoided there; MySQL cannot run the statement as written.

### 1.6 File upload, sanitisation and logo rules

- Logo upload (`Config::upload_logo`, `app/Controllers/Config.php:337-377`):
  - Rules: `uploaded`, `is_image`, `max_size` 1024 KiB, `mime_in` png/jpg/jpeg/gif,
    `ext_in` png/jpg/gif, `max_dims` 800×680 (`:345-356`).
  - Saved name: `sanitize_filename(pathinfo(clientName)->filename)` + guessed extension,
    moved to `FCPATH . 'uploads/'` with overwrite enabled (`:364-374`).
  - `sanitize_filename` is CI4's security helper (loaded at `Config.php:66`), not a local
    function; a grep of `app/` finds no definition, only this call.
  - The DB stores only `raw_name.ext` (`company_logo`), and the view builds
    `base_url('uploads/' . company_logo)` (`Config.php:242-243`).
  - `postRemoveLogo` clears the key but does **not** delete the file
    (`Config.php:1191-1196`).
- Item images (`Items::upload_image`, `app/Controllers/Items.php:923-963`) reuse the same
  pattern but validate with the configured `image_max_size`, `image_allowed_types`,
  `image_max_width`, `image_max_height` (`:937-940`), sanitise the base name with
  `preg_replace('/[^a-zA-Z0-9_\-\.]/','_',...)` (`:953`), and move to
  `public/uploads/item_pics/`.
- Thumbnail endpoint (`Items::getPicThumb`, `:215-234`) applies `basename(rawurldecode())`
  to block traversal and validates the extension against `image_allowed_types`, accepting
  both legacy `|` and current `,` separators (`:221-230`).
- Allowed-type vocabulary for the multi-select is fixed in the controller
  (`Config.php:264`) while the stored value is whatever the browser submits, joined by commas
  (`Config.php:411`). The `3.4.0_CI4Conversion.sql` migration rewrites legacy `|` values to
  `,` (`app/Database/Migrations/sqlscripts/3.4.0_CI4Conversion.sql:12-15`), and the thumbnail
  path handles both.
- General sanitisation: only `currency_symbol` and `country_codes` are HTML-escaped before
  storage (`Config.php:517,529`); text fields such as `company`, `address`, `return_policy`,
  invoice comments and email message are stored raw and escaped at render time
  (`app/Views/sales/receipt_default.php:29-33,168`). The target must not "sanitise on write"
  expecting upstream parity; it must escape on output.

### 1.7 Consumption map / invalidation requirements

Upstream config consumers fall into five groups:

1. **Views/global view data.** `Secure_Controller` injects `config` into every view
   (`app/Controllers/Secure_Controller.php:68-72`), and header/receipt/invoice views read
   `$config['key']` directly (e.g. `app/Views/partial/header.php:20,23,36,58`;
   `app/Views/sales/receipt_default.php:22-33,70-110,168`).
2. **Models/libraries.** `config(OSPOS::class)->settings` in constructors:
   `Sale_lib.php:64`, `Receipt`/invoice rendering, `Item.php:894-903`,
   `Receiving.php:157`, `Tax_code.php:261`, `Sms_lib.php:29-35`, `Barcode_lib.php:69-83`.
3. **Helpers.** `locale_helper.php` reads decimals, locale, date/time, payment order and
   country codes on every call (`locale_helper.php:240-280,299-364,435-512`).
4. **Events.** `Load_config` reads `timezone`, `language`, `language_code` on every request
   (`app/Events/Load_config.php:42,49,52`).
5. **Login.** `Login` and `OSPOSRules` read `gcaptcha_*` (`app/Controllers/Login.php:31-33`;
   `app/Config/Validation/OSPOSRules.php:44-52,71-97`).

**Invalidation contract.**

- Any `app_config` write must invalidate the `settings` cache entry. Upstream only does this
  through `Appconfig::save()`/`batch_save()`
  (`app/Models/Appconfig.php:83-89,114-118`); direct SQL writes leave a stale cache for up
  to the handler TTL (≈60 s; configured `ttl` 300) (`app/Config/Cache.php:52-59`).
- `update_settings()` deletes and re-reads the cache in the **current process**. Other PHP
  workers using the same file cache observe the deletion because the cache is shared
  (`app/Config/OSPOS.php:74-78`).
- The DB is read only on a cache miss; `Config\OSPOS` is constructed per request
  (`BaseConfig` instantiation through `config()`), so `settings` is request-scoped and
  rebuilt from cache.
- The target's process-global `Map` (`src/lib/config/index.ts:7-17`) never expires and only
  mutates on `setConfig` in the same process (`:47-54`). Under Next.js this means:
  - a write in a server action updates only that worker's map;
  - another worker (or a second container) serves stale values indefinitely;
  - a direct DB change (migration, seed, another tool) is invisible until restart.
  Required replacement: read-through with a short TTL or a version row, plus explicit
  invalidation after writes, or read the `app_config` row on demand at render time.
  `revalidatePath("/config")` (`src/app/(secure)/config/actions.ts:31`) only clears the
  Next.js route cache, not the config map.

## 2. Authentication, RBAC and security

### 2.1 Login / hash upgrade / session regenerate / logout

#### 2.1.1 `Login::index()` exact flow

`app/Controllers/Login.php:24-98`:

1. `model(Employee::class)`.
2. If **not** logged in (`Employee::is_logged_in`, `Employee.php:424-427`):
   1. construct `MY_Migration(config('Migrations'))`;
   2. read `OSPOS` settings;
   3. `gcaptchaEnabled = array_key_exists('gcaptcha_enable',$config) ? $config['gcaptcha_enable'] : false`
      (`Login.php:31-33`);
   4. `migrateToCI4()` — the legacy CI3 history conversion only (`Login.php:35`;
      `MY_Migration.php:89-95`);
   5. `getCurrentVersion()`; if `null` (DB unavailable) return HTTP 503 JSON
      `{success:false, message:lang('Login.migration_error_connection')}` (`Login.php:37-44`);
   6. `latestVersion = getLatestMigration()`; build view data
      `hasErrors=false, isNewInstall=($currentVersion===0), isLatest, latestVersion,
      gcaptchaEnabled, config, validation` (`Login.php:46-58`);
   7. GET returns `view('login',$data)` (`Login.php:60-62`);
   8. POST while `!isLatest || isNewInstall`: `ignore_user_abort(true); set_time_limit(3600);`
      and `$migration->setNamespace('App')->runLocked()`; a lock conflict becomes a login-page
      error `Login.migration_running`; then redirect to `login` (`Login.php:64-80`).
      **No username/password check happens on this branch.**
   9. Otherwise validate `username => required|login_check[data]` with messages
      `Login.required_username`, `Login.invalid_username_and_password`; on failure re-render
      the login view (`Login.php:82-94`).
3. Logged-in users and successful logins redirect to `home` (`Login.php:97`).

The upstream test suite explicitly acknowledges the bypass: `skipIfMigrationRequired()`
comments that `Login::index()` "runs a migration when the app's migration state isn't
current, bypassing credential checks entirely" (`tests/Controllers/LoginTest.php:59-71`).

#### 2.1.2 Credential check (`OSPOSRules::login_check`)

`app/Config/Validation/OSPOSRules.php:31-63`:

1. **Installation check**: all of `bcmath,intl,gd,openssl,mbstring,curl,xml,json` must be
   loaded, tested with one lookahead regex over `implode(', ', get_loaded_extensions())`
   (`:104-124`). Failure sets `Login.invalid_installation`.
2. **gCaptcha**: only when `gcaptcha_enable` is truthy; the POSTed `g-recaptcha-response`
   is sent to `https://www.google.com/recaptcha/api/siteverify` with
   `secret`, `response`, `remoteip`; success requires `status.success` non-empty
   (`:44-53,71-97`). Failure sets `Login.invalid_gcaptcha`.
3. **Credentials**: `$employee->login($username, $password)`; failure sets
   `Login.invalid_username_and_password` (`:55-60`).

The rule receives `$data` (the full validation data array) and reads `$data['password']`
(`:55`); the username comes from the field being validated.

#### 2.1.3 Password hash comparison and upgrade

`Employee::login()` (`app/Models/Employee.php:378-411`):

```sql
SELECT * FROM employees WHERE username = ? AND deleted = 0 LIMIT 1
```

- If `hash_version === '1'` (string comparison against the DB value) **and**
  `$row->password === md5($password)`:
  - `password_hash($password, PASSWORD_DEFAULT)` (bcrypt by default; cost is PHP's default,
    10 on PHP ≤ 8.3 and 12 on PHP ≥ 8.4);
  - `UPDATE employees SET hash_version = 2, password = <new hash> WHERE person_id = ?`;
  - only if the update succeeded: `session->regenerate(true)` when a PHP session is active,
    then `session->set('person_id', $row->person_id)`;
  - returns the update result (`:387-399`).
- Else if `hash_version === '2'` and `password_verify($password, $row->password)`:
  `session->regenerate(true)` then set `person_id`, return true (`:400-407`).
- Otherwise false (`:410`).
- `deleted` is filtered in SQL, so soft-deleted employees cannot log in.
- There is no constant-time comparison for the legacy MD5 branch; the hash comparison is a
  plain `===` (`:387`). Legacy hashes are upgraded on successful login only.

The target (`src/lib/auth/password.ts:20-65`) does the same shape but with bcryptjs cost 10,
`hashVersion === 1` → MD5 hex compare, upgrade to bcrypt and `hashVersion: 2`
(`password.ts:45-54`), else `compare()` (`:55-57`), and filters `deleted` after the query
(`:42`). It returns `AuthenticatedUser` including language/languageCode.

#### 2.1.4 Session regeneration semantics

- `session->regenerate(true)` destroys the old session data and issues a new ID
  (`Employee.php:394,402`). `Config\Session::$regenerateDestroy = true`
  (`app/Config/Session.php:94`) also makes framework auto-regeneration destroy old data.
- `person_id` is set **after** regeneration, so the new session carries the identity.
- CI4 auto-regenerates every `timeToUpdate = 300` seconds (`Session.php:83`).
- `logout()` calls `session()->destroy()` (`Employee.php:416-419`); `Home::getLogout()`
  redirects to `login` (`app/Controllers/Home.php:40-44`).
- `is_logged_in()` is `session->get('person_id') != false` (`Employee.php:424-427`) — a loose
  comparison; `person_id` values are positive integers, so this is safe in practice but not
  a strict identity check.

#### 2.1.5 Login page rendering

`app/Views/login.php` renders one of three states (`:57-65`):
`isNewInstall` → `Login.initialization_required`, `!isLatest` → `Login.migration_required`,
else `Login.welcome`. The login fields are hidden only for a new install (`:106`), and the
submit button label switches between "initialize", "migrate" and "go" (`:143-153`).
The form layout depends on `login_form`: empty or `floating_labels` → floating labels,
`input_groups` → Bootstrap input groups (`:107-135`). In `testing` the username/password
inputs are pre-filled with `admin`/`pointofsale` (`:109,113,124,133`).
gCaptcha is rendered only when enabled, using `gcaptcha_site_key` (`:137-140`).
The page embeds `APP_STATE` with `csrfToken`, `csrfHash`, `migrateUrl`, `loginUrl` and the
i18n strings used by the migration JS (`:179-205`); the JS posts to `migrate` with
username/password and `timeout: 3600000` (`:288-321`).

### 2.2 Password change and password policy

- Model-level guard: `Employee::change_password()` is a no-op returning false when
  `getenv('DISALLOW_PASSWORD_CHANGE')` parses true (`Employee.php:541-558`). The update runs
  in a transaction and is keyed by `person_id` (`:546-554`).
- Own-password flow (`Home::getChangePassword` / `postSave`,
  `app/Controllers/Home.php:51-137`):
  - non-admins may only target themselves (`:63-70`);
  - `postSave` repeats the authorization, requires `current_password`, verifies it with
    `Employee::check_password(username, current_password)` (`:78-88,90-91`; model at
    `Employee.php:522-536`, `password_verify` only, so **hash_version 1 users cannot change
    their own password through this path**);
  - new password must be `strlen >= 8` (`Home.php:90-97`), then stored as
    `password_hash(..., PASSWORD_DEFAULT)` with `hash_version = 2` (`:99-104`);
  - success/failure JSON messages `Employees.successful_change_password` /
    `Employees.unsuccessful_change_password` (`:106-120`).
- Employee create/edit (`Employees::postSave`, `app/Controllers/Employees.php:192-227`):
  `DISALLOW_PASSWORD_CHANGE` blocks password changes outside `testing`; a posted password is
  hashed with `PASSWORD_DEFAULT` and `hash_version = 2`; **no minimum length is enforced
  here**. Language is posted as `code:name` and split (`:202,211-215`).
- `DISALLOW_GRANT_CHANGE` blocks grant changes when the submitted grant set differs
  (`Employees.php:183-190`).
- Target: `src/app/(secure)/change-password/actions.ts:9-21` requires login, enforces
  `newPass.length < 4` (not 8), hashes with bcrypt cost 10, and calls
  `changePassword(employeeId, hashed, 2)`. `src/lib/employees/repository.ts` must be checked
  separately for the exact update shape; from the call it sets hash version 2.
- Target bug (auth-adjacent): `src/app/(secure)/employees/actions.ts:91-101`
  `changePasswordAction(oldPassword,newPassword)` calls
  `verifyPassword(oldPassword, emp.password)` — wrong signature (username, password) and the
  promise is used as a boolean, so `!verifyPassword(...)` is always false and the old
  password is never actually validated. It also hashes without a length policy.

### 2.3 Exact RBAC SQL semantics

Constants: `ADMIN_MODULES = ['customers','employees','giftcards','items','item_kits',
'messages','receivings','reports','sales','config','suppliers']`
(`app/Config/Constants.php:179`).

#### 2.3.1 `has_module_grant($permission_id, $person_id)`

`app/Models/Employee.php:444-456`:

```sql
SELECT * FROM grants WHERE permission_id LIKE '<permission_id>%' AND person_id = ?
```

- `LIKE ... 'after'` in CI4 produces `permission_id LIKE 'x%'`; the `_` character in the
  pattern is itself a SQL wildcard (matches any single character), so `reports_%` also
  matches `reportsX...`. This is upstream behaviour.
- If the row count is **not 1**, return `rowCount != 0`:
  - 0 rows → false;
  - ≥2 rows → true (having more than one matching grant is sufficient).
- If exactly 1 row, delegate to `has_subpermissions($permission_id)`.

#### 2.3.2 `has_subpermissions($permission_id)`

`Employee.php:461-467`:

```sql
SELECT * FROM permissions WHERE permission_id LIKE '<permission_id>_%'
```

Returns `rowCount == 0`. I.e. a module with no registered subpermissions is accessible from
a single parent grant; a module with registered subpermissions requires either multiple
grant rows or a grant for a subpermission plus the parent-specific rule above.

Examples with the upstream permission set:
- grant `reports_sales` only, permission rows `reports_*` exist → matching grants = 1 →
  `has_subpermissions('reports')` = false → `has_module_grant('reports')` = **false**.
- grants `reports_sales` + `reports_categories` → count 2 → **true**.
- grant `sales` only and no `sales_*` permissions → count 1 → subpermissions empty → **true**.
- grant `sales` only, but the permissions table registers `sales_delete` → count 1 →
  subpermissions non-empty → **false**. The parent grant alone is not enough when
  subpermissions exist.
- grants `sales` + `sales_delete` → `LIKE 'sales%'` matches **two** rows → count ≠ 1 →
  returns true, so granting any second matching row satisfies the module check. This is why
  the "need both" behaviour only bites when exactly one matching grant exists.

#### 2.3.3 `has_grant($permission_id, $person_id)`

`Employee.php:472-486`:

- null permission → true;
- null person → false;
- exact `WHERE person_id = ? AND permission_id = ? LIMIT 1`, true iff exactly one row.
- **No admin shortcut.** Person 1 relies on seeded grant rows (the seed grants 25
  permissions to person 1, `app/Database/Migrations/sqlscripts/initial_schema.sql:414-441`).

#### 2.3.4 `get_menu_group($permission_id, $person_id)`

`Employee.php:491-506`: `SELECT menu_group FROM grants WHERE permission_id = ? AND person_id = ?`;
if no row, default `'home'`; otherwise return the stored value. The final column is
`varchar(32) DEFAULT 'home'` (`sqlscripts/3.1.1_to_3.2.0.sql:5-6`). Values observed in seeds:
`home`, `office`, `both`, and a sentinel `--` for `sales_delete`
(`3.1.1_to_3.2.0.sql:17-23,67-68`; `3.2.1_to_3.3.0.sql:46-53`).

#### 2.3.5 `isAdmin($person_id)`

`Employee.php:564-577`: person 1 → true; otherwise every module in `ADMIN_MODULES` must pass
`has_grant($module,$person_id)` (exact grant rows). It is a grant-set test, not a
menu/role column.

#### 2.3.6 `canModifyEmployee($target, $current)`

`Employee.php:584-595`:

```
if target == current: return !isAdmin(target) || isAdmin(current)
if isAdmin(target) && !isAdmin(current): return false
return true
```

Effectively: admins may modify anyone, including themselves; non-admins cannot modify an
admin, but may modify other non-admins (employee-controller authorization must still be
checked at the call site). Target has no equivalent function; employees actions implement
ad-hoc checks (`src/app/(secure)/employees/actions.ts:20-22,66-71`).

#### 2.3.7 Menu queries

`Module::get_allowed_home_modules($person_id)` and `get_allowed_office_modules`
(`app/Models/Module.php:98-128`) both:

```sql
SELECT modules.*
FROM modules
JOIN permissions ON permissions.permission_id = modules.module_id
JOIN grants      ON permissions.permission_id = grants.permission_id
WHERE grants.person_id = ?
  AND grants.menu_group IN ('home','both')      -- or ('office','both')
  AND modules.sort != 0
ORDER BY modules.sort ASC
```

Notes:
- The join is on the **parent module permission** (`modules.module_id`), so a user who has
  only subpermission grants (e.g. `reports_sales`) does not get a menu entry unless the
  parent `reports` grant also exists.
- `sort != 0` deliberately excludes disabled menu entries. `home`/`office` module rows are
  seeded with `sort = 1` (`3.1.1_to_3.2.0.sql:8-10`); business modules have sort 10–120
  (`initial_schema.sql:311-322` plus later migrations).
- `set_show_office_group(true)` sets `modules.sort = 999` for `office`, false sets `0`
  (`Module.php:134-147`). Thus unchecking "show office group" hides the office icon from the
  home menu, and the office menu's `home` icon is controlled by the `home` row (sort 1).
- `get_menu_group` in `Secure_Controller` decides which list to build (`home` vs `office`);
  the session value is sticky until another controller passes a `menu_group`
  (`Secure_Controller.php:52-62`).

Target `getAllowedModules` (`src/lib/auth/rbac.ts:73-94`) diverges:
- it selects only rows with `modules.sort = 0` (upstream: `sort != 0`);
- it uses `grants.menuGroup` from the same row and filters `menuGroup`/`both`;
- it assumes `modules.sort = 0` for all business modules, which is true only because the
  target seed sets all sorts to 0 (`src/db/seed.ts:105-124`). On an upstream-migrated
  database (sorts 10–120) the sidebar would be empty; on the target seed it lists every
  granted module plus home/office.
- It does not include the parent permission requirement separately; it joins grants on
  `modules.module_id`, same as upstream.

### 2.4 Controller guard, menu groups and module lists

`Secure_Controller::__construct($module_id='', $submodule_id=null, $menu_group=null)`
(`app/Controllers/Secure_Controller.php:36-74`):

1. `$logged_in_employee_info = $employee->get_logged_in_employee_info()`
   (`Employee.php:432-439`).
2. Access condition:
   `has_module_grant($module_id, person_id) && (!isset($submodule_id) || has_module_grant($submodule_id, person_id))`
   — a **conjunction**. Failure throws `RedirectException("no_access/$module_id/$submodule_id")`
   (`Secure_Controller.php:43-49`).
3. `$menu_group` from argument, else session; when argument supplied it is written to the
   session (`:52-57`).
4. Allowed modules from `get_allowed_home_modules` or `get_allowed_office_modules`
   (`:59-62`), flattened into `global_view_data['allowed_modules']` (`:63-66`).
5. Injects `user_info`, `controller_name`, `config` into all views via `view('viewData',
   ...)` (`:68-73`).
6. `getIndex/getSearch/suggest_search/getView/postSave/postDelete` are no-op `false`
   defaults for subclasses (`:139-184`).
7. `sanitizeSortColumn($headers,$field,$default)` whitelists a sort field against the first
   key of each header (`:76-89`).
8. `validateFields($rules,$messages,$id=NEW_ENTRY)` returns a JSON
   `{success:false,message:firstError,id}` or null (`:99-108`).
9. `getCheckNumeric()` returns JSON `'true'`/`'false'` by running `parse_decimals()` over all
   GET values (`:115-123`).

`No_access::getIndex($module_id='', $permission_id='')` (`app/Controllers/No_access.php:32-52`):
builds `module_name` via `Module::get_module_name` and `permission_id`; if the user is not
logged in or the request is AJAX, returns only the `no_access` body; otherwise renders
header + no_access + footer with the correct menu list for the session menu group.

Target `requirePermission` (`src/lib/auth/with-permission.ts:5-19`):
- unauthenticated → `redirect("/login")`;
- admin → allow;
- `target = submodule ? `${moduleId}_${submoduleId}` : moduleId`;
- deny only when `!hasModuleGrant(moduleId, personId) && !hasGrant(target, personId)` — a
  **disjunction**, which is more permissive than upstream's conjunction. Example: a user
  with `sales` but no `sales_delete` still passes `requirePermission("sales","delete")`.
- `hasGrant` itself short-circuits to true for admins (`src/lib/auth/rbac.ts:31-42`), so admins
  bypass even missing grant rows.
- The `/no_access/[module]/[submodule]` page ignores its params and renders a static message
  (`src/app/(secure)/no_access/[module]/[submodule]/page.tsx:3-15`); it does not show the
  module name/permission or a menu.

### 2.5 Filters, CSRF, host and secure headers

`app/Config/Filters.php`:

- Aliases include framework filters plus `isLoggedIn` and `throttle`
  (`Filters.php:29-41`).
- Required filters run regardless of route: before `forcehttps`, `pagecache`; after
  `pagecache`, `performance`, `toolbar` (`:56-66`).
- Globals:
  - before: `honeypot`, `isLoggedIn` except `login|migrate`, `csrf` except `login|migrate`,
    `invalidchars` (`:77-83`);
  - after: `toolbar`, `honeypot`, `secureheaders` (`:84-88`).
- Route filter: `throttle` before `login` and `migrate` (`:115-117`).
- The constructor removes the global CSRF filter when `CI_ENVIRONMENT=testing`
  (`:122-133`).
- `Feature::$oldFilterOrder = false` (`app/Config/Feature.php:20`), so filters execute in
  the modern order (globals then route filters).

CSRF configuration (`app/Config/Security.php`):
`csrfProtection='session'`, `tokenRandomize=false`, `tokenName='csrf_ospos_v4'`,
`headerName='X-CSRF-TOKEN'`, `cookieName='csrf_cookie_ospos_v4'`, `expires=7200`,
`regenerate=false`, `redirect=(ENVIRONMENT==='production')` (`:18-85`).

Host-header validation (`app/Config/App.php`):

- `allowedHostnames` defaults `[]` (`:57-68`); constructor parses `ALLOWED_HOSTNAMES` or
  `app.allowedHostnames` as a comma-separated list, trimming and dropping empties
  (`:286-300`).
- `https_on` is true when `$_SERVER['HTTPS']==='on'` or `$_ENV['FORCE_HTTPS']==='true'`
  (`:302`).
- `baseURL` is built from the scheme, the validated host, and the script directory
  (`:304-307`).
- `getValidHost()`:
  - `HTTP_HOST` defaults to `localhost`;
  - if `allowedHostnames` is empty: production **throws RuntimeException**; testing and
    development log and fall back to `localhost` (`:331-347`);
  - if the host is in the whitelist, return it;
  - otherwise log a warning and return `allowedHostnames[0]` — the request is **not**
    rejected, it is rewritten onto the first configured host (`:349-359`).
- Tests cover valid, invalid/fallback, missing whitelist in dev/prod, missing host, base URL,
  and env parsing (`tests/Config/AppTest.php:32-201`).

`secureheaders` runs after every response (`Filters.php:84-88`). The repository contains no
`X-Frame-Options`, CSP, `Referrer-Policy` or X-XSS configuration (no hits in `app/` or
`.env.example`), so the framework's default SecureHeaders values apply. The target sets its
own static headers in `next.config.ts:6-22` (`X-Frame-Options: SAMEORIGIN`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`, HSTS) and `poweredByHeader:false` (`next.config.ts:4`).

`IsLoggedIn` filter (`app/Filters/IsLoggedIn.php`):
- not logged in + AJAX → HTTP 401 JSON `{success:false,message:'Session expired. Please log
  in again.'}` (`:17-25`);
- not logged in + normal request → `RedirectException('login')` (`:27`).
The JS layer redirects to `/login` on any 401 (`app/Views/partial/header_js.php:80-84`).

### 2.6 Throttle

`app/Filters/Throttle.php` (attached to `login`, `migrate`; `Filters.php:115-117`):

- Only POST requests are considered; anything else passes (`Throttle.php:22-24`).
- `throttle.capacity` env: `FILTER_VALIDATE_INT`; non-numeric → 5; `<= 0` → disabled
  (`:28-34`).
- `throttle.seconds` env: non-numeric → 60; clamped to `>= 1` (`:36-40`).
- Secret: `checkThrottleEncryption()` — `throttle.key` env/`THROTTLE_KEY`, auto-provisioned
  to `.env` when writable, otherwise throws (`app/Helpers/security_helper.php:364-384,546-591`).
- Keys are HMAC-SHA256 of the raw IP and of the lowercased username, with prefixes
  `login-ip-` / `login-user-` (`Throttle.php:47-50`). The username key is skipped when the
  username is empty or non-scalar (array), which only throttles by IP (`:48-53`).
- Both counters are checked; either failing returns HTTP 429 JSON
  `{success:false,message:lang('Login.too_many_attempts')}` (`:52-67`).
- CI4 Throttler is cache-backed; limits are per-server with the file cache (`:10-16`).
- Tests: GET not throttled, under-capacity allowed, IP block, username block, JSON message,
  IPv6, missing username, array username, custom capacity, zero disables, invalid falls back
  (`tests/Filters/ThrottleTest.php:54-202`); login integration covers the sixth failed
  attempt, correct login under capacity, and GET never throttled
  (`tests/Controllers/LoginTest.php:107-163`).
- Target has no throttle at all: `/login` goes straight to NextAuth Credentials
  (`src/app/api/auth/[...nextauth]/route.ts:1-3`; `src/lib/auth/options.ts:19-40`).

### 2.7 Session storage and encryption key bootstrap

#### 2.7.1 Session

`app/Config/Session.php`:

- Driver `DatabaseHandler` (`:26`), cookie `ospos_session` (`:35`), expiration 7200 s
  (`:45`), savePath `sessions` (`:62`), `matchIP = true` (`:74`), `timeToUpdate = 300`
  (`:83`), `regenerateDestroy = true` (`:94`), `DBGroup = null` (`:103`).
- Constructor falls back to `FileHandler` with `WRITEPATH.'session'` when the DB is
  unavailable or the `sessions` table does not exist (`:130-151`) — this is what lets the
  login/migration page work before the schema exists.
- Table shape after the latest migration
  (`app/Database/Migrations/sqlscripts/3.4.1_migrate_sessions_table.sql:1-10`):
  `id varchar(128) NOT NULL`, `ip_address varchar(45) NOT NULL`,
  `timestamp timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL`, `data blob NOT NULL`,
  index on `timestamp`, `PRIMARY KEY (id, ip_address)`.
  The composite key is required by `matchIP=true`; the earlier `3.4.0` script had the same
  shape (`sqlscripts/3.4.0_CI4Conversion.sql:1-11`).
- GC is CI4's database handler behaviour: expired rows (older than `expiration`) are deleted
  probabilistically on session writes. The upstream repo does not implement its own GC
  (no session GC code in `app/`).
- Target: session schema `id` is the sole PK and `timestamp` is an integer
  (`src/db/schema/auth.ts:54-59`; `drizzle/mysql/0000_demonic_darkstar.sql`), matching
  neither CI's composite key nor CI's timestamp type. NextAuth is configured for JWT
  (`src/lib/auth/options.ts:17`), maxAge 7 days, so DB sessions are not used at all.

#### 2.7.2 Encryption key bootstrap

`checkEncryption()` (`app/Helpers/security_helper.php:296-345`):

1. `$key = config('Encryption')->key`; if non-empty and `strlen >= 64`, return true without
   I/O (`:298-302`).
2. If `.env` is not writable (`envFileIsWritable()`, `:246-271`), log critical and throw
   `Error.encryption_key_not_provisioned` (`:304-308`).
3. If a key exists but is short (CI3-era):
   - `CI3SecretConverter::decryptAll($key)` decrypts `LEGACY_KEYS` —
     `clcdesq_api_key`, `clcdesq_api_url`, `mailchimp_api_key`, `mailchimp_list_id`,
     `smtp_pass` (`app/Libraries/CI3SecretConverter.php:32-38`) — using AES-128-CBC,
     `encryptKeyInfo='encryption'`, `authKeyInfo='authentication'`, rawData=false
     (`:147-160`);
   - `rotateEncryptionKeyTransaction($key, callback)` holds one `.env` lock across
     backup → key rotation → re-encrypt under CI4 cipher → verify → persist
     (`security_helper.php:503-537`);
   - verification is `array_diff_assoc($plain, verifyAll($encrypted)) === []`; failure throws
     and restores the pre-rotation `.env` backup (`:328-338,525-536`);
   - `saveAll()` persists through `Appconfig::batch_save()` and throws on failure
     (`CI3SecretConverter.php:117-124`).
4. If no key exists: `rotateEncryptionKey(null)` — generate 32 random bytes as hex, back up
   `.env` to `writable/backup` (config `SecurityEnv`), write with mode 0640 atomically, set
   `config('Encryption')->key` (`security_helper.php:406-473`).

Key sources (`app/Config/Encryption.php:110-125`): first non-empty of
`$_SERVER['encryption.key']`, `$_ENV['encryption.key']`, `getenv('encryption.key')`,
`getenv('ENCRYPTION_KEY')`, then parse `hex2bin:`/`base64:` prefixes (`:131-157`).
Cipher is AES-256-CTR, OpenSSL, SHA512, rawData=false (`:54,83,108`).

`RemoveBackup()` deletes the pre-rotation `.env` backup; `Config::getIndex()` calls it after
reading Mailchimp values (`app/Controllers/Config.php:286-287`).

`EnvProvision` command (`app/Commands/EnvProvision.php:22-93`) does the same key provisioning
non-interactively for Docker: `provisionThrottleKey()`, then either returns when a valid CI4
key exists, converts a short CI3 key via `rotateEncryptionKeyTransaction`, or generates a
fresh key; it warns when legacy secrets exist but no CI3 key can decrypt them
(`:85-87`).

Target encryption (`src/lib/encryption/index.ts`):
- Requires `ENCRYPTION_KEY` to be 64+ hex characters, otherwise generates 32 random bytes
  as hex and rewrites `.env` (or appends), with a `.env.backup` copy
  (`:13-34`), mode 0640 (`:30`).
- Derives the AES key with `scryptSync(hex, "ospos-salt", 32)` (`:36-39`).
- AES-256-GCM with 16-byte IV, ciphertext format `iv:tag:data` hex (`:41-60`).
- No lock, no atomic rename, no writability pre-check, no previous-key support, no CI3
  conversion, no `hex2bin:`/`base64:` prefixes. It cannot read or write CI4 ciphertext, and
  upstream cannot read target ciphertext. This is a hard data-migration boundary.
- `void ensureKey;` at `:62` is a no-op reference; the key is only generated on first
  `encrypt`/`decrypt` call, so a deployment can start with no key and write one at first use.

## 3. Install, upgrade, migration and session mechanics

### 3.1 Fresh install vs upgrade gate

**Fresh install** is defined as `MY_Migration::getCurrentVersion() === 0`
(`app/Libraries/MY_Migration.php:38-55`):

- `Database::connect()` succeeds and the `migrations` table does **not** exist → returns 0;
- table exists but is empty → returns 0;
- DB unavailable or connection throws → returns `null` (distinct from empty),
  which `Login::index()` maps to HTTP 503 (`app/Controllers/Login.php:39-44`).

The same value drives the login page: `isNewInstall = ($currentVersion === 0)`, and the
login fields are hidden for a new install (`app/Controllers/Login.php:52`;
`app/Views/login.php:106`). On POST, both a new install and an outdated install run
`$migration->setNamespace('App')->runLocked()` and redirect back to `login`
(`Login.php:64-80`). The user then logs in with the seeded `admin` / `pointofsale`
credentials (`initial_schema.sql:130-131`; `docs/INSTALL.md:57-62`).

**Upgrade** is any database whose last migration version is less than
`getLatestMigration()` (`MY_Migration.php:15-30`; `Login::index()` builds `isLatest` at
`Login.php:53`). On an upgrade:

- `Load_config` (post-controller-constructor event) compares the same two values and calls
  `$this->session->destroy()` when they differ (`app/Events/Load_config.php:37-40`), so every
  employee is logged out on the first request after a code upgrade;
- **even a GET to `/login` calls `migrateToCI4()`**, which for a CI3-shaped database drops
  and recreates the `migrations` table and writes history rows before any POST
  (`app/Controllers/Login.php:35`; `app/Libraries/MY_Migration.php:89-95,123-141,183-189`);
- the login page shows `Login.migration_required` and the migration warning
  (`app/Views/login.php:60-75`);
- the migration POST is supposed to include username/password (the JS does:
  `login.php:299-303`), but the `/login` POST branch itself does not validate them
  (`Login.php:64-80`); only `/migrate` validates (`Login.php:114-129`).

**Docker install** (`docs/INSTALL.md:66-89`; `docker-compose.yml`) copies `.env.example` to
`.env`, starts the compose stack, and the schema is built on first request. The upstream
container (`Dockerfile:1-28`) is PHP 8.2 + Apache with `mysqli, bcmath, intl, gd`, rewrites
enabled, and chmods `writable/*` and `public/uploads*` to 750/640. There is no startup
migration command; migrations run through the login page.

Target install differs materially:
- `docker/entrypoint.sh:5-14` runs `npm run db:migrate` and `npm run db:seed` before
  `node server.js`; there is no login-page migration gate and no credential step.
- `src/app/api/migrate/route.ts:6-13` executes `npm run db:migrate` via `execSync` and
  returns JSON; no auth, no lock, no version check, no fresh-install distinction.
- `src/db/seed.ts:166-233` runs Drizzle migrations and seeds admin/people/modules/
  permissions/grants/config; it skips everything if username `admin` already exists
  (`:172-176`), so a partially seeded database is never repaired.

### 3.2 Migration runner, lock and version table

#### 3.2.1 `MY_Migration` mechanics

`class MY_Migration extends CodeIgniter\Database\MigrationRunner`
(`app/Libraries/MY_Migration.php:10-11`):

- `isLatest()`: latest version == current version (`:15-21`).
- `getLatestMigration()`: `findMigrations()` → `end($migrations)->version`, then
  `(int) basename(...)` (`:26-30`). It relies on the framework returning migrations sorted
  ascending. The 14-digit timestamps fit in a 64-bit int; the final one is
  `20261023000000` (`app/Database/Migrations/20261023000000_AddStockLocationDefaultAndSortOrder.php`).
- `getCurrentVersion()`: `SELECT version FROM migrations ORDER BY version DESC LIMIT 1`;
  casts to int; 0 if no row/table; `null` on exception (`:38-55`).
- `runLocked()`:
  - `GET_LOCK('ospos_migrations_' . md5($dbName), 0)` — zero-second, non-blocking;
  - if the result is not `1`, throw `Exception('Migration already in progress. Please wait
    for it to complete.')` (`:66-76`);
  - `migrateToCI4()` then `latest()` in a `try`, `SELECT RELEASE_LOCK(...)` in `finally`
    (`:78-83`).
  - This is **MySQL/MariaDB-only** (`GET_LOCK`/`RELEASE_LOCK`). There is no SQLite path.
- `migrateToCI4()`: only runs when `ci3MigrationsExists()` (`:89-95`).
- `ci3MigrationsExists()`: true when table `migrations` exists **and** column `id` does not
  exist (`:102-117`). CI3's table has no `id`; CI4's does.
- `migrateTable($ci3Version)`:
  - `convertTable()` drops `migrations` and calls the framework's `ensureTable()`
    (`:123-125,183-189`);
  - `getAvailableMigrations()` maps `uid` → `substr(0,14)` version and `substr(14)` path,
    sorted by version (`:162-177`);
  - for every available migration with `version <= (int)$ci3Version`, insert a history row
    with `version`, `class=path`, `namespace='App'`, `batch=1` (`:129-140`);
  - `latest()` then runs the remaining migrations in a new batch.
- `up()`/`down()` are unimplemented stubs (`:146-157`).

#### 3.2.2 CI4 `migrations` table shape

The framework's `ensureTable()` creates (per CodeIgniter 4 `MigrationRunner`):

| Column | Type | Notes |
|---|---|---|
| `id` | int unsigned auto-increment | PK; **absence detects CI3** |
| `version` | varchar(255) | 14-digit timestamp as a string |
| `class` | varchar(255) | migration class name |
| `group` | varchar(255) | migration group (default `default`) |
| `namespace` | varchar(255) | `App` for this project |
| `time` | int | unix timestamp of execution |
| `batch` | int | execution batch; legacy CI3 history is batch 1 |

`docs/reconstruction/11-database.md` D13 records this exact shape and shows the target's
mirror is wrong: `src/db/schema/misc.ts:3-9` has `id`, `version:int`, `class`, `namespace`,
`time` only — no `group`, no `batch`, `version` numeric. The generated SQL repeats that
(`drizzle/sqlite/0000_skinny_power_man.sql:410-416`;
`drizzle/mysql/0000_demonic_darkstar.sql:202-208`).

Target uses Drizzle's own `__drizzle_migrations` journal (hash + timestamp) through
`src/db/migrate.ts:1-9`; it never writes the `migrations` table and has no CI3 conversion.

#### 3.2.3 SQL script execution semantics

`executeScript($path, $withTransaction=false, $db=null)` in
`app/Helpers/migration_helper.php:14-60`:

- derives the version from the filename before the first `_`;
- reads the whole file and `explode(';')`, popping the final empty element;
- executes each statement, logging every DB error;
- **returns false if any statement failed but does not abort the remaining statements**
  unless a transaction is used; the transaction is rolled back only on an exception, not on a
  false return (`:28-47`);
- `transComplete()` is called even when `$success === false` (`:55-57`), so a failed
  transactional script may commit the statements that succeeded.

`Migration_Initial_Schema::up()` ignores the return value of `executeScript`
(`app/Database/Migrations/20170501000000_initial_schema.php:25-29`); later migrations are
inconsistent — `ConvertToCI4` throws when the script fails
(`20170501000000...` vs `20220127000000_convertToCI4.php:24-27`). This is why D13's notes
say later migrations can log errors (duplicate config keys, missing tables) while still
recording history.

Other helpers in the same file are MySQL-specific and used by schema migrations:
`dropForeignKeyConstraints`, `overridePrefix`, `createPrimaryKey`,
`dropAllForeignKeyConstraints` (queries `information_schema`), `deleteIndex`,
`indexExists`, `primaryKeyExists`, `recreateForeignKeyConstraints`, `foreignKeyExists`,
`dropColumnIfExists`, `isMariaDb` (`migration_helper.php:70-413`). None of these can run on
SQLite.

### 3.3 The 47 migrations and destructive steps

All classes live in `app/Database/Migrations/`. Sorted by version:

| # | Version | Class | Effect (brief) |
|---|---|---|---|
| 1 | 20170501000000 | `Migration_Initial_Schema` | Creates the 25-table 3.0.2 baseline and seeds config, admin, modules, permissions, grants, stock (`initial_schema.sql:1-877`). ⚠ `up()` does not skip existing tables and ignores failure (`20170501000000_initial_schema.php:25-29`); `down()` drops every table except `migrations` (`:38-67`). |
| 2 | 20170501150000 | `Migration_Upgrade_To_3_1_1` | Adds stock/item-kit/suspended/tax/GST columns and tables, `dinner_tables`, customer packages/points, taxes module/config keys; migrates suspended sales into `sales` then ⚠ **drops all four suspended tables** (`3.0.2_to_3.1.1.sql:322-330`). |
| 3 | 20170502221506 | `Migration_Sales_Tax_Data` | Backfills sales tax data; uses `tax_decimals`/`tax_included` (`:61-62`). |
| 4 | 20180225100000 | `Migration_Upgrade_To_3_2_0` | Adds `menu_group`, home/office modules, permissions/grants, work orders, employee language columns, suggestion/barcode config, drops the `migrate` module/permission/grant, removes duplicate indexes. |
| 5 | 20180501100000 | `Migration_Upgrade_To_3_2_1` | Adds discount config, enforce privacy, print delay, item-kit changes. |
| 6 | 20181015100000 | `Migration_Attributes` | Creates attribute tables; converts `custom1..10` definitions; ⚠ drops `items.custom1..custom10` (`3.3.0_attributes.sql:173-182`). |
| 7 | 20190111270000 | `Migration_Upgrade_To_3_3_0` | Customer packages/points, giftcard/reward schema, supplier name removal (`3.2.1_to_3.3.0.sql:146`). |
| 8 | 20190129212600 | `Migration_IndiaGST` | Renames/recreates `tax_codes` and `sales_taxes`, creates `tax_jurisdictions`, renames `tax_code_rates`→backup, creates `tax_rates`; adds tax columns; renames config keys; ⚠ drops `customers.sales_tax_code` (`:109`) and three backups (`:160-162`). |
| 9 | 20190213210000 | `Migration_IndiaGST1` | GST follow-up data fixes. |
| 10 | 20190220210000 | `Migration_IndiaGST2` | ⚠ Drops `tax_codes_backup`, `sales_taxes_backup`, `tax_code_rates_backup` (`3.3.0_indiagst2.sql:3-5`). |
| 11 | 20190301124900 | `Migration_decimal_attribute_type` | Adds DECIMAL attribute type. |
| 12 | 20190317102600 | `Migration_add_iso_4217` | Seeds `currency_code` / ISO-4217 data (`3.3.0_add_iso_4217.sql:2`). |
| 13 | 20190427100000 | `Migration_PaymentTracking` | Payment tracking schema; ⚠ drops `ospos_sales_payments_backup` (`3.3.0_paymenttracking.sql:23`). |
| 14 | 20190502100000 | `Migration_RefundTracking` | Refund tracking; ⚠ drops `migrate_refund` (`:109`). |
| 15 | 20190612100000 | `Migration_DBFix` | Schema fixes. |
| 16 | 20190615100000 | `Migration_fix_attribute_datetime` | Attribute datetime fixes. |
| 17 | 20190712150200 | `Migration_fix_empty_reports` | Empty-report fixes. |
| 18 | 20191008100000 | `Migration_receipttaxindicator` | Adds `receipt_show_tax_ind` config. |
| 19 | 20191231100000 | `Migration_PaymentDateFix` | Payment date fixes. |
| 20 | 20200125100000 | `Migration_SalesChangePrice` | `sales_change_price` permission/grant. |
| 21 | 20200202000000 | `Migration_TaxAmount` | Tax amount changes; ⚠ `DROP TABLE sales_taxes_backup` (`:54`). |
| 22 | 20200215100000 | `Migration_taxgroupconstraint` | Tax group constraints; drops/recreates index `tax_jurisdictions_uq1` (`:23`). |
| 23 | 20200508000000 | `Migration_image_upload_defaults` | Inserts `image_allowed_types/height/size/width` (`:15-23`). |
| 24 | 20200819000000 | `Migration_modify_attr_links_constraint` | Attribute-link constraints. |
| 25 | 20201108100000 | `Migration_cashrounding` | Cash rounding; ⚠ drops `sales_payments.cash_adjustment` in `down()` (`:23`). |
| 26 | 20201110000000 | `Migration_add_item_kit_number` | Item-kit number. |
| 27 | 20210103000000 | `Migration_modify_session_datatype` | Session `data` type change. |
| 28 | 20210422000000 | `Migration_database_optimizations` | Indexes, datatypes, FK cleanup. |
| 29 | 20210422000001 | `Migration_remove_duplicate_links` | Deduplicates attribute links. |
| 30 | 20210714140000 | `Migration_move_expenses_categories` | Moves `expenses_categories` grant to office menu group (`:16`). |
| 31 | 20220127000000 | `ConvertToCI4` | ⚠ `DROP TABLE ospos_sessions` then recreates (`3.4.0_CI4Conversion.sql:1-11`); rewrites `image_allowed_types` `\|`→`,` and resets language to `en`/`english`
  (`:14-20`); rotates/converts encryption keys (`20220127000000_convertToCI4.php:24-71`). |
| 32 | 20230307000000 | `IntToTinyint` | `int`→`tinyint` conversions. |
| 33 | 20230412000000 | `Migration_add_missing_config` | `INSERT IGNORE` 8 keys: `account_number`, `category_dropdown`, `smtp_host/user/pass`, `login_form`, `receiving_calculate_average_price`, `payment_message` (`:15-24`). |
| 34 | 20230412000001 | `Migration_drop_account_number_index` | Drops/recreates `customers.account_number` index (`:15-16`). |
| 35 | 20240319000000 | `Migration_Convert_Barcode_Types` | Normalises `barcode_type` values (e.g. `Code39`→`C39`, `Code128`→`C128`, `EAN-13`→`EAN13`, `UPC-A`→`UPCA`). |
| 36 | 20240630000001 | `Migration_fix_keys_for_db_upgrade` | FK repair for upgrades. |
| 37 | 20240826000000 | `fix_duplicate_attributes` | Deduplicates attributes. |
| 38 | 20250213000000 | `Migration_Attributes_fix_cascading_delete` | ⚠ drops index `attribute_links_uq3` and column `generated_unique_column` (`:19-20`). |
| 39 | 20250425000000 | `Migration_sessions_migration` | ⚠ `DROP TABLE IF EXISTS ospos_sessions`; recreates CI4 shape with PK `(id, ip_address)` (`3.4.1_migrate_sessions_table.sql:1-10`). |
| 40 | 20250519000000 | `MigrationOptimizationIndices` | Adds optimisation indexes. |
| 41 | 20250521000000 | `FixImageFilenameSpaces` | Renames image files containing spaces. |
| 42 | 20250522000000 | `AttributeLinksUniqueConstraint` | Adds unique constraint. |
| 43 | 20250716170000 | `Migration_MissingConfigKeys` | `INSERT IGNORE` nine config keys; all already existed, so no value change (`3.4.2_missing_config_keys.sql:1-11`). |
| 44 | 20250729170000 | `Migration_NullableTaxCategoryId` | Makes `items.tax_category_id` nullable. |
| 45 | 20260405000000 | `Migration_Mysql84Utf8mb4Conversion` | MySQL 8.4 utf8mb4 conversion; ⚠ drops/recreates some indexes (`:20`). |
| 46 | 20260506000000 | `AddShortcutKeys` | Inserts the ten `key_*` config defaults. |
| 47 | 20261023000000 | `AddStockLocationDefaultAndSortOrder` | Adds stock-location default/sort-order columns. |

The final schema is reached by all 47 in order; a fresh install runs every `up()` from an
empty database (no baseline import shortcut), and `Migration_Initial_Schema` is the only
migration that creates the base tables.

### 3.4 Migrate route and permission

- Route: `POST migrate → Login::migrate` (`app/Config/Routes.php:11`). There is no GET route.
- Filters: excluded from `isLoggedIn` and `csrf` (`app/Config/Filters.php:80-81`); throttled
  (`:115-117`). `honeypot` and `invalidchars` globals still apply (`:77-83`).
- `Login::migrate()` (`app/Controllers/Login.php:100-158`):
  1. `getCurrentVersion()`; `null` → 503 JSON `Login.migration_error_connection` (`:102-109`);
  2. `$isNewInstall = ($currentVersion === 0)`; if not a new install, validate
     `username => required|login_check[data]`, returning 401 with
     `Login.invalid_username_and_password` on failure (`:111-129`);
  3. `ignore_user_abort(true); set_time_limit(3600);`
     `$migration->setNamespace('App')->runLocked()` (`:131-137`);
  4. success → 200 `{success:true,message:'Migration completed successfully'}` (`:138-141`);
  5. lock conflict → 202 `{success:false,message:Login.migration_running}` (`:143-149`);
  6. any other exception → log and 500 `{success:false,message:'Migration failed: ...'}`
     (`:151-156`).
- **There is no `migrate` permission in the final schema.** The module/permission/grant were
  created in `3.0.2_to_3.1.1.sql:239-245` and deleted in
  `3.1.1_to_3.2.0.sql:101-103`. The route's authorization is therefore only the
  username/password check in step 2, plus the fact that a fresh install has nothing to
  protect. The `menu_group` update in `3.1.1_to_3.2.0.sql:21-23` still names `migrate`, but
  the row no longer exists.
- On a non-new install, `login_check` calls `Employee::login()`, which **creates a session**
  for the supplied credentials (`app/Config/Validation/OSPOSRules.php:55-60`); so the migrate
  endpoint doubles as a login endpoint.
- The login page's migration JS supplies `csrf_token`/`csrf_hash` even though the route is
  CSRF-exempt (`app/Views/login.php:184-186,299-303`); this is harmless but unnecessary.

## 4. i18n framework

### 4.1 Locale inventory and file layout

Upstream translations live in `app/Language/<locale>/<File>.php`. There are **46 locale
directories** and **24 PHP files per locale** (1,104 files total). The directories are:
`ar-EG, ar-LB, az, bg, bs, ckb, cs, da, de-CH, de-DE, el, en, en-GB, es-ES, es-MX, fa, fr,
he, hr, hu, hy, id, it, ka, km, lo, ml, nb, nl-BE, nl-NL, pl, pt-BR, ro, ru, sv, sw-KE,
sw-TZ, ta, th, tl, tr, uk, ur, vi, zh-Hans, zh-Hant` (verified by directory listing; also
encoded in `Config\App::$supportedLocales`, `app/Config/App.php:159-206`, and in
`get_languages()`, `app/Helpers/locale_helper.php:52-104`).

The 24 files and their English key counts (verified by parsing `app/Language/en/*.php`):

| File | Keys | File | Keys |
|---|---:|---|---:|
| `Attributes.php` | 32 | `Item_kits.php` | 36 |
| `Bootstrap_tables.php` | 8 | `Items.php` | 121 |
| `Calendar.php` | 45 | `Login.php` | 27 |
| `Cashups.php` | 46 | `Messages.php` | 12 |
| `Common.php` | 78 | `Module.php` | 45 |
| `Config.php` | 344 | `Receivings.php` | 56 |
| `Customers.php` | 53 | `Reports.php` | 147 |
| `Datepicker.php` | 20 | `Sales.php` | 210 |
| `Employees.php` | 47 | `Suppliers.php` | 21 |
| `Enum.php` | 7 | `Taxes.php` | 81 |
| `Error.php` | 10 | `Expenses.php` | 47 |
| `Expenses_categories.php` | 19 | `Giftcards.php` | 68 |

Each file returns a flat associative array of `'key' => 'text'` entries (e.g.
`app/Language/en/Login.php:1-31`). `Config.php` is by far the largest because every config
label, tooltip, validation message and tab title is translated (`app/Language/en/Config.php`,
344 keys).

`get_languages()` returns a value/label map keyed as `"<code>:<language-name>"` and sorted
with `asort()` (`app/Helpers/locale_helper.php:52-104`). The locale part is the directory
name (e.g. `en-GB`, `zh-Hans`), the name part is the CI language group for that translation
(e.g. `english`, `simplified-chinese`). The locale tab posts this combined string
(`app/Views/configs/locale_config.php:219-224`) and the controller splits it on `:` into
`language_code` and `language` (`app/Controllers/Config.php:514-520`).

`Config\App::$supportedLocales` is the framework's list of accepted locales, asserted equal
to the directory list by `tests/LanguageFilesTest.php:101-112`.

### 4.2 Resolution and fallback

`MY_Language::getLine()` (`app/Libraries/MY_Language.php:9-40`):

1. If the requested line contains no `.`, format it as a literal message.
2. `parseLine($line, $this->locale)` and look up the translation output.
3. If not found and the locale contains `-`, split on the first `-` and retry with the base
   language (e.g. `en-GB` → `en`, `de-CH` → `de`, `sw-KE` → `sw`).
4. If still `null`/empty, retry with `en`.
5. If still nothing, `$output ??= $line` — the raw key string (e.g. `Config.missing_key`) is
   returned.
6. `formatMessage($output, $args)` applies CI's `{0}`-style placeholder replacement.

Important upstream quirk: step 3 uses `strpos($this->locale, '-')`, so only the first
subtag is tried; there is no `zh-Hant`→`zh` file, but `en` fallback still succeeds for
missing keys.

`Load_config::load_config()` runs on **every** controller construction
(`app/Config/Events.php:61-62`) and:

- destroys the session when migrations are not current (`Load_config.php:37-40`);
- `setDefaultLanguage()`: if settings are empty or `language_code` is missing, force
  `english`/`en`; if the code contains `/`, `\`, `..` or NUL, or the directory does not
  exist under `APPPATH.'Language/'`, force `english`/`en` (`Load_config.php:44-71`);
- `Services::language()->setLocale(current_language_code())` (`:52`);
- `date_default_timezone_set($settings['timezone'] ?? ini_get('date.timezone'))` (`:54`);
- `bcscale(max(2, totals_decimals() + tax_decimals()))` (`:56`).

`current_language_code()` / `current_language()` (`app/Helpers/locale_helper.php:12-47`)
prefer the logged-in employee's `language_code`/`language` columns when not asked for the
system language, else the `app_config` values, else `DEFAULT_LANGUAGE_CODE='en'` /
`DEFAULT_LANGUAGE='english'` (`app/Config/Constants.php:173-174`). This is the employee
language override; the employee columns are added in
`sqlscripts/3.1.1_to_3.2.0.sql:108-111` and populated from the `code:name` select in the
employee form (`app/Controllers/Employees.php:202-215`).

### 4.3 Date, time, number and currency helpers

All of these read `config(OSPOS::class)->settings` per call (no memoisation beyond the
settings cache):

| Function | Behaviour | Citation |
|---|---|---|
| `quantity_decimals()` | `quantity_decimals ?? 0` | `locale_helper.php:313-317` |
| `totals_decimals()` | `currency_decimals ?? 0` | `:322-326` |
| `cash_decimals()` | `cash_decimals ?? 0` | `:331-335` |
| `tax_decimals()` | `tax_decimals ?? 0` | `:340-344` |
| `to_date($ts)` | `date($config['dateformat'], $ts)` | `:350-354` |
| `to_datetime($ts)` | `date(dateformat . ' ' . timeformat, $ts)` | `:360-364` |
| `to_currency($n)` | ICU `NumberFormatter($number_locale, CURRENCY)` with `currency_decimals`, `currency_symbol`, optional grouping separator | `:370-373,435-452` |
| `to_currency_no_money($n)` | same but DECIMAL formatter | `:379-382` |
| `to_currency_tax($n)` | CURRENCY with `tax_decimals` when `tax_included`, else `currency_decimals` | `:388-397` |
| `to_tax_decimals($n)` | empty/0/'' returns as-is; otherwise DECIMAL with `tax_decimals` | `:403-417` |
| `to_quantity_decimals($n)` | DECIMAL with `quantity_decimals` | `:423-426` |
| `parse_decimals($s, $decimals=null)` | ICU parse with `number_locale`; default fraction digits = `currency_decimals ?? 2`; rejects `false`, `>1e14`, `>MAX_PRECISION`; returns float; catches exceptions | `:477-512` |
| `parse_quantity($s)` | `parse_decimals($s, quantity_decimals())` | `:458-461` |
| `parse_tax($s)` | `parse_decimals($s, tax_decimals())` | `:467-470` |
| `is_right_side_currency_symbol()` | ICU pattern starts with `¤` ⇒ symbol before amount | `:299-306` |
| `get_payment_options()` | ordering from `payment_options_order`; always appends due/check/bank transfer/wallet; adds UPI when `country_codes` contains `IN` | `:240-280` |
| `dateformat_momentjs($fmt)` | PHP date format → Moment.js tokens (used by the live clock) | `:517-560` |
| `dateformat_mysql($fmt)` | PHP date format → MySQL `DATE_FORMAT` tokens | `:565-607` |
| `dateformat_bootstrap($fmt)` | PHP date format → Bootstrap datepicker tokens | `:613-652` |
| `isValidDate($s)` | round-trips `DateTime::createFromFormat($dateformat, $s)` | `:658-663` |
| `valid_decimal($s)` | regex `^(\d*\.)?\d+$` | `:669-672` |
| `encode_array` / `decode_array` | `rawurlencode`/`rawurldecode` each value; used by the settings cache | `:678-698` |

The cache encoding matters: `Config\OSPOS` stores `rawurlencode`d values and decodes on read
(`OSPOS.php:36,53`), so values containing `|`, `,` or quotes survive the file cache. The
target's plain `Map` does not need this because it does not cache, but any target cache must
preserve these characters.

### 4.4 JavaScript language lines, RTL and missing keys

- `partial/lang_lines.php` exposes exactly two JS strings: `common_submit` and
  `common_close` (`app/Views/partial/lang_lines.php:4-7`), interpolated **without escaping**
  into a `<script>` block (`:5-6`). The `lang.line(key)` helper returns them (`:9-13`).
- `partial/header_js.php` emits the Moment.js format for the live clock
  (`:19-22`) and uses `esc(..., 'js')` for notification placement (`:24-33`). Other JS
  strings are inlined per-view with `json_encode(lang(...))` (e.g.
  `app/Views/login.php:188-204`).
- **RTL:** there is no RTL support in the upstream views or CSS. `header.php` sets only
  `<html lang="<?= current_language_code() ?>">` (`app/Views/partial/header.php:15`); there is
  no `dir="rtl"` and no `direction:` CSS (grep of `app/Views` and `public/css` returns only
  a pie-chart `labelDirection` option at `app/Views/reports/graphs/pie.php:32`). Arabic,
  Hebrew, Persian and Urdu locales inherit LTR layout.
- **Missing-key behaviour:** `MY_Language` falls back locale → base language → `en` → raw
  key string (`MY_Language.php:20-39`). There is no exception and no debug placeholder.
- **Language file invariants** (`tests/LanguageFilesTest.php`):
  - every file parses to an array (`:34-43`);
  - every non-English file has exactly the English key set — no extra, no missing
    (`:45-62`);
  - keys are alphabetically sorted, except `Calendar.php` (`:64-78`);
  - no duplicate keys per file (`:80-99`);
  - `supportedLocales` equals the directory list (`:101-112`);
  - `get_languages()` equals the directory list (`:114-128`).

### 4.5 Target i18n state

- `src/lib/i18n/index.ts:4-14` declares `locales = ["en"]` only and loads
  `src/messages/<locale>/common.json`; it reads `language_code` from config and silently
  falls back to `en` (`:8-9`).
- `src/messages/en/common.json` is `{}` — **zero keys** — while 47 locale directories exist.
  Only `src/messages/bn/common.json` has content (6 top-level sections: common, login,
  modules, items, sales, errors).
- No component uses `useTranslations`/`getTranslations`/`NextIntlClientProvider`; a grep of
  `src/` finds only the `getRequestConfig` import. The UI strings are hard-coded English
  (e.g. `src/app/(auth)/login/page.tsx:47-50,55,74,107-115`;
  `src/components/config/config-tabs.tsx:26,60`).
- The employee language columns exist (`src/db/schema/auth.ts:25-26`) and are copied into the
  JWT/session (`src/lib/auth/options.ts:36-37,44-57`), but nothing consumes them for message
  selection or `Intl` formatting.
- Date rendering uses `new Date(ts*1000).toLocaleString()` with the server/browser default
  locale (e.g. `src/app/(secure)/sales/manage/page.tsx:36`;
  `src/components/cashups/cashups-table.tsx:19`), not `dateformat`/`timeformat`.
- Currency rendering uses `toFixed(2)` with no symbol/locale
  (`src/lib/pdf/invoice.tsx:50-65`; `src/lib/pdf/receipt.tsx:44-66`), except the sales
  register which reads `currency_symbol` (`src/app/(secure)/sales/register/page.tsx:58`).
- There is no RTL handling and no language-picker UI (the config `language` field is a free
  text input, `src/lib/config/tabs.ts:44`).
- Missing-key behaviour is next-intl's default: the key path is rendered/logged; there is no
  chained base-language fallback and no raw-key parity test. Because `en` is empty, every
  translation lookup fails if any is ever added without messages.

## 5. Commands, events and deployment requirements

### 5.1 Spark commands

There is exactly one application command: `App\Commands\EnvProvision`
(`app/Commands/EnvProvision.php`).

| Property | Value |
|---|---|
| group | `Environment` (`:29`) |
| name | `env:provision` (`:31`) |
| usage | `env:provision` (`:33`) |
| description | "Ensures the encryption and throttle keys are provisioned and converts any legacy CI3-encrypted secrets." (`:35`) |

Behaviour (`:37-93`):

1. `helper('security')`.
2. `provisionThrottleKey()` — generates/persists `throttle.key` if missing (`:41-42`).
3. If `encryption.key` is already ≥ 64 chars: report and return (`:44-52`).
4. If a short CI3 key exists: `CI3SecretConverter::decryptAll($key)`, then
   `rotateEncryptionKeyTransaction` with re-encrypt → verify → `saveAll` when any value is
   non-empty (`:54-77`).
5. If no key: `rotateEncryptionKeyTransaction(null, noop)` and warn if legacy secrets exist
   but cannot be decrypted (`:78-88`).

Deployment integration: `docker-compose.yml` runs
`php spark env:provision && exec apache2-foreground` before Apache starts (`:14`), with a
bind-mounted `./.env` that must already exist (`:22-26`, `create_host_path: false`) and
`CI_ENVIRONMENT=production`, `ALLOWED_HOSTNAMES`, `FORCE_HTTPS`, `PHP_TIMEZONE`,
`MYSQL_*` environment variables (`:29-36`). This is the Docker answer to a read-only or
missing `.env`: keys are provisioned before the web runtime needs them.

Other CI commands used by developers (not app commands): `php spark migrate`, `php spark
serve`, `php spark test` — standard framework commands; no app-specific migration or seed
command exists.

### 5.2 Events

`app/Config/Events.php` registers four listeners:

| Event | Listener | Behaviour | Citation |
|---|---|---|---|
| `pre_system` | closure | In non-testing: reject `zlib.output_compression`, flush all output buffers, start an identity output buffer. In debug non-CLI: register the DB toolbar collector and route `__hot-reload` in development. | `Events.php:29-59` |
| `post_controller_constructor` | `Load_config::load_config` | Destroy session when migrations stale; default/validate language; set CI locale; set PHP timezone; `bcscale` | `Events.php:61-62`; `Load_config.php:23-57` |
| `DBQuery` | `Db_log::db_log_queries` | When `App::$db_log_enabled`, append query, affected rows and duration to `writable/logs/Query-log-YYYY-MM-DD.log`; `db_log_only_long` suppresses queries ≤ 0.5 s | `Events.php:64-65`; `Db_log.php:16-58` |
| `pre_controller` | `Method::validate_method` | If the URI matches `/(save\|delete*\|remove*)/?<digits>` and the request is not POST with a non-empty `$_POST`, print `Method not allowed` and `die` | `Events.php:67-68`; `Method.php:7-19` |

`Method::validate_method()` is a crude method guard. It is not authorization, it does not
inspect the route, and it terminates with a plain-text 200 response (no status code), which
is exactly the kind of behaviour that a Next.js route handler must replace with a 405.

### 5.3 Environment and deployment requirements

`/.env.example` (upstream root; `env/.env.example` does not exist in this checkout):

| Variable | Default / example | Purpose | Citation |
|---|---|---|---|
| `CI_ENVIRONMENT` | `production` | Framework environment; also drives CSRF redirect and allowed-host strictness | `.env.example:5`; `app/Config/Security.php:85`; `app/Config/App.php:329` |
| `app.allowedHostnames` / `ALLOWED_HOSTNAMES` | `''` (must be set in production) | Comma-separated host whitelist | `.env.example:8-26`; `App.php:292-300` |
| `database.default.*` | `localhost/ospos/admin/pointofsale/MySQLi/ospos_` | Main DB connection | `.env.example:29-38` |
| `database.development.*`, `database.tests.*` | same shape | Dev/test groups | `.env.example:40-52` |
| `encryption.key` / `ENCRYPTION_KEY` | empty; auto-generated | CI4 encryption key (≥64 chars) | `.env.example:55-63`; `Encryption.php:110-125` |
| `throttle.key` / `THROTTLE_KEY` | empty; auto-generated | HMAC secret for throttle keys | `.env.example:64-70`; `security_helper.php:364-384` |
| `logger.threshold` | `0` | Log level | `.env.example:73-86` |
| `app.db_log_enabled` | `false` | Query logging | `.env.example:87`; `App.php:29` |
| `honeypot.hidden/label/name/template/container` | shown | Honeypot filter config | `.env.example:90-97` |
| `DISALLOW_PASSWORD_CHANGE` | `false` | Disable password changes | `.env.example:100-107`; `Employee.php:545`; `Employees.php:192` |
| `DISALLOW_GRANT_CHANGE` | `false` | Disable grant changes | `.env.example:110-116`; `Employees.php:183` |
| `FORCE_HTTPS` | not in example; read from `$_ENV` | Force `https` base URL | `App.php:302`; `docs/INSTALL.md:41-46` |
| `PHP_TIMEZONE` | Docker env | PHP `date.timezone` in the image | `Dockerfile:12-13`; `docker-compose.yml:33` |
| `throttle.capacity` | 5 (not in `.env.example`) | Login/migrate attempts per window; ≤0 disables | `Throttle.php:28-34` |
| `throttle.seconds` | 60 (not in `.env.example`) | Throttle window | `Throttle.php:36-40` |

**Server requirements** (`docs/INSTALL.md:3-7`): PHP ≥ 8.2.35 (8.2/8.3/8.4/8.5 supported;
≤ 8.1 unsupported) with `json, gd, bcmath, intl, openssl, mbstring, curl, xml`; MySQL 5.7 or
MariaDB 10.x; Apache 2.4 (Nginx documented on the wiki). SQLite is **not** supported
upstream: `Config\Database` uses MySQLi and `Config\OSPOS::getIndex()` calls
`mysqli_get_server_info()` (`app/Controllers/Config.php:255`),
`MY_Migration::runLocked()` uses `GET_LOCK` (`MY_Migration.php:72-82`), and
`migration_helper.php` queries `information_schema` throughout.

**Upstream Docker image** (`Dockerfile:1-28`): `php:8.2-apache`, installs `libicu-dev`,
`libgd-dev`, enables `mysqli bcmath intl gd`, `a2enmod rewrite`, sets
`date.timezone=${PHP_TIMEZONE}` and `expose_php=Off`, copies the app, runs
`composer check-platform-reqs --lock --no-dev`, then sets ownership/permissions:
`root:www-data`, `chmod -R go-w,o=`, `www-data` on `writable` and `public/uploads`,
`750` on `writable/{logs,uploads,cache}` and `public/uploads{,/item_pics}`, `640` on
`importCustomers.csv`, and symlinks the app into `/var/www` with `public` as docroot.

**Target Docker** (`docker/Dockerfile`, `docker/entrypoint.sh`, compose files):
- Node 20, multi-stage, `output: "standalone"` (`next.config.ts:4`);
- runtime copies `.next/standalone`, `.next/static`, `public`, `drizzle`;
- entrypoint runs migrations and seed then `node server.js`;
- SQLite compose sets `DB_DRIVER=sqlite`, `DATABASE_URL=file:/data/ospos.sqlite`,
  `ALLOWED_HOSTNAMES=localhost,127.0.0.1`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`
  (`docker/docker-compose.sqlite.yml:8-16`);
- MySQL compose adds MariaDB 11 with a healthcheck and `DATABASE_URL=mysql://...`
  (`docker/docker-compose.mysql.yml:2-29`).
- Missing versus upstream: no throttle env, no encryption/throttle key provisioning, no
  `CI_ENVIRONMENT` equivalent, no uploads volume/ownership handling, no Apache/TLS
  termination scripts (`docker/init-letsencrypt.sh`, `init-selfcert.sh`,
  `install-nginx.sh`, `uninstall.sh` are absent in the target).

## 6. Target gap analysis, file by file

Severity labels: **S1** data-loss/security, **S2** functional divergence, **S3** fidelity/
polish. Each finding names the upstream contract and the target evidence.

### 6.1 Configuration

#### `src/lib/config/tabs.ts`

- **S2 — only 12 of 17 upstream UI surfaces.** Upstream has info, general, tax, locale,
  barcode, stock, receipt, invoice, shortcuts, reward, table, and system (email, message,
  integrations, license, system info) — `app/Views/configs/manage.php:15-52`;
  `app/Views/configs/system_config.php:2-15`. Target tabs are general, locale, tax, sales,
  invoice, receipt, email, message, barcode, stock, reward, mailchimp
  (`src/lib/config/tabs.ts:16-216`). Missing tabs: `info` (merged into general), `shortcuts`,
  `table` (dinner tables), stock-location editor, license, system info.
- **S2 — 56 of 138 catalog keys absent from the field schema.** Machine diff against
  `docs/reconstruction/11-database.md:1480-1620`: target defines 82 catalog keys plus
  `mailchimp_api_key`, `mailchimp_list_id`, and an invented `default_tax_1_cumulative`
  (`tabs.ts:57`). Missing list:
  `account_number, allow_duplicate_barcodes, barcode_formats, category_dropdown,
  currency_code, date_or_time_format, default_receivings_discount,
  default_receivings_discount_type, default_register_mode, default_sales_discount_type,
  default_tax_jurisdiction, derive_sale_quantity, email_receipt_check_behaviour,
  enforce_privacy, financial_year, gcaptcha_enable, gcaptcha_secret_key, gcaptcha_site_key,
  giftcard_number, image_allowed_types, image_max_height, image_max_size, image_max_width,
  key_* (10), last_used_invoice_number, last_used_quote_number,
  last_used_work_order_number, line_sequence, login_form, notify_horizontal_position,
  notify_vertical_position, payment_message, print_delay_autoreturn,
  print_receipt_check_behaviour, quote_default_comments, receipt_font_size,
  receipt_show_company_name, receipt_show_tax_ind, sales_quote_format, statistics,
  suggestions_* (3), tax_id, theme, work_order_enable, work_order_format`.
- **S2 — control shapes are wrong for several fields.** `language` is free text instead of a
  select from `get_languages()` (`tabs.ts:44` vs `app/Views/configs/locale_config.php:219-224`);
  `timezone` is free text instead of `get_timezones()` (`tabs.ts:46` vs `locale_config.php:231-236`);
  `dateformat`/`timeformat` are free text instead of the fixed formats
  (`tabs.ts:42-43` vs `locale_config.php:243-256`); `cash_rounding_code` is a number instead
  of the rounding-mode select (`tabs.ts:76` vs `locale_config.php:152-157`);
  `currency_decimals`/`tax_decimals`/`quantity_decimals`/`cash_decimals` are numbers instead
  of constrained selects (`tabs.ts:38-41` vs `locale_config.php:79-140`);
  `barcode_type` options are lowercase `code39/code128/ean13/upca`
  (`tabs.ts:173-179`) while upstream/DB values are `C39/C128/EAN13/UPCA`
  (`docs/reconstruction/11-database.md:1497`; migration
  `20240319000000_Migration_Convert_Barcode_Types`);
  `barcode_content` adds `name`, which upstream does not support (`tabs.ts:165-170` vs
  `app/Views/configs/barcode_config.php:101-116`); `default_tax_1_cumulative` is not an
  upstream key at all.
- **S2 — `info` keys are editable as ordinary text.** `company_logo` is a text filename
  field (`tabs.ts:27`) rather than an upload with `is_image`/mime/ext/dimension rules
  (`app/Controllers/Config.php:337-377`). This lets an admin point the logo at any path under
  `public/uploads` and bypasses the validation contract.
- **S3 — no `theme` field at all**, so the `theme` key cannot be changed and the theme
  validation rule (`themeExists`, `app/Config/Validation/OSPOSRules.php:193-209`) has no
  target counterpart.
- **S3 — tab keys do not match the action names.** `saveInfoAction` uses `"info"`,
  `saveMessageAction` uses `"sms"`, `saveRewardsAction` uses `"rewards"`,
  `saveLocationsAction` uses `"stock_locations"`, `saveTablesAction` uses `"dinner_tables"`,
  `saveShortcutsAction` uses `"shortcuts"` (`src/app/(secure)/config/actions.ts:41-54`), but
  `CONFIG_TABS` contains none of those keys (it has `message`, `reward`, `stock`). Every one
  of those six actions throws `Error("Unknown tab")` (`actions.ts:11-13`).

#### `src/lib/config/index.ts`

- **S1 — stale-forever cache.** `cache` is a module-global `Map` with no TTL, no version
  check, and no cross-process invalidation (`:7-17`). It is only updated by `setConfig` in
  the same process (`:53`). Upstream's cache is invalidated on every model write and expires
  after the cache TTL (`app/Models/Appconfig.php:83-89,114-118`; `app/Config/OSPOS.php:74-78`;
  `app/Config/Cache.php:52-59`).
- **S2 — missing default settings map.** Upstream returns six defaults when `app_config`
  does not exist or the DB throws (`app/Config/OSPOS.php:59-69`); the target has no
  equivalent and returns `""`/caller default for every missing key
  (`index.ts:19-21`). Login page rendering can therefore miss `language`, `company`,
  `barcode_type`, `invoice_enable`, `work_order_enable`.
- **S2 — boolean/number coercion is more permissive and not upstream-shaped.**
  `getConfigBool` accepts `"1"`, `"true"`, `"TRUE"` (`:23-27`); upstream stores PHP booleans
  as `1`/`0` and compares `== 1` in views (e.g. `app/Views/configs/general_config.php:121`).
  `getConfigNumber` accepts any `Number()` including floats and `Infinity` (`:29-34`), while
  upstream uses `FILTER_SANITIZE_NUMBER_INT` for integer fields.
- **S1/S2 — sequence SQL is SQLite-only.** `acquireNextSequence` uses
  `CAST(... AS INTEGER)` and `.returning()` (`:56-72`), which does not work on MySQL
  (`SIGNED` required). It is used by `src/lib/token/index.ts:116-121` and
  `src/lib/sale/sale-model.ts:57-59`, both of which also use `getDbSync()` and therefore
  only run on SQLite. Upstream has three sequence methods used by token rendering
  (`app/Models/Appconfig.php:147-187`;
  `app/Models/Tokens/Token_invoice_sequence.php:36-42`), with a `save=false` probe.
- **S2 — encrypted-key set is derived from the UI schema.** `ENCRYPTED_KEYS` is built from
  `CONFIG_TABS` (`tabs.ts:218-220`). If a tab/key is removed from the UI, decryption stops
  working even though the row is still encrypted. Upstream's legacy list is explicit and
  includes keys the UI never shows (`CI3SecretConverter::LEGACY_KEYS`,
  `app/Libraries/CI3SecretConverter.php:32-38`).

#### `src/app/(secure)/config/actions.ts`

- **S2 — no validation/coercion.** Values are taken as raw strings; checkboxes become
  `"1"`/`"0"`; there is no `FILTER_SANITIZE_NUMBER_INT`, no `parse_decimals`, no theme
  whitelist, no language whitelist, no negative-tax check, no mailpath path validation, no
  receipt-template/invoice-type whitelist, no shortcut whitelist/duplicate check
  (`actions.ts:9-33`). Upstream rules are enumerated in §1.3/§1.4
  (`app/Controllers/Config.php:388-394,500-512,564-575,953-958,1076-1078,1118-1131,1164-1166`).
- **S2 — one row at a time, no transaction.** `setConfig` is called per field in a loop
  (`actions.ts:13-30`); a mid-loop failure leaves a partially saved tab. Upstream uses
  `batch_save` in a transaction (`Appconfig.php:100-119`), and four tabs add an outer
  transaction (`Config.php:427-446,783-798,906-939,989-1029`).
- **S1 — encrypted secrets are sent to the browser in plaintext.** `ConfigPage` decrypts
  every encrypted field and passes `encryptedValues` to the client component
  (`src/app/(secure)/config/page.tsx:11-21`); `ConfigTabs` renders them into password inputs
  with `defaultValue` (`src/components/config/config-tabs.tsx:40,52-54`). Upstream never
  sends `smtp_pass`/`msg_pwd`/Mailchimp key values: it sends only `*_set` booleans and
  placeholder text (`app/Controllers/Config.php:270-292`;
  `app/Views/configs/email_config.php:121-126`; `message_config.php:39-44`;
  `integrations_config.php:23-29`).
- **S2 — no child-table management.** `saveLocationsAction`, `saveTablesAction`,
  `saveRewardsAction` route through the config-key loop and cannot edit
  `stock_locations`/`dinner_tables`/`customers_packages` (`actions.ts:48-50`); upstream
  implements full CRUD/reorder/default semantics (`Config.php:771-895,904-942,987-1032`).
- **S2 — no side effects.** No `modules.sort` update for `show_office_group`, no category
  attribute-definition create/delete, no sale-mode reset after invoice save, no Mailchimp
  list probe, no ICU number-locale probe (`actions.ts:61-68` stubs both probes; upstream
  `Config.php:425-440,1171-1179,286-294,457-489`).
- **S3 — no CSRF token handling.** Next.js server actions carry built-in Origin checks, but
  the upstream contract is an explicit `csrf_ospos_v4` token on every POST
  (`app/Config/Security.php:36`; `app/Views/partial/header_js.php:37-62`). No target
  equivalent exists.

#### `src/components/config/config-tabs.tsx`

- **S3 — no conditional visibility/field grouping.** Every field is rendered unconditionally
  (`:39-58`); upstream disables/validates groups per tab (§1.4.3).
- **S3 — no numeric input constraints.** `type="number"` is used
  (`:53`) but no `min`/`max`/`step` from the upstream views (e.g.
  `app/Views/configs/barcode_config.php:31-40`; `general_config.php:58-66`).
- **S3 — no per-tab save result keyed by tab.** `saveConfigTabAction(active, fd)` returns
  `{ok,tab}` (`actions.ts:32`) but the component only sets `"Saved"` (`:21`), so it cannot
  distinguish upstream's per-tab success message.
- **S2 — `Save ${tab.label}` is the only affordance**, so the six broken actions above are
  user-visible failures rather than hidden dead code.

#### `src/db/seed.ts`

- **S1 — 52 catalog keys missing, 4 invented, 29 value differences.** Verified against
  `docs/reconstruction/11-database.md` Appendix A (which states 52/4/29; the earlier D8 row
  in the same document still says 48/25 and is stale). Missing keys are the same list as
  §6.1, plus `customer_reward_enable`, `default_tax_category`, `default_tax_code`,
  `default_tax_jurisdiction`, `receiving_calculate_average_price`, `company_logo`,
  `currency_code`. Invented: `mailchimp_api_key`, `mailchimp_list_id`,
  `receipt_invoice_count`, `receipt_quote_count` (`seed.ts:12-103`).
  Value drift examples: `barcode_type` `C128` vs `C39`; `barcode_first_row` `name` vs
  `category`; `barcode_page_width` `150` vs `100`; `smtp_port` `587` vs `465`;
  `smtp_crypto` `tls` vs `ssl`; `number_locale` `en-US` vs `en_US`; `timezone` `UTC` vs
  `America/New_York`; `timeformat` `H:i` vs `H:i:s`; `payment_options_order`
  `cashdebitcreditcheckdue` vs `cashdebitcredit`; `notify_*` right/top vs center/bottom.
- **S1 — module seed drifts.** Upstream `name_lang_key`/`desc_lang_key` are `module_<id>` /
  `module_<id>_desc` (`initial_schema.sql:311-322`) and the `home`/`office` rows have sort 1
  (`3.1.1_to_3.2.0.sql:8-10`); target seeds display labels (`"Config"`, `"Customers"`, …) and
  all business modules `sort: 0`, office `999` (`seed.ts:105-124`). This breaks the language
  lookup in `Module::get_module_name()` (`app/Models/Module.php:27-39`, which calls
  `lang('Module.'.$module_id)`) and changes `getAllowedModules` semantics (§2.3.7).
- **S1 — permission seed drifts.** Target defines 37 permissions
  (`seed.ts:126-164`), upstream final has 36; target invents `reports_expenses`,
  `reports_cashups`, `module_home` and omits `reports_expenses_categories` and
  `reports_sales_taxes`; location-scoped permissions are inserted without a `location_id`
  (`seed.ts:209-214`). See `docs/reconstruction/11-database.md` D10.
- **S1 — grant matrix drifts.** Target grants every permission with
  `menu_group: "both"` (`seed.ts:216-222`); upstream uses home/office/`--` values
  (`3.1.1_to_3.2.0.sql:5-23,67-68`; `3.3.0_attributes.sql:54-55`).
- **S2 — no `sessions`/`migrations`/`attribute` parity.** Seed does not populate
  `attribute_definitions` for `category_dropdown`, and does not account for the target's
  reduced schema (§11-database D1-D14).
- **S2 — seed skip is all-or-nothing.** `existing admin → return` (`seed.ts:172-176`)
  silently leaves a partially seeded DB (the actual `sqlite.db` has 28 permissions/grants,
  not 37 — `docs/reconstruction/11-database.md:2250`).

#### `src/db/schema/config.ts`

- Shape matches upstream logically (`key` PK, `value` not null) but uses unbounded `text`
  instead of `varchar(50)`/`varchar(500)` (`src/db/schema/config.ts:3-6` vs
  `initial_schema.sql:5-9`). No index/ordering beyond PK. **S3** unless MySQL strict mode is
  required.

### 6.2 Authentication and RBAC

#### `src/lib/auth/options.ts`

- **S1 — `allowedHostnames` is not a NextAuth v5 config option.** It is spread into the
  config object (`:12-16`), but Auth.js v5 supports `trustHost` and does not document an
  `allowedHostnames` key; with `satisfies NextAuthConfig` this is at best ignored and at
  worst a TypeScript excess-property error. Host enforcement exists only in `src/proxy.ts`
  (`:11-25`). Upstream enforces the host in `App::getValidHost()`
  (`app/Config/App.php:322-360`).
- **S1 — production boot check is weaker than upstream.** Target throws at module import
  when `ALLOWED_HOSTNAMES` is missing in production (`:5-10`); `src/proxy.ts` only logs and
  keeps running (`:6-9`) and then 403s every request (`:23-25`). Upstream throws in
  production (`App.php:341-343`) and the docs say the app "will fail to start"
  (`docs/INSTALL.md:13,28-34`).
- **S2 — JWT session instead of server session.** `strategy:"jwt"`, `maxAge` 7 days
  (`:17`) vs upstream DB sessions with 2-hour expiration, `matchIP=true`, and
  `regenerateDestroy` (`app/Config/Session.php:45,74,94`). Logout is a form POST to
  `/api/auth/signout` (`src/app/(secure)/layout.tsx:33-42`); there is no session destroy in
  a database and no server-side revocation.
- **S2 — no `hash_version 1` guard at the provider layer**: the upgrade happens inside
  `verifyPassword` (`src/lib/auth/password.ts:45-54`), which is fine, but the provider
  returns a user for `deleted=false` only (`password.ts:42`) and does not check
  `is_logged_in`/migration state. There is no equivalent of `login_check`'s installation
  extension check or gCaptcha (`app/Config/Validation/OSPOSRules.php:37-53`).
- **S2 — no migration gate on login.** A fresh/outdated database is served the normal login
  page; migrations are only run by the Docker entrypoint or `/api/migrate`
  (`src/app/api/migrate/route.ts`). Upstream blocks the login page until migrations are
  current (`app/Controllers/Login.php:26-80`; `app/Events/Load_config.php:37-40`).
- **S3 — no per-employee language consumption.** `language`/`languageCode` are put in the
  token (`:36-37,44-57`) but never read.

#### `src/lib/auth/password.ts`

- **S2 — bcrypt cost 10 fixed** (`:7,17,49`) vs PHP `PASSWORD_DEFAULT` (10 on ≤8.3, 12 on
  ≥8.4). Hashes created by PHP 8.4 remain verifiable (`compare` handles any cost), but new
  target hashes are weaker on 8.4 deployments.
- **S2 — `verifyPassword` updates the password row but does not refresh any cache/session**
  (`:49-54`); upstream also regenerates the session on hash upgrade
  (`app/Models/Employee.php:392-396`).
- **S3 — no MD5 constant-time compare** (`:47`), matching upstream's plain `===`
  (`Employee.php:387`).

#### `src/lib/auth/rbac.ts`

- **S1 — `hasGrant` grants admins implicit access** (`:34`); upstream `has_grant` does not
  (`app/Models/Employee.php:472-486`). A missing grant row for an admin is silently allowed.
- **S3 — `isAdmin` semantics differ subtly.** Target checks exact grant rows for the 11
  `ADMIN_MODULES` (`:18-29`) — same list as upstream (`app/Config/Constants.php:179`), and
  person 1 is always admin — but upstream `isAdmin` calls `has_grant`, which itself is exact.
  The difference is only the person-1 shortcut, which upstream also has
  (`Employee.php:564-568`). This is **S3**, not S1; the real S1 is the `hasGrant` shortcut.
- **S2 — `hasModuleGrant` matches upstream's LIKE logic** (`:44-71`) except it adds an
  impossible direct fallback (`:52-59`) and short-circuits admin (`:45`). The SQL is
  `permission_id LIKE '<module>%'`; note `_` is a wildcard in both upstream and target.
  **S2** because the admin shortcut changes access for person 1 with missing grants.
- **S1 — `getAllowedModules` filters `modules.sort = 0`** (`:85`) whereas upstream filters
  `sort != 0` (`app/Models/Module.php:106,124`). On a migrated upstream DB this yields an
  empty menu; on the target seed it yields all rows because the seed sets sort 0. It also
  includes `home`/`office` rows as ordinary modules (`:87`), and `Sidebar` then prints
  `m.nameLangKey` raw (`src/components/shared/sidebar.tsx:83,91`), so the menu shows
  `module_config`/`Config` rather than a translation.
- **S2 — no `get_menu_group` equivalent**; the menu group is a parameter with default
  `"both"` (`:73`), and `Sidebar` ignores office/home grouping except for the hard-coded
  `office` section (`sidebar.tsx:69-105`). Upstream persists `menu_group` in the session and
  switches lists (`app/Controllers/Secure_Controller.php:52-62`).

#### `src/lib/auth/with-permission.ts`

- **S1 — deny logic is a disjunction** (`:14`) versus upstream's conjunction
  (`app/Controllers/Secure_Controller.php:44-47`). Any parent grant now implies every
  subpermission. This is exploitable for `reports_*` and `sales_delete`.
- **S2 — redirects instead of throwing a `RedirectException`; no AJAX 401 distinction**
  (`:6-16`). Upstream returns 401 JSON for AJAX so the JS can redirect
  (`app/Filters/IsLoggedIn.php:17-25`); target server actions return a redirect/exception.
- **S2 — no distinction between module and submodule checks in the error path**: redirects
  to `/no_access/<module>/<submodule>` but the page ignores params
  (`src/app/(secure)/no_access/[module]/[submodule]/page.tsx:3-15`).

#### `src/proxy.ts`

- **S1 — `/api/migrate` is explicitly public.** `isPublic` includes
  `path.startsWith("/api/migrate")` (`:28`), and the NextAuth `authorized` callback does the
  same (`src/lib/auth/options.ts:61`). `POST /api/migrate` therefore runs
  `execSync("npm run db:migrate")` with no authentication
  (`src/app/api/migrate/route.ts:6-13`). Upstream requires credentials for a non-new install
  (`app/Controllers/Login.php:114-129`).
- **S1 — host check uses `req.nextUrl.hostname || host header`** (`:22`); `nextUrl.hostname`
  is derived from the inbound Host header, and proxies may rewrite it. Upstream validates
  `HTTP_HOST` against the whitelist and falls back to the first allowed host
  (`app/Config/App.php:322-360`). The target **always allows loopback hosts**
  (`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`) even in production (`:14-15`), which upstream
  does not do (upstream requires them in `allowedHostnames`), and it 403s every non-loopback
  host when `ALLOWED_HOSTNAMES` is unset (`:16-17`), a deliberate fail-closed choice that
  differs from upstream's throw-at-boot.
- **S2 — `authorized` callback in `options.ts:59-65` and the proxy duplicate the same
  logic.** Two gates can drift; the proxy is the one that actually runs for matched routes.
- **S3 — matcher excludes static assets** (`:37-39`), reasonable, but it also excludes any
  path ending in the listed extensions anywhere, not just under `/public`.

#### `src/app/(auth)/login/page.tsx`, `src/app/(auth)/layout.tsx`

- **S2 — no migration UI.** The page always shows the credential form
  (`:52-116`) and calls `signIn("credentials")` (`:20-24`). Upstream shows
  initialize/migrate states and a progress UI (`app/Views/login.php:57-153,207-323`).
- **S2 — no gCaptcha** (`options.ts:19-40` has only username/password); upstream renders and
  verifies it when `gcaptcha_enable` is on (`app/Views/login.php:137-140`;
  `app/Config/Validation/OSPOSRules.php:44-53,71-97`).
- **S2 — no brute-force throttling** (see §2.6); upstream returns 429 after 5 POSTs per
  60 s per IP/username.
- **S2 — hard-coded error text** `"Invalid username or password"` (`:27`) instead of the
  translated message; the default-credentials hint is printed on the login page
  (`:112-116`), which upstream does not do.
- **S3 — `AuthLayout` redirects any authenticated user to `/`** (`:4-7`), so an employee
  cannot reach `/login` to switch accounts without logging out.
- **S3 — `callbackUrl` is taken from the query and pushed unchecked** (`:10,30`); NextAuth
  normally validates callbacks, but the client-side `router.push` will follow an
  open-redirect-looking absolute URL if one is supplied.

#### `src/app/(secure)/change-password/*`, `src/app/(secure)/employees/actions.ts`

- **S1 — old-password check is broken.** `verifyPassword(oldPassword, emp.password)` passes
  the hash as the password and uses the returned Promise as a boolean
  (`src/app/(secure)/employees/actions.ts:96-97`); the check never fails.
- **S2 — minimum length 4** (`src/app/(secure)/change-password/actions.ts:14`; duplicated in
  `src/app/(secure)/home/actions.ts:15`) vs upstream 8 (`app/Controllers/Home.php:90-97`).
  Upstream also requires the current password for the self-service form; the target form has
  no current-password field (`src/app/(secure)/change-password/page.tsx:11-21`).
- **S2 — `DISALLOW_PASSWORD_CHANGE` and `DISALLOW_GRANT_CHANGE` are not honored**
  (no reads anywhere in `src/`; upstream `app/Models/Employee.php:545`;
  `app/Controllers/Employees.php:183,192`).
- **S1 — employee password changes bypass `canModifyEmployee`.** Upstream prevents
  non-admins from modifying admins (`app/Models/Employee.php:584-595`); target only checks
  `personId === 1` and admin-only deletes (`src/app/(secure)/employees/actions.ts:20-22,66-71`).
- **S3 — `change-password` redirects to `/home?changed=1`**, but the secure route is `/`
  and `/home` is a separate page (`src/app/(secure)/home/page.tsx` exists), so this is at
  least consistent; verify the query flag is consumed.

### 6.3 Encryption

#### `src/lib/encryption/index.ts`

- **S1 — incompatible cipher/key derivation.** AES-256-GCM with `scrypt(ENCRYPTION_KEY,
  "ospos-salt")` (`:5-6,36-39`) vs CI4 OpenSSL AES-256-CTR + HMAC-SHA512, key used directly
  with optional `hex2bin:`/`base64:` prefixes (`app/Config/Encryption.php:54,75,108,131-157`).
  Existing OSPOS ciphertext cannot be decrypted by the target and vice versa.
- **S1 — no CI3 conversion.** Upstream `CI3SecretConverter` decrypts the five legacy keys
  with AES-128-CBC and re-encrypts (`app/Libraries/CI3SecretConverter.php:32-38,57-88`).
  Target `decrypt()` accepts only `iv:tag:data` and throws otherwise (`:50-59`).
- **S2 — key provisioning is unsafe under concurrency.** `ensureKey()` generates a key and
  writes `.env` with no lock and no atomic rename (`:13-34`); two workers can generate
  different keys and one wins, leaving ciphertext encrypted under the losing key.
  Upstream holds a file mutex and uses `atomicWriteFile` (`security_helper.php:16-38,
  133-178,406-473`).
- **S2 — validation rejects valid upstream forms.** `key.length < 64 || !/^[0-9a-f]+$/`
  (`:15`) rejects `hex2bin:`/`base64:` strings that upstream accepts
  (`app/Config/Encryption.php:131-142`).
- **S2 — no previous-key rotation support** (`app/Config/Encryption.php:26-41` documents
  `previousKeys`); target has a single key.
- **S3 — `void ensureKey;`** at `:62` is a no-op; key generation only happens on first
  encrypt/decrypt, so `ENCRYPTION_KEY` may be absent at boot.

### 6.4 Install / migration / session

#### `src/app/api/migrate/route.ts`

- **S1 — unauthenticated arbitrary command execution surface.** `POST` runs
  `execSync("npm run db:migrate", { stdio: "inherit" })` (`:6-13`); the route is public in
  `src/proxy.ts:28` and `src/lib/auth/options.ts:61`, so any network client can trigger
  migrations. Upstream requires username/password for a non-new install and throttles
  (`app/Controllers/Login.php:114-129`; `app/Config/Filters.php:115-117`).
- **S2 — no migration state/version response.** `GET` returns `{ok:true,endpoint:'migrate'}`
  (`:15-17`); upstream returns current/latest version and distinguishes 0/null
  (`app/Controllers/Login.php:101-109`).
- **S2 — no lock and no 202.** Concurrent POSTs both run migrations; upstream
  `GET_LOCK(...,0)` returns 202 for a conflict (`MY_Migration.php:66-84`;
  `Login.php:143-149`).
- **S2 — error leaks the raw exception message** (`:11`), including command output;
  upstream returns `'Migration failed: '.$e->getMessage()` only after logging
  (`Login.php:151-156`) — both leak, but the target also inherits `execSync` stderr.

#### `src/db/migrate.ts`, `src/db/schema/misc.ts`

- **S2 — no CI4-shaped `migrations` table.** Drizzle's journal is used instead
  (`src/db/migrate.ts:1-9`); the target mirror has no `group`/`batch` and `version` is
  `integer` (`src/db/schema/misc.ts:3-9`; `drizzle/sqlite/0000_skinny_power_man.sql:410-416`).
  There is no CI3 history conversion, no batch semantics, and no way to import an existing
  OSPOS DB's migration state.
- **S2 — fresh-install detection absent.** `migrate.ts` always runs all Drizzle files; it
  cannot distinguish an empty DB from an outdated one, so the target cannot implement the
  upstream login gate without a new version probe.

#### `src/db/schema/auth.ts` (sessions)

- **S2 — sessions table shape wrong.** `id` sole PK, `timestamp` integer
  (`src/db/schema/auth.ts:54-59`) vs upstream `PK(id, ip_address)`, SQL `timestamp`, `blob`
  data (`3.4.1_migrate_sessions_table.sql:1-10`). Unused by NextAuth, so currently dead
  schema; a future DB-session implementation must fix it.
- **S2 — `cart_sessions` is target-invented** (`:61-66`); upstream stores sale/receiving
  state in the CI session (`app/Libraries/Sale_lib.php:53,177+`), so this is a new data
  model to reconcile.
- **S3 — `employees.hash_version` default 2 and nullable language columns match upstream**
  (`:23-26` vs `initial_schema.sql:116-124`, `3.1.1_to_3.2.0.sql:108-111`).

#### `docker/*`

- **S2 — no key provisioning step.** `entrypoint.sh` runs migrate/seed only (`:5-14`);
  upstream runs `php spark env:provision` (`docker-compose.yml:11`). With
  `ENCRYPTION_KEY` unset, the first encryption call tries to rewrite `.env`; in a container
  with a read-only or absent `.env` this throws (`src/lib/encryption/index.ts:17-32`).
- **S2 — no uploads volume/permission contract.** Upstream bind-mounts uploads/logs and
  chmods 750/640 (`docker-compose.yml:27-28`; `Dockerfile:21-28`); target has only the DB
  volume (`docker/docker-compose.sqlite.yml:15-16`;
  `docker/docker-compose.mysql.yml:7-8`).
- **S3 — default secrets in compose.** `NEXTAUTH_SECRET/AUTH_SECRET` default to
  `change-me-in-production` (`docker/docker-compose.sqlite.yml:13-14`;
  `docker/docker-compose.mysql.yml:30-31`).

### 6.5 i18n

#### `src/lib/i18n/index.ts`, `src/messages/**`

- **S1 — i18n is effectively disabled.** Only `en` is supported (`:4-9`) and
  `src/messages/en/common.json` is `{}`. Every UI string is hard-coded English across the
  app (examples in §4.5). Upstream ships 46 locales × 24 files (1,104 files) with a key
  parity test.
- **S2 — no fallback chain.** next-intl falls back only if configured; target has no
  base-language (`en-GB`→`en`) or raw-key fallback (`MY_Language.php:20-39`).
- **S2 — no language picker or employee override consumption.** `locales` excludes all 46
  upstream directories; the JWT language fields are unused (`options.ts:36-37,44-57`).
- **S2 — no date/number/currency formatting helpers.** Rendering uses `toLocaleString()` and
  `toFixed(2)` (§4.5), ignoring `dateformat`, `timeformat`, `number_locale`,
  `currency_symbol`, `currency_decimals`, `tax_decimals`, `quantity_decimals`,
  `thousands_separator` (`app/Helpers/locale_helper.php:299-452`).
- **S3 — locale directory names drift**: upstream `hr`, `sw-KE`, `sw-TZ`; target has
  `hr-HR` and additionally `bn` (`src/messages/`), which is not an upstream locale. No
  `supportedLocales` equivalent exists.

### 6.6 Tests

- **S1 — no unit tests for config/auth/migration/i18n.** Target has
  `src/lib/auth/rbac.test.ts` (RBAC only), `items/repository.test.ts`,
  `sale/sale-lib.test.ts`, `tax/tax.test.ts`. There are no tests for
  `src/lib/config/*`, `src/lib/auth/password.ts`, `src/lib/auth/with-permission.ts`,
  `src/proxy.ts`, `src/lib/encryption/*`, `src/lib/i18n/*`, or the migrate route.
- **S2 — e2e coverage is shallow.** `e2e/config.spec.ts` covers only page load, company name,
  and currency symbol (`:3-36`); `e2e/auth.spec.ts` covers valid/invalid login and
  unauthenticated redirect (`:3-27`). There is no test for tabs that throw, encryption
  round-trips, RBAC denial, migration states, throttling, or i18n.
- **Upstream test anchors to port** (§7): `tests/Models/AppconfigTest.php:35-74`,
  `tests/Config/OSPOSTest.php:11-23`, `tests/Config/AppTest.php:32-201`,
  `tests/Config/EncryptionTest.php:14-42`, `tests/Controllers/ConfigControllerTest.php`
  (mailpath, locale, theme, tax, locations),
  `tests/Controllers/LoginTest.php:80-163`, `tests/Filters/ThrottleTest.php:54-202`,
  `tests/Helpers/security_helperTest.php:212-670`, `tests/LanguageFilesTest.php:34-128`.

## 7. Ordered implementation obligations

Ordering rationale: the data/security substrate must exist before the UI can be correct.
Implement in this order: **S** (schema, migration, encryption, session, endpoint security)
→ **A** (RBAC, login, host/filters, throttle) → **C** (config catalog, cache, UI, saves) →
**I** (i18n). Within each group the numbered order is the dependency order. Every obligation
names target files, the upstream contract it must satisfy, and at least one acceptance test
that can be ported from the upstream suite.

### Phase S — substrate and security

#### S-1 Migration version table and runner

- **Target files:** `src/db/schema/misc.ts`, `src/db/migrate.ts`,
  `src/app/api/migrate/route.ts`, `src/db/schema/mysql/index.ts`,
  `drizzle/sqlite/*`, `drizzle/mysql/*`.
- **Contract:** a `migrations` table with `id`, `version varchar(255)`, `class`, `group`,
  `namespace`, `batch`, `time` (CI4 shape, §3.2.2); `getCurrentVersion()` returning 0 for an
  empty DB, `null` for an unreachable DB; `latest` computed from the highest migration;
  CI3 history import (batch 1) when `migrations` exists without `id`.
- **Acceptance:** port the version/empty/unreachable cases exercised indirectly by
  `tests/Controllers/LoginTest.php` and `tests/Models/AppconfigTest.php` DB bootstrap; add a
  test that a CI3-shaped table is converted and history rows are batch 1; add a test that two
  concurrent migrate calls yield one success and one 202/conflict.

#### S-2 Migration lock and endpoint authorization

- **Target files:** `src/app/api/migrate/route.ts`, `src/proxy.ts`,
  `src/lib/auth/options.ts`, `src/db/migrate.ts`.
- **Contract:** `/api/migrate` is POST-only; a new install (version 0) may run unauthenticated;
  an existing install requires valid credentials (`username`/`password` with the same
  `login_check` semantics); a non-blocking lock returns 202; DB down returns 503; failure
  returns 500 after logging; success returns 200 JSON. GET must not run migrations.
- **Acceptance:** port the upstream status-code matrix from `tests/Controllers/LoginTest.php`
  and add route tests for 401/202/503/500/200.

#### S-3 Session store

- **Target files:** `src/db/schema/auth.ts`, `src/lib/auth/options.ts`,
  `src/lib/db/*`, `docker/*`.
- **Contract:** either (a) reimplement DB sessions with `PK(id, ip_address)`,
  `timestamp`/`blob`, 7200 s expiration, `matchIP=true`, `timeToUpdate=300`,
  `regenerateDestroy=true` and a session ID regenerated on login; or (b) explicitly choose
  JWT and document the divergence. If (b), keep the `sessions` table unused but correctly
  shaped for import compatibility, and implement logout revocation semantics.
- **Acceptance:** session survives normal navigation, expires after 7200 s idle, is rejected
  from a different IP when `matchIP`, and a login upgrade regenerates the ID
  (upstream `Employee::login`, `Employee.php:378-411`).

#### S-4 Encryption compatibility and key lifecycle

- **Target files:** `src/lib/encryption/index.ts`, `src/lib/config/index.ts`,
  `docker/entrypoint.sh`, `docker/Dockerfile`.
- **Contract:** support the CI4 key sources (`encryption.key`, `ENCRYPTION_KEY`, `hex2bin:`/
  `base64:` prefixes), CI4 ciphertext (AES-256-CTR + HMAC-SHA512, base64, configurable key
  info), previous-key fallback, and the CI3 legacy keys
  (`clcdesq_api_key`, `clcdesq_api_url`, `mailchimp_api_key`, `mailchimp_list_id`,
  `smtp_pass`) with AES-128-CBC conversion. Key provisioning must use a lock and atomic
  write, fail with an actionable error when `.env` is not writable, and run before the server
  starts in Docker.
- **Acceptance:** port `tests/Helpers/security_helperTest.php:336-670` (valid key, missing
  key provisioning, non-writable env, CI3 conversion, rollback on save failure, throttle key,
  rotation backup) and add a round-trip test that reads a CI4 fixture ciphertext.

#### S-5 Encryption key/throttle secret provisioning command

- **Target files:** `src/lib/encryption/index.ts`, a new `scripts/env-provision.ts` or
  equivalent, `docker/entrypoint.sh`.
- **Contract:** idempotent `env:provision` equivalent: ensure `ENCRYPTION_KEY` and
  `THROTTLE_KEY`, convert legacy secrets, warn when legacy secrets exist but no old key.
- **Acceptance:** port `tests/Helpers/security_helperTest.php:597-628` and
  `app/Commands/EnvProvision.php` behaviour cases.

#### S-6 Install/upgrade flow

- **Target files:** `src/app/(auth)/login/*`, `src/app/api/migrate/route.ts`,
  `docker/entrypoint.sh`, `docker/docker-compose.*.yml`, `docs/`.
- **Contract:** login page must distinguish new install / migration required / current, hide
  credentials for a new install, run migrations from the login POST, destroy sessions when
  migrations are stale, and return the documented status codes.
- **Acceptance:** e2e: fresh DB shows initialization, after migration shows login, admin/
  pointofsale logs in; outdated DB shows migration-required and destroys the session.

### Phase A — authentication and authorization

#### A-1 Fix `hasGrant`/`requirePermission` semantics

- **Target files:** `src/lib/auth/rbac.ts`, `src/lib/auth/with-permission.ts`,
  `src/lib/auth/rbac.test.ts`.
- **Contract:** `hasGrant` must be an exact grant test with **no admin shortcut**
  (`app/Models/Employee.php:472-486`); `requirePermission(module, submodule)` must be a
  **conjunction** of module and submodule checks (`Secure_Controller.php:44-47`); admins may
  still bypass at the controller guard level only where upstream does (`isAdmin`).
- **Acceptance:** extend `src/lib/auth/rbac.test.ts` with: parent grant does not imply
  `sales_delete`; submodule grant does not imply parent; `hasGrant` for an admin without the
  row is false; person 1 always `isAdmin`.

#### A-2 Fix menu queries and module/permission/grant seeds

- **Target files:** `src/lib/auth/rbac.ts`, `src/db/seed.ts`,
  `src/components/shared/sidebar.tsx`, `src/db/schema/auth.ts`.
- **Contract:** `getAllowedModules` must filter `modules.sort != 0`
  (`app/Models/Module.php:98-128`), join parent module permissions, honor
  `menu_group home/office/both` with the upstream inverted home/office rows, and seed
  `module_<id>` language keys, sort 10–120, the full 36-permission set, and the home/office/
  `--` grant matrix (`initial_schema.sql:311-322`; `3.1.1_to_3.2.0.sql:8-23,67-68`;
  `3.3.0_attributes.sql:54-55`; `3.3.0_indiagst.sql:96-100`; `20210714140000`).
- **Acceptance:** a migrated upstream DB yields the same sidebar as upstream; a user with
  only `reports_sales` sees no Reports entry; office/home icons follow `show_office_group`;
  labels come from `Module.*` translations.

#### A-3 Login parity: hash upgrade, session regeneration, installation check

- **Target files:** `src/lib/auth/password.ts`, `src/lib/auth/options.ts`,
  `src/app/(auth)/login/*`.
- **Contract:** MD5 `hash_version=1` upgrade on successful login, bcrypt with
  `PASSWORD_DEFAULT` (or documented fixed cost), session regeneration before setting the
  identity, soft-deleted users rejected, required-extension check, optional gCaptcha, and
  the exact error messages.
- **Acceptance:** port `tests/Controllers/LoginTest.php:80-163`; add unit tests for
  hash_version 1 upgrade and `deleted=1` rejection.

#### A-4 Password change policy and flags

- **Target files:** `src/app/(secure)/change-password/*`,
  `src/app/(secure)/employees/actions.ts`, `src/lib/auth/password.ts`.
- **Contract:** minimum length 8 (upstream `Home.php:90-97`), require and verify the current
  password, hash with `PASSWORD_DEFAULT`, set `hash_version=2`, honor
  `DISALLOW_PASSWORD_CHANGE` and `DISALLOW_GRANT_CHANGE`, and enforce
  `canModifyEmployee`-equivalent rules for admin targets.
- **Acceptance:** wrong current password → error; short password → error; flag true → no
  update; non-admin cannot change an admin; self-change works.

#### A-5 Host/CSRF/secure headers

- **Target files:** `src/proxy.ts`, `src/lib/auth/options.ts`, `next.config.ts`.
- **Contract:** production must fail closed when `ALLOWED_HOSTNAMES` is missing (or 403 every
  request consistently, documented); reject/rewrite hosts per upstream
  (`app/Config/App.php:322-360`); keep CSRF-equivalent protection on every state-changing
  server action; keep the static security headers.
- **Acceptance:** port `tests/Config/AppTest.php:32-201` (valid, invalid→fallback, dev
  fallback, prod throw, missing host, env parsing); add a proxy test for 403/redirect/401.

#### A-6 Login throttling

- **Target files:** `src/proxy.ts` or a new `src/lib/auth/throttle.ts`,
  `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/db` (cache table if needed),
  `.env` handling.
- **Contract:** POST-only, key by HMAC(IP) and HMAC(lowercased username), capacity 5 /
  60 s defaults, `throttle.capacity <= 0` disables, invalid values fall back, 429 JSON with
  `Login.too_many_attempts`, per-server cache, throttle key from `THROTTLE_KEY`.
- **Acceptance:** port `tests/Filters/ThrottleTest.php:54-202` and the login integration
  cases (`LoginTest.php:107-163`).

#### A-7 Login page states and employee-language wiring

- **Target files:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/layout.tsx`,
  `src/app/(secure)/layout.tsx`, `src/lib/auth/options.ts`.
- **Contract:** initialize/migrate/login states, progress/error UI, gCaptcha widget, no
  default-credential hint, and the session language is available to the i18n layer.
- **Acceptance:** e2e state matrix; session exposes `language`/`languageCode`; login page
  never prints credentials in production.

### Phase C — configuration

#### C-1 Config key schema, defaults and seed parity

- **Target files:** `src/db/seed.ts`, `src/lib/config/tabs.ts`,
  `src/db/schema/config.ts`.
- **Contract:** all 138 catalog keys exist after migrations with the final values from
  `docs/reconstruction/11-database.md:1480-1620`; the six-key fallback map exists
  (`app/Config/OSPOS.php:59-69`); `mailchimp_*` are created on first save, not seeded (or
  deliberately seeded and documented).
- **Acceptance:** a seed-parity test asserting 138 rows and exact values (Appendix A);
  a defaults test asserting the six fallback keys when `app_config` is absent.

#### C-2 Config cache and invalidation

- **Target files:** `src/lib/config/index.ts`, `src/app/(secure)/config/actions.ts`.
- **Contract:** read-through cache with a bounded TTL or version row; every write updates the
  cache in all workers; direct DB writes are visible within the TTL; settings are
  request-scoped or shared consistently; `rawurlencode`-style value fidelity is preserved if
  a file cache is used.
- **Acceptance:** port `tests/Models/AppconfigTest.php:35-74` (batch save persists all keys
  and refreshes cached settings; single save refreshes) plus a multi-worker invalidation
  test (write in one process, read in another after TTL).

#### C-3 Complete the configuration UI surface

- **Target files:** `src/lib/config/tabs.ts`, `src/app/(secure)/config/page.tsx`,
  `src/components/config/config-tabs.tsx`.
- **Contract:** 12 top-level tabs + system sub-tabs matching
  `app/Views/configs/manage.php:15-52` and `system_config.php:2-15`; every key in §1.3 has
  the correct control type, allowed values, defaults and conditional visibility; `info`
  upload, shortcuts, dinner tables, stock locations, license and system info are present.
- **Acceptance:** snapshot/key-presence test that 138 keys are represented (or explicitly
  documented as read-only), plus e2e per tab save/reload.

#### C-4 Config save validation and atomicity

- **Target files:** `src/app/(secure)/config/actions.ts`, new
  `src/lib/config/validation.ts`.
- **Contract:** per-tab server validation mirroring
  `app/Controllers/Config.php:388-394,500-512,564-575,953-958,1076-1078,1118-1131,1164-1166`;
  numeric coercion with locale-aware parsing; one transaction per tab; exact success/error
  messages; duplicate shortcut detection; whitelist theme/language/receipt template/invoice
  type.
- **Acceptance:** port `tests/Controllers/ConfigControllerTest.php` mailpath/locale/theme/
  tax cases and add shortcut/number/atomicity tests.

#### C-5 Encrypted-secret handling in the UI

- **Target files:** `src/app/(secure)/config/page.tsx`,
  `src/components/config/config-tabs.tsx`, `src/app/(secure)/config/actions.ts`.
- **Contract:** never send plaintext secrets to the browser; send `*_set` booleans and
  placeholders; on save, empty means preserve existing ciphertext; non-empty means encrypt
  with the current key; decrypt only server-side where needed (Mailchimp list probe).
- **Acceptance:** page HTML/JSON contains no decrypted `smtp_pass`/`msg_pwd`/
  `mailchimp_api_key`; saving with an empty password preserves the row; saving non-empty
  re-encrypts.

#### C-6 Child-table editors

- **Target files:** `src/lib/stock_locations/repository.ts`,
  `src/lib/dinner_tables/repository.ts`, `src/lib/rewards/repository.ts`,
  `src/app/(secure)/config/*`, new route handlers or server actions.
- **Contract:** stock locations (create/rename/delete/reorder/default, clear session state),
  dinner tables (enable + CRUD + delete absent), customer reward packages (enable + CRUD +
  points percent + delete absent), all transactional with the enable flag.
- **Acceptance:** port `tests/Controllers/ConfigControllerTest.php:476-671` (locations) and
  add dinner-table/reward analogues.

#### C-7 Side effects and conditional visibility

- **Target files:** `src/lib/config/actions`, `src/components/config/config-tabs.tsx`,
  `src/lib/tax`, `src/app/(secure)/sales`.
- **Contract:** `show_office_group` writes `modules.sort`; `category_dropdown` creates/deletes
  the category attribute definition; invoice save resets the sale mode; Mailchimp key probe;
  number-locale ICU probe; client-side enable/disable per §1.4.3 (and fix the tax-tab
  disabled-field overwrite deliberately).
- **Acceptance:** save `show_office_group` and assert the office module sort; toggle
  `category_dropdown` and assert `attribute_definitions`; save invoice with invoice disabled
  and assert the register mode; probe a valid/invalid locale.

#### C-8 Logo/item upload rules

- **Target files:** a new upload helper, `src/app/(secure)/config/actions.ts`,
  `src/app/api/items/pic-thumb/[file]/route.ts`, item actions.
- **Contract:** logo `is_image`, 1024 KiB, png/jpg/jpeg/gif, 800×680, sanitized base name,
  move to `public/uploads`; item images use configured max size/types/dimensions and
  sanitize; thumbnail rejects traversal and disallowed extensions; remove-logo clears the key
  without deleting the file.
- **Acceptance:** upload valid/invalid mime/extension/size/dimension; traversal filename
  rejected; configured allowed types honored.

#### C-9 Sequence acquisition

- **Target files:** `src/lib/config/index.ts`, `src/lib/sale/*`, PDF/number formatting.
- **Contract:** three counters, `last_used + 1`, optional `save=false` probe, atomic
  allocation on MySQL and SQLite, usable by invoice/quote/work-order number rendering, and
  manual reset through the invoice tab.
- **Acceptance:** sequential calls return 1,2,3; concurrent calls never return duplicates
  (transaction/row lock); reset via config save restarts at the next value.

#### C-10 Configuration tests

- **Target files:** `src/lib/config/*.test.ts`, `e2e/config.spec.ts`.
- **Contract:** seed parity, cache invalidation, validation, encrypted secrets, child tables.
- **Acceptance:** the C-1…C-9 tests plus e2e per-tab save/reload.

### Phase I — i18n

#### I-1 Restore the locale inventory

- **Target files:** `src/messages/**`, `src/lib/i18n/index.ts`.
- **Contract:** 46 upstream locale directories and 24 message groups each, with English key
  parity; `supportedLocales` equivalent derived from the directories; remove `bn` unless
  deliberately added and documented; rename `hr-HR` to `hr`.
- **Acceptance:** port `tests/LanguageFilesTest.php:34-62,101-128` (parse, key parity,
  directory ↔ locale list).

#### I-2 Resolution and fallback

- **Target files:** `src/lib/i18n/index.ts`.
- **Contract:** locale → base language (`en-GB`→`en`, `de-CH`→`de`) → `en` → raw key; no
  exception for missing keys; placeholder formatting compatible with upstream `{0}` usage.
- **Acceptance:** missing key in a regional locale resolves to the base file, then English,
  then the raw key.

#### I-3 Employee language override

- **Target files:** `src/lib/i18n/index.ts`, `src/lib/auth/options.ts`,
  `src/app/layout.tsx`.
- **Contract:** logged-in employee `language_code`/`language` overrides `app_config`, with a
  filesystem-safe validation (`Load_config.php:44-71`), and the selected locale is applied to
  the request.
- **Acceptance:** an employee with `language_code=en-GB` sees en-GB even when the system is
  `de-DE`; an invalid code falls back to `en`.

#### I-4 Date, number and currency helpers

- **Target files:** new `src/lib/i18n/format.ts`, all renderers (`src/lib/pdf/*`,
  `src/app/(secure)/sales/*`, reports, tables).
- **Contract:** implement `to_date`, `to_datetime`, `to_currency`, `to_currency_no_money`,
  `to_currency_tax`, `to_tax_decimals`, `to_quantity_decimals`, `parse_decimals`,
  `parse_quantity`, `parse_tax`, `dateformat_momentjs`, `dateformat_bootstrap`,
  `isValidDate`, `valid_decimal`, and `get_payment_options`/`is_right_side_currency_symbol`
  equivalents driven by the config keys in §4.3.
- **Acceptance:** port `tests/Helpers/LocaleHelperTest.php` and add round-trip tests for
  every format/parse pair, including `thousands_separator=0` and a non-`en_US` locale.

#### I-5 JS language lines and RTL

- **Target files:** `src/components/*`, `src/app/globals.css`, `src/app/layout.tsx`.
- **Contract:** expose the JS strings upstream exposes (`common_submit`, `common_close`) or
  document their replacement; add `dir="rtl"` and RTL layout for `ar-EG`, `ar-LB`, `he`,
  `fa`, `ur`, `ckb` if fidelity beyond upstream is required (upstream has no RTL — see §4.4).
- **Acceptance:** a smoke test that the page direction flips for RTL locales (if implemented)
  and that no translation string is injected unescaped into a script.

#### I-6 i18n tests

- **Target files:** `src/lib/i18n/*.test.ts`.
- **Contract/acceptance:** port the full `LanguageFilesTest.php` invariants and add the
  fallback/employee-override/format tests above.

### Minimum acceptance gate for this scope

1. `npm run test` includes the new config/auth/crypto/i18n suites and passes.
2. `npm run build` passes (`allowedHostnames` in `NextAuthConfig` must be resolved).
3. A migrated upstream-shaped DB (138 config rows, upstream modules/permissions/grants)
   renders the correct sidebar and all config tabs.
4. No decrypted secret is present in any rendered page or client bundle.
5. `/api/migrate` is authenticated for non-new installs and returns the documented status
   codes.
6. Login throttling returns 429 after 5 POSTs/60 s per IP/username.
7. Locale key parity holds for all 46 locales, and a missing key falls back to English and
   then the raw key.

## 8. Unknowns

1. **`allowedHostnames` in NextAuth v5.** No `node_modules` is installed in this checkout, so
   the exact `NextAuthConfig` type surface could not be inspected. It is uncertain whether
   `allowedHostnames` is an accepted key, silently ignored, or a TypeScript error. Resolution:
   install dependencies and run `tsc --noEmit`, or replace it with proxy-only enforcement.
2. **`STATISTICS` / `account_number` / `default_tax_rate` consumers.** A `$config`/`settings`
   grep found no runtime reader for these five non-UI keys beyond migrations and views
   (§1.3.16). They may be consumed by `statistics` reporting elsewhere or be dead; the target
   can seed them for parity without a reader.
3. **Exact `PASSWORD_DEFAULT` cost per PHP version.** Upstream calls
   `password_hash(..., PASSWORD_DEFAULT)` (`Employee.php:389`; `Employees.php:205`); PHP 8.4
   changed the bcrypt default cost to 12. The upstream image pins PHP 8.2, so the effective
   cost in CI is 10, but bare-metal 8.4 deployments produce cost 12 hashes. Whether the
   target must match a specific cost is a policy decision.
4. **CI4 `SecureHeaders` default values.** The framework source is not vendored here; the
   exact default header set (and whether CSP is emitted) could not be verified. The report
   states only that no app-level header config exists.
5. **CI4 session GC probability/formula.** The framework's DatabaseHandler GC is not in the
   repo; the report states the expiry-based semantics and the 7200 s lifetime, not the exact
   probability. Verify against the CI4 version in `composer.lock` when implementing S-3.
6. **`executeScript` transaction commit-on-failure semantics.** The helper calls
   `transComplete()` even when `$success === false` (`migration_helper.php:55-57`); whether
   the DB driver commits partial statements depends on CI4's transaction implementation and
   on MySQL DDL autocommit. The destructive-migration list is accurate, but the exact
   partial-failure state of a failed upgrade is not fully determined.
7. **`Login::index()` unauthenticated migration.** The code path is unambiguous
   (`Login.php:64-80`) and the test comment acknowledges it (`LoginTest.php:59-71`), but
   whether this is considered an accepted upstream design (fresh-install convenience) or a
   vulnerability to fix in the target is a product decision. S-2 assumes the secure reading.
8. **`customers_packages` / `customers_points` / `sales_reward_points` schema.** The reward
   tab depends on these tables, but `docs/reconstruction/11-database.md` D1 records them as
   absent from the target schema. The exact target contract for C-6 depends on whether those
   tables are restored; this report describes the upstream child-table behaviour from
   `app/Controllers/Config.php:987-1032` only.
9. **`hr` vs `hr-HR`.** Upstream has an `hr` directory and `get_languages()` entry
   (`app/Helpers/locale_helper.php:73`), while the target message folder is `hr-HR`. It is
   unclear whether the target intentionally modernised the tag or drifted; I-1 assumes `hr`
   is authoritative for parity.
10. **Locale JSON schema.** The target's `src/messages/bn/common.json` uses nested sections
    (`common`, `login`, `modules`, ...), while upstream uses flat PHP files per screen
    (`Config.php`, `Sales.php`, ...). No decision record was found for the mapping. I-1
    assumes one JSON namespace per upstream PHP file (24 groups), but a nested
    `common.json` is also viable if the key mapping is documented.
11. **The stale summary row in `11-database.md`.** The D8 table row says "48 missing, 25 value
    differences" (`docs/reconstruction/11-database.md:51`) while Appendix A and a machine
    re-count say "52 missing, 29 value differences" (`:2835-2840`). This report uses 52/4/29.
    The discrepancy should be corrected in the database document.
12. **Target `ospos.db` / `sqlite.db` runtime state.** The checked-in DBs are stale relative
    to `seed.ts` (e.g. 28 vs 37 permissions,
    `docs/reconstruction/11-database.md:2250,2280`). Any acceptance test that reads the
    checked-in DB will observe different config values than a fresh seed. This report treats
    `seed.ts` and the migration SQL as the source of truth.
13. **Whether the target intends SQLite as a supported production dialect.** The schema,
    drizzle configs and Docker SQLite compose suggest yes, but the upstream contract is
    MySQL-only (§5.3). Several upstream behaviours (GET_LOCK, information_schema migrations,
    `mysqli_get_server_info`) are impossible on SQLite; S-1/S-2 assume a portable runner with
    dialect-specific locks.
14. **`throttle.capacity` / `throttle.seconds` defaults in `.env.example`.** The variables are
    read (`app/Filters/Throttle.php:28-40`) but are not present in `.env.example`; whether
    they are documented elsewhere could not be determined.
15. **`no_access` permission display.** Upstream passes `permission_id` to the view
    (`app/Controllers/No_access.php:35`) and the target page ignores both route params; the
    expected UX (show module name and requested submodule) is not specified anywhere in the
    repo.

---

*End of report. Analysis only; no source files were modified. The only file written is this
document.*
