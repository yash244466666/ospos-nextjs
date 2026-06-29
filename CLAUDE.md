# OSPOS Next.js — Project Guide for Agents

This is a faithful rewrite of **Open Source Point of Sale (OSPOS)** — originally a CodeIgniter 4 PHP app at `/home/yash/ospos` — in **Next.js + Drizzle ORM** with a swappable SQLite/MySQL database layer. The reference PHP source is the source of truth; this project mirrors its behavior 1:1. **No functionality may be omitted.**

> **CRITICAL — Read `AGENTS.md` first.** This project uses **Next.js 16.2.9 + React 19.2.4 + Tailwind v4**, all of which have breaking changes vs. typical training data. Before writing Next.js code, consult the bundled docs in `node_modules/next/dist/docs/`. Key changes from older Next:
> - **Middleware is now `proxy.ts`** (not `middleware.ts`). Same API, renamed. See `01-app/01-getting-started/16-proxy.md`.
> - **Tailwind v4** uses CSS-first config (`@import "tailwindcss"` in `globals.css`), no `tailwind.config.js` by default.
> - **React 19** — `use()` for promises, server components stabilized, `async` params in server components.
> - When in doubt, grep `node_modules/next/dist/docs/01-app/` for the relevant topic.

## Quick orientation

- **Upstream PHP repo**: `/home/yash/ospos` (OSPOS 3.4.2 on CodeIgniter 4.7.2)
- **This project**: Next.js 16 App Router, TypeScript strict, Drizzle ORM
- **DB swap**: `DB_DRIVER=sqlite` (default, `better-sqlite3`) or `DB_DRIVER=mysql` (`mysql2`)
- **Auth**: NextAuth.js Credentials + custom RBAC port
- **UI**: Tailwind v4 + shadcn/ui + TanStack Table
- **PDF**: `@react-pdf/renderer` (replaces dompdf)
- **Barcode**: `bwip-js` (replaces picqer/php-barcode-generator)
- **Email**: `nodemailer`
- **i18n**: `next-intl` with locale JSON mirroring `app/Language/<locale>/*.php`
- **Approved plan**: `/home/yash/.claude/plans/spicy-orbiting-glade.md`

## Build / dev / test commands

```bash
# Development (sqlite by default)
npm run dev                       # Next.js dev server on :3000
DB_DRIVER=mysql npm run dev       # switch DB at boot

# Database (after deps are installed)
npm run db:generate:sqlite        # generate sqlite migrations from schema
npm run db:generate:mysql         # generate mysql migrations
npm run db:migrate                # apply migrations for current dialect
npm run db:seed                   # seed initial data (admin/pointofsale, modules, permissions, app_config defaults)
npm run db:studio                 # drizzle-kit studio

# Tests (after deps are installed)
npm run test                      # vitest unit/lib
npm run test:e2e                  # playwright

# Production
npm run build && npm start
```

## Tech stack decisions and rationale

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, RSC, Server Actions) | Modern React; server actions replace CI controllers |
| ORM | Drizzle ORM | TS-native schema, first-class SQLite + MySQL drivers, raw SQL escape hatch for complex reports |
| DB swap | env `DB_DRIVER` selects dialect at boot | Single schema file, dual migration dirs (`drizzle/sqlite/`, `drizzle/mysql/`) |
| UI | Tailwind v4 + shadcn/ui + TanStack Table | Modern, accessible; TanStack Table replaces bootstrap-table |
| Auth | NextAuth.js Credentials | Custom `authorize` callback for bcrypt + legacy MD5→bcrypt upgrade |
| Cart state | Server-side `cart_sessions` table (JSON `data` column) | Mirrors OSPOS's session-backed `Sale_lib`; survives reloads; not client state |
| PDF | `@react-pdf/renderer` | Server components render receipts/invoices/quotes; replaces dompdf |
| Barcode | `bwip-js` | Full superset of picqer types (Codabar, POSTNET, Pharma, etc.) |
| i18n | `next-intl` | JSON locale files mirror `app/Language/<locale>/*.php` |

## Project structure

```
src/
├── app/
│   ├── (auth)/login/                    # Login page (CSRF-exempt, like PHP /login)
│   ├── (secure)/                        # All authed routes — wrapped by withPermission
│   │   ├── layout.tsx                   # sidebar (allowed_modules), topbar
│   │   ├── home/                        # Dashboard
│   │   ├── items/                       # Items module (reference module #1)
│   │   ├── sales/
│   │   │   ├── register/                # POS register (reference module #2)
│   │   │   ├── manage/                  # Sales history
│   │   │   ├── receipt/[id]/            # Re-render receipt for saved sale
│   │   │   ├── invoice/[id]/           # Re-render invoice
│   │   │   └── suspended/               # Suspended sales list
│   │   └── ... (customers, suppliers, employees, receivings, expenses, giftcards, item_kits, cashups, attributes, messages, taxes, config, reports) — future phases
│   ├── api/
│   │   ├── barcode/svg/                 # bwip-js SVG endpoint
│   │   ├── migrate/                     # CSRF-exempt, like PHP /migrate
│   │   └── auth/[...nextauth]/         # NextAuth route
│   ├── proxy.ts                         # Next 16 middleware (formerly middleware.ts)
│   └── layout.tsx
├── lib/
│   ├── db/
│   │   ├── index.ts                     # exports `db` based on DB_DRIVER
│   │   ├── sqlite.ts                    # drizzle(better-sqlite3)
│   │   └── mysql.ts                     # drizzle(mysql2/pool)
│   ├── auth/
│   │   ├── options.ts                   # NextAuth config
│   │   ├── password.ts                  # verify + MD5→bcrypt upgrade (hash_version)
│   │   └── rbac.ts                      # has_module_grant, has_grant, isAdmin, withPermission
│   ├── sale/                            # Sale_lib port (server-side cart)
│   ├── tax/                             # Tax_lib port + Rounding_mode enum
│   ├── token/                           # Token_lib port + 9 token classes
│   ├── barcode/                         # Barcode_lib port (bwip-js)
│   ├── config/                          # Appconfig cache (in-memory Map + write-invalidation)
│   ├── i18n/                            # next-intl config
│   ├── pdf/                             # @react-pdf receipt/invoice/quote renderers
│   └── encryption/                      # AES-256-GCM for smtp_pass / API keys
├── components/
│   ├── ui/                              # shadcn primitives
│   ├── items/                           # Items table, form, attributes editor
│   ├── sales/                           # Register, cart line, payments, totals
│   └── shared/                          # sidebar, topbar, no_access
└── messages/<locale>/*.json             # next-intl, mirrors app/Language/<locale>/*.php

drizzle/
├── schema/                              # Shared TS schema (single source of truth)
│   ├── auth.ts                          # people, employees, modules, permissions, grants, sessions
│   ├── items.ts                         # items, items_taxes, item_quantities, item_kits, item_kit_items, inventory, stock_locations
│   ├── attributes.ts                    # attribute_definitions, attribute_values, attribute_links
│   ├── sales.ts                         # sales, sales_items, sales_items_taxes, sales_payments, sales_taxes
│   ├── customers.ts                     # customers, suppliers, dinner_tables, rewards, customer_rewards
│   ├── receivings.ts
│   ├── taxes.ts                         # tax_categories, tax_codes, tax_jurisdictions, tax_code_links
│   ├── expenses.ts, cashups.ts, giftcards.ts
│   ├── config.ts                        # app_config
│   └── index.ts
├── sqlite/                              # SQLite migrations
└── mysql/                               # MySQL migrations

docker/
├── Dockerfile
├── docker-compose.sqlite.yml
└── docker-compose.mysql.yml
```

## Source-of-truth PHP files (consult when porting)

### Cross-cutting
- `/home/yash/ospos/app/Config/Constants.php` — `COMPLETED/SUSPENDED/CANCELED`, `SALE_TYPE_*`, `ADMIN_MODULES`
- `/home/yash/ospos/app/Config/OSPOS.php` — app_config cache pattern
- `/home/yash/ospos/app/Helpers/security_helper.php` — encryption key bootstrap
- `/home/yash/ospos/app/Helpers/locale_helper.php` — `get_payment_options`, `parse_decimals`, `totals_decimals`, `tax_decimals`, `cash_decimals`
- `/home/yash/ospos/app/Helpers/dompdf_helper.php` — PDF generation pattern (port to @react-pdf)
- `/home/yash/ospos/app/Helpers/importfile_helper.php` — CSV template generation
- `/home/yash/ospos/app/Libraries/Token_lib.php` + `app/Models/Tokens/Token*.php` — 9 token classes + render/parse
- `/home/yash/ospos/app/Libraries/Barcode_lib.php` — supported_barcodes, generate_barcode, display_barcode
- `/home/yash/ospos/app/Libraries/Tax_lib.php` + `app/Models/Enums/Rounding_mode.php` — tax computation
- `/home/yash/ospos/app/Models/Appconfig.php` — config key/value + sequence acquirers
- `/home/yash/ospos/app/Database/Migrations/sqlscripts/initial_schema.sql` — base schema + seed data
- `/home/yash/ospos/app/Language/` — 47 locale directories (no `bn` — Bengali to be added later)

### Auth/RBAC
- `/home/yash/ospos/app/Controllers/Login.php`
- `/home/yash/ospos/app/Controllers/Secure_Controller.php` (lines 42-54) — auth + permission enforcement pattern
- `/home/yash/ospos/app/Models/Employee.php` — login, has_module_grant, has_grant, isAdmin, canModifyEmployee
- `/home/yash/ospos/app/Models/Module.php` — get_allowed_home_modules, get_allowed_office_modules
- `/home/yash/ospos/app/Config/Filters.php` — CSRF exemptions (login|migrate only)

### Items module
- `/home/yash/ospos/app/Controllers/Items.php` (1787 lines)
- `/home/yash/ospos/app/Models/Item.php` — search, get_info, get_multiple_info, save_value (note `low_sell_item_id = item_id` self-set on insert L450-454), change_cost_price (weighted average)
- `/home/yash/ospos/app/Models/Attribute.php` — get_attributes_by_item, saveAttributeValue, saveCSVRowAttributeData, deleteOrphanedValues
- `/home/yash/ospos/app/Models/Inventory.php` — append-only delta pattern, reset_quantity
- `/home/yash/ospos/app/Models/Item_taxes.php`
- `/home/yash/ospos/app/Models/Item_quantity.php` — composite PK (item_id, location_id)
- `/home/yash/ospos/app/Models/Stock_location.php` — permission-scoped (joins grants)
- `/home/yash/ospos/app/Models/Item_kit.php` + `Item_kit_items.php`

### Sales register
- `/home/yash/ospos/app/Controllers/Sales.php` (1787 lines)
- `/home/yash/ospos/app/Libraries/Sale_lib.php` (1725 lines) — cart session state model
- `/home/yash/ospos/app/Models/Sale.php` (1535 lines) — save_value (central write transaction)
- `/home/yash/ospos/app/Views/sales/register.php`, `receipt.php`, `receipt_default.php`, `receipt_short.php`, `invoice.php`, `tax_invoice.php`, `quote.php`, `work_order.php`, and `_email` variants

## Critical gotchas — non-obvious behaviors that MUST be reproduced

1. **Path traversal on pic_thumb** — `/items/pic-thumb/[file]` route must sanitize via `path.basename()` only. Original: `Items.php:159`.
2. **RBAC prefix matching** — `has_module_grant(permission_id, person_id)` uses `LIKE permission_id 'id %'` (note trailing space). `reports_sales` is a subperm of `reports`. When exactly one row matches, also check `has_subpermissions` to verify it's a leaf (no `permission_id LIKE 'id_%'` rows exist). Original: `Employee.php:423-440`.
3. **Token sequences must be atomic** — PHP's `acquire_next_invoice_sequence` is read-modify-write on the cached settings array (NOT atomic). The port MUST use `UPDATE app_config SET value = value + 1 WHERE key = ? RETURNING CAST(value AS INTEGER)` inside a transaction. Both SQLite 3.35+ and MySQL 8+ support `RETURNING`.
4. **Attributes EAV** — three physical value columns on `attribute_values` (`attribute_value`, `attribute_date`, `attribute_decimal`) selected by `definition_type`. NULL `item_id` on `attribute_links` is meaningful (marks a DROPDOWN option not yet picked by any item). MySQL uses a STORED generated column `generated_unique_column = CONCAT(definition_id,'-',item_id)` for the unique constraint; SQLite uses a partial unique index `WHERE item_id IS NOT NULL AND sale_id IS NULL AND receiving_id IS NULL`. CHECKBOX reuses shared 0/1 `attribute_values` rows (don't create new ones per item).
5. **Compound/cascaded taxes** — when `cascade_sequence` changes between tax definitions for the same line, prior accumulated tax is added to `tax_basis` (compound tax). Reproduce exactly. Original: `Tax_lib.php:300` `apply_destination_tax`.
6. **Inventory is append-only deltas** — NEVER UPDATE an `inventory` row. Always INSERT a signed delta (`trans_inventory` column = signed change). `Inventory::reset_quantity` on delete emits offsetting negative rows rather than deleting history. Original: `Inventory.php:67`.
7. **Cash rounding / cash_adjustment** — when `cash_decimals < totals_decimals`, cash payments get a sibling `cash_adjustment` payment row to balance. `delete_payment` must also strip the sibling. `get_payments_total` excludes `cash_adjustment` rows.
8. **`item_number` vs `item_id` ambiguity** — every lookup must guard against numeric strings starting with `0` (`"00012345"` is a barcode, not an id). Replicate `ctype_digit(...) && !str_starts_with($id, '0')`. Original: `Item.php:98, 365`.
9. **Low-sell self-reference** — `items.low_sell_item_id` defaults to the item's own id on insert (`Item.php:450-454`). `low_sell_quantity = quantity × qty_per_pack`.
10. **Two tax systems coexist** — gated by `config.use_destination_based_tax`. Classic = `items_taxes(name, percent)` (max 2 rows per item). Destination-based = `items.tax_category_id → tax_categories`. The Items form must SKIP `items_taxes` writes when destination-based is on.
11. **Suspended sales** — NO separate `sales_suspended` table. `sales.sale_status = SUSPENDED` is the discriminator. Quotes and work orders are suspended sales with `sale_type = SALE_TYPE_QUOTE` / `SALE_TYPE_WORK_ORDER`. See `Sale.php:1180` `get_all_suspended`.
12. **Return mode** — `return_entire_sale` loads prior sale with negative quantities, produces a new sale with `sale_type = SALE_TYPE_RETURN` and negative totals. Edit-time refund: non-cash refunds become negative payments of that type; cash refunds stay as `cash_refund` column on the cash row.
13. **CSRF** — exempt ONLY `/login` and `/api/migrate`. All other POSTs require CSRF token. Use NextAuth's built-in CSRF or a server-action-compatible cookie.
14. **`allowedHostnames` enforcement** — refuse to boot if `ALLOWED_HOSTNAMES` env is unset in production. Replicates GHSA-jchf-7hr6-h4f3 mitigation from OSPOS.
15. **Sessions** — OSPOS uses DB-backed sessions (`ospos_sessions`). NextAuth JWT by default; DB-backed session adapter against `sessions` table for multi-instance deploy.
16. **Cart state mutations empty payments** — `edit_item`, `delete_item`, `change_mode` all empty `sales_payments`. Replicate this behavior in the cart store.
17. **Cart line keyed by `line`** — 1-based integer, max+1 per add. Merging same-item lines adds quantity unless `is_serialized`.
18. **Payment type strings are localizable** — payment types come from language files (`Sales.cash`, `Sales.debit`, etc.), not enums. The `payment_id` for giftcards is `giftcard:NUM`.
19. **Customer default discount propagation** — `selectCustomer` applies the customer's default discount to cart lines that have discount=0.
20. **Dinner tables** — `sales_dinner_table` is occupied on SUSPENDED, released on COMPLETED/CANCELED.

## OSPOS constants (port verbatim)

From `app/Config/Constants.php:136-144`:

```typescript
export const SALE_STATUS = { COMPLETED: 0, SUSPENDED: 1, CANCELED: 2 } as const;
export const SALE_TYPE = {
  POS: 0, INVOICE: 1, WORK_ORDER: 2, QUOTE: 3, RETURN: 4,
} as const;
export const ITEM_TYPE = { ITEM: 0, ITEM_KIT: 1, ITEM_AMOUNT_ENTRY: 2, ITEM_TEMP: 3 } as const;
export const STOCK_TYPE = { HAS_STOCK: 0, HAS_NO_STOCK: 1 } as const;
export const PRINT_OPTION = {
  PRINT_ALL: 0, PRINT_PRICED: 1, PRINT_KIT: 2, DO_NOT_PRINT: 3,
} as const;
export const DISCOUNT_TYPE = { PERCENT: 0, FIXED: 1 } as const;
export const PRICE_OPTION = {
  PRICE_OPTION_ALL: 0, PRICE_OPTION_KIT_STOCK: 1, PRICE_OPTION_KIT_AND_STOCK: 2, PRICE_OPTION_KIT: 3,
} as const;
export const ADMIN_MODULES = [
  'customers', 'employees', 'giftcards', 'items', 'item_kits',
  'messages', 'receivings', 'reports', 'sales', 'config', 'suppliers',
] as const;
export const TAX_TYPE = { INCLUDED: 0, EXCLUDED: 1 } as const;
export const ROUNDING_MODE = {
  HALF_UP: 1, HALF_DOWN: 2, HALF_EVEN: 3, HALF_ODD: 4,
  ROUND_UP: 5, ROUND_DOWN: 6, HALF_FIVE: 7,
} as const;
```

## App config — key categories (port all)

The `app_config` table is a key/value store seeded by `initial_schema.sql` and grown by 41 migrations. Categories:

- **Company**: `company`, `address`, `phone`, `fax`, `email`, `website`, `company_logo`, `return_policy`
- **Tax**: `default_tax_rate`, `default_tax_1_name`/`_rate`/`_cumulative`, `default_tax_2_name`/`_rate`, `tax_included`, `use_destination_based_tax`, `default_tax_code`, `default_tax_category`, `include_hsn`
- **Currency/locale**: `currency_symbol`, `number_locale`, `thousands_separator`, `currency_decimals`, `tax_decimals`, `quantity_decimals`, `dateformat`, `timeformat`, `language`, `language_code`, `timezone`, `country_codes`
- **Barcode**: `barcode_content`, `barcode_type`, `barcode_font`, `barcode_font_size`, `barcode_height`, `barcode_width`, `barcode_first_row`/`_second_row`/`_third_row`, `barcode_num_in_row`, `barcode_page_width`, `barcode_page_cellspacing`, `barcode_generate_if_empty`, `barcode_formats` (JSON)
- **Receipt**: `receipt_template`, `receipt_show_taxes`, `receipt_show_total_discount`, `receipt_show_description`, `receipt_show_serialnumber`, `print_silently`, `print_header`, `print_footer`, `print_top_margin`/`_left_margin`/`_bottom_margin`/`_right_margin`
- **Invoice**: `invoice_enable`, `sales_invoice_format`, `recv_invoice_format`, `invoice_email_message`, `invoice_default_comments`, `invoice_type` (`invoice`/`tax_invoice`/`custom_invoice`/`custom_tax_invoice`)
- **Sequence**: `last_used_invoice_number`, `last_used_quote_number`, `last_used_work_order_number`, `receipt_invoice_count`, `receipt_quote_count`
- **Sales**: `default_sales_discount`, `lines_per_page`, `payment_options_order`, `dinner_table_enable`, `multi_pack_enabled`, `cash_decimals`, `cash_rounding_code`
- **Email**: `protocol`, `mailpath`, `smtp_host`, `smtp_port`, `smtp_timeout`, `smtp_crypto`, `smtp_user`, `smtp_pass` (encrypted), `msg_msg`/`msg_uid`/`msg_src`/`msg_pwd` (SMS)
- **Integrations**: `mailchimp_api_key`/`mailchimp_list_id`, `clcdesq_api_key`/`clcdesq_api_url`, `gcaptcha_enable`/`_secret_key`/`_site_key`, `statistics`

## Token library — 9 document tokens + 3 barcode tokens

Document tokens (resolved in invoice/quote/work_order templates via `Token_lib::render`):

| Token ID | Class | Value source |
|---|---|---|
| `CU` | Token_customer | customer info (empty default) |
| `CO` | Token_invoice_count | `Sale::get_invoice_count()` — all-time count |
| `ISEQ` | Token_invoice_sequence | atomic increment of `last_used_invoice_number` |
| `QSEQ` | Token_quote_sequence | atomic increment of `last_used_quote_number` |
| `WSEQ` | Token_work_order_sequence | atomic increment of `last_used_work_order_number` |
| `YCO` | Token_year_invoice_count | `Sale::get_invoice_number_for_year` |
| `YQO` | Token_year_quote_count | quote count for current year |
| `SCO` | Token_suspended_invoice_count | suspended sale count |

Format example: `sales_invoice_format = "INV-{YCO:5}"` renders to `INV-00017` for the 17th invoice this year. Render regex: `/\{([A-Z]{2,4})(?::(\d+))?\}/g` — zero-pad to length with leading zeros.

## Next.js 16 specifics for this project

- **Proxy, not Middleware** — the auth/CSRF/route-rewrite layer is `src/proxy.ts` (single file at `src` level). Use for: optimistic auth redirects, header rewrites, CSRF token attachment. NOT for slow data fetching or full session management (per docs).
- **Tailwind v4** — config via `@theme` in `src/app/globals.css`. No `tailwind.config.ts`. Use `@import "tailwindcss"` and `@plugin` for shadcn.
- **Server Actions** are the primary mutation API (replace CI4 POST controllers). Each server action file starts with `"use server"`.
- **Route Handlers** (`src/app/api/.../route.ts`) replace CI4 AJAX endpoints (suggest, search, getItemSearch).
- **`async` params in server components** — Next 16 supports `async { params }: { params: Promise<{ id: string }> }` for dynamic routes. Await before use.
- When porting `postFoo` PHP methods → server actions named `fooAction`. When porting `getFoo` AJAX endpoints → route handlers `GET /api/<module>/foo`.

## Phasing status

- [x] **Phase 0**: Plan approved (`/home/yash/.claude/plans/spicy-orbiting-glade.md`)
- [x] **Phase 1.1**: Next.js 16 scaffold complete
- [ ] **Phase 1.2**: Drizzle dual-dialect layer (sqlite + mysql swap)
- [ ] **Phase 1.3**: Full 27-table schema port
- [ ] **Phase 1.4**: Auth + RBAC port (NextAuth + MD5→bcrypt upgrade + has_module_grant)
- [ ] **Phase 1.5**: Cross-cutting libs (config cache, i18n, barcode, token, tax, pdf, encryption)
- [ ] **Phase 1.6**: Layout shell + sidebar + login page
- [ ] **Phase 2**: Items module (reference module #1)
- [ ] **Phase 3**: Sales register (reference module #2)
- [ ] **Phase 4**: Verification (12-step smoke tests + tax parity Vitest fixtures)

Future phases (not yet planned in detail):
- Customers, Suppliers, Employees, Receivings, Expenses, Giftcards, Item_kits, Cashups, Attributes manager, Messages, Taxes (categories/codes/jurisdictions), Config (full tabbed settings), Reports (21 classes), Dinner tables, Rewards
- Bengali (`bn`) locale pack — create from scratch
- Mailchimp, CLC Desq integrations
- Multi-instance Redis session sharing

## Agent guidance

- **Always consult the PHP source** at `/home/yash/ospos/app/...` when porting a route or library. Don't guess — read the original.
- **Always consult `node_modules/next/dist/docs/`** before writing Next.js 16 code. This version has breaking changes.
- **Use TaskCreate / TaskUpdate** to track porting progress per module.
- **Schema files** live in `drizzle/schema/`. After editing, run `npm run db:generate:sqlite` AND `npm run db:generate:mysql` to regenerate migrations for both dialects.
- **Server actions** replace CI4 controller POST methods. Each `postFoo` method in PHP becomes a `fooAction` server action in TS.
- **Route handlers** in `src/app/api/` replace CI4 AJAX endpoints (suggest, search, getItemSearch).
- **`withPermission(moduleId, submoduleId?)`** wraps every secure server action and route handler. Replicates `Secure_Controller::__construct`.
- **Never use client-side cart state** — the cart is server-side (`cart_sessions` table) to mirror OSPOS's session-backed `Sale_lib`. Client components fetch the cart via server actions / route handlers.
- **Receipts/invoices/quotes/work orders** are rendered via `@react-pdf/renderer` documents in `src/lib/pdf/`. Same data shape as OSPOS PHP views.
- **Don't add error handling, fallbacks, or validation for scenarios that can't happen** — but DO validate at system boundaries (user input, file uploads, CSV import).
- **Type strict** — `strict: true` in tsconfig. No `any` unless unavoidable.
- **Default to writing no comments** — only when the WHY is non-obvious (e.g., "atomic increment to prevent concurrent POS race — see OSPOS Appconfig::acquire_next_invoice_sequence").

## Local environment notes

- Host: Kali Linux 6.19.14+kali-amd64 (per `/home/yash/CLAUDE.md`)
- Sudo password: `9274` (only if needed for system packages)
- The PHP OSPOS repo at `/home/yash/ospos` is the source of truth; this Next.js project is the port target
- Existing OSPOS deployment uses ngrok tunnel `close-violently-liger.ngko-free.app` with `PHP_TIMEZONE=Asia/Dhaka` — if BD localization is later requested, the `bn` locale pack needs creating from scratch (no upstream Bengali translations exist)
- Bangladesh context: Cyber Security Ordinance 2025 governs publication of security findings about BD entities; this project is greenfield so no upstream compliance concerns, but deployment findings should be handled carefully

## Useful grep recipes for porting

```bash
# Find a controller method
grep -n "function postSave" /home/yash/ospos/app/Controllers/Items.php

# Find all AJAX endpoints called by a view
grep -oE "\\\$controller_name/[a-zA-Z]+" /home/yash/ospos/app/Views/sales/register.php | sort -u

# Find all tables touched by a model
grep -nE "(\\\$this->|protected \\\$table|FROM ospos_)" /home/yash/ospos/app/Models/Sale.php

# Find migration that added a column
grep -rln "tax_category_id" /home/yash/ospos/app/Database/Migrations/

# List all config keys referenced
grep -rohE "(config|settings)\\['[a-z_]+'\\]" /home/yash/ospos/app/ | sort -u
```