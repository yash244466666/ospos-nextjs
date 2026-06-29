export const SALE_STATUS = { COMPLETED: 0, SUSPENDED: 1, CANCELED: 2 } as const;
export const SALE_TYPE = {
  POS: 0, INVOICE: 1, WORK_ORDER: 2, QUOTE: 3, RETURN: 4,
} as const;
export const ITEM_TYPE = { ITEM: 0, ITEM_KIT: 1, ITEM_AMOUNT_ENTRY: 2, ITEM_TEMP: 3 } as const;
export const STOCK_TYPE = { HAS_STOCK: 0, HAS_NO_STOCK: 1 } as const;
export const PRINT_OPTION = {
  PRINT_ALL: 0, PRINT_PRICED: 1, PRINT_KIT: 2, DO_NOT_PRINT: 3,
} as const;
export const DISCOUNT_TYPE = { PERCENT: 0, FIXED: 1 } as const;
export const PRICE_OPTION = {
  PRICE_OPTION_ALL: 0, PRICE_OPTION_KIT_STOCK: 1,
  PRICE_OPTION_KIT_AND_STOCK: 2, PRICE_OPTION_KIT: 3,
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