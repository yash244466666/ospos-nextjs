CREATE TABLE `app_config` (
	`key` varchar(50) NOT NULL,
	`value` varchar(500) NOT NULL,
	CONSTRAINT `app_config_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `attribute_definitions` (
	`definition_id` int AUTO_INCREMENT NOT NULL,
	`definition_name` varchar(255) NOT NULL,
	`definition_type` varchar(255) NOT NULL,
	`definition_unit` varchar(255),
	`definition_flags` tinyint NOT NULL DEFAULT 0,
	`definition_fk` int,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `attribute_definitions_definition_id` PRIMARY KEY(`definition_id`)
);
--> statement-breakpoint
CREATE TABLE `attribute_links` (
	`attribute_id` int,
	`definition_id` int NOT NULL,
	`item_id` int,
	`sale_id` int,
	`receiving_id` int,
	`generated_unique_column` varchar(255) GENERATED ALWAYS AS (CONCAT(definition_id, '-', item_id)) STORED,
	CONSTRAINT `attribute_links_generated_unique_column_idx` UNIQUE(`generated_unique_column`)
);
--> statement-breakpoint
CREATE TABLE `attribute_values` (
	`attribute_id` int AUTO_INCREMENT NOT NULL,
	`attribute_value` text,
	`attribute_date` varchar(255),
	`attribute_decimal` decimal(15,4),
	CONSTRAINT `attribute_values_attribute_id` PRIMARY KEY(`attribute_id`)
);
--> statement-breakpoint
CREATE TABLE `cart_sessions` (
	`session_id` varchar(255) NOT NULL,
	`person_id` int NOT NULL,
	`data` text NOT NULL,
	`updated_at` int NOT NULL,
	CONSTRAINT `cart_sessions_session_id` PRIMARY KEY(`session_id`)
);
--> statement-breakpoint
CREATE TABLE `cashups` (
	`cashup_id` int AUTO_INCREMENT NOT NULL,
	`open_date` int,
	`close_date` int,
	`open_amount_cash` decimal(15,4) NOT NULL DEFAULT '0',
	`transfer_amount_cash` decimal(15,4) NOT NULL DEFAULT '0',
	`closed_amount_cash` decimal(15,4) NOT NULL DEFAULT '0',
	`note` text,
	`employee_id` int,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `cashups_cashup_id` PRIMARY KEY(`cashup_id`)
);
--> statement-breakpoint
CREATE TABLE `customer_rewards` (
	`customer_id` int NOT NULL,
	`reward_id` int NOT NULL,
	CONSTRAINT `customer_rewards_customer_id_reward_id_pk` PRIMARY KEY(`customer_id`,`reward_id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`person_id` int NOT NULL,
	`company_name` varchar(255),
	`account_number` varchar(255),
	`taxable` tinyint NOT NULL DEFAULT 1,
	`discount` decimal(15,4) NOT NULL DEFAULT '0',
	`discount_type` tinyint NOT NULL DEFAULT 0,
	`points` int NOT NULL DEFAULT 0,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `customers_person_id` PRIMARY KEY(`person_id`)
);
--> statement-breakpoint
CREATE TABLE `dinner_tables` (
	`dinner_table_id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `dinner_tables_dinner_table_id` PRIMARY KEY(`dinner_table_id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`person_id` int NOT NULL,
	`username` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`hash_version` tinyint NOT NULL DEFAULT 2,
	`deleted` tinyint NOT NULL DEFAULT 0,
	`language` varchar(255),
	`language_code` varchar(255),
	CONSTRAINT `employees_person_id` PRIMARY KEY(`person_id`),
	CONSTRAINT `employees_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`expense_category_id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(255) NOT NULL,
	`description` text,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `expense_categories_expense_category_id` PRIMARY KEY(`expense_category_id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`expense_id` int AUTO_INCREMENT NOT NULL,
	`expense_time` int NOT NULL,
	`amount` decimal(15,4) NOT NULL DEFAULT '0',
	`payment_type` varchar(255) NOT NULL,
	`expense_category_id` int,
	`description` text,
	`employee_id` int,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `expenses_expense_id` PRIMARY KEY(`expense_id`)
);
--> statement-breakpoint
CREATE TABLE `giftcards` (
	`giftcard_id` int AUTO_INCREMENT NOT NULL,
	`giftcard_number` varchar(255) NOT NULL,
	`value` decimal(15,4) NOT NULL DEFAULT '0',
	`person_id` int,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `giftcards_giftcard_id` PRIMARY KEY(`giftcard_id`),
	CONSTRAINT `giftcards_giftcard_number_unique` UNIQUE(`giftcard_number`)
);
--> statement-breakpoint
CREATE TABLE `grants` (
	`permission_id` varchar(255) NOT NULL,
	`person_id` int NOT NULL,
	`menu_group` varchar(10) NOT NULL DEFAULT 'both',
	CONSTRAINT `grants_permission_id_person_id_pk` PRIMARY KEY(`permission_id`,`person_id`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`trans_id` int AUTO_INCREMENT NOT NULL,
	`trans_items` int,
	`trans_user` int,
	`trans_date` int NOT NULL,
	`trans_comment` text,
	`trans_location` int,
	`trans_inventory` decimal(15,4) NOT NULL DEFAULT '0',
	CONSTRAINT `inventory_trans_id` PRIMARY KEY(`trans_id`)
);
--> statement-breakpoint
CREATE TABLE `item_kit_items` (
	`item_kit_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(15,4) NOT NULL DEFAULT '1',
	`kit_sequence` int NOT NULL DEFAULT 0,
	CONSTRAINT `item_kit_items_item_kit_id_item_id_kit_sequence_pk` PRIMARY KEY(`item_kit_id`,`item_id`,`kit_sequence`)
);
--> statement-breakpoint
CREATE TABLE `item_kits` (
	`item_kit_id` int AUTO_INCREMENT NOT NULL,
	`item_kit_number` varchar(255),
	`name` varchar(255) NOT NULL,
	`description` text,
	`item_id` int,
	`kit_discount` decimal(15,4) NOT NULL DEFAULT '0',
	`kit_discount_type` tinyint NOT NULL DEFAULT 0,
	`price_option` tinyint NOT NULL DEFAULT 0,
	`print_option` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `item_kits_item_kit_id` PRIMARY KEY(`item_kit_id`)
);
--> statement-breakpoint
CREATE TABLE `item_quantities` (
	`item_id` int NOT NULL,
	`location_id` int NOT NULL,
	`quantity` decimal(15,4) NOT NULL DEFAULT '0',
	CONSTRAINT `item_quantities_item_id_location_id_pk` PRIMARY KEY(`item_id`,`location_id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`item_id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(255),
	`supplier_id` int,
	`item_number` varchar(255),
	`description` text,
	`cost_price` decimal(15,4) NOT NULL DEFAULT '0',
	`unit_price` decimal(15,4) NOT NULL DEFAULT '0',
	`reorder_level` decimal(15,4) NOT NULL DEFAULT '0',
	`receiving_quantity` decimal(15,4) NOT NULL DEFAULT '1',
	`pic_filename` varchar(255),
	`allow_alt_description` tinyint NOT NULL DEFAULT 0,
	`is_serialized` tinyint NOT NULL DEFAULT 0,
	`stock_type` tinyint NOT NULL DEFAULT 0,
	`item_type` tinyint NOT NULL DEFAULT 0,
	`tax_category_id` int,
	`qty_per_pack` decimal(15,4) NOT NULL DEFAULT '1',
	`pack_name` varchar(255),
	`low_sell_item_id` int,
	`hsn_code` varchar(255),
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `items_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `items_taxes` (
	`item_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`percent` decimal(15,4) NOT NULL DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE `migrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` int NOT NULL,
	`class` varchar(255) NOT NULL,
	`namespace` varchar(255) NOT NULL,
	`time` int NOT NULL,
	CONSTRAINT `migrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`module_id` varchar(255) NOT NULL,
	`name_lang_key` varchar(255) NOT NULL,
	`desc_lang_key` varchar(255) NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	CONSTRAINT `modules_module_id` PRIMARY KEY(`module_id`),
	CONSTRAINT `modules_desc_lang_key_unique` UNIQUE(`desc_lang_key`)
);
--> statement-breakpoint
CREATE TABLE `people` (
	`person_id` int AUTO_INCREMENT NOT NULL,
	`first_name` varchar(255) NOT NULL,
	`last_name` varchar(255),
	`gender` tinyint DEFAULT 0,
	`phone_number` varchar(255),
	`email` varchar(255),
	`address_1` varchar(255),
	`address_2` varchar(255),
	`city` varchar(255),
	`state` varchar(255),
	`zip` varchar(255),
	`country` varchar(255),
	`comments` text,
	CONSTRAINT `people_person_id` PRIMARY KEY(`person_id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`permission_id` varchar(255) NOT NULL,
	`module_id` varchar(255) NOT NULL,
	`location_id` int,
	CONSTRAINT `permissions_permission_id` PRIMARY KEY(`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `receivings` (
	`receiving_id` int AUTO_INCREMENT NOT NULL,
	`receiving_time` int NOT NULL,
	`supplier_id` int,
	`employee_id` int,
	`comment` text,
	`payment_type` text,
	`receiving_ref` int,
	`invoice_number` varchar(255),
	`receiving_location` int,
	CONSTRAINT `receivings_receiving_id` PRIMARY KEY(`receiving_id`)
);
--> statement-breakpoint
CREATE TABLE `receivings_items` (
	`receiving_id` int NOT NULL,
	`item_id` int NOT NULL,
	`description` text,
	`serialnumber` text,
	`quantity_purchased` decimal(15,4) NOT NULL DEFAULT '0',
	`item_cost_price` decimal(15,4) NOT NULL DEFAULT '0',
	`item_unit_price` decimal(15,4) NOT NULL DEFAULT '0',
	`discount` decimal(15,4) NOT NULL DEFAULT '0',
	`discount_type` tinyint NOT NULL DEFAULT 0,
	`line` int NOT NULL,
	`item_location` int,
	`receiving_quantity` decimal(15,4) NOT NULL DEFAULT '1',
	`transfer_item_location` int,
	CONSTRAINT `receivings_items_receiving_id_item_id_line_pk` PRIMARY KEY(`receiving_id`,`item_id`,`line`)
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`reward_id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`points_percent` decimal(15,4) NOT NULL DEFAULT '0',
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `rewards_reward_id` PRIMARY KEY(`reward_id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`sale_id` int AUTO_INCREMENT NOT NULL,
	`sale_time` int NOT NULL,
	`customer_id` int,
	`employee_id` int,
	`comment` text,
	`invoice_number` varchar(255),
	`quote_number` varchar(255),
	`sale_status` tinyint NOT NULL DEFAULT 0,
	`sale_type` tinyint NOT NULL DEFAULT 0,
	`dinner_table_id` int,
	`work_order_number` varchar(255),
	`sale_location` int,
	`sale_cash_adjustment` decimal(15,4) NOT NULL DEFAULT '0',
	`sale_cash_refund` decimal(15,4) NOT NULL DEFAULT '0',
	CONSTRAINT `sales_sale_id` PRIMARY KEY(`sale_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_items` (
	`sale_id` int NOT NULL,
	`item_id` int NOT NULL,
	`line` int NOT NULL,
	`description` text,
	`serialnumber` text,
	`quantity_purchased` decimal(15,4) NOT NULL DEFAULT '0',
	`discount` decimal(15,4) NOT NULL DEFAULT '0',
	`discount_type` tinyint NOT NULL DEFAULT 0,
	`item_cost_price` decimal(15,4) NOT NULL DEFAULT '0',
	`item_unit_price` decimal(15,4) NOT NULL DEFAULT '0',
	`item_location` int,
	`print_option` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `sales_items_sale_id_item_id_line_pk` PRIMARY KEY(`sale_id`,`item_id`,`line`)
);
--> statement-breakpoint
CREATE TABLE `sales_items_taxes` (
	`sale_id` int NOT NULL,
	`item_id` int NOT NULL,
	`line` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`percent` decimal(15,4) NOT NULL DEFAULT '0',
	`item_tax_amount` decimal(15,4) NOT NULL DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE `sales_payments` (
	`sale_id` int NOT NULL,
	`payment_type` varchar(255) NOT NULL,
	`payment_amount` decimal(15,4) NOT NULL DEFAULT '0',
	`cash_refund` decimal(15,4) NOT NULL DEFAULT '0',
	`cash_adjustment` decimal(15,4) NOT NULL DEFAULT '0',
	`employee_id` int,
	`payment_time` int NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales_taxes` (
	`sale_id` int NOT NULL,
	`tax_type` tinyint NOT NULL,
	`round_code` tinyint NOT NULL,
	`tax_group` varchar(255) NOT NULL,
	`sale_tax_basis` decimal(15,4) NOT NULL DEFAULT '0',
	`sale_tax_amount` decimal(15,4) NOT NULL DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(128) NOT NULL,
	`ip_address` varchar(45),
	`timestamp` int NOT NULL,
	`data` text,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_locations` (
	`location_id` int AUTO_INCREMENT NOT NULL,
	`location_name` varchar(255) NOT NULL,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `stock_locations_location_id` PRIMARY KEY(`location_id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`person_id` int NOT NULL,
	`company_name` varchar(255),
	`agency_name` varchar(255),
	`account_number` varchar(255),
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `suppliers_person_id` PRIMARY KEY(`person_id`),
	CONSTRAINT `suppliers_account_number_unique` UNIQUE(`account_number`)
);
--> statement-breakpoint
CREATE TABLE `tax_categories` (
	`tax_category_id` int AUTO_INCREMENT NOT NULL,
	`tax_category` varchar(255) NOT NULL,
	`tax_group_seq` varchar(255),
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `tax_categories_tax_category_id` PRIMARY KEY(`tax_category_id`)
);
--> statement-breakpoint
CREATE TABLE `tax_code_links` (
	`tax_code_link_id` int AUTO_INCREMENT NOT NULL,
	`tax_code_id` int NOT NULL,
	`tax_category_id` int NOT NULL,
	`jurisdiction_id` int NOT NULL,
	`tax_rate` decimal(15,4) NOT NULL DEFAULT '0',
	`round_code` tinyint NOT NULL DEFAULT 1,
	`cascade_sequence` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `tax_code_links_tax_code_link_id` PRIMARY KEY(`tax_code_link_id`)
);
--> statement-breakpoint
CREATE TABLE `tax_codes` (
	`tax_code_id` int AUTO_INCREMENT NOT NULL,
	`tax_code` varchar(255) NOT NULL,
	`tax_code_name` varchar(255) NOT NULL,
	`city` varchar(255),
	`state` varchar(255),
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `tax_codes_tax_code_id` PRIMARY KEY(`tax_code_id`)
);
--> statement-breakpoint
CREATE TABLE `tax_jurisdictions` (
	`jurisdiction_id` int AUTO_INCREMENT NOT NULL,
	`jurisdiction_name` varchar(255) NOT NULL,
	`tax_type` varchar(255) NOT NULL,
	`reporting_authority` varchar(255),
	`taxable_amount` decimal(15,4),
	`tax_rate` decimal(15,4) NOT NULL DEFAULT '0',
	`tax_group` varchar(255),
	`round_code` tinyint NOT NULL DEFAULT 1,
	`cascade_sequence` tinyint NOT NULL DEFAULT 0,
	`deleted` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `tax_jurisdictions_jurisdiction_id` PRIMARY KEY(`jurisdiction_id`)
);
--> statement-breakpoint
ALTER TABLE `attribute_links` ADD CONSTRAINT `attribute_links_attribute_id_attribute_values_attribute_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attribute_values`(`attribute_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attribute_links` ADD CONSTRAINT `attribute_links_definition_id_attribute_definitions_definition_id_fk` FOREIGN KEY (`definition_id`) REFERENCES `attribute_definitions`(`definition_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attribute_links` ADD CONSTRAINT `attribute_links_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cashups` ADD CONSTRAINT `cashups_employee_id_employees_person_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_rewards` ADD CONSTRAINT `customer_rewards_customer_id_customers_person_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`person_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_rewards` ADD CONSTRAINT `customer_rewards_reward_id_rewards_reward_id_fk` FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`reward_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_person_id_people_person_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_person_id_people_person_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_employee_id_employees_person_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `giftcards` ADD CONSTRAINT `giftcards_person_id_people_person_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grants` ADD CONSTRAINT `grants_permission_id_permissions_permission_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`permission_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `grants` ADD CONSTRAINT `grants_person_id_employees_person_id_fk` FOREIGN KEY (`person_id`) REFERENCES `employees`(`person_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_trans_items_items_item_id_fk` FOREIGN KEY (`trans_items`) REFERENCES `items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_trans_user_people_person_id_fk` FOREIGN KEY (`trans_user`) REFERENCES `people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_trans_location_stock_locations_location_id_fk` FOREIGN KEY (`trans_location`) REFERENCES `stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_kit_items` ADD CONSTRAINT `item_kit_items_item_kit_id_item_kits_item_kit_id_fk` FOREIGN KEY (`item_kit_id`) REFERENCES `item_kits`(`item_kit_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_kit_items` ADD CONSTRAINT `item_kit_items_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_kits` ADD CONSTRAINT `item_kits_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_quantities` ADD CONSTRAINT `item_quantities_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_quantities` ADD CONSTRAINT `item_quantities_location_id_stock_locations_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `stock_locations`(`location_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_supplier_id_people_person_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items_taxes` ADD CONSTRAINT `items_taxes_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_module_id_modules_module_id_fk` FOREIGN KEY (`module_id`) REFERENCES `modules`(`module_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_location_id_stock_locations_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `stock_locations`(`location_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receivings` ADD CONSTRAINT `receivings_supplier_id_people_person_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receivings` ADD CONSTRAINT `receivings_employee_id_employees_person_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receivings` ADD CONSTRAINT `receivings_receiving_location_stock_locations_location_id_fk` FOREIGN KEY (`receiving_location`) REFERENCES `stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receivings_items` ADD CONSTRAINT `receivings_items_receiving_id_receivings_receiving_id_fk` FOREIGN KEY (`receiving_id`) REFERENCES `receivings`(`receiving_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receivings_items` ADD CONSTRAINT `receivings_items_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receivings_items` ADD CONSTRAINT `receivings_items_item_location_stock_locations_location_id_fk` FOREIGN KEY (`item_location`) REFERENCES `stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_customer_id_people_person_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_employee_id_employees_person_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_sale_location_stock_locations_location_id_fk` FOREIGN KEY (`sale_location`) REFERENCES `stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_items` ADD CONSTRAINT `sales_items_sale_id_sales_sale_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_items` ADD CONSTRAINT `sales_items_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_items` ADD CONSTRAINT `sales_items_item_location_stock_locations_location_id_fk` FOREIGN KEY (`item_location`) REFERENCES `stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_items_taxes` ADD CONSTRAINT `sales_items_taxes_sale_id_sales_sale_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_payments` ADD CONSTRAINT `sales_payments_sale_id_sales_sale_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_payments` ADD CONSTRAINT `sales_payments_employee_id_employees_person_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_taxes` ADD CONSTRAINT `sales_taxes_sale_id_sales_sale_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`sale_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_person_id_people_person_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`person_id`) ON DELETE cascade ON UPDATE no action;