# Implementation task backlog (index)

This is the consolidated index of every phase task and module obligation. The authoritative
contract for each item is its appendix section; this file exists so a dispatcher can assign
work without reading 23,000 lines first.

## Phase-level tasks (master plan §6)

- [ ] P0-T01…T08 — baseline, evidence index, harness, CI, agent rules.
- [ ] P1-T01…T11 — final schema, dual-dialect Drizzle, datetime, seeds, parity tests, import/export, migration runner, fixtures.
- [ ] P2-T01…T22 — money, datetime, config cache, sessions/cart, RBAC, permissions, tokens, strftime, barcodes, CSRF, host, throttle, encryption, i18n, no-stubs, MySQL async.
- [ ] P3-T01…T17 — people/customers/suppliers/employees, stock locations, taxes, attributes, dinner tables, E2E.
- [ ] P4-T01…T16 — item search/save/delete/bulk/CSV/images/count/kits/barcodes/suggestions/taxes/quantities/cost/types/E2E.
- [ ] P5-T01…T18 — Sale_lib, cart, totals, payments, tax, discounts, modes, save, returns, validation, numbering, suspend, manage, edit, documents, E2E, fixtures.
- [ ] P6-T01…T10 — Receiving_lib, modes, save, requisition, cancel, manage, receipt parsing, suggestions, E2E.
- [ ] P7-T01…T10 — giftcards, rewards, expenses, categories, cashups, dinner, messages, Mailchimp, E2E.
- [ ] P8-T01…T11 — report framework, dialect SQL, all report families, charts, inputs, detail rows, fixtures, E2E.
- [ ] P9-T01…T10 — config field spec/UI/saves/uploads/child tables/shortcuts/shell/dashboard/no-access/E2E.
- [ ] P10-T01…T09 — receipt/invoice/quote/WO data + templates, flags, email, print, barcode sheet, PDF, email/SMS/Mailchimp, E2E.
- [ ] P11-T01…T06 — all locale files, hard-coded strings, formatting, RTL, accessibility, key gate.
- [ ] P12-T01…T07 — SQLi, upload/traversal, CSRF/host/session, authorization, performance, deployment, observability.
- [ ] P13-T01…T07 — differential matrix, classify/fix diffs, parity re-run, manual acceptance, traceability, sign-off.

## Module obligations (authoritative appendices)

### Sales — `01-sales.md` §9
- [ ] O1 sales schema parity (blocking)
- [ ] O2 cart/session contract
- [ ] O3 calculator parity (fixtures F1–F10)
- [ ] O4 payment model/register actions
- [ ] O5 giftcard/reward balance at save
- [ ] O6 add_item parity
- [ ] O7 edit/delete/remove-customer
- [ ] O8 return/copy flows
- [ ] O9 save_value transaction
- [ ] O10 cancel/delete/restore
- [ ] O11 suspended flows
- [ ] O12 completion validation/mode/numbering
- [ ] O13 cash rounding
- [ ] O14 token rendering
- [ ] O15 document data/templates/print/email
- [ ] O16 manage/search/payment summary
- [ ] O17 edit-sale modal/save
- [ ] O18 config flags/register modes/localization
- [ ] O19 authorization hardening
- [ ] O20 tests/CI

### Items — `02-items.md` §10
- [ ] OBL-01 search contract
- [ ] OBL-02 identity resolution
- [ ] OBL-03 save pipeline
- [ ] OBL-04 delete/restore
- [ ] OBL-05 bulk edit
- [ ] OBL-06 weighted-average cost
- [ ] OBL-07 inventory adjustments/history
- [ ] OBL-08 CSV template/parser
- [ ] OBL-09 CSV import pipeline
- [ ] OBL-10 image upload/serve/remove
- [ ] OBL-11 barcode value/types/generate-if-empty
- [ ] OBL-12 barcode sheet layout
- [ ] OBL-13 item form parity
- [ ] OBL-14 delete-ledger decision
- [ ] OBL-15 atomic quantity helper
- [ ] OBL-16 item kits link/totals/options
- [ ] OBL-17 kit sales pricing
- [ ] OBL-18 permissions
- [ ] OBL-19 config keys/defaults
- [ ] OBL-20 schema integrity
- [ ] OBL-21 count details/inventory history
- [ ] OBL-22 suggestions API
- [ ] OBL-23 CSV export (extension; upstream template only)
- [ ] OBL-24 regression tests
- [ ] OBL-25 data contracts

### Receivings — `03-receivings.md` §10
- [ ] Phase A data contract (blocking)
- [ ] Phase B cart library
- [ ] Phase C persistence
- [ ] Phase D UI
- [ ] Phase E authorization/validation
- [ ] Phase F tests

### Taxes — `04-taxes.md` §11
- [ ] 15 ordered obligations (schema, Tax_lib classic/destination, rounding, CRUD, reports, fixtures F1–F26).

### Attributes — `05-attributes.md` §10
- [ ] 12 ordered obligations (definitions, conversion, values/links, checkbox, CSV, constraints, UI, tests).

### People — `06-people.md` §10
- [ ] O-01 grants identity
- [ ] O-02 RBAC primitives
- [ ] O-03 requirePermission
- [ ] O-04 allowed modules/menus
- [ ] O-05 employee model
- [ ] O-06 employee controller policy
- [ ] O-07 employee form
- [ ] O-08 customer model
- [ ] O-09 customer CSV
- [ ] O-10 Mailchimp
- [ ] O-11 customer/supplier forms/lists
- [ ] O-12 auth flow
- [ ] O-13 home/office dashboards
- [ ] O-14 change password
- [ ] O-15 rewards package link
- [ ] O-16 i18n/language fields
- [ ] O-17 no_access
- [ ] O-18 people seed
- [ ] O-19 tests

### Ancillary — `07-ancillary.md` §12
- [ ] 20 ordered obligations across giftcards, rewards/packages/points, dinner tables, expenses, expense categories, cashups, messages/SMS; gap IDs G-GC/G-RW/G-DT/G-EX/G-EC/G-CU/G-MSG.

### Reports — `08-reports.md` §12
- [ ] O-1 permission map/seed
- [ ] O-2 filter model
- [ ] O-3 column schema
- [ ] O-4 formatting layer
- [ ] O-5 SQL fragments/driver abstraction
- [ ] O-6 report engine
- [ ] O-7 eleven summary reports
- [ ] O-8 inventory/detailed/specific reports
- [ ] O-9 input pages
- [ ] O-10 report APIs
- [ ] O-11 components
- [ ] O-12 index/tests
- [ ] O-13 no-cache/dynamic
- [ ] O-14 MySQL readiness

### Config/auth/install/i18n — `09-config-auth-install.md` §7
- [ ] S-1 migration table/runner
- [ ] S-2 migration lock/endpoint auth
- [ ] S-3 session store
- [ ] S-4 encryption compatibility/lifecycle
- [ ] S-5 key/throttle provisioning
- [ ] S-6 install/upgrade flow
- [ ] A-1 hasGrant/requirePermission
- [ ] A-2 menu queries/seeds
- [ ] A-3 login parity
- [ ] A-4 password policy/flags
- [ ] A-5 host/CSRF/headers
- [ ] A-6 throttle
- [ ] A-7 login states/employee language
- [ ] C-1 config schema/defaults/seed
- [ ] C-2 cache/invalidation
- [ ] C-3 complete UI surface
- [ ] C-4 save validation/atomicity
- [ ] C-5 encrypted-secret UI
- [ ] C-6 child-table editors
- [ ] C-7 side effects/visibility
- [ ] C-8 upload rules
- [ ] C-9 sequence acquisition
- [ ] C-10 config tests
- [ ] I-1 locale inventory
- [ ] I-2 resolution/fallback
- [ ] I-3 employee language
- [ ] I-4 date/number/currency helpers
- [ ] I-5 JS lang lines/RTL
- [ ] I-6 i18n tests

### Documents/tokens/barcodes/email — `10-receipts-tokens-barcode-email.md` §7 + supplement §M
- [ ] T-01 token engine
- [ ] T-02 barcode library
- [ ] T-03 receipt builders
- [ ] T-04 invoice/quote/WO builders
- [ ] T-05 email variants
- [ ] T-06 print pipeline
- [ ] T-07 email/SMS/Mailchimp
- [ ] T-08 formatting helpers
- [ ] T-09 import/security helpers
- [ ] O-D1 date directives
- [ ] O-D2 PHP-date formatting
- [ ] O-F1 locale money/quantity
- [ ] O-T1 token/parse parity additions
- [ ] O-B1 barcode parity
- [ ] O-DOC1 document data builder
- [ ] O-DOC2 template set
- [ ] O-DOC3 pages/routes
- [ ] O-E1 email parity
- [ ] O-S1 encryption interop
- [ ] O-C1 CSV parity
- [ ] O-H1 helpers
- [ ] O-L1 localization
- [ ] O-M1 DB portability
- [ ] O-P1 authorization
- [ ] O-CFG1 config tabs

### Database — `11-database.md` §7–§9
- [ ] 39-table canonical DDL, 47-migration trace, 138 config rows, 18 modules/36 permissions/36 grants, 5 packages, 2 dinner tables.
- [ ] Dual-dialect generation, ETL order, ID/sequence preservation, session/charset/SQLite guidance.
- [ ] MySQL/SQLite structural diff, seed checksums, semantic assertions, migration-ledger assertion.

### Shared UI — `12-ui-views-assets.md` §10
- [ ] O1 sidebar/menu generation
- [ ] O2 topbar identity/clock/footer
- [ ] O3 permission shells
- [ ] O4 i18n wiring
- [ ] O5 notifications
- [ ] O6 CSRF/fetch/401
- [ ] O7 shared table
- [ ] O8 date/filter/persistence
- [ ] O9 selection/delete/restore/columns/export
- [ ] O10 modal/validation
- [ ] O11 autocomplete
- [ ] O12 suggestion endpoints
- [ ] O13 shortcuts
- [ ] O14 register shell
- [ ] O15 cart/payment UX
- [ ] O16 form UX
- [ ] O17 print
- [ ] O18 receipt/invoice/email UI
- [ ] O19 barcode sheet
- [ ] O20 accessibility
- [ ] O21 responsive
- [ ] O22 theme/dark/RTL
- [ ] O23 constants/data contracts
- [ ] O24 formatting utilities
- [ ] O25 shared-UX Playwright suite

### Version delta — `13-version-delta.md`
- [ ] Every 3.4.3 and post-3.4.3 delta catalogued with target status and obligation; treat as mandatory work alongside the module lists.

---

Use the appendix section for each item's exact files, behavior contract, and acceptance tests.
