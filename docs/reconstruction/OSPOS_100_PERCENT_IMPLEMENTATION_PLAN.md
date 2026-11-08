# OSPOS → Next.js 100% Reconstruction Plan

**Status:** Analysis complete (all appendices). Subsystem evidence reports in `docs/reconstruction/` are normative extensions of this plan.
**Upstream source of truth:** `opensourcepos/opensourcepos`, commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea` (post-3.4.3 master, 2026-11-07). Local reference: `/home/yash/ospos`.
**Target:** `/home/yash/Desktop/yash/ospos-nextjs` (Next.js 16.2.9, React 19.2.4, Drizzle ORM, NextAuth v5, Tailwind v4).
**Analysis date:** 2026-11-08.
**Rule:** The PHP source is authoritative. Where this plan and the PHP disagree, the PHP wins; update this plan and the evidence ledger.

---

## 0. How to use this plan

This plan is written for implementation agents that did not perform the analysis.

1. Read this document end-to-end before touching code.
2. Read the appendix for your module in `docs/reconstruction/` (index in §3.3).
3. Work one task ID at a time. Each task names its target files, upstream evidence, behavior contract, and acceptance test.
4. Do not invent behavior. If the PHP is ambiguous, record the ambiguity in the task and ask; do not guess.
5. Every task must land with tests. A task without a passing test is not done.
6. Update the traceability matrix (§10) and the gap ledger (§5.4) when a task lands.
7. Never modify `/home/yash/ospos`. Never copy PHP code verbatim into TypeScript without translating semantics; never “improve” observable behavior silently.

**Confidence labels used in the appendices:** `CONFIRMED` = read directly in upstream code with file:line evidence; `INFERRED` = derived from call sites/schema; `UNKNOWN` = not established.

---

## 1. Executive summary

The target is a broad but shallow port. It has the shell, routes, pages, and a first-pass schema for most modules, but its core business logic is materially different from OSPOS in the areas that decide whether a POS is correct: tax computation, sale/return persistence, inventory and weighted-average cost, receivings/requisitions, rewards, cashups, expenses, stock-location permissions, reports, and configuration.

The target also uses a divergent database model (epoch integers instead of SQL `datetime`, different column names, missing tables, a MySQL schema that is a copy of the SQLite model rather than the OSPOS model). That divergence blocks direct import of an existing OSPOS MySQL database and makes report parity impractical.

The plan therefore treats the target as a **scaffold to be rebuilt module-by-module**, not as a codebase to patch. The UI components and page structure can be reused where they already match OSPOS fields and workflows; core libraries, repositories, schema, seeds, and report SQL must be rewritten against the pinned upstream.

**Critical path:** schema/seed parity → money/config/auth/session primitives → tax → items/inventory → sales → receivings → reports → documents/i18n → differential verification.

**Biggest risks:** (1) money/rounding drift, (2) datetime/schema divergence, (3) MySQL vs SQLite SQL differences in reports, (4) session/cart semantics, (5) receipt/PDF content parity, (6) hidden PHP behaviors encoded only in long controller methods.

**Definition of done:** every upstream public controller method, model method, library/helper behavior, table/column, seed row, config key, report, token, barcode format, locale, and workflow has a target equivalent and a passing test; the differential harness shows zero unexplained differences on the golden fixture suite.

---

## 2. Definition of “100%”

“100%” is measured against observable OSPOS behavior, not against file-for-file similarity. The following checklist is normative.

### 2.1 Functional surface

- [ ] Every public method on every upstream controller has a target route, server action, or documented equivalent, with the same inputs, validation, permission check, side effects, and response shape. Upstream inventory: 26 controllers, 1,438 PHP files, 3,142 helper lines, 13 libraries.
- [ ] Every public method on every upstream model has a target repository/model function with the same query semantics, defaults, ordering, pagination, and error behavior. Upstream inventory: 62 model/report/token/enum classes.
- [ ] Every upstream library/helper behavior is present: `Sale_lib` (101 public methods), `Receiving_lib` (32), `Tax_lib` (15), `Token_lib` (4 + 12 token classes), `Barcode_lib` (6), `Email_lib`, `Sms_lib`, `Mailchimp_lib`, `Item_lib`, `CI3SecretConverter`, `MY_Migration`, helpers (`locale`, `tabular`, `security`, `importfile`, `tax`, `attribute`, `dompdf`, `report`, `url`).
- [ ] Every upstream view/workflow is represented: 119 views covering login, dashboard, office, items, item kits, sales register/manage/suspended/receipt/invoice/quote/work order, receivings, customers, suppliers, employees, giftcards, attributes, taxes, expenses, cashups, messages, config, reports, errors, partials.
- [ ] Every report works: 20 concrete report classes (plus two abstract bases) and the controller-generated variants (`summary_*`, `graphical_*`, `inventory_*`, `detailed_*`, `specific_*`), with exact filters, columns, summary rows, sort/search/pagination/detail behavior, and chart data.

### 2.2 Data surface

- [ ] Every upstream table, column, type, nullability, default, primary key, unique key, index, foreign key, generated column, and collation exists in the target MySQL schema.
- [ ] The SQLite schema preserves the same logical names and constraints (with documented SQLite type mapping).
- [ ] Every upstream seed row exists: `app_config` defaults (including migration-added keys), modules, permissions (including location-scoped), grants (including `menu_group`), stock locations, dinner tables, and any other seeded rows.
- [ ] The target can import an existing OSPOS MySQL database without loss of IDs, timestamps, decimals, sessions, or configuration.
- [ ] The target can export/round-trip to the OSPOS schema with no column loss.

### 2.3 Behavior surface

- [ ] Money arithmetic and all 7 rounding modes match PHP `Rounding_mode::round_number()` and `round()` exactly, including negative values and half-cent cases.
- [ ] Classic tax and destination-based tax match `Tax_lib` exactly: `items_taxes` only (no sale-time default-tax fallback; `default_tax_1/2` only prefill the item form), customer exemption, city/state lookup, customer tax code override rules, cascade sequences, included tax, group accumulation, print sequence, tax group keys, and rounding.
- [ ] Sale totals, discounts, payments, cash rounding, giftcards, reward points, change/refund, and return negatives match `Sale_lib::get_totals()`/`get_total()`/`get_amount_due()` and `Sale::save_value()` exactly.
- [ ] Inventory is append-only; quantities update atomically; weighted-average cost uses pre-receipt stock; delete/restore/cancel semantics match.
- [ ] Receivings support receive, return, and requisition/transfer with the exact quantity multipliers, cost timing, and validation.
- [ ] Attribute EAV behavior matches: definition types, flags, conversion, dropdown/checkbox shared values, orphan cleanup, sale/receiving link copying.
- [ ] Rewards use `customers_packages` / `customers_points` / `sales_reward_points` with the same earn/use math.
- [ ] Cashups use the same open/close amounts, payment summaries, expense subtraction, and total formula.
- [ ] Expenses use the same fields (`date`, supplier, tax code, tax amount), filters, and reporting.
- [ ] Stock locations are permission-scoped; creating/deleting/defaulting/sorting a location has the same side effects.
- [ ] RBAC matches `Employee::has_module_grant`, `has_grant`, `isAdmin`, `canModifyEmployee`, `get_menu_group`, and `Secure_Controller::__construct`.
- [ ] Sessions/cart match `Sale_lib`/`Receiving_lib` state keys, defaults, clearing rules, and per-session scope.
- [ ] Config keys have the same defaults, allowed values, validation, encryption, and effects.
- [ ] Tokens (`CU`, `CO`, `ISEQ`, `QSEQ`, `WSEQ`, `SCO`, `YCO`, `QCO`) and barcode tokens (`I`, `P`, `W`) render/parse exactly; strftime formats match.
- [ ] Barcodes support every upstream symbology and layout row.
- [ ] Receipts/invoices/quotes/work orders/email variants honor every `receipt_*`, `invoice_*`, `print_*` flag and template.
- [ ] CSV import/export formats are byte-compatible where OSPOS defines a template (items, customers); any upstream-absent CSV (e.g. suppliers) is explicitly documented as absent.
- [ ] i18n has all upstream locales and keys; number/date/currency formatting matches ICU/PHP behavior.
- [ ] Security behaviors match: CSRF exemptions, login throttle, session regeneration, `ALLOWED_HOSTNAMES`, file-upload validation, path-traversal defense, encryption of secrets.

### 2.4 Output surface

- [ ] Receipt/invoice/quote/work-order content and totals match for the same fixture data (text/structure; PDF engine may differ).
- [ ] Report rows, columns, ordering, summaries, and charts match.
- [ ] Barcode values/symbologies/row labels match (SVG pixels may differ).
- [ ] Token-rendered identifiers match, including zero-padding and sequence save behavior.
- [ ] CSV headers/rows/encodings match.
- [ ] Email subject/body/attachment behavior matches.
- [ ] Print behavior (print after sale, email after sale, delay/autoreturn) matches.

### 2.5 Quality gates

- [ ] `npm run build` passes with strict TypeScript.
- [ ] Unit tests cover every pure algorithm with upstream-derived fixtures.
- [ ] Integration tests cover every repository against both SQLite and MySQL.
- [ ] Playwright covers every workflow in §9.4.
- [ ] Differential harness compares target vs PHP for every scenario in §9.3 with zero unexplained diffs.
- [ ] Schema/seed/config/permission/locale/route parity tests pass.
- [ ] Security checklist passes.
- [ ] No `TODO`, `FIXME`, stub, empty handler, or hard-coded English string remains in a ported path (except upstream-absent features explicitly documented).

### 2.6 Allowed deviations (must be documented in §11.3)

1. **Framework and internal architecture** — Next.js/React/Drizzle vs CodeIgniter/PHP.
2. **Visual design** — Tailwind/shadcn layout may differ; fields, labels, validation, and workflow may not.
3. **Atomic sequence increments** — target may use `UPDATE … RETURNING`/transactional increments instead of PHP's read-modify-write, provided rendered numbers and save semantics match.
4. **Parameterized SQL and path-traversal hardening** — security fixes are allowed even where PHP is unsafe; observable normal behavior must not change.
5. **PDF/barcode rendering engine** — `@react-pdf`/`bwip-js` may replace dompdf/picqer if content and encoded values match.
6. **Session storage implementation** — DB-backed app session may replace PHP's session handler if keys, scope, and lifecycle match.
7. **Real SMS gateway** — upstream `Sms_lib::sendSMS()` is effectively a stub (returns true when config fields are non-empty). The target may implement a real gateway behind the same UI, but must keep the same validation/config keys and document the deviation.
8. **Bug fixes required to prevent data loss or security compromise** — list each in §11.3 with the upstream line and the reason.

---

## 3. Baseline, evidence, and scope control

### 3.1 Pinned baseline

| Item | Value |
|---|---|
| Upstream repo | `https://github.com/opensourcepos/opensourcepos` |
| Commit | `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea` |
| Version | post-3.4.3 / `3.4.4-dev` (`3.4.3` released 2026-10-21; `app/Config/App.php` reports 3.4.4-dev at the pinned commit) |
| PHP | 8.2.35–8.5.x |
| Framework | CodeIgniter 4.7.4 |
| DB | MySQL 8.x (8.4 utf8mb4 conversion), prefix `ospos_` |
| Local reference | `/home/yash/ospos` (read-only) |
| Target baseline | `ospos-nextjs` `main` at plan start (`d98c732`) |

The target's `CLAUDE.md` claims OSPOS 3.4.2. The plan upgrades the baseline to the pinned commit and includes the 3.4.2→3.4.3 delta as mandatory work (appendix `13-version-delta.md`).

### 3.2 Source-of-truth rules

- `/home/yash/ospos` is read-only evidence. Never edit it.
- When a target file exists but conflicts with upstream, upstream wins unless the conflict is an allowed deviation.
- When an upstream behavior is a defect that would corrupt data or expose a vulnerability, record it in §11.3 and implement the safe behavior; do not silently “fix” ordinary quirks.
- Do not use the existing `OSPOS_NEXTJS_GAP_ANALYSIS.md` as truth. It contains confirmed errors (e.g. it claims `Supplier` CSV exists upstream, claims `isAdmin` is too permissive, and claims `Sales::postSave` reverses inventory; the PHP does not).
- Every module report must cite `absolute/path:line` evidence.

### 3.3 Evidence appendix index

| File | Scope |
|---|---|
| `00-target-inventory.md` | Target repo map, routes, actions, schemas, stubs, tests, config/i18n inventory |
| `01-sales.md` | Sale_lib, Sale model, Sales controller, sale views, tokens, receipts |
| `02-items.md` | Items controller/model, inventory, quantities, kits, CSV, images, barcodes |
| `03-receivings.md` | Receiving_lib/model/controller, requisition/transfer, receipts |
| `04-taxes.md` | Tax_lib, tax models/controllers/views, rounding, destination tax |
| `05-attributes.md` | Attribute EAV model/controller/views, CSV, links |
| `06-people.md` | Customers, suppliers, employees, persons, auth/login, RBAC |
| `07-ancillary.md` | Giftcards, rewards, dinner tables, expenses, cashups, messages |
| `08-reports.md` | Reports controller, 20 concrete report classes, views/charts |
| `09-config-auth-install.md` | Config keys/tabs, auth/security, install/upgrade, sessions, i18n framework |
| `10-receipts-tokens-barcode-email.md` | Tokens, barcodes, receipts/PDF, email/SMS/Mailchimp, helpers |
| `11-database.md` | Final schema, migrations, seeds, target schema diff |
| `12-ui-views-assets.md` | Shared UI, tables, suggestions, shortcuts, assets |
| `13-version-delta.md` | 3.4.2 → post-3.4.3 behavior changes |

**Evidence status at plan publication:** all appendices complete. `10-receipts-tokens-barcode-email.supplement.md` is normative and contains the exact token/barcode/ICU/cipher/CSV fixtures; read it with the main `10` file. `14-traceability-matrix.md` maps every upstream PHP file to its appendix. If a section is marked incomplete in a later edit, treat that part as `UNKNOWN` and re-run the analysis; do not implement from a guess.

---

## 4. Architecture decisions

These are binding unless the user approves a change. Each decision records the alternative and why it was rejected.

### ADR-01 — Schema parity is the foundation; MySQL schema mirrors OSPOS exactly

**Decision:** Rewrite `src/db/schema/mysql/index.ts` from the final OSPOS 3.4.3 DDL (table names `ospos_*`, `datetime` columns, `decimal` scales, generated columns, indexes, FKs, `utf8mb4_unicode_520_ci`). Rewrite the SQLite schema to preserve the same logical table/column names and constraints, with SQLite type affinities (`INTEGER`, `TEXT`, `NUMERIC`, `REAL`) and `datetime` stored as `YYYY-MM-DD HH:MM:SS` text.

**Why:** Direct import of an existing OSPOS database, report SQL portability, and unambiguous parity tests. The current target MySQL schema is a copy of its SQLite schema and is not usable against an OSPOS database.

**Rejected alternatives:** (a) Keep epoch integers and adapt every report — rejected because it breaks import and SQL date semantics; (b) keep divergent column names and map in repositories — rejected because it doubles the mapping surface and hides gaps.

**Consequences:** All repository code, date formatting, fixtures, and report SQL must change. This is deliberately front-loaded in Phase 1.

### ADR-02 — Decimal arithmetic is mandatory for money, tax, quantities, and points

**Decision:** Add a single `src/lib/money` module (backed by `decimal.js` or an equivalent decimal library) and use it for every monetary/tax/quantity calculation. No `Number` arithmetic for money. Database writes use canonical decimal strings with the column's scale.

**Why:** PHP uses `bcmath`/`round()`; JavaScript floats produce different half-cent results. Tax parity and report totals depend on exact rounding.

**Required functions:** `dec()`, `add`, `sub`, `mul`, `div`, `round(mode, decimals)`, `toDb(decimals)`, `format`, `compare`, `isZero`, `abs`, `neg`. Implement PHP `round()` semantics for modes 1–7, including `HALF_FIVE` (`round(value / 5) * 5`), negative values, and `PHP_ROUND_HALF_UP` away-from-zero behavior.
**Global bcmath scale:** upstream `Load_config` sets `bcscale(max(2, totals_decimals() + tax_decimals()))` per request (`app/Events/Load_config.php`). All bcmath add/mul/div operations without an explicit scale use that value; `Item::change_cost_price` therefore truncates the average at that scale (typically 4) rather than rounding. Reproduce this scale explicitly in the money module and in `change_cost_price`; do not substitute JS float division.

**Consequences:** `src/lib/sale/types.ts`, `src/lib/tax/index.ts`, `src/lib/items/repository.ts`, `src/lib/receiving/*`, cashups, expenses, reports, and PDF data all change. Add a golden fixture suite in Phase 2.

### ADR-03 — Session and cart semantics mirror OSPOS, keyed per browser session

**Decision:** Implement an application session layer that mirrors OSPOS session keys and lifecycle: `person_id`, `menu_group`, `sale_id`, `suspended_id`, `sales_mode`, `sale_type`, `sales_cart`, `sales_payments`, `sales_customer`, `sales_employee`, `sales_comment`, `sales_invoice_number`, `sales_quote_number`, `sales_work_order_number`, `sales_print_after_sale`, `sales_email_receipt`, `sales_price_work_orders`, `sales_dinner_table`, `sale_location`, `cash_rounding`, `cash_mode`, `giftcard_remainder`, `rewards_remainder`, `sales_payment_type`, and the `recv_*` receiving keys.

Use a DB-backed session row (`sessions` table shaped like the final OSPOS table: `id`, `ip_address`, `timestamp`, `data`) plus a session cookie, or a NextAuth database session row with an attached app-state table. One cart per session, shared across tabs, cleared on login/logout and on `clear_all()`.

**Why:** Current target keys cart by `person_id`, so two browsers/tabs share one cart, unlike OSPOS. Session keys are also referenced by controllers/reports.

**Rejected alternative:** Client-side cart state — rejected; OSPOS is server-side and reload-safe.

**Consequences:** Replace `cartSessions` `cart:${personId}` keying. Add session regeneration, expiry/GC, and multi-instance behavior.

### ADR-04 — Auth: NextAuth credentials + exact OSPOS RBAC

**Decision:** Keep NextAuth Credentials for authentication, but implement `Employee` parity in `src/lib/auth/rbac.ts` and a `requirePermission` that mirrors `Secure_Controller`:
- `isAdmin(personId)`: true iff `personId === 1` or `has_grant(module)` for every `ADMIN_MODULES`.
- `has_module_grant(permissionId, personId)`: `COUNT(grants WHERE permission_id LIKE '<id>%' AND person_id=?)`; if count !== 1 return count !== 0; if count === 1 return `has_subpermissions(permissionId)` (true iff no `permissionId_%` permission rows exist).
- `has_grant(permissionId, personId)`: `null` permission → true, `null` person → false, otherwise exact row; **no admin bypass**.
- `get_menu_group`: default `'home'` when no grant row.
- `canModifyEmployee`: exact rules.
- `Secure_Controller` semantics: require module grant AND (when supplied) submodule grant; **do not short-circuit on `isAdmin`** (upstream runs both checks); redirect to `/no_access/{module}` or `/no_access/{module}/{submodule}`; load allowed modules for the session's `menu_group`.
- `grants` is keyed by `(permission_id, person_id)` with `menu_group varchar(32) DEFAULT 'home'`; no duplicate rows.

**Why:** The target's current `requirePermission` uses OR instead of AND, `hasGrant` adds an admin bypass, and its single-grant branch differs from PHP; subpermission enforcement is broken.

**Consequences:** Add `menu_group` selectors to employee grants; seed all permissions; fix `getAllowedModules` (`modules.sort != 0`, exact menu group matching, sort order).

### ADR-05 — Server actions are mutations; route handlers are AJAX/read endpoints

**Decision:** Keep Next.js App Router conventions, but make the mapping explicit:
- PHP `postFoo` → server action `fooAction` (or route handler `POST /api/<module>/foo` when the PHP endpoint returns JSON/AJAX and is called by client JS).
- PHP `getFoo` → page route for HTML, or route handler `GET /api/<module>/foo` for AJAX.
- Every action/route handler calls `requirePermission` with the same module/submodule as the PHP controller.
- Return shapes match PHP (`{success, message, id, ...}` or the exact JSON array/object).
- CSRF token required on every mutation except login/migrate.

**Why:** The target already uses this pattern; the plan keeps it but makes the mapping and permission coverage auditable.

### ADR-06 — Reports use a dual-dialect query layer with typed report definitions

**Decision:** Rebuild `src/lib/reports` as one definition per upstream report key, each with:
- exact `getData(inputs)` and `getSummaryData(inputs)` semantics,
- MySQL and SQLite SQL variants where syntax differs (`DATE_FORMAT` vs `strftime`, `GROUP_CONCAT` vs `group_concat`, `IFNULL` vs `COALESCE`, temp tables),
- column definitions (label, sorter, alignment, format),
- input schema (date range, sale type, location, entity id, discount type, etc.),
- permission key,
- graphical variant and chart type.

**Why:** The current registry is a hand-written SQLite-only subset with wrong SQL and missing filters.

**Rejected alternative:** One SQL string with a translation shim — rejected because complex reports use temp tables and dialect-specific aggregation.

**Consequences:** Each report needs fixtures from the PHP report model; a shared SQL test harness runs both dialects.

### ADR-07 — Documents: content parity first, engine second

**Decision:** Keep `@react-pdf/renderer` for PDFs, but port each upstream template (`receipt_default`, `receipt_short`, `receipt`, `invoice`, `tax_invoice`, `quote`, `work_order`, and `_email` variants) as a data builder plus a renderer. The data builder must reproduce every field, flag, total, tax line, payment line, barcode, and localized label. Browser print uses print CSS matching the receipt layout.

**Why:** The current PDF data builder computes `price * quantity` and ignores discounts/taxes/flags. PDF engine differences are acceptable; content differences are not.

**Acceptance:** For each template, normalized text content and totals match the PHP HTML output for the same fixture.

### ADR-08 — i18n: all upstream locales, key-for-key

**Decision:** Convert every upstream `app/Language/<locale>/*.php` array to `src/messages/<locale>/*.json` with identical keys and values; add `bn` as an extra locale; keep English as fallback. UI must not hard-code user-visible English.

**Why:** The target has 47 locale directories but no key-parity guarantee and hard-coded strings in components. OSPOS language files are the contract.

**Acceptance:** A script compares key sets per locale and fails on missing/extra keys (except documented additions such as `bn`).

### ADR-09 — Config: database-backed, cached, invalidated on write

**Decision:** Keep `app_config` as the key/value store. Implement a read-through cache with explicit invalidation after `save`/`batch_save`; support a shared invalidation signal for multi-instance deployments (DB version row or optional Redis). Config tabs render from a declarative field spec that includes type, allowed values, validation, encryption, and visibility.

**Why:** OSPOS caches settings in `Config\OSPOS` and invalidates on save; the target has an in-memory map but incomplete invalidation and an incomplete tab spec.

### ADR-10 — Files and images: validated, sanitized, served through a guarded route

**Decision:** Store item images under `uploads/item_pics/`, company logo under `uploads/`, validate MIME/extension/dimensions/size, sanitize filenames exactly like upstream (`[^a-zA-Z0-9_\-\.]` → `_` for items; `sanitize_filename` for logo), and serve thumbnails through a route that uses `path.basename()` and an allowlist.

**Why:** Path traversal defense and parity with `Items::getPicThumb`.

### ADR-11 — Security: fix, don’t replicate, unsafe PHP

**Decision:** Parameterize all SQL; never interpolate IDs. Enforce CSRF, host allowlist, session regeneration, login throttle, upload validation, output escaping, and CSP-compatible asset loading. Document each fix as a deviation in §11.3.

**Why:** The target already has raw `IN (${ids})` interpolation; OSPOS has known unsafe patterns. Security fixes are allowed; normal behavior must remain identical.

### ADR-12 — Differential testing against the PHP app is the acceptance authority

**Decision:** Build a Dockerized OSPOS 3.4.3 fixture app (MySQL 8.4, seeded deterministic data). For each scenario, run the same sequence against PHP and the target, then compare normalized DB rows, API responses, receipt/report text, token/barcode values, and permission decisions. Golden files live in `tests/parity/fixtures/`.

**Why:** Unit tests written from the same misunderstanding as the implementation prove nothing. The PHP app is the oracle.

**Consequences:** CI needs Docker; scenarios must be deterministic (fixed timestamps, fixed IDs, fixed locale). Differences are classified as `MATCH`, `ALLOWED_DEVIATION`, or `DEFECT`.

---

## 5. Current-state assessment

### 5.1 Summary

| Area | Current target | Verdict |
|---|---|---|
| Shell/auth/pages | Broad page/action coverage; NextAuth login | PARTIAL — permission semantics, menu groups, CSRF, sessions wrong |
| Database | Drizzle SQLite + a copied MySQL schema; epoch timestamps; many columns/tables missing | REWRITE |
| Seeds | ~100 config keys, incomplete modules/permissions/grants | REWRITE |
| Tax | Classic/destination partial; float math; cascade/grouping bugs | REWRITE |
| Sales | Cart/register exists; persistence simplified; returns/refunds/rewards/attributes wrong | REWRITE |
| Items | CRUD exists; search/bulk/CSV/images/barcode/cost average partial | REWRITE CORE |
| Receivings | Receive flow partial; requisition missing; cost timing wrong | REWRITE |
| Attributes | CRUD exists; conversion/cleanup/link semantics partial | REWRITE CORE |
| Customers/suppliers/employees | CRUD exists; CSV/grants/fields partial | PATCH + TESTS |
| Giftcards/rewards | CRUD exists; schema wrong (rewards) | REWRITE CORE |
| Cashups/expenses | CRUD exists; schema/calc wrong | REWRITE |
| Reports | 20-ish keys, SQLite-only, no filters/pagination/details | REWRITE |
| Config | 12 tabs vs upstream ~20; many keys missing | REWRITE |
| Documents | PDF builders exist; data math/flags wrong | REWRITE |
| Tokens/barcodes | Document tokens partial; barcode tokens missing | REWRITE |
| i18n | 47+bn locales; key parity unverified; hard-coded strings | AUDIT + FIX |
| Tests | 4 unit files, 28 shallow e2e specs | INSUFFICIENT |

### 5.2 Confirmed structural defects (independent verification)

These were verified directly against upstream during analysis; they supersede the older gap analysis where they conflict.

1. **Datetime representation.** Upstream uses SQL `timestamp`/`datetime` (`sale_time`, `receiving_time`, `inventory.trans_date`, `expenses.date`, `cash_up.open_date/close_date`, `sales_payments.payment_time`, `customers.date`, `sessions.timestamp`). Target stores epoch integers. Report SQL and data import cannot be faithful. → ADR-01.
2. **MySQL schema.** Target `src/db/schema/mysql/index.ts` is a parallel translation of its SQLite schema, not the OSPOS schema. Final upstream has **39 tables**, **47 migrations**, **138 `app_config` rows**, **18 modules**, **36 permissions**, **36 admin grants**, **1 stock location**, **2 dinner tables**, **5 customer packages**. Target drops `customers_packages`, `customers_points`, `sales_reward_points`; reduces `cash_up` to `cashups` (7 columns missing); loses PKs on several line/payment tables; loses 8 `sales_taxes` and 6 `sales_items_taxes` columns; renames `tax_rates` to `tax_code_links`; has the wrong `sessions` PK/type and `migrations` shape; cascades financial FKs that upstream blocks; seeds 90 config keys (52 missing, 4 invented, 29 value differences) and all grants as `both`. → ADR-01, `11-database.md` D1–D14.
3. **Money.** Target uses `Number` and `Math.round` throughout. PHP `Rounding_mode::HALF_FIVE` is `round($tax_amount / 5) * 5`; target's `Math.round(scaled * 2)/(factor*2)` is a different operation. HALF_DOWN/negative behavior also differs. → ADR-02.
4. **Tax.** Target `getTaxes()` falls back to `items_taxes` when destination-based tax returns false; PHP does not. Target's classic branch applies a default-tax fallback when `itemRows.length === 0`; PHP's sale engine never does (the default 1/2 keys only prefill the Items form). Target's destination rate definitions are unordered, group keys omit the `%`/`clean()` semantics, and `print_sequence` is missing. Target `getIncludedTax` rounds early. PHP itself implements `HALF_ODD` as `HALF_UP` and `HALF_FIVE` without a decimals argument; decide explicitly whether to replicate (default: replicate). → §7.4, `04-taxes.md`.
5. **Sale persistence.** Target `saveSale()` does not populate `sales.sale_cash_adjustment`/`sale_cash_refund`, writes incomplete `sales_items_taxes`/`sales_taxes`, inserts `attribute_links` with `definitionId=0` inside a swallowed try/catch, applies giftcard/reward payments without balance checks, and does not copy item attribute links. → §7.7.
6. **Sale deletion.** Upstream `Sale::delete()` marks `CANCELED` (never hard-deletes) and restores inventory only for `COMPLETED` sales. Target `cancelSale()` hard-deletes non-completed sales. → §7.7.
7. **Sale edit.** Upstream `Sales::postSave` updates sale fields and payments only; it does not reverse inventory or replace lines. The older gap analysis claims otherwise; the plan follows the PHP. → §7.7.
8. **Receiving cost.** Upstream `Receiving::save_value()` calls `change_cost_price()` **before** updating `item_quantities`, using pre-receipt stock. The target's current `receiving-model.ts` also runs cost before quantity (fixed in `2d491d6`), but it ignores `receiving_calculate_average_price`, lacks the `price != cost` guard and the `receiving_quantity` factor, and stores 4-dp reals (10.8889 vs upstream 10.89). → §7.8.
9. **Receiving quantity.** Upstream multiplies `quantity × receiving_quantity`; target hard-codes `receivingQuantity: 1`. → §7.8.
10. **Requisition.** Upstream `postRequisitionComplete()` rewrites cart lines to destination positive/source negative then completes. Target has no requisition mode. → §7.8.
11. **Rewrite vs. patch.** Target cashup, expense, reward, and stock-location schemas differ from upstream (`cashups` vs `cash_up`; `expenses.expense_time` vs `date`; `rewards`/`customer_rewards` vs `customers_packages`/`customers_points`/`sales_reward_points`; `stock_locations` lacks `is_default`/`sort_order`). → §7.9, §7.3.
12. **RBAC.** Target `requirePermission` uses OR where PHP requires module AND submodule; `hasModuleGrant` single-grant branch returns true when the grant is the module itself, whereas PHP returns `has_subpermissions(module)`. `isAdmin` is actually correct. → ADR-04.
13. **Reports.** Target registry uses SQLite-only SQL, wrong columns (`sales_taxes.name/amount` do not exist in its schema), missing report keys, no entity filters, no pagination/detail, and hard-limited 500 rows. → §7.10.
14. **Config.** Target has 12 tabs but the wrong set; upstream has 12 top-level tabs (info, general, tax, locale, barcode, stock, receipt, invoice, shortcuts, reward, table, system) with system sub-tabs (email/message/integrations/license/system-info) and many keys the target lacks (`default_sales_discount_type`, `default_receivings_discount(_type)`, `default_register_mode`, `line_sequence`, `derive_sale_quantity`, `multi_pack_enabled`, `work_order_enable/format`, `sales_quote_format`, `quote_default_comments`, `default_tax_jurisdiction`, `default_tax_category/code`, `barcode_formats`, `allow_duplicate_barcodes`, `gcaptcha_*`, `image_*`, `receipt_*`, `print_*`, `suggestions_*`, `category_dropdown`, `financial_year`, `currency_code`, `tax_id`, `giftcard_number`, `login_form`, `key_*`). → §7.2.
15. **Tokens.** Upstream token IDs include `QCO` (year quote count), not `YQO`; token rendering supports only `{TOKEN}` and `{TOKEN:length}`; `$CO` in default config renders literally. Barcode tokens `I`, `P`, `W` are missing in the target. → §7.11.
16. **Barcode config.** Target `barcode_type` options are lowercase while the generator expects uppercase keys (`C39`, `C128`, `EAN13`, `UPCA`, …); `barcode_content` values `id|number` are correct upstream (any non-`id` uses `item_number ?? name`). → §7.11.
17. **SMS.** Upstream `Sms_lib::sendSMS()` does not implement a gateway; it returns true when username/password/phone/message/originator are non-empty. The target's Twilio stub is a deviation, not a gap. → §7.12.
18. **Supplier CSV.** Upstream has no supplier CSV import/export. The older gap analysis claims it is missing; it is not an upstream feature. → §7.3.
19. **Bulk edit.** Upstream bulk edit updates only `name, category, supplier_id, cost_price, unit_price, reorder_level, description, allow_alt_description, is_serialized` plus item taxes. It does not update quantities or attributes. → §7.6.
20. **Stock locations.** Upstream `Stock_location` is permission-scoped (`items_<location_name>`, `sales_<location_name>`, `receivings_<location_name>`), creates grants for every employee, creates zero `item_quantities` rows for existing items, supports `is_default`/`sort_order`, and cleans permissions on delete. Target returns all locations by id. → §7.3.
21. **MySQL is non-functional in target runtime paths.** `src/lib/db/index.ts` `getDbSync()` throws when `DB_DRIVER=mysql`; every token, barcode, PDF, email, Mailchimp, report, and many repositories call it. Only some modules support the async MySQL driver. Fix before claiming dual-dialect support. → ADR-01, P2-T04/P2-T12/P10.
22. **i18n is effectively empty.** `src/messages/en/common.json` is `{}`; all locales except `bn` (57 keys) are `{}`; `src/lib/i18n/index.ts` exposes only `en`. The UI is hard-coded English. → §7.13, P11.
23. **Encryption is not import-compatible.** Target AES-256-GCM+scrypt cannot decrypt OSPOS CI4 ciphertext (AES-256-CTR/HKDF/HMAC) or CI3 legacy ciphertext; `mailchimp_list_id` is stored plaintext; `.env` rotation is non-atomic. → P2-T18, O-S1.
24. **`/api/migrate` is a public shell endpoint.** Target runs `execSync("npm run db:migrate")` with no authentication, lock, or version gate. Upstream requires credentials on an existing install, serializes with `GET_LOCK`, and returns distinct 200/202/503/500 statuses. → P2-T22, `09-config-auth-install.md` S-1/S-2/S-6.
25. **Password change is broken.** Target employees action calls `verifyPassword(oldPassword, hash)` with swapped semantics and treats a Promise as a boolean; minimum length is 4 vs upstream 8; no current-password/repeat/not-equal checks. → `06-people.md` O-14, P2/P3.

### 5.3 What can be reused

- App Router page/component scaffolding and design system.
- NextAuth credentials skeleton (password verify + MD5→bcrypt upgrade).
- `bwip-js`, `nodemailer`, `@react-pdf/renderer`, `next-intl`, Drizzle driver setup.
- E2E harness structure and fixtures (extend, don’t discard).
- Some UI tables/forms (reuse only after field/behavior parity review).

### 5.4 Gap ledger

The authoritative live ledger is the set of appendix reports plus the task list in §6/§7. Every confirmed gap receives a task ID. Do not track gaps only in prose; if a gap is found during implementation, add a row to the ledger and a task.

| Ledger ID | Area | Gap | Task(s) | Status |
|---|---|---|---|---|
| G-001 | Schema | MySQL schema not OSPOS-compatible | P1-T01…T08 | OPEN |
| G-002 | Schema | Datetime stored as epoch | P1-T02, P2-T04 | OPEN |
| G-003 | Money | Float arithmetic / rounding modes | P2-T01…T03 | OPEN |
| G-004 | Tax | Classic/destination mixing, cascade, exemption | P3-T06…T12, P5-T05 | OPEN |
| G-005 | Sales | Incomplete persistence/refunds/rewards/attributes | P5-T01…T18 | OPEN |
| G-006 | Items | Search, bulk, CSV, images, cost average | P4-T01…T16 | OPEN |
| G-007 | Receivings | Requisition, receiving_quantity, cost timing | P6-T01…T10 | OPEN |
| G-008 | Ancillary | Rewards/cashup/expense schemas and math | P7-T01…T14 | OPEN |
| G-009 | Reports | Full report engine + 20 reports | P8-T01…T11 / O-1…O-14 | OPEN |
| G-010 | Config | Missing tabs/keys/validation | P9-T01…T12 | OPEN |
| G-011 | RBAC | has_module_grant/requirePermission | P2-T08…T11 | OPEN |
| G-012 | Sessions | Cart keyed by person not session | P2-T06…T07 | OPEN |
| G-013 | Documents | PDF/receipt math and flags | P10-T01…T12 | OPEN |
| G-014 | Tokens | Barcode tokens, QCO, strftime | P2-T12…T14 | OPEN |
| G-015 | i18n | Key parity/hard-coded strings | P11-T01…T06 | OPEN |
| G-016 | Security | CSRF/host/upload/SQL injection | P2-T15…T18, P12-T01…T06 | OPEN |

---

## 6. Phase plan

### Global sequencing

```
P0 Baseline
 └─ P1 Data foundation
     └─ P2 Core runtime
         ├─ P3 Master data (people/taxes/attributes)
         ├─ P4 Items & inventory
         ├─ P9 Config & shell
         └─ P12 Security hardening (starts after P2, runs continuously)
             └─ P5 Sales
                 ├─ P6 Receivings
                 ├─ P7 Ancillary
                 ├─ P8 Reports
                 └─ P10 Documents & communications
                     └─ P11 i18n & accessibility
                         └─ P13 Differential verification & closure
```

P3, P4, and P9 can run in parallel after P2. P5 depends on P3/P4/P9. P6/P7/P8/P10 depend on P5. P11 runs alongside P5–P10 but must finish before P13. P12 runs continuously and gates release.

**First sprint (critical path only):** P0-T06 (harness), P1-T01→P1-T05 (schema/seed), P2-T01→P2-T03 (money), P2-T08→P2-T11 (RBAC), P3-T06→P3-T12 (taxes), P5-T01→P5-T10 (cart/persistence/returns). Do not start UI polish or report charts before these pass their gates. Everything else is blocked by, or will be invalidated by, these six areas.

### P0 — Baseline and guardrails

**Goal:** Establish a reproducible reference, freeze scope, and make every later task auditable.

| Task | Deliverable |
|---|---|
| P0-T01 | Pin upstream commit in `docs/reconstruction/BASELINE.md`; verify `/home/yash/ospos` at `603b2c7…`. |
| P0-T02 | Create `docs/reconstruction/README.md` index and link every appendix. |
| P0-T03 | Replace the stale `OSPOS_NEXTJS_GAP_ANALYSIS.md` with a pointer to this plan + appendices; archive the old file under `docs/reconstruction/archive/`. |
| P0-T04 | Add `AGENTS.md`/`CLAUDE.md` update: upstream path, pinned commit, plan path, “no stubs” rule, evidence citation rule. |
| P0-T05 | Create `docs/reconstruction/tasks/` with one file per task ID (template: upstream evidence, files, contract, tests). |
| P0-T06 | Stand up the differential harness skeleton (Docker Compose for OSPOS 3.4.3 + MySQL 8.4; fixture seed; runner script). |
| P0-T07 | Add CI gates: typecheck, lint, unit, e2e, schema parity, locale parity, route parity. |
| P0-T08 | Define branch/PR conventions and a definition-of-done checklist for implementation agents. |

**Exit gate G0:** baseline/evidence reproducible; harness starts; CI fails on a deliberately broken parity test.

### P1 — Data foundation

**Goal:** One OSPOS-compatible schema, seed set, and import path for MySQL and SQLite.

| Task | Deliverable |
|---|---|
| P1-T01 | Reconstruct final OSPOS 3.4.3 DDL table-by-table from `initial_schema.sql` + all 47 migrations; use `11-database.md` (appendix) as the canonical result. |
| P1-T02 | Rewrite MySQL Drizzle schema to exact final DDL: `ospos_*` names, `datetime`, `decimal(15,x)`, `tinyint`, generated column, indexes, FKs, collation. |
| P1-T03 | Rewrite SQLite Drizzle schema with same logical names/constraints and `datetime` as text. |
| P1-T04 | Implement `src/lib/datetime` (parse/format/compare, DB `YYYY-MM-DD HH:MM:SS`, locale formatting). Replace epoch conversions. |
| P1-T05 | Rebuild seed data exactly: `app_config` defaults (all migrations), modules, permissions (including location-scoped), grants/menu groups, stock location, dinner tables. |
| P1-T06 | Implement schema parity tests: MySQL `information_schema` vs expected DDL; SQLite `PRAGMA table_info/index_list/foreign_key_list` vs expected. |
| P1-T07 | Implement seed parity tests: row counts/checksums for modules/permissions/grants/app_config. |
| P1-T08 | Implement OSPOS MySQL import CLI (`scripts/import-ospos-mysql.ts`): copy all tables with IDs/timestamps/decimals, verify counts/checksums, report unmapped columns. |
| P1-T09 | Implement export/round-trip CLI and a destructive-safety check (refuse to overwrite non-empty target without `--force`). |
| P1-T10 | Implement migration runner/version tracking aligned with OSPOS upgrades; document fresh install vs upgrade. |
| P1-T11 | Add fixtures: deterministic minimal DB (admin, 2 locations, 5 items, 2 customers, 2 suppliers, taxes, attributes, rewards, dinner table, one sale/receiving). |

**Exit gate G1:** both dialects create the same logical schema; seed parity passes; a real OSPOS dump imports and round-trips with zero loss.

### P2 — Core runtime

**Goal:** The primitives every module depends on: money, config, sessions, auth/RBAC, security, tokens, barcode, i18n foundation.

| Task | Deliverable |
|---|---|
| P2-T01 | `src/lib/money` with decimal arithmetic and PHP-compatible rounding modes. |
| P2-T02 | Golden fixtures for all 7 rounding modes, negatives, half-cent, large values; compare to PHP outputs generated by the harness. |
| P2-T03 | Replace money/quantity `Number` math in tax/sale/receiving/cashup/expense/report/PDF code paths. |
| P2-T04 | `src/lib/datetime` integration with all schemas/repositories; remove epoch columns. |
| P2-T05 | Config cache + invalidation + typed getters (`getConfig`, `getConfigBool`, `getConfigNumber`, decimals helpers). |
| P2-T06 | App session layer: cookie, DB row, regeneration, GC, multi-instance invalidation. |
| P2-T07 | Cart/session store with exact `Sale_lib`/`Receiving_lib` keys and lifecycle. |
| P2-T08 | RBAC rewrite (`isAdmin`, `has_module_grant`, `has_grant`, `get_menu_group`, `canModifyEmployee`). |
| P2-T09 | `requirePermission` / `withPermission` exact `Secure_Controller` semantics; `no_access` route with optional submodule. |
| P2-T10 | Employee grants UI/API: permission list incl. subpermissions, `menu_group` per grant, admin protection. |
| P2-T11 | Permission/module seed parity + tests. |
| P2-T12 | Token engine: all document tokens, `QCO`, zero-padding, sequence save, `$`/`{}` behavior; barcode tokens `I/P/W`; parse_barcode. |
| P2-T13 | strftime/date format engine matching `Token_lib::applyDateFormats` (all valid characters, locale). |
| P2-T14 | Barcode library: supported types, uppercase config keys, generate/display/sheet, receipt barcode, fonts. |
| P2-T15 | CSRF: token cookie/header, all mutations, exemptions login/migrate; tests. |
| P2-T16 | Host allowlist (`ALLOWED_HOSTNAMES`) and secure headers. |
| P2-T17 | Login throttle + session regeneration + logout; failed-login tests. |
| P2-T18 | Encryption module: implement **CI4-compatible** decrypt/encrypt for import (AES-256-CTR, HKDF-SHA512, HMAC-SHA512 hex prefix, base64(iv‖ct)) and/or a one-time conversion command; support CI3 AES-128-CBC legacy; key bootstrap (`ENCRYPTION_KEY`/`encryption.key`, `hex2bin:`/`base64:`), ≥64-char validation, lock+backup+atomic `.env` rotation, previous-key fallback. Target AES-256-GCM/scrypt is not interoperable with CI4. |
| P2-T19 | i18n foundation: locale registry, message loader, number/date/currency formatters, fallback. |
| P2-T20 | Delete/neutralize all stubs/placeholder helpers in core paths; add “no-stub” lint/test. |
| P2-T21 | Remove `getDbSync()` from every server path (token, barcode, PDF, email, Mailchimp, reports, repositories) or provide a MySQL-capable sync adapter; make repository functions async where needed so `DB_DRIVER=mysql` works end-to-end. |
| P2-T22 | Migrate endpoint parity (`09-config-auth-install.md` S-1/S-2/S-6): POST-only, new-install vs existing-install credential gate, non-blocking lock (202), DB-down 503, failure 500, success 200, no GET side effects, `migrations` table CI4 shape. |

**Exit gate G2:** money/tax primitives, RBAC, session, CSRF, token, barcode, and config cache pass PHP-derived fixtures; no core path uses floats or epoch dates.

### P3 — Master data (people, taxes, attributes)

**Goal:** Customers, suppliers, employees, tax setup, attribute definitions/values/links, stock locations, dinner tables.

| Task | Deliverable |
|---|---|
| P3-T01 | Person model parity: fields, validation, save/delete, privacy scramble. |
| P3-T02 | Customer CRUD/search/suggest/stats/CSV import; account-number/email uniqueness; rewards fields; Mailchimp hook. |
| P3-T03 | Supplier CRUD/search/suggest; account/tax fields; supplier category; no CSV (document absence). |
| P3-T04 | Employee CRUD/search/login/password upgrade/grants/deletion rules; language fields. |
| P3-T05 | Stock-location model: permission scoping, create/delete/default/sort side effects, quantity rows. |
| P3-T06 | Tax category CRUD + usage checks. |
| P3-T07 | Tax jurisdiction CRUD + tax type options. |
| P3-T08 | Tax code CRUD + code/rate links + `tax_code_type`. |
| P3-T09 | Tax rate CRUD (rate/name/sequence/jurisdiction/category/rounding). |
| P3-T10 | Tax_lib classic branch exact algorithm (default 1/2, included/excluded, grouping). |
| P3-T11 | Tax_lib destination branch exact algorithm (code lookup, cascade, sequence, group identity). |
| P3-T12 | Tax rounding + tax group accumulation + `sales_taxes` contract. |
| P3-T13 | Attribute definition CRUD/type conversion/orphan cleanup. |
| P3-T14 | Attribute value/link CRUD, checkbox shared values, dropdown options. |
| P3-T15 | Attribute CSV integration and item attribute save. |
| P3-T16 | Dinner table CRUD/status rules. |
| P3-T17 | Master-data E2E + parity fixtures. |

**Exit gate G3:** master data CRUD/CSV and all tax/attribute fixtures match PHP; location permissions prevent unauthorized location access.

### P4 — Items, kits, inventory, images, barcodes

**Goal:** Full item lifecycle and stock correctness.
**Detailed obligations:** `02-items.md` §10, OBL-01–OBL-25. Each task below is a phase-level grouping; the OBLs are the unit of implementation.

| Task | Deliverable |
|---|---|
| P4-T01 | Item model: search (all filters, attribute search, date range, sort, count-only), get_info/get_multiple, leading-zero guard. |
| P4-T02 | Item save: all fields, types, low-sell self-reference, tax rows, quantities, attributes, image, transaction. |
| P4-T03 | Item delete/undelete/reset quantity/inventory deltas. |
| P4-T04 | Bulk edit exact allowed fields + taxes. |
| P4-T05 | Item CSV export template (locations + attributes) and import (rows, validation, attributes, quantities, taxes). |
| P4-T06 | Item images: upload validation/sanitize/store/thumbnail/remove. |
| P4-T07 | Count-details view (quantities per location) and inventory history. |
| P4-T08 | Item kits CRUD, kit items, kit number, price/print options, kit tax semantics. |
| P4-T09 | Barcode generation page/sheet; auto-number if empty; duplicate config. |
| P4-T10 | Item suggestions: config columns, multi-pack names, category/location/kit/low-sell. |
| P4-T11 | Item taxes model parity (max 2, save/delete). |
| P4-T12 | Item quantity atomic upsert; inventory append-only enforcement. |
| P4-T13 | `change_cost_price` weighted average with pre-update stock; tests with exact numbers. |
| P4-T14 | Item type/stock type behavior (temp/amount entry/serialized). |
| P4-T15 | Item E2E: create/edit/delete/restore/bulk/CSV/suggest/barcode/inventory. |
| P4-T16 | Item parity fixtures vs PHP (search results, CSV bytes, inventory rows, cost). |

**Exit gate G4:** every item operation produces identical DB rows and outputs; weighted average is exact; no path traversal.

### P5 — Sales

**Goal:** The register and all sale modes, persistence, returns, suspended sales, receipts/invoices/quotes/work orders.
**Detailed obligations:** `01-sales.md` §9, O1–O20. Implement in O1→O20 order; O1 (schema) blocks everything else.

| Task | Deliverable |
|---|---|
| P5-T01 | Sale_lib state model: all 101 methods, keys, defaults, clearing rules. |
| P5-T02 | Cart operations: add/edit/delete item, kit, amount entry, temp, serialized, merge, line keys. |
| P5-T03 | Totals: prediscount/subtotal/discount/tax/total/cash rounding/amount due/coverage. |
| P5-T04 | Payments: add/edit/delete, reference codes, cash adjustment sibling, giftcard/rewards remainder. |
| P5-T05 | Tax integration: classic/destination, customer exemption, taxed flags. |
| P5-T06 | Discounts: per-line percent/fixed, whole-sale, customer default propagation. |
| P5-T07 | Customer/employee/supplier/location/dinner-table selection and clearing. |
| P5-T08 | Modes: sale, invoice, quote, work order, return; register mode changes and guards. |
| P5-T09 | `Sale::save_value` exact transaction: sales, payments, items, taxes, inventory, attributes, rewards, dinner table. |
| P5-T10 | Returns: negative quantities/totals, `SALE_TYPE_RETURN`, cash_refund, giftcard credit, inventory increase, restore item. |
| P5-T11 | Complete sale validation: empty cart, negative total (non-return), payment coverage, invoice/quote dupes. |
| P5-T12 | Invoice/quote/work-order numbering via tokens; sequence atomicity; duplicate checks. |
| P5-T13 | Suspend/resume/cancel/discard; dinner table lifecycle; temp item cleanup. |
| P5-T14 | Sale manage/search/payments summary/temp-table SQL/date filters/columns; delete= cancel, restore=suspended. |
| P5-T15 | Edit-sale form: update fields/payments only; non-cash refund conversion; zero-payment deletion; reference codes. |
| P5-T16 | Receipt/invoice/quote/work-order pages and print/email triggers. |
| P5-T17 | Sale E2E for every mode and edge case. |
| P5-T18 | Sale parity fixtures: DB row dumps + receipt text + totals for each scenario. |

**Exit gate G5:** sale/return/suspend/edit scenarios match PHP database rows and printed totals exactly; no negative-total exploit; no stock leakage.

### P6 — Receivings

**Detailed obligations:** `03-receivings.md` §10, Phase A–F. Phase A (schema/contract) blocks B–D.

| Task | Deliverable |
|---|---|
| P6-T01 | Receiving_lib state model (all 32 methods, `recv_*` keys). |
| P6-T02 | Add/edit/delete item, kit, return entire receiving, copy entire receiving, receiving_quantity choices. |
| P6-T03 | Receive/return modes, stock source/destination, reference/comment/print flags. |
| P6-T04 | `Receiving::save_value` exact transaction: receivings/items, cost average before quantity, inventory, attributes. |
| P6-T05 | Requisition/transfer complete exact rewrite of cart lines and completion. |
| P6-T06 | Cancel/delete/restore receiving; inventory reversal with receiving_quantity. |
| P6-T07 | Receiving manage/search/edit/receipt pages. |
| P6-T08 | Receipt parsing (RECV/KIT/reference) and validation. |
| P6-T09 | Receiving suggestions/item search/stock item search. |
| P6-T10 | Receiving E2E + parity fixtures (cost, quantities, transfer). |

**Exit gate G6:** receive/return/requisition produce identical inventory, quantities, costs, and receipts.

### P7 — Ancillary

| Task | Deliverable |
|---|---|
| P7-T01 | Giftcard schema/CRUD/number/value/log; sale-time balance checks and refund credit. |
| P7-T02 | Reward packages (`customers_packages`) CRUD and assignment. |
| P7-T03 | Customer points earn/use (`customers_points`, `sales_reward_points`) exact math/config. |
| P7-T04 | Expense schema/CRUD/search/filters/supplier/tax fields. |
| P7-T05 | Expense categories CRUD/search/deletion. |
| P7-T06 | Cashup schema/CRUD/calculation/payment summary/expense subtraction. |
| P7-T07 | Dinner table CRUD/status/occupancy (shared with P3-T16). |
| P7-T08 | Messages/SMS config/validation/send/stub parity. |
| P7-T09 | Mailchimp sync (customer add/update, config). |
| P7-T10 | Ancillary E2E + parity fixtures. |

**Exit gate G7:** rewards/cashup/expense totals and DB rows match PHP.

### P8 — Reports

| Task | Deliverable |
|---|---|
| P8-T01 | Report framework: definition, inputs, columns, summary, pagination, detail rows, chart data. |
| P8-T02 | Dual-dialect SQL helpers (date, concat, temp tables, aggregate). |
| P8-T03 | Summary sales/categories/customers/suppliers/items/employees/taxes/sales_taxes/discounts/payments/expenses_categories. |
| P8-T04 | Inventory low/summary. |
| P8-T05 | Detailed sales/receivings/item sales. |
| P8-T06 | Specific customer/employee/supplier/discount. |
| P8-T07 | Graphical variants and chart rendering. |
| P8-T08 | Report listing/permission gating/date and entity input pages. |
| P8-T09 | Detailed-row endpoints and UI expansion. |
| P8-T10 | Report fixtures vs PHP (rows/columns/summaries/charts) for both dialects. |
| P8-T11 | Report E2E (all keys, filters, pagination, details). |

**Exit gate G8:** every upstream report key returns identical rows/columns/summaries for the fixture DB.

### P9 — Config, shell, dashboard, office

| Task | Deliverable |
|---|---|
| P9-T01 | Config field spec: all tabs/fields/types/options/validation/encryption/visibility. |
| P9-T02 | Config UI: info/general/tax/locale/barcode/stock/receipt/invoice/shortcuts/reward/table + system sub-tabs (email/message/integrations/license/system-info); stock-location/dinner-table/reward-package managers. |
| P9-T03 | Config save actions + validation + cache invalidation + secret masking. |
| P9-T04 | Logo upload/remove; barcode font list; theme list; language list. |
| P9-T05 | Stock locations/dinner tables/rewards tabs (side-effect CRUD). |
| P9-T06 | Shortcut key configuration (`key_*`) and register binding. |
| P9-T07 | Shell/sidebar: home/office groups, module lang keys, sort, icons, office visibility. |
| P9-T08 | Dashboard/office content and shortcuts. |
| P9-T09 | No-access page with module/submodule and messages. |
| P9-T10 | Config/shell E2E + config key parity test. |

**Exit gate G9:** every upstream config key is editable and effective; shell menus match grants/menu groups.

### P10 — Documents and communications

| Task | Deliverable |
|---|---|
| P10-T01 | Receipt data builders for default/short/receipt/invoice/tax_invoice/quote/work_order. |
| P10-T02 | Every receipt config flag honored (taxes, discount, description, serial, company, tax id, return policy, header/footer, margins, font). |
| P10-T03 | Email variants + attachment + logo + invoice email message. |
| P10-T04 | Browser print/print-after-sale/delay-autoreturn. |
| P10-T05 | Barcode sheet and receipt barcode. |
| P10-T06 | PDF renderers + content snapshots. |
| P10-T07 | Email library parity (protocol/SMTP/mail/sendmail, encryption, errors). |
| P10-T08 | SMS/Mailchimp integration parity. |
| P10-T09 | Document/email E2E + parity text snapshots. |

**Exit gate G10:** normalized receipt/invoice/quote/work-order text and totals match PHP; flags all take effect.

### P11 — i18n and accessibility

| Task | Deliverable |
|---|---|
| P11-T01 | Convert all 24 upstream `app/Language/<locale>/*.php` files per locale to `src/messages/<locale>/*.json` (current target: one empty `common.json` per locale; only `bn` has 57 keys); normalize `hr`/`hr-HR`, keep `bn` as an addition, add the missing locale; key parity script. |
| P11-T02 | Replace hard-coded UI strings; employee language override. |
| P11-T03 | Locale date/time/number/currency formatting parity. |
| P11-T04 | RTL layout for ar/he/fa/ur; locale-aware input parsing. |
| P11-T05 | Accessibility pass (labels, focus, keyboard, contrast) on all workflows. |
| P11-T06 | i18n E2E + key-coverage gate. |

**Exit gate G11:** every locale key exists; no hard-coded user-visible English; formatting parity fixtures pass.

### P12 — Hardening, performance, deployment

| Task | Deliverable |
|---|---|
| P12-T01 | SQL injection audit: zero interpolation; tests. |
| P12-T02 | Upload/path traversal audit; tests. |
| P12-T03 | CSRF/host/session/rate-limit audit; tests. |
| P12-T04 | Authorization audit: every route/action permission-mapped; negative tests. |
| P12-T05 | Performance: indexes, N+1 removal, report query plans, pagination. |
| P12-T06 | Deployment: Docker (SQLite/MySQL), env, backups, health checks, upgrade runbook. |
| P12-T07 | Observability: structured logs, error reporting, audit trail. |

**Exit gate G12:** security checklist passes; p95 register/report timings meet targets; deployment runbook verified.

### P13 — Differential verification and closure

| Task | Deliverable |
|---|---|
| P13-T01 | Scenario matrix complete (§9.3), golden fixtures frozen. |
| P13-T02 | Run full differential suite; classify every diff. |
| P13-T03 | Fix all `DEFECT` diffs; re-run. |
| P13-T04 | Re-run schema/seed/config/permission/locale/route parity. |
| P13-T05 | Manual acceptance scripts (§9.5) on SQLite and MySQL. |
| P13-T06 | Final traceability matrix: every upstream method/table/report/token/locale mapped and tested. |
| P13-T07 | Release sign-off. |

**Exit gate G13 — 100%:** zero open `DEFECT` diffs; all checklists in §2 pass; traceability shows no unexplained `MISSING`.

---

## 7. Module implementation specifications

> Detailed per-module behavior is in the appendix reports. This section states the binding contract, the target file map, and the non-obvious rules. When writing code, read the appendix first, then the upstream file:line it cites.
>
> **Authoritative obligation lists (implement these, not a paraphrase):**
> - Sales: `01-sales.md` §9, obligations **O1–O20**.
> - Items/kits/inventory/CSV/images/barcodes: `02-items.md` §10, obligations **OBL-01–OBL-25**.
> - Receivings: `03-receivings.md` §10, **Phase A–Phase F**.
> - Taxes/rounding: `04-taxes.md` §11, **15 obligations** and fixtures F1–F26.
> - Attributes: `05-attributes.md` §10, **12 obligations**.
> - People/stock locations: `06-people.md`.
> - Giftcards/rewards/dinner/expenses/cashups/messages: `07-ancillary.md` §12, **20 obligations** and gap IDs G-GC/G-RW/G-DT/G-EX/G-EC/G-CU/G-MSG.
> - Reports: `08-reports.md` §12, obligations **O-1–O-14**.
> - Config/auth/install/i18n: `09-config-auth-install.md`, obligations **S-1…S-6, A-1…A-7, C-1…C-10, I-1…I-6**.
> - Documents/tokens/barcodes/email: `10-receipts-tokens-barcode-email.md`.
> - Database/schema/seeds: `11-database.md` §7–§9.
> - Shared UI: `12-ui-views-assets.md` §10, obligations **O1–O25**.
> - Version delta: `13-version-delta.md`.
>
> Each obligation is independently reviewable and testable. A task in §6 is complete only when its corresponding obligation(s) are complete and their acceptance tests pass.

### 7.1 Auth, session, RBAC, security

**Upstream:** `app/Models/Employee.php`, `app/Models/Module.php`, `app/Controllers/Login.php`, `Secure_Controller.php`, `No_access.php`, `app/Filters/IsLoggedIn.php`, `Throttle.php`, `app/Helpers/security_helper.php`, `app/Config/Filters.php`/`Security.php`/`Session.php`.
**Target files:** `src/lib/auth/*`, `src/lib/db/session*`, `src/app/(auth)/login`, `src/app/(secure)/layout.tsx`, `src/components/shared/sidebar.tsx`, `src/proxy.ts`, `src/db/schema/auth.ts`.

**Binding rules:**
- `isAdmin`: `person_id === 1` OR exact grant for every `ADMIN_MODULES`.
- `has_module_grant`: `LIKE '<permission_id>%'`; if count != 1 → `count != 0`; if count == 1 → `has_subpermissions(permission_id)` (true only when no `<permission_id>_%` permission rows exist).
- `has_grant`: `null` permission → true; `null` person → false; otherwise exact row; **no admin bypass**.
- `get_menu_group`: default `'home'` when no row.
- `canModifyEmployee`: self non-admin → true; self admin → true; non-admin → admin → false; admin → non-admin → true; non-admin → non-admin → true.
- `grants`: composite PK `(permission_id, person_id)`, `menu_group varchar(32) DEFAULT 'home'`.
- `Secure_Controller`: require module grant AND (if provided) submodule grant; do **not** short-circuit on `isAdmin`; otherwise redirect `no_access/{module}` or `no_access/{module}/{submodule}`.
- `menu_group`: `home`/`office`/`both`; sidebar uses `get_allowed_home_modules` (`sort != 0`, menu_group in home/both) and `get_allowed_office_modules` (office/both).
- Login: reject deleted; hash_version 1 = MD5 then upgrade to bcrypt; hash_version 2 = bcrypt verify; regenerate session on success; throttle login/migrate. Employee fields: `username`, `password`, `hash_version`, `deleted`, `language`, `language_code`; `canModifyEmployee`/admin rules on save/delete; deleting an employee removes grants and soft-deletes, never self.
- Menu group: session `menu_group` switches Home/Office; `getAllowedModules` filters `menu_group IN (current,'both')`, `modules.sort != 0`, orders by `sort`.
- CSRF: global except `login|migrate`; AJAX unauthorized returns 401 JSON `{success:false,message:"Session expired. Please log in again."}`.
- `ALLOWED_HOSTNAMES` enforcement; refuse to boot in production when unset.
- Session table shape: `(id, ip_address)` composite PK, `id varchar(128)`, `timestamp` SQL timestamp, `data` blob; CI4 `matchIP=true`.
- Migration endpoint: authenticated/`migrate` grant, serialized (upstream `GET_LOCK`), not an unauthenticated shell call.
- Events/commands: port the `Load_config` behavior — destroy the session when migrations are not latest, set the default language with path-traversal rejection, set the timezone, set `bcscale(max(2, totals_decimals + tax_decimals))`; port the `Db_log`/`Method` events and the `EnvProvision` command (key/throttle provisioning). See `09-config-auth-install.md` S-5/S-6.
- **Target-specific confirmed defects:** `requirePermission` OR semantics; `hasModuleGrant` single-grant branch; `hasGrant` admin bypass; no CSRF token; `allowedHostnames` is not a NextAuth v5 option (host enforcement only in `proxy.ts`, which logs and keeps running); production boot check weaker than upstream; JWT sessions (7 days) vs upstream DB sessions (2 h, `matchIP`, regenerate-destroy), no server-side revocation; no throttle; `/no_access/[module]` 404; change-password missing current/min/repeat; sidebar hard-coded; session keyed by person, not session.
- **Authoritative obligations:** `09-config-auth-install.md` A-series and `06-people.md`.

### 7.2 Configuration

**Upstream:** `app/Controllers/Config.php`, `app/Models/Appconfig.php`, `app/Config/OSPOS.php`, `app/Views/configs/*`.
**Target files:** `src/lib/config/*`, `src/app/(secure)/config/*`, `src/db/schema/config.ts`, `src/db/seed.ts`.

**Binding rules:**
- Every one of the **138 final `app_config` keys** exists with the upstream default (`11-database.md` §4). The target's 90-key seed is not acceptable; the 52 missing keys include `account_number`, `barcode_formats`, `category_dropdown`, `currency_code`, `customer_reward_enable`, `date_or_time_format`, `default_receivings_discount(_type)`, `default_register_mode`, `default_sales_discount_type`, `default_tax_category/code/jurisdiction`, `derive_sale_quantity`, `email_receipt_check_behaviour`, `enforce_privacy`, `financial_year`, `gcaptcha_*`, `giftcard_number`, `image_*`, all ten `key_*`, `line_sequence`, `login_form`, `payment_message`, `print_delay_autoreturn`, `print_receipt_check_behaviour`, `quote_default_comments`, `receipt_font_size`, `receipt_show_company_name`, `receipt_show_tax_ind`, `receiving_calculate_average_price`, `sales_quote_format`, `suggestions_*`, `tax_id`, `work_order_enable/format`.
- Tabs match upstream `configs/manage.php`: **info, general, tax, locale, barcode, stock, receipt, invoice, shortcuts, reward, table**, and **system** (which nests email, message, integrations/Mailchimp, license, and system-info sub-tabs). Stock locations/dinner tables/reward packages are edited inside those tabs. The target's 12-tab spec has a different set (it adds `sales`/`mailchimp`, omits `info`, `shortcuts`, `table`, `system`, and the stock-location manager), and several `save*Action` helpers reference non-existent tabs.
- Allowed values are exact (`barcode_content`: `id|number` (the UI's `number` means item_number; generation uses any non-`id` value as `item_number ?? name`); `barcode_type`: uppercase keys from `Barcode_lib::$supported_barcodes`; `invoice_type`: `invoice|tax_invoice|custom_invoice|custom_tax_invoice`; `receipt_template`: `receipt_default|receipt_short`; protocol `mail|sendmail|smtp`; crypto `''|ssl|tls`; rounding codes 0–7; register mode; line sequence 0–2; login form `floating_labels|input_groups`; suggestions columns from `Item::ALLOWED_SUGGESTIONS_COLUMNS`).
- `save`/`batch_save` are transactional and invalidate the config cache once after commit; multi-instance invalidation is explicit.
- Secrets (`smtp_pass`, `msg_pwd`, `mailchimp_api_key`/`list_id`) are encrypted at rest, never echoed, and decrypted only at use.
- File uploads: logo max 1024 KB, png/jpg/jpeg/gif, max 800×680, sanitized filename.
- `category_dropdown` creates/deletes the `ospos_category` attribute definition; `show_office_group` sets the `office` module `sort` to 999/0.
- Shortcut keys (`key_cancel`, `key_items`, `key_customers`, `key_suspend`, `key_suspended`, `key_amount`, `key_payment`, `key_complete`, `key_finish`, `key_help`) are seeded with upstream defaults (`27 | ESC`, `49 | ALT + 1`, …), validated for duplicates, and drive the register/help modal.
- Stock locations/dinner tables/reward packages are edited in Config with the upstream bulk-save/delete-on-absence semantics and side effects.
- **Target-specific confirmed defects:** 90 vs 138 keys (56 of 138 absent from the field schema); wrong 12-tab set; six tab/action keys (`info`, `sms`, `rewards`, `stock_locations`, `dinner_tables`, `shortcuts`) throw "Unknown tab"; lowercase `barcode_type`; `barcode_content` invents `name`; invented `default_tax_1_cumulative`; `use_customer_rewards` vs `customer_reward_enable`; no `key_*` tab; no stock-location manager; no reward-package rows; `smtp_timeout` units mismatch; **encrypted secrets are decrypted and sent to the browser as input `defaultValue`** (upstream sends only `*_set` booleans/placeholders); config cache has no TTL/cross-process invalidation; sequence SQL is SQLite-only; seed skips all-or-nothing when an admin exists.
- **Authoritative obligations:** `09-config-auth-install.md` C-series and `11-database.md` §4/§6.1.

### 7.3 People, stock locations, dinner tables

**Upstream:** `app/Models/Person.php`, `Customer.php`, `Supplier.php`, `Employee.php`, `Stock_location.php`, `Dinner_table.php`, controllers, views.
**Target files:** `src/lib/persons/*`, `src/lib/employees/*`, `src/lib/stock_locations/*`, `src/lib/dinner_tables/*`, pages/components, schema.

**Binding rules:**
- Person fields: `first_name` (required), `last_name`, `gender` (nullable int), `phone_number`, `email`, `address_1`, `address_2`, `city`, `state`, `zip`, `country`, `comments`. `Person::get_total_rows()` references a non-existent `people.deleted`; decide/replicate (likely dead method).
- Customer fields: `account_number`, `taxable`, `tax_id`, `sales_tax_code_id`, `discount`, `discount_type`, `company_name`, `package_id`, `points`, `date`, `employee_id`, `consent`, `deleted`; `saveCustomer` is a transaction over `people` then `customers`.
- Customer delete with `enforce_privacy` scrambles first/last name to person_id, blanks phone/email/address, nulls gender.
- Email uniqueness only for non-empty emails; account-number uniqueness checks customers only (upstream `Customer::check_account_number_exists`); verify whether supplier account numbers are checked separately (report).
- Customer CSV: 18 columns (0–17) as documented in `06-people.md`; header skipped; consent required; email validated; duplicate email/account rejected; per-row failure codes; Mailchimp `addOrUpdateMember` on success. Supplier CSV is **not** an upstream feature; do not invent it.
- Employee: username uniqueness, password hash upgrade, grants replacement, `menu_group` per grant, `isAdmin` protection, self-delete prevention, language fields, deleted soft-delete.
- Stock locations: permission IDs `{module}_{location_name with spaces→_}` for items/sales/receivings; create grants for every employee using the module's menu group; insert zero `item_quantities` rows for all existing items; single `is_default`; dense `sort_order` 0..N-1 with deleted rows NULL; create/delete/rename/sort/default side effects exact; `get_allowed_locations`/`is_allowed_location`/`getDefaultLocationId` permission-scoped.
- Dinner table: status/occupancy rules; ids 1 (`Delivery`) and 2 (`Take Away`) are special and must not be occupied/released; release on COMPLETED/CANCELED; occupy on SUSPENDED; `get_empty_tables`.
- **Target-specific confirmed defects:** gender/tax/package/consent/date/deleted fields missing; no customer CSV; employee form missing menu_group/language/deleted; stock locations not permission-scoped and no create/delete side effects; reward/points editing exposed on customer form.
- **Authoritative obligations:** `06-people.md`.

### 7.4 Taxes

**Upstream:** `app/Libraries/Tax_lib.php`, `app/Models/Tax.php`, `Tax_code.php`, `Tax_category.php`, `Tax_jurisdiction.php`, `Item_taxes.php`, controllers/views.
**Target files:** `src/lib/tax/*`, `src/lib/taxes/*`, `src/app/(secure)/taxes*`, schema.

**Binding rules (corrected against `04-taxes.md`):**
- Classic mode: `Tax_lib::get_taxes()` reads `items_taxes` for the item (or `sales_items_taxes` when editing a saved sale) and **never applies a sale-time default-tax fallback**. The `default_tax_1_*`/`default_tax_2_*` config keys are only used by the Items form to prefill the item's tax rows (`Items.php:398-399`); do not invent a fallback in the sale engine.
- Customer: walk-in (`customer_id == -1`) or `taxable`; otherwise no tax and `taxed_flag = nontaxed_ind`.
- Destination: if `item.tax_category_id` null → `default_tax_category`; tax code selection: register mode `sale` → `default_tax_code`; otherwise customer `sales_tax_code_id` if set, else `Tax_code::get_sales_tax_code(city,state)`, else `default_tax_code`. Skip if code `-1` or price 0.
- Destination rate order is deterministic and must match `Tax::get_taxes()`: order by `cascade_sequence`, `tax_group`, `jurisdiction_name`, then sequence sum (`app/Models/Tax.php:126`); do not rely on insertion order.
- Cascade: `last_cascade_sequence` starts 0; when `cascade_sequence` changes, add accumulated excluded tax (`cascade_tax_amount`) to basis; included taxes do not accumulate into cascade.
- Group key: `clean('X' . (float)$rate . '% ' . $tax_group)` where `clean` replaces spaces with `-` and strips non `[A-Za-z0-9-]`; store `print_sequence`, `tax_group`, `tax_rate`, `name`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id`, `rounding_code`.
- Accumulate group basis/amount with scale 4; final `round_taxes` sorts by `print_sequence` and rounds included to `tax_decimals`, excluded to `totals_decimals`.
- `getIncludedTax`: `total - total/(1+percent/100)`, unrounded (round later).
- Upstream rounding has two distinct implementations that must both be ported:
  - `Rounding_mode::round_number()` (cash rounding and general): `HALF_FIVE = round(amount/5, decimals, PHP_ROUND_HALF_EVEN) * 5`; `HALF_ODD` = PHP half-odd; `ROUND_UP/DOWN` use the ceil/floor formulation at `10^decimals`.
  - `Tax_lib::round_taxes()` inline branch: `HALF_ODD` is implemented as `HALF_UP`, and `HALF_FIVE` is `round(value/5)*5` with **no decimals argument** (0-dp, PHP_HALF_UP). Record in §11.3 if either quirk is fixed.
- `apply_invoice_taxing`: sort by print sequence and recompute group amount from basis/rate/rounding; only the original sales-tax migration path uses it.
- Tax tables: final schema includes `tax_categories`, `tax_codes`, `tax_rates`, `tax_jurisdictions`; `sales_items_taxes` needs `tax_type`, `rounding_code`, `cascade_sequence`, `item_tax_amount`, `sales_tax_code_id`, `tax_category_id`, `jurisdiction_id`; `sales_taxes` needs `print_sequence`, `name`, `tax_rate`, `rounding_code`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id` in addition to the group/basis/amount fields. Exact DDL in `11-database.md`.

### 7.5 Attributes

**Upstream:** `app/Models/Attribute.php`, `app/Controllers/Attributes.php`, views.
**Target files:** `src/lib/attributes/*`, pages/components, schema.

**Binding rules (corrected against `05-attributes.md`):**
- **Attributes are item-level only in upstream 3.4.3.** There is no sale/receiving attribute-entry modal. On sale/receiving save, `copy_attribute_links(item_id, 'sale_id'|'receiving_id', id)` copies the item's current attribute links into rows carrying the sale/receiving id. The cart/receipt display comes from those copied values.
- Definitions: `definition_id`, `definition_name`, `definition_type` (`TEXT|DROPDOWN|DECIMAL|DATE|GROUP|CHECKBOX`), `definition_unit`, `definition_flags` (`SHOW_IN_ITEMS=1`, `SHOW_IN_SALES=2`, `SHOW_IN_RECEIVINGS=4`), `definition_fk`, `deleted`. `SHOW_IN_SEARCH=8` is also used by item search in 3.4.3.
- Values: one physical row per value; columns `attribute_value`, `attribute_date`, `attribute_decimal`; uniques on each value column.
- Links: `attribute_id`, `definition_id`, `item_id`, `sale_id`, `receiving_id`; NULL item marks a dropdown option; generated unique column only for `sale_id IS NULL AND receiving_id IS NULL AND item_id IS NOT NULL`; FKs `definition_id`/`attribute_id` RESTRICT.
- Type conversion: validate existing values, convert, update links, delete orphaned dropdown links, reuse checkbox 0/1 rows (shared rows).
- Checkbox: shared 0/1 rows, not one per item.
- `copy_attribute_links`: copy item-level links to sale/receiving, same attribute/definition ids, ignore duplicates.
- CSV: attribute columns appended after base item columns; `saveCSVRowAttributeData` exact rules.
- Target-specific confirmed bugs to fix: `items/[id]/page.tsx:20` reads `a.value` instead of `attributeValue`; sale save inserts a bogus `definitionId:0` link inside a swallowed catch; receiving has no attribute code; `getDefinitionsByFlags` uses ALL-bits instead of ANY-bits and fails to exclude GROUP; new definitions default to flags 0 instead of 15.

### 7.6 Items and item kits

**Upstream:** `app/Controllers/Items.php`, `Item.php`, `Item_taxes.php`, `Item_quantity.php`, `Inventory.php`, `Item_kit.php`, `Item_kit_items.php`, views.
**Target files:** `src/lib/items/*`, `src/lib/item_kits/*`, `src/lib/inventory/*`, `src/app/(secure)/items*`, `src/app/api/items/*`, schema.

**Binding rules:**
- `get_info_by_id_or_number`: numeric ID only when `ctype_digit && !startsWith('0')`; otherwise item_number.
- Search: free text across name/item_number/item_id/company_name/category; filters empty_upc, low_inventory, serialized, no_description, temporary/item types, deleted, stock location, inventory date range; attribute search with named `name=value` terms; sort by quantity/attribute; count-only; Phase A IDs then Phase B display.
- Save: `item_type TEMP` forces no stock/0 receiving/0 reorder; tax category null handling; item taxes only when not destination-based; quantities for all allowed locations; inventory delta `new-old`; attributes via `saveItemAttributes`; image filename `raw_name.ext`; low_sell_item_id defaults to self on insert.
- Delete: reset quantities and inventory via offsetting rows; soft delete. Undelete on negative sale quantity.
- Bulk: allowed fields exactly `name, category, supplier_id, cost_price, unit_price, reorder_level, description, allow_alt_description, is_serialized`; prices/quantities locale-parsed; supplier `NONE` clears; taxes replaced for selected IDs.
- Item kit: `item_kit_number`, `name`, `description`, `item_id`, `kit_discount`, `kit_discount_type`, `price_option`, `print_option`; kit items with `kit_sequence`; price option semantics in `Sale_lib::add_item`.
- Barcode: `get_barcode_value` = id when `barcode_content=id`, else item_number ?? name; type must be an uppercase supported key; width factor 2; height config; receipt barcode always C128.
- `change_cost_price`: `(items_received*new_price + old_total_qty*old_price)/(old_total_qty+items_received)`; must run before quantity update; old_total_qty sums non-deleted stock locations. Use decimal arithmetic; do not round the division (upstream truncates at bc scale); define `totalQty=0` behavior.
- **Target-specific confirmed defects to fix (full list in `02-items.md` §9):** item save cannot change item/stock type; delete/restore/resurrect semantics wrong; search lacks location scoping, `low_inventory`, attribute search, sorting/paging, and leaks temp items; taxes drop 0% rows; attributes stored as TEXT only; bulk edit has no UI and no tax persistence; images lack validation/thumbnails; lowercase `barcode_type`; kit barcodes and generate-if-empty missing; item kits lack the linked item/totals/price-option constants; CSV import has BOM/header/duplicate/per-location bugs; raw `IN (${ids})` SQL; `getItemIdByNumber` inverted condition.
- **Authoritative obligations:** `02-items.md` §10, OBL-01–OBL-25.

### 7.7 Sales

**Upstream:** `app/Libraries/Sale_lib.php`, `app/Models/Sale.php`, `app/Controllers/Sales.php`, `app/Views/sales/*`.
**Target files:** `src/lib/sale/*`, `src/app/(secure)/sales/*`, `src/components/sales/*`, schema.

**Binding rules (core; full detail in `01-sales.md`):**
- Cart line keyed by `line` (1-based, max+1); merge same item+location by adding quantity unless serialized; `total`/`discounted_total` from `get_item_total`.
- `get_item_discount`: percent = `qty*price*discount/100`; fixed = `qty*discount`; round to totals decimals HALF_UP.
- `get_item_total(include_discount)`: `qty*price - discount`; no rounding in the function.
- `get_totals`: prediscount subtotal = sum qty*price; total = sum discounted extended; subtract included tax from subtotal; add excluded tax to total; payment total excludes cash_adjustment; cash rounding; amount due; coverage threshold `10^-decimals / 2`; return mode uses `current_due > -threshold`, else `< threshold`; cash adjustment = `round(cash_total - total, totals_decimals, HALF_UP)` when covered.
- Payments: localized type keys; giftcard input is the card number; amount = min(amount_due, card value); validate customer ownership/remaining balance; rewards require package; amount = min(amount_due, points); cash adds a sibling `cash_adjustment` row = `get_total() - get_total(false)`; delete payment removes sibling only for cash/cash_adjustment.
- `save_value`: transaction; existing sale clears suspended detail and releases dinner table; sales row; payments (giftcard decrement / reward decrement / cash_refund); `save_customer_rewards`; items with `character_limiter(description,255)`/`serialnumber,30`; stock decrement only `HAS_STOCK` + COMPLETED; undelete on negative qty; inventory `POS <id>` delta; copy attribute links; save sales taxes only walk-in or taxable; dinner table release on COMPLETED else occupy.
- Giftcard/reward failures return `-2`/`-3`, rollback.
- Returns: `return_entire_sale` empties cart/customer, adds original lines with negative quantity and original price/discount, sets customer. `sale_type=RETURN`; totals negative; cash refund recorded on cash payment (or zero cash payment with cash_refund); non-cash refunds become negative payments of that type.
- Complete validation: empty cart fails; non-return negative total fails; payment coverage required except invoice/quote; invoice/quote/work-order duplicate numbers fail; receipt template allowlist.
- Delete: mark CANCELED; restore inventory only if COMPLETED and requested; never hard delete.
- Restore: set SUSPENDED.
- Edit (manage form): update sale fields/payments only; existing zero-amount payments are deleted; non-cash positive refund becomes negative payment of refund type; new payment over amount adds cash_refund; reference code validation.
- Suspended: `sale_status=SUSPENDED`; quote/work-order numbers; dinner table occupied; unsuspend copies entire sale and sets register mode.
- Search: temp payment/tax tables; date/date-time config; sale type filters; payment summary; giftcard aggregation.
- Receipts: templates and flags per `01-sales.md`/`10-receipts…md`.
- **Target-specific confirmed defects to fix (full list in `01-sales.md` §8):**
  - Quote/work-order completion always saves `COMPLETED` and redirects to non-existent pages; quotes/WOs must be `SUSPENDED` and render documents.
  - Giftcards/rewards are debited at `addPayment` and again in `saveSale`, with no balance guard or `-2`/`-3` sentinel; mutate only in the save transaction.
  - Receipt/PDF totals omit discounts and excluded tax; returns use `Math.abs` and lose negative signs.
  - `sales_payments` lacks `payment_id`/`reference_code`; `sales_taxes`/`sales_items_taxes` lack upstream attribution columns.
  - Token/sequence parity broken: `QCO` implemented as `YQO`; `SCO` counts all suspended; `YCO` adds 1; `ISEQ` ignores `save=false`; `%` strftime and replace-all missing.
  - Cash rounding/cash-adjustment creation is unreachable.
  - `cancelSale` hard-deletes non-completed sales; upstream marks `CANCELED`.
  - Discount fixed-line math subtracts discount once instead of `qty*discount`.
  - No register cancel button; no edit-sale form; no quote/WO HTML pages.
- **Authoritative obligations:** `01-sales.md` §9, O1–O20.

### 7.8 Receivings

**Upstream:** `app/Libraries/Receiving_lib.php`, `app/Models/Receiving.php`, `app/Controllers/Receivings.php`, views.
**Target files:** `src/lib/receiving/*`, pages/components, schema.

**Binding rules:**
- Cart `recv_*` keys; supplier default `-1`; mode `receive|return|requisition`; stock source/destination default from `Stock_location::getDefaultLocationId('receivings')`; reference/comment/print flags.
- Add item: resolve by ID/number; merge by item+location; price = provided or cost_price; `receiving_quantity` choices; attributes from item/receiving links; total = `qty * receiving_qty * price - discount` (percent on extended total).
- Return entire receiving: parse `RECV #`, `KIT #`, or reference via `get_receiving_by_reference`; add negative quantities, original prices/discount/receiving_quantity; restore supplier.
- Copy entire receiving: same without reference (upstream comments it out).
- `save_value`: transaction; receivings row (`receiving_time`, supplier if exists, employee, payment_type, comment, reference); items row (`quantity_purchased`, `receiving_quantity`, discount/type, cost from current item, unit price, location); `items_received = receiving_quantity != 0 ? quantity*receiving_quantity : quantity`; if cost changed and `receiving_calculate_average_price`, `change_cost_price` **before** quantity update; update item_quantity + insert inventory `RECV <id>` delta; copy attribute links.
- **Upstream 3.4.3 has no receiving invoice number.** `recv_invoice_format` exists but is never read; `receivings` has only `reference varchar(32)`. Do not invent `invoice_number` or a self-referencing numeric `receiving_ref`.
- Delete: reverse `quantity_purchased * -receiving_quantity` in inventory and quantities; delete items + receiving. Note upstream quirks: `rq=0` makes line totals 0 while stock moves, and delete restores nothing when `rq=0`; decide/replicate via §11.4.
- Requisition complete: source != destination; for each cart line delete and add destination positive, source negative; then complete. Upstream passes `discount_type` into the `discount` parameter (defect); record decision.
- Weighted-average target note: the current target order is correct (cost before quantity) but ignores `receiving_calculate_average_price`, lacks the `price != cost` guard and the `receiving_quantity` factor, and uses 4-dp reals (10.8889 vs upstream 10.89).
- Validate receipt: `Receiving::is_valid_receipt` accepts `RECV #`, `KIT #`, or reference match (verify exact implementation in `03-receivings.md`).
- Receipt page/copy behavior.
- **Target-specific confirmed defects to fix:** no requisition mode; `receiving_quantity` hard-coded 1; cost average computed after quantity update; cancel/delete does not multiply by `receiving_quantity`; no receiving edit form/delete/save UI; no stock-item search/autocomplete parity; target schema uses `receiving_ref`/`receiving_location`/`transfer_item_location` instead of upstream `reference`/`receiving_location` (verify final DDL in `11-database.md`).
- **Authoritative obligations:** `03-receivings.md` §10, Phase A–F.

### 7.9 Giftcards, rewards, expenses, cashups, messages

**Binding rules (corrected against `07-ancillary.md`):**
- Giftcards: schema `giftcard_id`, `giftcard_number` (final type per DDL), `value`, `person_id`, `record_time`, `deleted`; number generation/uniqueness; decrement/increment only inside the sale transaction; sale payment prefix is localized `Gift Card:<number>`.
- Rewards: `customers_packages` (`package_id`, `package_name`, `points_percent`, `deleted`, seeded 5 packages), `customers.package_id` + `points`, `sales_reward_points` (`id`, `sale_id`, `earned`, `used`), and the dead `customers_points` table for schema parity. Gate on `customer_reward_enable`. Earn on the **gross paid total** (`total_amount * points_percent / 100`), not net of points used. Redeem only when the customer has a package; decrement atomically with a balance guard; return `INSUFFICIENT_REWARD_POINTS` (-3) and roll back. Do not mutate points at add-payment time or on payment deletion.
- Expenses: `date`, `amount`, `payment_type`, `expense_category_id`, `description`, `employee_id`, `deleted`, `supplier_tax_code`, `tax_amount`, `supplier_id`; employee assignment gated by `employees` grant; search filters include deleted and each payment type; totals/payment summary.
- Expense categories: `category_name`, `category_description`, `deleted`; unique name; no invented `expense_categories` permission.
- Cashups: table `cash_up` with all 15 columns; `note` is boolean; open/close state machine (all-zero closed amounts = pending close); close recomputes `closed_amount_cash = open + transfer + cash payments - cash expenses`, due/card/check from `Summary_payments`, total = `closed_cash - open - transfer + due + card + check`; server ignores submitted total and forces employee ids to the logged-in user; AJAX total; soft delete.
- Dinner tables: CRUD through Config; `Delivery`/`Take Away` ids 1/2 are special and never occupied/released; `get_empty_tables`; status/occupancy rules.
- Messages: upstream `Sms_lib` is a configuration-presence stub (returns true iff username/password/phone/message/originator non-empty; no network call). Keep the contract; a real gateway is an allowed deviation with explicit config. Restore per-person form and `msg_msg` prefill.
- Mailchimp: `Mailchimp_lib` calls and config; customer add/update hooks.
- **Target-specific confirmed defects:** renamed rewards tables + wrong config key (`use_customer_rewards` vs `customer_reward_enable`) + double deduction + wrong earn formula; giftcard payment type mismatch (`giftcard` vs `Gift Card: `) and double decrement; cashup 9/15 columns and dead `calculateTotal`; expense `expense_time`/missing supplier/tax; category column names; dinner `isOccupied` reads suspended sales and `swapTables` corrupts names; SMS Twilio deviation and missing `msg_msg`/per-person form.
- **Authoritative obligations:** `07-ancillary.md` §12, 20 obligations (G-GC/G-RW/G-DT/G-EX/G-EC/G-CU/G-MSG).

### 7.10 Reports

**Binding rules:** reproduce `Reports.php` dispatch and each report class exactly; use `08-reports.md` for the per-report SQL/columns. The report framework must expose:
- key/route, permission, title/subtitle, input schema, columns with sorter/format, `getData`, `getSummaryData`, graphical variant/chart.
- date-range and date-time modes based on `date_or_time_format`.
- sale type semantics (`complete|sales|quotes|work_orders|canceled|returns`).
- location filter and exact joins (location is `sales_items.item_location`, not a `sales.sale_location` column).
- client-side bootstrap-table pagination/sort/search (page size `lines_per_page`), column switching, export (`json/xml/csv/txt/sql/xlsx/pdf`), summary block, detail expansion where upstream provides it.
- giftcard payment aggregation; tax-included split differences between `Summary_report` and `Sale::create_temp_table` (reproduce both).
- empty results and null summary rows.

**Authoritative permission map** (`Reports.php:85-106`): `summary_sales→reports_sales`, `summary_expenses_categories→reports_expenses_categories`, `summary_payments→reports_payments`, `summary_discounts→reports_discounts`, `summary_categories→reports_categories`, `summary_customers→reports_customers`, `summary_items→reports_items`, `summary_suppliers→reports_suppliers`, `summary_employees→reports_employees`, `summary_taxes→reports_taxes`, `summary_sales_taxes→reports_sales_taxes`, `detailed_item_sales/detailed_sales→reports_sales`, `detailed_receivings→reports_receivings`, `inventory_summary/inventory_low→reports_inventory`, `specific_customers→reports_customers`, `specific_employees→reports_employees`, `specific_discounts→reports_discounts`, `specific_suppliers→reports_suppliers`. Upstream has **no** `reports_expenses`, `reports_cashups`, or `reports_giftcards` permission.

**Target-specific confirmed defects:** no input pages; only `{start,end}` filters; four invented reports and three missing/renamed; `summary_taxes` selects non-existent columns; `summary_suppliers` aggregates receivings instead of sales; `specific_*` ignore entity filters; no summary/subtitle; no pagination/search/columns/export/detail; chart metric uses `count` instead of `total`; chart types differ (employees/suppliers should be pie); SQLite-only SQL and `getDbSync()` throws under MySQL; permissions drift; base-grant escalation via `hasModuleGrant`; dead detail-row APIs with wrong URL/payload.

**Authoritative obligations:** `08-reports.md` §12, O-1–O-14.

### 7.11 Receipts, tokens, barcodes, email

**Binding rules:** see `10-receipts-tokens-barcode-email.md` and `01-sales.md` §6:
- Token IDs/classes and rendering; `QCO` not `YQO`; `scan` regex allows any non-space/brace/colon token; zero-pad; replace **every** occurrence; sequence save only when `save=true`; `CU` current customer; `CO` global invoice count; `SCO` suspended **with invoice number**; `YCO`/`QCO` year counts with upstream `start_from` semantics; `$` is literal (default invoice format `$CO` renders literally).
- Barcode tokens `I/P/W`; `parse_barcode` quantity = `W/1000`, price = `P`, item = `I`; iterate all formats, last match wins; default quantity 1.
- Barcode types: the 32-key list in `Barcode_lib::$supported_barcodes`; config values uppercase; `barcode_content` values `id|number`; `number` uses `item_number ?? name`; width factor 2; height config; receipt barcode always C128; sheet layout rows `not_show|name|category|cost_price|unit_price|company_name|item_code`; `character_limiter(...,40)`; page width is a percentage, cellspacing px; font class from filename.
- Strftime map; `%C`, `%c`, `%x`, `%n`, `%t`, `%%` special cases; invalid tokens unchanged.
- Receipt `receipt_default`: description/price/qty/total columns, optional tax indicator; item total = `total` when `receipt_show_total_discount` else `discounted_total`; whole-discount block uses `prediscount_subtotal`; tax block when `receipt_show_taxes`; payments printed **negative** (`amount * -1`); giftcard balance; change/due label logic; return policy; barcode.
- Receipt `receipt_short`: no price/tax-indicator columns; whole-discount block uses `subtotal` (upstream divergence); otherwise same.
- Invoice/tax invoice/quote/work order: column sets, HSN flag, serialized/alt-description sub-rows, whole-discount per-unit column, payment sign (invoice negative; quote/WO positive), giftcard/change blocks, terms/comments, signatures, barcode.
- Email variants (`*_email`): inline CSS, logo data URI/CID, tokens, item table, subtotal/tax/total, payments, giftcard/change, terms, barcode data URI; `invoice_email_message` token rendering.
- `Email_lib`: protocol/mailpath/SMTP host/user/pass/port/timeout/crypto; from config email/company; attachment; logo MIME/base64; log errors.
- `Sms_lib`: configuration-presence stub; `msg_msg` default body; per-person form.
- **Upstream quirks to preserve/decide:** quote/WO payments positive; work-order price suppression; tax-invoice always prints HSN cell; `work_order_email` variable mismatches; `print_silently` apparent inversion; `print_after_sale` autoreturn.
- **Target-specific confirmed defects:** `QCO`→`YQO`; `SCO` counts all suspended; `YCO` +1; `ISEQ` ignores `save=false`; first-occurrence-only replace; no `%` strftime; barcode tokens missing; `parseBarcode` dead; PDF data math ignores discounts/tax/refunds and uses `abs()`; invoice route renders receipt; custom invoice types missing; email passes wrong data shape; no print/email UI.

### 7.12 UI/shared behaviors

**Binding rules:** see `12-ui-views-assets.md`:
- Shared table system: server-side pagination/sort/search (`limit/offset/sort/order`), filter multiselect + URL persistence, date-range presets/time mode, deleted/restore filter, column visibility per employee in localStorage, seven export formats, row selection/delete/restore/highlight, locale strings, empty states.
- Sidebar/menu: grant + `menu_group` (`home|office|both`) + `sort != 0` + sort order; Home/Office are navigation switches; labels via `Module.<id>`; active state exact.
- Topbar: company name, live clock, user/change-password, logout; footer version/commit.
- Notifications/toasts: sanitized (`DOMPurify` equivalent), configured position, success/danger, used on every AJAX mutation.
- Modal CRUD + form validation: required legend, field-level errors, remote uniqueness/numeric checks, upload preview, dynamic row clone/sort, unsaved-changes protection.
- Autocomplete: upstream trigger semantics (`minChars: 0`, dblclick search-all, Enter), keyboard navigation, configurable suggestion columns, multi-pack names, `{value,label}` shape.
- Register shortcuts: ten configurable `key_*` bindings (`ESC`, `ALT+1..9`) with duplicate validation; no F1–F12 model.
- Print: `window.print`/print CSS, print-after-sale, delay/auto-return, printer selection where supported.
- Barcode sheet: HTML/print layout + PDF, consistent width units.
- RTL/responsive/accessibility/dark-mode policy; error/loading/not-found shells; `/no_access/[module]` and `[module]/[submodule]`.
- Asset/licensing: do not copy GPL `elegant-circles` menubar SVGs; use Lucide (ISC) or equivalent.

**Target-specific confirmed defects:** 27 bespoke tables; no shared table/pagination/filter persistence/export/restore; sidebar `sort=0` and hard-coded Office; F1–F12 unused; no toasts/modals/print/validation UX; no i18n provider; no RTL/dark mode; `/no_access/[module]` 404; change-password missing current/min/repeat rules; `public/` assets effectively empty.

**Authoritative obligations:** `12-ui-views-assets.md` §10, O1–O25.

### 7.13 i18n

**Binding rules:** every locale key from `app/Language/<locale>/*.php` (24 English files, ~1,900 keys; 46 upstream locale directories); English fallback; employee language override; date/time/number/currency formatting via ICU/locale; JS lang lines; RTL for `ar-EG`, `ar-LB`, `ckb`, `fa`, `he`, `ur`.
**Target-specific confirmed defects:** `next-intl` is installed but not mounted; `src/messages/en/common.json` is `{}`; every locale except `bn` is `{}`; `bn` has only 57 keys; locale set uses `hr-HR` instead of upstream `hr`; hundreds of hard-coded English strings and 51 ad-hoc `toFixed`/`toLocaleString` sites.
**Authoritative obligations:** `12-ui-views-assets.md` O4/O24 and `09-config-auth-install.md` i18n section.

### 7.14 Security

**Binding rules:** parameterized SQL, CSRF, host allowlist, session regeneration, throttle, upload validation, path traversal, output escaping, secrets encryption, least-privilege permissions, no raw SQL interpolation, no `eval`, no unsafe deserialization. Every fix documented in §11.3.

---

## 8. Data migration and upgrade

### 8.1 Fresh install

1. Create MySQL database `ospos` with `utf8mb4`/`utf8mb4_unicode_520_ci`.
2. Run target migrations in OSPOS order (or import the target’s generated DDL).
3. Seed exact OSPOS defaults: admin `admin`/`pointofsale` (bcrypt hash_version 2), modules, permissions, grants, stock location, config.
4. Create `writable/uploads` equivalents (`public/uploads`, `public/uploads/item_pics`).
5. Set `ALLOWED_HOSTNAMES`, encryption key, timezone, base URL.

### 8.2 Existing OSPOS MySQL → target MySQL

- Use `scripts/import-ospos-mysql.ts` with a read-only source connection or SQL dump.
- Copy tables in FK-safe order; preserve IDs and `AUTO_INCREMENT`.
- Normalize only if target schema intentionally differs (it should not, per ADR-01).
- Verify counts, max IDs, checksums (excluding volatile session rows), and config key sets.
- Re-encrypt secrets: OSPOS CI4 encryption → target AES-GCM; support `CI3SecretConverter` legacy formats.
- Migrate sessions? OSPOS sessions are ephemeral; import optionally, but force re-login.
- Verify a sample of receipts/reports before cutover.

### 8.3 Target SQLite ↔ MySQL

- SQLite is for development/single-store; MySQL for production/import.
- Same logical schema; dialect tests ensure parity.
- Provide `db:export:sqlite`/`db:import:sqlite` for backup/restore.
- Document SQLite limitations (concurrency, collation, no `FOR UPDATE`, no generated columns).

### 8.4 OSPOS upgrade path

- Track upstream migration versions in `migrations` table.
- Target must support importing OSPOS at each supported version (3.3.x, 3.4.0–3.4.3) or explicitly document the supported source versions.
- Add upgrade fixtures: 3.4.2 dump → migrate → compare to 3.4.3 fresh.

---

## 9. Verification strategy

### 9.1 Test pyramid

| Layer | Scope | Tool |
|---|---|---|
| Unit | money, rounding, tax, token, barcode, formatting, CSV parse, permissions | Vitest |
| Repository integration | every query against SQLite + MySQL fixture DB | Vitest + testcontainers/mysql |
| Action/route | inputs, validation, permissions, side effects, JSON shapes | Vitest + Next test harness |
| E2E | every workflow in a browser | Playwright |
| Differential | target vs PHP for scenario matrix | custom runner + Docker |
| Parity static | schema, seeds, config keys, permissions, routes, locale keys | scripts in CI |

### 9.2 Golden fixture DB

Deterministic dataset:
- 1 admin (person 1), 1 non-admin employee with limited grants, 1 employee with location-scoped grants.
- 2 stock locations (`stock`, `store2`), default/sort.
- 4 items: stock, non-stock, serialized, item kit; 1 amount-entry; 1 temp; taxes classic and destination; attributes of each type.
- 2 customers (taxable/exempt, package, tax code, discounts); 2 suppliers.
- All payment types; giftcard; reward points.
- Dinner tables; expenses/categories; cashup.
- Sales: POS cash, invoice, quote, work order, return, suspended, multi-payment, giftcard, rewards, discount percent/fixed, included/excluded tax, compound tax.
- Receivings: receive, return, requisition/transfer.
- Reports: enough rows to exercise grouping/date/location/entity filters.

### 9.3 Differential scenario matrix (minimum)

1. Login success/failure/throttle/password upgrade.
2. RBAC decisions for admin/limited/location-scoped.
3. Item create/edit/delete/restore; CSV import/export; barcode; image.
4. Item search filters/attribute search/sort.
5. Customer/supplier/employee CRUD; customer CSV; privacy delete.
6. Tax classic default 1/2, included, destination city/state, customer code, exemption, cascade, each rounding mode.
7. Sale POS cash/change; multi-payment; cash rounding; giftcard; rewards; percent/fixed discounts; tax included/excluded; destination tax.
8. Invoice/quote/work-order numbering/duplicates.
9. Return entire sale cash/non-cash/giftcard; inventory restore; negative totals.
10. Suspend/resume/cancel/discard; dinner table.
11. Edit sale fields/payments; zero payment deletion; refund conversion.
12. Receiving receive/return/requisition; cost average; receiving_quantity; cancel/delete.
13. Item kit sale/receiving; price options.
14. Attributes on item/sale/receiving; type conversion; CSV.
15. Giftcard/rewards/cashup/expense totals.
16. Every report key: rows/columns/summary/graph data; filters; pagination; details.
17. Config save/effect for every tab; secret encryption.
18. Receipt/invoice/quote/work-order content/flags/email.
19. Tokens/barcodes/strftime.
20. i18n formatting (en, de-DE, ar-EG, bn).
21. Security: CSRF, unauthorized, host, upload, path traversal.

For each: compare normalized DB rows (ordered by PK, dates normalized to UTC/ISO, decimals normalized), JSON responses, HTML text, PDF text, barcode values, and permission decisions.

### 9.4 E2E suites

- Auth/navigation/permissions/no-access.
- Items (CRUD, search, bulk, CSV, images, barcode, inventory, count details).
- Item kits.
- Sales (all modes, payments, returns, suspend, edit, receipts).
- Receivings (all modes, receipts).
- Customers/suppliers/employees (CRUD, CSV, grants).
- Taxes/categories/codes/jurisdictions.
- Attributes.
- Giftcards/rewards/dinner tables/expenses/cashups/messages.
- Reports (all keys, filters, charts, details).
- Config (every tab).
- i18n/RTL.
- Security negative tests.

### 9.5 Manual acceptance scripts

For each module, a scripted click-through with expected DB state and outputs, executed on SQLite and MySQL before release. Store under `docs/acceptance/`.

### 9.6 CI gates

- Typecheck/lint/build.
- Unit + integration (both dialects).
- Playwright.
- Schema/seed/config/permission/locale/route parity.
- Differential suite (nightly/full; smoke subset on PR).
- Security scan (`npm audit`, secret scan, SQL interpolation grep).
- No-stub grep.

### 9.7 Parity command catalogue (to implement in P0)

| Gate | Command / script | Pass condition |
|---|---|---|
| Schema (MySQL) | `scripts/parity/mysql-schema.ts` diffing `information_schema` vs `11-database.md` canonical DDL | zero structural diffs |
| Schema (SQLite) | `scripts/parity/sqlite-schema.ts` diffing `PRAGMA table_info/index_list/foreign_key_list` | zero logical diffs |
| Seeds | `scripts/parity/seed.ts` checksums for `app_config/modules/permissions/grants/stock_locations/dinner_tables/customers_packages` | exact counts/values |
| Config keys | `scripts/parity/config-keys.ts` compares 138-key catalog | no missing/extra keys |
| Permissions | `scripts/parity/permissions.ts` compares 36 permission rows/36 grants/menu groups | exact |
| Routes | `scripts/parity/routes.ts` enumerates upstream public methods and target actions | no unexplained missing |
| Locales | `scripts/parity/locale-keys.ts` compares per-locale key sets against `app/Language` | no missing keys (bn additive) |
| Reports | `scripts/parity/reports.ts` runs every key on both dialects | identical rows/summaries |
| No stubs | `scripts/parity/no-stubs.sh` greps TODO/FIXME/not implemented/placeholder | zero in ported paths |
| SQL safety | `scripts/parity/sql-safety.sh` greps `IN (${...})`, template interpolation | zero |
| Differential | `scripts/parity/differential.ts` runs the §9.3 matrix | zero `DEFECT` |

---

## 10. Traceability matrix

The matrix maps every upstream artifact to target files and tasks. It is maintained as `docs/reconstruction/14-traceability-matrix.md` and validated by a script.

Required columns:
`upstream_file | upstream_symbol | target_file(s) | task_id | test(s) | status | evidence`

Coverage rules:
- Every public controller method (inventory in `analysis-scripts/upstream_api.json`).
- Every public model/library/helper method.
- Every view.
- Every table/column.
- Every config key.
- Every report key.
- Every token/barcode type.
- Every locale.
- Every upstream test.

A task is not complete until its matrix row is `DONE` with a test reference.

---

## 11. Risk register and decisions

### 11.1 Top risks

| Risk | Impact | Mitigation |
|---|---|---|
| Float/rounding drift | Wrong money/tax/reports | ADR-02; PHP-derived fixtures; differential harness |
| Datetime/schema divergence | Import/report failures | ADR-01; schema parity tests; import CLI |
| SQL dialect differences | Reports fail on one dialect | Dual-dialect queries + tests per report |
| Hidden controller behavior | Missed edge cases | Subsystem appendices; differential scenarios |
| Session/cart semantics | Shared carts, lost sales | ADR-03; concurrency tests |
| Receipt/PDF content drift | Legal/receipt mismatch | Golden text snapshots; flag matrix |
| i18n key drift | Untranslated UI | Key parity script; no hard-coded strings |
| Upstream bugs replicated | Data loss/security | §11.3 classification |
| Test flakiness | Slow delivery | Deterministic fixtures, fixed clock/locale |
| Scope creep | Never finishes | Module gates; traceability; “no stubs” |
| Licensing | Asset/legal exposure | Do not copy GPL `elegant-circles` menubar SVGs; use Lucide (ISC); audit all copied assets before release |
| Config drift | Multi-worker stale settings | DB-backed invalidation signal; tests with two workers |
| Upstream defects | Wrong data if “fixed” silently | §11.4 decision table; deviations register |

### 11.2 Open questions

1. Which OSPOS source versions must the importer support? (Recommend 3.4.x; document older.)
2. Is SQLite a first-class production target or dev-only? (Recommend dev/single-store, MySQL production.
   If MySQL is in scope, remove `getDbSync()` from all document/token/barcode/email/Mailchimp paths or
   provide a synchronous MySQL adapter.)
3. Is visual parity required, or only functional? (Plan assumes functional + design-system consistency.)
4. Should the SMS gateway be real? (Upstream is a stub; recommend keep stub + optional adapter.)
5. Should upstream bugs be replicated or fixed? (Default: replicate observable behavior; fix security/data-loss and document.)
6. Mailchimp: reproduce upstream's inert connector or implement the intended sync? (Recommend implement, document DEV.)
7. `print_silently` and `thousands_separator`: preserve the upstream inversions/no-ops or fix them? (Recommend replicate with fixtures unless product asks.)
8. `custom_invoice`/`custom_tax_invoice`: implement or explicitly mark unsupported? (No upstream views ship.)
9. Should the token engine's `Token_customer` email behavior be replicated (`{CU}` empty) or fixed? (Recommend fix + document, because `invoice_email_message` defaults to `Dear {CU}`.)
10. Is per-employee language override required? (Upstream supports it; target i18n only has `en`.)

### 11.3 Approved deviations register

| ID | Upstream behavior | Target behavior | Reason | Evidence |
|---|---|---|---|---|
| DEV-01 | PHP read-modify-write sequence | Atomic DB increment | Concurrency safety; output identical | `Appconfig.php:147-187` |
| DEV-02 | Unsafe raw SQL in places | Parameterized SQL | Security; normal behavior identical | e.g. `Item.php` search |
| DEV-03 | SMS stub | Optional real adapter | Product usefulness; UI/config same | `Sms_lib.php:23-76` |
| DEV-04 | dompdf/picqer rendering | @react-pdf/bwip-js | Stack; content/value parity verified | — |
| DEV-05 | Bootstrap UI | Tailwind/shadcn | Stack; workflow/fields parity verified | — |
| DEV-06 | Path traversal risk in pic-thumb | `path.basename` | Security | `Items.php:159` |

Add rows only with user approval and evidence.

### 11.4 Upstream defects and recommended parity decisions

The appendices found real upstream defects. The default rule is: **replicate observable behavior unless it can corrupt data or expose a vulnerability; if fixed, document it as a deviation.** The following table records the recommended decision per defect; confirm with the user before implementing the “fix” choices.

| ID | Upstream defect | Evidence | Recommended decision |
|---|---|---|---|
| UD-01 | `Tax_lib::round_taxes()` implements `HALF_ODD` as `HALF_UP` and `HALF_FIVE` without a decimals argument | `04-taxes.md` | **Replicate** (financial output parity); document the quirk |
| UD-02 | `Sale::get_number_for_year()` returns the count, not count+1, so `{YCO}/{QCO}` can be one behind | `01-sales.md` | **Replicate**; do not “fix” token numbering |
| UD-03 | `Item::get_generate_barcodes` writes the empty `item_number` back; no auto-numbering exists | `02-items.md` | **Fix** (generate a stable item_number when configured), document DEV |
| UD-04 | Bulk tax update indexes `tax_names` by percent value → silent no-op | `02-items.md` | **Fix** intended behavior, document DEV |
| UD-05 | `Inventory::reset_quantity()` corrects only the first positive location | `02-items.md` | **Fix** all positive locations (data integrity), document DEV |
| UD-06 | `Items::postImportCsvFile` references undefined `$invalidLocations` | `02-items.md` | **Fix** and add a CSV failure test |
| UD-07 | `postRequisitionComplete` passes `discount_type` into the `discount` parameter | `03-receivings.md` | **Replicate** for parity unless it produces wrong totals in the fixture; if fixed, document DEV |
| UD-08 | `postEditItem` discount parsing uses quantity vs decimal parser based on type | `03-receivings.md` | **Replicate** |
| UD-09 | `Sale::save_value` calls `copy_attribute_links` per line, potentially duplicate-inserting | `01-sales.md` | **Replicate** (insert-ignore makes it idempotent); verify |
| UD-10 | `Customer::check_account_number_exists` checks only customers; suppliers may share numbers | `06-people.md` | **Replicate**; verify in report |
| UD-11 | `Sms_lib` performs no network call | `07-ancillary.md` | **Replicate contract**; real gateway is DEV-03 |
| UD-12 | `print_silently` / datepicker locale quirks | `12-ui-views-assets.md` | **Replicate**; do not silently invert |
| UD-13 | `Receiving::save_value` ignores its `$receiving_id` argument | `03-receivings.md` | **Replicate** signature semantics; remove dead argument only if documented |
| UD-14 | `Sale::postSave` does not reverse inventory | `01-sales.md` | **Replicate** (header/payment-only edit) |
| UD-15 | `Inventory::reset_quantity`/delete ledger rule only one location | `02-items.md` | **Fix** (data integrity), document DEV |
| UD-16 | `Item_kit`/`Items` methods call nonexistent model methods (`check_kit_exists`, `get_location_suggestions`) | `02-items.md` | **Fix** or remove dead endpoint; document |
| UD-17 | `Token_customer::get_value()` returns `''` when constructed with customer info, so `Dear {CU}` is empty in emails | `10-…supplement.md` §A.4 | **Decide**: replicate for exact email parity or fix and document; email fixtures must pin it |
| UD-18 | `Token_invoice_count` ignores its constructor value due to a local `$value` bug | `10-…supplement.md` §A.4 | **Replicate** (global count) |
| UD-19 | `parse_barcode` overwrites quantity/price for every configured format, so the last format wins; item id can bleed | `10-…supplement.md` §A.6 | **Replicate** the state machine (fixtures A.6); do not “fix” silently |
| UD-20 | `thousands_separator` is a no-op upstream (`setTextAttribute` ineffective) | `10-…supplement.md` §C.3 | **Replicate** grouping behavior or document a fix |
| UD-21 | Mailchimp connector is inert at runtime due to a constructor `$this->config` bug | `10-…supplement.md` §H.1 | **Decide**: reproduce inertness or implement intended sync; document |
| UD-22 | CSV item template has a BOM, mixed quoting, no trailing newline; target import does not strip BOM | `10-…supplement.md` §J | **Fix target BOM handling**; match template bytes exactly |

---

## 12. Execution rules for implementation agents

1. **One task, one branch/PR.** Reference the task ID in the title. Do not mix modules.
2. **Read the upstream evidence first.** Quote file:line in the PR description for each behavior implemented.
3. **Write tests first or alongside.** Unit + integration + e2e as applicable. A task with no test is rejected.
4. **No stubs.** No `TODO`, `FIXME`, `throw new Error("not implemented")`, empty handlers, placeholder data, or hard-coded English in a ported path.
5. **No silent deviations.** If PHP behavior is unsafe or ambiguous, stop and record it in §11.3/open questions.
6. **Schema changes:** update both SQLite and MySQL schema, regenerate migrations, update seed, run schema parity.
7. **Money:** use `src/lib/money` only. Never `Number` arithmetic for money/tax/quantities.
8. **Dates:** use `src/lib/datetime`; DB strings `YYYY-MM-DD HH:MM:SS`; no epoch integers.
9. **Permissions:** every action/route calls `requirePermission` with exact module/submodule. Add negative tests.
10. **SQL:** parameterized only. No string interpolation of IDs.
11. **UI strings:** use i18n keys; add missing keys to all locales only after the English key exists.
12. **Receipts/reports:** add a golden fixture for every new output path.
13. **Update traceability:** mark task/row `DONE` with test references.
14. **Run the gates:** typecheck, lint, unit, e2e, parity, no-stub grep before requesting review.
15. **Definition of done:** acceptance criteria met, tests pass on SQLite+MySQL, no regressions, docs updated.

---

## 13. Appendices

- A. Database catalog → `11-database.md`
- B. Config key catalog → `09-config-auth-install.md` + `11-database.md`
- C. Permission/module/seed catalog → `11-database.md` + `06-people.md`
- D. Route/action catalog → `00-target-inventory.md` + module appendices
- E. Report catalog → `08-reports.md`
- F. Token/barcode/format catalog → `10-receipts-tokens-barcode-email.md` + `10-receipts-tokens-barcode-email.supplement.md`
- G. Locale catalog → `09-config-auth-install.md`
- H. Upstream defects/quirks → module appendices + §11.3/§11.4
- I. Constants/glossary → `01-sales.md`, `02-items.md`, `04-taxes.md`
- J. File-level traceability → `14-traceability-matrix.md`
- K. Dispatcher checklist → `TASKS.md`

---

*End of master plan. Subsystem appendices are normative extensions of this document.*
