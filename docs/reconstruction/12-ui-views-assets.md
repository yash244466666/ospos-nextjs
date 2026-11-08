# 12 — UI Shell, Shared View Partials, Public Assets & Cross-Module UX

**Analysis agent:** M (UI shell / shared behavior)
**Upstream (source of truth):** `/home/yash/ospos` — OSPOS 3.4.3, commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`
**Target:** `/home/yash/Desktop/yash/ospos-nextjs` — Next.js 16.2.9 + React 19.2.4 + Tailwind CSS 4.3.1
**Status:** analysis only. No source file was modified. This is the only file written.

This report covers the cross-cutting UI shell, shared view partials, public JS/CSS assets, table/filter/datepicker/notification/print/keyboard behaviors, form UX conventions, and target architecture gaps. Module-specific forms and business rules are covered by other agents; this report cites module forms only where they establish a shared pattern.

---

## 0. Executive summary — the ten parity failures that matter most

1. **There is no shared table system in the target.** Upstream every management screen is one `table_support.init()` call over a common bootstrap-table configuration with server-side pagination, sorting, search, column switching, export, row selection, delete/restore, and locale injection (`public/js/manage_tables.js:210-333`). The target has 27 hand-written `<table>` elements across `src/components/**` and `src/app/(secure)/**`, with no shared table component, no pagination, no server-side sort/search contract, no filter persistence, no column visibility, and no export except reports CSV (`src/components/items/items-table.tsx:91`, `src/components/customers/customers-table.tsx:25`).
2. **Sidebar/module generation is semantically wrong.** Upstream loads modules by grant and `menu_group` in session (`home` vs `office`), excludes `sort = 0`, sorts by `sort`, and renders Home/Office as ordinary modules whose links switch the menu group (`app/Controllers/Secure_Controller.php:53-67`, `app/Models/Module.php:99-134`, `app/Views/partial/header.php:88-95`). The target queries `modules.sort = 0` (`src/lib/auth/rbac.ts:85`), ignores sort order, ignores the grant's `menu_group`, and hard-codes Office → Reports/Settings (`src/components/shared/sidebar.tsx:97-105`). With the target seed, all modules have `sort = 0` except `office = 999` (`src/db/seed.ts:105-124`), so `office` is filtered out and the Office section never renders.
3. **Keyboard shortcuts are the wrong model.** Upstream shortcuts are ten configurable bindings stored in `app_config` as `key_<name>` values of `"code | label"`, validated for duplicates, and bound to `ALT+1..9` plus `ESC` by default; the same data drives the help modal and the config screen (`app/Libraries/Sale_lib.php:26-37`, `app/Controllers/Config.php:1122-1146`, `app/Views/configs/shortcuts_config.php:12-46`). The target defines a fixed `F1..F12` array (`src/lib/constants.ts:79-92`), never binds it, and has no shortcuts config tab.
4. **Notifications/toasts do not exist.** Upstream wraps `$.notify` to strip all HTML with DOMPurify, applies configured screen position, and uses it in 37 places for AJAX success/failure (`app/Views/partial/header_js.php:20-33`, `public/js/manage_tables.js:151-176`, `app/Views/configs/shortcuts_config.php:63-76`). The target’s bell button is inert (`src/app/(secure)/layout.tsx:30-32`); the e2e helper explicitly notes “The app currently does not render toast notifications” (`e2e/helpers.ts:24-33`).
5. **Printing is absent.** Upstream has a full print pipeline: `printdoc()` using the Firefox `jsPrintSetup` add-on with margins/header/footer/silent print and localStorage printer selection, a `window.print()` fallback, `print_after_sale` auto-print plus delayed auto-return, and print CSS (`app/Views/partial/print_receipt.php:10-69`, `public/css/ospos_print.css:1-66`). The target has no `window.print`, no print button, no print CSS, and no `print_after_sale`/`print_delay_autoreturn` behavior; it only produces PDFs via `@react-pdf/renderer` (`src/app/(secure)/sales/receipt/[id]/pdf/route.tsx:1-18`).
6. **Autocomplete is not behaviorally equivalent.** Upstream uses jQuery UI autocomplete with `minChars: 0`, dblclick-triggered “search all”, Enter-to-submit, and configurable multi-column suggestion labels including multi-pack names (`app/Views/sales/register.php:696-761`, `app/Models/Item.php:890-949`). The target requires two characters and a 200 ms delay, renders a simple dropdown, and has no keyboard navigation contract (`src/components/sales/register.tsx:60-73`, `136-152`).
7. **Form UX conventions are missing.** Upstream forms share `#required_fields_message`, `.error_message_box`, red `.required` labels, jQuery-validation `errorLabelContainer`, remote uniqueness/numeric checks, `ajaxSubmit`, modal-dialog submission, and `$.notify` responses (`app/Views/partial/header_js.php`, `public/js/manage_tables.js:342-377`, `app/Views/items/form.php:515-660`). The target uses plain server actions with a single red error string; there is no field-level error rendering, no required-field legend, no modal form, no remote validation, and no unsaved-changes protection.
8. **i18n is present as a dependency but not wired.** `next-intl` is installed (`package.json:16`), but there is no `NextIntlClientProvider`, no locale segment, no middleware, and `src/messages/en/common.json` is `{}`. Upstream has 24 English language files with ~1,676 key lines plus 47 language directories and locale-aware date/number helpers (`app/Language/en/*.php`, `app/Helpers/locale_helper.php:12-21`).
9. **Branding/theme parity is lost.** Upstream selects a Bootswatch 3 theme for the app and Bootswatch 5 for login, shows the configured company name in the topbar, displays a live clock, and footers the version/commit (`app/Views/partial/header.php:20-24`, `55-71`, `app/Views/partial/footer.php:10-21`, `app/Views/login.php:28-37`). The target hard-codes “OSPOS Next.js”, has no company branding/logo/clock/footer, and no theme selection; `globals.css` pins `color-scheme: light` (`src/app/globals.css:44-46`).
10. **Localization/RTL/dark-mode are unimplemented.** Upstream ships RTL-capable languages (`ar-EG`, `ar-LB`, `ckb`, `fa`, `he`, `ur`) and a copied Bootstrap RTL stylesheet (`gulpfile.js:148-151`). The target has zero `dir=`/RTL handling, zero dark-mode rules despite the design system claiming full dark support (`design-system/MASTER.md:13`), and no locale switching.

Additional high-severity gaps: no `/no_access/[module]` route (only `[module]/[submodule]`), so `requirePermission("items")` redirects to a 404 (`src/lib/auth/with-permission.ts:14-16`); change-password lacks current-password/min-length/repeat-match parity (`src/app/(secure)/change-password/page.tsx:11-21`); login lacks initialization/migration, captcha, and branding parity (`src/app/(auth)/login/page.tsx`); and the barcode sheet is PDF-only, with inconsistent `barcode_width` defaults (`src/lib/barcode/index.tsx:41` uses `"2"`, while `src/app/(secure)/items/generate-barcodes/page.tsx:38` uses `"250"`).

---

## 1. Application shell and layout

### 1.1 Document head (authenticated shell)

Upstream `app/Views/partial/header.php`:

| Concern | Behavior | Evidence |
|---|---|---|
| doctype/lang | HTML5, `<html lang="<?= current_language_code() ?>">` | `app/Views/partial/header.php:14-15` |
| charset/base | UTF-8; `<base href="<?= base_url() ?>">` makes every relative asset/URL resolve from app root | `:18-19` |
| title | `"<company> | Powered by OSPOS <version>"` via `Common.powered_by` | `:20` |
| robots | `noindex, nofollow` on every authenticated page | `:21` |
| favicon | `images/favicon.ico` | `:22` |
| theme CSS | `resources/bootswatch/<theme>/bootstrap.min.css`; empty theme falls back to `flatly` | `:23-24` |
| dev assets | If `ENVIRONMENT=development`, `debug` cookie, or `?debug=true`: inject debug CSS/JS markers | `:26-31` |
| prod assets | Injected `opensourcepos.min.css`/`.min.js` bundle, plus optional per-theme override `css/<theme>.css` when theme ≠ flatly and the file exists | `:31-40` |
| globals | Injects `partial/header_js` (clock, notify, CSRF, AJAX wrappers) and `partial/lang_lines` (`window.lang.line`) | `:43-44` |
| overflow | Inline `html { overflow: auto; }` | `:46-50` |
| body | `<div class="wrapper">` wraps topbar + navbar + container/row; footer closes them | `:53-54`, `:101-102`, `app/Views/partial/footer.php:7-8` |

The target root layout is minimal: Geist/Geist Mono via `next/font/google`, a fixed metadata title “OSPOS Next.js”, `lang="en"`, `color-scheme: light`, and a slate body (`src/app/layout.tsx:2-33`, `src/app/globals.css:44-52`). It has no per-page title template, no company name, no robots meta, no theme, no favicon link (the default `src/app/favicon.ico` exists), and no global status region.

### 1.2 Topbar

Upstream topbar (`app/Views/partial/header.php:55-71`):

- Left: `#liveclock`, server-rendered once with `date(<dateformat> <timeformat>)`; `partial/header_js` immediately starts a 1-second `setInterval` that rewrites it with Moment.js using `dateformat_momentjs()` (`app/Views/partial/header_js.php:8-18`, `app/Helpers/locale_helper.php:517-560`).
- Center: `<strong><?= esc($config['company']) ?></strong>` — plain text, not a logo (`header.php:67-69`).
- Right: current user’s `first_name last_name` linked to `home/changePassword/<person_id>` with `class="modal-dlg"`, `data-btn-submit=Submit`, title “Change Password”; then `|`; then “Logout” link to `home/logout` (`:61-65`).
- Topbar styling: dark `#182735`, 12 px, 0.2 em padding (`public/css/ospos.css:15-21`).

Target header (`src/app/(secure)/layout.tsx:17-44`): sticky white bar; hard-coded store badge “OSPOS Next.js” with a Lucide `Store` icon (`:18-23`); session user name (`:24-27`); inert bell (`:30-32`); logout via POST to `/api/auth/signout` (`:33-42`). There is no clock, no company setting, no change-password link, and no menu-group switch.

### 1.3 Navigation/menu generation

Upstream menu algorithm:

1. `Secure_Controller::__construct($module_id, $submodule_id, $menu_group)` stores `menu_group` in session when supplied; otherwise reuses the session value (`app/Controllers/Secure_Controller.php:53-57`).
2. `Home` passes `'home'`; `Office` passes `'office'` (`app/Controllers/Home.php:12-19`, `app/Controllers/Office.php:14-18`).
3. `Module::get_allowed_home_modules()` joins `permissions` and `grants`, filters `person_id`, `menu_group IN ('home','both')`, `sort != 0`, and orders by `sort ASC`; the office variant uses `('office','both')` (`app/Models/Module.php:99-134`).
4. The resulting rows are placed in `global_view_data['allowed_modules']` and made visible to views through the one-line `app/Views/viewData.php` shim (`Secure_Controller.php:59-72`, `app/Views/viewData.php:1`).
5. `header.php` loops the modules and emits `<li class="active">` when `module_id == URI segment 1`; each item is `<a href=base_url(module_id) class="menu-icon">` with an icon `<img src="images/menubar/<module_id>.svg">` and label `lang("Module.<module_id>")` (`app/Views/partial/header.php:88-95`).
6. `home` and `office` are themselves module rows with `sort = 1`; their grants are cross-wired (`office` granted under menu_group `home`, `home` granted under `office`) so the opposite group icon appears in each menu (`app/Database/Migrations/sqlscripts/3.1.1_to_3.2.0.sql:6-21`). Regular modules are seeded with sorts 10–110 (`initial_schema.sql:311-321`, `3.2.1_to_3.3.0.sql:52-59`, `3.3.0_attributes.sql:48-55`).
7. `app/Models/Module.php:139-159` can toggle the Office icon by setting the `office` module’s `sort` between 999 and 0.
8. Icons are not committed: Gulp copies and renames 19 Elegant Circles SVGs into `public/images/menubar/` (`gulpfile.js:30-53`, `157-167`); the directory is empty except `.gitkeep` in the repo.

Target: `getAllowedModules(personId, "both")` selects module id/name/desc/sort plus `grants.menuGroup`, filters `modules.sort = 0`, then dedupes (`src/lib/auth/rbac.ts:73-94`). The sidebar treats `home` specially, lists every other non-office module as a “home” link, and only renders an Office section if an `office` module survived the query; the Office section hard-codes Reports and Settings (`src/components/shared/sidebar.tsx:67-108`). Module labels are the seed’s plain names, not `Module.*` lang keys (`src/db/seed.ts:105-124`). `ROUTE_MAP` re-points `sales`→`/sales/register` and `receivings`→`/receivings/register` and supplies fallbacks for the rest (`sidebar.tsx:26-44`). Active state is `pathname.startsWith(href)` (`:93`), so `/items/new` highlights Items although upstream active state is segment-1 exact (`header.php:89`).

Consequences to preserve/repair: menu group is a *session/menu context*, not a static sidebar partition; visibility is grant-driven; order is `sort`; labels are language keys; icons are per-module SVGs; Home/Office are navigation switches.

### 1.4 User menu, logout, change password

- Upstream change password is a modal (`modal-dlg`) opened from the topbar; it posts to `home/save/<person_id>`, requires current password, new password ≥ 8, `repeat_password` equal to new, and rejects equality with the current password (`app/Views/home/form_change_password.php:11-89`, `:95-128`). It hides the dialog and calls `$.notify` on JSON response.
- Logout is a normal link (`home/logout`) but `header_js` also binds `#logout` to a CSRF-protected AJAX POST and redirect (`app/Views/partial/header_js.php:72-86`). The link itself is not `#logout` in the header; this is a legacy hook.
- Target: `/change-password` is a standalone page with new + confirm only, no current password, no min length, no mismatch server feedback rendered at field level (`src/app/(secure)/change-password/page.tsx:11-21`); logout posts to NextAuth sign-out. No modal.

### 1.5 Company branding and footer

- Upstream branding: company name in topbar; company logo only on login (`app/Views/login.php:43-52`); logo in receipt (`app/Views/sales/receipt_default.php:23-29`); logo upload/preview in config (`app/Views/configs/info_config.php:36-50`). The authenticated header does *not* show a logo.
- Footer: `© 2010 - <current year> · opensourcepos.org · <version> - <6-char commit>` inside `.jumbotron.push-spaces`, hidden in print (`app/Views/partial/footer.php:10-21`, `public/css/ospos_print.css:17-21`).
- Target: no footer, no version/commit, no company name from config, no logo anywhere (search found none). `public/` contains only the default Next SVGs.

### 1.6 Login shell

Upstream `app/Views/login.php` is a separate full document:

- Bootswatch **5** stylesheet at `resources/bootswatch5/<theme>/bootstrap.min.css`; `paper` and `readable` fall back to `flatly` (`:28-37`).
- `css/login.css`; `meta viewport`; theme color `#2c3e50` (`:25-37`).
- Two-column card: logo box (uploaded `company_logo` or inline OSPOS SVG) + login box (`:40-56`).
- Three states driven by server flags: new install (initialization required), migration required, normal login (`:57-65`).
- Migration warning/progress/success/error blocks (`:67-104`).
- Two selectable form layouts controlled by `config['login_form']`: Bootstrap 5 floating labels (default/`floating_labels`) or input groups with inline SVG icons (`:106-135`).
- reCAPTCHA v2 when enabled (`:137-140`).
- Submit label changes: Initialize / Migrate / Go (`:143-153`).
- Footer card with inline logo (`:159-170`).
- Only jQuery is injected (`:172-178`), then an inline `APP_STATE` object carries `isNewInstall`, `isLatest`, CSRF token name/hash, migrate/login URLs, and ~15 localized strings (`:179-205`). The script switches UI state and POSTs migration with username/password and CSRF, timeout 1 hour (`:207-324`).
- `login.css` is responsive at 767.98 px, 2560 px, 3840 px, and 359.98 px (reCAPTCHA overflow) (`public/css/login.css:73-134`).

Target login (`src/app/(auth)/login/page.tsx`): client component, NextAuth credentials sign-in, centered Tailwind card, username/password, generic “Invalid username or password”, loading spinner, and a default-credentials hint (`:1-121`). No initialization/migration UI, no captcha, no logo/company name, no theme, no server-side validation list, no locale. The `(auth)` layout simply redirects authenticated users (`src/app/(auth)/layout.tsx:1-9`).

### 1.7 No-access and error shells

- Upstream `no_access.php` prints `Error.no_permission_module <module> (<permission_id>)` and disables `#submit` (`app/Views/no_access.php:6-8`).
- Production error template is a centered “Whoops / we hit a snag” page (`app/Views/errors/html/production.php:1-31`); controller `error.php` wraps an escaped message in `.error` (`app/Views/errors/error.php:1-8`); 400/404/db/general/php/exception templates exist under `app/Views/errors/html/`.
- Target: only `src/app/(secure)/no_access/[module]/[submodule]/page.tsx` exists; there is **no** `[module]/page.tsx`, so `/no_access/items` 404s. The page hard-codes “Access Denied” and a Home link (`:5-14`). There are no `error.tsx`, `global-error.tsx`, `not-found.tsx`, or `loading.tsx` files anywhere in `src/` (verified by find).

### 1.8 Global JS boot order and CSRF plumbing

`partial/header_js.php` is the single most important shared behavior file:

| Behavior | Detail | Evidence |
|---|---|---|
| live clock | `clock_tick()` starts `setInterval('update_clock();', 1000)` at parse time; `update_clock` uses `moment().format(<converted format>)` | `app/Views/partial/header_js.php:8-18` |
| notification sanitization | Saves original `$.notify`, replaces it with a wrapper that extracts `content.message`, runs `DOMPurify.sanitize(message, {ALLOWED_TAGS: [], ALLOWED_ATTR: []})`, and forwards only text | `:20-26` |
| notification position | `$.notifyDefaults({ placement: { align: notify_horizontal_position, from: notify_vertical_position }})` | `:28-33` |
| CSRF accessors | `csrf_token()` returns `csrf_hash()`; `csrf_form_base()` builds `{ [tokenName]: fn }`; `setup_csrf_token()` writes the current hash into every matching hidden input | `:35-49` |
| AJAX CSRF | Wraps `$.ajax`: every POST gets the token appended to string data or merged into object data | `:51-64` |
| token refresh | `$(document).ajaxComplete(setup_csrf_token)` refreshes hidden fields after every AJAX call | `:66` |
| 401 handling | `ajaxError` redirects to `site_url('login')` on HTTP 401 | `:67-71` |
| logout hook | `#logout` click → CSRF POST to `home/logout` → redirect to site root | `:72-86` |
| form submit CSRF | Wraps `$.fn.submit` to call `setup_csrf_token()` first | `:88-93` |

CSRF itself: session-based, token name `csrf_ospos_v4`, header `X-CSRF-TOKEN`, cookie `csrf_cookie_ospos_v4`, 2-hour expiry, no regeneration, redirect on failure in production (`app/Config/Security.php:18-76`). The CSRF filter is global except `login|migrate` (`app/Config/Filters.php:78-82`). CodeIgniter’s `form_open()` injects the hidden field, so every upstream form carries a CSRF input automatically. Login’s AJAX migration includes `[APP_STATE.csrfToken]: APP_STATE.csrfHash` explicitly (`app/Views/login.php:299-302`).

Target: no CSRF fields. NextAuth handles its own CSRF for sign-in/out; Next.js server actions perform Origin/Host checks, but there is no app-level token refresh equivalent, no 401→login handling for fetch calls, and no `fetch` wrapper. The host allowlist gate exists in `src/proxy.ts:3-35`.

### 1.9 Flash messages and alerts

Upstream has **no session flashdata usage** (grep for `getFlashdata|setFlashdata` returned nothing). User feedback is delivered by:

- Inline server-rendered alert blocks in views (`alert alert-dismissible alert-danger|warning|success|info`), e.g. register (`app/Views/sales/register.php:46-61`), receiving (`app/Views/receivings/receiving.php:24-38`), report inputs (`app/Views/reports/date_input.php:17-21`).
- JSON `{success, message, id}` responses rendered with `$.notify` (37 call sites; list in §7.3).
- Bootstrap-dialog modal content.

Target: no alert/toast/status region at all; server actions return `{ok}` or throw, and forms render a single `form-error` div (`src/components/customers/customer-form.tsx:39-42`, `src/components/items/item-form.tsx:63-66`).

### 1.10 Responsive shell behavior

- Upstream navbar collapses below 768 px via `navbar-toggle` + `data-target=".navbar-collapse"` (`app/Views/partial/header.php:76-81`); `.container` gets a 1320 px max at ≥1400 px (`public/css/ospos.css:23-27`); modals are 500 px (`modal-dlg`) or 750 px (`modal-dlg-wide`) at ≥768 px (`public/css/ospos.css:151-163`); modal body scrolls at `calc(100vh - 212px)` (`:165-168`).
- `bootstrap-table-mobile` is bundled (`gulpfile.js:251`) but no `mobileResponsive: true` is set in `manage_tables.js`, so it is loaded but unused.
- Target: fixed 240 px sidebar (`w-60`) always visible; no mobile drawer/collapse (`src/components/shared/sidebar.tsx:74`); main area `overflow-x-auto` (`src/app/(secure)/layout.tsx:45`); tables scroll horizontally. Register uses `lg:` two-column and `sm:` breaks (`src/components/sales/register.tsx:110`, `125`); items table wrapper is `overflow-x-auto` (`src/components/items/items-table.tsx:90`).

---

## 2. Shared table system

### 2.1 Architecture

Every management listing follows the same contract:

```php
table_support.init({
    resource: '<controller>',
    headers: <json from transform_headers()>,
    pageSize: <config lines_per_page>,
    uniqueId: '<row key>',
    queryParams: function () { return $.extend(arguments[0], {...}); },
    onLoadSuccess: function (response) { ... },
    enableActions: function () { ... }
});
```

`table_support.init()` is defined in `public/js/manage_tables.js:210-275`; dialog helpers precede it (`:1-107`) and form helpers follow (`:342-377`). It applies bootstrap-table with these fixed defaults:

| Option | Value | Evidence |
|---|---|---|
| classes | `table-striped`, `table-bordered` | `manage_tables.js:218-219` |
| columns | `options.headers` | `:219` |
| sticky header | `stickyHeader: true` | `:221` |
| URL | `<resource>/search` | `:222` |
| pagination | `sidePagination: 'server'`, `pagination: true` | `:222-226` |
| selection input | `btSelectItem` | `:224` |
| page size | `options.pageSize` (from `lines_per_page`, default 25) | `:225`, `app/Database/Migrations/sqlscripts/initial_schema.sql:59` |
| search box | `search: options.resource || false` | `:227` |
| column chooser | `showColumns: true` | `:228` |
| row click | `clickToSelect: true` | `:229` |
| export | `showExport: true`, `exportDataType: 'basic'`, types json/xml/csv/txt/sql/excel/pdf | `:230-234` |
| export filename | `<resource basename>_<UTC timestamp YYYYMMDDHHMM>` | `:213`, `:235-237` |
| toolbar | `#toolbar` | `:239` |
| unique id | `options.uniqueId || 'id'` | `:240` |
| search trimming | `trimOnSearch: false` | `:241` |
| selection callbacks | onCheck/onUncheck/onCheckAll/onUncheckAll → `enable_actions` | `:242-245` |
| load callbacks | `onLoadSuccess` → `load_success` then `enable_actions`; same on `onPageChange` | `:236-249` |
| column switch | persists to localStorage and re-inits modal dialogs | `:250-259` |
| loading template | centered spinning glyphicon + `role="status"` message | `:260-261` |
| query mode | `queryParamsType: 'limit'` (sends `limit`, `offset`, `search`, `sort`, `order`) | `:262` |
| icon size | `sm` | `:263` |
| sorting | `silentSort: true` | `:264` |
| pagination position | bottom | `:265` |
| escaping | `escape: true` (per-column overrides) | `:266` |

After construction it calls `enable_actions()`, `init_delete()`, `init_restore()`, `toggle_column_visibility()`, and `dialog_support.init("button.modal-dlg")` (`:268-272`).

### 2.2 Column definitions

`app/Helpers/tabular_helper.php` builds all headers:

- `transform_headers_readonly()` emits `{field,title,sortable: title !== '', switchable: no title/&nbsp}` (`:18-27`). Used by report detail sub-tables.
- `transform_headers()` optionally prepends a checkbox column `{field:'checkbox', checkbox:true, sortable:false}`, appends an `edit` column, and normalizes each element to `{field,title,switchable,escape,sortable,checkbox,class,sorter}` (`:32-59`).
- Defaults: `switchable` true unless title is empty/`&nbsp;`; `escape` false for `edit|email|messages|item_pic` keys or explicit `escape => false`; `sortable` true unless title is empty; `class` `print_hide` for checkbox or empty-title columns; `sorter` default `''` (`:46-55`).
- Header families: sales (`:62-91`), people/customers/suppliers (`:187-387`), items (`:389-453`), gift cards (`:534-551`), item kits (`:578-596`), attributes (`:677-694`), expense categories (`:732-747`), expenses (`:772-794`), cashups (`:865-893`). All are localized via `lang()`.
- Items headers append destination-tax category or tax percents, an image column, dynamic attribute columns (`sortable: true`), and `inventory`/`stock` action columns with `escape => false` (`:429-453`).
- `itemSortColumns()` mirrors dynamic attribute ids for sort validation (`:410-424`).
- Row builders return a map of field→HTML/text, with currency/quantity/date formatting, mailto links, phone/SMS modal links, edit modal links, image thumbnail hover link, and attribute expansion (`:96-141`, `:219-250`, `:285-317`, `:353-387`, `:463-532`, `:556-576`, `:601-622`, `:700-730`, `:752-770`, `:799-824`, `:898-926`).
- `number_sorter()` strips non-numeric characters for client-side numeric sort (`public/js/manage_tables.js:379-383`).
- Totals rows: sales (`tabular_helper.php:146-165`), expenses (`:829-846`); payment summaries rendered as `#report_summary` divs (`:170-185`, `:851-863`).

### 2.3 Server-side data contract

Request (GET, bootstrap-table `queryParamsType: 'limit'`):

- `search`, `limit`, `offset`, `sort`, `order`.
- `filters[]` repeated values; the controller converts to an associative set with `array_fill_keys(..., true)` and merges into filter flags (e.g. `app/Controllers/Items.php:137-139`, `app/Controllers/Sales.php:179-181`).
- `start_date`, `end_date`, plus per-page extras such as `stock_location` (`app/Views/items/manage.php:69-75`).
- Controllers sanitize `sort` through `sanitizeSortColumn()` against the known header list (`Secure_Controller.php:87-101`); invalid values fall back to the default column.
- `get_found_rows()` supplies the unpaginated total.

Response: `{ "total": <int>, "rows": [ {field: value|html}, ... ] }`; sales adds `payment_summary` HTML (`app/Controllers/Sales.php:190-197`), expenses adds its summary in `onLoadSuccess`, and the final sales/expenses row is a totals row appended by the controller (`Sales.php:193-195`).

Endpoints are conventional `<controller>/search`: items (`Items.php:109`), sales (`Sales.php:147`), plus people, suppliers, giftcards, item kits, attributes, expense categories, expenses, cashups, tax rates. `suggest_search()` exists on several controllers as a separate POST-based endpoint but the table uses `getSearch()`.

### 2.4 Search, sort, pagination

- Search is server-side and triggers a full reload; `search` is passed only when `options.resource` is truthy (`manage_tables.js:227`). `trimOnSearch: false` preserves whitespace.
- Sort is silent (`silentSort: true`) and server-side; only columns marked `sortable` show sortable headers.
- Page size comes from `lines_per_page`; pagination controls are bottom-aligned.
- `showColumns` gives a dropdown of switchable columns; non-switchable are the empty/`&nbsp;` title columns, which are typically action columns.
- Empty result set is rendered by bootstrap-table with the localized “No matches” message; server pages still return `total: 0`.
- `onLoadSuccess` is used by pages for post-processing: sales/expenses highlight the totals row and inject payment summary (`app/Views/sales/manage.php:52-58`, `app/Views/expenses/manage.php:41-47`), items initialize `imgPreview` (`items/manage.php:77-87`).

### 2.5 Filters, date range, deleted toggle

- Filter UI is a bootstrap-select `form_multiselect('filters[]', $filters, $selected_filters, {id:'filters', data-none-selected-text, data-selected-text-format:'count > 1', data-style:'btn-default btn-sm', data-width:'fit'})` (`app/Views/items/manage.php:116-123`, `sales/manage.php:89-96`).
- Changing the filter fires on `hidden.bs.select` and calls `table_support.refresh()` (`items/manage.php:28-30`, `sales/manage.php:17-20`).
- Date range is an `<input id="daterangepicker">`; initialization comes from `partial/daterangepicker`; `apply.daterangepicker` calls `table_support.refresh()` (`items/manage.php:38-43`, `sales/manage.php:22-27`).
- `partial/daterangepicker` has two modes keyed on `config['date_or_time_format']` (`app/Views/partial/daterangepicker.php:7`, `117`):
  - Date-only: width 180; 15 preset ranges (Today, Today Last Year, Yesterday, Last 7, Last 30, This Month, Same Month To Same Day Last Year, Same Month Last Year, Last Month, This Year, Last Year, This Fiscal Year, Last Fiscal Year, All Time); locale format/separator/apply/cancel/from/to/custom/day/month names/first day; `alwaysShowCalendars`; start/end/min 2010-01-01/max today (`:12-112`).
  - Date+time: width 305; `timePicker: true`, `timePickerSeconds: true`; start 00:00:00, end 23:59:59; same locale and ranges (`:121-227`).
  - Hidden globals `start_date`/`end_date` are `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss` and are updated both in the init callback and on `apply.daterangepicker` (`:109-116`, `:220-227`).
- Deleted rows are not a separate toggle in most tables: they are a filter option (`'is_deleted' => lang('Items.is_deleted')`, `app/Controllers/Items.php:89-97`) that maps to the `is_deleted` SQL flag. Restoring deleted rows uses the table’s `restore` action/button (`table_support.do_restore`, `manage_tables.js:326-331`; `#restore` handler `:277-281`).
- Sales filters: only_cash, only_due, only_check, only_creditcard, only_debit, only_bank_transfer, only_wallet, only_invoices, selected_customer (`app/Controllers/Sales.php:90-100`).
- Items filters: empty_upc, low_inventory, is_serialized, no_description, search_custom, is_deleted, temporary (`Items.php:89-97`). `search_custom` expands the attribute definition set to `SHOW_IN_ITEMS | SHOW_IN_SEARCH` (`Items.php:141-145`).
- Date range defaults: reports use presets; items force start to 2010-01-01 and override with server-provided `start_date` (`app/Views/items/manage.php:45-56`).

### 2.6 Filter persistence and column visibility

**URL persistence** (`app/Views/partial/table_filter_persistence.php`, included by items/sales/cashups/expenses — verified by grep):

- Builds `URLSearchParams` from `start_date`, `end_date`, each `filters[]`, and `additional_params` (e.g. `stock_location`); arrays use repeated `param[]` entries (`:24-56`).
- Rewrites the current path with `window.history.replaceState({}, '', new_url)` — no reload, bookmarkable/shareable (`:58-65`).
- Triggers on filter dropdown close, `#stock_location` change, and `apply.daterangepicker` (`:67-82`).
- Restoration is server-side: `restoreTableFilters()` reads `start_date`, `end_date`, `filters`, filters out null/empty, and returns an array (`app/Helpers/tabular_helper.php:946-959`). Controllers merge it into view data (e.g. `Items.php:99-100`, `Sales.php:110-118`).

**Column visibility persistence** (`public/js/manage_tables.js:201-208`, `:250-259`):

- Key = `localStorage[options.employee_id]`, then `user_settings[resource][field] = checked`.
- On init, saved hidden/shown fields are applied with `showColumn`/`hideColumn`.
- Only `app/Views/items/manage.php:64` passes `employee_id`; all other pages pass `undefined`, so they share the literal localStorage key `"undefined"`. This is the observed source behavior and a parity trap.
- Reports use a different store: global `columnVisibility` key for cost/profit columns and `summaryVisibility` for summary rows (`app/Views/partial/visibility_js.php:28-90`), plus `public/js/hide_cost_profit.js:5-46` for the chart report variant.

### 2.7 Row actions, selection, delete/restore, highlighting

- Selection: checkbox column generated by `transform_headers`, `clickToSelect`, `btSelectItem`; toolbar buttons are disabled when selection is empty (`enable_actions`, `manage_tables.js:110-117`).
- `selected_ids()` maps selected rows to `options.uniqueId || 'id'` and drops `'-'` totals rows (`:119-125`).
- Delete: `#delete` click → `do_action("delete")()`; `do_action` confirms using `$.fn.bootstrapTable.defaults.formatConfirmAction(action)` (localized controller-specific confirm text), POSTs `{ids[]}` to `<resource>/delete`, and on success animates selected rows green/fade, removes them from the table, refreshes, and notifies (`:127-157`, `:273-280`).
- Restore: identical flow with `restore` (`:276-281`, `:326-331`).
- `submit_handler` handles create/edit responses: on failure notifies danger; on success updates up to 14 visible rows via `<url>/row/<id>` and highlights them, otherwise sets `options.load_callback` and refreshes before highlighting (`:291-323`). The dialog form submit path calls the current handler (`:35-53`).
- Row highlight uses jQuery UI’s color animation: green flash then fade back (`highlight_row`, `:139-147`).
- The last row of sales/expenses results is a totals row; pages strip its first cell and bold it (`sales/manage.php:53-57`).

### 2.8 Export

- bootstrap-table export extension is bundled (`gulpfile.js:250`) and enabled for every server table with basic data type and json/xml/csv/txt/sql/excel/pdf (`manage_tables.js:230-234`).
- Reports table variants enable `exportDataType: 'all'` and add `xlsx` to the type list (`app/Views/reports/tabular.php:61-64`, `tabular_details.php:61-63`).
- `tableexport.jquery.plugin` 1.33.0 supplies the export backends; SheetJS/xlsx 0.20.3 is pinned through an npm override (`package.json` `overrides`).
- Export filename uses resource basename plus a compact UTC timestamp (`manage_tables.js:213`, `235-237`).

### 2.9 Locale strings and empty states

`partial/bootstrap_tables_locale.php` registers a bootstrap-table locale for `current_language_code()` and extends defaults (`:10-52`):

- loading: `Bootstrap_tables.loading` (“Loading, please wait”)
- rows per page: `{0} rows per page`
- showing rows: `Showing {0} to {1} of {2} rows`
- search: `Common.search`
- no matches: `Common.no_persons_to_display` for customers/suppliers/employees, otherwise `<Controller>.no_<controller>_to_display` (`:23-27`)
- pagination switch, refresh, toggle, columns, all rows
- confirm action: `<Controller>.confirm_delete` or `.confirm_restore` (`:43-49`)

The partial is included by attributes, cashups, expenses_categories, expenses, giftcards, item kits, items, people, reports tabular/tabular_details, sales, tax rates (verified by grep). Empty states elsewhere are inline alerts, e.g. “There are no Items in the cart.” (`app/Views/sales/register.php:160-163`).

### 2.10 Report table variants

- Input pages collect a date range and optional sale/receiving/discount type and stock location, then navigate by URL path (`app/Views/reports/date_input.php:23-98`).
- `tabular.php` is a client-side bootstrap-table (`data:` JSON, not AJAX) with `sortable`, `pagination`, `showColumns`, `search`, sticky header, export all, `escape: true`, and the shared loading template; headers are `transform_headers(..., true, false)` (readonly, no edit column) and columns pass through `applyColumnVisibility` (`app/Views/reports/tabular.php:25-79`).
- `tabular_details.php` adds `detailView: true` and an `onExpandRow` sub-table built from `details_data`, keyed by sale/receiving id; it also supports a rewards sub-table when enabled; `init_dialog()` binds modal links after page change/body render (`app/Views/reports/tabular_details.php:55-97`, `partial/visibility_js.php:92-98`).
- Report listing is three permission-filtered panels: graphical, summary, detailed, plus inventory-low/summary links (`app/Views/reports/listing.php:15-100`).

### 2.11 Target table implementation and gaps

- Target has no shared table module. 27 files contain `<table>`; every one styles and renders rows locally. Typical forms:
  - `src/components/items/items-table.tsx` has a client search input, location `<select>`, six checkbox filters, a fully hard-coded header row, client-side `rows.length === 0` empty state, and row actions (`:28-170`).
  - `src/components/customers/customers-table.tsx` renders a fixed 7-column table, an early-return “No customers.” empty state, per-row Edit/Delete, and `confirm()` deletion (`:23-55`).
  - `src/components/sales/manage/page.tsx` loads all completed sales with no filters/pagination and computes totals by re-querying `sales_items` inside the row loop (`:11-60`).
  - `src/components/reports/report-view.tsx` renders a static `<table>` from in-memory rows; only CSV export exists (`:52-105`, `src/app/(secure)/reports/[key]/export/route.ts:1-30`).
- Missing: server pagination (`limit`/`offset`), sort contract, server search semantics, multi-select filter control, date range control, URL filter persistence, column visibility, export UI, row selection/delete/restore, sticky headers, loading locale strings, totals/payment summary injection, image preview, and localized empty states.
- The items page does accept URL filters (`q`, `location`, `empty_upc`, `low_inventory`, `serialized`, `no_description`, `deleted`, `temporary`) but hard-caps `limit: 100` and performs no pagination (`src/app/(secure)/items/page.tsx:15-29`). It omits `search_custom` even though the repository supports attribute search.
- The items table’s filter labels are hard-coded English (`src/components/items/items-table.tsx:64-82`).

---

## 3. Autocomplete / suggestion UX

### 3.1 Upstream mechanism

All suggestions use jQuery UI autocomplete, styled by `public/css/bootstrap.autocomplete.css` (`:1-30`), and return arrays of `{value,label}` (sometimes only `label`). The standard call shape is:

```js
$('#field').autocomplete({
    source: '<endpoint>',
    minChars: 0,
    delay: <10..1000>,
    autoFocus: false,
    appendTo: '.modal-content',   // when inside a bootstrap-dialog
    select: function (event, ui) { ... return false; }
});
```

`minChars: 0` means the widget opens on focus/dblclick before typing. `appendTo: '.modal-content'` is required for suggestions inside modals to escape overflow clipping. `select` usually writes the id to a hidden field, writes the label to the visible field, and either submits the surrounding form (register) or updates local row state (item kits).

### 3.2 Endpoint inventory

| Endpoint | Method/param | Response | Used by |
|---|---|---|---|
| `<controller>/itemSearch` (`getItemSearch`) | GET `term`; in return mode a valid receipt replaces/extends suggestions | item + item-kit `{value:item_id,label}` | sales register (`Sales.php:200-224`) |
| `customers/suggest` (`getSuggest`) | GET `term`, 25, unique | `{value:person_id,label:"First Last [Company] [Phone]"}` | register, giftcard form, sales form (`Customers.php:123-129`, `Customer.php:332-355`) |
| `giftcards/suggest` (`getSuggest`) | GET `term`, 25 | `{label:giftcard_number}` then `{label:customer name}`; no `value` | register giftcard payment (`Giftcards.php:59-64`, `Giftcard.php:196-231`) |
| `suppliers/suggest` (`getSuggest`) | GET `term`, unique | `{value:person_id,label:company/agency/person}` | receiving, expense form (`Suppliers.php:73-78`, `Supplier.php:157-196`) |
| `items/suggest` (`getSuggest`) | GET `term`, unique | item `{value:item_id,label}` | item-kit form (`Items.php:280-286`) |
| `items/suggestKits` (`getSuggestKits`) | GET `term`, unique | kit `{value,label}` | item-kit form (`Items.php:303-308`) |
| `items/suggestLowSell` (`getSuggestLowSell`) | GET/POST `name` | low-sell item `{value,label}` | item form (`Items.php:292-297`) |
| `items/suggestCategory` (`getSuggestCategory`) | GET `term` | distinct categories | item form, bulk edit (`Items.php:315-320`, `Item.php:1343`) |
| `items/suggestLocation` (`getSuggestLocation`) | GET `term` | distinct locations | item form (`Items.php:327-332`, `Item.php:1365`) |
| `taxes/suggestTaxCodes` (`getSuggestTaxCodes`) | GET/POST `term` | tax code `{value,label}` | customer form (`Taxes.php:425-431`) |
| `taxes/suggestTaxCategories` (view URL) | POST `term` | tax category suggestions | item form (`app/Views/items/form.php:477`, controller `Taxes.php:115`) |
| `attributes/suggestAttribute/<definition_id>` | GET `term` | attribute value suggestions | attribute value editor (`Attributes.php:224-230`) |
| `employees/suggest` (`getSuggest`) | GET `term`, 25, unique | employee `{value,label}` | sales edit form (`Employees.php:54-60`) |
| `persons/suggest` (`getSuggest`) | GET `term` | person `{value,label}` | people views (`Persons.php:38-44`) |
| Nominatim (external) | GET with `format=json, limit=5, addressdetails=1, countrycodes`, accept-language | parsed `{label,results,value}` | address autocomplete (`public/js/nominatim.autocomplete.js:60-123`) |

**Unknown:** `app/Views/items/form.php:477` requests `taxes/suggestTaxCategories` while the controller defines `suggest_tax_categories()` (`app/Controllers/Taxes.php:115`); the route resolution is unverified. Treat the endpoint name/route as an unknown to reproduce rather than silently “fixing” it.

### 3.3 Widget configuration per call site

| Field | Endpoint | minChars | delay | Other | Evidence |
|---|---|---|---|---|---|
| sales `#item` | `sales/itemSearch` | 0 | 500 | no autoFocus, select submits `#add_item_form` | `app/Views/sales/register.php:696-704` |
| sales `#customer` | `customers/suggest` | 0 | 10 | select submits `#select_customer_form` | `:729-737` |
| sales `.giftcard-input` | `giftcards/suggest` | 0 | 10 | select submits `#add_payment_form` | `:747-755` |
| receiving `#item` | `receivings/stockItemSearch` | 0 | 10 | select submits add form | `app/Views/receivings/receiving.php:435-444` |
| receiving `#supplier` | `suppliers/suggest` | 0 | 10 | select submits supplier form | `:482-490` |
| item form `#tax_category` | `taxes/suggestTaxCategories` | 0 | 15 | `cacheLength:1`, `appendTo:'.modal-content'`, select+focus fill id/label | `app/Views/items/form.php:476-484` |
| item form `#low_sell_item_name` | `items/suggestLowSell` | 0 | 15 | same fill id/label pattern | `:492-500` |
| item form `#category` | `items/suggestCategory` | default (1) | 10 | `appendTo:'.modal-content'`, plain value | `:502-506` |
| item-kit `#item` | `items/suggest` | 0 | 10 | appends a kit row or increments quantity, then clears field | `app/Views/item_kits/form.php:210-230` |
| item-kit `#item_name` | `items/suggestKits` | 0 | 15 | `cacheLength:1`, fills hidden id | `:245-255` |
| customer `#sales_tax_code_name` | `taxes/suggestTaxCodes` | 0 | 15 | `cacheLength:1`, fills hidden id | `app/Views/customers/form.php:461-470` |
| giftcard `#person_name` | `customers/suggest` | 0 | 10 | fills hidden id | `app/Views/giftcards/form.php:88-96` |
| expense/sales/receiving supplier | `suppliers/suggest` | 0 | 10 | fills hidden id | `app/Views/expenses/form.php:176-183`, `sales/form.php:188-196` |
| sales form customer/employee | `customers/suggest` / `employees/suggest` | 0 | 10 | fills hidden id | `app/Views/sales/form.php:188-212` |
| bulk edit `#category` | `items/suggestCategory` | default | 10 | `appendTo:'.modal-content'` | `app/Views/items/form_bulk.php:175-180` |
| attributes item value | `attributes/suggestAttribute/<id>` | default | default | custom `source` function using `$.get` | `app/Views/attributes/item.php:118-130` |

### 3.4 Keyboard/selection behavior in the register

- `#item` is focused on document ready (`register.php:684`).
- Blur replaces the field with the localized placeholder “Start typing Item Name or scan Barcode…” (`:686-689`); click clears placeholder text (`:714-716`); double-click calls `autocomplete('search')` to show all suggestions (`:714-719`).
- Enter in `#item` submits the add form; `select` submits immediately with the selected item id (`:706-712`, `:696-704`).
- `#customer` behaves the same: placeholder on blur, click clears, dblclick searches all, Enter submits, select submits (`:721-745`).
- Barcode scanning is therefore “type/scan into `#item` + Enter”; there is no explicit scanner listener, no global key capture, and no focus theft except initial focus.
- Row inputs (`price`, `quantity`, `discount`, `description`, `serialnumber`, `discounted_total`) auto-submit the row’s edit form on `change` (`:861-865`); Enter in any cart input submits the previous form (`:822-826`); `amount_tendered` Enter submits payment (`:828-832`); `discount_toggle` injects a hidden `discount_type` and submits (`:868-873`).
- The register also reacts to `dblclick` on `#item`/`#customer` and to `change` of `item_number`/`name`/`item_description` in temporary item rows, posting to change endpoints (`:632-682`).

### 3.5 Config-driven labels and multi-pack names

- Items suggestions are generated by `Item::get_search_suggestions()`: name, item number, category (label only), supplier company (label only), description, and optional custom attributes (`app/Models/Item.php:1010-1120`).
- Label columns come from three config values: `suggestions_first_column` (default `name`), `suggestions_second_column`, `suggestions_third_column`; allowed values are `name`, `item_number`, `description`, `cost_price`, `unit_price` (`Item.php:22-23`, `890-949`; config UI `app/Views/configs/general_config.php:299-353`).
- Non-multi-pack labels join the selected columns with `NAME_SEPARATOR = ' | '` (`app/Config/Constants.php:134`, `Item.php:937-946`).
- With `multi_pack_enabled`, the `name` column is rendered as `"<name> | <pack_name>"` before joining the other columns; `format_result_numbers()` localizes cost/unit price (`Item.php:931-949`, `968-1001`).
- Item table rows likewise append `NAME_SEPARATOR . pack_name` when multi-pack is enabled (`tabular_helper.php:485-487`).
- Nominatim address autocomplete is a separate subsystem: fields declare dependencies, response format, extra params, and `minChars: 3`, `delay: 1000`, `appendTo: '.modal-content'`; it deduplicates labels and fills dependent fields on select (`public/js/nominatim.autocomplete.js:10-123`).

### 3.6 Target autocomplete and gaps

- The sales register fetches suggestions only when `term.trim().length >= 2`, debounces 200 ms, and calls a server action `suggestItemsAction` (`src/components/sales/register.tsx:60-73`). The dropdown is a list of buttons with no `role=listbox`, no `aria-activedescendant`, no arrow-key navigation, no Escape handling, no `autoFocus`, no dblclick-to-search-all, and no “scan barcode” fast path beyond Enter (`:136-152`, `:133`).
- Customer search is client-side filtering over a prop array, switches to full list under 2 chars, and is rendered as a `<select>` rather than a suggestion widget (`:75-82`, `:283-290`).
- The suggestion API returns full repository rows rather than `{value,label}`: `getStockSearchSuggestions()` returns `ItemRow[]` (`src/lib/items/repository.ts:566-568`, `src/app/api/items/suggest/route.ts:1-13`). This leaks internal fields and prevents the register from reproducing upstream labels.
- `src/app/api/items/suggest/route.ts:10` returns `[]` for an empty term, so “show all on dblclick” is impossible.
- All suggestion endpoints require an authenticated session and return 401 JSON; upstream endpoints are behind the secure controller too, but upstream’s register/table pages handle 401 by redirect (`header_js.php:67-71`), which the target does not.
- No equivalent of the configurable suggestion columns, `NAME_SEPARATOR`, multipack label, or price localization exists (`grep` for `suggestions_first_column` in target returned nothing).
- No Nominatim/address autocomplete in the target.
- Barcode focus: target register does not autofocus the item field; receiving does not autofocus either (`src/components/receivings/register.tsx:27-39`). There is no scanner/keyboard global handler.

---

## 4. Sales register UX

### 4.1 Layout and top controls

Upstream `app/Views/sales/register.php` is a two-column layout: `#register_wrapper` 70% left, `#overall_sale` 29% right (`public/css/register.css:1-6`, `:50-61`), both floated. It is not a modern grid and does not collapse gracefully below tablet width; it relies on Bootstrap 3.

Top “mode” panel (`register.php:64-126`):

- Register mode `<select name="mode">` with bootstrap-select styling; `onchange` submits `#mode_form` (`:71-75`).
- Optional dinner table `<select name="dinner_table">` when `dinner_table_enable` (`:76-84`).
- Optional stock location `<select name="stock_location">` when more than one location (`:85-93`).
- Right side: “Suspended” button with `class="modal-dlg"` and `data-href="<controller>/suspended"` (`:95-100`); “Daily Sales” link to `<controller>/manage` when the employee has `reports_sales` (`:102-113`).
- Item-add panel: label “Find or Scan Item or Receipt”, input `#item`, tabindex sequence starting at 1, and a “New Item” `modal-dlg` button with `data-btn-new` and `data-btn-submit` (`:128-152`).
- Sale items table has 8 columns: delete, item number, item name, price, quantity, discount, total, update (`:154-167`). Empty state is an info alert spanning 8 columns (`:160-163`).
- Cart rows are reversed (`array_reverse($cart, true)`) so newest lines appear first (`:166-168`).
- Each cart line is its own `<form id="cart_<line>">`; temporary items expose editable item number/name/description; normal items show escaped number/name plus `[stock in location]`; price/quantity are editable only with permissions; discount has a bootstrap-toggle currency/percent switch; total is editable only for `ITEM_AMOUNT_ENTRY`; the refresh icon submits the row form (`:169-278`).
- Serialized items render quantity as read-only text and show a serial-number input (`:236-244`, `:271-276`).
- The right column shows customer block (selected customer name as modal link, email, address, location, discount, rewards package/points, total, MailChimp status, remove button) or customer search input + “New Customer” + “Shortcuts” help button (`:285-372`).
- Totals table: quantity of items, subtotal, each tax group/rate, large total (`:375-397`).
- Payment section: payments total, amount due, then either complete-sale (when payments cover total) or add-payment; payment type select is disabled when covered; amount tendered input is disabled when covered; reference-code row exists hidden; giftcard vs non-giftcard inputs duplicate `amount_tendered` with one enabled (`:399-520`).
- Payment list table with delete links (`:522-541`).
- Action buttons: Suspend, Finish (invoice/quote/WO modes), Cancel; comments textarea; print-after-sale checkbox; email-receipt checkbox when customer email; price-work-orders checkbox; invoice number input for invoice mode (`:543-607`).

### 4.2 Keyboard shortcuts — exact upstream behavior

Defaults are stored in `Sale_lib::KEY_SHORTCUT_DEFAULTS` (`app/Libraries/Sale_lib.php:26-37`):

| Name | Default value string | Code | Label | Action in register |
|---|---|---|---|---|
| cancel | `27 | ESC` | 27 | ESC | `#cancel_sale_button` click |
| items | `49 | ALT + 1` | 49 | ALT + 1 | focus/select `#item` |
| customers | `50 | ALT + 2` | 50 | ALT + 2 | focus/select `#customer` |
| suspend | `51 | ALT + 3` | 51 | ALT + 3 | click Suspend |
| suspended | `52 | ALT + 4` | 52 | ALT + 4 | click Suspended |
| amount | `53 | ALT + 5` | 53 | ALT + 5 | focus/select `#amount_tendered` |
| payment | `54 | ALT + 6` | 54 | ALT + 6 | click Add Payment |
| complete | `55 | ALT + 7` | 55 | ALT + 7 | Complete if paid, else Add Payment |
| finish | `56 | ALT + 8` | 56 | ALT + 8 | click Finish (invoice/quote/WO) |
| help | `57 | ALT + 9` | 57 | ALT + 9 | click Shortcuts help |

- `getKeyShortcutsOptions()` returns `value => label` for the config dropdown (`Sale_lib.php:133-140`).
- `getKeyShortcuts()` parses each `app_config['key_<name>']` as `"code | label"` with per-name defaults (`:147-161`).
- Config persistence validates the posted value against allowed options, falls back to the current/default value, and rejects duplicate bindings with `Config.shortcuts_duplicate_bindings` (`app/Controllers/Config.php:1122-1146`).
- Config view renders ten dropdowns from `$shortcutLabels` and submits via jQuery validation + `ajaxSubmit`, with `DOMPurify.sanitize` on error text (`app/Views/configs/shortcuts_config.php:12-46`, `:58-82`).
- Register binds: `document.body.onkeyup`; ignores events when any bootstrap modal is open (`$(event.target).closest('.modal').length || $('.modal.in').length`); if `altKey`, switches on `event.keyCode` for items/customers/suspend/suspended/amount/payment/complete/finish/help; outside the `altKey` branch, switches on `event.keyCode === cancel` (`app/Views/sales/register.php:918-967`).
- Help modal is a `modal-dlg` opened from a button (`:349-353`); `app/Views/sales/help.php` renders two tabs, “System Shortcuts” (the configured ten) and “Helpful Shortcuts” (browser keys F11, CTRL+, CTRL−, CTRL+0, CTRL+P, CTRL+F) (`help.php:24-85`). Shortcut labels fall back to the raw code when the stored label is empty (`:39-45`).
- The shortcut set is injected into the page as `keyboardShortcuts` JSON, and codes are flattened into `shortcutCodes` (`register.php:613-626`).

**There is no upstream F1–F12 binding, no “fullscreen” action, and no “quantity toggle” action.** F11/CTRL+P/CTRL+F appear only as informational browser shortcuts in the help modal. This matters because the target invented those actions (`src/lib/constants.ts:79-92`).

### 4.3 Payment-type behavior

`check_payment_type()` (`register.php:875-915`) is called on load and on payment-type change (`:818`). It branches:

- **Gift card** (`lang('Sales.giftcard')`): resets total/amount-due display, relabels amount tendered as “Gift Card Number”, clears and focuses the giftcard input, enables `.giftcard-input`, disables `.non-giftcard-input`, hides reference-code row.
- **Cash with `cash_mode == 1`**: displays non-cash total and cash amount due, relabels amount tendered, prefills the cash amount due, enables non-giftcard inputs, hides reference row.
- **Other**: displays non-cash total and amount due, prefills amount due, enables non-giftcard inputs; if the payment type is in `reference_code_payment_types`, shows and enables the reference-code input; otherwise hides and disables it.
- Duplicate `amount_tendered` inputs exist so the correct one is enabled per branch; `input#amount_tendered:disabled { display: none; }` hides the disabled twin (`public/css/register.css:76-78`).

### 4.4 Suspend / cancel / complete

- Suspend: sets `#buttons_form` action to `<controller>/suspend` and submits (`register.php:801-804`).
- Cancel: `confirm(<Sales.confirm_cancel_sale>)`, then action `<controller>/cancel` and submit (`:806-811`), with localized text “Are you sure you want to clear this sale? All items will be cleared.” (`app/Language/en/Sales.php:25`).
- Complete: `#finish_sale_button` sets action `<controller>/complete` and submits (`:791-795`); the invoice/quote/WO “finish without payment” button does the same (`:797-800`).
- Payment can complete in one step via the hidden `complete_after_payment` value; the add-payment button forces it to `0` (`:813-816`).
- Suspended sales modal lists doc id, date, optional table, customer, employee, comments, and an “Unsuspend” form per row (`app/Views/sales/suspended.php:15-80`); table styles are local, not bootstrap-table.

### 4.5 Auto-saved register settings

Each of these posts on change/keyup, without a save button:

- comment (`register.php:757-761`), invoice number (`:763-769`), print-after-sale (`:771-775`), price-work-orders (`:777-781`), email-receipt (`:783-787`), and cart row fields (`:861-866`).

On failure there is no error display; the AJAX wrapper’s 401 redirect is the only global handling (`header_js.php:67-71`). This is a source behavior worth deciding explicitly in the port (silent best-effort vs. visible failure).

### 4.6 Notifications in the register

- Customer removal posts `sales/removeCustomer` then reloads (`register.php:632-635`).
- Item deletion posts `sales/deleteItem/<line>` then reloads (`:637-641`).
- Payment deletion posts `sales/deletePayment/<id>` then reloads (`:643-647`).
- `table_support.handle_submit` is overridden: it notifies the response message; on success, if the resource ends in `customers`, it writes the returned id into `#customer` and submits the customer form; otherwise it writes the response id into `#item`, sets `#item_location` from the stock-location select, and submits (or AJAX-submits when `stay_open`) the add-item form (`:840-858`). This is the “create customer/item from the register without leaving the sale” flow.

### 4.7 Target register comparison

Target `src/components/sales/register.tsx`:

- Two-column responsive layout (`:110-111`, `:273`); mode pills instead of a select (`:34-40`, `:241-257`); location select; dinner-table select; comment; document number; email-receipt checkbox (`:274-350`).
- Item suggestion dropdown (2-char/200 ms) and Add button; quantity input; Enter adds (`:125-171`).
- Cart table with editable price/qty/discount and delete (`:173-239`); no per-line form, no auto-submit on blur/change semantics (each keystroke fires a server action), no discount currency/percent toggle, no serial/description/temp-item editing, no stock indication, no attribute display, no row refresh action.
- Totals card (subtotal, discount, taxes, total) (`:259-270`); paid/due/change and payment add (`:352-426`); giftcard uses `window.prompt` instead of a suggestion input (`:410-416`).
- Suspend/Complete buttons (`:428-445`), no Cancel, no Finish-without-payment, no suspended-sales modal, no takings link, no print/email/receipt toggles beyond email.
- Help modal with only Ctrl+H, Enter, Esc, opened by Ctrl+H (`:84-93`, `:448-464`); no configured ALT shortcuts, no tabbed help, no browser shortcut list.
- No item/customer creation modals (`new_item_button`, `modal-dlg` new customer), no `table_support.handle_submit` equivalent, no `dialog_support` equivalent.
- No barcode focus on mount, no placeholder-clearing behavior, no dblclick-to-search-all, no “receipt lookup” in return mode.
- No notification/toast on action success/failure.

---

## 5. Forms UX (cross-cutting)

### 5.1 Modal dialog framework

`dialog_support` (`public/js/manage_tables.js:1-107`) wraps Bootstrap 3 Dialog:

- `init(selector)` binds click on elements; resolves the actual link/button if the event target is a child; GETs `href` or `data-href` and injects the HTML into the modal body; the modal class is `modal-dlg` by default, or any class matching `modal-dlg-<width>` (`:35-106`).
- Buttons are built from `data-btn-*` attributes: `data-btn-submit`, `data-btn-delete`, `data-btn-new`. Each gets a bootstrap style (`submit`/`new` primary, `delete` danger), and Enter (keyCode 13) is the hotkey for “new” when present, else “submit” (`:40-72`).
- If no buttons are declared, a single Close button is added (`:73-81`).
- `submit(button_id)` finds the first form in the modal body, checks the jQuery-validation `formSubmitted` flag, calls `form.submit()` for submit/new, disables `#submit` while validating, and returns false to keep the modal open (`:17-33`). `hide()` and `clicked_id()` are exposed so forms can decide “Save” vs “Save & New” (`:8-15`, `:96-101`).
- Forms close the dialog explicitly with `dialog_support.hide()` in their success handler (e.g. `app/Views/items/form.php:535`, `app/Views/customers/form.php:476`, `app/Views/home/form_change_password.php:95`).
- Widths: 500 px default, 750 px for `modal-dlg-wide` (`public/css/ospos.css:151-163`); the suspended-sales view locally forces 750 px (`app/Views/sales/suspended.php:9-14`).

Target has no dialog component. Modals are hand-rolled fixed overlays, e.g. the register help modal (`src/components/sales/register.tsx:448-464`) with no `role="dialog"`, `aria-modal`, focus trap, Escape handler, or portal. Forms are full pages; there is no modal form flow.

### 5.2 Required fields and validation display

Upstream conventions:

- Every form starts with `<div id="required_fields_message">Fields in red are required</div>` and `<ul id="error_message_box" class="error_message_box"></ul>` (e.g. `app/Views/items/form.php:31-32`, `app/Views/customers/form.php`, `app/Views/home/form_change_password.php:6-7`, `app/Views/configs/shortcuts_config.php:29-31`).
- Required labels carry `class="... text-danger required"` (e.g. `app/Views/items/form.php:43`, `:57`; `app/Views/configs/shortcuts_config.php:35`).
- `form_support.error` defines `errorClass: "has-error"`, `errorLabelContainer: "#error_message_box"`, `wrapper: "li"`, and highlight/unhighlight toggling `.has-error` on the closest `.form-group` (`public/js/manage_tables.js:342-356`).
- `form_support.handler` supplies a default `submitHandler` that `ajaxSubmit`s and notifies `{message,type}`; forms normally extend it and override `submitHandler` to close dialogs and refresh tables (`:358-377`).
- The CSS places the required-message centered italic and error list red/bold (`public/css/popupbox.css:1-10`).
- Multiple validation errors are spaced by `.alert div:not(:first-child)` on login (`public/css/login.css:68-70`).

Validation is jQuery Validation 1.22.1, configured per form:

- `rules` — `required`, `minlength`, `equalTo`, `notEqualTo` custom method, plus `remote` endpoints for uniqueness/numeric checks (`app/Views/items/form.php:544-606`, `app/Views/customers/form.php:489-512`, `app/Views/home/form_change_password.php:99-122`).
- `messages` — localized strings per rule.
- `errorLabelContainer` — per-form error list.
- `invalidHandler` — some forms notify `Common.correct_errors` (e.g. `app/Views/taxes/tax_categories.php:91-93`).
- Custom methods: `valid_chars` rejecting `|`/`_` (`items/form.php:515-518`, `attributes/form.php`), duplicate-row validators (`dinner_table`, `check4TaxCategoryDups`, `customer_reward`), password `notEqualTo`.
- Server-side responses are always `{success, message, id}`; success closes/refreshes, failure notifies danger. Field-level server errors are usually concatenated into `message` (e.g. `validateFields()` in `Secure_Controller.php:103-116`).

### 5.3 Tabs and sections

- Config uses a 12-tab `nav nav-tabs` + `.tab-content` with one partial per tab: info, general, tax, locale, barcode, stock, receipt, invoice, shortcuts, reward, table, system (`app/Views/configs/manage.php:15-87`). Tabs are Bootstrap 3 data-toggle; `tab-pane` has top padding (`public/css/ospos.css:33-35`).
- Help uses two tabs (`app/Views/sales/help.php:24-29`).
- Entity forms use `fieldset` and tab panes only for employee permissions; most are a single vertical form. Employees form builds permission tabs from grants (`app/Views/employees/form.php`).
- Target config is a client-side tab strip (`src/components/config/config-tabs.tsx:22-38`); every other form is a single sectioned page. There is no generic tabs primitive in `src/components/ui/`.

### 5.4 Dynamic show/hide and row cloning

- Item type/stock type: the item form renders radio groups and conditional fields (`app/Views/items/form.php:87-170`), but no dedicated JS toggling was found in 3.4.3 (the fields are conditionally rendered server-side). Do not assume a client toggle exists.
- Attributes form hides/disables definition type options and toggles value/group/flags fields based on the selected type (`app/Views/attributes/form.php:110-140`).
- Specific report input toggles `.discount_percent`/`.discount_fixed` (`app/Views/reports/specific_input.php:101-108`).
- Sales edit form shows reference-code inputs only for configured payment types (`app/Views/sales/form.php:216-225`).
- Register hides/shows reference-code fields in `check_payment_type()` (`register.php:888-914`).
- Config row editors clone the current row and increment the label/index: dinner tables (`app/Views/configs/table_config.php:57-90`), stock locations with jQuery UI sortable drag handles (`app/Views/configs/stock_config.php:58-103`), customer rewards (`app/Views/configs/reward_config.php:70-95`), tax categories (`app/Views/taxes/tax_categories.php:45-67`), tax codes (`app/Views/taxes/tax_codes.php:45-68`), tax jurisdictions (`app/Views/taxes/tax_jurisdictions.php:47-70`). Add/remove controls are glyphicon plus/minus spans in the partials (`app/Views/partial/dinner_tables.php:29-31`, `:41-43`; `stock_locations.php:17-41`; `customer_rewards.php:41-43`; `tax_categories.php:40-42`; `tax_codes.php:63-65`; `tax_jurisdictions.php:83-85`).
- Destination-based tax: config `use_destination_based_tax` switches item table header/row display between tax category and tax percents (`tabular_helper.php:437-443`, `463-500`), and item form autocompletes tax category (`items/form.php:476-484`). Tax rate form is the destination-tax editor (`app/Views/taxes/tax_rates_form.php`).
- Customer rewards: config toggle disables/hides reward inputs and add/remove controls (`reward_config.php:46-58`); customer form shows rewards package select only when enabled (`customers/form.php:122-140`).

### 5.5 File upload preview

Jasny Bootstrap fileinput (`jasny-bootstrap` 3.1.3) provides the preview widget:

- Company logo: `fileinput` with `data-provides="fileinput"`, `fileinput-new` thumbnail, `fileinput-preview fileinput-exists` thumbnail, change/remove controls (`app/Views/configs/info_config.php:36-50`). Removing triggers a GET to `config/removeLogo` (`:164-171`).
- Item image: same pattern at 100×100 (`app/Views/items/form.php:357-372`), with a remove AJAX GET to `<controller>/removeLogo/<item_id>` (`:508-514`).
- CSV import: fileinput input-group with filename display and remove link (`app/Views/items/form_csv_import.php:14-20`, `app/Views/customers/form_csv_import.php:14-20`).

Target: no upload preview; config exposes `company_logo` as a text field (`src/lib/config/tabs.ts:27`), and item forms have no image upload UI (grep found no `type="file"` in item/customer forms). CSV import exists as a page (`src/app/(secure)/items/csv-import/page.tsx`) but was not audited here.

### 5.6 Date, datetime, decimal, and select inputs

- `partial/datepicker_locale` configures bootstrap-datetime-picker for every `.datetime` input: format from PHP config, `showMeridian` derived from `a`/`A`, `minView:2`, `minuteStep:1`, `autoclose`, `todayBtn`, `todayHighlight`, `bootcssVer:3`, `language: current_language_code()` (`app/Views/partial/datepicker_locale.php:6-26`); it registers day/month names under `$.fn.datetimepicker.dates[config.language]` (`:28-93`) and initializes all `.datetime` (`:95`). Note two source quirks: the registration key is the language *name* (e.g. `english`) while the widget is told `language: en`, and `... }, <?php echo isset($config) ?>);` emits `}, 1);` (`:25`) — reproduce or consciously fix, but do not silently diverge.
- `partial/daterangepicker` is the report/table range control (§2.5).
- Decimal inputs are plain `form_input` with server-formatted values (`to_currency_no_money`, `to_decimals`, `to_quantity_decimals`) and `onClick="this.select();"` for fast overtype (e.g. `register.php:199-208`, `:219-221`).
- `bootstrap-select` renders searchable/fit-width selects in the register and filter toolbar (`register.php:72-90`, `items/manage.php:116-137`). There is no Select2; all “select2-like” behavior is bootstrap-select 1.13.18.
- `bootstrap-toggle` renders the currency/percent switch (`register.php:219-223`).
- `bootstrap-tagsinput-2021` and `clipboard` are loaded only on the config page (`gulpfile.js:375-397`); they are used in integrations/general config (e.g. country codes list, API key copy).
- Target: native `<input type="date">` for report ranges (`src/components/reports/report-view.tsx:63-68`), native date/number inputs elsewhere, native selects. No datetime-picker, no bootstrap-toggle equivalent, no tags input, no clipboard button. `dateformat` is stored but not applied to any input rendering.

### 5.7 Delete confirmation, CSRF, and unsaved changes

- Delete confirmation is browser `confirm()` with localized text from the table locale (`manage_tables.js:127-157`, `formatConfirmAction` `bootstrap_tables_locale.php:43-49`). Direct delete links also use `confirm()` (e.g. `sales/register.php:806-811`, `receivings/receiving.php:503`).
- CSRF is automatic per form (`form_open`) plus the AJAX wrapper (§1.8); no form manually renders a token except login’s migration AJAX.
- **There is no unsaved-changes guard.** Grep for `dirty|unsaved|beforeunload` in `app/Views` and `public/js` returned nothing. Navigating away or closing a modal discards edits silently.
- Target uses `confirm()` for customer deletion (`src/components/customers/customers-table.tsx:51`) and Next.js server actions; no unsaved-change guard either.

---

## 6. Print / PDF UX

### 6.1 Browser print path

`app/Views/partial/print_receipt.php` is included by receipt, invoice, quote, tax invoice, work order, and the sales/cashups/expenses “takings” pages (verified by grep). It provides a single global `printdoc()` (`:10-56`):

1. If the Firefox `jsPrintSetup` add-on is present:
   - Sets top/left/bottom/right margins from config (`print_top_margin`, etc.) (`:14-17`).
   - If `print_header` is false, blanks left/center/right header strings; if `print_footer` is false, blanks footer strings (`:19-30`).
   - Reads `jsPrintSetup.getPrintersList().split(',')`.
   - Selects the printer whose name equals `localStorage[<selected_printer>]`, where `<selected_printer>` is `receipt_printer`, `invoice_printer`, or `takings_printer` depending on the page (`:32-39`).
   - Clears silent-print preferences, then sets `printSilent` when `!config['print_silently']` (`:41-46`; note the apparent inversion in the source comment vs code — preserve as source truth or flag for a conscious decision).
   - Calls `jsPrintSetup.print()`.
2. Otherwise falls back to `window.print()` (`:53-55`).

When `$print_after_sale` is true, the partial waits for `window.onload`, calls `printdoc()`, then after `config['print_delay_autoreturn'] * 1000` ms redirects to `sales` (`:58-69`). Default delay is `0` (`app/Database/Migrations/sqlscripts/3.2.0_to_3.2.1.sql:21`).

### 6.2 Printer selection persistence

The receipt config page populates three printer dropdowns from `jsPrintSetup.getPrintersList()` and persists the choice in `localStorage` under the element id (`receipt_printer`, `invoice_printer`, `takings_printer`); if the add-on is absent, margin/header/footer/silent controls are disabled and printers show “N/A” (`app/Views/configs/receipt_config.php:338-358`). On save, a missing add-on triggers `confirm(Config.jsprintsetup_required)` before serializing (`:361-369`).

### 6.3 Print styles

`public/css/ospos_print.css` is inside `@media print` (`:1`):

- Hides `.no-print` and descendants (`:3-6`).
- Shrinks receipt/table font to 75% (`:8-11`).
- Hides `.topbar`, `#menubar`, `#footer` (`:14-21`).
- Centers return policy at 100% width (`:25-27`).
- Keeps nested report tables visible and removes link decoration (`:29-46`).
- `.print_show { display: block !important; }` and `.print_hide { display: none !important; }` (`:51-57`).
- Removes fixed-table borders and adjusts sortable header padding (`:59-66`).

Receipt/invoice screen styles are separate: `receipt.css` (centered header, `#receipt_items` collapsible table, right-aligned totals, discount bold, barcode centered) and `invoice.css` (`#page-wrap` max 800 px, table styles). `invoice_email.css` hides menus/footer and fixes a 750 px page for emailed PDFs. `barcodes/barcode_sheet.php` is a standalone printable HTML page with only `barcode_font.css` and inline barcode dimensions (`app/Views/barcodes/barcode_sheet.php:1-44`).

### 6.4 Email receipt/invoice

- Receipt page shows “Send Receipt” when `customer_email` is set and GETs `sales/sendPdf/<sale_id>/receipt`; if `email_receipt` was requested, it sends automatically on ready (`app/Views/sales/receipt.php:25-38`).
- Invoice page shows “Send Invoice” and GETs `sales/sendPdf/<sale_id>` (`app/Views/sales/invoice.php:25-39`).
- Quote/work-order/tax-invoice templates follow the same pattern.
- Responses are `{success,message}` rendered with `$.notify`.

### 6.5 Target print/PDF gap

- Target receipt/invoice pages are plain HTML with no print button, no `window.print`, no print stylesheet, and no printer selection (`src/app/(secure)/sales/receipt/[id]/page.tsx`, `src/app/(secure)/sales/invoice/[id]/page.tsx`).
- PDF routes exist for receipt/invoice/quote/work-order/tax-invoice and barcodes, rendered with `@react-pdf/renderer` (`src/app/(secure)/sales/*/[id]/pdf/route.tsx`, `src/app/api/items/barcodes-pdf/route.ts`).
- Receipt PDF templates exist as `src/lib/pdf/receipt_default.tsx`, `receipt_short.tsx`, `receipt.tsx`, `invoice.tsx`, `quote.tsx`, `work_order.tsx`, `tax_invoice.tsx`, but the HTML receipt page ignores `receipt_template`, `receipt_show_taxes`, `receipt_show_total_discount`, `receipt_show_description`, `receipt_show_serialnumber`, `receipt_show_tax_ind`, `receipt_show_company_name`, `receipt_font_size`, and `invoice_default_comments` (grep shows config only in seeds/tabs, not in the receipt page).
- No `print_after_sale` auto-print or auto-return. `src/lib/sale/sale-lib.ts:275` reads `print_after_sale` but no print action consumes it.
- Barcode output is a PDF; the upstream standalone HTML sheet (with barcode fonts and per-row/width/cellspacing layout) has no direct equivalent. The target preview grid approximates it (`src/app/(secure)/items/generate-barcodes/page.tsx:60-99`), but `barcode_font` is not applied (`displayBarcode` in `src/lib/barcode/index.tsx:95-128` only computes text rows), and `barcode_width` defaults disagree (`index.tsx:41` `"2"` vs page `:38` `"250"`).
- Email receipts: target has `src/app/(secure)/sales/email-action.tsx` and nodemailer, but the receipt page does not expose a send button.

---

## 7. Assets

### 7.1 Upstream public source assets (committed)

| File | Purpose | Notes |
|---|---|---|
| `public/css/barcode_font.css` | `@font-face` declarations for SansationLight, Arial, JUNEBUG, b-de-bonita-shadow | `:1-40` |
| `public/css/bootstrap.autocomplete.css` | jQuery UI autocomplete skin matched to Bootstrap | `:1-30` |
| `public/css/invoice.css` | Screen invoice layout (`#page-wrap` 800 px) | `:1-60` |
| `public/css/invoice_email.css` | Emailed/printed invoice layout, hides menubar/footer | `:1-50` |
| `public/css/login.css` | Login card, responsive breakpoints, captcha overflow | `:1-134` |
| `public/css/ospos.css` | Global shell: topbar, navbar, module list, footer, tabs, modal widths, spinner, helpers | `:1-190` |
| `public/css/ospos_print.css` | Print visibility and report/receipt print rules | `:1-66` |
| `public/css/popupbox.css` | Required/error message styling and modal form ids | `:1-90` |
| `public/css/receipt.css` | Receipt layout and total alignment | `:1-50` |
| `public/css/register.css` | 70/29 register split, cart/payment/buttons | `:1-120` |
| `public/css/reports.css` | Summary rows, chartist label rotation/tooltip styling | `:1-50` |
| `public/js/hide_cost_profit.js` | Chart report cost/profit toggle persisted in `summaryVisibility` | `:1-46` |
| `public/js/imgpreview.full.jquery.js` | Hover image preview plugin, v0.22, “Dual licensed under MIT and GPL”, © 2009 James Padolsey | `:1-9`, `:17-111` |
| `public/js/manage_tables.js` | `dialog_support`, `table_support`, `form_support`, `number_sorter` | 383 lines |
| `public/js/nominatim.autocomplete.js` | OpenStreetMap Nominatim address autocomplete | `:1-132` |
| `public/fonts/*` | SansationLight, Arial, JUNEBUG, b-de-bonita-shadow, FontAwesome | ~1.2 MB |
| `public/images/favicon.ico`, `logo.png`, `jquery-ui/*` | favicon, logo, jQuery UI theme images | — |
| `public/images/menubar/*.svg` | Generated from Elegant Circles; only `.gitkeep` committed | `gulpfile.js:30-53` |
| `public/uploads/` | Company logo and item pics (writable) | `.gitignore` |

### 7.2 Upstream third-party libraries (exact versions/licenses from `package-lock.json`)

| Package | Version | License | Purpose in UI |
|---|---|---|---|
| jquery | 3.7.1 | MIT | DOM, AJAX, autocomplete host |
| jquery-ui-dist | 1.13.3 | MIT | autocomplete, sortable, color animation, datepicker assets |
| bootstrap | 3.4.1 | MIT | app grid/nav/modals/tabs |
| bootswatch | 3.4.1 | MIT | Bootswatch 3 themes for app |
| bootstrap5 (npm alias) | 5.3.8 | MIT | login-only Bootstrap 5 |
| bootswatch5 (npm alias) | 5.3.8 | MIT | login themes; 12 themes excluded for Bootswatch-3 parity (`gulpfile.js:55-60`) |
| bootstrap-table | 1.27.3 | MIT | tables, sticky header, export/mobile extensions |
| bootstrap-select | 1.13.18 | MIT | styled searchable selects |
| bootstrap-daterangepicker | 2.1.30 | MIT | report/table date ranges |
| bootstrap-datetime-picker | 2.4.4 | Apache-2.0 | `.datetime` inputs |
| bootstrap-notify | 3.1.3 | MIT | `$.notify` toasts |
| bootstrap3-dialog | 1.35.4 (GitHub master) | MIT | modal CRUD dialogs |
| jasny-bootstrap | 3.1.3 | Apache-2.0 | file upload preview widget |
| bootstrap-toggle | 2.2.2 | MIT | currency/percent discount switch |
| bootstrap-tagsinput-2021 | 0.8.6 | MIT | config tag inputs |
| chartist | 0.11.4 | MIT OR WTFPL | graphical reports |
| chartist-plugin-axistitle / barlabels / pointlabels / tooltips | 0.0.7 / 0.0.5 / 0.0.6 / 0.0.17 | MIT | chart annotations |
| moment | 2.31.0 | MIT | live clock, daterangepicker |
| dompurify | 3.4.17 | MPL-2.0 OR Apache-2.0 | sanitize toast/dialog HTML |
| jspdf | 4.2.1 | MIT | PDF export |
| jspdf-autotable | 5.0.9 | MIT | PDF table export |
| html2canvas | 1.4.1 | MIT | PDF/export rendering |
| file-saver | 2.0.5 | MIT | client downloads |
| xlsx (SheetJS) | 0.20.3 (CDN tarball override) | Apache-2.0 | Excel export |
| tableexport.jquery.plugin | 1.33.0 | MIT | table export backends |
| clipboard | 2.0.11 | MIT | config copy buttons |
| elegant-circles | 1.0.0 (GitHub `opensourcepos/elegant-circles#minified`) | **GPL** (as reported by `package-lock.json`) | menubar icons |
| jquery-form | 4.3.0 | MIT | `ajaxSubmit` |
| jquery-validation | 1.22.1 | MIT | form validation |

Build tooling: Gulp 5.0.1, gulp-rev 12, gulp-concat, gulp-clean-css, gulp-uglify, gulp-inject, gulp-tar/zip, license-report (`package.json` devDependencies). The app license is MIT (`package.json:12`). Vendor licenses are collected into `public/license/` by `gulp update-licenses` (`gulpfile.js:104-115`).

### 7.3 Asset build/injection pipeline

- `clean` removes `public/resources` (`gulpfile.js:101-105`).
- `copy-bootswatch` copies every `node_modules/bootswatch/*/*.min.css` and fonts to `public/resources/bootswatch/` (`:117-130`).
- `copy-bootswatch5` copies Bootswatch 5 themes, excluding 12 themes absent from Bootswatch 3 (`:55-60`, `:132-139`).
- `copy-bootstrap` copies Bootstrap 3 CSS and Bootstrap 5 CSS **including `bootstrap.rtl.min.css`** (`:140-155`).
- `copy-menubar` renames 19 Elegant Circles SVGs to module ids (`:30-53`, `:157-167`).
- `debug-css` revs and injects 20 individual stylesheets into `header.php` markers (`:176-206`).
- `prod-css` concatenates/cleans/minifies the same list into `opensourcepos.min.css`, revs it, and injects (`:208-242`).
- `debug-js` revs and injects 31 scripts (`:244-286`); `prod-js` emits jQuery separately, concatenates pre-minified vendor scripts, uglifies daterangepicker/imgpreview/manage_tables/nominatim, and injects both (`:288-346`).
- `debug-login-js`/`prod-login-js` inject only jQuery into login (`:348-373`).
- `debug-config-js`/`prod-config-js` inject tagsinput + clipboard into config (`:375-403`).
- All injection markers live in `header.php`, `login.php`, `configs/manage.php`.

**Asset implication for the target:** most of these are jQuery/Bootstrap-3-era libraries under MIT/Apache-2.0/MPL-2.0 (imgPreview is dual MIT/GPL — choose MIT). **Exception:** the menubar SVGs come from `elegant-circles`, whose lockfile license is **GPL 1.0.0**; do not copy those icon files into the target unless the distribution is GPL-compatible. Replace them with an independently licensed icon set (the target already uses ISC-licensed Lucide). The React stack also means jQuery plugins cannot be reused directly without jQuery + Bootstrap 3 CSS, which would conflict with Tailwind v4; the correct parity approach is behavioral reimplementation, not asset copying. `chartist` has no target equivalent (the target hand-rolls SVG charts in `src/components/reports/charts.tsx`).

### 7.4 Target assets and dependencies

`public/` contains only `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` — no app assets at all.

| Target dependency | Version | License | Role |
|---|---|---|---|
| next | 16.2.9 | MIT | framework |
| react / react-dom | 19.2.4 | MIT | UI runtime |
| @tanstack/react-table | 8.21.3 | MIT | installed but **unused** (grep found no imports) |
| lucide-react | 1.22.0 | ISC | icons |
| next-intl | 4.13.0 | MIT | installed, only `getRequestConfig` present (`src/lib/i18n/index.ts:1-12`), not mounted |
| react-hook-form | 7.80.0 | MIT | installed but unused |
| zod | 4.4.3 | MIT | installed but unused |
| @react-pdf/renderer | 4.5.1 | MIT | PDF receipts/invoices/barcodes |
| bwip-js | 4.11.1 | MIT | barcode SVG/PNG |
| tailwindcss / @tailwindcss/postcss | 4.3.1 | MIT | styling |
| next-auth / @auth/drizzle-adapter | 5.0.0-beta.31 / 1.11.2 | ISC | auth |
| drizzle-orm | 0.45.2 | Apache-2.0 | DB |
| better-sqlite3 | 12.11.1 | MIT | SQLite driver |
| mysql2 | 3.22.5 | MIT | MySQL driver |
| nodemailer | 7.0.13 | MIT-0 | email |
| bcryptjs | 3.0.3 | BSD-3-Clause | password hashing |

Target public asset gap: no CSS files, no JS files, no fonts, no brand images, no favicon set beyond the app-router default. `postcss.config.mjs` wires only `@tailwindcss/postcss`; there is no `tailwind.config.*` and theme tokens live in `src/app/globals.css:3-42`.

---

## 8. Accessibility, responsiveness, localization, RTL, dark mode

### 8.1 Accessibility (upstream baseline)

- Bootstrap 3 provides basic keyboard/focus support for nav, tabs, modals, and selects; `aria-label` appears on the stock-location default radio (`app/Views/partial/stock_locations.php:24`) and login inputs (`app/Views/login.php:124`, `:133`).
- The table loading template includes `role="status"` (`public/js/manage_tables.js:260-261`); login icon SVGs include `<title>` elements (`app/Views/login.php:120`, `:129`).
- Upstream has no skip link, no `scope` attributes in generated tables, no focus trap beyond bootstrap-dialog’s behavior, no `aria-live` for validation/toasts, and no explicit contrast audit. The baseline is “Bootstrap 3 default,” not WCAG AA.
- Target is similar but with less: no `aria-live`, no `role="dialog"`/`aria-modal` on the register help modal (`src/components/sales/register.tsx:448-464`), no `scope` on any `<th>` (grep count 0), no skip link. Focus rings are globally defined (`src/app/globals.css:75-78`), reduced motion is respected (`:80-88`), and mobile table overflow exists.

### 8.2 Responsiveness

- Upstream: fixed two-column register, collapsed navbar under 768 px, modal widths, login breakpoints at 768/2560/3840/360 px, report grids via Bootstrap columns (`col-md-4`), and `bootstrap-table-mobile` bundled but not enabled.
- Target: Tailwind breakpoints; sidebar is always 240 px with no drawer; register stacks under `lg`; items/customers tables scroll; config tab strip wraps; report filters wrap. No mobile-specific table card layout. This is acceptable visually but not parity-tested.

### 8.3 Localization

- Upstream: `current_language_code()` from employee/session/config (`app/Helpers/locale_helper.php:12-21`); all UI text from `app/Language/<locale>/*.php`. English label files and key counts: Attributes 32, Bootstrap_tables 8, Calendar 45, Cashups 46, Common 78, Config 344, Customers 53, Datepicker 20, Employees 47, Enum 7, Error 10, Expenses_categories 19, Expenses 47, Giftcards 68, Item_kits 36, Items 121, Login 27, Messages 12, Module 45, Receivings 56, Reports 147, Sales 210, Suppliers 21, Taxes 81 (grep count of quoted keys). Total ≈ 1,676 key lines (files include blank/comment lines, so the true key count is slightly lower).
- Localized dynamic pieces: date/time/number/currency formatting (`app/Helpers/locale_helper.php:353-560`), calendar/month names (`Calendar.php`), daterangepicker labels (`Datepicker.php`), table locale (`Bootstrap_tables.php`), module labels (`Module.php`), login/migration strings (`Login.php`).
- 47 locale directories exist (`app/Language/`), including RTL scripts.
- Target: `next-intl` locale list hard-coded to `["en"]` (`src/lib/i18n/index.ts:3`), messages loaded from `@/messages/<locale>/common.json`, `en` is `{}` and `bn` has 2.6 KB; 47 message directories exist but most are empty. All component strings are hard-coded English (`grep` shows no `useTranslations`). There is no route-based locale, no per-user language selection in the shell, and login does not consult the session language.
- The target does store `language`/`language_code` on the user and JWT (`src/lib/auth/options.ts:42-70`), but nothing consumes them for rendering.

### 8.4 RTL

- Upstream copies `bootstrap.rtl.min.css` (`gulpfile.js:148-151`) but does not select it anywhere in `header.php` or `login.php`; RTL languages have translations but the shell has no `dir` logic. This is a partial/aspirational upstream feature. Reproducing the current behavior means: translations exist, RTL stylesheet is available, but the app does not switch direction automatically.
- Target: no `dir` attribute, no RTL CSS, no logical-property usage. Tailwind v4 does support `rtl:` variants, but none are used.

### 8.5 Dark mode

- Upstream: no dark mode; theme is a Bootswatch stylesheet selected globally. “Dark” themes (e.g. darkly/slate/superhero) are separate Bootswatch files.
- Target: `:root` light tokens only, `html { color-scheme: light; }` (`src/app/globals.css:44-46`), no `@media (prefers-color-scheme: dark)`, no `.dark` class, no `dark:` utilities (grep count 0). The design system claims “Dark ✓ Full” (`design-system/MASTER.md:13`) and tokens include only light values (`:3-21`), so the documentation and implementation disagree.

---

## 9. Target gap analysis

Severity: **S1** blocks core parity or data entry; **S2** major UX divergence; **S3** polish/localization.

| # | Area | Upstream evidence | Target evidence | Severity |
|---|---|---|---|---|
| G1 | Shared server-side table | `manage_tables.js:210-275`; all manage views | 27 bespoke tables; no shared component | S1 |
| G2 | Pagination/sort/search contract | `sidePagination:'server'`, `limit/offset/sort/order` | in-memory rows, `limit:100`, client search only | S1 |
| G3 | Filter UI/persistence | filters multiselect + URL replaceState + server restore | items has 6 checkboxes and URL params; others none; no history rewrite | S1 |
| G4 | Date range filter | `partial/daterangepicker` presets/time mode | reports use two native date inputs; no presets, no time mode | S2 |
| G5 | Deleted/restore flow | `is_deleted` filter + restore action | items `deleted` query only; no restore | S1 |
| G6 | Column visibility persistence | `onColumnSwitch` localStorage | none | S2 |
| G7 | Export | 7 formats per table | reports CSV only | S2 |
| G8 | Row selection/delete/highlight | checkbox + animated delete/restore | per-row buttons, `confirm()` | S2 |
| G9 | Table locale/empty states | `bootstrap_tables_locale.php` | hard-coded “No items found”; “No customers.” | S3 |
| G10 | Menu generation | grant + menu_group + sort + home/office switch | `sort=0`, no menu_group, hard-coded Office links | S1 |
| G11 | Module labels/icons | `Module.*` lang + SVG icons | plain seed names + Lucide map (fallback icon) | S2 |
| G12 | Topbar identity | company/user/change-password/logout/clock | hard-coded store, user, bell, logout | S2 |
| G13 | Footer/version | `footer.php:10-21` | none | S3 |
| G14 | Theme selection | Bootswatch 3/5 + per-theme CSS | fixed slate tokens | S2 |
| G15 | Login initialization/migration | `login.php:57-104`, `207-324` | absent | S1 |
| G16 | Login captcha/variants | `login.php:106-141` | absent | S2 |
| G17 | Login branding | company logo/name/theme | generic store icon | S3 |
| G18 | CSRF | session token + AJAX wrapper + form_open | NextAuth/server-action origin checks only | S2 |
| G19 | Toast/notification system | `$.notify` + DOMPurify + position config | none; bell inert | S1 |
| G20 | Inline alerts | per-view alert blocks | only form-error strings | S2 |
| G21 | Modal CRUD framework | `dialog_support` + `modal-dlg` | none; full pages | S2 |
| G22 | Validation UX | required legend, field errors, remote rules | single generic error | S1 |
| G23 | File upload preview | Jasny fileinput (logo/item/CSV) | none | S2 |
| G24 | Dynamic row clone/sort | config/tax pages | none | S2 |
| G25 | Autocomplete behavior | minChars 0, dblclick, keyboard, value/label | min 2 chars, no keyboard nav, raw rows | S1 |
| G26 | Suggestion config/multipack | config columns + `NAME_SEPARATOR` | absent | S2 |
| G27 | Address autocomplete | Nominatim plugin | absent | S3 |
| G28 | Register shortcuts | configurable ALT+1..9/ESC | fixed F1–F12 constant, never bound | S1 |
| G29 | Register modes/controls | select modes, dinner table, stock location, suspended modal, takings | pills, selects, no suspended modal/takings | S2 |
| G30 | Register cart editing | per-line forms, discount toggle, serial/temp items, stock text | inline server actions, no toggle/serial/temp | S2 |
| G31 | Payment logic | giftcard/reference-code/cash-mode branches | simple select + prompt giftcard | S2 |
| G32 | Suspend/cancel/complete | all three + finish-without-payment | suspend/complete only | S2 |
| G33 | Print | `printdoc`, jsPrintSetup, auto-return, print CSS | PDF routes only | S1 |
| G34 | Receipt config fidelity | receipt flags/templates/font size | flags stored, not rendered | S2 |
| G35 | Barcode sheet | standalone HTML with fonts/layout | PDF + approximate preview; width default mismatch | S2 |
| G36 | Email receipt from view | receipt/invoice send buttons | no send button | S2 |
| G37 | i18n wiring | 1,676 label lines, 47 locales | `next-intl` unmounted; en `{}`; hard-coded strings | S1 |
| G38 | RTL | 47 locales incl. RTL; RTL CSS copied | none | S2 |
| G39 | Dark mode | theme-based, not dark-mode | none despite docs | S3 |
| G40 | Accessibility | `role=status`, labels, Bootstrap basics | no `scope`, no dialog semantics, no live region | S2 |
| G41 | Mobile navigation | collapsed navbar | fixed sidebar, no drawer | S2 |
| G42 | No-access route | `no_access/<module>[/<sub>]` | only `[module]/[submodule]`; `[module]` 404 | S1 |
| G43 | Change password | current + min 8 + repeat + notEqual | new + confirm only | S1 |
| G44 | Error/loading shells | production/404/exception templates | none | S2 |
| G45 | Logout semantics | POST CSRF + redirect | NextAuth signout form | S3 |
| G46 | Constants correctness | upstream has no F1–F12; payment order configurable | `KEY_SHORTCUTS` F1–F12; `DEFAULT_PAYMENT_TYPES` invented | S2 |
| G47 | Formatting consistency | locale helpers (currency/quantity/date) | 51 ad-hoc `toFixed`/`toLocaleString` sites | S2 |
| G48 | Asset parity | full CSS/JS/font/icon set | public empty | S2 |

---

## 10. Implementation obligations (ordered)

Each obligation states target files, the behavior to reproduce, and a Playwright acceptance test. Tests follow existing conventions: `e2e/*.spec.ts`, `test`/`expect` from `./fixtures`, `data-testid` selectors, one worker (`playwright.config.ts:8-20`). Names below are proposed; implementers should keep existing testids where they already exist.

### O1 — Replace sidebar/menu generation with grant+menu-group semantics

**Files:** `src/lib/auth/rbac.ts`, `src/components/shared/sidebar.tsx`, `src/app/(secure)/layout.tsx`, `src/db/seed.ts` (sort values).

**Spec:**
- `getAllowedModules(personId, menuGroup)` must filter by `grants.menuGroup IN (menuGroup,'both')`, `modules.sort != 0`, order by `modules.sort ASC`, and dedupe by module id (upstream `Module.php:99-134`, `Secure_Controller.php:59-67`).
- Home context shows modules granted for `home|both`; Office context shows `office|both`.
- The `home` and `office` module rows are navigation switches, rendered as ordinary entries, not as a static “Office” heading.
- Labels resolve through `Module.<id>` language keys; icons come from a module→icon map with a deterministic fallback.
- Active state matches URI segment 1 exactly (no `startsWith` over-highlighting).
- Seed sorts must mirror upstream (customers 10, items 20, item_kits 30, suppliers 40, reports 50, receivings 60, sales 70, employees 80, giftcards 90, messages 100, attributes 107, config/cashups 110, home/office 1).
- Persist the current menu group in the session/cookie so navigating from an Office page keeps the Office menu.

**Test:** `e2e/navigation.spec.ts` — add:
- login as admin; visit `/home`; assert `nav-home`, `nav-sales`, `nav-items`, `nav-customers` visible and ordered by sort (compare `allTextContents()`).
- visit `/office`; assert the office menu contains `nav-reports`, `nav-config`, `nav-employees`, and does **not** contain `nav-sales`.
- remove a grant in the fixture DB, reload, assert the module link disappears.
- assert `nav-attributes` is not rendered in the home menu when its grant is `office`.

### O2 — Restore topbar identity, clock, footer, and user menu

**Files:** `src/app/(secure)/layout.tsx`, new `src/components/shared/topbar.tsx`, `src/components/shared/footer.tsx`, `src/lib/config`.

**Spec:**
- Left/center/right structure: live clock (client component, 1 s interval, format from `dateformat`/`timeformat`), company name from config, user name opening the change-password modal/page, logout.
- Clock must render server time first and then update client-side without hydration mismatch (use `suppressHydrationWarning` or mount-only update).
- Footer: `© 2010–<year> · opensourcepos.org · <version> · <6-char commit>`; hidden in print.
- No hard-coded “OSPOS Next.js”.

**Test:** `e2e/home.spec.ts` — assert `data-testid="company-name"` equals seeded `company`; `data-testid="live-clock"` is non-empty and changes after 1.1 s (use `expect.poll`); `data-testid="footer-version"` matches `/3\.4\.3/`; `data-testid="user-menu"` opens change-password.

### O3 — Fix permission shells: no-access, error, loading, change-password

**Files:** new `src/app/(secure)/no_access/[module]/page.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/(secure)/loading.tsx`, `src/app/(secure)/change-password/page.tsx` + action.

**Spec:**
- `requirePermission` redirects must always land on a rendered page for both module-only and module/submodule denials.
- No-access text includes the module and optional permission id, matching `Error.no_permission_module` shape.
- Change password: current password required, new ≥ 8, repeat must equal new, new must differ from current; show field-level errors.
- Global error/loading/not-found shells exist and are styled.

**Test:** new `e2e/permissions.spec.ts` — create a clerk without `items`, visit `/items`, assert URL `/no_access/items` and “Access Denied” visible (not 404); login as admin, visit `/change-password`, submit wrong current password → error; submit mismatched repeat → field error; submit valid → success; verify old password fails and new succeeds via logout/login.

### O4 — Wire i18n (next-intl) and locale resolution

**Files:** `src/lib/i18n/index.ts`, `next.config.ts`, new `src/middleware.ts` or extend `src/proxy.ts`, `src/app/layout.tsx`, `src/messages/en/*.json`.

**Spec:**
- Mount `NextIntlClientProvider`; resolve locale from session user `languageCode` → config `language_code` → `en`.
- Provide message namespaces at least for Common, Module, Login, Sales, Items, Bootstrap_tables, Datepicker, Calendar; populate English from upstream key names/values (structure, not necessarily all 1,676 keys in the first pass, but every string rendered by the shell/table/register/login must have a key).
- All new UI strings in this report must use translation keys, not literals.
- Date/number/currency formatting must use config locale (see O24).

**Test:** `e2e/i18n.spec.ts` — set config `language_code` to `bn`, seed `src/messages/bn/common.json` with a test key, reload; assert the localized label appears. Switch back to `en`; assert English. Assert `<html lang>` reflects the locale.

### O5 — Build a notification/toast system with sanitization and position config

**Files:** new `src/components/shared/toast-provider.tsx`, `src/components/providers.tsx`, `src/lib/notifications.ts`, `src/app/globals.css`.

**Spec:**
- A provider exposing `notify({message, type})` with success/danger/warning/info variants, auto-dismiss, stacked container, `role="status"`/`aria-live="polite"`.
- Position from `notify_horizontal_position`/`notify_vertical_position` (center/right/left, top/bottom).
- Messages are rendered as text, never HTML (upstream DOMPurify strips all tags; in React, avoid `dangerouslySetInnerHTML`).
- Every server action result surfaces a toast (success and failure) and every table delete/restore/save uses it.

**Test:** `e2e/notifications.spec.ts` — create an item; assert `[data-testid="toast"]` with success text; force a duplicate item number; assert danger toast; set config position to `bottom-left`; assert toast container class/position updates.

### O6 — Add a CSRF/fetch wrapper and 401 handling

**Files:** new `src/lib/http/client.ts`, `src/app/(secure)/layout.tsx` (or provider), all client fetch call sites.

**Spec:**
- A single `apiFetch` wrapper that (a) includes same-origin credentials, (b) handles 401 by redirecting to `/login?callbackUrl=...`, (c) surfaces non-2xx as typed errors/toasts.
- For any non-NextAuth state-changing route, require an origin check and a token (Next server actions already do origin checks; if raw route handlers are added, implement a double-submit token or reuse NextAuth’s CSRF cookie).
- Forms rendered outside server actions must include a hidden CSRF field if the endpoint is a route handler.
- Ensure `$.fn.submit`-style token refresh is unnecessary by keeping all mutations in server actions.

**Test:** `e2e/auth.spec.ts` — stub/expire the session, trigger a client fetch (suggestion search), assert redirect to `/login`; assert no mutation request succeeds without a valid session; assert server action from a foreign Origin is rejected (Playwright `request.post` with `Origin: http://evil.test` returns 403).

### O7 — Implement the shared table component and server-side contract

**Files:** new `src/components/shared/data-table.tsx`, `src/components/shared/table-toolbar.tsx`, `src/components/shared/table-pagination.tsx`, `src/lib/table/types.ts`, and page/repository wiring.

**Spec:**
- Props: `resource`, `columns` (field/title/sortable/switchable/escape/align/width), `rows`, `total`, `page`, `pageSize`, `sort`, `order`, `search`, `filters`, `rowKey`, `toolbar`, `emptyMessage`, `loading`, `onQueryChange`.
- Server contract: query params `search`, `limit`, `offset`, `sort`, `order`, `filters[]` repeated, plus page extras; response `{total, rows}`; `sanitizeSortColumn` equivalent validates sort against declared columns.
- Fixed UI: striped/bordered table, sticky header, column chooser, page-size selector (default `lines_per_page`), bottom pagination, loading row with `role="status"`, search input, refresh.
- Escape behavior: HTML only for columns explicitly marked `escape: false` (actions/images/links); all other values rendered as text.
- Preserve dynamic attribute columns and item image preview.
- Replace all 27 bespoke tables incrementally; start with items, customers, suppliers, employees, sales/manage, reports.

**Test:** `e2e/tables.spec.ts` — seed 60 customers; assert page 1 shows 25 rows and “Showing 1 to 25 of 60”; click next → rows 26–50; search a unique name → 1 row + total 1; sort by last name asc/desc → first row changes; click column chooser → hide Email column; reload → Email remains hidden (localStorage); set page size 50 → 50 rows.

### O8 — Date range, filter bar, deleted filter, and URL persistence

**Files:** `src/components/shared/date-range-picker.tsx`, `src/components/shared/filter-multiselect.tsx`, `src/lib/table/query.ts`, page shells.

**Spec:**
- Date range with the 15 upstream presets and a `date_or_time_format` mode (date-only vs datetime with seconds), locale labels, `start_date`/`end_date` in `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`, min 2010-01-01, max today/now.
- Multi-select filter with chips/count summary and “none selected” text; changes refetch and rewrite the URL with `history.replaceState` (or Next `router.replace` with `scroll:false`).
- Server restores `start_date`, `end_date`, `filters[]`, and additional params such as `stock_location`.
- Items filters include all seven upstream flags including `search_custom`.
- Deleted rows are reachable via the `is_deleted` filter; a restore action is offered for selected deleted rows where the module supports restore.

**Test:** `e2e/table-filters.spec.ts` — apply “Last 7 Days” on `/sales/manage`; assert URL contains `start_date`/`end_date`; reload; assert filter UI and results persist. Select “Cash” filter; assert only cash sales. On `/items`, check “Deleted”; assert deleted rows appear; select one and restore; assert it leaves the deleted view and appears in the default view.

### O9 — Table selection, delete/restore, column visibility, export, locale

**Files:** `src/components/shared/data-table.tsx`, `src/components/shared/table-actions.tsx`, `src/lib/table/columns-store.ts`, `src/lib/table/export.ts`, `src/messages/en/bootstrap_tables.json`.

**Spec:**
- Checkbox selection with select-all; toolbar actions disabled when selection is empty; confirmation text from `<Controller>.confirm_delete`/`confirm_restore`.
- Delete POSTs `{ids[]}`, animates/highlights affected rows, refreshes, and toasts the server message; restore is symmetric.
- Column visibility persisted per employee + resource (fix the upstream `"undefined"` bug by always supplying employee id).
- Export types at least CSV, JSON, XLSX, PDF; filename `<resource>_<UTC timestamp>`.
- Localized loading/rows-per-page/showing/no-matches/pagination/refresh/columns/all strings and controller-specific empty states.

**Test:** `e2e/table-selection.spec.ts` — select two customers; assert Delete enabled; cancel confirm → no change; confirm → rows removed + toast; assert `/customers/search` received `ids[]` with both ids. Export CSV; assert download filename pattern and header row. Hide a column, reload, assert hidden.

### O10 — Modal dialog + form validation framework

**Files:** new `src/components/ui/dialog.tsx`, `src/components/shared/form-shell.tsx`, `src/components/shared/field-error.tsx`, `src/lib/forms/validation.ts`; refactor existing forms.

**Spec:**
- Dialog with `role="dialog"`, `aria-modal`, labelled title, focus trap, Escape/backdrop close, and action buttons driven by a declarative config (`submit`, `delete`, `new`, `close` labels/styles).
- Dialog form submission must keep the dialog open on validation failure and close on success.
- Form shell renders “Fields in red are required”, a red required marker, a per-form error list, and field-level messages; server errors map to fields when the server returns structured errors, otherwise to the form-level list.
- Validation covers required, min/max length, equality/inequality, numeric, email, and remote uniqueness checks (items `item_number`, customers email/account number).
- Preserve the “Save” vs “Save & New” flow for item creation.

**Test:** `e2e/forms.spec.ts` — open New Item dialog from `/items`; submit empty → dialog stays open, required errors for name/category/cost/unit price; fill invalid price → numeric error; fix → saves, dialog closes, table highlights new row; click “Save & New” → dialog resets and stays open; duplicate barcode → remote error on that field.

### O11 — Autocomplete primitive with keyboard navigation and upstream trigger semantics

**Files:** new `src/components/ui/autocomplete.tsx`, `src/components/shared/suggestion-input.tsx`; use in register, receiving, item form, customer form, item-kit form, giftcard form.

**Spec:**
- `{value,label,sublabel?}` result contract.
- Opens on focus/ArrowDown/dblclick with `minChars:0`; debounce per call site (10–200 ms); request cancellation on new term; loading and empty states.
- Keyboard: ArrowUp/Down move active option, Enter selects, Escape closes, Tab selects/closes per config; `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`.
- `appendTo` equivalent: render in a portal when inside a dialog.
- Selection behavior is call-site configurable: fill hidden id + visible label, submit form, or mutate local state.
- Barcode fast path: Enter with an exact barcode/item number adds immediately without waiting for the dropdown.

**Test:** `e2e/autocomplete.spec.ts` — focus item input, assert all seeded suggestions appear before typing (minChars 0); type “ite”, ArrowDown twice, Enter → correct item added; Escape closes; dblclick on the field shows all; type an exact barcode + Enter → item added exactly once; assert `role=combobox` and active descendant updates.

### O12 — Suggestion endpoint shape, configurable labels, multi-pack, and parity endpoints

**Files:** `src/app/api/**/suggest/route.ts`, `src/lib/items/repository.ts`, `src/lib/taxes/repository.ts`, `src/lib/persons/repository.ts`, `src/app/api/items/suggest/route.ts`.

**Spec:**
- Return `{value,label,sublabel?}`, not raw rows; empty term returns suggestions (subject to limit) rather than `[]`.
- Implement item label building from `suggestions_first_column`, `suggestions_second_column`, `suggestions_third_column` (`name|item_number|description|cost_price|unit_price`), joined by `" | "`, with multipack name appended and prices locale-formatted.
- Add missing endpoints/aliases: item kits, low-sell, category, location, tax codes, tax categories, employees, persons, suppliers, customers, giftcards, attributes.
- Customer label format `"First Last [Company] [Phone]"`; supplier label company/agency/person; giftcard label-only behavior preserved.
- Ensure authorization matches module access.

**Test:** `e2e/suggestions.spec.ts` — set suggestion columns to `name|unit_price`; call `/api/items/suggest?term=...`; assert label contains `" | "` and localized price; enable multi-pack and assert `"name | pack"`; empty term returns non-empty list; unauthorized user gets 401/redirect behavior.

### O13 — Correct and implement configurable register shortcuts

**Files:** `src/lib/constants.ts`, `src/lib/sale/sale-lib.ts`, `src/lib/config/tabs.ts`, `src/components/sales/register.tsx`, new `src/components/sales/shortcuts-help.tsx`, `src/app/(secure)/config/actions.ts`.

**Spec:**
- Remove the fixed `F1..F12` model. Define the ten upstream actions (`cancel, items, customers, suspend, suspended, amount, payment, complete, finish, help`) with default code/label values exactly as `Sale_lib.php:26-37`.
- Store `key_<name>` in `app_config` as `"<code> | <label>"`; config tab has ten dropdowns, validates against allowed values, rejects duplicates, and saves.
- Register listens on `keyup`, ignores events while a dialog/modal is open, uses `altKey` for the nine ALT bindings and no modifier for Escape; actions exactly as §4.2.
- Help modal has two tabs (System Shortcuts from config; Helpful browser shortcuts F11/CTRL+/CTRL−/CTRL+0/CTRL+P/CTRL+F) and falls back to the raw code when label is empty.
- Remove `fullscreen`/`quantity_toggle` pseudo-actions unless the product explicitly requests new behavior.

**Test:** `e2e/register-shortcuts.spec.ts` — open `/sales/register`; press ALT+1 → item input focused; ALT+3 → suspend request fired (route intercept); ALT+9 → help dialog with two tabs and “ALT + 1” row; Escape → cancel confirm; open the dialog then press ALT+1 → no focus change; change `key_items` to ALT+5 in config, reload, press ALT+5 → item focus, ALT+1 → no effect; attempt duplicate bindings → error toast.

### O14 — Register shell parity: modes, dinner table, stock location, suspended sales, takings

**Files:** `src/components/sales/register.tsx`, `src/app/(secure)/sales/register/page.tsx`, new `src/components/sales/suspended-dialog.tsx`, `src/app/(secure)/sales/suspended/page.tsx`.

**Spec:**
- Mode control lists exactly the configured modes (`sale`, `sale_invoice`, `sale_quote`, `sale_work_order`, `return`) and submits on change.
- Dinner table select when enabled; stock location select when >1; both persist server-side.
- Suspended button opens a dialog listing doc id, date, table (if enabled), customer, employee, comment, and unsuspend action; unsuspend restores the cart.
- Takings button visible only with `reports_sales`.
- New Item and New Customer modal shortcuts from the register.

**Test:** `e2e/sales-register.spec.ts` — enable dinner tables and create two; assert table select appears with free tables; switch mode to Return → URL/server mode changes and receipt lookup works; suspend a sale → suspended dialog lists it → unsuspend restores lines; user without `reports_sales` sees no takings button.

### O15 — Register cart/payment UX parity

**Files:** `src/components/sales/register.tsx`, `src/components/sales/cart-table.tsx`, `src/components/sales/payment-panel.tsx`, `src/app/(secure)/sales/actions.ts`.

**Spec:**
- Cart rows: newest first; editable price/qty/discount per permission; currency/percent discount toggle; serial number for serialized items; temporary item number/name/description editing; stock location text; row refresh/submit; editable discounted total only for amount-entry items.
- Payment panel: paid/due/change; payment type select; giftcard mode relabels amount field to gift card number and disables normal amount; cash-mode display uses non-cash total and cash due; reference-code field appears only for configured payment types; duplicate amount inputs are not required in React but the visible field must switch semantics.
- Comment/invoice number/print-after-sale/email-receipt/price-work-orders auto-save with visible failure feedback.
- Customer removal, item deletion, payment deletion with confirmation where upstream confirms.

**Test:** `e2e/sales-register.spec.ts` — add item, edit price/qty, toggle discount to %, assert total; add cash payment, assert paid/due/change; select giftcard → amount label “Gift Card Number” and normal amount disabled; add reference-code payment type → reference field visible; remove customer and line → totals update; assert auto-save endpoint called for comment and invoice number.

### O16 — Form UX parity: dynamic rows, upload preview, date/datetime inputs, select styling

**Files:** new `src/components/ui/file-input.tsx`, `src/components/ui/date-input.tsx`, `src/components/shared/dynamic-rows.tsx`, item/customer/config/tax forms.

**Spec:**
- File input with preview, change, remove, and server-side removal action for company logo and item image.
- Date/datetime input honoring `dateformat`/`timeformat`, with locale month/day names; date-only vs datetime modes.
- Dynamic add/remove row groups for dinner tables, stock locations (with drag reorder), customer rewards, tax categories/codes/jurisdictions; disabled state when the feature toggle is off.
- Currency/percent toggle, tags input, and copy-to-clipboard for config fields that upstream supports.
- Unsaved-changes guard on long forms and dialogs (source has none; add it as a deliberate improvement or explicitly document the divergence).

**Test:** `e2e/forms.spec.ts` — upload a logo → preview visible, save, reload → preview persists; remove → logo cleared; add three stock locations, reorder by drag, save, reload → order persists; toggle dinner tables off → inputs disabled and add/remove hidden; set config date format `d/m/Y`, open a cashup form, assert the date input renders in that format.

### O17 — Print system

**Files:** new `src/components/shared/print-button.tsx`, `src/lib/print.ts`, `src/app/globals.css` (`@media print`), receipt/invoice/quote/work-order/tax-invoice pages, manage pages.

**Spec:**
- `print()` helper: `window.print()` by default; if a browser print extension/API is available, honor margins/header/footer/silent settings.
- `print_hide`/`print_show`/`no-print` classes; hide topbar/sidebar/footer/nav; receipt/table font 75%; return policy centered.
- `print_after_sale`: on receipt load, print once, then redirect to `/sales/register` after `print_delay_autoreturn` seconds.
- Print buttons on receipt, invoice, quote, work order, tax invoice, sales/cashups/expenses manage pages.
- Printer selection persistence per printer role if a compatible API is present; otherwise show N/A/disabled.

**Test:** `e2e/print.spec.ts` — stub `window.print` via `page.addInitScript`; open a receipt with `print_after_sale=1`, assert `print` called once and navigation to `/sales/register` after the configured delay; assert topbar/sidebar/footer have `print-hide`; click Print on manage page → stub called; assert print CSS hides nav via `page.emulateMedia({media:'print'})` + computed style.

### O18 — Receipt/invoice rendering fidelity and email actions

**Files:** `src/app/(secure)/sales/receipt/[id]/page.tsx`, `invoice/[id]/page.tsx`, `src/lib/pdf/*`, `src/app/(secure)/sales/email-action.tsx`, config tabs.

**Spec:**
- Render receipt from `receipt_template` (`receipt_default`/`receipt_short`) with all receipt flags: company name/logo/address/phone, sale receipt label/time, customer, sale id, invoice number, employee, items (description/qty/price/total), description, serial, discount rows, subtotal/customer discount, taxes (if enabled), total, tendered/change, return policy, barcode.
- Invoice/quote/work-order/tax-invoice render their own labels and number fields.
- Send Receipt/Send Invoice buttons appear when a customer email exists; call nodemailer action; toast result; auto-send when `email_receipt` requested.
- PDF routes use the same data/flags as HTML so printed and downloaded output agree.

**Test:** `e2e/sales-receipt.spec.ts` — complete a sale with customer email; open receipt; assert company name, customer, item, tax (when enabled), total, change; uncheck `receipt_show_taxes`, reload → tax row absent; click Send Receipt → intercepted action called + toast; `receipt_short` template omits description; PDF endpoint returns `application/pdf` and non-empty bytes.

### O19 — Barcode sheet parity (HTML/print + PDF)

**Files:** `src/app/(secure)/items/generate-barcodes/page.tsx`, `src/lib/barcode/index.tsx`, `src/app/api/items/barcodes-pdf/route.ts`, new `src/app/(secure)/items/barcodes/print/page.tsx` or print styles.

**Spec:**
- Standalone printable sheet sized by `barcode_page_width`, `barcode_page_cellspacing`, `barcode_num_in_row`, `barcode_height`, `barcode_width`, `barcode_font`, `barcode_font_size`.
- Rows: first/second/third from config (`name|category|cost_price|unit_price|company_name|item_code|id|item_number`), character-limited to 40, localized labels for category/price.
- `barcode_generate_if_empty` behavior: generate/write an item number when empty.
- Barcode content (`id|item_number|name`) and type mapping; unsupported types fall back or error visibly.
- Fix the `barcode_width` default divergence and apply the selected font.

**Test:** `e2e/items-barcodes.spec.ts` — set 3 per row, width 150, height 60, font Arial; open generate page with 7 items; assert 3 columns, per-cell margins, 7 SVGs; click Download PDF → `application/pdf`; print sheet via `emulateMedia('print')`; assert one page/table and no nav.

### O20 — Accessibility hardening

**Files:** `src/components/ui/dialog.tsx`, `src/components/ui/autocomplete.tsx`, `src/components/shared/data-table.tsx`, `src/app/(secure)/layout.tsx`.

**Spec:**
- Dialog: `role=dialog`, `aria-modal=true`, labelled title, focus trap, restore focus, Escape close.
- Autocomplete: combobox/listbox/option roles, active descendant, live announcement of result count.
- Tables: `<caption class="sr-only">`, `scope="col"` on headers, `aria-sort` on sortable headers, keyboard row actions.
- Shell: skip-to-content link, `<main id="main">`, nav landmark labelled, current page `aria-current`.
- Toasts: `role=status`/`aria-live`; errors `role=alert`.
- All icon-only buttons have accessible names.

**Test:** `e2e/a11y.spec.ts` — tab from the top of `/items`: first stop is “Skip to content”; open the register help dialog, assert focus is inside and Escape returns focus to the trigger; assert every table header has `scope="col"`; assert the autocomplete exposes `role=combobox` and `aria-activedescendant` while navigating; run a lightweight axe check if `@axe-core/playwright` is added (otherwise assert the specific attributes).

### O21 — Responsive navigation and mobile layouts

**Files:** `src/components/shared/sidebar.tsx`, `src/app/(secure)/layout.tsx`, `src/components/shared/data-table.tsx`.

**Spec:**
- Sidebar becomes a drawer under `lg` with a hamburger, overlay, Escape close, and focus trap; desktop keeps the fixed rail.
- Table toolbar wraps; filters become a sheet/popover under `sm`; pagination stacks.
- Register cart and totals stack under `lg`; payment panel remains reachable.
- No horizontal page scroll at 375 px (tables scroll inside their container only).

**Test:** `e2e/responsive.spec.ts` — viewport 375×812: assert hamburger visible, sidebar hidden; open drawer, click Items, drawer closes and route changes; assert `document.documentElement.scrollWidth <= 375`; open filters, assert sheet visible; viewport 1440: assert sidebar always visible and hamburger absent.

### O22 — Theme, dark mode, and RTL policy

**Files:** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(secure)/layout.tsx`, login layout.

**Spec (decide and document one of two policies):**
- **Parity policy:** implement a theme selector backed by `config.theme` with a small set of Bootswatch-equivalent palettes; no dark-mode toggle (upstream has no dark mode).
- **Modern policy:** keep the single design-system theme and add `prefers-color-scheme` dark tokens, clearly documenting the divergence from upstream.
- Whichever policy is chosen, define dark tokens under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and `:root[data-theme="dark"]`, and stop pinning `color-scheme: light` unconditionally.
- RTL: set `dir="rtl"` when the resolved locale is RTL (`ar`, `he`, `fa`, `ur`, `ckb`), use logical CSS properties or Tailwind `rtl:` variants, and mirror icons/chevrons; at minimum do not break layout.

**Test:** `e2e/theme.spec.ts` — if parity policy: switch theme in config, assert a `data-theme` attribute and changed primary CSS variable. If modern policy: `page.emulateMedia({colorScheme:'dark'})`, assert body background/foreground change and contrast remains readable. Set locale `ar-EG`, assert `<html dir="rtl">` and sidebar/labels mirror without overflow.

### O23 — Constants and data-contract cleanup

**Files:** `src/lib/constants.ts`, `src/lib/sale/sale-lib.ts`, `src/lib/config/tabs.ts`.

**Spec:**
- Delete the invented `KEY_SHORTCUTS` F1–F12 array; replace with the ten upstream shortcut definitions.
- `DEFAULT_PAYMENT_TYPES` must be derived from `payment_options_order` config and the upstream option vocabulary, not a fixed invented list.
- Remove `fullscreen`/`quantity_toggle` actions.
- Ensure `REGISTER_MODES`, `INVOICE_TYPES`, `LINE_SEQUENCES`, `VALID_RECEIPT_TEMPLATES` match upstream values (`sale`, `sale_invoice`, `sale_quote`, `sale_work_order`, `return`; invoice types; receipt templates).
- Add unit tests for constant parity.

**Test:** `vitest` unit test (not Playwright) asserting shortcut defaults/actions and payment option ordering from a sample config. Playwright assertion: the register help modal does not mention F1–F12; the payment dropdown order follows `payment_options_order`.

### O24 — Shared formatting utilities (currency/quantity/date/number)

**Files:** new `src/lib/format.ts`, replace ad-hoc `toFixed`/`toLocaleString` across `src/app` and `src/components`.

**Spec:**
- Currency: symbol, currency decimals, thousands separator, number locale; tax decimals; quantity decimals; cash decimals/rounding mode.
- Date/time: `dateformat`/`timeformat`, locale month names, timezone config.
- All tables, receipts, register totals, reports, and suggestions use these helpers.
- Server and client render identically (pass formatted strings from the server where possible to avoid hydration drift).

**Test:** `e2e/formatting.spec.ts` — set `currency_symbol=৳`, `currency_decimals=2`, `quantity_decimals=2`, `dateformat=d/m/Y`; assert item list price `৳1,234.50`, quantity `2.00`, receipt date `08/11/2026`; change decimals and reload; assert updated output. Assert register total equals table total formatting.

### O25 — Full shared-UX Playwright regression suite

**Files:** `e2e/ui-shell.spec.ts`, `e2e/tables.spec.ts`, `e2e/autocomplete.spec.ts`, `e2e/register-shortcuts.spec.ts`, `e2e/print.spec.ts`, `e2e/i18n.spec.ts`, `e2e/a11y.spec.ts`, `e2e/responsive.spec.ts`.

**Spec:**
- Run sequentially under the existing single-worker config; reset the SQLite fixture in `global-setup`.
- Cover every behavior in O1–O24 with at least one assertion; prefer role/testid selectors over CSS.
- Capture traces/screenshots only on failure (already configured).
- Add a smoke test that walks every sidebar link and asserts a 200/non-error shell (no 404s), catching route gaps like `no_access`.

**Acceptance:** `npm run test:e2e` passes from a clean `e2e-results/test.db`, and no test relies on hard-coded absolute URLs.

---

## 11. Unknowns and open questions

1. **`taxes/suggestTaxCategories` routing.** The item form requests `taxes/suggestTaxCategories` (`app/Views/items/form.php:477`) but the controller exposes `suggest_tax_categories()` (`app/Controllers/Taxes.php:115`), and no `getSuggestTaxCategories()` exists. Verify CI4 improved auto-routing behavior against commit `603b2c7` before reproducing the URL; the target currently has a `tax-categories-suggest` route (`src/app/api/taxes/tax-categories-suggest/route.ts`) with different naming.
2. **`print_silently` inversion.** `print_receipt.php:43-46` sets `printSilent` when `!config['print_silently']`, which contradicts its own comment. Determine intended semantics from field docs/tests before implementing.
3. **`datepicker_locale` registration key.** Day/month names are registered under `config['language']` (e.g. `english`) while the widget uses `current_language_code()` (e.g. `en`), and the config argument emits `1` (`datepicker_locale.php:25`, `:28`, `:95`). Whether localization actually applies in 3.4.3 is unverified.
4. **Column visibility key `"undefined"`.** Only the items page passes `employee_id` (`items/manage.php:64`); all other tables persist under the literal key `"undefined"`. This may be an intentional global default or a bug; the target must choose a policy.
5. **`table_support.query_params`.** It is not defined in `manage_tables.js`; `sales/manage.php:39` defines it ad hoc and `sales/form.php:245` consumes it. Confirm no other view depends on an implicit global.
6. **`bootstrap-table-mobile` extension.** Bundled (`gulpfile.js:251`) but no `mobileResponsive` flag is set in `manage_tables.js`; whether any view enables it was not exhaustively proven (grep found no `mobileResponsive` in `app/Views`).
7. **Print add-on availability.** `jsPrintSetup` is a Firefox add-on and is effectively unavailable in modern browsers; the fallback is `window.print()`. The target must decide whether to emulate printer selection through the browser print dialog, a local agent, or drop it.
8. **RTL intent.** Upstream copies `bootstrap.rtl.min.css` but never selects it; whether RTL is an intended feature or leftover build output is unclear. The target should not claim full RTL parity without a product decision.
9. **Theme list.** Bootswatch 3 theme names are discovered dynamically by scanning `public/resources/bootswatch` (`app/Controllers/Config.php:209-228`), and the repo does not commit `node_modules`. The exact set installed by `npm install` at the pinned versions was not enumerated; Bootswatch 5 excludes 12 themes for parity (`gulpfile.js:55-60`).
10. **Target design-intent conflicts.** `design-system/MASTER.md` claims full dark-mode support and Fira Sans/Fira Code, but `src/app/layout.tsx` loads Geist and `globals.css` pins light mode. Decide whether the design system or upstream is authoritative for visual parity.
11. **Target e2e baseline.** `e2e/helpers.ts:27-36` already tolerates the absence of toasts; after O5 this helper should assert real toasts, not fall back to body text. Any tests relying on the fallback may become flaky.
12. **CSRF equivalence.** Next.js server actions perform Origin checks, but there is no equivalent of upstream’s hidden-token refresh or `$.ajax` token injection. Whether the security review requires explicit tokens for any route handler is a product/security decision, not a UI one.
13. **Locale file completeness.** Upstream has 47 language directories and 24 English files; the target has 47 message directories, most empty. The mapping from CI4 `Language/en/*.php` keys to next-intl namespaces has not been specified.
14. **Notification position config values.** Upstream defaults are `center`/`bottom` (`initial_schema.sql:73-74`) but older upgrades used `right`/`top`; the target seed uses `right`/`top` (`src/db/seed.ts:100-101`). Confirm the intended default.
15. **Target `barcode_width` semantics.** Upstream treats width as pixels for the SVG style (250 in seed), while `src/lib/barcode/index.tsx:41` defaults to `2` and divides by 100 when rendering (`src/app/(secure)/items/generate-barcodes/page.tsx:23-27`). The unit contract is undefined and must be fixed before barcode parity tests are meaningful.
16. **Receipt template coverage.** `VALID_RECEIPT_TEMPLATES` in target includes `receipt`, `receipt_default`, `receipt_short`, `invoice`, `tax_invoice`, `quote`, `work_order` (`src/lib/constants.ts:74-77`), while upstream config only offers `receipt_default`/`receipt_short` (`app/Views/configs/receipt_config.php:16-25`) and has separate views for the other documents. Clarify whether the target intends a unified template selector.

---

### Appendix A — Upstream shared partials: purpose and consumers

| Partial | Purpose | Included by (grep) |
|---|---|---|
| `header.php` | doctype, head, theme, topbar, navbar, opening containers | every authenticated view |
| `footer.php` | closes containers, version/commit footer | every authenticated view |
| `header_js.php` | clock, notify wrapper/defaults, CSRF, AJAX/submit wrappers, logout | `header.php:43` |
| `lang_lines.php` | `window.lang.line()` for submit/close | `header.php:44` |
| `bootstrap_tables_locale.php` | bootstrap-table locale + confirm action text | attributes, cashups, expense categories/expenses, giftcards, item kits, items, people, reports tabular/details, sales, tax rates |
| `daterangepicker.php` | preset ranges and start/end globals | cashups, expenses, items, sales, report date/specific inputs |
| `table_filter_persistence.php` | URL rewriting for filters/dates | items, sales, cashups, expenses |
| `datepicker_locale.php` | `.datetime` picker config + locale | attributes item, cashups form, expenses form, receivings form, sales form |
| `print_receipt.php` | `printdoc()`, printer selection, auto-print/return | cashups/expenses/sales manage, receivings receipt, sales receipt/invoice/quote/tax_invoice/work_order |
| `visibility_js.php` | report column/summary visibility persistence + dialog init | reports tabular/tabular_details |
| `dinner_tables.php` | editable dinner-table rows | config table tab |
| `stock_locations.php` | editable/sortable stock-location rows | config stock tab |
| `tax_categories.php` | editable tax-category rows | taxes tax categories page |
| `tax_codes.php` | editable tax-code rows | taxes tax codes page |
| `tax_jurisdictions.php` | editable tax-jurisdiction rows | taxes tax jurisdictions page |
| `customer_rewards.php` | editable reward rows | config reward tab |

### Appendix B — Upstream notification call sites (37 total)

`app/Views/configs/email_config.php`, `general_config.php`, `integrations_config.php`, `invoice_config.php`, `receipt_config.php`, `reward_config.php`, `shortcuts_config.php`, `stock_config.php`, `system_info.php`, `table_config.php`, `tax_config.php`; `app/Views/home/form_change_password.php`; `app/Views/messages/sms.php`; `app/Views/partial/header_js.php` (definition); `app/Views/sales/form.php`, `invoice.php`, `quote.php`, `receipt.php`, `register.php`, `tax_invoice.php`, `work_order.php`; `app/Views/taxes/tax_categories.php`, `tax_codes.php`, `tax_jurisdictions.php`; `public/js/manage_tables.js`.

### Appendix C — Target file map relevant to this report

| Concern | Target files |
|---|---|
| Root shell | `src/app/layout.tsx`, `src/app/globals.css`, `src/components/providers.tsx` |
| Secure shell | `src/app/(secure)/layout.tsx`, `src/components/shared/sidebar.tsx` |
| Login | `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx` |
| Route guards | `src/proxy.ts`, `src/lib/auth/options.ts`, `src/lib/auth/rbac.ts`, `src/lib/auth/with-permission.ts` |
| Tables | `src/components/*/*-table.tsx`, `src/components/items/items-table.tsx`, `src/components/reports/report-view.tsx` |
| Register/receiving | `src/components/sales/register.tsx`, `src/components/receivings/register.tsx`, `src/components/sales/suspended-table.tsx` |
| Config | `src/components/config/config-tabs.tsx`, `src/lib/config/tabs.ts`, `src/app/(secure)/config/actions.ts` |
| Suggestions | `src/app/api/**/suggest/route.ts`, `src/lib/items/repository.ts`, `src/lib/persons/repository.ts`, `src/lib/taxes/repository.ts` |
| Print/PDF | `src/lib/pdf/*`, `src/lib/barcode/index.tsx`, `src/app/(secure)/sales/*/[id]/pdf/route.tsx`, `src/app/api/items/barcodes-pdf/route.ts` |
| i18n | `src/lib/i18n/index.ts`, `src/messages/**/common.json` |
| Tests | `e2e/*.spec.ts`, `e2e/helpers.ts`, `playwright.config.ts` |

### Appendix D — Source citation index (most load-bearing lines)

- Shell: `app/Views/partial/header.php:14-24`, `43-44`, `55-71`, `73-99`; `partial/footer.php:10-21`; `partial/header_js.php:8-94`; `partial/lang_lines.php:4-15`; `partial/visibility_js.php:28-98`; `partial/table_filter_persistence.php:24-82`; `partial/bootstrap_tables_locale.php:10-52`; `partial/daterangepicker.php:7-227`; `partial/datepicker_locale.php:6-95`; `partial/print_receipt.php:10-69`.
- Menu/auth: `Secure_Controller.php:53-72`; `Module.php:99-159`; `Home.php:12-19`; `Office.php:14-18`; `login.php:19-324`; `no_access.php:6-8`.
- Table: `tabular_helper.php:18-59`, `62-91`, `146-185`, `410-453`, `463-532`, `946-959`; `public/js/manage_tables.js:1-383`.
- Register: `sales/register.php:64-626`, `632-967`; `sales/help.php:24-85`; `sales/suspended.php:15-80`; `Sale_lib.php:26-37`, `133-161`; `Config.php:1122-1146`; `configs/shortcuts_config.php:12-82`.
- Forms: `items/form.php:31-170`, `357-372`, `452-660`; `customers/form.php:461-512`; `home/form_change_password.php:6-128`; `configs/table_config.php:57-150`; `configs/stock_config.php:58-147`; `taxes/tax_categories.php:45-100`.
- Assets: `gulpfile.js:30-60`, `101-242`, `244-403`; `package.json` dependencies; `public/css/*`; `public/js/*`.
- Target: `src/app/layout.tsx:2-33`; `src/app/globals.css:3-88`; `src/app/(secure)/layout.tsx:7-49`; `src/components/shared/sidebar.tsx:26-128`; `src/lib/auth/rbac.ts:73-94`; `src/components/sales/register.tsx:34-464`; `src/components/items/items-table.tsx:28-170`; `src/components/customers/customers-table.tsx:23-55`; `src/components/config/config-tabs.tsx:1-70`; `src/lib/constants.ts:79-97`; `src/lib/barcode/index.tsx:36-128`; `src/components/reports/report-view.tsx:52-105`; `src/app/(secure)/no_access/[module]/[submodule]/page.tsx:5-14`; `src/app/(secure)/change-password/page.tsx:11-21`.

---

*End of report.*




