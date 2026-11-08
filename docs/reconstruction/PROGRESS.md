# Implementation progress ledger

Live state of the reconstruction. One row per phase; obligation detail lives in
`docs/reconstruction/tasks/` and `TASKS.md`.

| Phase | Branch | Status | Gate evidence | Notes |
|---|---|---|---|---|
| P0 Baseline & guardrails | `port/p0-baseline` | DONE | typecheck/lint/build/unit green; parity scripts run | baseline doc, harness skeleton, CI, progress log |
| P1 Data foundation | `port/p1-data` | DONE | SQLite & MySQL schema parity PASS (39 tables / 286 cols); seed+config parity PASS both dialects; import/export round-trip 39 tables verified | 39-table dual-dialect schema, exact seeds, datetime lib |
| P2 Core runtime | `port/p2-core` | DONE | money/datetime/RBAC/token/barcode/encryption unit tests green | CI4-compatible cipher verified against PHP |
| P3 Master data | `port/p3-master` | PARTIAL | tax fixtures 18/18; RBAC 7/7 | tax engine, tax/attribute/people repositories ported |
| P4 Items & inventory | `port/p4-items` | PARTIAL | item cost-average tests 3/3 | search/save/delete/CSV/cost/inventory; search filters partial |
| P5 Sales | `port/p5-sales` | PARTIAL | sale calculator/payment tests 17/17 | cart/save/returns/suspend/edit/actions/UI; O15/O16 refinement pending |
| P6 Receivings | `port/p6-receivings` | PARTIAL | lib/model/UI ported | cost-before-quantity, requisition bug replicated |
| P7 Ancillary | `port/p7-ancillary` | PARTIAL | repositories ported | SMS restored to upstream config-presence stub |
| P8 Reports | `port/p8-reports` | NOT STARTED | — | registry still SQLite-only subset |
| P9 Config & shell | `port/p9-config` | PARTIAL | existing tabs compile | 138-key tab spec/UI pending |
| P10 Documents | `port/p10-documents` | PARTIAL | PDF routes compile | data builder still pre-parity (see follow-ups) |
| P11 i18n | `port/p11-i18n` | PARTIAL | 46 locales × 24 files; 72,680 keys parity PASS | bn additive pack pending |
| P12 Hardening | `port/p12-hardening` | PARTIAL | no-stubs + sql-safety PASS | host/CSRF/throttle audits pending |
| P13 Differential closure | `port/p13-differential` | NOT STARTED | — | harness skeleton only |

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

## Open follow-ups

- P8 reports: every report key/filter/column/summary/chart, dual dialect.
- P9 config: full 138-key field spec, tab set, secret masking, child-table editors.
- P10 documents: data builder must carry discounts/taxes/flags, print/email variants.
- P11: `bn` locale pack; replace remaining hard-coded UI strings.
- P12: CSRF token for server actions/route handlers, login throttle, session audit.
- P13: differential harness against the Dockerized PHP oracle.

## Blockers

None.
