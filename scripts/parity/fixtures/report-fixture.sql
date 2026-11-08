-- Deterministic dataset for report differential runs. Loaded into both the
-- PHP oracle database and the target MySQL database before each comparison.

SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM ospos_sales_taxes;
DELETE FROM ospos_sales_items_taxes;
DELETE FROM ospos_sales_payments;
DELETE FROM ospos_sales_items;
DELETE FROM ospos_sales;
DELETE FROM ospos_receivings_items;
DELETE FROM ospos_receivings;
DELETE FROM ospos_expenses;
DELETE FROM ospos_expense_categories;
DELETE FROM ospos_item_quantities;
DELETE FROM ospos_items;
DELETE FROM ospos_customers;
DELETE FROM ospos_suppliers;
DELETE FROM ospos_employees WHERE person_id <> 1;
DELETE FROM ospos_people WHERE person_id <> 1;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO ospos_people (person_id, first_name, last_name, gender, phone_number, email, address_1, address_2, city, state, zip, country, comments) VALUES
  (2, 'Cara', 'Customer', 0, '', '', '', '', '', '', '', '', ''),
  (3, 'Clerk', 'Two', 0, '', '', '', '', '', '', '', '', ''),
  (4, 'Sam', 'Supplier', 0, '', '', '', '', '', '', '', '', '');

INSERT INTO ospos_employees (person_id, username, password, deleted, hash_version) VALUES
  (3, 'clerk', 'x', 0, 2);

INSERT INTO ospos_customers (person_id, company_name, account_number, taxable, tax_id, deleted, discount, discount_type, date, employee_id, consent) VALUES
  (2, 'Cara Co', NULL, 0, '', 0, 0.00, 0, '2024-01-01 00:00:00', 1, 0);

INSERT INTO ospos_suppliers (person_id, company_name, agency_name, account_number, tax_id, deleted, category) VALUES
  (4, 'Supplies Inc', '', NULL, '', 0, 0);

INSERT INTO ospos_items (item_id, name, category, supplier_id, item_number, description, cost_price, unit_price, reorder_level, receiving_quantity, allow_alt_description, is_serialized, deleted, stock_type, item_type, tax_category_id, qty_per_pack, pack_name, hsn_code, low_sell_item_id) VALUES
  (1, 'Widget', 'Tools', NULL, 'W-1', 'A widget', 4.00, 10.00, 1.000, 1.000, 0, 0, 0, 0, 0, NULL, 1.000, NULL, '', 1),
  (2, 'Gadget', 'Widgets', NULL, 'G-1', 'A gadget', 5.00, 20.00, 1.000, 1.000, 0, 0, 0, 0, 0, NULL, 1.000, NULL, '', 2);

INSERT INTO ospos_item_quantities (item_id, location_id, quantity) VALUES
  (1, 1, 100.000),
  (2, 1, 50.000);

INSERT INTO ospos_expense_categories (expense_category_id, category_name, category_description, deleted) VALUES
  (1, 'Office', 'Office expenses', 0),
  (2, 'Travel', 'Travel expenses', 0);

INSERT INTO ospos_expenses (expense_id, date, amount, payment_type, expense_category_id, description, employee_id, deleted, supplier_tax_code, tax_amount, supplier_id) VALUES
  (1, '2024-01-10 09:00:00', 100.00, 'Cash', 1, 'Paper', 1, 0, NULL, NULL, NULL),
  (2, '2024-02-15 10:00:00', 50.50, 'Credit', 1, 'Printer', 1, 0, NULL, NULL, NULL),
  (3, '2024-03-01 11:00:00', 25.00, 'Cash', 2, 'Taxi', 3, 0, NULL, NULL, NULL);

INSERT INTO ospos_sales (sale_id, sale_time, customer_id, employee_id, comment, invoice_number, quote_number, sale_status, work_order_number, sale_type, dinner_table_id) VALUES
  (1, '2024-01-15 10:00:00', 2, 1, '', 'INV-1', NULL, 0, NULL, 0, NULL),
  (2, '2024-02-10 11:30:00', NULL, 3, '', NULL, NULL, 0, NULL, 0, NULL),
  (3, '2024-03-05 09:00:00', NULL, 1, '', NULL, NULL, 0, NULL, 4, NULL),
  (4, '2024-03-20 12:00:00', 2, 1, '', NULL, 'Q-1', 1, NULL, 3, NULL),
  (5, '2024-04-01 14:00:00', NULL, 3, '', 'INV-2', NULL, 0, NULL, 1, NULL);

INSERT INTO ospos_sales_items (sale_id, item_id, description, serialnumber, line, quantity_purchased, item_cost_price, item_unit_price, discount, discount_type, item_location, print_option) VALUES
  (1, 1, 'A widget', '', 1, 2.000, 4.00, 10.00, 10.00, 0, 1, 0),
  (1, 2, 'A gadget', '', 2, 1.000, 5.00, 20.00, 0.00, 0, 1, 0),
  (2, 2, 'A gadget', '', 1, 3.000, 5.00, 20.00, 0.00, 0, 1, 0),
  (3, 1, 'A widget', '', 1, -1.000, 4.00, 10.00, 0.00, 0, 1, 0),
  (4, 1, 'A widget', '', 1, 1.000, 4.00, 10.00, 0.00, 0, 1, 0),
  (5, 2, 'A gadget', '', 1, 2.000, 5.00, 20.00, 0.00, 0, 1, 0);

INSERT INTO ospos_sales_items_taxes (sale_id, item_id, line, name, percent, tax_type, rounding_code, cascade_sequence, item_tax_amount, sales_tax_code_id, jurisdiction_id, tax_category_id) VALUES
  (1, 1, 1, 'VAT', 8.0000, 1, 1, 0, 1.44, NULL, NULL, NULL),
  (1, 2, 2, 'VAT', 8.0000, 1, 1, 0, 1.60, NULL, NULL, NULL),
  (2, 2, 1, 'VAT', 8.0000, 1, 1, 0, 4.80, NULL, NULL, NULL),
  (3, 1, 1, 'VAT', 8.0000, 1, 1, 0, -0.80, NULL, NULL, NULL),
  (5, 2, 1, 'VAT', 8.0000, 1, 1, 0, 3.20, NULL, NULL, NULL);

INSERT INTO ospos_sales_taxes (sale_id, jurisdiction_id, tax_category_id, tax_type, tax_group, sale_tax_basis, sale_tax_amount, print_sequence, name, tax_rate, sales_tax_code_id, rounding_code) VALUES
  (1, NULL, NULL, 1, 'VAT', 38.0000, 3.04, 1, 'VAT', 8.0000, NULL, 1),
  (2, NULL, NULL, 1, 'VAT', 60.0000, 4.80, 1, 'VAT', 8.0000, NULL, 1),
  (3, NULL, NULL, 1, 'VAT', -10.0000, -0.80, 1, 'VAT', 8.0000, NULL, 1),
  (5, NULL, NULL, 1, 'VAT', 40.0000, 3.20, 1, 'VAT', 8.0000, NULL, 1);

INSERT INTO ospos_sales_payments (payment_id, sale_id, payment_type, payment_amount, cash_refund, cash_adjustment, employee_id, reference_code) VALUES
  (1, 1, 'Cash', 41.04, 0.00, 0, 1, ''),
  (2, 2, 'Credit', 64.80, 0.00, 0, 3, ''),
  (3, 3, 'Cash', -10.80, 0.00, 0, 1, ''),
  (4, 5, 'Credit', 43.20, 0.00, 0, 3, '');

INSERT INTO ospos_receivings (receiving_id, receiving_time, supplier_id, employee_id, comment, payment_type, reference) VALUES
  (1, '2024-02-01 08:00:00', 4, 1, '', 'Cash', '');

INSERT INTO ospos_receivings_items (receiving_id, item_id, description, serialnumber, line, quantity_purchased, item_cost_price, item_unit_price, discount, discount_type, item_location, receiving_quantity) VALUES
  (1, 1, 'A widget', '', 1, 5.000, 4.00, 10.00, 0.00, 0, 1, 1.000),
  (1, 2, 'A gadget', '', 2, 2.000, 5.00, 20.00, 0.00, 0, 1, 1.000);
