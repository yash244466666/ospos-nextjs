export const SALE_STATUS = { COMPLETED: 0, SUSPENDED: 1, CANCELED: 2 } as const;
export const SALE_TYPE = {
  POS: 0, INVOICE: 1, WORK_ORDER: 2, QUOTE: 3, RETURN: 4,
} as const;
export const ITEM_TYPE = {
  ITEM: 0, ITEM_KIT: 1, ITEM_AMOUNT_ENTRY: 2, ITEM_TEMP: 3,
} as const;
export const STOCK_TYPE = { HAS_STOCK: 0, HAS_NO_STOCK: 1 } as const;
export const PRINT_OPTION = {
  PRINT_ALL: 0, PRINT_PRICED: 1, PRINT_KIT: 2, DO_NOT_PRINT: 3,
} as const;
export const DISCOUNT_TYPE = { PERCENT: 0, FIXED: 1 } as const;
export const PRICE_OPTION = {
  PRICE_OPTION_ALL: 0, PRICE_OPTION_KIT_STOCK: 1,
  PRICE_OPTION_KIT_AND_STOCK: 2, PRICE_OPTION_KIT: 3,
} as const;
export const PRICE_MODE = {
  PRICE_MODE_EXCLUDE: 0, PRICE_MODE_INCLUSIVE: 1, PRICE_MODE_KIT: 2, PRICE_MODE_KIT_PART: 3,
} as const;
export const CASH_MODE = { CASH_MODE_FALSE: 0, CASH_MODE_TRUE: 1 } as const;
export const CASH_ADJUSTMENT = { CASH_ADJUSTMENT_FALSE: 0, CASH_ADJUSTMENT_TRUE: 1 } as const;
export const LINE_SEQUENCE = {
  LINE_SEQUENCE_0: 0, LINE_SEQUENCE_1: 1, LINE_SEQUENCE_2: 2,
} as const;
export const ADMIN_MODULES = [
  "customers", "employees", "giftcards", "items", "item_kits",
  "messages", "receivings", "reports", "sales", "config", "suppliers",
] as const;
export const TAX_TYPE = { INCLUDED: 0, EXCLUDED: 1 } as const;
export const ROUNDING_MODE = {
  HALF_UP: 1, HALF_DOWN: 2, HALF_EVEN: 3, HALF_ODD: 4,
  ROUND_UP: 5, ROUND_DOWN: 6, HALF_FIVE: 7,
} as const;
export const ATTRIBUTE_TYPES = ["TEXT", "DROPDOWN", "DECIMAL", "DATE", "GROUP", "CHECKBOX"] as const;
export const ATTRIBUTE_FLAGS = { SHOW_IN_ITEMS: 1, SHOW_IN_SALES: 2, SHOW_IN_RECEIVINGS: 4 } as const;

export const NEW_ENTRY = -1;
export const NEW_ITEM = -1;
export const NO_DEFINITION_ID = -1;

export const PERCENT = 0;
export const FIXED = 1;
export const HAS_STOCK = 0;
export const HAS_NO_STOCK = 1;
export const PRINT_YES = 0;
export const PRINT_NO = 1;
export const ITEM = 0;
export const ITEM_KIT = 1;
export const ITEM_AMOUNT_ENTRY = 2;
export const ITEM_TEMP = 3;

export const REGISTER_MODES = [
  { value: "sale", lang: "sales.sale", saleType: SALE_TYPE.POS, register_mode: "sale" },
  { value: "sale_invoice", lang: "sales.invoice", saleType: SALE_TYPE.INVOICE, register_mode: "sale_invoice" },
  { value: "sale_quote", lang: "sales.quote", saleType: SALE_TYPE.QUOTE, register_mode: "sale_quote" },
  { value: "sale_work_order", lang: "sales.work_order", saleType: SALE_TYPE.WORK_ORDER, register_mode: "sale_work_order" },
  { value: "return", lang: "sales.return", saleType: SALE_TYPE.RETURN, register_mode: "return" },
] as const;

export const INVOICE_TYPES = [
  { key: "invoice", lang: "sales.invoice_type_invoice" },
  { key: "tax_invoice", lang: "sales.invoice_type_tax_invoice" },
  { key: "custom_invoice", lang: "sales.invoice_type_custom_invoice" },
  { key: "custom_tax_invoice", lang: "sales.invoice_type_custom_tax_invoice" },
] as const;

export const LINE_SEQUENCES = [
  { value: 0, lang: "sales.line_sequence_0" },
  { value: 1, lang: "sales.line_sequence_1" },
  { value: 2, lang: "sales.line_sequence_2" },
] as const;

export const VALID_INVOICE_TYPES = ["invoice", "tax_invoice", "custom_invoice", "custom_tax_invoice"] as const;
export const VALID_RECEIPT_TEMPLATES = [
  "receipt", "receipt_default", "receipt_short",
  "invoice", "tax_invoice", "quote", "work_order",
] as const;

export const KEY_SHORTCUTS = [
  { key: "F1", action: "show_help" },
  { key: "F2", action: "select_customer" },
  { key: "F3", action: "select_supplier" },
  { key: "F4", action: "add_payment" },
  { key: "F5", action: "add_discount" },
  { key: "F6", action: "complete_sale" },
  { key: "F7", action: "complete_invoice" },
  { key: "F8", action: "suspend_sale" },
  { key: "F9", action: "cancel_sale" },
  { key: "F10", action: "email_receipt" },
  { key: "F11", action: "fullscreen" },
  { key: "F12", action: "toggle_quantity" },
] as const;

export const DEFAULT_PAYMENT_TYPES = [
  "Cash", "Check", "Debit Card", "Credit Card", "Due", "Bank Transfer", "Wallet",
] as const;

export const GIFT_CARD_PREFIX = "Gift Card: ";
export const REWARDS_PREFIX = "Rewards";
export const CASH_ADJUSTMENT_PAYMENT_TYPE = "cash_adjustment";

export const SUSPENDED_SALE_PREFIX = "POS ";
export const RECEIVING_PREFIX = "RECV ";
export const KIT_RECEIPT_PREFIX = "KIT ";
