# Implementation progress ledger

Live state of the reconstruction. One row per phase; obligation detail lives in
`docs/reconstruction/tasks/` and `TASKS.md`.

| Phase | Branch | Status | Gate evidence | Notes |
|---|---|---|---|---|
| P0 Baseline & guardrails | `port/p0-baseline` | DONE | typecheck/lint/build/unit green; Oracle image builds and OSPOS 3.4.3 boots on :8088 | baseline doc, harness, CI, progress log |
| P1 Data foundation | `port/p1-data` | DONE | schema/seed/config parity PASS on SQLite, MySQL and the PHP oracle; import/export round-trip 39 tables verified | 39-table dual-dialect schema, exact seeds, datetime lib |
| P2 Core runtime | `port/p2-core` | DONE | money/datetime/RBAC/token/barcode/encryption unit tests green | CI4-compatible cipher verified against PHP |
| P3 Master data | `port/p3-master` | PARTIAL | tax fixtures 18/18; RBAC 7/7 | tax engine, tax/attribute/people repositories ported |
| P4 Items & inventory | `port/p4-items` | PARTIAL | item cost-average tests 3/3 | search/save/delete/CSV/cost/inventory; search filters partial |
| P5 Sales | `port/p5-sales` | PARTIAL | sale calculator/payment tests 17/17 | cart/save/returns/suspend/edit/actions/UI; O15/O16 refinement pending |
| P6 Receivings | `port/p6-receivings` | PARTIAL | lib/model/UI ported | cost-before-quantity, requisition bug replicated |
| P7 Ancillary | `port/p7-ancillary` | PARTIAL | repositories ported | SMS restored to upstream config-presence stub |
| P8 Reports | `port/p8-reports` | PARTIAL | every report key executes on SQLite and MySQL; exact row/summary diffs not yet run | 20 upstream reports + graphical twins, filters, summary blocks |
| P9 Config & shell | `port/p9-config` | PARTIAL | 138-key tab UI, label resolution, secret masking, batch saves | child managers/visibility/side-effect refinement pending |
| P10 Documents | `port/p10-documents` | PARTIAL | receipt data builder is decimal-only and carries employee/invoice/line/tax/payment fields plus the `receipt_*` flag matrix; HTML receipt honors company/description/serial/tax-ind/total-discount flags with localized labels; 4 fixture tests | `receipt_short`/invoice template variants and email HTML parity pending |
| P11 i18n | `port/p11-i18n` | PARTIAL | 46 locales × 24 files; 72,680 keys parity PASS; shell labels localized | bn pack and hard-coded UI string sweep pending |
| P12 Hardening | `port/p12-hardening` | PARTIAL | no-stubs + sql-safety PASS; throttle rewritten to the upstream filter contract (11 unit tests); `/api/migrate` re-checks credentials, throttles and locks; mutating route handlers validate Origin/Referer (6 unit tests); login localized | session-lifecycle audit pending |
| P13 Differential closure | `port/p13-differential` | PARTIAL | Oracle DB differential: config 138 keys PASS, seed (18/36/35/5/2/1) PASS, schema 39 tables/286 cols PASS; MySQL integration suite 29/29 on config/sequence, sale, items, receiving, reports, all ancillary repositories | scenario matrix and row/output diffs pending |

## Gate evidence — 2026-11-08 session

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 32 warnings |
| `npm test` | 100/100 (SQLite) |
| `npm run test:mysql` | 29/29 against MySQL 8.4 (3307) |
| `npm run build` | compiled successfully |
| `npm run test:e2e` | 72/72 |
| `npm run parity` (SQLite) | schema 38 tables/286 cols, config 138, seed 18/36/36/5/2/1, locales 46×1104×72680, reports 31, no-stubs, SQL safety |
| `npm run parity` (MySQL) | schema 39 tables/286 cols, config 138, seed 18/36/36/5/2/1, locales, reports 31, no-stubs, SQL safety |

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-11-08 | Use `ospos_*` physical table names in both MySQL and SQLite | Keeps dual-dialect SQL and OSPOS dumps identical; SQLite is the dev mirror |
| 2026-11-08 | Store money/quantities as decimal strings at the repository boundary | SQLite has no DECIMAL; Drizzle `numeric` maps to text and preserves scale |
| 2026-11-08 | Timestamps are `YYYY-MM-DD HH:MM:SS` text in both dialects | Upstream SQL datetime parity; report `strftime`/`DATE_FORMAT` portability |
| 2026-11-08 | MySQL tables are typed with the shared SQLite Drizzle table objects | Drizzle's union database type is not callable; MySQL builders accept the same table metadata. Single documented cast in `src/lib/db/index.ts` |
| 2026-11-08 | `Tax_lib::round_taxes` ROUND_UP/DOWN use `10^(decimals-1)` | Upstream `str_pad('1',$decimals,'0')`; appendix only documented HALF_ODD/HALF_FIVE |
| 2026-11-08 | Token barcode fixtures 1 and 5 follow the regex state machine, not the supplement's stated values | The supplement inputs capture "009"/"0012"; the PHP code re-feeds the shortened item and the final `{W:5}` cannot match |
| 2026-11-08 | `change_cost_price` rounds the bcmath-truncated average to the DECIMAL(15,2) column | SQLite stores numeric text without scale; repository reads canonicalize to 2 dp |
| 2026-11-08 | `deleteOrphanedValues()` deletes values referenced by no link | Upstream implementation; the first pass deleted DROPDOWN option rows instead |
| 2026-11-08 | SMS is the upstream configuration-presence stub | `Sms_lib::sendSMS` performs no network call; real gateway is DEV-03 |
| 2026-11-08 | `ALLOWED_HOSTNAMES` boot check is skipped during `next build` page-data collection | Build-time import is not a production boot; runtime proxy still enforces the allowlist |
| 2026-11-08 | Seed grants `taxes` to admin (36 grants) as an approved deviation | The oracle has 35 because upstream never inserts the taxes grant; the plan/user require 36 and the module is otherwise unreachable |
| 2026-11-08 | MySQL comment columns are `mediumtext`, not `text` | `CONVERT TO CHARACTER SET utf8mb4` upgrades TEXT to MEDIUMTEXT; verified with the oracle's `SHOW CREATE TABLE` |
| 2026-11-08 | `invoice_email_message` default is the bare token string | Oracle value confirms the appendix catalog's trailing annotation was not part of the value |
| 2026-11-08 | E2E logs in per test instead of reusing a stored cookie | OSPOS carts are session-scoped; reusing a JWT shared one cart across tests |
| 2026-11-08 | Report SQL uses explicit aliases; upstream report models fail against a prefixed table (UD-23) | Executing `Summary_sales::getData()` on the oracle returns “Unknown column 'ospos_sales_items.sale_id' in 'on clause'”; a CI4 builder defect, documented as a deviation |
| 2026-11-08 | MySQL sequence acquisition uses a `SELECT … FOR UPDATE` transaction, not `UPDATE … RETURNING` | Plan gotcha #3 assumes MySQL supports `RETURNING`; MySQL 8 does not (only MariaDB). Row locking gives the same observable atomic increment (DEV-01) |
| 2026-11-08 | Cross-dialect upsert/ignore/insert helpers live in `src/lib/db/insert.ts` | Drizzle exposes `onConflictDoUpdate`/`onConflictDoNothing` for SQLite and `onDuplicateKeyUpdate` for MySQL; three SQLite-only calls failed at runtime under `DB_DRIVER=mysql` |
| 2026-11-08 | Raw inventory/cleanup writes go through `affectedRows()` | `tx.run()` exists only on the better-sqlite3 handle; Drizzle's MySQL handle requires `execute()` |
| 2026-11-08 | Throttle falls back to `AUTH_SECRET` when `THROTTLE_KEY` is unset | Upstream provisions `throttle.key` into a writable `.env`; the target has no writable `.env` contract. Capacity/window/env semantics match `App\Filters\Throttle` |
| 2026-11-08 | E2E seeds the database in the Playwright web-server command, not `globalSetup` | Playwright starts the web server before `globalSetup`; unlinking the SQLite file raced the open handle and left the server on an empty inode |
| 2026-11-08 | `/api/migrate` requires credentials when employees exist and uses a `.migration.lock` file | Mirrors `Login::migrate`'s `login_check` gate and `MY_Migration::runLocked()`; CSRF exemption matches upstream `Filters.php` |

## Open follow-ups

- P8 reports: exact row/summary/chart values against upstream fixtures (execution and permissions are verified; the PHP report models run under CI CLI once fixture rows exist).
- P9 config: remaining child-table managers and visibility side effects; the 138-key tab surface and secret masking are covered.
- P10 documents: `receipt_short` and the `invoice_type` template variants, PDF content parity, and email HTML parity. The default receipt flag matrix is implemented.
- P11: client components (item-kit options, report filters, location selectors) still carry hard-coded English; server components use `lang()`. `bn` remains the additive locale (common.json only).
- P12: CSRF token/session audit for server actions and route handlers.
- P13: scenario-level differential harness (DB rows + report output) against the Dockerized PHP oracle; schema/seed/config and PHP-CLI model execution are wired.
- MySQL integration coverage is enforced by `npm run test:mysql` and the `integration-mysql` CI job.

## Blockers

None.
