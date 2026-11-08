# Upstream file traceability matrix

Generated from `/home/yash/ospos` at commit `603b2c7c8fd5f3b2d64a3730e0f7ea38c82872ea`.
`Appendix` identifies the report that reconstructs the file. `Target`/`Status` are per-module;
see the appendix for per-method obligations. Every public method is inventoried in the appendices.

| Upstream path | Lines | Appendix |
|---|---:|---|

### Controllers

| `app/Controllers/Attributes.php` | 299 | 05 |
| `app/Controllers/BaseController.php` | 45 | 09 |
| `app/Controllers/Cashups.php` | 402 | 07 |
| `app/Controllers/Config.php` | 1219 | 09 |
| `app/Controllers/Customers.php` | 493 | 06 |
| `app/Controllers/Employees.php` | 324 | 06 |
| `app/Controllers/Expenses.php` | 215 | 07 |
| `app/Controllers/Expenses_categories.php` | 127 | 07 |
| `app/Controllers/Giftcards.php` | 188 | 07 |
| `app/Controllers/Home.php` | 137 | 06 |
| `app/Controllers/Item_kits.php` | 295 | 02 |
| `app/Controllers/Items.php` | 1563 | 02 |
| `app/Controllers/Login.php` | 159 | 06/09 |
| `app/Controllers/Messages.php` | 91 | 07 |
| `app/Controllers/No_access.php` | 53 | 06/09 |
| `app/Controllers/Office.php` | 37 | 06 |
| `app/Controllers/Persons.php` | 76 | 06 |
| `app/Controllers/Receivings.php` | 577 | 03 |
| `app/Controllers/Reports.php` | 2241 | 08 |
| `app/Controllers/Sales.php` | 1975 | 01 |
| `app/Controllers/Secure_Controller.php` | 185 | 06/09 |
| `app/Controllers/Suppliers.php` | 192 | 06 |
| `app/Controllers/Tax_categories.php` | 132 | 04 |
| `app/Controllers/Tax_codes.php` | 143 | 04 |
| `app/Controllers/Tax_jurisdictions.php` | 133 | 04 |
| `app/Controllers/Taxes.php` | 645 | 04 |

### Models

| `app/Models/Appconfig.php` | 188 | 09 |
| `app/Models/Attribute.php` | 1236 | 05 |
| `app/Models/Cashup.php` | 261 | 07 |
| `app/Models/Customer.php` | 461 | 06 |
| `app/Models/Customer_rewards.php` | 104 | 07 |
| `app/Models/Dinner_table.php` | 164 | 07 |
| `app/Models/Employee.php` | 596 | 06 |
| `app/Models/Expense.php` | 359 | 07 |
| `app/Models/Expense_category.php` | 182 | 07 |
| `app/Models/Giftcard.php` | 390 | 07 |
| `app/Models/Inventory.php` | 100 | 02 |
| `app/Models/Item.php` | 1489 | 02 |
| `app/Models/Item_kit.php` | 286 | 02 |
| `app/Models/Item_kit_items.php` | 87 | 02 |
| `app/Models/Item_quantity.php` | 127 | 02 |
| `app/Models/Item_taxes.php` | 109 | 02 |
| `app/Models/Module.php` | 161 | 06 |
| `app/Models/Person.php` | 221 | 06 |
| `app/Models/Receiving.php` | 357 | 03 |
| `app/Models/Rewards.php` | 43 | 07 |
| `app/Models/Sale.php` | 1570 | 01 |
| `app/Models/Stock_location.php` | 390 | 06 |
| `app/Models/Supplier.php` | 314 | 06 |
| `app/Models/Tax.php` | 317 | 04 |
| `app/Models/Tax_category.php` | 269 | 04 |
| `app/Models/Tax_code.php` | 312 | 04 |
| `app/Models/Tax_jurisdiction.php` | 257 | 04 |
| `app/Models/Enums/Rounding_mode.php` | 86 | 04 |
| `app/Models/Reports/Detailed_item_sales.php` | 137 | 08 |
| `app/Models/Reports/Detailed_receivings.php` | 181 | 08 |
| `app/Models/Reports/Detailed_sales.php` | 265 | 08 |
| `app/Models/Reports/Inventory_low.php` | 61 | 08 |
| `app/Models/Reports/Inventory_summary.php` | 117 | 08 |
| `app/Models/Reports/Report.php` | 35 | 08 |
| `app/Models/Reports/Specific_customer.php` | 222 | 08 |
| `app/Models/Reports/Specific_discount.php` | 203 | 08 |
| `app/Models/Reports/Specific_employee.php` | 198 | 08 |
| `app/Models/Reports/Specific_supplier.php` | 176 | 08 |
| `app/Models/Reports/Summary_categories.php` | 58 | 08 |
| `app/Models/Reports/Summary_customers.php` | 60 | 08 |
| `app/Models/Reports/Summary_discounts.php` | 49 | 08 |
| `app/Models/Reports/Summary_employees.php` | 60 | 08 |
| `app/Models/Reports/Summary_expenses_categories.php` | 70 | 08 |
| `app/Models/Reports/Summary_items.php` | 64 | 08 |
| `app/Models/Reports/Summary_payments.php` | 191 | 08 |
| `app/Models/Reports/Summary_report.php` | 235 | 08 |
| `app/Models/Reports/Summary_sales.php` | 49 | 08 |
| `app/Models/Reports/Summary_sales_taxes.php` | 75 | 08 |
| `app/Models/Reports/Summary_suppliers.php` | 60 | 08 |
| `app/Models/Reports/Summary_taxes.php` | 126 | 08 |
| `app/Models/Tokens/Token.php` | 85 | 10 |
| `app/Models/Tokens/Token_barcode_ean.php` | 25 | 10 |
| `app/Models/Tokens/Token_barcode_price.php` | 25 | 10 |
| `app/Models/Tokens/Token_barcode_weight.php` | 25 | 10 |
| `app/Models/Tokens/Token_customer.php` | 53 | 10 |
| `app/Models/Tokens/Token_invoice_count.php` | 39 | 10 |
| `app/Models/Tokens/Token_invoice_sequence.php` | 43 | 10 |
| `app/Models/Tokens/Token_quote_sequence.php` | 36 | 10 |
| `app/Models/Tokens/Token_suspended_invoice_count.php` | 36 | 10 |
| `app/Models/Tokens/Token_work_order_sequence.php` | 42 | 10 |
| `app/Models/Tokens/Token_year_invoice_count.php` | 31 | 10 |
| `app/Models/Tokens/Token_year_quote_count.php` | 31 | 10 |

### Libraries

| `app/Libraries/Barcode_lib.php` | 226 | 10 |
| `app/Libraries/CI3SecretConverter.php` | 173 | 09 |
| `app/Libraries/Email_lib.php` | 121 | 10 |
| `app/Libraries/Item_lib.php` | 57 | 02 |
| `app/Libraries/MY_Email.php` | 49 | 10 |
| `app/Libraries/MY_Language.php` | 41 | 09 |
| `app/Libraries/MY_Migration.php` | 191 | 09 |
| `app/Libraries/Mailchimp_lib.php` | 337 | 10 |
| `app/Libraries/Receiving_lib.php` | 517 | 03 |
| `app/Libraries/Sale_lib.php` | 1735 | 01 |
| `app/Libraries/Sms_lib.php` | 77 | 10 |
| `app/Libraries/Tax_lib.php` | 476 | 04 |
| `app/Libraries/Token_lib.php` | 243 | 10 |

### Helpers

| `app/Helpers/attribute_helper.php` | 35 | 05 |
| `app/Helpers/dompdf_helper.php` | 25 | 10 |
| `app/Helpers/importfile_helper.php` | 129 | 02/06 |
| `app/Helpers/locale_helper.php` | 698 | 10 |
| `app/Helpers/migration_helper.php` | 413 | 09 |
| `app/Helpers/report_helper.php` | 51 | 08 |
| `app/Helpers/sale_helper.php` | 0 | 01 |
| `app/Helpers/security_helper.php` | 635 | 09 |
| `app/Helpers/tabular_helper.php` | 959 | 12 |
| `app/Helpers/tax_helper.php` | 167 | 04 |
| `app/Helpers/url_helper.php` | 31 | 10 |

### Config

| `app/Config/App.php` | 377 | 09/11 |
| `app/Config/Autoload.php` | 207 | 09/11 |
| `app/Config/CURLRequest.php` | 36 | 09/11 |
| `app/Config/Cache.php` | 198 | 09/11 |
| `app/Config/Constants.php` | 179 | 09/11 |
| `app/Config/ContentSecurityPolicy.php` | 240 | 09/11 |
| `app/Config/Cookie.php` | 107 | 09/11 |
| `app/Config/Cors.php` | 105 | 09/11 |
| `app/Config/Database.php` | 142 | 09/11 |
| `app/Config/DocTypes.php` | 43 | 09/11 |
| `app/Config/Email.php` | 126 | 09/11 |
| `app/Config/Encryption.php` | 158 | 09/11 |
| `app/Config/Events.php` | 68 | 09/11 |
| `app/Config/Exceptions.php` | 106 | 09/11 |
| `app/Config/Feature.php` | 37 | 09/11 |
| `app/Config/Filters.php` | 134 | 09/11 |
| `app/Config/ForeignCharacters.php` | 12 | 09/11 |
| `app/Config/Format.php` | 73 | 09/11 |
| `app/Config/Generators.php` | 44 | 09/11 |
| `app/Config/Honeypot.php` | 42 | 09/11 |
| `app/Config/Hostnames.php` | 40 | 09/11 |
| `app/Config/Images.php` | 33 | 09/11 |
| `app/Config/Kint.php` | 63 | 09/11 |
| `app/Config/Logger.php` | 151 | 09/11 |
| `app/Config/Migrations.php` | 65 | 09/11 |
| `app/Config/Mimes.php` | 534 | 09/11 |
| `app/Config/Modules.php` | 82 | 09/11 |
| `app/Config/OSPOS.php` | 79 | 09/11 |
| `app/Config/Optimize.php` | 32 | 09/11 |
| `app/Config/Pager.php` | 61 | 09/11 |
| `app/Config/Paths.php` | 90 | 09/11 |
| `app/Config/Publisher.php` | 28 | 09/11 |
| `app/Config/Routes.php` | 42 | 09/11 |
| `app/Config/Routing.php` | 149 | 09/11 |
| `app/Config/Security.php` | 86 | 09/11 |
| `app/Config/SecurityEnv.php` | 37 | 09/11 |
| `app/Config/Services.php` | 79 | 09/11 |
| `app/Config/Session.php` | 152 | 09/11 |
| `app/Config/Toolbar.php` | 147 | 09/11 |
| `app/Config/UserAgents.php` | 262 | 09/11 |
| `app/Config/Validation.php` | 46 | 09/11 |
| `app/Config/View.php` | 73 | 09/11 |
| `app/Config/WorkerMode.php` | 62 | 09/11 |
| `app/Config/Boot/development.php` | 34 | 09/11 |
| `app/Config/Boot/production.php` | 25 | 09/11 |
| `app/Config/Boot/testing.php` | 38 | 09/11 |
| `app/Config/Validation/OSPOSRules.php` | 277 | 09/11 |

### Filters/Commands/Events

| `app/Filters/IsLoggedIn.php` | 36 | 09 |
| `app/Filters/Throttle.php` | 76 | 09 |
| `app/Commands/EnvProvision.php` | 126 | 09 |
| `app/Events/Db_log.php` | 79 | 09 |
| `app/Events/Load_config.php` | 71 | 09 |
| `app/Events/Method.php` | 21 | 09 |

### Views

| `app/Views/login.php` | 327 | 06 |
| `app/Views/no_access.php` | 8 | 06 |
| `app/Views/viewData.php` | 1 | 12 |
| `app/Views/attributes/form.php` | 251 | 05 |
| `app/Views/attributes/item.php` | 167 | 05 |
| `app/Views/attributes/manage.php` | 42 | 05 |
| `app/Views/barcodes/barcode_sheet.php` | 44 | 10 |
| `app/Views/cashups/form.php` | 344 | 07 |
| `app/Views/cashups/manage.php` | 87 | 07 |
| `app/Views/configs/barcode_config.php` | 325 | 09 |
| `app/Views/configs/email_config.php` | 183 | 09 |
| `app/Views/configs/general_config.php` | 530 | 09 |
| `app/Views/configs/info_config.php` | 193 | 09 |
| `app/Views/configs/integrations_config.php` | 109 | 09 |
| `app/Views/configs/invoice_config.php` | 254 | 09 |
| `app/Views/configs/license_config.php` | 33 | 09 |
| `app/Views/configs/locale_config.php` | 402 | 09 |
| `app/Views/configs/manage.php` | 93 | 09 |
| `app/Views/configs/message_config.php` | 109 | 09 |
| `app/Views/configs/receipt_config.php` | 439 | 09 |
| `app/Views/configs/reward_config.php` | 159 | 09 |
| `app/Views/configs/shortcuts_config.php` | 83 | 09 |
| `app/Views/configs/stock_config.php` | 159 | 09 |
| `app/Views/configs/system_config.php` | 16 | 09 |
| `app/Views/configs/system_info.php` | 224 | 09 |
| `app/Views/configs/table_config.php` | 154 | 09 |
| `app/Views/configs/tax_config.php` | 200 | 09 |
| `app/Views/customers/form.php` | 520 | 06 |
| `app/Views/customers/form_csv_import.php` | 52 | 06 |
| `app/Views/employees/form.php` | 251 | 06 |
| `app/Views/errors/error.php` | 7 | 12 |
| `app/Views/errors/cli/error_404.php` | 11 | 12 |
| `app/Views/errors/cli/error_db.php` | 11 | 12 |
| `app/Views/errors/cli/error_exception.php` | 69 | 12 |
| `app/Views/errors/cli/error_general.php` | 11 | 12 |
| `app/Views/errors/cli/error_php.php` | 26 | 12 |
| `app/Views/errors/cli/production.php` | 5 | 12 |
| `app/Views/errors/html/error_400.php` | 84 | 12 |
| `app/Views/errors/html/error_404.php` | 84 | 12 |
| `app/Views/errors/html/error_db.php` | 78 | 12 |
| `app/Views/errors/html/error_exception.php` | 437 | 12 |
| `app/Views/errors/html/error_general.php` | 78 | 12 |
| `app/Views/errors/html/error_php.php` | 38 | 12 |
| `app/Views/errors/html/production.php` | 25 | 12 |
| `app/Views/expenses/form.php` | 256 | 07 |
| `app/Views/expenses/manage.php` | 95 | 07 |
| `app/Views/expenses_categories/form.php` | 66 | 07 |
| `app/Views/expenses_categories/manage.php` | 48 | 07 |
| `app/Views/giftcards/form.php` | 153 | 07 |
| `app/Views/giftcards/manage.php` | 41 | 07 |
| `app/Views/home/form_change_password.php` | 130 | 06 |
| `app/Views/home/home.php` | 24 | 06 |
| `app/Views/home/office.php` | 24 | 06 |
| `app/Views/item_kits/form.php` | 298 | 02 |
| `app/Views/item_kits/manage.php` | 53 | 02 |
| `app/Views/items/form.php` | 623 | 02 |
| `app/Views/items/form_bulk.php` | 241 | 02 |
| `app/Views/items/form_count_details.php` | 160 | 02 |
| `app/Views/items/form_csv_import.php` | 52 | 02 |
| `app/Views/items/form_inventory.php` | 143 | 02 |
| `app/Views/items/manage.php` | 146 | 02 |
| `app/Views/messages/form_sms.php` | 87 | 07 |
| `app/Views/messages/sms.php` | 58 | 07 |
| `app/Views/partial/bootstrap_tables_locale.php` | 54 | 12 |
| `app/Views/partial/customer_rewards.php` | 46 | 12 |
| `app/Views/partial/datepicker_locale.php` | 95 | 12 |
| `app/Views/partial/daterangepicker.php` | 228 | 12 |
| `app/Views/partial/dinner_tables.php` | 34 | 12 |
| `app/Views/partial/footer.php` | 23 | 12 |
| `app/Views/partial/header.php` | 102 | 12 |
| `app/Views/partial/header_js.php` | 94 | 12 |
| `app/Views/partial/lang_lines.php` | 16 | 12 |
| `app/Views/partial/print_receipt.php` | 70 | 12 |
| `app/Views/partial/stock_locations.php` | 45 | 12 |
| `app/Views/partial/table_filter_persistence.php` | 84 | 12 |
| `app/Views/partial/tax_categories.php` | 46 | 12 |
| `app/Views/partial/tax_codes.php` | 69 | 12 |
| `app/Views/partial/tax_jurisdictions.php` | 89 | 12 |
| `app/Views/partial/visibility_js.php` | 98 | 12 |
| `app/Views/people/form_basic_info.php` | 203 | 06 |
| `app/Views/people/manage.php` | 61 | 06 |
| `app/Views/receivings/form.php` | 112 | 03/10 |
| `app/Views/receivings/receipt.php` | 135 | 03/10 |
| `app/Views/receivings/receiving.php` | 544 | 03/10 |
| `app/Views/reports/date_input.php` | 99 | 08 |
| `app/Views/reports/graphical.php` | 41 | 08 |
| `app/Views/reports/inventory_summary_input.php` | 56 | 08 |
| `app/Views/reports/listing.php` | 110 | 08 |
| `app/Views/reports/specific_customer_input.php` | 75 | 08 |
| `app/Views/reports/specific_input.php` | 110 | 08 |
| `app/Views/reports/tabular.php` | 81 | 08 |
| `app/Views/reports/tabular_details.php` | 99 | 08 |
| `app/Views/reports/graphs/bar.php` | 118 | 08 |
| `app/Views/reports/graphs/hbar.php` | 121 | 08 |
| `app/Views/reports/graphs/line.php` | 188 | 08 |
| `app/Views/reports/graphs/pie.php` | 84 | 08 |
| `app/Views/sales/form.php` | 276 | 01/10 |
| `app/Views/sales/help.php` | 88 | 01/10 |
| `app/Views/sales/invoice.php` | 259 | 01/10 |
| `app/Views/sales/invoice_email.php` | 186 | 01/10 |
| `app/Views/sales/manage.php` | 107 | 01/10 |
| `app/Views/sales/quote.php` | 225 | 01/10 |
| `app/Views/sales/quote_email.php` | 158 | 01/10 |
| `app/Views/sales/receipt.php` | 69 | 01/10 |
| `app/Views/sales/receipt_default.php` | 175 | 01/10 |
| `app/Views/sales/receipt_email.php` | 165 | 01/10 |
| `app/Views/sales/receipt_short.php` | 154 | 01/10 |
| `app/Views/sales/register.php` | 969 | 01/10 |
| `app/Views/sales/suspended.php` | 74 | 01/10 |
| `app/Views/sales/tax_invoice.php` | 262 | 01/10 |
| `app/Views/sales/work_order.php` | 214 | 01/10 |
| `app/Views/sales/work_order_email.php` | 140 | 01/10 |
| `app/Views/suppliers/form.php` | 106 | 06 |
| `app/Views/taxes/manage.php` | 51 | 04 |
| `app/Views/taxes/tax_categories.php` | 128 | 04 |
| `app/Views/taxes/tax_codes.php` | 128 | 04 |
| `app/Views/taxes/tax_jurisdictions.php` | 131 | 04 |
| `app/Views/taxes/tax_rates.php` | 37 | 04 |
| `app/Views/taxes/tax_rates_form.php` | 91 | 04 |

### Database

| `app/Database/Migrations/20170501000000_initial_schema.php` | 68 | 11 |
| `app/Database/Migrations/20170501150000_upgrade_to_3_1_1.php` | 58 | 11 |
| `app/Database/Migrations/20170502221506_sales_tax_data.php` | 405 | 11 |
| `app/Database/Migrations/20180225100000_upgrade_to_3_2_0.php` | 22 | 11 |
| `app/Database/Migrations/20180501100000_upgrade_to_3_2_1.php` | 22 | 11 |
| `app/Database/Migrations/20181015100000_attributes.php` | 22 | 11 |
| `app/Database/Migrations/20190111270000_upgrade_to_3_3_0.php` | 22 | 11 |
| `app/Database/Migrations/20190129212600_indiagst.php` | 164 | 11 |
| `app/Database/Migrations/20190213210000_indiagst1.php` | 22 | 11 |
| `app/Database/Migrations/20190220210000_indiagst2.php` | 22 | 11 |
| `app/Database/Migrations/20190301124900_decimal_attribute_type.php` | 22 | 11 |
| `app/Database/Migrations/20190317102600_add_iso_4217.php` | 22 | 11 |
| `app/Database/Migrations/20190427100000_paymenttracking.php` | 22 | 11 |
| `app/Database/Migrations/20190502100000_refundtracking.php` | 116 | 11 |
| `app/Database/Migrations/20190612100000_dbfix.php` | 22 | 11 |
| `app/Database/Migrations/20190615100000_fix_attribute_datetime.php` | 22 | 11 |
| `app/Database/Migrations/20190712150200_fix_empty_reports.php` | 36 | 11 |
| `app/Database/Migrations/20191008100000_receipttaxindicator.php` | 26 | 11 |
| `app/Database/Migrations/20191231100000_paymentdatefix.php` | 22 | 11 |
| `app/Database/Migrations/20200125100000_saleschangeprice.php` | 22 | 11 |
| `app/Database/Migrations/20200202000000_taxamount.php` | 383 | 11 |
| `app/Database/Migrations/20200215100000_taxgroupconstraint.php` | 25 | 11 |
| `app/Database/Migrations/20200508000000_image_upload_defaults.php` | 35 | 11 |
| `app/Database/Migrations/20200819000000_modify_attr_links_constraint.php` | 22 | 11 |
| `app/Database/Migrations/20201108100000_cashrounding.php` | 25 | 11 |
| `app/Database/Migrations/20201110000000_add_item_kit_number.php` | 22 | 11 |
| `app/Database/Migrations/20210103000000_modify_session_datatype.php` | 22 | 11 |
| `app/Database/Migrations/20210422000000_database_optimizations.php` | 182 | 11 |
| `app/Database/Migrations/20210422000001_remove_duplicate_links.php` | 64 | 11 |
| `app/Database/Migrations/20210714140000_move_expenses_categories.php` | 25 | 11 |
| `app/Database/Migrations/20220127000000_convertToCI4.php` | 101 | 11 |
| `app/Database/Migrations/20230307000000_int_to_tinyint.php` | 28 | 11 |
| `app/Database/Migrations/20230412000000_add_missing_config.php` | 36 | 11 |
| `app/Database/Migrations/20230412000001_drop_account_number_index.php` | 27 | 11 |
| `app/Database/Migrations/20240319000000_Migration_Convert_Barcode_Types.php` | 76 | 11 |
| `app/Database/Migrations/20240630000001_fix_keys_for_db_upgrade.php` | 63 | 11 |
| `app/Database/Migrations/20240826000000_fix_duplicate_attributes.php` | 72 | 11 |
| `app/Database/Migrations/20250213000000_fix_attributes_cascading_delete.php` | 32 | 11 |
| `app/Database/Migrations/20250425000000_sessions_migration.php` | 24 | 11 |
| `app/Database/Migrations/20250519000000_MigrationOptimizationIndices.php` | 44 | 11 |
| `app/Database/Migrations/20250521000000_FixImageFilenameSpaces.php` | 65 | 11 |
| `app/Database/Migrations/20250522000000_AttributeLinksUniqueConstraint.php` | 33 | 11 |
| `app/Database/Migrations/20250716170000_MissingConfigKeys.php` | 24 | 11 |
| `app/Database/Migrations/20250729170000_NullableTaxCategoryId.php` | 24 | 11 |
| `app/Database/Migrations/20260405000000_Mysql84Utf8mb4Conversion.php` | 109 | 11 |
| `app/Database/Migrations/20260506000000_AddShortcutKeys.php` | 46 | 11 |
| `app/Database/Migrations/20261023000000_AddStockLocationDefaultAndSortOrder.php` | 68 | 11 |
| `app/Database/Seeds/TestDatabaseBootstrapSeeder.php` | 54 | 11 |

### Language

| `app/Language/ar-EG/` | 1676 | 09/11/P11 |
| `app/Language/ar-LB/` | 1676 | 09/11/P11 |
| `app/Language/az/` | 1676 | 09/11/P11 |
| `app/Language/bg/` | 1676 | 09/11/P11 |
| `app/Language/bs/` | 1676 | 09/11/P11 |
| `app/Language/ckb/` | 1676 | 09/11/P11 |
| `app/Language/cs/` | 1676 | 09/11/P11 |
| `app/Language/da/` | 1676 | 09/11/P11 |
| `app/Language/de-CH/` | 1676 | 09/11/P11 |
| `app/Language/de-DE/` | 1676 | 09/11/P11 |
| `app/Language/el/` | 1676 | 09/11/P11 |
| `app/Language/en/` | 1676 | 09/11/P11 |
| `app/Language/en-GB/` | 1676 | 09/11/P11 |
| `app/Language/es-ES/` | 1676 | 09/11/P11 |
| `app/Language/es-MX/` | 1676 | 09/11/P11 |
| `app/Language/fa/` | 1676 | 09/11/P11 |
| `app/Language/fr/` | 1676 | 09/11/P11 |
| `app/Language/he/` | 1676 | 09/11/P11 |
| `app/Language/hr/` | 1676 | 09/11/P11 |
| `app/Language/hu/` | 1676 | 09/11/P11 |
| `app/Language/hy/` | 1676 | 09/11/P11 |
| `app/Language/id/` | 1676 | 09/11/P11 |
| `app/Language/it/` | 1676 | 09/11/P11 |
| `app/Language/ka/` | 1676 | 09/11/P11 |
| `app/Language/km/` | 1676 | 09/11/P11 |
| `app/Language/lo/` | 1676 | 09/11/P11 |
| `app/Language/ml/` | 1676 | 09/11/P11 |
| `app/Language/nb/` | 1676 | 09/11/P11 |
| `app/Language/nl-BE/` | 1676 | 09/11/P11 |
| `app/Language/nl-NL/` | 1676 | 09/11/P11 |
| `app/Language/pl/` | 1676 | 09/11/P11 |
| `app/Language/pt-BR/` | 1676 | 09/11/P11 |
| `app/Language/ro/` | 1676 | 09/11/P11 |
| `app/Language/ru/` | 1676 | 09/11/P11 |
| `app/Language/sv/` | 1676 | 09/11/P11 |
| `app/Language/sw-KE/` | 1676 | 09/11/P11 |
| `app/Language/sw-TZ/` | 1676 | 09/11/P11 |
| `app/Language/ta/` | 1676 | 09/11/P11 |
| `app/Language/th/` | 1676 | 09/11/P11 |
| `app/Language/tl/` | 1676 | 09/11/P11 |
| `app/Language/tr/` | 1676 | 09/11/P11 |
| `app/Language/uk/` | 1676 | 09/11/P11 |
| `app/Language/ur/` | 1676 | 09/11/P11 |
| `app/Language/vi/` | 1676 | 09/11/P11 |
| `app/Language/zh-Hans/` | 1676 | 09/11/P11 |
| `app/Language/zh-Hant/` | 1676 | 09/11/P11 |

### Tests

| `tests/LanguageFilesTest.php` | 129 | Varies by module |
| `tests/Config/AppTest.php` | 442 | Varies by module |
| `tests/Config/EncryptionTest.php` | 54 | Varies by module |
| `tests/Config/OSPOSTest.php` | 24 | Varies by module |
| `tests/Config/Validation/OSPOSRulesTest.php` | 189 | Varies by module |
| `tests/Controllers/CashupControllerTest.php` | 209 | Varies by module |
| `tests/Controllers/ConfigControllerTest.php` | 671 | Varies by module |
| `tests/Controllers/CustomersCsvImportTest.php` | 292 | Varies by module |
| `tests/Controllers/EmployeesControllerTest.php` | 368 | Varies by module |
| `tests/Controllers/HomeTest.php` | 544 | Varies by module |
| `tests/Controllers/ItemKitsControllerTest.php` | 130 | Varies by module |
| `tests/Controllers/ItemsControllerTest.php` | 1419 | Varies by module |
| `tests/Controllers/LoginTest.php` | 158 | Varies by module |
| `tests/Controllers/ReportsControllerTest.php` | 208 | Varies by module |
| `tests/Controllers/SalesControllerTest.php` | 725 | Varies by module |
| `tests/Controllers/TaxesControllerTest.php` | 287 | Varies by module |
| `tests/Events/Load_configTest.php` | 49 | Varies by module |
| `tests/Filters/ThrottleTest.php` | 262 | Varies by module |
| `tests/Helpers/GetItemDataRowTest.php` | 105 | Varies by module |
| `tests/Helpers/LocaleHelperTest.php` | 60 | Varies by module |
| `tests/Helpers/UrlHelperTest.php` | 27 | Varies by module |
| `tests/Helpers/migration_helperTest.php` | 53 | Varies by module |
| `tests/Helpers/security_helperTest.php` | 700 | Varies by module |
| `tests/Libraries/Barcode_libTest.php` | 127 | Varies by module |
| `tests/Libraries/CI3SecretConverterTest.php` | 203 | Varies by module |
| `tests/Libraries/Sale_libPaymentTest.php` | 200 | Varies by module |
| `tests/Libraries/Token_libTest.php` | 314 | Varies by module |
| `tests/Models/AppconfigTest.php` | 75 | Varies by module |
| `tests/Models/CustomerRewardPointsTest.php` | 130 | Varies by module |
| `tests/Models/EmployeeTest.php` | 263 | Varies by module |
| `tests/Models/GiftcardTest.php` | 192 | Varies by module |
| `tests/Models/ItemBulkUpdateTest.php` | 354 | Varies by module |
| `tests/Models/ItemQuantityTest.php` | 89 | Varies by module |
| `tests/Models/ItemSearchTest.php` | 465 | Varies by module |
| `tests/Models/ItemTaxesMultipleTest.php` | 76 | Varies by module |
| `tests/Models/ItemTest.php` | 103 | Varies by module |
| `tests/Models/ReceivingTest.php` | 108 | Varies by module |
| `tests/Models/SaleTest.php` | 564 | Varies by module |
| `tests/Models/Stock_locationTest.php` | 300 | Varies by module |
| `tests/Models/TaxTest.php` | 27 | Varies by module |
| `tests/Models/Reports/Inventory_lowTest.php` | 34 | Varies by module |
| `tests/Models/Reports/Summary_discounts_test.php` | 51 | Varies by module |
| `tests/Models/Reports/Summary_taxes_test.php` | 287 | Varies by module |
| `tests/Support/AdminAuthTrait.php` | 46 | Varies by module |
| `tests/Support/CashupFixtureTrait.php` | 32 | Varies by module |
| `tests/Support/ConcurrentDbRaceTrait.php` | 236 | Varies by module |
| `tests/Support/DatabaseBootstrapTrait.php` | 50 | Varies by module |
| `tests/Support/EmployeeFixtureTrait.php` | 141 | Varies by module |
| `tests/Support/ExpenseFixtureTrait.php` | 39 | Varies by module |
| `tests/Support/FailedQueryConnectionTrait.php` | 44 | Varies by module |
| `tests/Support/ItemFixtureTrait.php` | 43 | Varies by module |
| `tests/Support/ItemSearchFixtureTrait.php` | 133 | Varies by module |
| `tests/Support/OsposConfigFixtureTrait.php` | 50 | Varies by module |
| `tests/Support/RaceWorker.php` | 38 | Varies by module |
| `tests/Support/SaleFixtureTrait.php` | 83 | Varies by module |
| `tests/Support/TaxFixtureTrait.php` | 22 | Varies by module |
