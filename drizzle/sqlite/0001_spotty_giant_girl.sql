PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_receivings` (
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
	FOREIGN KEY (`receiving_location`) REFERENCES `stock_locations`(`location_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_receivings`("receiving_id", "receiving_time", "supplier_id", "employee_id", "comment", "payment_type", "receiving_ref", "invoice_number", "receiving_location") SELECT "receiving_id", "receiving_time", "supplier_id", "employee_id", "comment", "payment_type", "receiving_ref", "invoice_number", "receiving_location" FROM `receivings`;--> statement-breakpoint
DROP TABLE `receivings`;--> statement-breakpoint
ALTER TABLE `__new_receivings` RENAME TO `receivings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;