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

export const CONFIG_TABS: ConfigTab[] = [
  {
    key: "general",
    label: "General",
    fields: [
      { key: "company", label: "Company Name", type: "text" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "fax", label: "Fax", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "website", label: "Website", type: "text" },
      { key: "company_logo", label: "Logo filename", type: "text" },
      { key: "return_policy", label: "Return Policy", type: "textarea" },
    ],
  },
  {
    key: "locale",
    label: "Locale",
    fields: [
      { key: "currency_symbol", label: "Currency Symbol", type: "text" },
      { key: "number_locale", label: "Number Locale", type: "text" },
      { key: "thousands_separator", label: "Thousands Separator", type: "text" },
      { key: "currency_decimals", label: "Currency Decimals", type: "number" },
      { key: "tax_decimals", label: "Tax Decimals", type: "number" },
      { key: "quantity_decimals", label: "Quantity Decimals", type: "number" },
      { key: "cash_decimals", label: "Cash Decimals", type: "number" },
      { key: "dateformat", label: "Date Format", type: "text" },
      { key: "timeformat", label: "Time Format", type: "text" },
      { key: "language", label: "Language", type: "text" },
      { key: "language_code", label: "Language Code", type: "text" },
      { key: "timezone", label: "Timezone", type: "text" },
      { key: "country_codes", label: "Country Codes", type: "text" },
    ],
  },
  {
    key: "tax",
    label: "Tax",
    fields: [
      { key: "default_tax_rate", label: "Default Tax Rate", type: "number" },
      { key: "default_tax_1_name", label: "Default Tax 1 Name", type: "text" },
      { key: "default_tax_1_rate", label: "Default Tax 1 Rate", type: "number" },
      { key: "default_tax_1_cumulative", label: "Tax 1 Cumulative", type: "checkbox" },
      { key: "default_tax_2_name", label: "Default Tax 2 Name", type: "text" },
      { key: "default_tax_2_rate", label: "Default Tax 2 Rate", type: "number" },
      { key: "tax_included", label: "Tax Included", type: "checkbox" },
      { key: "use_destination_based_tax", label: "Use Destination-Based Tax", type: "checkbox" },
      { key: "default_tax_code", label: "Default Tax Code", type: "text" },
      { key: "default_tax_category", label: "Default Tax Category", type: "text" },
      { key: "include_hsn", label: "Include HSN", type: "checkbox" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    fields: [
      { key: "default_sales_discount", label: "Default Sales Discount", type: "number" },
      { key: "lines_per_page", label: "Lines Per Page", type: "number" },
      { key: "payment_options_order", label: "Payment Options Order", type: "text" },
      { key: "dinner_table_enable", label: "Enable Dinner Tables", type: "checkbox" },
      { key: "multi_pack_enabled", label: "Multi-pack Enabled", type: "checkbox" },
      { key: "cash_rounding_code", label: "Cash Rounding Code", type: "number" },
    ],
  },
  {
    key: "invoice",
    label: "Invoice",
    fields: [
      { key: "invoice_enable", label: "Enable Invoicing", type: "checkbox" },
      { key: "sales_invoice_format", label: "Sales Invoice Format", type: "text" },
      { key: "recv_invoice_format", label: "Receiving Invoice Format", type: "text" },
      { key: "invoice_email_message", label: "Invoice Email Message", type: "textarea" },
      { key: "invoice_default_comments", label: "Default Invoice Comments", type: "textarea" },
      {
        key: "invoice_type", label: "Invoice Type", type: "select",
        options: [
          { value: "invoice", label: "Invoice" },
          { value: "tax_invoice", label: "Tax Invoice" },
          { value: "custom_invoice", label: "Custom Invoice" },
          { value: "custom_tax_invoice", label: "Custom Tax Invoice" },
        ],
      },
    ],
  },
  {
    key: "receipt",
    label: "Receipt",
    fields: [
      {
        key: "receipt_template", label: "Receipt Template", type: "select",
        options: [
          { value: "receipt_default", label: "Default" },
          { value: "receipt_short", label: "Short" },
        ],
      },
      { key: "receipt_show_taxes", label: "Show Taxes", type: "checkbox" },
      { key: "receipt_show_total_discount", label: "Show Total Discount", type: "checkbox" },
      { key: "receipt_show_description", label: "Show Description", type: "checkbox" },
      { key: "receipt_show_serialnumber", label: "Show Serial Number", type: "checkbox" },
      { key: "print_silently", label: "Print Silently", type: "checkbox" },
      { key: "print_header", label: "Print Header", type: "checkbox" },
      { key: "print_footer", label: "Print Footer", type: "checkbox" },
      { key: "print_top_margin", label: "Top Margin", type: "number" },
      { key: "print_left_margin", label: "Left Margin", type: "number" },
      { key: "print_bottom_margin", label: "Bottom Margin", type: "number" },
      { key: "print_right_margin", label: "Right Margin", type: "number" },
    ],
  },
  {
    key: "email",
    label: "Email",
    fields: [
      {
        key: "protocol", label: "Protocol", type: "select",
        options: [
          { value: "mail", label: "PHP mail()" },
          { value: "smtp", label: "SMTP" },
        ],
      },
      { key: "mailpath", label: "Mail Path", type: "text" },
      { key: "smtp_host", label: "SMTP Host", type: "text" },
      { key: "smtp_port", label: "SMTP Port", type: "number" },
      { key: "smtp_timeout", label: "SMTP Timeout", type: "number" },
      {
        key: "smtp_crypto", label: "SMTP Crypto", type: "select",
        options: [
          { value: "", label: "None" },
          { value: "ssl", label: "SSL" },
          { value: "tls", label: "TLS" },
        ],
      },
      { key: "smtp_user", label: "SMTP User", type: "text" },
      { key: "smtp_pass", label: "SMTP Password", type: "password", encrypted: true },
    ],
  },
  {
    key: "message",
    label: "SMS",
    fields: [
      { key: "msg_msg", label: "Message", type: "text" },
      { key: "msg_uid", label: "User ID", type: "text" },
      { key: "msg_pwd", label: "Password", type: "password", encrypted: true },
      { key: "msg_src", label: "Source Number", type: "text" },
    ],
  },
  {
    key: "barcode",
    label: "Barcode",
    fields: [
      {
        key: "barcode_content", label: "Content", type: "select",
        options: [
          { value: "id", label: "Item ID" },
          { value: "number", label: "Item Number" },
          { value: "name", label: "Item Name" },
        ],
      },
      {
        key: "barcode_type", label: "Barcode Type", type: "select",
        options: [
          { value: "code39", label: "Code 39" },
          { value: "code128", label: "Code 128" },
          { value: "ean13", label: "EAN-13" },
          { value: "upca", label: "UPC-A" },
        ],
      },
      { key: "barcode_font", label: "Font", type: "text" },
      { key: "barcode_font_size", label: "Font Size", type: "number" },
      { key: "barcode_height", label: "Height", type: "number" },
      { key: "barcode_width", label: "Width", type: "number" },
      { key: "barcode_first_row", label: "First Row", type: "text" },
      { key: "barcode_second_row", label: "Second Row", type: "text" },
      { key: "barcode_third_row", label: "Third Row", type: "text" },
      { key: "barcode_num_in_row", label: "Num Per Row", type: "number" },
      { key: "barcode_page_width", label: "Page Width", type: "number" },
      { key: "barcode_page_cellspacing", label: "Page Cellspacing", type: "number" },
      { key: "barcode_generate_if_empty", label: "Generate if Empty", type: "checkbox" },
    ],
  },
  {
    key: "stock",
    label: "Stock",
    fields: [
      { key: "receiving_calculate_average_price", label: "Calculate Average Price", type: "checkbox" },
    ],
  },
  {
    key: "reward",
    label: "Rewards",
    fields: [
      { key: "customer_reward_enable", label: "Enable Customer Rewards", type: "checkbox" },
    ],
  },
  {
    key: "mailchimp",
    label: "Mailchimp",
    fields: [
      { key: "mailchimp_api_key", label: "API Key", type: "password", encrypted: true },
      { key: "mailchimp_list_id", label: "List ID", type: "text" },
    ],
  },
];

export const ENCRYPTED_KEYS = new Set(
  CONFIG_TABS.flatMap((t) => t.fields.filter((f) => f.encrypted).map((f) => f.key))
);