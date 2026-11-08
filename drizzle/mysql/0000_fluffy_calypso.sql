CREATE TABLE `ospos_app_config` (
	`key` varchar(50) NOT NULL,
	`value` varchar(500) NOT NULL,
	CONSTRAINT `ospos_app_config_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `ospos_attribute_definitions` (
	`definition_id` int AUTO_INCREMENT NOT NULL,
	`definition_name` varchar(255) NOT NULL,
	`definition_type` varchar(45) NOT NULL,
	`definition_unit` varchar(16),
	`definition_flags` tinyint NOT NULL,
	`definition_fk` int,
	`deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_attribute_definitions_definition_id` PRIMARY KEY(`definition_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_attribute_links` (
	`attribute_id` int,
	`definition_id` int NOT NULL,
	`item_id` int,
	`sale_id` int,
	`receiving_id` int,
	`generated_unique_column` varchar(255) GENERATED ALWAYS AS (CASE WHEN `sale_id` IS NULL AND `receiving_id` IS NULL AND `item_id` IS NOT NULL THEN CONCAT(`definition_id`, '-', `item_id`) ELSE NULL END) STORED,
	CONSTRAINT `attribute_links_uq1` UNIQUE(`attribute_id`,`definition_id`,`item_id`,`sale_id`,`receiving_id`),
	CONSTRAINT `attribute_links_uq2` UNIQUE(`item_id`,`receiving_id`,`sale_id`,`definition_id`,`attribute_id`),
	CONSTRAINT `attribute_links_uq3` UNIQUE(`generated_unique_column`)
);
--> statement-breakpoint
CREATE TABLE `ospos_attribute_values` (
	`attribute_id` int AUTO_INCREMENT NOT NULL,
	`attribute_value` varchar(255),
	`attribute_date` date,
	`attribute_decimal` decimal(7,3),
	CONSTRAINT `ospos_attribute_values_attribute_id` PRIMARY KEY(`attribute_id`),
	CONSTRAINT `attribute_value` UNIQUE(`attribute_value`),
	CONSTRAINT `attribute_date` UNIQUE(`attribute_date`),
	CONSTRAINT `attribute_decimal` UNIQUE(`attribute_decimal`)
);
--> statement-breakpoint
CREATE TABLE `ospos_cash_up` (
	`cashup_id` int AUTO_INCREMENT NOT NULL,
	`open_date` timestamp DEFAULT CURRENT_TIMESTAMP,
	`close_date` timestamp,
	`open_amount_cash` decimal(15,2) NOT NULL,
	`transfer_amount_cash` decimal(15,2) NOT NULL,
	`note` boolean NOT NULL DEFAULT false,
	`closed_amount_cash` decimal(15,2) NOT NULL,
	`closed_amount_card` decimal(15,2) NOT NULL,
	`closed_amount_check` decimal(15,2) NOT NULL,
	`closed_amount_total` decimal(15,2) NOT NULL,
	`description` varchar(255) NOT NULL,
	`open_employee_id` int NOT NULL,
	`close_employee_id` int NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`closed_amount_due` decimal(15,2) NOT NULL,
	CONSTRAINT `ospos_cash_up_cashup_id` PRIMARY KEY(`cashup_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_customers_packages` (
	`package_id` int AUTO_INCREMENT NOT NULL,
	`package_name` varchar(255),
	`points_percent` float NOT NULL DEFAULT 0,
	`deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_customers_packages_package_id` PRIMARY KEY(`package_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_customers` (
	`person_id` int NOT NULL,
	`company_name` varchar(255),
	`account_number` varchar(255),
	`taxable` boolean NOT NULL DEFAULT true,
	`tax_id` varchar(32) NOT NULL DEFAULT '',
	`sales_tax_code_id` int,
	`package_id` int,
	`points` int,
	`deleted` boolean NOT NULL DEFAULT false,
	`discount` decimal(15,2) NOT NULL DEFAULT '0',
	`discount_type` tinyint NOT NULL DEFAULT 0,
	`date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`employee_id` int NOT NULL,
	`consent` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_customers_person_id` PRIMARY KEY(`person_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_customers_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`person_id` int NOT NULL,
	`package_id` int NOT NULL,
	`sale_id` int NOT NULL,
	`points_earned` int NOT NULL,
	CONSTRAINT `ospos_customers_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_dinner_tables` (
	`dinner_table_id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(30) NOT NULL,
	`status` tinyint NOT NULL DEFAULT 0,
	`deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_dinner_tables_dinner_table_id` PRIMARY KEY(`dinner_table_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_employees` (
	`person_id` int NOT NULL,
	`username` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`hash_version` tinyint NOT NULL DEFAULT 2,
	`language` varchar(48),
	`language_code` varchar(8),
	CONSTRAINT `ospos_employees_person_id` PRIMARY KEY(`person_id`),
	CONSTRAINT `username` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `ospos_expense_categories` (
	`expense_category_id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(255),
	`category_description` varchar(255) NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_expense_categories_expense_category_id` PRIMARY KEY(`expense_category_id`),
	CONSTRAINT `category_name` UNIQUE(`category_name`)
);
--> statement-breakpoint
CREATE TABLE `ospos_expenses` (
	`expense_id` int AUTO_INCREMENT NOT NULL,
	`date` timestamp DEFAULT CURRENT_TIMESTAMP,
	`amount` decimal(15,2) NOT NULL,
	`payment_type` varchar(40) NOT NULL,
	`expense_category_id` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`employee_id` int NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`supplier_tax_code` varchar(255),
	`tax_amount` decimal(15,2),
	`supplier_id` int,
	CONSTRAINT `ospos_expenses_expense_id` PRIMARY KEY(`expense_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_giftcards` (
	`giftcard_id` int AUTO_INCREMENT NOT NULL,
	`record_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`giftcard_number` varchar(255),
	`value` decimal(15,2) NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`person_id` int,
	CONSTRAINT `ospos_giftcards_giftcard_id` PRIMARY KEY(`giftcard_id`),
	CONSTRAINT `giftcard_number` UNIQUE(`giftcard_number`)
);
--> statement-breakpoint
CREATE TABLE `ospos_grants` (
	`permission_id` varchar(255) NOT NULL,
	`person_id` int NOT NULL,
	`menu_group` varchar(32) DEFAULT 'home',
	CONSTRAINT `PRIMARY` PRIMARY KEY(`permission_id`,`person_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_inventory` (
	`trans_id` int AUTO_INCREMENT NOT NULL,
	`trans_items` int NOT NULL DEFAULT 0,
	`trans_user` int NOT NULL DEFAULT 0,
	`trans_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`trans_comment` text NOT NULL,
	`trans_location` int NOT NULL,
	`trans_inventory` decimal(15,3) NOT NULL DEFAULT '0',
	CONSTRAINT `ospos_inventory_trans_id` PRIMARY KEY(`trans_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_item_kit_items` (
	`item_kit_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`kit_sequence` int NOT NULL DEFAULT 0,
	CONSTRAINT `PRIMARY` PRIMARY KEY(`item_kit_id`,`item_id`,`quantity`)
);
--> statement-breakpoint
CREATE TABLE `ospos_item_kits` (
	`item_kit_id` int AUTO_INCREMENT NOT NULL,
	`item_kit_number` varchar(255),
	`name` varchar(255) NOT NULL,
	`description` varchar(255) NOT NULL,
	`item_id` int NOT NULL DEFAULT 0,
	`kit_discount` decimal(15,2) NOT NULL DEFAULT '0',
	`kit_discount_type` tinyint NOT NULL DEFAULT 0,
	`price_option` tinyint NOT NULL DEFAULT 0,
	`print_option` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `ospos_item_kits_item_kit_id` PRIMARY KEY(`item_kit_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_item_quantities` (
	`item_id` int NOT NULL,
	`location_id` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL DEFAULT '0',
	CONSTRAINT `PRIMARY` PRIMARY KEY(`item_id`,`location_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_items` (
	`item_id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(255) NOT NULL,
	`supplier_id` int,
	`item_number` varchar(255),
	`description` varchar(255) NOT NULL,
	`cost_price` decimal(15,2) NOT NULL,
	`unit_price` decimal(15,2) NOT NULL,
	`reorder_level` decimal(15,3) NOT NULL DEFAULT '0',
	`receiving_quantity` decimal(15,3) NOT NULL DEFAULT '1',
	`pic_filename` varchar(255),
	`allow_alt_description` boolean NOT NULL,
	`is_serialized` boolean NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`stock_type` tinyint NOT NULL DEFAULT 0,
	`item_type` tinyint NOT NULL DEFAULT 0,
	`tax_category_id` int,
	`qty_per_pack` decimal(15,3) NOT NULL DEFAULT '1',
	`pack_name` varchar(8) DEFAULT 'Each',
	`low_sell_item_id` int DEFAULT 0,
	`hsn_code` varchar(32) NOT NULL DEFAULT '',
	CONSTRAINT `ospos_items_item_id` PRIMARY KEY(`item_id`),
	CONSTRAINT `items_uq1` UNIQUE(`supplier_id`,`item_id`,`deleted`,`item_type`)
);
--> statement-breakpoint
CREATE TABLE `ospos_items_taxes` (
	`item_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`percent` decimal(15,3) NOT NULL,
	CONSTRAINT `PRIMARY` PRIMARY KEY(`item_id`,`name`,`percent`)
);
--> statement-breakpoint
CREATE TABLE `ospos_modules` (
	`module_id` varchar(255) NOT NULL,
	`name_lang_key` varchar(255) NOT NULL,
	`desc_lang_key` varchar(255) NOT NULL,
	`sort` int NOT NULL,
	CONSTRAINT `ospos_modules_module_id` PRIMARY KEY(`module_id`),
	CONSTRAINT `desc_lang_key` UNIQUE(`desc_lang_key`),
	CONSTRAINT `name_lang_key` UNIQUE(`name_lang_key`)
);
--> statement-breakpoint
CREATE TABLE `ospos_people` (
	`person_id` int AUTO_INCREMENT NOT NULL,
	`first_name` varchar(255) NOT NULL,
	`last_name` varchar(255) NOT NULL,
	`gender` int,
	`phone_number` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`address_1` varchar(255) NOT NULL,
	`address_2` varchar(255) NOT NULL,
	`city` varchar(255) NOT NULL,
	`state` varchar(255) NOT NULL,
	`zip` varchar(255) NOT NULL,
	`country` varchar(255) NOT NULL,
	`comments` text NOT NULL,
	CONSTRAINT `ospos_people_person_id` PRIMARY KEY(`person_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_permissions` (
	`permission_id` varchar(255) NOT NULL,
	`module_id` varchar(255) NOT NULL,
	`location_id` int,
	CONSTRAINT `ospos_permissions_permission_id` PRIMARY KEY(`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_receivings` (
	`receiving_id` int AUTO_INCREMENT NOT NULL,
	`receiving_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`supplier_id` int,
	`employee_id` int NOT NULL DEFAULT 0,
	`comment` text NOT NULL,
	`payment_type` varchar(20),
	`reference` varchar(32),
	CONSTRAINT `ospos_receivings_receiving_id` PRIMARY KEY(`receiving_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_receivings_items` (
	`receiving_id` int NOT NULL DEFAULT 0,
	`item_id` int NOT NULL DEFAULT 0,
	`description` varchar(30),
	`serialnumber` varchar(30),
	`line` int NOT NULL,
	`quantity_purchased` decimal(15,3) NOT NULL DEFAULT '0',
	`item_cost_price` decimal(15,2) NOT NULL,
	`item_unit_price` decimal(15,2) NOT NULL,
	`discount` decimal(15,2) NOT NULL DEFAULT '0',
	`discount_type` tinyint NOT NULL DEFAULT 0,
	`item_location` int NOT NULL,
	`receiving_quantity` decimal(15,3) NOT NULL DEFAULT '1',
	CONSTRAINT `PRIMARY` PRIMARY KEY(`receiving_id`,`item_id`,`line`)
);
--> statement-breakpoint
CREATE TABLE `ospos_sales` (
	`sale_id` int AUTO_INCREMENT NOT NULL,
	`sale_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`customer_id` int,
	`employee_id` int NOT NULL DEFAULT 0,
	`comment` text NOT NULL,
	`invoice_number` varchar(32),
	`quote_number` varchar(32),
	`sale_status` tinyint NOT NULL DEFAULT 0,
	`work_order_number` varchar(32),
	`sale_type` tinyint NOT NULL DEFAULT 0,
	`dinner_table_id` int,
	CONSTRAINT `ospos_sales_sale_id` PRIMARY KEY(`sale_id`),
	CONSTRAINT `invoice_number` UNIQUE(`invoice_number`)
);
--> statement-breakpoint
CREATE TABLE `ospos_sales_items` (
	`sale_id` int NOT NULL DEFAULT 0,
	`item_id` int NOT NULL DEFAULT 0,
	`description` varchar(255),
	`serialnumber` varchar(30),
	`line` int NOT NULL DEFAULT 0,
	`quantity_purchased` decimal(15,3) NOT NULL DEFAULT '0',
	`item_cost_price` decimal(15,2) NOT NULL,
	`item_unit_price` decimal(15,2) NOT NULL,
	`discount` decimal(15,2) NOT NULL DEFAULT '0',
	`discount_type` tinyint NOT NULL DEFAULT 0,
	`item_location` int NOT NULL,
	`print_option` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `PRIMARY` PRIMARY KEY(`sale_id`,`item_id`,`line`)
);
--> statement-breakpoint
CREATE TABLE `ospos_sales_items_taxes` (
	`sale_id` int NOT NULL,
	`item_id` int NOT NULL,
	`line` int NOT NULL DEFAULT 0,
	`name` varchar(255) NOT NULL,
	`percent` decimal(15,4) NOT NULL DEFAULT '0.0000',
	`tax_type` tinyint NOT NULL DEFAULT 0,
	`rounding_code` tinyint NOT NULL DEFAULT 0,
	`cascade_sequence` tinyint NOT NULL DEFAULT 0,
	`item_tax_amount` decimal(15,4) NOT NULL DEFAULT '0',
	`sales_tax_code_id` int,
	`jurisdiction_id` int,
	`tax_category_id` int,
	CONSTRAINT `PRIMARY` PRIMARY KEY(`sale_id`,`item_id`,`line`,`name`,`percent`)
);
--> statement-breakpoint
CREATE TABLE `ospos_sales_payments` (
	`payment_id` int AUTO_INCREMENT NOT NULL,
	`sale_id` int NOT NULL,
	`payment_type` varchar(40) NOT NULL,
	`payment_amount` decimal(15,2) NOT NULL,
	`cash_refund` decimal(15,2) NOT NULL DEFAULT '0',
	`cash_adjustment` boolean NOT NULL DEFAULT false,
	`employee_id` int,
	`payment_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`reference_code` varchar(40) NOT NULL DEFAULT '',
	CONSTRAINT `ospos_sales_payments_payment_id` PRIMARY KEY(`payment_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_sales_reward_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sale_id` int NOT NULL,
	`earned` float NOT NULL,
	`used` float NOT NULL,
	CONSTRAINT `ospos_sales_reward_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_sales_taxes` (
	`sales_taxes_id` int AUTO_INCREMENT NOT NULL,
	`sale_id` int NOT NULL,
	`jurisdiction_id` int,
	`tax_category_id` int,
	`tax_type` smallint NOT NULL,
	`tax_group` varchar(32) NOT NULL,
	`sale_tax_basis` decimal(15,4) NOT NULL,
	`sale_tax_amount` decimal(15,4) NOT NULL,
	`print_sequence` tinyint NOT NULL DEFAULT 0,
	`name` varchar(255) NOT NULL,
	`tax_rate` decimal(15,4) NOT NULL,
	`sales_tax_code_id` int,
	`rounding_code` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `ospos_sales_taxes_sales_taxes_id` PRIMARY KEY(`sales_taxes_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_sessions` (
	`id` varchar(128) NOT NULL,
	`ip_address` varchar(45) NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`data` blob NOT NULL,
	CONSTRAINT `PRIMARY` PRIMARY KEY(`id`,`ip_address`)
);
--> statement-breakpoint
CREATE TABLE `ospos_stock_locations` (
	`location_id` int AUTO_INCREMENT NOT NULL,
	`location_name` varchar(255),
	`deleted` boolean NOT NULL DEFAULT false,
	`is_default` boolean NOT NULL DEFAULT false,
	`sort_order` tinyint unsigned,
	CONSTRAINT `ospos_stock_locations_location_id` PRIMARY KEY(`location_id`),
	CONSTRAINT `sort_order` UNIQUE(`sort_order`)
);
--> statement-breakpoint
CREATE TABLE `ospos_suppliers` (
	`person_id` int NOT NULL,
	`company_name` varchar(255) NOT NULL,
	`agency_name` varchar(255) NOT NULL,
	`account_number` varchar(255),
	`tax_id` varchar(32) NOT NULL DEFAULT '',
	`deleted` boolean NOT NULL DEFAULT false,
	`category` tinyint NOT NULL,
	CONSTRAINT `ospos_suppliers_person_id` PRIMARY KEY(`person_id`),
	CONSTRAINT `account_number` UNIQUE(`account_number`)
);
--> statement-breakpoint
CREATE TABLE `ospos_tax_categories` (
	`tax_category_id` int AUTO_INCREMENT NOT NULL,
	`tax_category` varchar(32) NOT NULL,
	`tax_group_sequence` tinyint NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_tax_categories_tax_category_id` PRIMARY KEY(`tax_category_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_tax_codes` (
	`tax_code_id` int AUTO_INCREMENT NOT NULL,
	`tax_code` varchar(32) NOT NULL,
	`tax_code_name` varchar(255) NOT NULL DEFAULT '',
	`city` varchar(255) NOT NULL DEFAULT '',
	`state` varchar(255) NOT NULL DEFAULT '',
	`deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_tax_codes_tax_code_id` PRIMARY KEY(`tax_code_id`)
);
--> statement-breakpoint
CREATE TABLE `ospos_tax_jurisdictions` (
	`jurisdiction_id` int AUTO_INCREMENT NOT NULL,
	`jurisdiction_name` varchar(255),
	`tax_group` varchar(32) NOT NULL,
	`tax_type` smallint NOT NULL,
	`reporting_authority` varchar(255),
	`tax_group_sequence` tinyint NOT NULL DEFAULT 0,
	`cascade_sequence` tinyint NOT NULL DEFAULT 0,
	`deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ospos_tax_jurisdictions_jurisdiction_id` PRIMARY KEY(`jurisdiction_id`),
	CONSTRAINT `tax_jurisdictions_uq1` UNIQUE(`tax_group`)
);
--> statement-breakpoint
CREATE TABLE `ospos_tax_rates` (
	`tax_rate_id` int AUTO_INCREMENT NOT NULL,
	`rate_tax_code_id` int NOT NULL,
	`rate_tax_category_id` int NOT NULL,
	`rate_jurisdiction_id` int NOT NULL,
	`tax_rate` decimal(15,4) NOT NULL DEFAULT '0.0000',
	`tax_rounding_code` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `ospos_tax_rates_tax_rate_id` PRIMARY KEY(`tax_rate_id`)
);
--> statement-breakpoint
ALTER TABLE `ospos_attribute_definitions` ADD CONSTRAINT `fk_ospos_attribute_definitions_ibfk_1` FOREIGN KEY (`definition_fk`) REFERENCES `ospos_attribute_definitions`(`definition_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_attribute_links` ADD CONSTRAINT `ospos_attribute_links_ibfk_1` FOREIGN KEY (`definition_id`) REFERENCES `ospos_attribute_definitions`(`definition_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_attribute_links` ADD CONSTRAINT `ospos_attribute_links_ibfk_2` FOREIGN KEY (`attribute_id`) REFERENCES `ospos_attribute_values`(`attribute_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_attribute_links` ADD CONSTRAINT `ospos_attribute_links_ibfk_3` FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_attribute_links` ADD CONSTRAINT `ospos_attribute_links_ibfk_4` FOREIGN KEY (`receiving_id`) REFERENCES `ospos_receivings`(`receiving_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_attribute_links` ADD CONSTRAINT `ospos_attribute_links_ibfk_5` FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_cash_up` ADD CONSTRAINT `ospos_cash_up_ibfk_1` FOREIGN KEY (`open_employee_id`) REFERENCES `ospos_employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_cash_up` ADD CONSTRAINT `ospos_cash_up_ibfk_2` FOREIGN KEY (`close_employee_id`) REFERENCES `ospos_employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_customers` ADD CONSTRAINT `ospos_customers_ibfk_1` FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_customers` ADD CONSTRAINT `ospos_customers_ibfk_2` FOREIGN KEY (`package_id`) REFERENCES `ospos_customers_packages`(`package_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_customers` ADD CONSTRAINT `ospos_customers_ibfk_3` FOREIGN KEY (`sales_tax_code_id`) REFERENCES `ospos_tax_codes`(`tax_code_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_customers_points` ADD CONSTRAINT `ospos_customers_points_ibfk_1` FOREIGN KEY (`person_id`) REFERENCES `ospos_customers`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_customers_points` ADD CONSTRAINT `ospos_customers_points_ibfk_2` FOREIGN KEY (`package_id`) REFERENCES `ospos_customers_packages`(`package_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_customers_points` ADD CONSTRAINT `ospos_customers_points_ibfk_3` FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_employees` ADD CONSTRAINT `ospos_employees_ibfk_1` FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_expenses` ADD CONSTRAINT `ospos_expenses_ibfk_1` FOREIGN KEY (`expense_category_id`) REFERENCES `ospos_expense_categories`(`expense_category_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_expenses` ADD CONSTRAINT `ospos_expenses_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_expenses` ADD CONSTRAINT `ospos_expenses_ibfk_3` FOREIGN KEY (`supplier_id`) REFERENCES `ospos_suppliers`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_giftcards` ADD CONSTRAINT `ospos_giftcards_ibfk_1` FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_grants` ADD CONSTRAINT `ospos_grants_ibfk_1` FOREIGN KEY (`permission_id`) REFERENCES `ospos_permissions`(`permission_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_grants` ADD CONSTRAINT `ospos_grants_ibfk_2` FOREIGN KEY (`person_id`) REFERENCES `ospos_employees`(`person_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_inventory` ADD CONSTRAINT `ospos_inventory_ibfk_1` FOREIGN KEY (`trans_items`) REFERENCES `ospos_items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_inventory` ADD CONSTRAINT `ospos_inventory_ibfk_2` FOREIGN KEY (`trans_user`) REFERENCES `ospos_employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_inventory` ADD CONSTRAINT `ospos_inventory_ibfk_3` FOREIGN KEY (`trans_location`) REFERENCES `ospos_stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_item_kit_items` ADD CONSTRAINT `ospos_item_kit_items_ibfk_1` FOREIGN KEY (`item_kit_id`) REFERENCES `ospos_item_kits`(`item_kit_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_item_kit_items` ADD CONSTRAINT `ospos_item_kit_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_item_quantities` ADD CONSTRAINT `ospos_item_quantities_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_item_quantities` ADD CONSTRAINT `ospos_item_quantities_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `ospos_stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_items` ADD CONSTRAINT `ospos_items_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `ospos_suppliers`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_items_taxes` ADD CONSTRAINT `ospos_items_taxes_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_permissions` ADD CONSTRAINT `ospos_permissions_ibfk_1` FOREIGN KEY (`module_id`) REFERENCES `ospos_modules`(`module_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_permissions` ADD CONSTRAINT `ospos_permissions_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `ospos_stock_locations`(`location_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_receivings` ADD CONSTRAINT `ospos_receivings_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_receivings` ADD CONSTRAINT `ospos_receivings_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `ospos_suppliers`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_receivings_items` ADD CONSTRAINT `ospos_receivings_items_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_receivings_items` ADD CONSTRAINT `ospos_receivings_items_ibfk_2` FOREIGN KEY (`receiving_id`) REFERENCES `ospos_receivings`(`receiving_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales` ADD CONSTRAINT `ospos_sales_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales` ADD CONSTRAINT `ospos_sales_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `ospos_customers`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales` ADD CONSTRAINT `ospos_sales_ibfk_3` FOREIGN KEY (`dinner_table_id`) REFERENCES `ospos_dinner_tables`(`dinner_table_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_items` ADD CONSTRAINT `ospos_sales_items_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_items` ADD CONSTRAINT `ospos_sales_items_ibfk_2` FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_items` ADD CONSTRAINT `ospos_sales_items_ibfk_3` FOREIGN KEY (`item_location`) REFERENCES `ospos_stock_locations`(`location_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_items_taxes` ADD CONSTRAINT `ospos_sales_items_taxes_ibfk_1` FOREIGN KEY (`sale_id`,`item_id`,`line`) REFERENCES `ospos_sales_items`(`sale_id`,`item_id`,`line`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_items_taxes` ADD CONSTRAINT `ospos_sales_items_taxes_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `ospos_items`(`item_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_payments` ADD CONSTRAINT `ospos_sales_payments_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_payments` ADD CONSTRAINT `ospos_sales_payments_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `ospos_employees`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_sales_reward_points` ADD CONSTRAINT `ospos_sales_reward_points_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `ospos_sales`(`sale_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_suppliers` ADD CONSTRAINT `ospos_suppliers_ibfk_1` FOREIGN KEY (`person_id`) REFERENCES `ospos_people`(`person_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_tax_rates` ADD CONSTRAINT `ospos_tax_rates_ibfk_1` FOREIGN KEY (`rate_tax_category_id`) REFERENCES `ospos_tax_categories`(`tax_category_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_tax_rates` ADD CONSTRAINT `ospos_tax_rates_ibfk_2` FOREIGN KEY (`rate_tax_code_id`) REFERENCES `ospos_tax_codes`(`tax_code_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ospos_tax_rates` ADD CONSTRAINT `ospos_tax_rates_ibfk_3` FOREIGN KEY (`rate_jurisdiction_id`) REFERENCES `ospos_tax_jurisdictions`(`jurisdiction_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `definition_fk` ON `ospos_attribute_definitions` (`definition_fk`);--> statement-breakpoint
CREATE INDEX `definition_name` ON `ospos_attribute_definitions` (`definition_name`);--> statement-breakpoint
CREATE INDEX `definition_type` ON `ospos_attribute_definitions` (`definition_type`);--> statement-breakpoint
CREATE INDEX `attribute_id` ON `ospos_attribute_links` (`attribute_id`);--> statement-breakpoint
CREATE INDEX `definition_id` ON `ospos_attribute_links` (`definition_id`);--> statement-breakpoint
CREATE INDEX `item_id` ON `ospos_attribute_links` (`item_id`);--> statement-breakpoint
CREATE INDEX `sale_id` ON `ospos_attribute_links` (`sale_id`);--> statement-breakpoint
CREATE INDEX `receiving_id` ON `ospos_attribute_links` (`receiving_id`);--> statement-breakpoint
CREATE INDEX `open_employee_id` ON `ospos_cash_up` (`open_employee_id`);--> statement-breakpoint
CREATE INDEX `close_employee_id` ON `ospos_cash_up` (`close_employee_id`);--> statement-breakpoint
CREATE INDEX `account_number` ON `ospos_customers` (`account_number`);--> statement-breakpoint
CREATE INDEX `sales_tax_code_id` ON `ospos_customers` (`sales_tax_code_id`);--> statement-breakpoint
CREATE INDEX `package_id` ON `ospos_customers` (`package_id`);--> statement-breakpoint
CREATE INDEX `company_name` ON `ospos_customers` (`company_name`);--> statement-breakpoint
CREATE INDEX `person_id` ON `ospos_customers_points` (`person_id`);--> statement-breakpoint
CREATE INDEX `package_id` ON `ospos_customers_points` (`package_id`);--> statement-breakpoint
CREATE INDEX `sale_id` ON `ospos_customers_points` (`sale_id`);--> statement-breakpoint
CREATE INDEX `status` ON `ospos_dinner_tables` (`status`);--> statement-breakpoint
CREATE INDEX `category_description` ON `ospos_expense_categories` (`category_description`);--> statement-breakpoint
CREATE INDEX `expense_category_id` ON `ospos_expenses` (`expense_category_id`);--> statement-breakpoint
CREATE INDEX `employee_id` ON `ospos_expenses` (`employee_id`);--> statement-breakpoint
CREATE INDEX `date` ON `ospos_expenses` (`date`);--> statement-breakpoint
CREATE INDEX `payment_type` ON `ospos_expenses` (`payment_type`);--> statement-breakpoint
CREATE INDEX `amount` ON `ospos_expenses` (`amount`);--> statement-breakpoint
CREATE INDEX `person_id` ON `ospos_giftcards` (`person_id`);--> statement-breakpoint
CREATE INDEX `trans_items` ON `ospos_inventory` (`trans_items`);--> statement-breakpoint
CREATE INDEX `trans_user` ON `ospos_inventory` (`trans_user`);--> statement-breakpoint
CREATE INDEX `trans_location` ON `ospos_inventory` (`trans_location`);--> statement-breakpoint
CREATE INDEX `trans_date` ON `ospos_inventory` (`trans_date`);--> statement-breakpoint
CREATE INDEX `trans_items_trans_date` ON `ospos_inventory` (`trans_items`,`trans_date`);--> statement-breakpoint
CREATE INDEX `item_kit_number` ON `ospos_item_kits` (`item_kit_number`);--> statement-breakpoint
CREATE INDEX `name` ON `ospos_item_kits` (`name`,`description`);--> statement-breakpoint
CREATE INDEX `item_id` ON `ospos_item_quantities` (`item_id`);--> statement-breakpoint
CREATE INDEX `location_id` ON `ospos_item_quantities` (`location_id`);--> statement-breakpoint
CREATE INDEX `item_number` ON `ospos_items` (`item_number`);--> statement-breakpoint
CREATE INDEX `supplier_id` ON `ospos_items` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `deleted` ON `ospos_items` (`deleted`,`item_type`);--> statement-breakpoint
CREATE INDEX `item_id` ON `ospos_items` (`item_id`,`deleted`);--> statement-breakpoint
CREATE INDEX `email` ON `ospos_people` (`email`);--> statement-breakpoint
CREATE INDEX `first_name` ON `ospos_people` (`first_name`(191),`last_name`(191),`email`(191),`phone_number`(191));--> statement-breakpoint
CREATE INDEX `module_id` ON `ospos_permissions` (`module_id`);--> statement-breakpoint
CREATE INDEX `supplier_id` ON `ospos_receivings` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `employee_id` ON `ospos_receivings` (`employee_id`);--> statement-breakpoint
CREATE INDEX `reference` ON `ospos_receivings` (`reference`);--> statement-breakpoint
CREATE INDEX `receiving_time` ON `ospos_receivings` (`receiving_time`);--> statement-breakpoint
CREATE INDEX `item_id` ON `ospos_receivings_items` (`item_id`);--> statement-breakpoint
CREATE INDEX `customer_id` ON `ospos_sales` (`customer_id`);--> statement-breakpoint
CREATE INDEX `employee_id` ON `ospos_sales` (`employee_id`);--> statement-breakpoint
CREATE INDEX `sale_time` ON `ospos_sales` (`sale_time`);--> statement-breakpoint
CREATE INDEX `dinner_table_id` ON `ospos_sales` (`dinner_table_id`);--> statement-breakpoint
CREATE INDEX `sale_id` ON `ospos_sales_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `item_id` ON `ospos_sales_items` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_location` ON `ospos_sales_items` (`item_location`);--> statement-breakpoint
CREATE INDEX `sale_id` ON `ospos_sales_items_taxes` (`sale_id`);--> statement-breakpoint
CREATE INDEX `item_id` ON `ospos_sales_items_taxes` (`item_id`);--> statement-breakpoint
CREATE INDEX `payment_sale` ON `ospos_sales_payments` (`sale_id`,`payment_type`);--> statement-breakpoint
CREATE INDEX `employee_id` ON `ospos_sales_payments` (`employee_id`);--> statement-breakpoint
CREATE INDEX `payment_time` ON `ospos_sales_payments` (`payment_time`);--> statement-breakpoint
CREATE INDEX `sale_id` ON `ospos_sales_reward_points` (`sale_id`);--> statement-breakpoint
CREATE INDEX `print_sequence` ON `ospos_sales_taxes` (`sale_id`,`print_sequence`,`tax_group`);--> statement-breakpoint
CREATE INDEX `ospos_sessions_timestamp` ON `ospos_sessions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `category` ON `ospos_suppliers` (`category`);--> statement-breakpoint
CREATE INDEX `company_name` ON `ospos_suppliers` (`company_name`,`deleted`);--> statement-breakpoint
CREATE INDEX `rate_tax_code_id` ON `ospos_tax_rates` (`rate_tax_code_id`);--> statement-breakpoint
CREATE INDEX `rate_tax_category_id` ON `ospos_tax_rates` (`rate_tax_category_id`);--> statement-breakpoint
CREATE INDEX `rate_jurisdiction_id` ON `ospos_tax_rates` (`rate_jurisdiction_id`);