# OSPOS Reconstruction Evidence Bundle

This directory contains the complete source-parity analysis of OSPOS 3.4.3 (pinned commit
`603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`) and the implementation plan for the Next.js
target in this repository.

**Start here:** [`OSPOS_100_PERCENT_IMPLEMENTATION_PLAN.md`](./OSPOS_100_PERCENT_IMPLEMENTATION_PLAN.md)
**Dispatcher index:** [`TASKS.md`](./TASKS.md) — every phase task and module obligation in one checklist.

The master plan contains the definition of 100%, architecture decisions, phase/task
breakdown, module contracts, migration strategy, verification harness, risk register, and
execution rules. The numbered reports below are normative appendices: each one reconstructs
one subsystem from the PHP source with `path:line` citations and lists implementation
obligations with acceptance tests.

---

## Evidence files

| File | Scope | Status |
|---|---|---|
| `00-target-inventory.md` | Target repo map, 54 page routes, 22 API routes, ~200 actions, module status matrix, stubs, tests, i18n | Complete |
| `01-sales.md` | `Sale_lib` (101 methods), `Sale` model, `Sales` controller, register/payments/returns/suspend/edit, totals, documents, 20 obligations O1–O20 | Complete |
| `02-items.md` | Items controller/model, search, save, delete, bulk, inventory, CSV, images, barcodes, kits, 25 obligations OBL-01–OBL-25 | Complete |
| `03-receivings.md` | `Receiving_lib` (32 methods), `Receiving` model, controller, receive/return/requisition, cost math, phases A–F | Complete |
| `04-taxes.md` | `Tax_lib`, classic/destination tax, rounding modes, tax CRUD, schema, 26 fixtures, 15 obligations | Complete |
| `05-attributes.md` | Attribute EAV, definitions/values/links, conversion/cleanup, CSV, 12 obligations | Complete |
| `06-people.md` | Person/customer/supplier/employee, RBAC, login, menus, stock locations, 19 obligations O-01–O-19 | Complete |
| `07-ancillary.md` | Giftcards, rewards/packages/points, dinner tables, expenses, cashups, messages, 20 obligations + 74 gap IDs | Complete |
| `08-reports.md` | Reports framework, 20 report classes, all routes/filters/columns/charts, 30 gaps, O-1–O-14 | Complete |
| `09-config-auth-install.md` | 138 config keys, tabs/save behavior, auth/security, migrations/sessions, i18n, obligations S-1…S-6 / A-1…A-7 / C-1…C-10 / I-1…I-6 | Complete |
| `10-receipts-tokens-barcode-email.md` + `.supplement.md` | Tokens, barcodes, receipt/invoice/quote/work-order templates, email/SMS/Mailchimp, helpers; the supplement has exact fixtures, ICU outputs, cipher contracts | Complete |
| `11-database.md` | Final 39-table DDL, 47-migration chain, 138 config rows, 18 modules/36 permissions/36 grants, target diff D1–D14, ETL strategy | Complete |
| `12-ui-views-assets.md` | Shell, shared tables, suggestions, shortcuts, forms, print, assets, i18n/RTL, 48 gaps, O1–O25 | Complete |
| `13-version-delta.md` | Every functional delta from 3.4.2 to the pinned post-3.4.3 commit | Complete |
| `14-traceability-matrix.md` | Every upstream PHP file mapped to its evidence appendix | Complete |

If a section is marked incomplete in a file, treat that part as `UNKNOWN` and re-run the
analysis; do not implement from a guess.

---

## How implementation agents should use this bundle

1. Read the master plan §0–§6 (definition, architecture, phases, gates).
2. Read your module appendix in full. Do not rely on the summary in the master plan.
3. Pick one obligation from the appendix (e.g. `01-sales.md` O1, `02-items.md` OBL-03).
4. Implement it against the upstream source it cites; write the acceptance tests it names.
5. Update the traceability row and gap ledger.
6. Run the gates: typecheck, lint, unit, e2e, schema/seed/config/permission/locale/route
   parity, no-stub grep.
7. Only then request review.

---

## Non-negotiables

- The PHP source is authoritative. Never modify `/home/yash/ospos`.
- Money/tax/quantity math uses decimal arithmetic, never JS floats.
- Database timestamps are SQL `datetime` strings, never epoch integers.
- Every action/route enforces the same module/submodule permission as upstream.
- No stubs, no placeholder data, no hard-coded user-visible English.
- Every ported behavior has a test; every output path has a golden fixture.
- Upstream quirks are replicated unless they are security/data-loss defects; any fix is
  recorded in the master plan §11.3/§11.4.

---

## Baseline verification

```bash
cd /home/yash/ospos
git log -1 --format='%H %ad %s'
# expected: 603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea ...

cd /home/yash/Desktop/yash/ospos-nextjs
wc -l docs/reconstruction/*.md
```

The plan's §9 describes the differential harness: run the same scenario against a
Dockerized OSPOS 3.4.3 + MySQL 8.4 fixture app and this target, then compare normalized DB
rows, JSON, receipt/report text, token/barcode values, and permission decisions.
