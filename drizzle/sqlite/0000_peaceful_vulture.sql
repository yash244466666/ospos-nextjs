CREATE TABLE `ospos_app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ospos_attribute_definitions` (
	`definition_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definition_name` text NOT NULL,
	`definition_type` text NOT NULL,
	`definition_unit` text,
	`definition_flags` integer NOT NULL,
	`definition_fk` integer,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`definition_fk`) REFERENCES `ospos_attribute_definitions`(`definition_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attribute_definitions_definition_fk` ON `ospos_attribute_definitions` (`definition_fk`);--> statement-breakpoint
CREATE INDEX `attribute_definitions_definition_name` ON `ospos_attribute_definitions` (`definition_name`);--> statement-breakpoint
CREATE INDEX `attribute_definitions_definition_type` ON `ospos_attribute_definitions` (`definition_type`);--> statement-breakpoint
CREATE TABLE `ospos_attribute_links` (
	`attribute_id` integer,
	`definition_id` integer NOT NULL,
	`item_id` integer,
	`sale_id` integer,
	`receiving_id` integer,
	FOREIGN KEY (`definition_id`) REFERENCES `ospos_attribute_definitions`(`definition_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`attribute_id`) REFERENCES `ospos_attribute_values`(`attribute_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiving_id`) REFERENCES `ospos_receivings`(`receiving_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attribute_links_attribute_id` ON `ospos_attribute_links` (`attribute_id`);--> statement-breakpoint
CREATE INDEX `attribute_links_definition_id` ON `ospos_attribute_links` (`definition_id`);--> statement-breakpoint
CREATE INDEX `attribute_links_item_id` ON `ospos_attribute_links` (`item_id`);--> statement-breakpoint
CREATE INDEX `attribute_links_sale_id` ON `ospos_attribute_links` (`sale_id`);--> statement-breakpoint
CREATE INDEX `attribute_links_receiving_id` ON `ospos_attribute_links` (`receiving_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attribute_links_attribute_links_uq1` ON `ospos_attribute_links` (`attribute_id`,`definition_id`,`item_id`,`sale_id`,`receiving_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attribute_links_attribute_links_uq2` ON `ospos_attribute_links` (`item_id`,`receiving_id`,`sale_id`,`definition_id`,`attribute_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attribute_links_attribute_links_uq3` ON `ospos_attribute_links` (`definition_id`,`item_id`) WHERE "ospos_attribute_links"."item_id" IS NOT NULL AND "ospos_attribute_links"."sale_id" IS NULL AND "ospos_attribute_links"."receiving_id" IS NULL;--> statement-breakpoint
CREATE TABLE `ospos_attribute_values` (
	`attribute_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attribute_value` text,
	`attribute_date` text,
	`attribute_decimal` numeric
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attribute_values_attribute_value` ON `ospos_attribute_values` (`attribute_value`);--> statement-breakpoint
CREATE UNIQUE INDEX `attribute_values_attribute_date` ON `ospos_attribute_values` (`attribute_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `attribute_values_attribute_decimal` ON `ospos_attribute_values` (`attribute_decimal`);--> statement-breakpoint
CREATE TABLE `ospos_cash_up` (
	`cashup_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`open_date` text DEFAULT (datetime('now','localtime')),
	`close_date` text,
	`open_amount_cash` numeric NOT NULL,
	`transfer_amount_cash` numeric NOT NULL,
	`note` integer DEFAULT false NOT NULL,
	`closed_amount_cash` numeric NOT NULL,
	`closed_amount_card` numeric NOT NULL,
	`closed_amount_check` numeric NOT NULL,
	`closed_amount_total` numeric NOT NULL,
	`description` text NOT NULL,
	`open_employee_id` integer NOT NULL,
	`close_employee_id` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`closed_amount_due` numeric NOT NULL,
	FOREIGN KEY (`open_employee_id`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`close_employee_id`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cash_up_open_employee_id` ON `ospos_cash_up` (`open_employee_id`);--> statement-breakpoint
CREATE INDEX `cash_up_close_employee_id` ON `ospos_cash_up` (`close_employee_id`);--> statement-breakpoint
CREATE TABLE `ospos_customers_packages` (
	`package_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_name` text,
	`points_percent` real DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ospos_customers` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`company_name` text,
	`account_number` text,
	`taxable` integer DEFAULT true NOT NULL,
	`tax_id` text DEFAULT '' NOT NULL,
	`sales_tax_code_id` integer,
	`package_id` integer,
	`points` integer,
	`deleted` integer DEFAULT false NOT NULL,
	`discount` numeric DEFAULT '0' NOT NULL,
	`discount_type` integer DEFAULT 0 NOT NULL,
	`date` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`employee_id` integer NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `ospos_customers_packages`(`package_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sales_tax_code_id`) REFERENCES `ospos_tax_codes`(`tax_code_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `customers_packages_account_number` ON `ospos_customers` (`account_number`);--> statement-breakpoint
CREATE INDEX `customers_packages_sales_tax_code_id` ON `ospos_customers` (`sales_tax_code_id`);--> statement-breakpoint
CREATE INDEX `customers_packages_package_id` ON `ospos_customers` (`package_id`);--> statement-breakpoint
CREATE INDEX `customers_packages_company_name` ON `ospos_customers` (`company_name`);--> statement-breakpoint
CREATE TABLE `ospos_customers_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`package_id` integer NOT NULL,
	`sale_id` integer NOT NULL,
	`points_earned` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `ospos_customers`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `ospos_customers_packages`(`package_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `customers_points_person_id` ON `ospos_customers_points` (`person_id`);--> statement-breakpoint
CREATE INDEX `customers_points_package_id` ON `ospos_customers_points` (`package_id`);--> statement-breakpoint
CREATE INDEX `customers_points_sale_id` ON `ospos_customers_points` (`sale_id`);--> statement-breakpoint
CREATE TABLE `ospos_dinner_tables` (
	`dinner_table_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dinner_tables_status` ON `ospos_dinner_tables` (`status`);--> statement-breakpoint
CREATE TABLE `ospos_employees` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`hash_version` integer DEFAULT 2 NOT NULL,
	`language` text,
	`language_code` text,
	FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_username` ON `ospos_employees` (`username`);--> statement-breakpoint
CREATE TABLE `ospos_expense_categories` (
	`expense_category_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_name` text,
	`category_description` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_category_name` ON `ospos_expense_categories` (`category_name`);--> statement-breakpoint
CREATE INDEX `expense_categories_category_description` ON `ospos_expense_categories` (`category_description`);--> statement-breakpoint
CREATE TABLE `ospos_expenses` (
	`expense_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text DEFAULT (datetime('now','localtime')),
	`amount` numeric NOT NULL,
	`payment_type` text NOT NULL,
	`expense_category_id` integer NOT NULL,
	`description` text NOT NULL,
	`employee_id` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`supplier_tax_code` text,
	`tax_amount` numeric,
	`supplier_id` integer,
	FOREIGN KEY (`expense_category_id`) REFERENCES `ospos_expense_categories`(`expense_category_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `ospos_suppliers`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expenses_expense_category_id` ON `ospos_expenses` (`expense_category_id`);--> statement-breakpoint
CREATE INDEX `expenses_employee_id` ON `ospos_expenses` (`employee_id`);--> statement-breakpoint
CREATE INDEX `expenses_date` ON `ospos_expenses` (`date`);--> statement-breakpoint
CREATE INDEX `expenses_payment_type` ON `ospos_expenses` (`payment_type`);--> statement-breakpoint
CREATE INDEX `expenses_amount` ON `ospos_expenses` (`amount`);--> statement-breakpoint
CREATE TABLE `ospos_giftcards` (
	`giftcard_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_time` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`giftcard_number` text,
	`value` numeric NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`person_id` integer,
	FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `giftcards_giftcard_number` ON `ospos_giftcards` (`giftcard_number`);--> statement-breakpoint
CREATE INDEX `giftcards_person_id` ON `ospos_giftcards` (`person_id`);--> statement-breakpoint
CREATE TABLE `ospos_grants` (
	`permission_id` text NOT NULL,
	`person_id` integer NOT NULL,
	`menu_group` text DEFAULT 'home',
	PRIMARY KEY(`permission_id`, `person_id`),
	FOREIGN KEY (`permission_id`) REFERENCES `ospos_permissions`(`permission_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `grants_ospos_grants_ibfk_2` ON `ospos_grants` (`person_id`);--> statement-breakpoint
CREATE TABLE `ospos_inventory` (
	`trans_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trans_items` integer DEFAULT 0 NOT NULL,
	`trans_user` integer DEFAULT 0 NOT NULL,
	`trans_date` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`trans_comment` text NOT NULL,
	`trans_location` integer NOT NULL,
	`trans_inventory` numeric DEFAULT '0' NOT NULL,
	FOREIGN KEY (`trans_items`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trans_user`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trans_location`) REFERENCES `ospos_stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_trans_items` ON `ospos_inventory` (`trans_items`);--> statement-breakpoint
CREATE INDEX `inventory_trans_user` ON `ospos_inventory` (`trans_user`);--> statement-breakpoint
CREATE INDEX `inventory_trans_location` ON `ospos_inventory` (`trans_location`);--> statement-breakpoint
CREATE INDEX `inventory_trans_date` ON `ospos_inventory` (`trans_date`);--> statement-breakpoint
CREATE INDEX `inventory_trans_items_trans_date` ON `ospos_inventory` (`trans_items`,`trans_date`);--> statement-breakpoint
CREATE TABLE `ospos_item_kit_items` (
	`item_kit_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` numeric NOT NULL,
	`kit_sequence` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_kit_id`, `item_id`, `quantity`),
	FOREIGN KEY (`item_kit_id`) REFERENCES `ospos_item_kits`(`item_kit_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_kit_items_ospos_item_kit_items_ibfk_2` ON `ospos_item_kit_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `ospos_item_kits` (
	`item_kit_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_kit_number` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`item_id` integer DEFAULT 0 NOT NULL,
	`kit_discount` numeric DEFAULT '0' NOT NULL,
	`kit_discount_type` integer DEFAULT 0 NOT NULL,
	`price_option` integer DEFAULT 0 NOT NULL,
	`print_option` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_kits_item_kit_number` ON `ospos_item_kits` (`item_kit_number`);--> statement-breakpoint
CREATE INDEX `item_kits_name` ON `ospos_item_kits` (`name`,`description`);--> statement-breakpoint
CREATE TABLE `ospos_item_quantities` (
	`item_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`quantity` numeric DEFAULT '0' NOT NULL,
	PRIMARY KEY(`item_id`, `location_id`),
	FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `ospos_stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_quantities_item_id` ON `ospos_item_quantities` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_quantities_location_id` ON `ospos_item_quantities` (`location_id`);--> statement-breakpoint
CREATE TABLE `ospos_items` (
	`item_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`supplier_id` integer,
	`item_number` text,
	`description` text NOT NULL,
	`cost_price` numeric NOT NULL,
	`unit_price` numeric NOT NULL,
	`reorder_level` numeric DEFAULT '0' NOT NULL,
	`receiving_quantity` numeric DEFAULT '1' NOT NULL,
	`pic_filename` text,
	`allow_alt_description` integer NOT NULL,
	`is_serialized` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`stock_type` integer DEFAULT 0 NOT NULL,
	`item_type` integer DEFAULT 0 NOT NULL,
	`tax_category_id` integer,
	`qty_per_pack` numeric DEFAULT '1' NOT NULL,
	`pack_name` text DEFAULT 'Each',
	`low_sell_item_id` integer DEFAULT 0,
	`hsn_code` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `ospos_suppliers`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_item_number` ON `ospos_items` (`item_number`);--> statement-breakpoint
CREATE INDEX `items_supplier_id` ON `ospos_items` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `items_deleted` ON `ospos_items` (`deleted`,`item_type`);--> statement-breakpoint
CREATE INDEX `items_item_id` ON `ospos_items` (`item_id`,`deleted`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_items_uq1` ON `ospos_items` (`supplier_id`,`item_id`,`deleted`,`item_type`);--> statement-breakpoint
CREATE TABLE `ospos_items_taxes` (
	`item_id` integer NOT NULL,
	`name` text NOT NULL,
	`percent` numeric NOT NULL,
	PRIMARY KEY(`item_id`, `name`, `percent`),
	FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ospos_modules` (
	`module_id` text PRIMARY KEY NOT NULL,
	`name_lang_key` text NOT NULL,
	`desc_lang_key` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_desc_lang_key` ON `ospos_modules` (`desc_lang_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `modules_name_lang_key` ON `ospos_modules` (`name_lang_key`);--> statement-breakpoint
CREATE TABLE `ospos_people` (
	`person_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`gender` integer,
	`phone_number` text NOT NULL,
	`email` text NOT NULL,
	`address_1` text NOT NULL,
	`address_2` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`zip` text NOT NULL,
	`country` text NOT NULL,
	`comments` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `people_email` ON `ospos_people` (`email`);--> statement-breakpoint
CREATE INDEX `people_first_name` ON `ospos_people` (`first_name`,`last_name`,`email`,`phone_number`);--> statement-breakpoint
CREATE TABLE `ospos_permissions` (
	`permission_id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`location_id` integer,
	FOREIGN KEY (`module_id`) REFERENCES `ospos_modules`(`module_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `ospos_stock_locations`(`location_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stock_locations_module_id` ON `ospos_permissions` (`module_id`);--> statement-breakpoint
CREATE INDEX `stock_locations_ospos_permissions_ibfk_2` ON `ospos_permissions` (`location_id`);--> statement-breakpoint
CREATE TABLE `ospos_receivings` (
	`receiving_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receiving_time` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`supplier_id` integer,
	`employee_id` integer DEFAULT 0 NOT NULL,
	`comment` text NOT NULL,
	`payment_type` text,
	`reference` text,
	FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `ospos_suppliers`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `receivings_supplier_id` ON `ospos_receivings` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `receivings_employee_id` ON `ospos_receivings` (`employee_id`);--> statement-breakpoint
CREATE INDEX `receivings_reference` ON `ospos_receivings` (`reference`);--> statement-breakpoint
CREATE INDEX `receivings_receiving_time` ON `ospos_receivings` (`receiving_time`);--> statement-breakpoint
CREATE TABLE `ospos_receivings_items` (
	`receiving_id` integer DEFAULT 0 NOT NULL,
	`item_id` integer DEFAULT 0 NOT NULL,
	`description` text,
	`serialnumber` text,
	`line` integer NOT NULL,
	`quantity_purchased` numeric DEFAULT '0' NOT NULL,
	`item_cost_price` numeric NOT NULL,
	`item_unit_price` numeric NOT NULL,
	`discount` numeric DEFAULT '0' NOT NULL,
	`discount_type` integer DEFAULT 0 NOT NULL,
	`item_location` integer NOT NULL,
	`receiving_quantity` numeric DEFAULT '1' NOT NULL,
	PRIMARY KEY(`receiving_id`, `item_id`, `line`),
	FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiving_id`) REFERENCES `ospos_receivings`(`receiving_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `receivings_items_item_id` ON `ospos_receivings_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `ospos_sales` (
	`sale_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_time` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`customer_id` integer,
	`employee_id` integer DEFAULT 0 NOT NULL,
	`comment` text NOT NULL,
	`invoice_number` text,
	`quote_number` text,
	`sale_status` integer DEFAULT 0 NOT NULL,
	`work_order_number` text,
	`sale_type` integer DEFAULT 0 NOT NULL,
	`dinner_table_id` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `ospos_customers`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dinner_table_id`) REFERENCES `ospos_dinner_tables`(`dinner_table_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dinner_tables_invoice_number` ON `ospos_sales` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `dinner_tables_customer_id` ON `ospos_sales` (`customer_id`);--> statement-breakpoint
CREATE INDEX `dinner_tables_employee_id` ON `ospos_sales` (`employee_id`);--> statement-breakpoint
CREATE INDEX `dinner_tables_sale_time` ON `ospos_sales` (`sale_time`);--> statement-breakpoint
CREATE INDEX `dinner_tables_dinner_table_id` ON `ospos_sales` (`dinner_table_id`);--> statement-breakpoint
CREATE TABLE `ospos_sales_items` (
	`sale_id` integer DEFAULT 0 NOT NULL,
	`item_id` integer DEFAULT 0 NOT NULL,
	`description` text,
	`serialnumber` text,
	`line` integer DEFAULT 0 NOT NULL,
	`quantity_purchased` numeric DEFAULT '0' NOT NULL,
	`item_cost_price` numeric NOT NULL,
	`item_unit_price` numeric NOT NULL,
	`discount` numeric DEFAULT '0' NOT NULL,
	`discount_type` integer DEFAULT 0 NOT NULL,
	`item_location` integer NOT NULL,
	`print_option` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`sale_id`, `item_id`, `line`),
	FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_location`) REFERENCES `ospos_stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_items_sale_id` ON `ospos_sales_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sales_items_item_id` ON `ospos_sales_items` (`item_id`);--> statement-breakpoint
CREATE INDEX `sales_items_item_location` ON `ospos_sales_items` (`item_location`);--> statement-breakpoint
CREATE TABLE `ospos_sales_items_taxes` (
	`sale_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`line` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`percent` numeric DEFAULT '0.0000' NOT NULL,
	`tax_type` integer DEFAULT 0 NOT NULL,
	`rounding_code` integer DEFAULT 0 NOT NULL,
	`cascade_sequence` integer DEFAULT 0 NOT NULL,
	`item_tax_amount` numeric DEFAULT '0' NOT NULL,
	`sales_tax_code_id` integer,
	`jurisdiction_id` integer,
	`tax_category_id` integer,
	PRIMARY KEY(`sale_id`, `item_id`, `line`, `name`, `percent`),
	FOREIGN KEY (`sale_id`,`item_id`,`line`) REFERENCES `ospos_sales_items`(`sale_id`,`item_id`,`line`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_items_taxes_sale_id` ON `ospos_sales_items_taxes` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sales_items_taxes_item_id` ON `ospos_sales_items_taxes` (`item_id`);--> statement-breakpoint
CREATE TABLE `ospos_sales_payments` (
	`payment_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`payment_type` text NOT NULL,
	`payment_amount` numeric NOT NULL,
	`cash_refund` numeric DEFAULT '0' NOT NULL,
	`cash_adjustment` integer DEFAULT false NOT NULL,
	`employee_id` integer,
	`payment_time` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`reference_code` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_payments_payment_sale` ON `ospos_sales_payments` (`sale_id`,`payment_type`);--> statement-breakpoint
CREATE INDEX `sales_payments_employee_id` ON `ospos_sales_payments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `sales_payments_payment_time` ON `ospos_sales_payments` (`payment_time`);--> statement-breakpoint
CREATE TABLE `ospos_sales_reward_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`earned` real NOT NULL,
	`used` real NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_reward_points_sale_id` ON `ospos_sales_reward_points` (`sale_id`);--> statement-breakpoint
CREATE TABLE `ospos_sales_taxes` (
	`sales_taxes_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`jurisdiction_id` integer,
	`tax_category_id` integer,
	`tax_type` integer NOT NULL,
	`tax_group` text NOT NULL,
	`sale_tax_basis` numeric NOT NULL,
	`sale_tax_amount` numeric NOT NULL,
	`print_sequence` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`tax_rate` numeric NOT NULL,
	`sales_tax_code_id` integer,
	`rounding_code` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sales_taxes_print_sequence` ON `ospos_sales_taxes` (`sale_id`,`print_sequence`,`tax_group`);--> statement-breakpoint
CREATE TABLE `ospos_sessions` (
	`id` text NOT NULL,
	`ip_address` text NOT NULL,
	`timestamp` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`id`, `ip_address`)
);
--> statement-breakpoint
CREATE INDEX `sessions_ospos_sessions_timestamp` ON `ospos_sessions` (`timestamp`);--> statement-breakpoint
CREATE TABLE `ospos_stock_locations` (
	`location_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`location_name` text,
	`deleted` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`sort_order` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_locations_sort_order` ON `ospos_stock_locations` (`sort_order`);--> statement-breakpoint
CREATE TABLE `ospos_suppliers` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`agency_name` text NOT NULL,
	`account_number` text,
	`tax_id` text DEFAULT '' NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`category` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_account_number` ON `ospos_suppliers` (`account_number`);--> statement-breakpoint
CREATE INDEX `suppliers_category` ON `ospos_suppliers` (`category`);--> statement-breakpoint
CREATE INDEX `suppliers_company_name` ON `ospos_suppliers` (`company_name`,`deleted`);--> statement-breakpoint
CREATE TABLE `ospos_tax_categories` (
	`tax_category_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tax_category` text NOT NULL,
	`tax_group_sequence` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ospos_tax_codes` (
	`tax_code_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tax_code` text NOT NULL,
	`tax_code_name` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ospos_tax_jurisdictions` (
	`jurisdiction_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jurisdiction_name` text,
	`tax_group` text NOT NULL,
	`tax_type` integer NOT NULL,
	`reporting_authority` text,
	`tax_group_sequence` integer DEFAULT 0 NOT NULL,
	`cascade_sequence` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_config_tax_jurisdictions_uq1` ON `ospos_tax_jurisdictions` (`tax_group`);--> statement-breakpoint
CREATE TABLE `ospos_tax_rates` (
	`tax_rate_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rate_tax_code_id` integer NOT NULL,
	`rate_tax_category_id` integer NOT NULL,
	`rate_jurisdiction_id` integer NOT NULL,
	`tax_rate` numeric DEFAULT '0.0000' NOT NULL,
	`tax_rounding_code` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`rate_tax_category_id`) REFERENCES `ospos_tax_categories`(`tax_category_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_tax_code_id`) REFERENCES `ospos_tax_codes`(`tax_code_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rate_jurisdiction_id`) REFERENCES `ospos_tax_jurisdictions`(`jurisdiction_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_config_rate_tax_code_id` ON `ospos_tax_rates` (`rate_tax_code_id`);--> statement-breakpoint
CREATE INDEX `app_config_rate_tax_category_id` ON `ospos_tax_rates` (`rate_tax_category_id`);--> statement-breakpoint
CREATE INDEX `app_config_rate_jurisdiction_id` ON `ospos_tax_rates` (`rate_jurisdiction_id`);