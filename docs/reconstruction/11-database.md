# 11 — Database: upstream final schema, seed data, and target parity audit

Analysis agent L. Read-only analysis of both trees; no source file and no database
was modified. One deliverable only: this report.

- UPSTREAM (source of truth): `/home/yash/ospos` — OSPOS 3.4.3, commit
  `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`.
- TARGET: `/home/yash/Desktop/yash/ospos-nextjs` — Next.js 16 + Drizzle ORM,
  SQLite primary and MySQL mirror.

All citations are `path:line`. Upstream paths are absolute under `/home/yash/ospos`;
target paths are absolute under `/home/yash/Desktop/yash/ospos-nextjs`. The SQLite
files inspected read-only are `/home/yash/Desktop/yash/ospos-nextjs/sqlite.db` and
`/home/yash/Desktop/yash/ospos-nextjs/ospos.db`.

The upstream schema was reconstructed **statically**, in migration timestamp order,
by tracing every `CREATE TABLE`, `ALTER TABLE`, `INSERT`, `UPDATE`, `RENAME TABLE`
and `DROP TABLE` in the 47 PHP migration files and the SQL scripts they execute. No
migration was run against a database. Where a migration is programmatic (CodeIgniter
Forge, information_schema introspection, data rewriting), its effect was translated
to final DDL. The final table list is independently confirmed by the last migration
script, which converts exactly 39 tables to utf8mb4
(`app/Database/Migrations/sqlscripts/3.4.3_mysql84_utf8mb4_conversion.sql:3-41`).

---

## 0. Executive summary

The upstream final schema is **39 tables**, all InnoDB and all finally
`utf8mb4_unicode_520_ci`, built from a 3.0.2 baseline plus 47 migrations, 28 of
which execute SQL files. The target implements a **different, reduced logical
model** (40 tables in `sqlite.db` including Drizzle's bookkeeping table): it drops
three upstream business tables outright, renames `cash_up`→`cashups` and
`tax_rates`→`tax_code_links` with different shapes, drops the primary keys of
several line/payment tables, replaces SQL `timestamp` columns with epoch integers,
uses `real`/`decimal(15,4)` where upstream uses `decimal(15,2)`/`decimal(15,3)`,
and seeds modules/permissions with human-readable labels and all-`both` menu
groups instead of the upstream language keys and `home`/`office`/`--` matrix.

The highest-severity facts:

| # | Finding | Upstream evidence | Target evidence |
|---|---------|-------------------|-----------------|
| D1 | Three business tables absent: `customers_packages`, `customers_points`, `sales_reward_points` | `3.0.2_to_3.1.1.sql:79-117`, `:283-297`; `3.4.3_mysql84_utf8mb4_conversion.sql:9,11,33` | no definitions in `src/db/schema/*.ts` or `src/db/schema/mysql/index.ts` |
| D2 | `cash_up` reduced to `cashups`: 7 upstream columns missing (`closed_amount_card`, `closed_amount_check`, `closed_amount_total`, `description`, `open_employee_id`, `close_employee_id`, `closed_amount_due`), `employee_id` invented, `note` retyped tinyint→text | `3.2.1_to_3.3.0.sql:63-92,102-103`; `20230307000000_int_to_tinyint.php:16` | `src/db/schema/cashups.ts:4-14`; `src/db/schema/mysql/index.ts:386-396` |
| D3 | Primary keys lost in **both** dialects on `sales_items_taxes`, `sales_payments`, `items_taxes`, `sales_taxes`, and additionally in **SQLite only** on `sales_items`, `receivings_items`, `item_kit_items`, `item_quantities`, `grants`; duplicate sale/payment/tax rows become possible | `initial_schema.sql:486,537,579`; `3.1.1_to_3.2.0.sql:162-199`; `3.3.0_paymenttracking.sql:5-15` | `drizzle/mysql/0000_demonic_darkstar.sql:196-200,235-255,300-342`; `drizzle/sqlite/0000_skinny_power_man.sql:91-98,113-119,279-317` |
| D4 | `sales_taxes` identity and tax attribution lost: no `sales_taxes_id`, `jurisdiction_id`, `tax_category_id`, `print_sequence`, `name`, `tax_rate`, `sales_tax_code_id`, `rounding_code`; `round_code` invented | `3.3.0_indiagst.sql:46-62`; `3.4.0_database_optimizations.sql:88-90` | `src/db/schema/sales.ts:46-53`; `src/db/schema/mysql/index.ts:244-251` |
| D5 | `sales_items_taxes` loses `tax_type`, `rounding_code`, `cascade_sequence`, `sales_tax_code_id`, `jurisdiction_id`, `tax_category_id` | `3.3.0_indiagst.sql:38-42`; `3.4.0_database_optimizations.sql:83-86` | `src/db/schema/sales.ts:37-44`; `src/db/schema/mysql/index.ts:235-242` |
| D6 | `attribute_links` generated uniqueness expression is wrong: target uses unconditional `CONCAT(definition_id,'-',item_id)`, upstream only for item-only rows via a `CASE`; target also omits `uq1`/`uq2` and five upstream indexes | `3.4.1_attribute_links_unique_constraint.sql:4-11`; `20250519000000_MigrationOptimizationIndices.php:20-30` | `src/db/schema/mysql/index.ts:312-324` |
| D7 | Foreign-key actions differ materially: target cascades person/sale/receiving deletes that upstream blocks | `initial_schema.sql:740-877`; `3.4.0_database_optimizations.sql:18-41,105-108` | `drizzle/mysql/0000_demonic_darkstar.sql:412-452` |
| D8 | Target seed has 90 config keys vs upstream 138 (52 missing, 4 invented, 29 value differences) | `initial_schema.sql:16-85` plus migrations | `src/db/seed.ts:12-103`; actual `sqlite.db` |
| D9 | Target modules seed uses display labels instead of `module_*` language keys, and all sort values are 0 except office=999 | `initial_schema.sql:311-322`; `3.1.1_to_3.2.0.sql:8-10,108-114`; `3.2.1_to_3.3.0.sql:46-53`; `3.3.0_attributes.sql:48-49` | `src/db/seed.ts:105-124`; actual `sqlite.db` |
| D10 | Target permissions seed omits `reports_expenses_categories` and `reports_sales_taxes`, invents `reports_expenses`, `reports_cashups`, `module_home`; the three location-scoped permissions are declared but inserted with `location_id` NULL | `3.1.1_to_3.2.0.sql:125-133`; `3.3.0_indiagst.sql:96-100`; `initial_schema.sql:396-399` | `src/db/seed.ts:126-164,209-214` |
| D11 | Target grants use `menu_group='both'` for all rows instead of the upstream `home`/`office`/`--` matrix, and target column is `varchar(10) NOT NULL DEFAULT 'both'` vs upstream `varchar(32) DEFAULT 'home'` | `3.1.1_to_3.2.0.sql:5-23,67-68`; `3.3.0_attributes.sql:54-55`; `20210714140000_move_expenses_categories.php:16` | `src/db/schema/auth.ts:48-52`; `src/db/seed.ts:216-222` |
| D12 | Target `sessions` PK is `(id)` with `int` timestamp; upstream PK is `(id, ip_address)` with SQL `timestamp` and `blob` data, and CI's `matchIP=true` requires the composite key | `3.4.1_migrate_sessions_table.sql:1-10`; `app/Config/Session.php:62,74` | `src/db/schema/auth.ts:54-59`; `src/db/schema/mysql/index.ts:68-73` |
| D13 | Target `migrations` mirror is wrong: `version` is `int` (upstream/CI4 stores the 14-digit version as `varchar(255)`), and `group` + `batch` are missing | CodeIgniter v4.7.4 `MigrationRunner::ensureTable()` (see evidence below) | `src/db/schema/misc.ts:3-9`; `src/db/schema/mysql/index.ts:408-414` |
| D14 | Actual `sqlite.db` and `ospos.db` are stale relative to the target's own seed/schema: 28 permissions/grants instead of the 37 defined in `seed.ts`; 0 dinner tables; 3 orphan `people` rows; `ospos.db` is missing SQLite migration `0002` | actual DB inspection | `src/db/seed.ts:126-164,166-176` |

---

## 1. Table inventory — final upstream DDL

### 1.1 Final object counts

| Object class | Count | Evidence |
|---|---|---|
| Base tables in final schema | 39 | `3.4.3_mysql84_utf8mb4_conversion.sql:3-41` |
| Migration files applied | 47 | `app/Database/Migrations/*.php` (47 files, `.gitkeep` excluded). The brief said 49; the tree contains 47 PHP migrations, 28 top-level SQL scripts and 12 historical `pre-3.0.2/` scripts that no 3.x migration references. |
| `ospos_app_config` rows | 138 | computed from `initial_schema.sql:16-85` + all inserts/deletes/renames (section 4) |
| `ospos_modules` rows | 18 | `initial_schema.sql:311-322` + later inserts/deletes |
| `ospos_permissions` rows | 36 | `initial_schema.sql:372-399` + later inserts/deletes |
| `ospos_grants` rows | 36 (all person_id=1) | same migration chain; section 3.4 |
| `ospos_stock_locations` rows | 1 (`stock`) | `initial_schema.sql:712`; `20261023000000_AddStockLocationDefaultAndSortOrder.php:52-55` |
| `ospos_dinner_tables` rows | 2 (`Delivery`, `Take Away`) | `3.0.2_to_3.1.1.sql:41-43` |
| `ospos_customers_packages` rows | 5 | `3.0.2_to_3.1.1.sql:87-92` |
| `ospos_employees` / `ospos_people` rows | 1 / 1 | `initial_schema.sql:130-131,351-352` |
| `ospos_migrations` rows | 47 for a fresh install (data-dependent on upgrades) | CI4 `MigrationRunner` |

### 1.2 Canonical final MySQL schema

Every table below is `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci`
after `20260405000000_Mysql84Utf8mb4Conversion.php` executes
`3.4.3_mysql84_utf8mb4_conversion.sql:3-41`. Display widths (`int(10)`, `tinyint(1)`)
are shown as they appear in the originating DDL; MySQL 8.0.19+ ignores them.
`ospos_` is the runtime prefix configured at `app/Config/Database.php:34`.

#### 1.2.1 `ospos_app_config`

Created `initial_schema.sql:6-10`; never altered except charset conversion.

```sql
CREATE TABLE `ospos_app_config` (
  `key`   varchar(50)  NOT NULL,
  `value` varchar(500) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.2 `ospos_attribute_definitions`

Created `3.3.0_attributes.sql:2-11`; `definition_unit` added at
`3.3.0_decimal_attribute_type.sql:4-5`; `definition_flags` narrowed and two indexes
added at `3.4.0_database_optimizations.sql:6-8`; self-FK from
`3.3.0_attributes.sql:37-38`.

```sql
CREATE TABLE `ospos_attribute_definitions` (
  `definition_id`    int(10)      NOT NULL AUTO_INCREMENT,
  `definition_name`  varchar(255) NOT NULL,
  `definition_type`  varchar(45)  NOT NULL,
  `definition_unit`  varchar(16)  DEFAULT NULL,
  `definition_flags` tinyint(1)   NOT NULL,
  `definition_fk`    int(10)      DEFAULT NULL,
  `deleted`          tinyint(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`definition_id`),
  KEY `definition_fk` (`definition_fk`),
  KEY `definition_name` (`definition_name`),
  KEY `definition_type` (`definition_type`),
  CONSTRAINT `fk_ospos_attribute_definitions_ibfk_1`
    FOREIGN KEY (`definition_fk`) REFERENCES `ospos_attribute_definitions` (`definition_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.3 `ospos_attribute_links`

Created `3.3.0_attributes.sql:22-34`; original five FKs
`3.3.0_attributes.sql:41-46`; `receiving_id` FK made cascade at
`3.3.2_modify_attr_links_constraint.sql:1-8`; generated column + `uq3` added at
`3.4.0_attribute_links_unique_constraint.sql:3-10`; `uq3` and generated column
dropped at `20250213000000_fix_attributes_cascading_delete.php:19-20`; `uq2` added
at `20250519000000_MigrationOptimizationIndices.php:20-30`; generated column +
`uq3` re-added and FKs 1/2 re-added as `RESTRICT` at
`20250522000000_AttributeLinksUniqueConstraint.php:16-24` and
`3.4.1_attribute_links_unique_constraint.sql:4-14`. Final FKs 3/4/5 come from
`3.4.0_attribute_links_unique_constraint.sql:14-16` and were recreated unchanged by
`3.4.3` / `20260405000000`.

```sql
CREATE TABLE `ospos_attribute_links` (
  `attribute_id`  int(11)      DEFAULT NULL,
  `definition_id` int(11)      NOT NULL,
  `item_id`       int(11)      DEFAULT NULL,
  `sale_id`       int(11)      DEFAULT NULL,
  `receiving_id`  int(11)      DEFAULT NULL,
  `generated_unique_column` varchar(255)
      GENERATED ALWAYS AS (
        CASE
          WHEN `sale_id` IS NULL AND `receiving_id` IS NULL AND `item_id` IS NOT NULL
          THEN CONCAT(`definition_id`, '-', `item_id`)
          ELSE NULL
        END
      ) STORED,
  KEY `attribute_id` (`attribute_id`),
  KEY `definition_id` (`definition_id`),
  KEY `item_id` (`item_id`),
  KEY `sale_id` (`sale_id`),
  KEY `receiving_id` (`receiving_id`),
  UNIQUE KEY `attribute_links_uq1` (`attribute_id`,`definition_id`,`item_id`,`sale_id`,`receiving_id`),
  UNIQUE KEY `attribute_links_uq2` (`item_id`,`receiving_id`,`sale_id`,`definition_id`,`attribute_id`),
  UNIQUE KEY `attribute_links_uq3` (`generated_unique_column`),
  CONSTRAINT `ospos_attribute_links_ibfk_1` FOREIGN KEY (`definition_id`)
    REFERENCES `ospos_attribute_definitions` (`definition_id`) ON DELETE RESTRICT,
  CONSTRAINT `ospos_attribute_links_ibfk_2` FOREIGN KEY (`attribute_id`)
    REFERENCES `ospos_attribute_values` (`attribute_id`) ON DELETE RESTRICT,
  CONSTRAINT `ospos_attribute_links_ibfk_3` FOREIGN KEY (`item_id`)
    REFERENCES `ospos_items` (`item_id`),
  CONSTRAINT `ospos_attribute_links_ibfk_4` FOREIGN KEY (`receiving_id`)
    REFERENCES `ospos_receivings` (`receiving_id`),
  CONSTRAINT `ospos_attribute_links_ibfk_5` FOREIGN KEY (`sale_id`)
    REFERENCES `ospos_sales` (`sale_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

Note: `attribute_links_uq1` and `uq2` contain nullable columns, so MySQL permits
duplicate rows whenever a component is NULL; `uq3` is the only effective
item-definition duplicate guard, and only for item-only links.

#### 1.2.4 `ospos_attribute_values`

Created `3.3.0_attributes.sql:14-19`; `attribute_decimal` added
`3.3.0_decimal_attribute_type.sql:1-2`; `attribute_datetime` renamed to
`attribute_date` `3.3.0_fix_attribute_datetime.sql:1`; three unique keys added
`3.4.0_database_optimizations.sql:2-3`.

```sql
CREATE TABLE `ospos_attribute_values` (
  `attribute_id`      int(11)       NOT NULL AUTO_INCREMENT,
  `attribute_value`   varchar(255)  DEFAULT NULL,
  `attribute_date`    date          DEFAULT NULL,
  `attribute_decimal` decimal(7,3)  DEFAULT NULL,
  PRIMARY KEY (`attribute_id`),
  UNIQUE KEY `attribute_value` (`attribute_value`),
  UNIQUE KEY `attribute_date` (`attribute_date`),
  UNIQUE KEY `attribute_decimal` (`attribute_decimal`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.5 `ospos_cash_up`

Created `3.2.1_to_3.3.0.sql:63-92`; `closed_amount_due` appended at `:102-103`;
`deleted` narrowed at `3.4.0_database_optimizations.sql:11`; `note` narrowed at
`20230307000000_int_to_tinyint.php:16`.

```sql
CREATE TABLE `ospos_cash_up` (
  `cashup_id`            int(10)       NOT NULL AUTO_INCREMENT,
  `open_date`            timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `close_date`           timestamp     NULL DEFAULT NULL,
  `open_amount_cash`     decimal(15,2) NOT NULL,
  `transfer_amount_cash` decimal(15,2) NOT NULL,
  `note`                 tinyint       NOT NULL DEFAULT 0,
  `closed_amount_cash`   decimal(15,2) NOT NULL,
  `closed_amount_card`   decimal(15,2) NOT NULL,
  `closed_amount_check`  decimal(15,2) NOT NULL,
  `closed_amount_total`  decimal(15,2) NOT NULL,
  `description`          varchar(255)  NOT NULL,
  `open_employee_id`     int(10)       NOT NULL,
  `close_employee_id`    int(10)       NOT NULL,
  `deleted`              tinyint(1)    NOT NULL DEFAULT 0,
  `closed_amount_due`    decimal(15,2) NOT NULL,
  PRIMARY KEY (`cashup_id`),
  KEY `open_employee_id` (`open_employee_id`),
  KEY `close_employee_id` (`close_employee_id`),
  CONSTRAINT `ospos_cash_up_ibfk_1` FOREIGN KEY (`open_employee_id`)
    REFERENCES `ospos_employees` (`person_id`),
  CONSTRAINT `ospos_cash_up_ibfk_2` FOREIGN KEY (`close_employee_id`)
    REFERENCES `ospos_employees` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

`open_amount_cash`, `transfer_amount_cash`, `closed_amount_*` are `decimal(15,2)`
with no default; inserting a cashup requires all of them explicitly, including the
`NOT NULL` `closed_amount_due`.

#### 1.2.6 `ospos_customers`

Created `initial_schema.sql:94-103`; `package_id`/`points`
`3.0.2_to_3.1.1.sql:121-123`; `sales_tax_code` `:188-189`; GDPR columns
`3.2.0_to_3.2.1.sql:7-10`; `tax_id`/`sales_tax_code_id` and drop of
`sales_tax_code` `3.3.0_indiagst.sql:31-33,104-110`; `discount`/`discount_type`
rename `3.2.1_to_3.3.0.sql:28-30`; type narrowing
`3.4.0_database_optimizations.sql:14-16`; `consent` narrowing
`20230307000000_int_to_tinyint.php:15`; unique account-number removed
`20230412000001_drop_account_number_index.php:15-16`; company index added
`20240630000001_fix_keys_for_db_upgrade.php:29-32`.

Column order below is the physical order produced by the `AFTER` clauses; note that
`discount` sits after `deleted` because `3.2.1_to_3.3.0.sql:29` moved it after
`sales_tax_code`, which `3.3.0_indiagst.sql:109` then dropped.

```sql
CREATE TABLE `ospos_customers` (
  `person_id`          int(10)       NOT NULL,
  `company_name`       varchar(255)  DEFAULT NULL,
  `account_number`     varchar(255)  DEFAULT NULL,
  `taxable`            tinyint(1)    NOT NULL DEFAULT 1,
  `tax_id`             varchar(32)   NOT NULL DEFAULT '',
  `sales_tax_code_id`  int(11)       DEFAULT NULL,
  `package_id`         int(11)       DEFAULT NULL,
  `points`             int(11)       DEFAULT NULL,
  `deleted`            tinyint(1)    NOT NULL DEFAULT 0,
  `discount`           decimal(15,2) NOT NULL DEFAULT 0,
  `discount_type`      tinyint(1)    NOT NULL DEFAULT 0,
  `date`               timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `employee_id`        int(10)       NOT NULL,
  `consent`            tinyint       NOT NULL DEFAULT 0,
  PRIMARY KEY (`person_id`),
  KEY `account_number` (`account_number`),
  KEY `sales_tax_code_id` (`sales_tax_code_id`),
  KEY `package_id` (`package_id`),
  KEY `company_name` (`company_name`),
  CONSTRAINT `ospos_customers_ibfk_1` FOREIGN KEY (`person_id`)
    REFERENCES `ospos_people` (`person_id`),
  CONSTRAINT `ospos_customers_ibfk_2` FOREIGN KEY (`package_id`)
    REFERENCES `ospos_customers_packages` (`package_id`),
  CONSTRAINT `ospos_customers_ibfk_3` FOREIGN KEY (`sales_tax_code_id`)
    REFERENCES `ospos_tax_codes` (`tax_code_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

`points` is nullable with **no** default; `employee_id` is `NOT NULL` with no
default, so an upgrade of a populated table relies on non-strict SQL mode and gets
`0` for existing rows. `date` is `NOT NULL DEFAULT CURRENT_TIMESTAMP`.

#### 1.2.7 `ospos_customers_packages`

Created `3.0.2_to_3.1.1.sql:79-85`; `deleted` narrowed at
`3.4.0_database_optimizations.sql:22-23`.

```sql
CREATE TABLE `ospos_customers_packages` (
  `package_id`     int(11)      NOT NULL AUTO_INCREMENT,
  `package_name`   varchar(255) DEFAULT NULL,
  `points_percent` float        NOT NULL DEFAULT 0,
  `deleted`        tinyint(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`package_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.8 `ospos_customers_points`

Created `3.0.2_to_3.1.1.sql:98-105`; FKs `:283-297`.

```sql
CREATE TABLE `ospos_customers_points` (
  `id`            int(11) NOT NULL AUTO_INCREMENT,
  `person_id`     int(11) NOT NULL,
  `package_id`    int(11) NOT NULL,
  `sale_id`       int(11) NOT NULL,
  `points_earned` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `person_id` (`person_id`),
  KEY `package_id` (`package_id`),
  KEY `sale_id` (`sale_id`),
  CONSTRAINT `ospos_customers_points_ibfk_1` FOREIGN KEY (`person_id`)
    REFERENCES `ospos_customers` (`person_id`),
  CONSTRAINT `ospos_customers_points_ibfk_2` FOREIGN KEY (`package_id`)
    REFERENCES `ospos_customers_packages` (`package_id`),
  CONSTRAINT `ospos_customers_points_ibfk_3` FOREIGN KEY (`sale_id`)
    REFERENCES `ospos_sales` (`sale_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.9 `ospos_dinner_tables`

Created `3.0.2_to_3.1.1.sql:33-39`; `deleted` narrowed and `status` index added at
`3.4.0_database_optimizations.sql:25-27`.

```sql
CREATE TABLE `ospos_dinner_tables` (
  `dinner_table_id` int(11)     NOT NULL AUTO_INCREMENT,
  `name`            varchar(30) NOT NULL,
  `status`          tinyint(1)  NOT NULL DEFAULT 0,
  `deleted`         tinyint(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (`dinner_table_id`),
  KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.10 `ospos_employees`

Created `initial_schema.sql:116-124`; language columns
`3.1.1_to_3.2.0.sql:73-75`; type narrowing
`3.4.0_database_optimizations.sql:29-31`.

```sql
CREATE TABLE `ospos_employees` (
  `username`      varchar(255) NOT NULL,
  `password`      varchar(255) NOT NULL,
  `person_id`     int(10)      NOT NULL,
  `deleted`       tinyint(1)   NOT NULL DEFAULT 0,
  `hash_version`  tinyint(1)   NOT NULL DEFAULT 2,
  `language`      varchar(48)  DEFAULT NULL,
  `language_code` varchar(8)   DEFAULT NULL,
  PRIMARY KEY (`person_id`),
  UNIQUE KEY `username` (`username`),
  CONSTRAINT `ospos_employees_ibfk_1` FOREIGN KEY (`person_id`)
    REFERENCES `ospos_people` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.11 `ospos_expense_categories`

Created `3.1.1_to_3.2.0.sql:138-143`; keys/auto-increment `:162-178`; type/index
narrowing `3.4.0_database_optimizations.sql:48-50`.

```sql
CREATE TABLE `ospos_expense_categories` (
  `expense_category_id`  int(10)      NOT NULL AUTO_INCREMENT,
  `category_name`        varchar(255) DEFAULT NULL,
  `category_description` varchar(255) NOT NULL,
  `deleted`              tinyint(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`expense_category_id`),
  UNIQUE KEY `category_name` (`category_name`),
  KEY `category_description` (`category_description`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.12 `ospos_expenses`

Created `3.1.1_to_3.2.0.sql:148-157`; keys `:167-191`; extra columns
`:196-199`; `supplier_id`/FK/drop of `supplier_name`
`3.2.1_to_3.3.0.sql:122-146`; date index `3.3.0_dbfix.sql:32`; type/index
narrowing `3.4.0_database_optimizations.sql:43-46`.

```sql
CREATE TABLE `ospos_expenses` (
  `expense_id`          int(10)       NOT NULL AUTO_INCREMENT,
  `date`                timestamp     NULL DEFAULT CURRENT_TIMESTAMP,
  `amount`              decimal(15,2) NOT NULL,
  `payment_type`        varchar(40)   NOT NULL,
  `expense_category_id` int(11)       NOT NULL,
  `description`         varchar(255)  NOT NULL,
  `employee_id`         int(10)       NOT NULL,
  `deleted`             tinyint(1)    NOT NULL DEFAULT 0,
  `supplier_tax_code`   varchar(255)  DEFAULT NULL,
  `tax_amount`          decimal(15,2) DEFAULT NULL,
  `supplier_id`         int(10)       DEFAULT NULL,
  PRIMARY KEY (`expense_id`),
  KEY `expense_category_id` (`expense_category_id`),
  KEY `employee_id` (`employee_id`),
  KEY `date` (`date`),
  KEY `payment_type` (`payment_type`),
  KEY `amount` (`amount`),
  CONSTRAINT `ospos_expenses_ibfk_1` FOREIGN KEY (`expense_category_id`)
    REFERENCES `ospos_expense_categories` (`expense_category_id`),
  CONSTRAINT `ospos_expenses_ibfk_2` FOREIGN KEY (`employee_id`)
    REFERENCES `ospos_employees` (`person_id`),
  CONSTRAINT `ospos_expenses_ibfk_3` FOREIGN KEY (`supplier_id`)
    REFERENCES `ospos_suppliers` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.13 `ospos_giftcards`

Created `initial_schema.sql:139-149`; `giftcard_number` retyped to nullable varchar
`3.0.2_to_3.1.1.sql:224`; type narrowing
`3.4.0_database_optimizations.sql:52-53`.

```sql
CREATE TABLE `ospos_giftcards` (
  `record_time`     timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `giftcard_id`     int(11)      NOT NULL AUTO_INCREMENT,
  `giftcard_number` varchar(255) DEFAULT NULL,
  `value`           decimal(15,2) NOT NULL,
  `deleted`         tinyint(1)   NOT NULL DEFAULT 0,
  `person_id`       int(10)      DEFAULT NULL,
  PRIMARY KEY (`giftcard_id`),
  UNIQUE KEY `giftcard_number` (`giftcard_number`),
  KEY `person_id` (`person_id`),
  CONSTRAINT `ospos_giftcards_ibfk_1` FOREIGN KEY (`person_id`)
    REFERENCES `ospos_people` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.14 `ospos_grants`

Created `initial_schema.sql:407-411`; `menu_group` added
`3.1.1_to_3.2.0.sql:5-6`; FKs `initial_schema.sql:786-788`, re-added with
`CASCADE` on `person_id` by `20210422000000_database_optimizations.php:30` +
`3.4.0_database_optimizations.sql:37`. Final definition:

```sql
CREATE TABLE `ospos_grants` (
  `permission_id` varchar(255) NOT NULL,
  `person_id`     int(10)      NOT NULL,
  `menu_group`    varchar(32)  DEFAULT 'home',
  PRIMARY KEY (`permission_id`,`person_id`),
  KEY `ospos_grants_ibfk_2` (`person_id`),
  CONSTRAINT `ospos_grants_ibfk_1` FOREIGN KEY (`permission_id`)
    REFERENCES `ospos_permissions` (`permission_id`) ON DELETE CASCADE,
  CONSTRAINT `ospos_grants_ibfk_2` FOREIGN KEY (`person_id`)
    REFERENCES `ospos_employees` (`person_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

`menu_group` is **nullable** with default `'home'`; there is no `NOT NULL` and no
enum. The observed values in a seeded install are `home`, `office` and `--`
(section 3.4).

#### 1.2.15 `ospos_inventory`

Created `initial_schema.sql:162-174`; `trans_date` index
`3.3.0_dbfix.sql:30`; composite index
`20250519000000_MigrationOptimizationIndices.php:32-35`.

```sql
CREATE TABLE `ospos_inventory` (
  `trans_id`        int(11)       NOT NULL AUTO_INCREMENT,
  `trans_items`     int(11)       NOT NULL DEFAULT 0,
  `trans_user`      int(11)       NOT NULL DEFAULT 0,
  `trans_date`      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `trans_comment`   text          NOT NULL,
  `trans_location`  int(11)       NOT NULL,
  `trans_inventory` decimal(15,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (`trans_id`),
  KEY `trans_items` (`trans_items`),
  KEY `trans_user` (`trans_user`),
  KEY `trans_location` (`trans_location`),
  KEY `trans_date` (`trans_date`),
  KEY `trans_items_trans_date` (`trans_items`,`trans_date`),
  CONSTRAINT `ospos_inventory_ibfk_1` FOREIGN KEY (`trans_items`)
    REFERENCES `ospos_items` (`item_id`),
  CONSTRAINT `ospos_inventory_ibfk_2` FOREIGN KEY (`trans_user`)
    REFERENCES `ospos_employees` (`person_id`),
  CONSTRAINT `ospos_inventory_ibfk_3` FOREIGN KEY (`trans_location`)
    REFERENCES `ospos_stock_locations` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.16 `ospos_item_kit_items`

Created `initial_schema.sql:264-270`; `kit_sequence` added
`3.0.2_to_3.1.1.sql:13-14`. The primary key was **not** changed to include
`kit_sequence`.

```sql
CREATE TABLE `ospos_item_kit_items` (
  `item_kit_id`  int(11)       NOT NULL,
  `item_id`      int(11)       NOT NULL,
  `quantity`     decimal(15,3) NOT NULL,
  `kit_sequence` int(3)        NOT NULL DEFAULT 0,
  PRIMARY KEY (`item_kit_id`,`item_id`,`quantity`),
  KEY `ospos_item_kit_items_ibfk_2` (`item_id`),
  CONSTRAINT `ospos_item_kit_items_ibfk_1` FOREIGN KEY (`item_kit_id`)
    REFERENCES `ospos_item_kits` (`item_kit_id`) ON DELETE CASCADE,
  CONSTRAINT `ospos_item_kit_items_ibfk_2` FOREIGN KEY (`item_id`)
    REFERENCES `ospos_items` (`item_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.17 `ospos_item_kits`

Created `initial_schema.sql:246-251`; new columns
`3.0.2_to_3.1.1.sql:7-11`; discount rename/type
`3.2.1_to_3.3.0.sql:24-26`; item-kit number
`3.3.3_add_kits_item_number.sql:1-3`; narrowing and index
`3.4.0_database_optimizations.sql:63-67`.

```sql
CREATE TABLE `ospos_item_kits` (
  `item_kit_id`      int(11)       NOT NULL AUTO_INCREMENT,
  `item_kit_number`  varchar(255)  DEFAULT NULL,
  `name`             varchar(255)  NOT NULL,
  `description`      varchar(255)  NOT NULL,
  `item_id`          int(10)       NOT NULL DEFAULT 0,
  `kit_discount`     decimal(15,2) NOT NULL DEFAULT 0,
  `kit_discount_type` tinyint(1)   NOT NULL DEFAULT 0,
  `price_option`     tinyint(1)    NOT NULL DEFAULT 0,
  `print_option`     tinyint(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`item_kit_id`),
  KEY `item_kit_number` (`item_kit_number`),
  KEY `name` (`name`,`description`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

There is **no foreign key** on `item_kits.item_id`; this is intentional upstream
(the kit's own item is not enforced) and differs from the target, which adds one.

#### 1.2.18 `ospos_item_quantities`

Created `initial_schema.sql:282-289`; no later change except charset.

```sql
CREATE TABLE `ospos_item_quantities` (
  `item_id`     int(11)       NOT NULL,
  `location_id` int(11)       NOT NULL,
  `quantity`    decimal(15,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (`item_id`,`location_id`),
  KEY `item_id` (`item_id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `ospos_item_quantities_ibfk_1` FOREIGN KEY (`item_id`)
    REFERENCES `ospos_items` (`item_id`),
  CONSTRAINT `ospos_item_quantities_ibfk_2` FOREIGN KEY (`location_id`)
    REFERENCES `ospos_stock_locations` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.19 `ospos_items`

Created `initial_schema.sql:187-215`; `stock_type`/`item_type`
`3.0.2_to_3.1.1.sql:3-5`; `pic_id`→`pic_filename` `:27`; `tax_category_id`
`:173-174,263-264`; `qty_per_pack`/`pack_name`/`low_sell_item_id`
`3.2.1_to_3.3.0.sql:8-15`; `hsn_code` `3.3.0_indiagst.sql:35-36`; custom columns
dropped `3.3.0_attributes.sql:172-182`; narrowing/indexes
`3.4.0_database_optimizations.sql:55-61`; nullable tax category
`20250729170000_NullableTaxCategoryId.php:2-3`.

```sql
CREATE TABLE `ospos_items` (
  `name`                 varchar(255)  NOT NULL,
  `category`             varchar(255)  NOT NULL,
  `supplier_id`          int(11)       DEFAULT NULL,
  `item_number`          varchar(255)  DEFAULT NULL,
  `description`          varchar(255)  NOT NULL,
  `cost_price`           decimal(15,2) NOT NULL,
  `unit_price`           decimal(15,2) NOT NULL,
  `reorder_level`        decimal(15,3) NOT NULL DEFAULT 0,
  `receiving_quantity`   decimal(15,3) NOT NULL DEFAULT 1,
  `item_id`              int(10)       NOT NULL AUTO_INCREMENT,
  `pic_filename`         varchar(255)  DEFAULT NULL,
  `allow_alt_description` tinyint(1)   NOT NULL,
  `is_serialized`        tinyint(1)    NOT NULL,
  `deleted`              tinyint(1)    NOT NULL DEFAULT 0,
  `stock_type`           tinyint(1)    NOT NULL DEFAULT 0,
  `item_type`            tinyint(1)    NOT NULL DEFAULT 0,
  `tax_category_id`      int(11)       DEFAULT NULL,
  `qty_per_pack`         decimal(15,3) NOT NULL DEFAULT 1,
  `pack_name`            varchar(8)    DEFAULT 'Each',
  `low_sell_item_id`     int(10)       DEFAULT 0,
  `hsn_code`             varchar(32)   NOT NULL DEFAULT '',
  PRIMARY KEY (`item_id`),
  KEY `item_number` (`item_number`),
  KEY `supplier_id` (`supplier_id`),
  KEY `deleted` (`deleted`,`item_type`),
  KEY `item_id` (`item_id`,`deleted`),
  UNIQUE KEY `items_uq1` (`supplier_id`,`item_id`,`deleted`,`item_type`),
  CONSTRAINT `ospos_items_ibfk_1` FOREIGN KEY (`supplier_id`)
    REFERENCES `ospos_suppliers` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

`category` and `description` remain `NOT NULL`; `item_number` is deliberately
non-unique (duplicate barcodes allowed) after `3.1.1_to_3.2.0.sql:94-96`.

#### 1.2.20 `ospos_items_taxes`

Created `initial_schema.sql:228-233`; FK `:766-767`; no later type change.

```sql
CREATE TABLE `ospos_items_taxes` (
  `item_id` int(10)       NOT NULL,
  `name`    varchar(255)  NOT NULL,
  `percent` decimal(15,3) NOT NULL,
  PRIMARY KEY (`item_id`,`name`,`percent`),
  CONSTRAINT `ospos_items_taxes_ibfk_1` FOREIGN KEY (`item_id`)
    REFERENCES `ospos_items` (`item_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.21 `ospos_migrations`

Not in `initial_schema.sql`. Created by CodeIgniter 4.7.4
`MigrationRunner::ensureTable()` before the first migration; upstream depends on
`codeigniter4/framework` `v4.7.4` (`composer.lock:10-11`). The framework source
(the local Composer cache archive
`~/.cache/composer/files/codeigniter4/framework/4b836cee1403a10a13c7331399ab5e8d1cd9fdda.zip`,
member `codeigniter4-framework-67ead89/system/Database/MigrationRunner.php:819-875`)
defines the columns as `id` BIGINT(20) UNSIGNED
AUTO_INCREMENT, `version` VARCHAR(255) NOT NULL, `class` VARCHAR(255) NOT NULL,
`group` VARCHAR(255) NOT NULL, `namespace` VARCHAR(255) NOT NULL, `time` INT(11)
NOT NULL, `batch` INT(11) UNSIGNED NOT NULL, PK (`id`). The version stored is the
14-digit filename prefix extracted by
`preg_match('/\A(\d{4}[_-]?\d{2}[_-]?\d{2}[_-]?\d{6})_(\w+)\z/')` and inserted as a
string by `addHistory()`; `class` is the declared class name, `group` is
`'default'`, `namespace` is `'App'`, `batch` is the migration batch number.
The table is converted to utf8mb4 by `3.4.3_mysql84_utf8mb4_conversion.sql:23`.

```sql
CREATE TABLE `ospos_migrations` (
  `id`        bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `version`   varchar(255) NOT NULL,
  `class`     varchar(255) NOT NULL,
  `group`     varchar(255) NOT NULL,
  `namespace` varchar(255) NOT NULL,
  `time`      int(11)      NOT NULL,
  `batch`     int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

The app's own upgrade reader (`app/Libraries/MY_Migration.php:23-47`) reads
`ospos_migrations.version` as a string and casts the newest one to `int`; the
version column being `varchar` is therefore load-bearing.

#### 1.2.22 `ospos_modules`

Created `initial_schema.sql:297-305`; no ALTERs except charset.

```sql
CREATE TABLE `ospos_modules` (
  `name_lang_key` varchar(255) NOT NULL,
  `desc_lang_key` varchar(255) NOT NULL,
  `sort`          int(10)      NOT NULL,
  `module_id`     varchar(255) NOT NULL,
  PRIMARY KEY (`module_id`),
  UNIQUE KEY `desc_lang_key` (`desc_lang_key`),
  UNIQUE KEY `name_lang_key` (`name_lang_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.23 `ospos_people`

Created `initial_schema.sql:330-345`; email index `3.0.2_to_3.1.1.sql:214-215`;
composite index `3.4.0_database_optimizations.sql:69-70`; the composite index was
dropped and re-added with 191-character prefixes for utf8mb4 at
`20260405000000_Mysql84Utf8mb4Conversion.php:19-21,28-30`.

```sql
CREATE TABLE `ospos_people` (
  `first_name`   varchar(255) NOT NULL,
  `last_name`    varchar(255) NOT NULL,
  `gender`       int(1)       DEFAULT NULL,
  `phone_number` varchar(255) NOT NULL,
  `email`        varchar(255) NOT NULL,
  `address_1`    varchar(255) NOT NULL,
  `address_2`    varchar(255) NOT NULL,
  `city`         varchar(255) NOT NULL,
  `state`        varchar(255) NOT NULL,
  `zip`          varchar(255) NOT NULL,
  `country`      varchar(255) NOT NULL,
  `comments`     text         NOT NULL,
  `person_id`    int(10)      NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`person_id`),
  KEY `email` (`email`),
  KEY `first_name` (`first_name`(191),`last_name`(191),`email`(191),`phone_number`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.24 `ospos_permissions`

Created `initial_schema.sql:360-366`; FKs `:779-781`.

```sql
CREATE TABLE `ospos_permissions` (
  `permission_id` varchar(255) NOT NULL,
  `module_id`     varchar(255) NOT NULL,
  `location_id`   int(10)      DEFAULT NULL,
  PRIMARY KEY (`permission_id`),
  KEY `module_id` (`module_id`),
  KEY `ospos_permissions_ibfk_2` (`location_id`),
  CONSTRAINT `ospos_permissions_ibfk_1` FOREIGN KEY (`module_id`)
    REFERENCES `ospos_modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `ospos_permissions_ibfk_2` FOREIGN KEY (`location_id`)
    REFERENCES `ospos_stock_locations` (`location_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.25 `ospos_receivings`

Created `initial_schema.sql:449-461`; `receiving_time` index `3.3.0_dbfix.sql:26`.

```sql
CREATE TABLE `ospos_receivings` (
  `receiving_time` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `supplier_id`    int(10)      DEFAULT NULL,
  `employee_id`    int(10)      NOT NULL DEFAULT 0,
  `comment`        text         NOT NULL,
  `receiving_id`   int(10)      NOT NULL AUTO_INCREMENT,
  `payment_type`   varchar(20)  DEFAULT NULL,
  `reference`      varchar(32)  DEFAULT NULL,
  PRIMARY KEY (`receiving_id`),
  KEY `supplier_id` (`supplier_id`),
  KEY `employee_id` (`employee_id`),
  KEY `reference` (`reference`),
  KEY `receiving_time` (`receiving_time`),
  CONSTRAINT `ospos_receivings_ibfk_1` FOREIGN KEY (`employee_id`)
    REFERENCES `ospos_employees` (`person_id`),
  CONSTRAINT `ospos_receivings_ibfk_2` FOREIGN KEY (`supplier_id`)
    REFERENCES `ospos_suppliers` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.26 `ospos_receivings_items`

Created `initial_schema.sql:474-488`; price precision normalized
`3.0.2_to_3.1.1.sql:341-342`; discount rename/type
`3.2.1_to_3.3.0.sql:36-38`; narrowing
`3.4.0_database_optimizations.sql:72-73`.

```sql
CREATE TABLE `ospos_receivings_items` (
  `receiving_id`       int(10)       NOT NULL DEFAULT 0,
  `item_id`            int(10)       NOT NULL DEFAULT 0,
  `description`        varchar(30)   DEFAULT NULL,
  `serialnumber`       varchar(30)   DEFAULT NULL,
  `line`               int(3)        NOT NULL,
  `quantity_purchased` decimal(15,3) NOT NULL DEFAULT 0,
  `item_cost_price`    decimal(15,2) NOT NULL,
  `item_unit_price`    decimal(15,2) NOT NULL,
  `discount`           decimal(15,2) NOT NULL DEFAULT 0,
  `discount_type`      tinyint(1)    NOT NULL DEFAULT 0,
  `item_location`      int(11)       NOT NULL,
  `receiving_quantity` decimal(15,3) NOT NULL DEFAULT 1,
  PRIMARY KEY (`receiving_id`,`item_id`,`line`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `ospos_receivings_items_ibfk_1` FOREIGN KEY (`item_id`)
    REFERENCES `ospos_items` (`item_id`),
  CONSTRAINT `ospos_receivings_items_ibfk_2` FOREIGN KEY (`receiving_id`)
    REFERENCES `ospos_receivings` (`receiving_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.27 `ospos_sales`

Created `initial_schema.sql:501-513`; dinner table `3.0.2_to_3.1.1.sql:47-52`;
quote/status `:176-178`; work order/type `3.1.1_to_3.2.0.sql:34-38`; narrowing
`3.4.0_database_optimizations.sql:75-77`.

```sql
CREATE TABLE `ospos_sales` (
  `sale_time`         timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `customer_id`       int(10)      DEFAULT NULL,
  `employee_id`       int(10)      NOT NULL DEFAULT 0,
  `comment`           text         NOT NULL,
  `invoice_number`    varchar(32)  DEFAULT NULL,
  `dinner_table_id`   int(11)      DEFAULT NULL,
  `sale_id`           int(10)      NOT NULL AUTO_INCREMENT,
  `quote_number`      varchar(32)  DEFAULT NULL,
  `sale_status`       tinyint(1)   NOT NULL DEFAULT 0,
  `work_order_number` varchar(32)  DEFAULT NULL,
  `sale_type`         tinyint(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`sale_id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `customer_id` (`customer_id`),
  KEY `employee_id` (`employee_id`),
  KEY `sale_time` (`sale_time`),
  KEY `dinner_table_id` (`dinner_table_id`),
  CONSTRAINT `ospos_sales_ibfk_1` FOREIGN KEY (`employee_id`)
    REFERENCES `ospos_employees` (`person_id`),
  CONSTRAINT `ospos_sales_ibfk_2` FOREIGN KEY (`customer_id`)
    REFERENCES `ospos_customers` (`person_id`),
  CONSTRAINT `ospos_sales_ibfk_3` FOREIGN KEY (`dinner_table_id`)
    REFERENCES `ospos_dinner_tables` (`dinner_table_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

There is deliberately no unique key on `quote_number` or `work_order_number`;
invoice numbers are unique but nullable (multiple NULL invoices allowed).

#### 1.2.28 `ospos_sales_items`

Created `initial_schema.sql:526-541`; `print_option` and long description
`3.0.2_to_3.1.1.sql:16-17,253-254`; price precision `:343-344`; discount
rename/type `3.2.1_to_3.3.0.sql:32-34`; narrowing
`3.4.0_database_optimizations.sql:79-81`.

```sql
CREATE TABLE `ospos_sales_items` (
  `sale_id`            int(10)       NOT NULL DEFAULT 0,
  `item_id`            int(10)       NOT NULL DEFAULT 0,
  `description`        varchar(255)  DEFAULT NULL,
  `serialnumber`       varchar(30)   DEFAULT NULL,
  `line`               int(3)        NOT NULL DEFAULT 0,
  `quantity_purchased` decimal(15,3) NOT NULL DEFAULT 0,
  `item_cost_price`    decimal(15,2) NOT NULL,
  `item_unit_price`    decimal(15,2) NOT NULL,
  `discount`           decimal(15,2) NOT NULL DEFAULT 0,
  `discount_type`      tinyint(1)    NOT NULL DEFAULT 0,
  `item_location`      int(11)       NOT NULL,
  `print_option`       tinyint(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`sale_id`,`item_id`,`line`),
  KEY `sale_id` (`sale_id`),
  KEY `item_id` (`item_id`),
  KEY `item_location` (`item_location`),
  CONSTRAINT `ospos_sales_items_ibfk_1` FOREIGN KEY (`item_id`)
    REFERENCES `ospos_items` (`item_id`),
  CONSTRAINT `ospos_sales_items_ibfk_2` FOREIGN KEY (`sale_id`)
    REFERENCES `ospos_sales` (`sale_id`),
  CONSTRAINT `ospos_sales_items_ibfk_3` FOREIGN KEY (`item_location`)
    REFERENCES `ospos_stock_locations` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.29 `ospos_sales_items_taxes`

Created `initial_schema.sql:554-563`; preliminary tax columns/types added by
`3.0.2_to_3.1.1.sql:180-186`; India GST reshuffle
`3.3.0_indiagst.sql:38-42`; narrowing
`3.4.0_database_optimizations.sql:83-86`; composite FK recreated at
`20240630000001_fix_keys_for_db_upgrade.php:34-43`.

```sql
CREATE TABLE `ospos_sales_items_taxes` (
  `sale_id`            int(10)       NOT NULL,
  `item_id`            int(10)       NOT NULL,
  `line`               int(3)        NOT NULL DEFAULT 0,
  `name`               varchar(255)  NOT NULL,
  `percent`            decimal(15,4) NOT NULL DEFAULT 0.0000,
  `tax_type`           tinyint(1)    NOT NULL DEFAULT 0,
  `rounding_code`      tinyint(1)    NOT NULL DEFAULT 0,
  `cascade_sequence`   tinyint(1)    NOT NULL DEFAULT 0,
  `item_tax_amount`    decimal(15,4) NOT NULL DEFAULT 0,
  `sales_tax_code_id`  int(11)       DEFAULT NULL,
  `jurisdiction_id`    int(11)       DEFAULT NULL,
  `tax_category_id`    int(11)       DEFAULT NULL,
  PRIMARY KEY (`sale_id`,`item_id`,`line`,`name`,`percent`),
  KEY `sale_id` (`sale_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `ospos_sales_items_taxes_ibfk_1` FOREIGN KEY (`sale_id`,`item_id`,`line`)
    REFERENCES `ospos_sales_items` (`sale_id`,`item_id`,`line`),
  CONSTRAINT `ospos_sales_items_taxes_ibfk_2` FOREIGN KEY (`item_id`)
    REFERENCES `ospos_items` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.30 `ospos_sales_payments`

Rebuilt by `3.3.0_paymenttracking.sql:3-26`; refund tracking
`3.3.0_refundtracking.sql:1-4`; indexes/FKs `3.3.0_dbfix.sql:1-4,28`.

```sql
CREATE TABLE `ospos_sales_payments` (
  `payment_id`     int(11)       NOT NULL AUTO_INCREMENT,
  `sale_id`        int(10)       NOT NULL,
  `payment_type`   varchar(40)   NOT NULL,
  `payment_amount` decimal(15,2) NOT NULL,
  `cash_refund`    decimal(15,2) NOT NULL DEFAULT 0,
  `employee_id`    int(11)       DEFAULT NULL,
  `payment_time`   timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reference_code` varchar(40)   NOT NULL DEFAULT '',
  PRIMARY KEY (`payment_id`),
  KEY `payment_sale` (`sale_id`,`payment_type`),
  KEY `employee_id` (`employee_id`),
  KEY `payment_time` (`payment_time`),
  CONSTRAINT `ospos_sales_payments_ibfk_1` FOREIGN KEY (`sale_id`)
    REFERENCES `ospos_sales` (`sale_id`),
  CONSTRAINT `ospos_sales_payments_ibfk_2` FOREIGN KEY (`employee_id`)
    REFERENCES `ospos_employees` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

Note the historical data loss: the rebuild at `3.3.0_paymenttracking.sql:17-21`
copies only `sale_id, payment_type, payment_amount, employee_id`; any prior
`cash_refund`/reference data did not exist yet, but the old composite primary key
`(sale_id,payment_type)` was replaced by a surrogate id, so a sale may now have
multiple rows per payment type.

#### 1.2.31 `ospos_sales_reward_points`

Created `3.0.2_to_3.1.1.sql:111-117`; FK `:291-293`.

```sql
CREATE TABLE `ospos_sales_reward_points` (
  `id`      int(11) NOT NULL AUTO_INCREMENT,
  `sale_id` int(11) NOT NULL,
  `earned`  float   NOT NULL,
  `used`    float   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sale_id` (`sale_id`),
  CONSTRAINT `ospos_sales_reward_points_ibfk_1` FOREIGN KEY (`sale_id`)
    REFERENCES `ospos_sales` (`sale_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.32 `ospos_sales_taxes`

Recreated by `3.3.0_indiagst.sql:44-62`; narrowing
`3.4.0_database_optimizations.sql:88-90`. There is **no foreign key** on this
table in the final schema.

```sql
CREATE TABLE `ospos_sales_taxes` (
  `sales_taxes_id`    int(11)       NOT NULL AUTO_INCREMENT,
  `sale_id`           int(10)       NOT NULL,
  `jurisdiction_id`   int(11)       DEFAULT NULL,
  `tax_category_id`   int(11)       DEFAULT NULL,
  `tax_type`          smallint(2)   NOT NULL,
  `tax_group`         varchar(32)   NOT NULL,
  `sale_tax_basis`    decimal(15,4) NOT NULL,
  `sale_tax_amount`   decimal(15,4) NOT NULL,
  `print_sequence`    tinyint(1)    NOT NULL DEFAULT 0,
  `name`              varchar(255)  NOT NULL,
  `tax_rate`          decimal(15,4) NOT NULL,
  `sales_tax_code_id` int(11)       DEFAULT NULL,
  `rounding_code`     tinyint(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`sales_taxes_id`),
  KEY `print_sequence` (`sale_id`,`print_sequence`,`tax_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.33 `ospos_sessions`

Dropped and recreated twice. `3.4.0_CI4Conversion.sql:1-12` and again
`3.4.1_migrate_sessions_table.sql:1-10`. Final shape is the second recreation plus
the utf8mb4 conversion. CI's database session handler is configured with
`savePath='sessions'` and `matchIP=true` (`app/Config/Session.php:26,62,74`), which
requires the composite `(id, ip_address)` primary key.

```sql
CREATE TABLE `ospos_sessions` (
  `id`         varchar(128) NOT NULL,
  `ip_address` varchar(45)  NOT NULL,
  `timestamp`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data`       blob         NOT NULL,
  PRIMARY KEY (`id`,`ip_address`),
  KEY `ospos_sessions_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

#### 1.2.34 `ospos_stock_locations`

Created `initial_schema.sql:701-706`; `deleted` narrowed
`3.4.0_database_optimizations.sql:96-97`; `is_default`/`sort_order` added
`20261023000000_AddStockLocationDefaultAndSortOrder.php:16-31`; backfill and
unique key `:37-58`.

```sql
CREATE TABLE `ospos_stock_locations` (
  `location_id`   int(11)          NOT NULL AUTO_INCREMENT,
  `location_name` varchar(255)     DEFAULT NULL,
  `deleted`       tinyint(1)       NOT NULL DEFAULT 0,
  `is_default`    tinyint(1)       NOT NULL DEFAULT 0,
  `sort_order`    tinyint unsigned DEFAULT NULL,
  PRIMARY KEY (`location_id`),
  UNIQUE KEY `sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

Because `sort_order` is nullable and unique, multiple deleted rows may hold NULL;
active rows get dense ranks `0..N-1` (alphabetical). `is_default` is set to 1 on
the lowest `location_id` among non-deleted rows
(`20261023000000_AddStockLocationDefaultAndSortOrder.php:54-55`).

#### 1.2.35 `ospos_suppliers`

Created `initial_schema.sql:720-728`; `tax_id` `3.3.0_indiagst.sql:76-77` and made
`NOT NULL` at `3.3.0_indiagst1.sql:1-6`; `category`
`3.2.1_to_3.3.0.sql:109-113`; narrowing/indexes
`3.4.0_database_optimizations.sql:99-103`.

```sql
CREATE TABLE `ospos_suppliers` (
  `person_id`      int(10)      NOT NULL,
  `company_name`   varchar(255) NOT NULL,
  `agency_name`    varchar(255) NOT NULL,
  `account_number` varchar(255) DEFAULT NULL,
  `tax_id`         varchar(32)  NOT NULL DEFAULT '',
  `deleted`        tinyint(1)   NOT NULL DEFAULT 0,
  `category`       tinyint(1)   NOT NULL,
  PRIMARY KEY (`person_id`),
  UNIQUE KEY `account_number` (`account_number`),
  KEY `category` (`category`),
  KEY `company_name` (`company_name`,`deleted`),
  CONSTRAINT `ospos_suppliers_ibfk_1` FOREIGN KEY (`person_id`)
    REFERENCES `ospos_people` (`person_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

`category` has no default and is `NOT NULL`; the migration backfills `0` at
`3.2.1_to_3.3.0.sql:112-113`.

#### 1.2.36 `ospos_tax_categories`

Created `3.0.2_to_3.1.1.sql:166-171`; rows `0..3` deleted and auto-increment
enabled at `:258-264`; `deleted` added `3.3.0_indiagst.sql:79-80`; narrowing
`3.4.0_database_optimizations.sql:110-112`.

```sql
CREATE TABLE `ospos_tax_categories` (
  `tax_category_id`  int(10)     NOT NULL AUTO_INCREMENT,
  `tax_category`     varchar(32) NOT NULL,
  `tax_group_sequence` tinyint(1) NOT NULL,
  `deleted`          tinyint(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (`tax_category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

No rows are seeded; because `3.0.2_to_3.1.1.sql:258` deletes ids 0–3 immediately
after the table is created, the first user-created category gets id 4.

#### 1.2.37 `ospos_tax_codes`

Old table renamed to `_backup` and replaced at
`3.3.0_indiagst.sql:19-29`; `deleted` narrowed by
`20240630000001_fix_keys_for_db_upgrade.php:19-27`.

```sql
CREATE TABLE `ospos_tax_codes` (
  `tax_code_id`   int(11)      NOT NULL AUTO_INCREMENT,
  `tax_code`      varchar(32)  NOT NULL,
  `tax_code_name` varchar(255) NOT NULL DEFAULT '',
  `city`          varchar(255) NOT NULL DEFAULT '',
  `state`         varchar(255) NOT NULL DEFAULT '',
  `deleted`       tinyint(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`tax_code_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

There is no index on `tax_code`; all lookups go through the surrogate id or a full
scan. `tax_codes_backup` is dropped at `3.3.0_indiagst.php:158-163`.

#### 1.2.38 `ospos_tax_jurisdictions`

Created `3.3.0_indiagst.sql:64-74`; unique `tax_group` added at
`20200215100000_taxgroupconstraint.php:15`; narrowing
`3.4.0_database_optimizations.sql:114-117`.

```sql
CREATE TABLE `ospos_tax_jurisdictions` (
  `jurisdiction_id`    int(11)      NOT NULL AUTO_INCREMENT,
  `jurisdiction_name`  varchar(255) DEFAULT NULL,
  `tax_group`          varchar(32)  NOT NULL,
  `tax_type`           smallint(2)  NOT NULL,
  `reporting_authority` varchar(255) DEFAULT NULL,
  `tax_group_sequence` tinyint(1)   NOT NULL DEFAULT 0,
  `cascade_sequence`   tinyint(1)   NOT NULL DEFAULT 0,
  `deleted`            tinyint(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`jurisdiction_id`),
  UNIQUE KEY `tax_jurisdictions_uq1` (`tax_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

`tax_group` is globally unique. A dummy `Jurisdiction1` row is created only when
upgrading a database that already had tax-code rate rows
(`20190129212600_indiagst.php:138-153`); a fresh install has zero rows.

#### 1.2.39 `ospos_tax_rates`

Created `3.3.0_indiagst.sql:84-92`; indexes/FKs `3.3.0_dbfix.sql:11-24`;
narrowing `3.4.0_database_optimizations.sql:119-120`.

```sql
CREATE TABLE `ospos_tax_rates` (
  `tax_rate_id`          int(11)       NOT NULL AUTO_INCREMENT,
  `rate_tax_code_id`     int(11)       NOT NULL,
  `rate_tax_category_id` int(10)       NOT NULL,
  `rate_jurisdiction_id` int(11)       NOT NULL,
  `tax_rate`             decimal(15,4) NOT NULL DEFAULT 0.0000,
  `tax_rounding_code`    tinyint(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`tax_rate_id`),
  KEY `rate_tax_code_id` (`rate_tax_code_id`),
  KEY `rate_tax_category_id` (`rate_tax_category_id`),
  KEY `rate_jurisdiction_id` (`rate_jurisdiction_id`),
  CONSTRAINT `ospos_tax_rates_ibfk_1` FOREIGN KEY (`rate_tax_category_id`)
    REFERENCES `ospos_tax_categories` (`tax_category_id`),
  CONSTRAINT `ospos_tax_rates_ibfk_2` FOREIGN KEY (`rate_tax_code_id`)
    REFERENCES `ospos_tax_codes` (`tax_code_id`),
  CONSTRAINT `ospos_tax_rates_ibfk_3` FOREIGN KEY (`rate_jurisdiction_id`)
    REFERENCES `ospos_tax_jurisdictions` (`jurisdiction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
```

### 1.3 Transient / dropped objects (not in the final schema)

| Object | Created | Dropped / replaced | Evidence |
|---|---|---|---|
| `ospos_sales_suspended` | `initial_schema.sql:594-604` | `3.1.1_to_3.2.0.sql:330` (data copied to `ospos_sales` first, `:322-328`) | four suspended tables |
| `ospos_sales_suspended_items` | `initial_schema.sql:617-631` | same | |
| `ospos_sales_suspended_items_taxes` | `initial_schema.sql:644-652` | same | |
| `ospos_sales_suspended_payments` | `initial_schema.sql:665-670` | same | |
| `ospos_tax_codes_backup` | `3.3.0_indiagst.sql:19` | `20190129212600_indiagst.php:160` | |
| `ospos_sales_taxes_backup` | `3.3.0_indiagst.sql:44` | `20190129212600_indiagst.php:161` | |
| `ospos_tax_code_rates_backup` | `3.3.0_indiagst.sql:82` | `20190129212600_indiagst.php:162` | (old `ospos_tax_code_rates` renamed here and never recreated) |
| `ospos_sales_payments_backup` | `3.3.0_paymenttracking.sql:3` | `:23` | |
| `ospos_sales_taxes_backup` (temporary) | `20200202000000_taxamount.php:48` | `:54` | created only when `tax_included=1` and unmigrated sales exist |
| `ospos_migrate_refund` | `20190502100000_refundtracking.php:73-82` | `:109` | `ENGINE=MEMORY`, non-temporary by MySQL bug note at `:70-72` |
| `ospos_migrate_taxes`, `ospos_migrate_sales`, `ospos_migrate_payments` | `20190502100000_refundtracking.php:26-68` | connection close | `CREATE TEMPORARY TABLE ... ENGINE=MEMORY` |
| `ospos_sessions` (old shape) | `initial_schema.sql:683-689` | `3.4.0_CI4Conversion.sql:1-12`, then `3.4.1_migrate_sessions_table.sql:1-10` | recreated twice |

### 1.4 SQLite port of the upstream schema (what a faithful SQLite schema must express)

SQLite has no `ENGINE`, no column charset/collation, no native `decimal`, and no
`AUTO_INCREMENT` keyword. A faithful SQLite translation therefore needs explicit
choices (none of which the target currently makes):

- Numeric money/quantity columns: upstream `decimal(15,2)` / `(15,3)` / `(15,4)`
  cannot be represented exactly by SQLite `REAL`. Store integer minor units or
  `TEXT` and convert at the boundary; the target uses `REAL` (`src/db/schema/items.ts:11-14`,
  `src/db/schema/sales.ts:28-32`).
- `timestamp` columns: upstream uses SQL `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
  a faithful SQLite schema can use `TEXT` ISO-8601 with `DEFAULT CURRENT_TIMESTAMP`
  or integer epoch with explicit conversion. The target uses epoch integers with
  `$defaultFn(() => Math.floor(Date.now()/1000))` (`src/db/schema/sales.ts:7`,
  `src/db/schema/items.ts:44`), so DB-side defaults are lost and cross-dialect
  semantics differ.
- `blob` (`sessions.data`): SQLite `BLOB`; target uses `text` (`src/db/schema/auth.ts:58`).
- `generated_unique_column`: SQLite supports stored generated columns since 3.31;
  the target omits it entirely in SQLite (`src/db/schema/attributes.ts:21-27`).
- `tinyint(1) unsigned`/`int unsigned`: SQLite has only INTEGER affinity.
- Unique/index names and FK actions must be recreated explicitly; SQLite does not
  auto-name FK indexes.
- Collation: upstream unique comparisons are case- and accent-insensitive under
  `utf8mb4_unicode_520_ci`; SQLite default `BINARY` is case-sensitive. This changes
  duplicate detection for `username`, `desc_lang_key`, `giftcard_number`,
  `account_number`, `attribute_value`.

---

## 2. Migration chain (chronological, 47 files)

CI4 orders migrations by the 14-digit prefix of the filename, not by class name.
The runner creates `ospos_migrations` before the first migration and records each
file's version string, class, group (`default`), namespace (`App`), timestamp and
batch. `executeScript()` splits SQL on `;` (`app/Helpers/migration_helper.php:14-60`);
it does **not** strip comments, so comment-only fragments are submitted and fail
harmlessly under `simpleQuery`. Forge-based migrations are translated to their final
DDL effect. Destructive steps are marked **destructive**.

| # | Version | Class | Script / mechanism | Effect (tables, columns, config) |
|---|---|---|---|---|
| 1 | 20170501000000 | `Migration_Initial_Schema` | `initial_schema.sql:1-877` | Creates the 25-table 3.0.2 baseline: `app_config`, `customers`, `employees`, `giftcards`, `inventory`, `items`, `items_taxes`, `item_kits`, `item_kit_items`, `item_quantities`, `modules`, `people`, `permissions`, `grants`, `receivings`, `receivings_items`, `sales`, `sales_items`, `sales_items_taxes`, `sales_payments`, `sales_suspended*` (4), `sessions`, `stock_locations`, `suppliers`; all FKs; seeds config, admin, modules, permissions, grants, stock. **destructive**: `up()` does not skip existing tables; it ignores `executeScript`'s false return (`20170501000000_initial_schema.php:25-29`). `down()` drops every table except `ospos_migrations` (`:38-67`). |
| 2 | 20170501150000 | `Migration_Upgrade_To_3_1_1` | `3.0.2_to_3.1.1.sql:1-398` | Adds `items.stock_type/item_type`, `item_kits.item_id/kit_discount_percent/price_option/print_option`, `item_kit_items.kit_sequence`, `sales_items.print_option`, suspended `quote_number/print_option`, renames `items.pic_id→pic_filename`, creates `dinner_tables` (+2 rows), `customers_packages` (+5 rows), `customers_points`, `sales_reward_points`, adds `sales.dinner_table_id`/`quote_number`/`sale_status`, `items.tax_category_id`, `sales_items_taxes` GST prelim columns, `customers.package_id/points/sales_tax_code`, creates `tax_codes`/`tax_code_rates`/`sales_taxes`/`tax_categories`, adds taxes module/permission/config, email index, `giftcard_number` varchar, many config keys, migrates suspended sales into sales and **destructively** drops all four suspended tables (`:322-330`), `DELETE barcode_quality` (`:204` in next script), `DELETE print_after_sale` (`:336`), charset→utf8, custom fields→varchar(255) NULL, `language_code`→`en-US` (`:398`). Also drops/recreates 11 groups of FKs around the charset conversion (`20170501150000_upgrade_to_3_1_1.php:24-52`). |
| 3 | 20170502221506 | `Migration_Sales_Tax_Data` | PHP data migration `20170502221506_sales_tax_data.php:34-48` | Backfills `sales_items_taxes.tax_type/item_tax_amount` and `sales_taxes` rows for legacy sales; no DDL. Uses `tax_included`, `tax_decimals` config (`:61-69`). |
| 4 | 20180225100000 | `Migration_Upgrade_To_3_2_0` | `3.1.1_to_3.2.0.sql:1-224` | Adds `grants.menu_group` (`varchar(32) DEFAULT 'home'`), office/home modules+permissions+grants, sales_delete permission/grant, `sales.work_order_number/sale_type`, per-employee language columns, suggestions/allow-duplicate config, drops unique `items.item_number`, deletes migrate module/permission/grant, creates `expense_categories` and `expenses` (+indexes/FKs), adds expense module/permissions/grants, drops `barcode_quality` config, new config (derive, receipt behaviours, quote comments). |
| 5 | 20180501100000 | `Migration_Upgrade_To_3_2_1` | `3.2.0_to_3.2.1.sql:1-26` | Adds `customers.date/employee_id/consent`, `enforce_privacy`, `print_delay_autoreturn`; fixes zero receiving quantities. |
| 6 | 20181015100000 | `Migration_Attributes` | `3.3.0_attributes.sql:1-184` | Creates `attribute_definitions`, `attribute_values`, `attribute_links` + FKs; attributes module/permission/grant; migrates `items.custom1..10` to attributes then **destructively** drops the ten columns (`:172-182`) and deletes `custom*_name` config (`:184`). |
| 7 | 20190111270000 | `Migration_Upgrade_To_3_3_0` | `3.2.1_to_3.3.0.sql:1-150` | Adds `multi_pack_enabled`, `qty_per_pack/pack_name/low_sell_item_id`, `default_sales_discount_type`, renames `discount_percent`→`discount` + adds `discount_type` on customers/sales_items/receivings_items, renames `kit_discount_percent`→`kit_discount` + `kit_discount_type`, creates `cash_up`, cashups module/permission/grant, `suppliers.category`, `expenses.supplier_id` + FK + **destructively** drop `supplier_name` (`:122-146`), receivings discount config. |
| 8 | 20190129212600 | `Migration_IndiaGST` | `3.3.0_indiagst.sql:1-100` + PHP data migration `20190129212600_indiagst.php:13-43` | **destructive:** renames/recreates `tax_codes`, renames/recreates `sales_taxes` with surrogate id and attribution columns, creates `tax_jurisdictions`, renames `tax_code_rates`→backup, creates `tax_rates`, adds `customers.tax_id/sales_tax_code_id` and drops `customers.sales_tax_code` **destructive:** (`:104-110`), adds `items.hsn_code`, adds GST columns to `sales_items_taxes`, adds `suppliers.tax_id`, `tax_categories.deleted`, `reports_sales_taxes` permission/grant, renames config keys. `drop_backups()` **destructive**: drops the three backups (`:158-163`). |
| 9 | 20190213210000 | `Migration_IndiaGST1` | `3.3.0_indiagst1.sql:1-6` | Makes `suppliers.tax_id` `NOT NULL DEFAULT ''`. |
| 10 | 20190220210000 | `Migration_IndiaGST2` | `3.3.0_indiagst2.sql:1-5` | Idempotent **destructive** `DROP TABLE IF EXISTS` of the three tax backups. |
| 11 | 20190301124900 | `Migration_decimal_attribute_type` | `3.3.0_decimal_attribute_type.sql:1-5` | Adds `attribute_values.attribute_decimal DECIMAL(7,3)` and `attribute_definitions.definition_unit VARCHAR(16)`. |
| 12 | 20190317102600 | `Migration_add_iso_4217` | `3.3.0_add_iso_4217.sql:1-4` | Inserts `currency_code=''`. |
| 13 | 20190427100000 | `Migration_PaymentTracking` | `3.3.0_paymenttracking.sql:1-26` | **destructive:** rebuilds `sales_payments` with surrogate `payment_id`, `payment_user`, `payment_date`, `reference_code`; copies rows; drops backup. |
| 14 | 20190502100000 | `Migration_RefundTracking` | `3.3.0_refundtracking.sql:1-4` + PHP data migration `20190502100000_refundtracking.php:17-109` | Adds `cash_refund`, renames `payment_user→employee_id`, `payment_date→payment_time`; backfills cash refunds using temporary MEMORY tables; **destructive:** can insert extra refund payment rows (`:98-106`). |
| 15 | 20190612100000 | `Migration_DBFix` | `3.3.0_dbfix.sql:1-32` | Adds indexes on payments/employee, customers sales_tax_code_id, tax_rates FKs/indexes, receivings.receiving_time, sales_payments.payment_time, inventory.trans_date, expenses.date; adds FKs `sales_payments_ibfk_2`, `customers_ibfk_3`, `tax_rates_ibfk_1..3`. |
| 16 | 20190615100000 | `Migration_fix_attribute_datetime` | `3.3.0_fix_attribute_datetime.sql:1` | `attribute_values.attribute_datetime DATETIME` → `attribute_date DATE` (**destructive:** time component lost). |
| 17 | 20190712150200 | `Migration_fix_empty_reports` | PHP `:16-27` | Sets `location_id=1` on `receivings_stock`/`sales_stock` permissions (no-op on a fresh install, where they are already 1). |
| 18 | 20191008100000 | `Migration_receipttaxindicator` | PHP `:15-16` | Inserts `receipt_show_tax_ind='0'`. |
| 19 | 20191231100000 | `Migration_PaymentDateFix` | `3.3.2_paymentdatefix.sql:1-3` | Copies `sales.sale_time` into `sales_payments.payment_time`. |
| 20 | 20200125100000 | `Migration_SalesChangePrice` | `3.3.2_saleschangeprice.sql:1-5` | Adds `sales_change_price` permission and grant (`menu_group='--'`). |
| 21 | 20200202000000 | `Migration_TaxAmount` | PHP `20200202000000_taxamount.php:36-59` | If `tax_included=1` and unmigrated sales exist: **destructive**: renames `sales_taxes` to backup, recreates `LIKE`, rewrites tax rows, drops backup. No DDL change. |
| 22 | 20200215100000 | `Migration_taxgroupconstraint` | PHP `:15` | Adds `UNIQUE (tax_group)` named `tax_jurisdictions_uq1`. |
| 23 | 20200508000000 | `Migration_image_upload_defaults` | PHP `:15-23` | Inserts four `image_*` config keys. |
| 24 | 20200819000000 | `Migration_modify_attr_links_constraint` | `3.3.2_modify_attr_links_constraint.sql:1-8` | Recreates `attribute_links_ibfk_4` with `ON DELETE CASCADE ON UPDATE RESTRICT`. |
| 25 | 20201108100000 | `Migration_cashrounding` | PHP `:15` | Adds `sales_payments.cash_adjustment TINYINT NOT NULL DEFAULT 0`. |
| 26 | 20201110000000 | `Migration_add_item_kit_number` | `3.3.3_add_kits_item_number.sql:1-3` | Adds `item_kits.item_kit_number` + index. |
| 27 | 20210103000000 | `Migration_modify_session_datatype` | `3.3.4_modify_session_datatype.sql:1-2` | `sessions.data`→`MEDIUMBLOB` (later reverted by the table rebuild). |
| 28 | 20210422000000 | `Migration_database_optimizations` | PHP `:23-116` + `3.4.0_database_optimizations.sql:1-121` | **destructive:** drops 16 FKs, deduplicates/migrates attribute values (deletes/reinserts rows), then adds many indexes, unique keys on attribute values, `items_uq1`, type narrowings, and recreates the FKs. `createPrimaryKey()` calls are no-ops because PKs already exist (`app/Helpers/migration_helper.php:104-119`). |
| 29 | 20210422000001 | `Migration_remove_duplicate_links` | PHP `:27-58` | **destructive:** deletes duplicate item attribute links (grouped by item/definition/attribute) and re-inserts one. |
| 30 | 20210714140000 | `Migration_move_expenses_categories` | PHP `:16` | Sets `grants.menu_group='office'` for every `expenses_categories` grant. |
| 31 | 20220127000000 | `ConvertToCI4` | `3.4.0_CI4Conversion.sql:1-20` + PHP `:26-62` | **destructive:** drops/recreates `sessions` with composite PK; `image_allowed_types` pipe→comma; `language_code='en'`, `language='english'`; may rotate the encryption key and re-encrypt secrets (`:52-61`). |
| 32 | 20230307000000 | `IntToTinyint` | PHP `:15-16` | `customers.consent` and `cash_up.note` → `TINYINT NOT NULL DEFAULT 0`. |
| 33 | 20230412000000 | `Migration_add_missing_config` | PHP `:15-26` | `INSERT IGNORE` eight config keys. |
| 34 | 20230412000001 | `Migration_drop_account_number_index` | PHP `:15-16` | `customers.account_number` UNIQUE → non-unique KEY. |
| 35 | 20240319000000 | `Migration_Convert_Barcode_Types` | PHP `:29-47` | Maps `barcode_type` Code39→C39, Ean13→EAN13, Ean8→EAN8, Code128→C128 (default final C39). |
| 36 | 20240630000001 | `Migration_fix_keys_for_db_upgrade` | PHP `:18-48` | `tax_codes.deleted` → `TINYINT(1) NOT NULL DEFAULT 0`; adds `customers.company_name` index; recreates composite FK `sales_items_taxes_ibfk_1`; PK checks no-op. |
| 37 | 20240826000000 | `fix_duplicate_attributes` | PHP `:16-31` + `3.4.0_attribute_links_unique_constraint.sql:1-16` | **destructive:** deletes duplicate item attribute links (keeps MIN attribute_id), drops all five attribute_links FKs, adds `generated_unique_column` + `uq3`, re-adds FKs 1/2 `RESTRICT`, 3/4/5 default. |
| 38 | 20250213000000 | `Migration_Attributes_fix_cascading_delete` | PHP `:19-25` | **destructive:** drops `attribute_links_uq3` + generated column, re-adds FKs 1/2 with `ON DELETE CASCADE`. |
| 39 | 20250425000000 | `Migration_sessions_migration` | `3.4.1_migrate_sessions_table.sql:1-10` | **destructive:** `DROP TABLE IF EXISTS ospos_sessions`; recreates `id varchar(128)`, `ip_address varchar(45)`, `timestamp timestamp DEFAULT CURRENT_TIMESTAMP`, `data blob`, PK `(id,ip_address)`, timestamp index. All live sessions lost. |
| 40 | 20250519000000 | `MigrationOptimizationIndices` | PHP `:20-35` | Adds unique `attribute_links_uq2 (item_id,receiving_id,sale_id,definition_id,attribute_id)` and `inventory.trans_items_trans_date`. |
| 41 | 20250521000000 | `FixImageFilenameSpaces` | PHP `:18-53` | Data/filesystem migration: renames item images with spaces to safe names and updates `items.pic_filename` only when the file rename succeeds; irreversible (`down()` empty). |
| 42 | 20250522000000 | `AttributeLinksUniqueConstraint` | PHP `:16-24` + `3.4.1_attribute_links_unique_constraint.sql:1-14` | Drops FKs 1/2; re-adds generated column + `uq3`; re-adds FKs 1/2 with `ON DELETE RESTRICT`. Final FK actions for attribute_links become RESTRICT. |
| 43 | 20250716170000 | `Migration_MissingConfigKeys` | `3.4.2_missing_config_keys.sql:1-11` (transactional, `INSERT IGNORE`) | Attempts nine config keys; all already exist, so no value change (notably SMTP stays `ssl/465/5` and `mailpath=/usr/sbin/sendmail`, not the script's tls/587/5000). |
| 44 | 20250729170000 | `Migration_NullableTaxCategoryId` | `3.4.2_nullable_tax_category_id.sql:2-3` | `items.tax_category_id` → `INT NULL`. |
| 45 | 20260405000000 | `Migration_Mysql84Utf8mb4Conversion` | PHP `:14-46` + `3.4.3_mysql84_utf8mb4_conversion.sql:3-41` | **destructive:** drops **all** FKs, converts all 39 tables to `utf8mb4_unicode_520_ci`; asserts no unique-collation collisions before converting (`:60-108`); drops/re-adds the people composite index with 191-char prefixes; recreates all FKs. Irreversible. |
| 46 | 20260506000000 | `AddShortcutKeys` | PHP `:11-25` | `INSERT IGNORE` ten `key_*` config rows. |
| 47 | 20261023000000 | `AddStockLocationDefaultAndSortOrder` | PHP `:16-58` | Adds `stock_locations.is_default TINYINT(1) NOT NULL DEFAULT 0` and `sort_order TINYINT UNSIGNED NULL`; backfills alphabetical ranks, NULL for deleted, default on oldest active; unique key `sort_order`. |

### 2.1 Upgrade hazards summary

1. **Migration #1 is not safe against a populated database.** `CREATE TABLE`
   statements fail and the migration still records success because the return value
   is ignored (`20170501000000_initial_schema.php:25-29`).
2. **Suspended-sales import may mislink items** (`3.0.2_to_3.1.1.sql:322-328`):
   `ospos_sales` rows are re-inserted without `sale_id`, while `sales_items`,
   `sales_payments` and `sales_items_taxes` copy the old `sale_id`. This only lines
   up when the sales table is empty or the auto-increment happens to reproduce the
   same ids; otherwise items point at the wrong/new sales. No remapping is done.
3. **Tax-table rebuilds are destructive**: #8, #21, #45 rewrite or drop tax tables;
   #45 refuses to run on colliding unique values but has no rollback.
4. **Attribute migrations delete data**: #28, #29, #37 remove duplicate rows; #6
   drops the ten custom columns; #16 truncates datetime to date.
5. **Session table is dropped twice** (#31, #39), and #39 is unconditional.
6. **SMTP config drift**: #43 intends modern defaults but uses `INSERT IGNORE`, so
   upgraded installs keep `ssl/465/5` and `/usr/sbin/sendmail`
   (`3.4.2_missing_config_keys.sql:7-11`).
7. **Config/insert duplication**: most config INSERTs are not `IGNORE`; replaying a
   partially applied migration logs duplicate-key errors and, for scripts whose
   return value is checked (`20170501150000_upgrade_to_3_1_1.php:45-47`), throws.

---

## 3. Final seed data (exact rows)

The upstream "seed" is not a seeder class; it is the INSERT statements embedded in
the baseline schema plus the incremental INSERTs in the migrations. The only CI4
seeder, `TestDatabaseBootstrapSeeder`, resets the test database and inserts nothing
(`app/Database/Seeds/TestDatabaseBootstrapSeeder.php:10-54`).

### 3.1 Admin person and employee

`ospos_people` (`initial_schema.sql:351-352`), final row after migration #45
(charset only):

```
person_id=1, first_name='John', last_name='Doe', gender=NULL,
phone_number='555-555-5555', email='changeme@example.com',
address_1='Address 1', address_2='', city='', state='', zip='', country='',
comments=''
```

`ospos_employees` (`initial_schema.sql:130-131`), never changed by any migration:

```
username='admin'
password='$2y$10$vJBSMlD02EC7ENSrKfVQXuvq9tNRHMtcOA8MSK2NYS748HHWm.gcG'
person_id=1
deleted=0
hash_version=2
language=NULL
language_code=NULL
```

### 3.2 `ospos_modules` — final 18 rows

Sources: `initial_schema.sql:311-322`; taxes `3.0.2_to_3.1.1.sql:200-201`; migrate
`schema.sql:238-239` then deleted `3.1.1_to_3.2.0.sql:101`; office/home
`3.1.1_to_3.2.0.sql:8-10`; expenses/expenses_categories `:121-123`; sorts
`:108-114`; config sort `3.2.1_to_3.3.0.sql:46-48`; cashups `:52-53`; attributes
`3.3.0_attributes.sql:48-49`.

```
module_id            | name_lang_key                        | desc_lang_key                        | sort
attributes           | module_attributes                    | module_attributes_desc                | 107
cashups              | module_cashups                       | module_cashups_desc                   | 110
config               | module_config                        | module_config_desc                    | 900
customers            | module_customers                     | module_customers_desc                 | 10
employees            | module_employees                     | module_employees_desc                 | 80
expenses             | module_expenses                      | module_expenses_desc                  | 108
expenses_categories  | module_expenses_categories           | module_expenses_categories_desc       | 109
giftcards            | module_giftcards                     | module_giftcards_desc                 | 90
home                 | module_home                          | module_home_desc                      | 1
item_kits            | module_item_kits                     | module_item_kits_desc                 | 30
items                | module_items                         | module_items_desc                     | 20
messages             | module_messages                      | module_messages_desc                  | 98
office               | module_office                        | module_office_desc                    | 999
receivings           | module_receivings                    | module_receivings_desc                | 60
reports              | module_reports                       | module_reports_desc                   | 50
sales                | module_sales                         | module_sales_desc                     | 70
suppliers            | module_suppliers                     | module_suppliers_desc                 | 40
taxes                | module_taxes                         | module_taxes_desc                     | 105
```

`migrate` (sort 120) existed transiently and is deleted at
`3.1.1_to_3.2.0.sql:101`.

### 3.3 `ospos_permissions` — final 36 rows

Base rows `initial_schema.sql:372-394`; location-scoped base rows `:396-399`;
taxes `3.0.2_to_3.1.1.sql:203-204`; office/home `3.1.1_to_3.2.0.sql:12-14`;
sales_delete `:64-65`; expenses trio `:125-128`; cashups
`3.2.1_to_3.3.0.sql:55-56`; attributes `3.3.0_attributes.sql:51-52`;
reports_sales_taxes `3.3.0_indiagst.sql:96-97`; sales_change_price
`3.3.2_saleschangeprice.sql:1-2`. `migrate` is inserted at
`3.0.2_to_3.1.1.sql:241-242` and deleted at `3.1.1_to_3.2.0.sql:102`.

```
permission_id                | module_id             | location_id
reports_customers            | reports               | NULL
reports_receivings           | reports               | NULL
reports_items                | reports               | NULL
reports_employees            | reports               | NULL
reports_suppliers            | reports               | NULL
reports_sales                | reports               | NULL
reports_discounts            | reports               | NULL
reports_taxes                | reports               | NULL
reports_inventory            | reports               | NULL
reports_categories           | reports               | NULL
reports_payments             | reports               | NULL
customers                    | customers             | NULL
employees                    | employees             | NULL
giftcards                    | giftcards             | NULL
items                        | items                 | NULL
item_kits                    | item_kits             | NULL
messages                     | messages              | NULL
receivings                   | receivings            | NULL
reports                      | reports               | NULL
sales                        | sales                 | NULL
config                       | config                | NULL
suppliers                    | suppliers             | NULL
items_stock                  | items                 | 1
sales_stock                  | sales                 | 1
receivings_stock             | receivings            | 1
taxes                        | taxes                 | NULL
office                       | office                | NULL
home                         | home                  | NULL
sales_delete                 | sales                 | NULL
expenses_categories          | expenses_categories   | NULL
expenses                     | expenses              | NULL
reports_expenses_categories  | reports               | NULL
cashups                      | cashups               | NULL
attributes                   | attributes            | NULL
reports_sales_taxes          | reports               | NULL
sales_change_price           | sales                 | NULL
```

The three location-scoped permissions are `items_stock`, `sales_stock`,
`receivings_stock`, all at `location_id=1` (`initial_schema.sql:396-399`).

### 3.4 `ospos_grants` — final 36 rows for `person_id=1`

All permissions are granted to admin. `menu_group` starts as `'home'` for every
pre-existing grant because the column is added with `DEFAULT 'home'`
(`3.1.1_to_3.2.0.sql:5-6`), then the following inserts/updates apply:
office/home grant rows `:16-18`; update of config/home/employees/taxes/migrate to
`office` `:20-23`; sales_delete `'--'` `:67-68`; expenses trio `:130-133`; cashups
`3.2.1_to_3.3.0.sql:58-59`; attributes `'office'` `3.3.0_attributes.sql:54-55`;
reports_sales_taxes `'home'` `3.3.0_indiagst.sql:99-100`; sales_change_price `'--'`
`3.3.2_saleschangeprice.sql:4-5`; expenses_categories→office
`20210714140000_move_expenses_categories.php:16`.

```
permission_id                | menu_group
attributes                   | office
cashups                      | home
config                       | office
customers                    | home
employees                    | office
expenses                     | home
expenses_categories          | office
giftcards                    | home
home                         | office
item_kits                    | home
items                        | home
items_stock                  | home
messages                     | home
office                       | home
receivings                   | home
receivings_stock             | home
reports                      | home
reports_categories           | home
reports_customers            | home
reports_discounts            | home
reports_employees            | home
reports_expenses_categories  | home
reports_inventory            | home
reports_items                | home
reports_payments             | home
reports_receivings           | home
reports_sales                | home
reports_sales_taxes          | home
reports_suppliers            | home
reports_taxes                | home
sales                        | home
sales_change_price           | --
sales_delete                 | --
sales_stock                  | home
suppliers                    | home
taxes                        | office
```

Note the deliberate oddity: the `office` permission's grant is in menu group
`home`, and the `home` permission's grant is in `office`
(`3.1.1_to_3.2.0.sql:16-18`). `menu_group` is nullable and has no CHECK/enum.

### 3.5 Locations, dining tables, reward packages

`ospos_stock_locations` (`initial_schema.sql:712`, backfilled by
`20261023000000_AddStockLocationDefaultAndSortOrder.php:37-55`):

```
location_id=1, location_name='stock', deleted=0, is_default=1, sort_order=0
```

`ospos_dinner_tables` (`3.0.2_to_3.1.1.sql:41-43`):

```
dinner_table_id=1, name='Delivery',  status=0, deleted=0
dinner_table_id=2, name='Take Away', status=0, deleted=0
```

`ospos_customers_packages` (`3.0.2_to_3.1.1.sql:87-92`):

```
package_id=1, package_name='Default', points_percent=0,  deleted=0
package_id=2, package_name='Bronze',  points_percent=10, deleted=0
package_id=3, package_name='Silver',  points_percent=20, deleted=0
package_id=4, package_name='Gold',    points_percent=30, deleted=0
package_id=5, package_name='Premium', points_percent=50, deleted=0
```

### 3.6 Empty business and tax tables in a fresh install

`ospos_customers`, `ospos_suppliers`, `ospos_giftcards`, `ospos_items`,
`ospos_items_taxes`, `ospos_item_kits`, `ospos_item_kit_items`,
`ospos_item_quantities`, `ospos_inventory`, `ospos_receivings`,
`ospos_receivings_items`, `ospos_sales`, `ospos_sales_items`,
`ospos_sales_items_taxes`, `ospos_sales_payments`, `ospos_sales_taxes`,
`ospos_sales_reward_points`, `ospos_customers_points`, `ospos_expense_categories`,
`ospos_expenses`, `ospos_cash_up`, `ospos_sessions`, `ospos_attribute_*`,
`ospos_tax_codes`, `ospos_tax_categories`, `ospos_tax_jurisdictions`,
`ospos_tax_rates` all contain zero rows.

Tax defaults are therefore **config-only**: `default_tax_rate=8`,
`default_tax_category='Standard'`, `default_tax_1_name=''`, `default_tax_1_rate=''`,
`default_tax_2_name=''`, `default_tax_2_rate=''`, `default_tax_code=''`,
`default_tax_jurisdiction=''`, `tax_included='0'`, `tax_decimals='2'`,
`cash_decimals='2'`, `cash_rounding_code='0'`. There is no `Standard` row in
`ospos_tax_categories` — the category ids 0–3 were deleted at
`3.0.2_to_3.1.1.sql:258`, so a UI that resolves the default by name finds nothing
until an admin creates it.

### 3.7 `ospos_migrations` rows

47 rows, one per migration, `version` = the 14-digit filename prefix (e.g.
`'20170501000000'`, `'20261023000000'`), `class` = the class name in the table in
section 2, `group='default'`, `namespace='App'`, `batch` = 1 on a fresh install,
`time` = install time. Values are install-history dependent; see section 9.

---

## 4. Final `ospos_app_config` catalog (138 rows)

Computed from the initial INSERT (`initial_schema.sql:16-85`, 69 rows) plus every
later insert/delete/rename/update. Values shown are the final stored strings after
all migrations. The "introduced by" column names the migration that first inserted
the key; values that later changed are annotated after the table.

```
key=value                                                          | introduced by
account_number=                                                    | 20230412000000_add_missing_config.php
address=123 Nowhere street                                         | initial_schema.sql
allow_duplicate_barcodes=0                                         | 3.1.1_to_3.2.0.sql
barcode_content=id                                                 | initial_schema.sql
barcode_first_row=category                                         | initial_schema.sql
barcode_font=Arial                                                 | initial_schema.sql
barcode_font_size=10                                               | initial_schema.sql
barcode_formats=[]                                                 | 3.0.2_to_3.1.1.sql
barcode_generate_if_empty=0                                        | initial_schema.sql
barcode_height=50                                                  | initial_schema.sql
barcode_num_in_row=2                                               | initial_schema.sql
barcode_page_cellspacing=20                                        | initial_schema.sql
barcode_page_width=100                                             | initial_schema.sql
barcode_second_row=item_code                                       | initial_schema.sql
barcode_third_row=unit_price                                       | initial_schema.sql
barcode_type=C39                                                   | initial_schema.sql (value changed by 20240319000000)
barcode_width=250                                                  | initial_schema.sql
cash_decimals=2                                                    | 3.0.2_to_3.1.1.sql
cash_rounding_code=0                                               | 3.0.2_to_3.1.1.sql
category_dropdown=                                                 | 20230412000000_add_missing_config.php
company=Open Source Point of Sale                                  | initial_schema.sql
company_logo=                                                      | initial_schema.sql
country_codes=us                                                   | initial_schema.sql
currency_code=                                                     | 3.3.0_add_iso_4217.sql
currency_decimals=2                                                | initial_schema.sql
currency_symbol=$                                                  | initial_schema.sql
customer_reward_enable=0                                           | 3.0.2_to_3.1.1.sql
date_or_time_format=                                               | 3.0.2_to_3.1.1.sql
dateformat=m/d/Y                                                   | initial_schema.sql
default_receivings_discount=0                                      | 3.2.1_to_3.3.0.sql
default_receivings_discount_type=0                                 | 3.2.1_to_3.3.0.sql
default_register_mode=sale                                         | 3.0.2_to_3.1.1.sql
default_sales_discount=0                                           | initial_schema.sql
default_sales_discount_type=0                                      | 3.2.1_to_3.3.0.sql
default_tax_1_name=                                                | 3.0.2_to_3.1.1.sql
default_tax_1_rate=                                                | 3.0.2_to_3.1.1.sql
default_tax_2_name=                                                | 3.0.2_to_3.1.1.sql
default_tax_2_rate=                                                | 3.0.2_to_3.1.1.sql
default_tax_category=Standard                                      | 3.0.2_to_3.1.1.sql
default_tax_code=                                                  | 3.0.2_to_3.1.1.sql (renamed from default_origin_tax_code by 3.3.0_indiagst.sql)
default_tax_jurisdiction=                                          | 3.3.0_indiagst.sql
default_tax_rate=8                                                 | initial_schema.sql
derive_sale_quantity=0                                             | 3.1.1_to_3.2.0.sql
dinner_table_enable=0                                              | 3.0.2_to_3.1.1.sql
email=changeme@example.com                                         | initial_schema.sql
email_receipt_check_behaviour=last                                 | 3.1.1_to_3.2.0.sql
enforce_privacy=0                                                  | 3.2.0_to_3.2.1.sql
fax=                                                               | initial_schema.sql
financial_year=1                                                   | 3.0.2_to_3.1.1.sql
gcaptcha_enable=0                                                  | 3.0.2_to_3.1.1.sql
gcaptcha_secret_key=                                               | 3.0.2_to_3.1.1.sql
gcaptcha_site_key=                                                 | 3.0.2_to_3.1.1.sql
giftcard_number=series                                             | 3.0.2_to_3.1.1.sql
image_allowed_types=gif,jpg,png                                    | 20200508000000_image_upload_defaults.php (value changed by 3.4.0_CI4Conversion.sql)
image_max_height=480                                               | 20200508000000_image_upload_defaults.php
image_max_size=128                                                 | 20200508000000_image_upload_defaults.php
image_max_width=640                                                | 20200508000000_image_upload_defaults.php
include_hsn=0                                                      | 3.3.0_indiagst.sql
invoice_default_comments=This is a default comment                  | initial_schema.sql
invoice_email_message=Dear {CU}, In attachment the receipt for sale {ISEQ} | initial_schema.sql (tokens rewritten by 3.0.2_to_3.1.1.sql:313-316)
invoice_enable=1                                                   | initial_schema.sql
invoice_type=invoice                                               | 3.3.0_indiagst.sql
key_amount=53 | ALT + 5                                            | 20260506000000_AddShortcutKeys.php
key_cancel=27 | ESC                                                | 20260506000000_AddShortcutKeys.php
key_complete=55 | ALT + 7                                          | 20260506000000_AddShortcutKeys.php
key_customers=50 | ALT + 2                                         | 20260506000000_AddShortcutKeys.php
key_finish=56 | ALT + 8                                            | 20260506000000_AddShortcutKeys.php
key_help=57 | ALT + 9                                              | 20260506000000_AddShortcutKeys.php
key_items=49 | ALT + 1                                             | 20260506000000_AddShortcutKeys.php
key_payment=54 | ALT + 6                                           | 20260506000000_AddShortcutKeys.php
key_suspend=51 | ALT + 3                                           | 20260506000000_AddShortcutKeys.php
key_suspended=52 | ALT + 4                                         | 20260506000000_AddShortcutKeys.php
language=english                                                   | initial_schema.sql (reset by 3.4.0_CI4Conversion.sql)
language_code=en                                                   | initial_schema.sql (en→en-US→en)
last_used_invoice_number=0                                         | 3.0.2_to_3.1.1.sql
last_used_quote_number=0                                           | 3.0.2_to_3.1.1.sql
last_used_work_order_number=0                                      | 3.1.1_to_3.2.0.sql
line_sequence=0                                                    | 3.0.2_to_3.1.1.sql
lines_per_page=25                                                  | initial_schema.sql
login_form=                                                        | 20230412000000_add_missing_config.php
mailpath=/usr/sbin/sendmail                                        | initial_schema.sql
msg_msg=                                                           | initial_schema.sql
msg_pwd=                                                           | initial_schema.sql
msg_src=                                                           | initial_schema.sql
msg_uid=                                                           | initial_schema.sql
multi_pack_enabled=0                                               | 3.2.1_to_3.3.0.sql
notify_horizontal_position=center                                  | initial_schema.sql
notify_vertical_position=bottom                                    | initial_schema.sql
number_locale=en_US                                                | initial_schema.sql
payment_message=                                                   | 20230412000000_add_missing_config.php
payment_options_order=cashdebitcredit                              | initial_schema.sql
phone=555-555-5555                                                 | initial_schema.sql
print_bottom_margin=0                                              | initial_schema.sql
print_delay_autoreturn=0                                           | 3.2.0_to_3.2.1.sql
print_footer=0                                                     | initial_schema.sql
print_header=0                                                     | initial_schema.sql
print_left_margin=0                                                | initial_schema.sql
print_receipt_check_behaviour=last                                 | 3.1.1_to_3.2.0.sql
print_right_margin=0                                               | initial_schema.sql
print_silently=1                                                   | initial_schema.sql
print_top_margin=0                                                 | initial_schema.sql
protocol=mail                                                      | initial_schema.sql
quantity_decimals=0                                                | initial_schema.sql
quote_default_comments=This is a default quote comment              | 3.1.1_to_3.2.0.sql
receipt_font_size=12                                               | 3.0.2_to_3.1.1.sql
receipt_show_company_name=1                                        | 3.0.2_to_3.1.1.sql
receipt_show_description=1                                         | initial_schema.sql
receipt_show_serialnumber=1                                        | initial_schema.sql
receipt_show_tax_ind=0                                             | 20191008100000_receipttaxindicator.php
receipt_show_taxes=0                                               | initial_schema.sql
receipt_show_total_discount=1                                      | initial_schema.sql
receipt_template=receipt_default                                   | initial_schema.sql
receiving_calculate_average_price=                                 | 20230412000000_add_missing_config.php
recv_invoice_format={CO}                                           | initial_schema.sql (token rewritten)
return_policy=Test                                                 | initial_schema.sql
sales_invoice_format={CO}                                          | initial_schema.sql (token rewritten)
sales_quote_format=Q%y{QSEQ:6}                                     | 3.0.2_to_3.1.1.sql
smtp_crypto=ssl                                                    | initial_schema.sql (INSERT IGNORE kept this over 'tls' at 20250716170000)
smtp_host=                                                         | 20230412000000_add_missing_config.php
smtp_pass=                                                         | 20230412000000_add_missing_config.php
smtp_port=465                                                      | initial_schema.sql (kept over 587)
smtp_timeout=5                                                     | initial_schema.sql (kept over 5000)
smtp_user=                                                         | 20230412000000_add_missing_config.php
statistics=1                                                       | initial_schema.sql
suggestions_first_column=name                                      | 3.1.1_to_3.2.0.sql
suggestions_second_column=                                         | 3.1.1_to_3.2.0.sql
suggestions_third_column=                                          | 3.1.1_to_3.2.0.sql
tax_decimals=2                                                     | initial_schema.sql
tax_id=                                                            | 3.3.0_indiagst.sql
tax_included=0                                                     | initial_schema.sql
theme=flatly                                                       | initial_schema.sql
thousands_separator=1                                              | initial_schema.sql
timeformat=H:i:s                                                   | initial_schema.sql
timezone=America/New_York                                          | initial_schema.sql
use_destination_based_tax=0                                        | 3.0.2_to_3.1.1.sql (renamed from customer_sales_tax_support by 3.3.0_indiagst.sql)
website=                                                           | initial_schema.sql
work_order_enable=0                                                | 3.1.1_to_3.2.0.sql
work_order_format=W%y{WSEQ:6}                                       | 3.1.1_to_3.2.0.sql
```

Deleted keys: `barcode_quality` (`3.1.1_to_3.2.0.sql:204`), `print_after_sale`
(never present; delete at `3.0.2_to_3.1.1.sql:336`), `custom1_name`…`custom10_name`
(`3.3.0_attributes.sql:184`, never present).

---

## 5. Target diff

Target schema sources: SQLite `src/db/schema/*.ts` and the generated
`drizzle/sqlite/0000_skinny_power_man.sql` + `0001_spotty_giant_girl.sql` +
`0002_slow_madame_web.sql`; MySQL `src/db/schema/mysql/index.ts` and
`drizzle/mysql/0000_demonic_darkstar.sql` + `0001_dusty_alice.sql`. Actual SQLite
schemas were read from `sqlite.db` and `ospos.db`.

Notation in 5.2: `U` = upstream final MySQL; `TM` = target MySQL Drizzle; `TS` =
target SQLite Drizzle. Where TS is not mentioned it is the same logical shape as TM
with SQLite affinities (`text`/`integer`/`real`) and the deltas listed in 5.3.

### 5.1 Table presence

| Upstream table | Target MySQL | Target SQLite | Verdict |
|---|---|---|---|
| `ospos_app_config` | `app_config` | `app_config` | present |
| `ospos_attribute_definitions` | `attribute_definitions` | `attribute_definitions` | present |
| `ospos_attribute_links` | `attribute_links` | `attribute_links` | present (shape differs) |
| `ospos_attribute_values` | `attribute_values` | `attribute_values` | present (shape differs) |
| `ospos_cash_up` | `cashups` | `cashups` | **renamed + reduced** |
| `ospos_customers` | `customers` | `customers` | present (reduced) |
| `ospos_customers_packages` | — | — | **missing** |
| `ospos_customers_points` | — | — | **missing** |
| `ospos_dinner_tables` | `dinner_tables` | `dinner_tables` | present |
| `ospos_employees` | `employees` | `employees` | present |
| `ospos_expense_categories` | `expense_categories` | `expense_categories` | present (renamed columns) |
| `ospos_expenses` | `expenses` | `expenses` | present (reduced) |
| `ospos_giftcards` | `giftcards` | `giftcards` | present (reduced) |
| `ospos_grants` | `grants` | `grants` | present (type/default differ; TS loses PK) |
| `ospos_inventory` | `inventory` | `inventory` | present |
| `ospos_item_kit_items` | `item_kit_items` | `item_kit_items` | present (PK differs) |
| `ospos_item_kits` | `item_kits` | `item_kits` | present |
| `ospos_item_quantities` | `item_quantities` | `item_quantities` | present (TS loses PK) |
| `ospos_items` | `items` | `items` | present (many deltas) |
| `ospos_items_taxes` | `items_taxes` | `items_taxes` | present, **no PK** in both |
| `ospos_migrations` | `migrations` | `migrations` | **wrong shape/name** (target never uses it) |
| `ospos_modules` | `modules` | `modules` | present |
| `ospos_people` | `people` | `people` | present (nullability) |
| `ospos_permissions` | `permissions` | `permissions` | present |
| `ospos_receivings` | `receivings` | `receivings` | present (reshaped) |
| `ospos_receivings_items` | `receivings_items` | `receivings_items` | present (TS loses PK) |
| `ospos_sales` | `sales` | `sales` | present (reshaped) |
| `ospos_sales_items` | `sales_items` | `sales_items` | present; MySQL PK kept, **SQLite loses PK** |
| `ospos_sales_items_taxes` | `sales_items_taxes` | `sales_items_taxes` | present, **no PK**, 6 columns missing |
| `ospos_sales_payments` | `sales_payments` | `sales_payments` | present, **no PK**, identity missing |
| `ospos_sales_reward_points` | — | — | **missing** |
| `ospos_sales_taxes` | `sales_taxes` | `sales_taxes` | present, **no PK**, 8 columns missing |
| `ospos_sessions` | `sessions` | `sessions` | present (PK/type differ) |
| `ospos_stock_locations` | `stock_locations` | `stock_locations` | present, 2 columns missing |
| `ospos_suppliers` | `suppliers` | `suppliers` | present, 2 columns missing |
| `ospos_tax_categories` | `tax_categories` | `tax_categories` | present (renamed+retyped) |
| `ospos_tax_codes` | `tax_codes` | `tax_codes` | present (lengths) |
| `ospos_tax_jurisdictions` | `tax_jurisdictions` | `tax_jurisdictions` | present (retyped/extra cols) |
| `ospos_tax_rates` | `tax_code_links` | `tax_code_links` | **renamed + re-keyed** |

Target-only tables: `cart_sessions` (`src/db/schema/auth.ts:61-66`;
`src/db/schema/mysql/index.ts:75-80`), `rewards` (`src/db/schema/customers.ts:32-37`),
`customer_rewards` (`src/db/schema/customers.ts:39-42`). Internal table
`__drizzle_migrations` exists only in the actual SQLite files.

### 5.2 Column-by-column diff, (a) upstream vs target MySQL and (b) upstream vs target SQLite

#### `app_config`
- U: `key varchar(50) NOT NULL` PK; `value varchar(500) NOT NULL`.
- TM: identical (`src/db/schema/mysql/index.ts:83-86`).
- TS: `key text PK`, `value text NOT NULL` (`src/db/schema/config.ts:3-6`) — no length
  constraints; SQLite cannot enforce them. **Verdict: OK.**
- Missing: table charset/collation. Target generated SQL specifies none
  (`drizzle/mysql/0000_demonic_darkstar.sql:1-5`), so the server default applies
  (MySQL 8: `utf8mb4_0900_ai_ci`; MariaDB: `utf8mb4_general_ci`) instead of
  `utf8mb4_unicode_520_ci`.

#### `attribute_definitions`
- U: 7 columns; `definition_type varchar(45) NOT NULL`; `definition_unit varchar(16)`;
  `definition_flags tinyint(1) NOT NULL` (no default); keys `definition_fk`,
  `definition_name`, `definition_type`; self-FK.
- TM: `definition_type varchar(255)` (`mysql/index.ts:298`), `definition_unit
  varchar(255)` (`:299`), `definition_flags tinyint NOT NULL DEFAULT 0` (`:300`).
- Missing in TM: keys `definition_fk`, `definition_name`, `definition_type`; self-FK
  `fk_ospos_attribute_definitions_ibfk_1`. `definition_fk` column exists (`:301`).
- Extra in TM: default `0` on `definition_flags`.
- TS: same shape (`src/db/schema/attributes.ts:4-12`); no indexes/FKs.
- **Verdict: medium (lengths, missing indexes/FK, wrong default).**

#### `attribute_links`
- U: 6 columns incl. generated `generated_unique_column` with a `CASE`; three unique
  keys `uq1`, `uq2`, `uq3`; five FK indexes; five FKs (1/2 RESTRICT, 3/4/5 default).
- TM: 6 columns; generated expression is `CONCAT(definition_id, '-', item_id)` with
  **no CASE** (`src/db/schema/mysql/index.ts:318-321`;
  `drizzle/mysql/0000_demonic_darkstar.sql:24`); one unique index on the generated
  column (`mysql/index.ts:322-324`).
- Missing in TM: `attribute_links_uq1`, `attribute_links_uq2`, keys
  `attribute_id`/`definition_id`/`item_id`/`sale_id`/`receiving_id`; FKs
  `receiving_id` and `sale_id`.
- Different FK action: TM `item_id → items` is `ON DELETE CASCADE`
  (`drizzle/mysql/0000_demonic_darkstar.sql:414`), U is default/no action.
- TS: no generated column, no unique index, no `uq1/uq2/uq3`, only FKs
  attribute/definition/item with item cascade (`src/db/schema/attributes.ts:21-27`;
  `drizzle/sqlite/0000_skinny_power_man.sql:163-172`).
- **Verdict: critical** — the TM expression blocks multiple sale/receiving links for
  the same definition+item, and TS has no duplicate guard at all.

#### `attribute_values`
- U: `attribute_value varchar(255) UNIQUE`; `attribute_date DATE UNIQUE`;
  `attribute_decimal DECIMAL(7,3) UNIQUE`.
- TM: `attribute_value text` (`mysql/index.ts:307`), `attribute_date varchar(255)`
  (`:308`), `attribute_decimal decimal(15,4)` (`:309`); **no unique keys**.
- TS: `text`, `text`, `real` (`src/db/schema/attributes.ts:14-19`); no uniques.
- **Verdict: critical** — duplicate values allowed; date type loses SQL date
  semantics; decimal precision widened from 7,3 to 15,4.

#### `cash_up` → `cashups`
- U: 15 columns (section 1.2.5).
- TM: 9 columns (`src/db/schema/mysql/index.ts:386-396`).
- Missing in TM: `closed_amount_card`, `closed_amount_check`,
  `closed_amount_total`, `description`, `open_employee_id`, `close_employee_id`,
  `closed_amount_due`.
- Renamed: `open_employee_id` → `employee_id`.
- Extra: `employee_id` (a single employee, not open/close pair).
- Retyped: `open_date`/`close_date` timestamp→int; `note` tinyint→text;
  amounts decimal(15,2)→decimal(15,4); `deleted` tinyint(1)→tinyint.
- TS: same reduction (`src/db/schema/cashups.ts:4-14`); note is `text`, dates
  `integer`, amounts `real`.
- **Verdict: critical** — 7 columns of cashup data cannot be stored; the open/close
  employee distinction is lost.

#### `customers`
- U: 14 columns (section 1.2.6).
- TM: 9 columns (`src/db/schema/mysql/index.ts:159-169`).
- Missing in TM: `tax_id`, `package_id`, `date`, `employee_id`, `consent`.
- Retyped: `discount` decimal(15,2)→decimal(15,4); `points` nullable no default →
  `int NOT NULL DEFAULT 0`; `deleted` tinyint(1)→tinyint; `taxable` tinyint(1)→tinyint.
- Keys: TM has PK `person_id`, FK person and `sales_tax_code_id`; missing
  `account_number` index, `company_name` index, `package_id` index/FK.
- TS: same columns (`src/db/schema/customers.ts:5-15`) with `discount real`,
  `points integer NOT NULL DEFAULT 0`, `taxable integer boolean`.
- **Verdict: critical** — customer tax id, package/points ledger linkage, GDPR
  date/employee/consent are not representable.

#### `customers_packages` — **absent in target**
- U: 5 seed rows and the target for `customers.package_id` FK.
- TM/TS: no table. The conceptually nearest target table `rewards`
  (`src/db/schema/customers.ts:32-37`) uses `reward_id`, `name`, `points_percent`,
  `deleted`; `package_name` is renamed and no seed rows exist.
- **Verdict: critical.**

#### `customers_points` — **absent in target**
- U: per-sale points ledger (`person_id`, `package_id`, `sale_id`, `points_earned`).
- TM/TS: no equivalent; `customer_rewards` only links customer↔reward and has no
  sale or points-earned columns (`src/db/schema/customers.ts:39-42`).
- **Verdict: critical (data loss).**

#### `dinner_tables`
- U: `dinner_table_id int(11) AUTO_INCREMENT`, `name varchar(30) NOT NULL`,
  `status tinyint(1) DEFAULT 0`, `deleted tinyint(1) DEFAULT 0`, KEY `status`.
- TM: `name varchar(255)` (`mysql/index.ts:181`), no `status` index.
- TS: same (`src/db/schema/customers.ts:25-30`).
- **Verdict: low/medium** (length + missing index; no seed rows — see section 6).

#### `employees`
- U: `language varchar(48)`, `language_code varchar(8)`.
- TM: both `varchar(255)` (`mysql/index.ts:37-38`). `hash_version` tinyint(1)→tinyint;
  `deleted` tinyint(1)→tinyint.
- TS: `text` (`src/db/schema/auth.ts:25-26`); PK + unique username + cascade FK match.
- **Verdict: low.**

#### `expense_categories`
- U: `category_name varchar(255) DEFAULT NULL`, `category_description varchar(255)
  NOT NULL`, UNIQUE `category_name`, KEY `category_description`.
- TM: `category varchar(255) NOT NULL` (`mysql/index.ts:380`), `description text`
  (`:381`); missing unique and index.
- Renamed: `category_name`→`category`, `category_description`→`description`.
- TS: same (`src/db/schema/expenses.ts:15-20`).
- **Verdict: high** — importer must map two renamed columns, and uniqueness is lost.

#### `expenses`
- U: 11 columns (section 1.2.12).
- TM: 8 columns (`mysql/index.ts:367-376`).
- Missing in TM: `date`, `supplier_tax_code`, `tax_amount`, `supplier_id`.
- Extra/renamed: `expense_time int NOT NULL` replaces `date`.
- Retyped: `payment_type varchar(40)`→`varchar(255)`;
  `expense_category_id NOT NULL`→nullable; `description varchar(255) NOT NULL`→`text`
  nullable; `amount decimal(15,2)`→`decimal(15,4) NOT NULL DEFAULT 0`.
- Missing keys/FKs: `date`, `payment_type`, `amount`, `expense_category_id` index and
  FKs to `expense_categories`/`suppliers`; `employee_id` FK present.
- TS: same (`src/db/schema/expenses.ts:4-13`).
- **Verdict: critical** — supplier tax/tax amount and accounting date are lost;
  category is not enforced.

#### `giftcards`
- U: 6 columns incl. `record_time timestamp DEFAULT CURRENT_TIMESTAMP`;
  `giftcard_number varchar(255) NULL UNIQUE`; `value decimal(15,2) NOT NULL`.
- TM: 5 columns (`mysql/index.ts:399-405`); **missing `record_time`**;
  `giftcard_number varchar(255) NOT NULL UNIQUE` (nullability inverted);
  `value decimal(15,4) NOT NULL DEFAULT 0`.
- TS: same (`src/db/schema/giftcards.ts:4-10`), `value real`.
- **Verdict: high** (audit timestamp lost; NULL giftcard numbers impossible).

#### `grants`
- U: `menu_group varchar(32) DEFAULT 'home'` (nullable); PK
  `(permission_id,person_id)`; person index; both FKs cascade.
- TM: `menu_group varchar(10) NOT NULL DEFAULT 'both'` (`mysql/index.ts:63`);
  composite PK and cascade FKs match (`:64-66`).
- TS: `menu_group text DEFAULT 'both'` with an enum comment
  `["home","office","both"]` (`src/db/schema/auth.ts:51`) and **no primary key**
  (`drizzle/sqlite/0000_skinny_power_man.sql:20-26`; actual
  `PRAGMA table_info('grants')` reports zero PK columns).
- **Verdict: high** — upstream value `'--'` is outside the target's enum and does not
  fit the intended semantics; SQLite permits duplicate grants.

#### `inventory`
- U: `trans_items/trans_user INT NOT NULL DEFAULT 0`, `trans_date timestamp NOT
  NULL DEFAULT CURRENT_TIMESTAMP`, `trans_comment text NOT NULL`, `trans_location
  INT NOT NULL`, `trans_inventory decimal(15,3)`.
- TM: `trans_items/trans_user` nullable, `trans_date int NOT NULL`, `trans_comment
  text` nullable, `trans_location` nullable, `trans_inventory decimal(15,4) DEFAULT 0`
  (`mysql/index.ts:127-135`).
- Missing keys: `trans_date` and composite `trans_items_trans_date`; explicit
  trans_items/trans_user/trans_location keys exist only implicitly via FKs.
- TS: same (`src/db/schema/items.ts:40-48`); `trans_date integer` with a JS default
  (`:44`).
- **Verdict: high** — audit trail can be created without item/user/location; DB-side
  timestamp default lost.

#### `item_kit_items`
- U: PK `(item_kit_id,item_id,quantity)`; `quantity decimal(15,3) NOT NULL` (no
  default); `kit_sequence int(3) DEFAULT 0`.
- TM: PK `(item_kit_id,item_id,kit_sequence)` (`mysql/index.ts:154-156`);
  `quantity decimal(15,4) NOT NULL DEFAULT 1`.
- TS: no PK (`src/db/schema/items.ts:62-67`; `drizzle/sqlite/0000_skinny_power_man.sql:91-98`);
  `quantity real DEFAULT 1`.
- **Verdict: high** — duplicate component rows become possible; PK change alters
  identity semantics.

#### `item_kits`
- U: 9 columns; `description varchar(255) NOT NULL`; `item_id int(10) NOT NULL
  DEFAULT 0` **no FK**; `kit_discount decimal(15,2)`; keys `item_kit_number`,
  `name(name,description)`.
- TM: `description text` nullable (`mysql/index.ts:141`); `item_id int` nullable with
  FK to items (`:142`); `kit_discount decimal(15,4)` (`:143`).
- Missing keys: `item_kit_number`, `name(name,description)`.
- TS: same (`src/db/schema/items.ts:50-60`).
- **Verdict: medium** — nullability/FK differ; missing indexes.

#### `item_quantities`
- U: PK `(item_id,location_id)`; `quantity decimal(15,3) DEFAULT 0`; both FKs no
  action.
- TM: PK matches (`mysql/index.ts:123-125`); `quantity decimal(15,4) DEFAULT 0`;
  both FKs **cascade** (`drizzle/mysql/0000_demonic_darkstar.sql:430-431`).
- TS: no PK (`src/db/schema/items.ts:34-38`); both FKs cascade.
- **Verdict: high** — SQLite permits duplicate stock rows for one item/location;
  cascade deletes inventory on item/location removal (upstream blocks).

#### `items`
- U: 21 columns (section 1.2.19).
- TM: 20 columns (`mysql/index.ts:89-111`); all names present except none removed;
  order differs.
- Retyped: `category NOT NULL`→nullable; `description varchar(255) NOT NULL`→`text`
  nullable; `cost_price/unit_price decimal(15,2)`→`decimal(15,4) NOT NULL DEFAULT 0`;
  `reorder_level`, `receiving_quantity`, `qty_per_pack` decimal(15,3)→(15,4);
  `allow_alt_description`/`is_serialized` `NOT NULL` no default→`NOT NULL DEFAULT 0`;
  `pack_name varchar(8) DEFAULT 'Each'`→`varchar(255)` no default;
  `low_sell_item_id int(10) DEFAULT 0`→`int` nullable no default;
  `hsn_code varchar(32) NOT NULL DEFAULT ''`→`varchar(255)` nullable.
- Missing indexes/unique: `item_number`, `supplier_id`, `deleted(deleted,item_type)`,
  `item_id(item_id,deleted)`, UNIQUE `items_uq1`.
- TS: same (`src/db/schema/items.ts:4-26`), `real` for all money/quantities.
- **Verdict: critical** — no duplicate-barcode index parity, no item uniqueness, and
  numeric precision widening from 2/3 to 4 decimals changes stored values.

#### `items_taxes`
- U: PK `(item_id,name,percent)`; `percent decimal(15,3) NOT NULL` (no default);
  FK `item_id → items ON DELETE CASCADE`.
- TM: **no primary key at all** (`mysql/index.ts:113-117`;
  `drizzle/mysql/0000_demonic_darkstar.sql:196-200`); `percent decimal(15,4) NOT NULL
  DEFAULT 0`; FK cascade present.
- TS: **no PK** (`src/db/schema/items.ts:28-32`); `percent real DEFAULT 0`.
- **Verdict: critical** — duplicate tax rows allowed, making tax calculation and
  report aggregation nondeterministic.

#### `migrations` (vs `ospos_migrations`)
- U: `id bigint unsigned`, `version varchar(255)`, `class`, `group`, `namespace`,
  `time int`, `batch int unsigned`; PK id.
- TM: `migrations` table with `id int AUTO_INCREMENT`, **`version int`**, `class
  varchar(255)`, `namespace varchar(255)`, `time int`; **missing `group` and
  `batch`** (`src/db/schema/mysql/index.ts:408-414`).
- TS: same (`src/db/schema/misc.ts:3-9`), `version integer`.
- The target never reads or writes this table; Drizzle uses `__drizzle_migrations`
  instead. The table is a misleading, wrong mirror of CI4's ledger.
- **Verdict: medium** — not used by the target, but fatal for any tooling that
  expects to read OSPOS's own migration ledger.

#### `modules`
- U: `sort int(10) NOT NULL` (no default); UNIQUE `name_lang_key` and
  `desc_lang_key`.
- TM: `sort int NOT NULL DEFAULT 0` (`mysql/index.ts:45`); only
  `desc_lang_key` unique (`:44`). `name_lang_key` uniqueness missing.
- TS: same (`src/db/schema/auth.ts:29-34`); `sort integer DEFAULT 0`.
- **Verdict: medium** — missing unique key; default masks unset sorts.

#### `people`
- U: 13 columns, with `last_name`, `phone_number`, `email`, `address_1`,
  `address_2`, `city`, `state`, `zip`, `country` all `NOT NULL`, `comments text NOT
  NULL`; `gender int(1) NULL`; indexes `email` and composite `first_name`
  (191-prefixed).
- TM: only `first_name` is `NOT NULL`; `last_name` through `comments` are nullable;
  `gender tinyint DEFAULT 0` (`mysql/index.ts:15-29`). No indexes.
- TS: same nullability (`src/db/schema/auth.ts:3-17`); `gender integer DEFAULT 0`;
  person_id `AUTOINCREMENT`.
- **Verdict: high** — importing upstream rows works, but target rows can violate
  upstream's mandatory address/contact fields; the default `gender=0` differs from
  seed `NULL`.

#### `permissions`
- U: `permission_id varchar(255) PK`, `module_id varchar(255) NOT NULL`,
  `location_id int(10) NULL`; FKs cascade to modules/locations; keys module_id and
  location_id.
- TM: identical columns/FKs (`src/db/schema/mysql/index.ts:54-58`).
- TS: identical (`src/db/schema/auth.ts:42-46`).
- **Verdict: OK** (aside from seed rows, section 6).

#### `receivings`
- U: 7 columns: `receiving_time timestamp`, `supplier_id`, `employee_id DEFAULT 0`,
  `comment text NOT NULL`, `receiving_id`, `payment_type varchar(20)`,
  `reference varchar(32)`; keys supplier/employee/reference/receiving_time.
- TM: 9 columns: `receiving_id`, `receiving_time int NOT NULL`, `supplier_id`,
  `employee_id`, `comment text`, `payment_type text`, `receiving_ref int`,
  `invoice_number varchar(255)`, `receiving_location int`
  (`mysql/index.ts:264-274`).
- Missing: `reference`. Extra: `receiving_ref`, `invoice_number`,
  `receiving_location`.
- FK actions/relations: TM `supplier_id → people` (U → suppliers);
  `receiving_ref → receivings` self-FK (U has no such column); no `reference`
  index/timestamp index.
- TS: same (`src/db/schema/receivings.ts:5-15`); the self-FK was dropped by
  `drizzle/sqlite/0001_spotty_giant_girl.sql:1-20` (actual `receivings` has no
  self-FK).
- **Verdict: critical** — the receiving reference document number is lost; supplier
  referential integrity points at the wrong table.

#### `receivings_items`
- U: 12 columns; `description/serialnumber varchar(30)`; `line int(3) NOT NULL`;
  `item_location INT NOT NULL`; `quantity decimal(15,3)`; PK
  `(receiving_id,item_id,line)`.
- TM: 13 columns; adds `transfer_item_location int`; description/serialnumber
  `text`; line has no default in TM (U default 0); `item_location` nullable;
  decimals (15,4); PK `(receiving_id,item_id,line)` (`mysql/index.ts:276-292`).
- TS: same plus **no PK** (`src/db/schema/receivings.ts:17-31`;
  `drizzle/sqlite/0000_skinny_power_man.sql:240-257`).
- **Verdict: high** — TS duplicate line vulnerability; extra transfer location is
  target-only (no upstream data source).

#### `sales`
- U: 11 columns (section 1.2.27); `invoice_number varchar(32) UNIQUE`;
  `employee_id NOT NULL DEFAULT 0`; `comment text NOT NULL`.
- TM: 14 columns (`mysql/index.ts:201-216`); **extra `sale_location`,
  `sale_cash_adjustment`, `sale_cash_refund`**; `invoice_number/quote_number/
  work_order_number varchar(255)`; `sale_time int NOT NULL`; `comment text` nullable;
  `employee_id int` nullable; no unique invoice index; `customer_id → people`
  instead of `customers`.
- TS: same (`src/db/schema/sales.ts:5-20`).
- **Verdict: critical** — invoice uniqueness is lost; customer FK points at people;
  three target-only columns have no upstream source.

#### `sales_items`
- U: 12 columns; PK `(sale_id,item_id,line)`; `description varchar(255) NULL`;
  `serialnumber varchar(30) NULL`; `line int(3) DEFAULT 0`; `item_cost_price`/
  `item_unit_price decimal(15,2) NOT NULL` (no defaults); `item_location INT NOT
  NULL`.
- TM: 12 columns; PK `(sale_id,item_id,line)` **is preserved**
  (`drizzle/mysql/0000_demonic_darkstar.sql:313`); `description/serialnumber
  text`; line no default; unit/cost price `decimal(15,4) DEFAULT 0`; item_location
  nullable.
- TS: same columns but **no PK** (`src/db/schema/sales.ts:22-35`;
  `drizzle/sqlite/0000_skinny_power_man.sql:279-295`).
- **Verdict: high** — SQLite allows duplicate sale lines; item location is not
  mandatory in either dialect.

#### `sales_items_taxes`
- U: 12 columns; PK `(sale_id,item_id,line,name,percent)`; has `tax_type`,
  `rounding_code`, `cascade_sequence`, `sales_tax_code_id`, `jurisdiction_id`,
  `tax_category_id`.
- TM: 6 columns: `sale_id`, `item_id`, `line`, `name`, `percent decimal(15,4) DEFAULT
  0`, `item_tax_amount decimal(15,4) DEFAULT 0` (`mysql/index.ts:235-242`); **no
  PK**.
- Missing: 6 columns listed in D5. TS same (`src/db/schema/sales.ts:37-44`).
- **Verdict: critical** — destination-based tax attribution cannot be stored at
  line level; duplicates possible.

#### `sales_payments`
- U: 8 columns incl. surrogate `payment_id` PK, `cash_refund`, `reference_code
  varchar(40)`, `payment_time timestamp`, `employee_id int(11) NULL`; key
  `payment_sale(sale_id,payment_type)`, `payment_time`.
- TM: 7 columns, **no PK** (`mysql/index.ts:253-261`); missing `payment_id`,
  `reference_code`; extra `cash_adjustment decimal(15,4) NOT NULL DEFAULT 0`;
  `payment_type varchar(255)`; `payment_amount/cash_refund decimal(15,4)`;
  `payment_time int NOT NULL` with JS default.
- TS: same (`src/db/schema/sales.ts:55-63`), `payment_time integer` nullable.
- **Verdict: critical** — payment identity and reference codes lost; duplicate
  payments and partial refunds cannot be distinguished reliably.

#### `sales_reward_points` — **absent in target**
- U: `id`, `sale_id`, `earned float`, `used float`; FK sale.
- TM/TS: no equivalent (target `customer_rewards` has no sale/earned/used).
- **Verdict: critical (data loss).**

#### `sales_taxes`
- U: 13 columns; PK `sales_taxes_id`; key `print_sequence(sale_id,
  print_sequence,tax_group)`.
- TM: 6 columns: `sale_id`, `tax_type tinyint NOT NULL`, `round_code tinyint NOT
  NULL`, `tax_group varchar(255) NOT NULL`, `sale_tax_basis decimal(15,4) DEFAULT 0`,
  `sale_tax_amount decimal(15,4) DEFAULT 0` (`mysql/index.ts:244-251`); **no PK**.
- Missing: `sales_taxes_id`, `jurisdiction_id`, `tax_category_id`, `print_sequence`,
  `name`, `tax_rate`, `sales_tax_code_id`, `rounding_code`.
- Renamed: `rounding_code`→`round_code` (and placed before `tax_group`).
- TS: same (`src/db/schema/sales.ts:46-53`).
- **Verdict: critical** — the tax report has no per-jurisdiction/per-code identity,
  no rate, no name, and no ordering.

#### `sessions`
- U: `id varchar(128) NOT NULL`, `ip_address varchar(45) NOT NULL`, `timestamp
  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`, `data blob NOT NULL`, PK
  `(id,ip_address)`, key timestamp.
- TM: `id varchar(128) PRIMARY KEY`, `ip_address varchar(45)` nullable, `timestamp
  int NOT NULL`, `data text` (`mysql/index.ts:68-73`).
- TS: same (`src/db/schema/auth.ts:54-59`).
- **Verdict: high** — with CI `matchIP=true`, the composite key is required upstream;
  target's single-column PK merges sessions across IPs and cannot store binary
  session payloads.

#### `stock_locations`
- U: 5 columns incl. `is_default tinyint(1) NOT NULL DEFAULT 0` and `sort_order
  tinyint unsigned NULL UNIQUE`; `location_name varchar(255) DEFAULT NULL`.
- TM: 3 columns (`mysql/index.ts:48-52`); missing both new columns;
  `location_name varchar(255) NOT NULL`; `deleted tinyint NOT NULL DEFAULT 0`.
- TS: same (`src/db/schema/auth.ts:36-40`).
- **Verdict: high** — default location and ordering cannot be represented; import of
  upstream settings loses them.

#### `suppliers`
- U: 7 columns; `company_name/agency_name NOT NULL`; `tax_id varchar(32) NOT NULL
  DEFAULT ''`; `category tinyint(1) NOT NULL`; unique account_number; keys category,
  company_name+deleted.
- TM: 5 columns (`mysql/index.ts:171-177`); missing `tax_id`, `category`; company/
  agency nullable; no category/company indexes.
- TS: same (`src/db/schema/customers.ts:17-23`).
- **Verdict: high** — supplier tax id and category lost; mandatory names become
  optional.

#### `tax_categories`
- U: `tax_category varchar(32) NOT NULL`, `tax_group_sequence tinyint(1) NOT NULL`,
  `deleted tinyint(1)`.
- TM: `tax_category varchar(255)` (`mysql/index.ts:329`), `tax_group_seq
  varchar(255)` (`:330`) — **renamed `tax_group_sequence`→`tax_group_seq` and
  retyped tinyint→varchar**; `deleted tinyint DEFAULT 0`.
- TS: same (`src/db/schema/taxes.ts:4-9`).
- **Verdict: high** — the sequence column is unusable as a number without casting.

#### `tax_codes`
- U: `tax_code varchar(32)`, `tax_code_name varchar(255) NOT NULL DEFAULT ''`,
  `city/state varchar(255) NOT NULL DEFAULT ''`, `deleted tinyint(1) NOT NULL DEFAULT
  0`.
- TM: `tax_code varchar(255)` (`mysql/index.ts:335`), name `NOT NULL` no default,
  city/state nullable no default, `deleted tinyint DEFAULT 0`.
- TS: same (`src/db/schema/taxes.ts:11-18`), all text.
- **Verdict: medium** — lengths/defaults differ; the 32-char business key is widened.

#### `tax_jurisdictions`
- U: 8 columns; `tax_group varchar(32) NOT NULL UNIQUE`; `tax_type smallint(2) NOT
  NULL`; `tax_group_sequence tinyint(1) DEFAULT 0`; `cascade_sequence`; no rate or
  taxable amount.
- TM: 10 columns (`mysql/index.ts:343-354`); **extra `taxable_amount decimal(15,4)`,
  `tax_rate decimal(15,4) NOT NULL DEFAULT 0`, `round_code tinyint NOT NULL DEFAULT
  1`**; **missing `tax_group_sequence`**; `tax_type varchar(255) NOT NULL`;
  `tax_group varchar(255)` **nullable and not unique**.
- TS: same (`src/db/schema/taxes.ts:20-31`).
- **Verdict: critical** — the unique tax group is lost (the app's group identity),
  the sequence is missing, and rate/rounding fields belong on `tax_rates`, not here.

#### `tax_rates` → `tax_code_links`
- U: `tax_rate_id` PK, `rate_tax_code_id`, `rate_tax_category_id`,
  `rate_jurisdiction_id`, `tax_rate decimal(15,4) DEFAULT 0.0000`,
  `tax_rounding_code tinyint(1) DEFAULT 0`; three indexes and three FKs.
- TM: renamed table `tax_code_links`; `tax_code_link_id` PK, `tax_code_id`,
  `tax_category_id`, `jurisdiction_id`, `tax_rate`, **extra `round_code` default 1**,
  **extra `cascade_sequence` default 0**; **no indexes/FKs** (`mysql/index.ts:356-364`).
- TS: same (`src/db/schema/taxes.ts:33-41`).
- **Verdict: critical** — FK integrity to codes/categories/jurisdictions is gone;
  column names no longer match upstream and the default rounding code changes from
  0 (half-up) to 1 (half-down in OSPOS conventions; see `04-taxes.md`).

### 5.3 SQLite-specific deltas (b) beyond the logical MySQL shape

1. **No indexes except four unique indexes.** Actual `sqlite.db` index list is only:
   `employees_username_unique`, `giftcards_giftcard_number_unique`,
   `modules_desc_lang_key_unique`, `suppliers_account_number_unique`, plus SQLite
   auto-indexes for primary keys (`PRAGMA index_list` / `sqlite_master` inspection).
   Upstream has roughly 80 secondary indexes/unique keys plus 38 primary keys;
   the target SQLite has none of the secondary indexes.
2. **Missing primary keys.** `PRAGMA table_info` shows zero PK columns for
   `grants`, `item_kit_items`, `item_quantities`, `items_taxes`, `attribute_links`,
   `customer_rewards`, `receivings_items`, `sales_items`, `sales_items_taxes`,
   `sales_payments`, `sales_taxes`. Of these, upstream has PKs for grants,
   item_kit_items, item_quantities, receivings_items, sales_items, sales_payments.
3. **No generated column / unique guard** on `attribute_links` (SQLite DDL
   `drizzle/sqlite/0000_skinny_power_man.sql:163-172`).
4. **Boolean affinity.** `deleted`, `taxable`, `allow_alt_description`,
   `is_serialized` are `integer` with `DEFAULT false/true`; SQLite stores 0/1, which
   is compatible in practice.
5. **Real for money.** All upstream `decimal` columns become `real`
   (`src/db/schema/items.ts:11-14,31,57`; `src/db/schema/sales.ts:28-32,43`), so
   exact cent accounting is not guaranteed.
6. **Epoch integers for timestamps.** `sale_time`, `receiving_time`, `trans_date`,
   `payment_time`, `open_date`, `close_date`, `expense_time`, `sessions.timestamp`
   are integers with JS `$defaultFn` (`src/db/schema/sales.ts:7,62`;
   `src/db/schema/items.ts:44`; `src/db/schema/expenses.ts:6`). Defaults are applied
   by the application, not the database, so raw SQL inserts do not get timestamps.
7. **Sessions PK is `(id)` only** (`src/db/schema/auth.ts:55`), and `data text`
   instead of `blob`.
8. **`cart_sessions` is target-only** (`src/db/schema/auth.ts:61-66`): no upstream
   counterpart; its `person_id` has no FK.
9. **No table/column collation**; uniqueness is binary, not
   `utf8mb4_unicode_520_ci`.
10. **`sqlite_sequence` only tracks three tables** in `sqlite.db`
    (`people=3`, `stock_locations=1`, `receivings=0`) because only those use
    `AUTOINCREMENT`; the rest rely on `INTEGER PRIMARY KEY` rowid reuse.

### 5.4 Index / constraint / FK summary

**Missing indexes in target (both dialects unless noted).** Upstream indexes that
have no target equivalent:

- `app_config`: none (PK only).
- `attribute_definitions`: `definition_fk`, `definition_name`, `definition_type`.
- `attribute_links`: `attribute_id`, `definition_id`, `item_id`, `sale_id`,
  `receiving_id`, `uq1`, `uq2`, `uq3` (TS lacks all; TM has only the generated
  unique index).
- `attribute_values`: unique `attribute_value`, `attribute_date`, `attribute_decimal`.
- `customers`: `account_number`, `company_name`, `package_id` (and package FK).
- `dinner_tables`: `status`.
- `expense_categories`: unique `category_name`, `category_description`.
- `expenses`: `date`, `payment_type`, `amount`, `expense_category_id` index/FK,
  `supplier_id` FK.
- `giftcards`: `person_id` (TM creates it implicitly through the FK; TS may not).
- `inventory`: `trans_date`, `trans_items_trans_date`, explicit
  `trans_items`/`trans_user`/`trans_location` names.
- `item_kit_items`: `item_id` (TS only; TM creates implicitly).
- `item_kits`: `item_kit_number`, `name(name,description)`.
- `item_quantities`: explicit `item_id`, `location_id`.
- `items`: `item_number`, `supplier_id`, `deleted(deleted,item_type)`,
  `item_id(item_id,deleted)`, unique `items_uq1`.
- `items_taxes`: PK `(item_id,name,percent)`.
- `modules`: unique `name_lang_key`.
- `people`: `email`, composite `first_name(191),last_name(191),email(191),
  phone_number(191)`.
- `permissions`: `location_id` (implicit via FK in TM).
- `receivings`: `reference`, `receiving_time`.
- `receivings_items`: PK, `item_id`.
- `sales`: unique `invoice_number`, `customer_id`, `employee_id`, `sale_time`,
  `dinner_table_id`.
- `sales_items`: PK, `sale_id`, `item_id`, `item_location`.
- `sales_items_taxes`: PK, `sale_id`, `item_id`.
- `sales_payments`: PK, `payment_sale(sale_id,payment_type)`, `employee_id`,
  `payment_time`.
- `sales_reward_points`: whole table.
- `sales_taxes`: PK, `print_sequence(sale_id,print_sequence,tax_group)`.
- `sessions`: composite PK, timestamp index.
- `stock_locations`: unique `sort_order`.
- `suppliers`: `category`, `company_name(company_name,deleted)`.
- `tax_jurisdictions`: unique `tax_group`.
- `tax_rates`/`tax_code_links`: three indexes and three FKs.
- `tax_codes`: upstream itself has no index on `tax_code`.

**Foreign keys — semantic differences**

| Relation | Upstream final action | Target action | Consequence |
|---|---|---|---|
| customers.person_id → people | no action | CASCADE | deleting a person silently deletes the customer |
| employees.person_id → people | no action | CASCADE | deleting a person silently deletes the employee |
| suppliers.person_id → people | no action | CASCADE | deleting a person silently deletes the supplier |
| sales.customer_id | → customers, no action | → people, no action | wrong parent table; customer may not exist as a customer |
| sales.employee_id | no action | no action | same |
| sales.dinner_table_id | → dinner_tables | no FK | orphan dining table ids |
| sales_items.sale_id | no action | CASCADE | deleting a sale destroys lines (upstream blocks) |
| sales_items_taxes FK | composite to sales_items | only sale_id→sales CASCADE | loses line identity, cascades |
| sales_payments.sale_id | no action | CASCADE | deleting a sale destroys payments |
| sales_taxes.sale_id | **no FK at all** | CASCADE | target enforces a relation upstream does not |
| receivings_items.receiving_id | no action | CASCADE | deleting a receiving destroys lines |
| receivings.supplier_id | → suppliers | → people | wrong parent table |
| attribute_links.item_id | no action | CASCADE | deleting an item silently deletes attribute links |
| item_quantities FKs | no action | CASCADE | deleting item/location deletes stock rows |
| items_taxes.item_id | CASCADE | CASCADE | matches |
| item_kit_items FKs | CASCADE | CASCADE | matches |
| grants/permissions FKs | CASCADE | CASCADE | matches |
| attribute_links ibfk_1/2 | RESTRICT | no action (equivalent) | matches semantically |

**Primary-key differences (upstream → target):**

| Table | Upstream PK | Target MySQL PK | Target SQLite PK |
|---|---|---|---|
| grants | (permission_id, person_id) | (permission_id, person_id) | none |
| item_kit_items | (item_kit_id, item_id, quantity) | (item_kit_id, item_id, kit_sequence) | none |
| item_quantities | (item_id, location_id) | (item_id, location_id) | none |
| items_taxes | (item_id, name, percent) | none | none |
| sales_items | (sale_id, item_id, line) | (sale_id, item_id, line) | none |
| sales_items_taxes | (sale_id,item_id,line,name,percent) | none | none |
| sales_payments | (payment_id) surrogate | none | none |
| sales_taxes | (sales_taxes_id) surrogate | none | none |
| receivings_items | (receiving_id,item_id,line) | (receiving_id,item_id,line) | none |
| customer_rewards | no such table | (customer_id,reward_id) | none |

### 5.5 (c) Target SQLite Drizzle vs the actual SQLite databases

**`sqlite.db`** (the default `DATABASE_URL`, WAL mode, `createSqliteDb()` in
`src/lib/db/sqlite.ts:8-21`):

- Schema **exactly matches** the three Drizzle migrations: `0000` creates 39
  tables, `0001` rebuilds `receivings` without its self-FK, `0002` adds
  `customers.sales_tax_code_id`. A textual `.schema` diff against
  `drizzle/sqlite/*.sql` shows no drift. `__drizzle_migrations` has 3 rows with
  `created_at` values 1782719192645, 1782730799763, 1782750615681.
- Row counts: `app_config` 90; `modules` 18; `permissions` 28; `grants` 28;
  `people` 3; `employees` 1; `stock_locations` 1; `dinner_tables` 0. Every other
  table (all business tables, attribute tables, tax tables, `cart_sessions`,
  `sessions`, `migrations`) has 0 rows.
- Data anomalies: three `people` rows all `(first_name='John', last_name='Doe',
  gender=0, phone_number=NULL, email='admin@example.com', all address fields NULL,
  comments NULL)` (person ids 1–3) but only person 1 has an employee row. `people`
  rows 2 and 3 are orphans and would be exposed by any people/customer picker.
- Config values equal `src/db/seed.ts:12-103` exactly.
- Permission count is 28, i.e. the stale set: `reports_categories`, `items_stock`,
  `sales_stock`, `receivings_stock`, `sales_delete`, `sales_change_price`, `office`,
  `home`, `module_home` are absent. All 28 grants have `menu_group='both'`.
- Indexes: only the four explicit unique indexes; no performance indexes (5.3.1).
- `PRAGMA foreign_keys` defaults to 0 on a raw connection; the app enables it per
  connection at `src/lib/db/sqlite.ts:14`.

**`ospos.db`** (a second database in the repo root):

- Schema is **one migration behind** `sqlite.db`: `__drizzle_migrations` has 2 rows,
  and `customers` lacks `sales_tax_code_id` (`.schema` diff line 183). Running
  `db:migrate` would apply `0002_slow_madame_web.sql`.
- Larger demo data set: `app_config` 92 (extra `customer_reward_enable=1`,
  `receiving_calculate_average_price=1`), `attribute_definitions` 1,
  `attribute_values` 4, `attribute_links` 4, `items` 2, `item_kits` 1,
  `item_quantities` 2, `inventory` 11, `customers` 1, `suppliers` 1, `sales` 7,
  `sales_items` 9, `sales_payments` 7, `sales_taxes` 1, `cart_sessions` 2.
  Permissions/grants are again the stale 28-row set.
- This is not a valid parity reference; it is a demo/QA database generated before the
  `customers.sales_tax_code_id` change.

**`e2e-results/test.db`** exists with 91 `app_config` rows; it was not audited in
depth (section 9).

### 5.6 Severity ranking

| Severity | Findings |
|---|---|
| **S0 — data loss / integrity** | D1 missing rewards tables; D2 cashup reduction; D3 missing PKs; D4/D5 tax attribution loss; D6 wrong attribute unique expression; missing `attribute_values` uniques; `sales_taxes`/`sales_items_taxes` no identity; `suppliers.tax_id/category` loss; `customers` GDPR/package columns loss; `expenses` supplier tax loss |
| **S1 — functional breakage** | FK action inversions (cascades on financial data); `receivings.reference` loss; `sessions` key/type; `tax_code_links` rename and default rounding code 1; `tax_jurisdictions` retyped; `tax_categories.tax_group_seq` text; `stock_locations` default/sort loss; seed permission/module/config gaps |
| **S2 — performance / semantics** | ~80 missing secondary indexes/unique keys; missing unique `modules.name_lang_key`, `expense_categories.category_name`, `tax_jurisdictions.tax_group`; case-sensitive SQLite uniqueness; decimal precision widening; missing DB-side timestamp defaults; missing charset/collation |
| **S3 — cosmetic** | varchar length differences, display widths, column order, nullable-vs-default differences with no data impact |

---

## 6. Seed data diff: target `seed.ts` vs upstream final seeds

### 6.1 Config

- Target defines **90** keys (`src/db/seed.ts:12-103`); upstream final has **138**.
- Upstream-only keys (52): `account_number`, `barcode_formats`, `category_dropdown`,
  `company_logo`, `currency_code`, `customer_reward_enable`, `date_or_time_format`,
  `default_receivings_discount`, `default_receivings_discount_type`,
  `default_register_mode`, `default_sales_discount_type`, `default_tax_category`,
  `default_tax_code`, `default_tax_jurisdiction`, `derive_sale_quantity`,
  `email_receipt_check_behaviour`, `enforce_privacy`, `financial_year`,
  `gcaptcha_secret_key`, `gcaptcha_site_key`, `giftcard_number`,
  `image_allowed_types`, `image_max_height`, `image_max_size`, `image_max_width`,
  `key_amount`, `key_cancel`, `key_complete`, `key_customers`, `key_finish`,
  `key_help`, `key_items`, `key_payment`, `key_suspend`, `key_suspended`,
  `line_sequence`, `login_form`, `payment_message`, `print_delay_autoreturn`,
  `print_receipt_check_behaviour`, `quote_default_comments`, `receipt_font_size`,
  `receipt_show_company_name`, `receipt_show_tax_ind`,
  `receiving_calculate_average_price`, `sales_quote_format`,
  `suggestions_first_column`, `suggestions_second_column`,
  `suggestions_third_column`, `tax_id`, `work_order_enable`, `work_order_format`.
  (Count includes every upstream key absent from the target; see the exact
  set difference in section 4 and `src/db/seed.ts:12-103`.)
- Target-only keys (4): `mailchimp_api_key=''`, `mailchimp_list_id=''`,
  `receipt_invoice_count='0'`, `receipt_quote_count='0'`.
- Value differences (29): `address`, `barcode_first_row`, `barcode_generate_if_empty`,
  `barcode_page_cellspacing`, `barcode_page_width`, `barcode_second_row`,
  `barcode_third_row`, `barcode_type`, `cash_rounding_code`, `country_codes`,
  `default_tax_1_name`, `default_tax_1_rate`, `default_tax_2_rate`, `email`,
  `invoice_default_comments`, `invoice_email_message`, `notify_horizontal_position`,
  `notify_vertical_position`, `number_locale`, `payment_options_order`,
  `print_footer`, `print_header`, `receipt_show_serialnumber`, `return_policy`,
  `smtp_crypto`, `smtp_port`, `timeformat`, `timezone`, `website` (29 value
  differences; see the machine diff in the analysis appendix below).
- The actual `sqlite.db` and `ospos.db` match these target values (ospos.db adds two
  upstream keys with value `1`). Therefore the target seed is not an OSPOS 3.4.3
  configuration and importing an upstream DB then running the target seed would
  **not** overwrite it (the seed skips when an admin employee exists,
  `src/db/seed.ts:172-176`), leaving an inconsistent mix.

### 6.2 Modules

- Both have 18 module ids, but target rows use display labels as
  `name_lang_key`/`desc_lang_key` and sort 0 (except office 999):
  `config|Config|Config|0`, `customers|Customers|Customers|0`, …, `office|Office|
  Office group|999` (`src/db/seed.ts:105-124`; actual `sqlite.db` inspected).
- Upstream rows are in section 3.2. **Every one of the 18 rows differs** in
  language keys; 17 differ in sort.
- Effect: language lookup `lang($module['name_lang_key'])` would fall back to the raw
  key; menu ordering collapses to insertion/id order. The target's own UI may not use
  these keys, but any parity with OSPOS's module table is lost.
- `modules.name_lang_key` also loses its UNIQUE constraint, so duplicate labels are
  possible.

### 6.3 Permissions and grants

- Target `PERMISSION_DEFS` has 37 entries (`src/db/seed.ts:126-164`); upstream has
  36.
- Missing from target: `reports_expenses_categories` (upstream
  `3.1.1_to_3.2.0.sql:128`) and `reports_sales_taxes` (upstream
  `3.3.0_indiagst.sql:97`).
- Extra in target: `reports_expenses` (no upstream permission of this name),
  `reports_cashups` (no upstream permission), `module_home` (no upstream
  permission; upstream's module-level permission is `home`).
- Target declares `locationId: 1` for `items_stock`, `sales_stock`,
  `receivings_stock` (`src/db/seed.ts:149-151`) but the insert loop passes only
  `permissionId` and `moduleId` (`:209-214`), so those rows are inserted with
  `location_id = NULL`. That breaks stock permission checks that expect location 1.
- Target grants: one grant per permission, all `menuGroup: "both"`
  (`src/db/seed.ts:216-222`). Upstream has 36 grants with the matrix in section 3.4
  (`home`, `office`, `--`). The `--` values used by upstream for
  `sales_delete`/`sales_change_price` do not exist in the target's TypeScript enum
  (`src/db/schema/auth.ts:51`).
- Actual DBs are worse than the target seed: only 28 permissions/grants exist,
  missing `reports_categories`, `items_stock`, `sales_stock`, `receivings_stock`,
  `sales_delete`, `sales_change_price`, `office`, `home`, `module_home`. Any
  `has_grant('items_stock')` check therefore fails today, and the Office/Home menus
  have no permission rows.

### 6.4 Stock locations, dining tables, reward packages, admin

- `stock_locations`: both seed one row `stock` (target `src/db/seed.ts:195-198`).
  Upstream additionally sets `is_default=1, sort_order=0`
  (`20261023000000_AddStockLocationDefaultAndSortOrder.php:37-55`); target has no
  such columns.
- `dinner_tables`: upstream seeds `Delivery` and `Take Away`; target seeds none
  (actual `dinner_tables` count 0).
- `customers_packages`: upstream seeds 5 packages; target has no table, and `rewards`
  has no rows.
- Admin: upstream person 1 has phone/address/comments and email
  `changeme@example.com`; target person 1 has only first/last/email
  `admin@example.com`, with `gender=0` instead of NULL. Both employees have
  `username='admin'`, `hash_version=2`, `deleted=0`; hashes differ because the target
  generates a fresh bcrypt salt at seed time (`src/db/seed.ts:179`) while upstream
  ships a fixed `$2y$10$…` hash (`initial_schema.sql:131`). Both are cost 10.
- Target's seed is not idempotent for people: it checks only for the admin employee
  (`:172-176`), so a partially failed previous run can leave orphan people rows; the
  actual `sqlite.db` has two such orphans.

---

## 7. Migration strategy recommendations

### 7.1 Dual-dialect architecture

1. **Single canonical model, two generated baselines.** Keep one machine-readable
   canonical schema (JSON/YAML or a neutral DDL) that encodes table names, columns,
   exact SQL types, nullability, defaults, PK/unique/index names, FK names and
   actions, and seed rows. Generate both Drizzle schema files and both SQL baselines
   from it. Drizzle's `mysqlTable`/`sqliteTable` cannot share definitions, and
   `drizzle-kit generate` does not emit charset/collation, index names for FK-implied
   indexes, or generated-column expressions reliably; those must be appended as
   explicit SQL in the baseline migration.
2. **Squash upstream's 47 migrations into one baseline per dialect.** Nothing is
   gained by replaying 2017–2026 migrations in a greenfield Next.js app; the final
   state is the contract. Keep a `docs/` table mapping each upstream version to the
   baseline (section 2) for auditability.
3. **Do not rename upstream objects.** `cashups`, `rewards`, `customer_rewards`,
   `tax_code_links`, `receiving_ref` and the `expense_time`/`tax_group_seq`
   respellings create a permanent translation layer and are the direct cause of most
   S0/S1 findings. Adopt the upstream names (`cash_up`, `customers_packages`,
   `customers_points`, `sales_reward_points`, `tax_rates`, `reference`, `date`,
   `tax_group_sequence`) and adjust the application code. If a rename is truly
   required, implement it as database views plus `INSTEAD OF` triggers in SQLite and
   updatable views in MySQL — not as a divergent physical schema.
4. **Keep the `ospos_` prefix question explicit.** Upstream physical names are
   `ospos_*` because of `DBPrefix` (`app/Config/Database.php:34`). The target uses
   unprefixed names. Pick one and enforce it in the canonical model; do not mix
   prefixed and unprefixed names in migration SQL.
5. **Represent money and quantities exactly.** On MySQL use `decimal(15,2)` /
   `decimal(15,3)` / `decimal(15,4)` exactly as upstream. On SQLite prefer integer
   minor units (cents) or `TEXT` with a documented helper layer; `REAL` cannot
   reproduce upstream totals. If `REAL` is retained for performance, add
   round-half-up helpers at every read/write boundary and acceptance tests with
   values that expose binary floating point (e.g. `0.1+0.2`, 8.875% tax).
6. **Timestamps:** MySQL `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` must be preserved in
   DDL; SQLite should use `TEXT` ISO-8601 with `DEFAULT CURRENT_TIMESTAMP` (SQLite
   supports this) or integer epoch with **database-side** defaults. Application-only
   `$defaultFn` defaults (current target) mean raw SQL imports and background jobs
   write NULL/0 and diverge between dialects.
7. **Indexes and constraint names are part of parity.** Emit every upstream index
   name, including FK-implied ones (`ospos_grants_ibfk_2`,
   `ospos_permissions_ibfk_2`, `ospos_expenses_ibfk_3`) and the generated-column
   index. Add a CI check that diffs `information_schema.STATISTICS` and
   `PRAGMA index_list/index_info` against the reference (section 8).

### 7.2 Importing an existing OSPOS MySQL database without loss

Recommended two-phase import (“freeze, then ETL”):

1. **Freeze the source.** Stop the OSPOS web app, run `mysqldump --single-transaction
   --routines --triggers --hex-blob --default-character-set=utf8mb4` on the OSPOS
   database, and record the `ospos_migrations` version + row count per table.
   Preserve the dump and its SHA-256.
2. **Load into a staging schema** on MySQL 8.4 (the upstream conversion target),
   not directly into the target's schema.
3. **Create the target schema from the canonical baseline** (section 7.1), with
   exact upstream table/column names and types. Do **not** run the upstream
   migration chain against the restored DB; it would replay destructive steps
   (section 2.1).
4. **ETL with explicit column lists** (`INSERT INTO target (cols) SELECT cols FROM
   staging`) in FK-dependency order: reference tables first (`people`, `employees`,
   `modules`, `permissions`, `stock_locations`, `dinner_tables`,
   `customers_packages`, `tax_categories`, `tax_codes`, `tax_jurisdictions`,
   `tax_rates`, `expense_categories`, `suppliers`, `customers`), then `items`,
   `item_kits`, `item_kit_items`, `item_quantities`, `items_taxes`, then
   `sales`/`receivings` and their line/payment/tax tables, then
   `customers_points`, `sales_reward_points`, `attribute_*`, `cash_up`,
   `expenses`, `inventory`, `giftcards`, `sessions` (skip sessions — see 7.4).
   - If the target keeps its reduced schema, the ETL must explicitly decide what to
     do with the columns it cannot store; a silent `INSERT … SELECT` with fewer
     columns loses cashup totals, tax attribution, supplier tax ids and reward
     ledgers. Prefer extending the target schema instead.
   - Preserve zero rows exactly; do not “repair” negative quantities, NULL
     addresses, or soft-deleted rows.
5. **Foreign keys during load.** `SET FOREIGN_KEY_CHECKS=0` for the load, then
   `SET FOREIGN_KEY_CHECKS=1` and run `CHECK TABLE` plus a full
   `information_schema.REFERENTIAL_CONSTRAINTS` verification. Load parents before
   children where possible; the FK-off window should be one transaction.
6. **Verification (section 8)** before switching `DATABASE_URL`.

For SQLite as the destination, do the same ETL through a script that inserts
explicit ids with `PRAGMA foreign_keys=OFF` inside one transaction and re-enables it
after `PRAGMA foreign_key_check` passes.

### 7.3 ID and sequence preservation

- **MySQL:** insert explicit PK values into AUTO_INCREMENT tables, then for every
  auto-increment table run
  `ALTER TABLE <t> AUTO_INCREMENT = (SELECT COALESCE(MAX(<pk>),0)+1 FROM <t>)`.
  Do this after all child rows are loaded. Tables needing it: `people`, `employees`
  (no auto-inc), `giftcards`, `items`, `item_kits`, `sales`, `receivings`,
  `sales_payments.payment_id`, `sales_taxes.sales_taxes_id`, `tax_codes`,
  `tax_categories`, `tax_jurisdictions`, `tax_rates`, `expense_categories`,
  `expenses`, `cash_up`, `customers_packages`, `customers_points`,
  `sales_reward_points`, `stock_locations`, `attribute_definitions`,
  `attribute_values`. Missing this produces primary-key collisions on the first
  post-import insert.
- **SQLite:** `INTEGER PRIMARY KEY AUTOINCREMENT` tables (`people`,
  `stock_locations`, `receivings` in the actual DB) track `sqlite_sequence`; after
  explicit-id inserts SQLite updates the sequence only when the inserted rowid is
  greater than the stored value. Explicitly run
  `INSERT INTO sqlite_sequence(name,seq) VALUES(...) ON CONFLICT(name) DO UPDATE SET
  seq=MAX(seq,excluded.seq)` or `UPDATE sqlite_sequence SET seq=(SELECT MAX(...))`
  for every AUTOINCREMENT table, and verify with section 8.
- **Business identifiers:** preserve `invoice_number`, `quote_number`,
  `work_order_number`, `reference`, `reference_code`, `item_number`, tax code
  strings and the `last_used_*` config counters together. If the ETL renumbers
  documents, `last_used_invoice_number` and the unique invoice index will collide.
- **Soft deletes:** preserve `deleted` flags and `deleted`-indexed uniqueness
  (`items_uq1`) exactly; “cleaning” soft-deleted rows changes uniqueness behaviour.

### 7.4 Sessions and cart sessions

- **Do not import `ospos_sessions`.** The rows are CI4 database-handler payloads
  (PHP-serialized/encrypted), keyed by `(id, ip_address)` with `data blob`. The
  target's `sessions` (Auth.js or custom) has a different single-column key and
  `text` payload. Importing would create unusable rows.
- Drop and recreate the target `sessions` table empty on cutover. Accept that all
  users must log in again.
- `cart_sessions` has no upstream counterpart. Treat it as target-local state:
  create it empty and never attempt to map it from OSPOS (upstream holds suspended
  carts in `sales` rows with `sale_status`, not in a cart table).
- If preserving logins matters, implement a one-time re-authentication flow rather
  than trying to translate session blobs.

### 7.5 Charset and collation

- Create every MySQL table with
  `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci` (upstream final,
  `3.4.3_mysql84_utf8mb4_conversion.sql:3-41`). Drizzle's generated MySQL DDL has no
  charset/collation, so the server default wins; add explicit `ALTER TABLE … CONVERT
  TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci` (or a baseline table
  option) for every table.
- Set the connection collation to `utf8mb4_unicode_520_ci` during import and
  verification; upstream's `app/Config/Database.php:37-38` uses
  `utf8mb4_general_ci`, so a mixed setting can make `=` joins differ for accent/
  case variants.
- Understand that uniqueness is collation-dependent: `employees.username`,
  `modules.name_lang_key`/`desc_lang_key`, `giftcards.giftcard_number`,
  `suppliers.account_number`, `attribute_values.attribute_value` are
  case-insensitive upstream. SQLite `TEXT` is binary by default. If the target wants
  identical duplicate rejection, add `COLLATE NOCASE` (ASCII only) or normalize
  values on write; do not assume SQLite will reject `Admin` vs `admin`.
- Before converting an existing DB, replicate upstream's collision pre-check
  (`20260405000000_Mysql84Utf8mb4Conversion.php:60-108`): group unique columns by
  `CONVERT(col USING utf8mb4) COLLATE utf8mb4_unicode_520_ci` and fail on counts > 1.
- Beware index key length: after utf8mb4 the people composite index needs 191-char
  prefixes (`20260405000000_Mysql84Utf8mb4Conversion.php:28-30`); keep that exact
  index definition.

### 7.6 Foreign keys and delete semantics

- Reproduce upstream's actions, not a generic “cascade everything” policy. In
  particular upstream **blocks** deletion of people referenced by customers/
  employees/suppliers (`initial_schema.sql:740-747,786-788,870-871`), of sales
  referenced by lines/payments (`:812-830`), and of receivings referenced by lines
  (`:798-802`). The target's cascades on `customers.person_id`, `employees.person_id`,
  `suppliers.person_id`, `sales_items.sale_id`, `sales_payments.sale_id`,
  `sales_taxes.sale_id`, `receivings_items.receiving_id`, `item_quantities` and
  `attribute_links.item_id` are silent data-loss paths.
- Add explicit indexes for every FK column before creating the FK, so index names
  are deterministic rather than InnoDB-generated.
- Keep the composite FK `sales_items_taxes_ibfk_1 (sale_id,item_id,line) →
  sales_items` (`20240630000001_fix_keys_for_db_upgrade.php:41-43`); replacing it
  with a single-column sale FK changes line identity.
- Recreate the self-FK on `attribute_definitions.definition_fk`.
- On SQLite, FKs are only enforced when `PRAGMA foreign_keys=ON` is set on **every**
  connection (`src/lib/db/sqlite.ts:14` does this); set it in every worker/test/CLI
  bootstrap, and run `PRAGMA foreign_key_check` as a release gate.

### 7.7 SQLite limitations to design around

| Upstream feature | SQLite limitation | Recommendation |
|---|---|---|
| `DECIMAL(15,2/3/4)` exact arithmetic | `REAL` is IEEE-754 | integer minor units or TEXT + helpers |
| `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | no timestamp type; `CURRENT_TIMESTAMP` is UTC text | `TEXT` with default, or integer epoch with DB default |
| `BLOB` session data | `TEXT` is text-only; BLOB works | use `blob` mode if sessions stay |
| Generated stored column `CASE … CONCAT` | supported since 3.31, but Drizzle sqlite-core does not expose `generatedAlwaysAs` in the current schema | add via raw SQL in migration; add a unique index |
| `ALTER TABLE … MODIFY/CHANGE/DROP` | DROP COLUMN only since 3.35; no MODIFY | table-rebuild migrations (create `__new_*`, copy, drop, rename) — the target already uses this pattern for `receivings` (`drizzle/sqlite/0001_spotty_giant_girl.sql:1-20`) |
| composite PKs and unique keys | supported, but must be declared | restore the 5 SQLite-only missing PKs (`grants`, `item_kit_items`, `item_quantities`, `receivings_items`, `sales_items`) plus the 4 universal missing PKs (`items_taxes`, `sales_items_taxes`, `sales_payments`, `sales_taxes`) |
| case-insensitive uniqueness | binary by default | `COLLATE NOCASE` or normalized values |
| `AUTO_INCREMENT` | `AUTOINCREMENT` only on `INTEGER PRIMARY KEY`; rowid reuse otherwise | explicit `AUTOINCREMENT` where identity must never be reused |
| `ON UPDATE CURRENT_TIMESTAMP` | not supported | application triggers/updates |
| ~80 named secondary indexes/unique keys | supported | declare them in SQL, not via Drizzle column helpers only |

### 7.8 Migration journaling and version mapping

- Keep CI4's `ospos_migrations` **shape** (section 1.2.21) if any parity tooling
  reads it, even if Drizzle owns execution. The target's `migrations` mirror
  (`src/db/schema/misc.ts:3-9`) is wrong (`version int`, missing `group`/`batch`) and
  unused; either fix it or remove it.
- Add a small `schema_versions` (or reuse `ospos_migrations`) table that records the
  upstream version an installation was imported from (e.g.
  `upstream_version='20261023000000'`) plus an import batch id. This makes future
  audits possible without replaying history.
- Never run `drizzle-kit push` against an imported database. Use versioned SQL
  migrations; `push` is diff-based and will drop columns it does not know about.
- Keep the SQLite and MySQL baselines generated from the same canonical model and
  test both in CI. The current SQLite schema is not a faithful port of the upstream
  model and cannot be fixed by adding indexes alone.

---

## 8. Acceptance tests / queries that prove schema parity

### 8.1 MySQL structural diff

Run against a **reference** database created by a clean OSPOS 3.4.3 install (or the
reconstructed DDL in section 1.2) and against the target MySQL DB, then diff the
result sets.

```sql
-- 1. Tables, engine and collation
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- 2. Columns: order, type, nullability, default, extra, charset/collation
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
       COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 3. Indexes (including FK-implied and unique keys)
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART,
       INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 4. Constraints and FK actions
SELECT kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME,
       kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
       rc.UPDATE_RULE, rc.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
 AND rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
 AND rc.TABLE_NAME        = kcu.TABLE_NAME
WHERE kcu.TABLE_SCHEMA = DATABASE()
ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;

-- 5. Generated columns
SELECT TABLE_NAME, COLUMN_NAME, GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND GENERATION_EXPRESSION <> ''
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 6. Full DDL text diff (normalize AUTO_INCREMENT=… and whitespace first)
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
-- then for each: SHOW CREATE TABLE `name`;
```

Acceptance thresholds: 0 differences for tables (39), columns, index names/columns,
FK names/actions, and table collation. Auto-increment counters and `AUTO_INCREMENT=`
comments are excluded from the diff.

### 8.2 SQLite structural diff

```sql
-- tables and DDL
SELECT type, name, sql FROM sqlite_master
WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'
ORDER BY type, name;

-- columns: cid, name, type, notnull, dflt_value, pk
PRAGMA table_info('items');            -- repeat for every table

-- indexes
PRAGMA index_list('sales_items');
PRAGMA index_info('sales_items_sale_id_item_id_line_pk');

-- foreign keys and actions
PRAGMA foreign_key_list('sales_items');

-- integrity
PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

A reference SQLite DB should be generated from the canonical baseline and compared
table by table; the current target is expected to fail on indexes, PKs, generated
columns, FK actions, and all `REAL` affinities.

### 8.3 Seed and data checksums

```sql
-- config (order-independent)
SELECT COUNT(*) FROM app_config;                      -- expect 138
SELECT MD5(GROUP_CONCAT(key, '=', value ORDER BY key SEPARATOR '\n'))
FROM app_config;                                      -- compare reference vs target

-- modules (expect 18; name_lang_key/sort must match section 3.2)
SELECT MD5(GROUP_CONCAT(module_id,'|',name_lang_key,'|',desc_lang_key,'|',sort
           ORDER BY module_id SEPARATOR '\n')) FROM modules;

-- permissions (expect 36; location-scoped trio must be location_id=1)
SELECT MD5(GROUP_CONCAT(permission_id,'|',module_id,'|',
           COALESCE(location_id,'NULL') ORDER BY permission_id SEPARATOR '\n'))
FROM permissions;

-- grants (expect 36; menu_group matrix section 3.4)
SELECT MD5(GROUP_CONCAT(permission_id,'|',person_id,'|',
           COALESCE(menu_group,'NULL') ORDER BY permission_id SEPARATOR '\n'))
FROM grants WHERE person_id = 1;

-- stock/dinner/packages
SELECT * FROM stock_locations ORDER BY location_id;     -- 1 row, is_default=1, sort=0
SELECT * FROM dinner_tables ORDER BY dinner_table_id;   -- Delivery, Take Away
SELECT * FROM customers_packages ORDER BY package_id;   -- 5 rows
```

SQLite has no `MD5()` built in; compute the same digests in application code (or use
`sha3()` only where the SQLite build provides it), or dump the ordered
`key=value` / row lists and diff them textually. Always force a deterministic order
inside the concatenation; SQLite does not guarantee `GROUP_CONCAT` order.

**Row counts for every table** (MySQL `information_schema.TABLES.TABLE_ROWS` is
approximate; use exact `SELECT COUNT(*)`):

```
app_config 138, modules 18, permissions 36, grants 36, people 1, employees 1,
stock_locations 1, dinner_tables 2, customers_packages 5,
sales_taxes 0, sales_items_taxes 0, tax_codes 0, tax_categories 0,
tax_jurisdictions 0, tax_rates 0, customers 0, items 0, sales 0, receivings 0
```

### 8.4 Targeted semantic assertions

```sql
-- duplicate barcodes allowed upstream
INSERT INTO items (name,category,item_number,description,cost_price,unit_price,
                   allow_alt_description,is_serialized)
VALUES ('a','c','DUP','d',0,0,0,0),('b','c','DUP','d',0,0,0,0);  -- must succeed

-- duplicate account numbers allowed upstream (non-unique index)
INSERT INTO customers (person_id,account_number) ... two rows with same account;

-- sale line identity
INSERT INTO sales_items (sale_id,item_id,line,...) VALUES (1,1,1,...);
INSERT INTO sales_items (sale_id,item_id,line,...) VALUES (1,1,1,...); -- must fail

-- items_taxes identity
INSERT INTO items_taxes VALUES (1,'VAT',8.000);  -- twice must fail

-- attribute duplicate guard (only item-only rows)
INSERT INTO attribute_links (definition_id,item_id) VALUES (1,1);
INSERT INTO attribute_links (definition_id,item_id) VALUES (1,1); -- must fail
INSERT INTO attribute_links (definition_id,item_id,sale_id) VALUES (1,1,1);
INSERT INTO attribute_links (definition_id,item_id,sale_id) VALUES (1,1,2); -- must succeed

-- tax group global uniqueness
INSERT INTO tax_jurisdictions (tax_group,...) VALUES ('G',...); twice must fail

-- stock location ordering
INSERT INTO stock_locations (location_name,sort_order) VALUES ('b',1);
INSERT INTO stock_locations (location_name,sort_order) VALUES ('c',1); -- must fail

-- FK delete semantics
DELETE FROM people WHERE person_id = <referenced customer>;  -- must fail upstream
DELETE FROM sales  WHERE sale_id = <with lines>;             -- must fail upstream
```

On SQLite repeat the same cases and additionally assert the five SQLite-only missing
PKs are restored, the four universally missing PKs are restored, and that
`PRAGMA foreign_key_check` returns no rows after the test data is rolled back.

### 8.5 Migration-ledger assertion

```sql
SELECT COUNT(*) FROM ospos_migrations;                    -- 47 for a fresh install
SELECT version, class, namespace, `group`, batch
FROM ospos_migrations ORDER BY version;
-- version is a 14-digit STRING; the newest must be '20261023000000'
```

If the target keeps a compatibility ledger, assert that `version` is `varchar`, that
`group`/`batch` exist, and that reading the newest value works the way
`app/Libraries/MY_Migration.php:23-47` reads it.

---

## 9. Unknowns and data-dependent items

1. **Exact `ospos_migrations.time` and `batch` values** are install-history
   dependent. A fresh install puts all 47 rows in batch 1; an installation upgraded
   across releases has several batches and arbitrary timestamps. They cannot be
   reconstructed statically.
2. **Whether a given installation actually ran every migration.** Migration #1
   ignores failures; later migrations can log errors (duplicate config keys,
   missing columns) without aborting. A production dump may therefore be missing
   keys or indexes that a clean run has. Always introspect the real DB (section 8)
   rather than assuming the code path completed.
3. **Whether the 20260405 utf8mb4 conversion succeeded.** It aborts on collation
   collisions in unique columns and is intentionally irreversible
   (`20260405000000_Mysql84Utf8mb4Conversion.php:32-46,48-51`). A DB may still be
   `utf8_general_ci` if the migration failed and the operator ignored it.
4. **Dummy jurisdiction.** `Jurisdiction1` exists only when an upgraded database had
   rows in `tax_code_rates` (`20190129212600_indiagst.php:138-153`). A fresh install
   has none; an upgrade may have one. Never assume `tax_jurisdictions` is empty.
5. **Attribute data** is data-dependent: migration #6 creates definitions/values
   only when `custom*_name` config keys existed and `items.custom*` were non-empty;
   migration #28 deletes and reinserts duplicate values and can retain only one
   attribute per duplicate group. Final attribute rows cannot be predicted from code
   alone.
6. **Grant menu groups for persons other than admin** can exist; the 20210714
   migration updates `expenses_categories` for **all** persons
   (`20210714140000_move_expenses_categories.php:16`), while the earlier updates are
   scoped to `person_id=1`. A seeded install has only admin, but imported data may
   not.
7. **Server SQL mode/version.** Upstream `strictOn=false`
   (`app/Config/Database.php:42`) lets `NOT NULL` columns without defaults
   (`customers.employee_id`, `cash_up.closed_amount_due`, `suppliers.category`) be
   added to populated tables with implicit zero values. Under `STRICT_TRANS_TABLES`
   the same migrations fail. The final DDL is known; what an individual installation
   contains may depend on its SQL mode.
8. **Target MySQL is unverified live.** No MySQL server is available in this
   environment; the target MySQL diff is based on the Drizzle schema and generated
   SQL, not a live `information_schema`. The actual MySQL DB (if any) was not
   inspected.
9. **`e2e-results/test.db`** (91 `app_config` rows) was not audited; it may be a
   fourth schema/data variant.
10. **Target collation and index behaviour depend on the MySQL server defaults**
    because the generated SQL specifies neither. MySQL 8.4 defaults to
    `utf8mb4_0900_ai_ci`; MariaDB defaults differ. Any uniqueness/collation parity
    test must therefore read the live server settings.
11. **`ospos.db` is a demo database, not the shipped default.** Its provenance and
    the two extra config rows (`customer_reward_enable=1`,
    `receiving_calculate_average_price=1`) are unexplained by `seed.ts`; it may have
    been edited by tests or by hand.
12. **Drizzle's `__drizzle_migrations` hashes** are opaque; they prove which SQL
    files ran but not what data was seeded afterwards. The SQLite data/seed state is
    not reproducible from the journal alone.

---

## Appendix A — exact config set/value diff (machine-generated)

Computed by comparing the 138-key upstream reconstruction with
`APP_CONFIG_DEFAULTS` in `src/db/seed.ts:12-103`. Reproduce with the same parse;
the counts are: upstream 138, target 90, upstream-only 52, target-only 4, shared
keys with different values 29.

Upstream-only (52): `account_number`, `barcode_formats`, `category_dropdown`,
`company_logo`, `currency_code`, `customer_reward_enable`, `date_or_time_format`,
`default_receivings_discount`, `default_receivings_discount_type`,
`default_register_mode`, `default_sales_discount_type`, `default_tax_category`,
`default_tax_code`, `default_tax_jurisdiction`, `derive_sale_quantity`,
`email_receipt_check_behaviour`, `enforce_privacy`, `financial_year`,
`gcaptcha_secret_key`, `gcaptcha_site_key`, `giftcard_number`,
`image_allowed_types`, `image_max_height`, `image_max_size`, `image_max_width`,
`key_amount`, `key_cancel`, `key_complete`, `key_customers`, `key_finish`,
`key_help`, `key_items`, `key_payment`, `key_suspend`, `key_suspended`,
`line_sequence`, `login_form`, `payment_message`, `print_delay_autoreturn`,
`print_receipt_check_behaviour`, `quote_default_comments`, `receipt_font_size`,
`receipt_show_company_name`, `receipt_show_tax_ind`,
`receiving_calculate_average_price`, `sales_quote_format`,
`suggestions_first_column`, `suggestions_second_column`,
`suggestions_third_column`, `tax_id`, `work_order_enable`, `work_order_format`.

Target-only (4): `mailchimp_api_key=''`, `mailchimp_list_id=''`,
`receipt_invoice_count='0'`, `receipt_quote_count='0'`.

Shared keys with different values (29):

```
address:                    upstream='123 Nowhere street' | target='123 Main Street'
barcode_first_row:          upstream='category'           | target='name'
barcode_generate_if_empty:  upstream='0'                  | target='1'
barcode_page_cellspacing:   upstream='20'                 | target='5'
barcode_page_width:         upstream='100'                | target='150'
barcode_second_row:         upstream='item_code'          | target='category'
barcode_third_row:          upstream='unit_price'         | target='cost_price'
barcode_type:               upstream='C39'                | target='C128'
cash_rounding_code:         upstream='0'                  | target='1'
country_codes:              upstream='us'                 | target='US'
default_tax_1_name:         upstream=''                   | target='Sales Tax'
default_tax_1_rate:         upstream=''                   | target='8'
default_tax_2_rate:         upstream=''                   | target='0'
email:                      upstream='changeme@example.com' | target='admin@example.com'
invoice_default_comments:   upstream='This is a default comment' | target=''
invoice_email_message:      upstream='Dear {CU}, In attachment the receipt for sale {ISEQ}' | target='Invoice attached'
notify_horizontal_position: upstream='center'             | target='right'
notify_vertical_position:   upstream='bottom'             | target='top'
number_locale:              upstream='en_US'              | target='en-US'
payment_options_order:      upstream='cashdebitcredit'    | target='cashdebitcreditcheckdue'
print_footer:               upstream='0'                  | target=''
print_header:               upstream='0'                  | target=''
receipt_show_serialnumber:  upstream='1'                  | target='0'
return_policy:              upstream='Test'               | target='Returns accepted within 30 days of purchase with receipt.'
smtp_crypto:                upstream='ssl'                | target='tls'
smtp_port:                  upstream='465'                | target='587'
timeformat:                 upstream='H:i:s'              | target='H:i'
timezone:                   upstream='America/New_York'   | target='UTC'
website:                    upstream=''                   | target='https://opensourcepos.org'
```

Note `default_tax_1_rate` is `''` upstream but parsed as `8` by the tax engine's
numeric cast; the target stores `8` explicitly, which is why its default-tax
behaviour differs even before the missing `tax_categories`/`tax_rates` rows are
considered.

## Appendix B — final object checklist (39 tables)

```
app_config, attribute_definitions, attribute_links, attribute_values, cash_up,
customers, customers_packages, customers_points, dinner_tables, employees,
expense_categories, expenses, giftcards, grants, inventory, item_kit_items,
item_kits, item_quantities, items, items_taxes, migrations, modules, people,
permissions, receivings, receivings_items, sales, sales_items, sales_items_taxes,
sales_payments, sales_reward_points, sales_taxes, sessions, stock_locations,
suppliers, tax_categories, tax_codes, tax_jurisdictions, tax_rates
```

Target object checklist (39 logical tables + `__drizzle_migrations`):

```
app_config, attribute_definitions, attribute_links, attribute_values, cart_sessions,
cashups, customer_rewards, customers, dinner_tables, employees, expense_categories,
expenses, giftcards, grants, inventory, item_kit_items, item_kits, item_quantities,
items, items_taxes, migrations, modules, people, permissions, receivings,
receivings_items, rewards, sales, sales_items, sales_items_taxes, sales_payments,
sales_taxes, sessions, stock_locations, suppliers, tax_categories, tax_code_links,
tax_codes, tax_jurisdictions
```

Delta: upstream − target = `{customers_packages, customers_points,
sales_reward_points, cash_up, tax_rates}` (5 missing/renamed); target − upstream =
`{cart_sessions, customer_rewards, rewards, cashups, tax_code_links}` (5
extra/renamed). Net 39 vs 39 logical tables, but only 34 names match and only
`app_config`, `permissions`, `items_taxes` (name), `attribute_*` (names) come close
in shape.

---

*End of report. This analysis was static and read-only; no source file, database, or
migration was modified.*







