import { APP_CONFIG_DEFAULTS } from "@/db/seed-data";

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "checkbox" | "select" | "password" | "textarea";
  options?: { value: string; label: string }[];
  encrypted?: boolean;
  placeholder?: string;
}

export interface ConfigTab {
  key: string;
  label: string;
  fields: ConfigField[];
}

const BARCODE_TYPES = [
  "C32", "C39", "C39+", "C39E", "C39E+", "C93", "S25", "S25+", "I25", "I25+",
  "C128", "C128A", "C128B", "C128C", "EAN2", "EAN5", "EAN8", "EAN13", "ITF14",
  "UPCA", "UPCE", "MSI", "MSI+", "POSTNET", "PLANET", "RMS4CC", "KIX", "IMB",
  "CODABAR", "CODE11", "PHARMA", "PHARMA2T",
];

const TAB_KEYS: Record<string, string[]> = {
  info: ["company", "address", "phone", "fax", "email", "website", "return_policy", "company_logo"],
  general: [
    "theme", "login_form", "default_sales_discount", "default_sales_discount_type",
    "default_receivings_discount", "default_receivings_discount_type",
    "default_register_mode", "lines_per_page", "category_dropdown",
    "giftcard_number", "derive_sale_quantity", "multi_pack_enabled",
    "receiving_calculate_average_price", "enforce_privacy", "include_hsn",
    "gcaptcha_enable", "gcaptcha_site_key", "gcaptcha_secret_key",
    "image_allowed_types", "image_max_width", "image_max_height", "image_max_size",
    "notify_horizontal_position", "notify_vertical_position", "statistics",
    "suggestions_first_column", "suggestions_second_column", "suggestions_third_column",
  ],
  tax: [
    "tax_included", "use_destination_based_tax", "default_tax_1_name",
    "default_tax_1_rate", "default_tax_2_name", "default_tax_2_rate",
    "default_tax_category", "default_tax_code", "default_tax_jurisdiction",
    "default_tax_rate", "tax_id",
  ],
  locale: [
    "language", "language_code", "timezone", "dateformat", "timeformat",
    "date_or_time_format", "number_locale", "thousands_separator",
    "currency_code", "currency_symbol", "currency_decimals", "tax_decimals",
    "quantity_decimals", "cash_decimals", "cash_rounding_code", "financial_year",
    "country_codes", "payment_options_order",
  ],
  barcode: [
    "barcode_content", "barcode_type", "barcode_formats", "barcode_font",
    "barcode_font_size", "barcode_height", "barcode_width", "barcode_first_row",
    "barcode_second_row", "barcode_third_row", "barcode_num_in_row",
    "barcode_page_width", "barcode_page_cellspacing", "barcode_generate_if_empty",
    "allow_duplicate_barcodes",
  ],
  stock: [],
  receipt: [
    "receipt_template", "receipt_show_taxes", "receipt_show_total_discount",
    "receipt_show_description", "receipt_show_serialnumber", "receipt_show_tax_ind",
    "receipt_show_company_name", "receipt_font_size", "print_silently",
    "print_header", "print_footer", "print_top_margin", "print_left_margin",
    "print_bottom_margin", "print_right_margin", "print_delay_autoreturn",
    "print_receipt_check_behaviour", "email_receipt_check_behaviour",
  ],
  invoice: [
    "invoice_enable", "invoice_type", "sales_invoice_format", "sales_quote_format",
    "work_order_enable", "work_order_format", "recv_invoice_format",
    "invoice_default_comments", "quote_default_comments", "invoice_email_message",
    "line_sequence", "last_used_invoice_number", "last_used_quote_number",
    "last_used_work_order_number",
  ],
  shortcuts: [
    "key_cancel", "key_items", "key_customers", "key_suspend", "key_suspended",
    "key_amount", "key_payment", "key_complete", "key_finish", "key_help",
  ],
  reward: ["customer_reward_enable"],
  table: ["dinner_table_enable"],
  system_email: [
    "protocol", "mailpath", "smtp_host", "smtp_port", "smtp_timeout",
    "smtp_crypto", "smtp_user", "smtp_pass",
  ],
  system_message: ["msg_msg", "msg_uid", "msg_src", "msg_pwd", "payment_message"],
  system_integrations: ["mailchimp_api_key", "mailchimp_list_id"],
  system_info: ["account_number"],
};

const CHECKBOX_KEYS = new Set([
  "tax_included", "use_destination_based_tax", "include_hsn", "enforce_privacy",
  "derive_sale_quantity", "multi_pack_enabled", "date_or_time_format",
  "thousands_separator", "allow_duplicate_barcodes", "barcode_generate_if_empty",
  "print_silently", "print_header", "print_footer", "print_delay_autoreturn",
  "receipt_show_taxes", "receipt_show_total_discount", "receipt_show_description",
  "receipt_show_serialnumber", "receipt_show_tax_ind", "receipt_show_company_name",
  "invoice_enable", "work_order_enable", "customer_reward_enable",
  "dinner_table_enable", "gcaptcha_enable", "statistics",
  "receiving_calculate_average_price", "show_office_group", "category_dropdown",
]);

const TEXTAREA_KEYS = new Set([
  "address", "return_policy", "invoice_default_comments", "quote_default_comments",
  "invoice_email_message", "payment_message", "msg_msg", "barcode_formats",
]);

const NUMBER_KEYS = new Set([
  "default_sales_discount", "default_receivings_discount", "lines_per_page",
  "image_max_width", "image_max_height", "image_max_size", "default_tax_1_rate",
  "default_tax_2_rate", "default_tax_rate", "tax_decimals", "currency_decimals",
  "quantity_decimals", "cash_decimals", "cash_rounding_code",
  "payment_reference_code_min", "payment_reference_code_max", "barcode_font_size",
  "barcode_height", "barcode_width", "barcode_num_in_row", "barcode_page_width",
  "barcode_page_cellspacing", "receipt_font_size", "print_top_margin",
  "print_left_margin", "print_bottom_margin", "print_right_margin",
  "smtp_port", "smtp_timeout", "financial_year", "last_used_invoice_number",
  "last_used_quote_number", "last_used_work_order_number", "line_sequence",
]);

const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  barcode_type: BARCODE_TYPES.map((value) => ({ value, label: value })),
  barcode_content: [
    { value: "id", label: "Config.barcode_content_id" },
    { value: "number", label: "Config.barcode_content_number" },
  ],
  receipt_template: [
    { value: "receipt_default", label: "Config.receipt_template_default" },
    { value: "receipt_short", label: "Config.receipt_template_short" },
  ],
  invoice_type: [
    { value: "invoice", label: "Sales.invoice_type_invoice" },
    { value: "tax_invoice", label: "Sales.invoice_type_tax_invoice" },
    { value: "custom_invoice", label: "Sales.invoice_type_custom_invoice" },
    { value: "custom_tax_invoice", label: "Sales.invoice_type_custom_tax_invoice" },
  ],
  protocol: [
    { value: "mail", label: "mail" },
    { value: "sendmail", label: "sendmail" },
    { value: "smtp", label: "smtp" },
  ],
  smtp_crypto: [
    { value: "", label: "Config.none" },
    { value: "ssl", label: "SSL" },
    { value: "tls", label: "TLS" },
  ],
  payment_options_order: [
    { value: "cashdebitcredit", label: "Cash, Debit, Credit" },
    { value: "debitcreditcash", label: "Debit, Credit, Cash" },
    { value: "debitcashcredit", label: "Debit, Cash, Credit" },
    { value: "creditdebitcash", label: "Credit, Debit, Cash" },
    { value: "creditcashdebit", label: "Credit, Cash, Debit" },
  ],
  login_form: [
    { value: "floating_labels", label: "Config.floating_labels" },
    { value: "input_groups", label: "Config.input_groups" },
  ],
  default_register_mode: [
    { value: "sale", label: "Sales.receipt" },
    { value: "sale_invoice", label: "Sales.invoice" },
    { value: "sale_quote", label: "Sales.quote" },
    { value: "sale_work_order", label: "Sales.work_order" },
    { value: "return", label: "Sales.return" },
  ],
  line_sequence: [
    { value: "0", label: "Sales.line_sequence_0" },
    { value: "1", label: "Sales.line_sequence_1" },
    { value: "2", label: "Sales.line_sequence_2" },
  ],
  cash_rounding_code: [
    { value: "0", label: "Config.rounding_none" },
    { value: "1", label: "Enum.half_up" },
    { value: "2", label: "Enum.half_down" },
    { value: "3", label: "Enum.half_even" },
    { value: "4", label: "Enum.half_odd" },
    { value: "5", label: "Enum.round_up" },
    { value: "6", label: "Enum.round_down" },
    { value: "7", label: "Enum.half_five" },
  ],
  print_receipt_check_behaviour: [
    { value: "always", label: "Config.always" },
    { value: "never", label: "Config.never" },
    { value: "last", label: "Config.last" },
  ],
  email_receipt_check_behaviour: [
    { value: "always", label: "Config.always" },
    { value: "never", label: "Config.never" },
    { value: "last", label: "Config.last" },
  ],
  barcode_first_row: [
    { value: "not_show", label: "Config.not_show" },
    { value: "name", label: "Items.name" },
    { value: "category", label: "Items.category" },
    { value: "cost_price", label: "Items.cost_price" },
    { value: "unit_price", label: "Items.unit_price" },
    { value: "company_name", label: "Config.company_name" },
  ],
  barcode_second_row: [
    { value: "not_show", label: "Config.not_show" },
    { value: "name", label: "Items.name" },
    { value: "category", label: "Items.category" },
    { value: "cost_price", label: "Items.cost_price" },
    { value: "unit_price", label: "Items.unit_price" },
    { value: "company_name", label: "Config.company_name" },
    { value: "item_code", label: "Items.item_number" },
  ],
  barcode_third_row: [
    { value: "not_show", label: "Config.not_show" },
    { value: "name", label: "Items.name" },
    { value: "category", label: "Items.category" },
    { value: "cost_price", label: "Items.cost_price" },
    { value: "unit_price", label: "Items.unit_price" },
    { value: "company_name", label: "Config.company_name" },
    { value: "item_code", label: "Items.item_number" },
  ],
  suggestions_first_column: [
    { value: "name", label: "Items.name" },
    { value: "item_number", label: "Items.item_number" },
    { value: "description", label: "Items.description" },
    { value: "cost_price", label: "Items.cost_price" },
    { value: "unit_price", label: "Items.unit_price" },
  ],
};

const ENCRYPTED_KEYS_LOCAL = new Set([
  "smtp_pass", "msg_pwd", "mailchimp_api_key", "mailchimp_list_id",
]);

function humanize(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fieldFor(key: string): ConfigField {
  const type = CHECKBOX_KEYS.has(key)
    ? "checkbox"
    : ENCRYPTED_KEYS_LOCAL.has(key)
      ? "password"
      : TEXTAREA_KEYS.has(key)
        ? "textarea"
        : SELECT_OPTIONS[key]
          ? "select"
          : NUMBER_KEYS.has(key)
            ? "number"
            : "text";
  return {
    key,
    label: `Config.${key}`,
    type,
    options: SELECT_OPTIONS[key],
    encrypted: ENCRYPTED_KEYS_LOCAL.has(key),
  };
}

const TAB_LABELS: Record<string, string> = {
  info: "Config.info",
  general: "Config.general",
  tax: "Config.tax",
  locale: "Config.locale",
  barcode: "Config.barcode",
  stock: "Config.location",
  receipt: "Config.receipt",
  invoice: "Config.invoice",
  shortcuts: "Config.shortcuts",
  reward: "Config.reward",
  table: "Config.table",
  system_email: "Config.email",
  system_message: "Config.message",
  system_integrations: "Config.integrations",
  system_info: "Config.system_info",
};

const assigned = new Set(Object.values(TAB_KEYS).flat());
const unassigned = Object.keys(APP_CONFIG_DEFAULTS).filter((key) => !assigned.has(key));
if (unassigned.length > 0) {
  TAB_KEYS.system_info = [...(TAB_KEYS.system_info ?? []), ...unassigned];
}

export const CONFIG_TABS: ConfigTab[] = Object.entries(TAB_KEYS)
  .filter(([, keys]) => keys.length > 0)
  .map(([key, keys]) => ({
    key,
    label: TAB_LABELS[key] ?? humanize(key),
    fields: keys.map(fieldFor),
  }));

export const ENCRYPTED_KEYS = new Set(
  CONFIG_TABS.flatMap((tab) => tab.fields.filter((field) => field.encrypted).map((field) => field.key)),
);

export function configKeyCount(): number {
  return CONFIG_TABS.reduce((total, tab) => total + tab.fields.length, 0);
}
