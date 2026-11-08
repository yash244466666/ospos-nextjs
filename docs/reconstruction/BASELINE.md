# Pinned baseline

| Item | Value |
|---|---|
| Upstream repository | `https://github.com/opensourcepos/opensourcepos` |
| Upstream local reference | `/home/yash/ospos` (READ-ONLY; never modified) |
| Pinned commit | `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea` |
| Version | post-3.4.3 / `3.4.4-dev` |
| PHP / framework | PHP 8.2+ / CodeIgniter 4.7.4 |
| Upstream DB | MySQL 8.x, prefix `ospos_`, `utf8mb4_unicode_520_ci` |
| Plan | `docs/reconstruction/OSPOS_100_PERCENT_IMPLEMENTATION_PLAN.md` |
| Target baseline branch | `port/p0-baseline` off `main` @ `b8fb905` |

## Verification

```bash
cd /home/yash/ospos
git log -1 --format='%H'
# 603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea
```

## Baseline facts used by the parity gates

| Fact | Count |
|---|---|
| Final MySQL tables | 39 |
| Upstream migrations | 47 |
| `ospos_app_config` rows | 138 |
| `ospos_modules` rows | 18 |
| `ospos_permissions` rows | 36 |
| `ospos_grants` rows (`person_id=1`) | 36 |
| `ospos_stock_locations` rows | 1 |
| `ospos_dinner_tables` rows | 2 |
| `ospos_customers_packages` rows | 5 |
| Locale directories | 47 (46 translations + `en`; `bn` is a target addition) |

The canonical DDL, seed rows, and config catalog are reproduced in
`docs/reconstruction/11-database.md` §1.2, §3, and §4. That appendix is normative;
where it disagrees with any other document, it and the PHP source win.

## Rules

- `/home/yash/ospos` is evidence only. Never write to it.
- Any upstream behavior may be replicated exactly. Deviations are listed in the master
  plan §11.3 and must cite the upstream `file:line`.
- The old `OSPOS_NEXTJS_GAP_ANALYSIS.md` is archived and not authoritative.
