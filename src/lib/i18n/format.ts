import { getConfig, currencySymbol, taxIncluded } from "@/lib/config";
import { dec } from "@/lib/money";

const DEFAULT_PRECISION = 2;
const MAX_PRECISION = 1e14;

function numberLocale(): string {
  return getConfig("number_locale", "en_US").replace("_", "-");
}

export function isRightSideCurrencySymbol(): boolean {
  try {
    const parts = new Intl.NumberFormat(numberLocale(), {
      style: "currency",
      currency: getConfig("currency_code", "") || "USD",
    }).formatToParts(1);
    const numberIndex = parts.findIndex((p) => p.type === "integer");
    const currencyIndex = parts.findIndex((p) => p.type === "currency");
    return currencyIndex > numberIndex;
  } catch {
    return false;
  }
}

interface FormatOptions {
  currency?: boolean;
  decimals?: number;
}

function formatNumber(value: string | number, options: FormatOptions): string {
  const locale = numberLocale();
  const fractionDigits = options.decimals ?? DEFAULT_PRECISION;
  const numericValue = Number(dec(value).toFixed(fractionDigits + 1));
  if (!Number.isFinite(numericValue)) return "";
  if (options.currency) {
    const symbol = currencySymbol();
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: getConfig("currency_code", "") || "USD",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      currencyDisplay: "symbol",
    });
    return formatter
      .formatToParts(numericValue)
      .map((part) => (part.type === "currency" ? symbol : part.value))
      .join("");
  }
  return new Intl.NumberFormat(locale, {
    style: "decimal",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(numericValue);
}

export function toCurrency(number: string | null | undefined): string {
  if (number === null || number === undefined) return "";
  return formatNumber(number, {
    currency: true,
    decimals: Number(getConfig("currency_decimals", "2")),
  });
}

export function toCurrencyNoMoney(number: string | null | undefined): string {
  if (number === null || number === undefined) return "";
  return formatNumber(number, {
    decimals: Number(getConfig("currency_decimals", "2")),
  });
}

export function toCurrencyTax(number: string | null | undefined): string {
  if (number === null || number === undefined) return "";
  const key = taxIncluded() ? "tax_decimals" : "currency_decimals";
  return formatNumber(number, { currency: true, decimals: Number(getConfig(key, "2")) });
}

export function toTaxDecimals(number: string | number | null | undefined): string | number {
  if (number === null || number === undefined || number === "" || number === 0 || number === "0") {
    return number as string | number;
  }
  return formatNumber(String(number), {
    decimals: Number(getConfig("tax_decimals", "2")),
  });
}

export function toQuantityDecimals(number: string | null | undefined): string {
  if (number === null || number === undefined) return "";
  return formatNumber(number, {
    decimals: Number(getConfig("quantity_decimals", "0")),
  });
}

/**
 * `to_decimals`: the `decimals` argument names a config key; when omitted the
 * default precision is 2 (not `currency_decimals`). The upstream
 * `thousands_separator` toggle is a no-op because it calls
 * `setTextAttribute`, so grouping is always locale-default (UD-20).
 */
export function toDecimals(
  number: string | null | undefined,
  decimalsKey?: string | null,
  currency = false,
): string {
  if (number === null || number === undefined) return "";
  const decimals =
    decimalsKey === null || decimalsKey === undefined || decimalsKey === ""
      ? DEFAULT_PRECISION
      : Number(getConfig(decimalsKey, String(DEFAULT_PRECISION)));
  return formatNumber(number, { currency, decimals });
}

function localeSeparators(): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(numberLocale()).formatToParts(1234567.89);
  return {
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
  };
}

/**
 * `parse_decimals`: empty input is returned unchanged (`"0"` stays a string),
 * parsing stops at the first non-numeric character, and values above 1e14 are
 * rejected. `decimals` only influences the falsy early branch upstream.
 */
export function parseDecimals(
  number: string,
  decimals?: number | null,
): number | string | false {
  if (number === "" || number === "0") return number;
  const { group, decimal } = localeSeparators();
  let normalized = "";
  let seenDecimal = false;
  let seenDigit = false;
  for (let i = 0; i < number.length; i++) {
    const ch = number[i];
    if (ch >= "0" && ch <= "9") {
      normalized += ch;
      seenDigit = true;
    } else if (!seenDecimal && ch === decimal) {
      if (!seenDigit) normalized += "0";
      normalized += ".";
      seenDecimal = true;
    } else if (ch === group && seenDigit) {
      continue;
    } else if ((ch === "+" || ch === "-") && normalized === "" && !seenDigit) {
      normalized += ch;
    } else if (ch === " " || ch === " " || ch === " ") {
      continue;
    } else {
      break;
    }
  }
  if (!seenDigit) return false;
  if (normalized.endsWith(".")) normalized = normalized.slice(0, -1);
  const value = Number(normalized);
  if (!Number.isFinite(value) || Math.abs(value) > MAX_PRECISION) return false;
  void decimals;
  return value;
}

export function parseQuantity(number: string): number | string | false {
  return parseDecimals(number, Number(getConfig("quantity_decimals", "0")));
}

export function parseTax(number: string): number | string | false {
  return parseDecimals(number, Number(getConfig("tax_decimals", "2")));
}
