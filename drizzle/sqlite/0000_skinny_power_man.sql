CREATE TABLE `cart_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`person_id` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`hash_version` integer DEFAULT 2 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`language` text,
	`language_code` text,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_username_unique` ON `employees` (`username`);--> statement-breakpoint
CREATE TABLE `grants` (
	`permission_id` text NOT NULL,
	`person_id` integer NOT NULL,
	`menu_group` text DEFAULT 'both',
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`permission_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `employees`(`person_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`module_id` text PRIMARY KEY NOT NULL,
	`name_lang_key` text NOT NULL,
	`desc_lang_key` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_desc_lang_key_unique` ON `modules` (`desc_lang_key`);--> statement-breakpoint
CREATE TABLE `people` (
	`person_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`gender` integer DEFAULT 0,
	`phone_number` text,
	`email` text,
	`address_1` text,
	`address_2` text,
	`city` text,
	`state` text,
	`zip` text,
	`country` text,
	`comments` text
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`permission_id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`location_id` integer,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`module_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`ip_address` text,
	`timestamp` integer NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE TABLE `stock_locations` (
	`location_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`location_name` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`trans_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trans_items` integer,
	`trans_user` integer,
	`trans_date` integer,
	`trans_comment` text,
	`trans_location` integer,
	`trans_inventory` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`trans_items`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trans_user`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trans_location`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `item_kit_items` (
	`item_kit_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`kit_sequence` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_kit_id`) REFERENCES `item_kits`(`item_kit_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `item_kits` (
	`item_kit_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_kit_number` text,
	`name` text NOT NULL,
	`description` text,
	`item_id` integer,
	`kit_discount` real DEFAULT 0 NOT NULL,
	`kit_discount_type` integer DEFAULT 0 NOT NULL,
	`price_option` integer DEFAULT 0 NOT NULL,
	`print_option` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `item_quantities` (
	`item_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `items` (
	`item_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`supplier_id` integer,
	`item_number` text,
	`description` text,
	`cost_price` real DEFAULT 0 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`reorder_level` real DEFAULT 0 NOT NULL,
	`receiving_quantity` real DEFAULT 1 NOT NULL,
	`pic_filename` text,
	`allow_alt_description` integer DEFAULT false NOT NULL,
	`is_serialized` integer DEFAULT false NOT NULL,
	`stock_type` integer DEFAULT 0 NOT NULL,
	`item_type` integer DEFAULT 0 NOT NULL,
	`tax_category_id` integer,
	`qty_per_pack` real DEFAULT 1 NOT NULL,
	`pack_name` text,
	`low_sell_item_id` integer,
	`hsn_code` text,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items_taxes` (
	`item_id` integer NOT NULL,
	`name` text NOT NULL,
	`percent` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attribute_definitions` (
	`definition_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definition_name` text NOT NULL,
	`definition_type` text NOT NULL,
	`definition_unit` text,
	`definition_flags` integer DEFAULT 0 NOT NULL,
	`definition_fk` integer,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attribute_links` (
	`attribute_id` integer,
	`definition_id` integer NOT NULL,
	`item_id` integer,
	`sale_id` integer,
	`receiving_id` integer,
	FOREIGN KEY (`attribute_id`) REFERENCES `attribute_values`(`attribute_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`definition_id`) REFERENCES `attribute_definitions`(`definition_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attribute_values` (
	`attribute_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attribute_value` text,
	`attribute_date` text,
	`attribute_decimal` real
);
--> statement-breakpoint
CREATE TABLE `customer_rewards` (
	`customer_id` integer NOT NULL,
	`reward_id` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`person_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`reward_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`company_name` text,
	`account_number` text,
	`taxable` integer DEFAULT true NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`discount_type` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dinner_tables` (
	`dinner_table_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`reward_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`points_percent` real DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`company_name` text,
	`agency_name` text,
	`account_number` text,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_account_number_unique` ON `suppliers` (`account_number`);--> statement-breakpoint
CREATE TABLE `receivings` (
	`receiving_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receiving_time` integer,
	`supplier_id` integer,
	`employee_id` integer,
	`comment` text,
	`payment_type` text,
	`receiving_ref` integer,
	`invoice_number` text,
	`receiving_location` integer,
	FOREIGN KEY (`supplier_id`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiving_ref`) REFERENCES `receivings`(`receiving_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiving_location`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receivings_items` (
	`receiving_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`description` text,
	`serialnumber` text,
	`quantity_purchased` real DEFAULT 0 NOT NULL,
	`item_cost_price` real DEFAULT 0 NOT NULL,
	`item_unit_price` real DEFAULT 0 NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`discount_type` integer DEFAULT 0 NOT NULL,
	`line` integer NOT NULL,
	`item_location` integer,
	`receiving_quantity` real DEFAULT 1 NOT NULL,
	`transfer_item_location` integer,
	FOREIGN KEY (`receiving_id`) REFERENCES `receivings`(`receiving_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_location`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`sale_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_time` integer,
	`customer_id` integer,
	`employee_id` integer,
	`comment` text,
	`invoice_number` text,
	`quote_number` text,
	`sale_status` integer DEFAULT 0 NOT NULL,
	`sale_type` integer DEFAULT 0 NOT NULL,
	`dinner_table_id` integer,
	`work_order_number` text,
	`sale_location` integer,
	`sale_cash_adjustment` real DEFAULT 0,
	`sale_cash_refund` real DEFAULT 0,
	FOREIGN KEY (`customer_id`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_location`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales_items` (
	`sale_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`line` integer NOT NULL,
	`description` text,
	`serialnumber` text,
	`quantity_purchased` real DEFAULT 0 NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`discount_type` integer DEFAULT 0 NOT NULL,
	`item_cost_price` real DEFAULT 0 NOT NULL,
	`item_unit_price` real DEFAULT 0 NOT NULL,
	`item_location` integer,
	`print_option` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_location`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales_items_taxes` (
	`sale_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`line` integer NOT NULL,
	`name` text NOT NULL,
	`percent` real DEFAULT 0 NOT NULL,
	`item_tax_amount` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sales_payments` (
	`sale_id` integer NOT NULL,
	`payment_type` text NOT NULL,
	`payment_amount` real DEFAULT 0 NOT NULL,
	`cash_refund` real DEFAULT 0 NOT NULL,
	`cash_adjustment` real DEFAULT 0 NOT NULL,
	`employee_id` integer,
	`payment_time` integer,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales_taxes` (
	`sale_id` integer NOT NULL,
	`tax_type` integer NOT NULL,
	`round_code` integer NOT NULL,
	`tax_group` text NOT NULL,
	`sale_tax_basis` real DEFAULT 0 NOT NULL,
	`sale_tax_amount` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tax_categories` (
	`tax_category_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tax_category` text NOT NULL,
	`tax_group_seq` text,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_code_links` (
	`tax_code_link_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tax_code_id` integer NOT NULL,
	`tax_category_id` integer NOT NULL,
	`jurisdiction_id` integer NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`round_code` integer DEFAULT 1 NOT NULL,
	`cascade_sequence` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_codes` (
	`tax_code_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tax_code` text NOT NULL,
	`tax_code_name` text NOT NULL,
	`city` text,
	`state` text,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_jurisdictions` (
	`jurisdiction_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jurisdiction_name` text NOT NULL,
	`tax_type` text NOT NULL,
	`reporting_authority` text,
	`taxable_amount` real,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`tax_group` text,
	`round_code` integer DEFAULT 1 NOT NULL,
	`cascade_sequence` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`expense_category_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`deleted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`expense_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expense_time` integer,
	`amount` real DEFAULT 0 NOT NULL,
	`payment_type` text NOT NULL,
	`expense_category_id` integer,
	`description` text,
	`employee_id` integer,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cashups` (
	`cashup_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`open_date` integer,
	`close_date` integer,
	`open_amount_cash` real DEFAULT 0 NOT NULL,
	`transfer_amount_cash` real DEFAULT 0 NOT NULL,
	`closed_amount_cash` real DEFAULT 0 NOT NULL,
	`note` text,
	`employee_id` integer,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `giftcards` (
	`giftcard_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`giftcard_number` text NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`person_id` integer,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `giftcards_giftcard_number_unique` ON `giftcards` (`giftcard_number`);--> statement-breakpoint
CREATE TABLE `migrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`class` text NOT NULL,
	`namespace` text NOT NULL,
	`time` integer NOT NULL
);
