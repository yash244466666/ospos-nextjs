import Decimal from "decimal.js";
import { ROUNDING_MODE } from "@/lib/constants";

export type DecimalInput = string | number | Decimal;
export type RoundingMode = (typeof ROUNDING_MODE)[keyof typeof ROUNDING_MODE];

export const ROUND = ROUNDING_MODE;

Decimal.set({ precision: 40, toExpNeg: -30, toExpPos: 30 });

export function dec(value: DecimalInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    return new Decimal(Number.isFinite(value) ? String(value) : "0");
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return new Decimal(0);
  return new Decimal(trimmed);
}

/** True when the input is a valid decimal string accepted by bcmath/NumberFormatter. */
export function isValidDecimal(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  try {
    const d = dec(value);
    return d.isFinite();
  } catch {
    return false;
  }
}

export const add = (a: DecimalInput, b: DecimalInput): Decimal => dec(a).plus(dec(b));
export const sub = (a: DecimalInput, b: DecimalInput): Decimal => dec(a).minus(dec(b));
export const mul = (a: DecimalInput, b: DecimalInput): Decimal => dec(a).times(dec(b));
export const div = (a: DecimalInput, b: DecimalInput): Decimal => dec(a).dividedBy(dec(b));
export const compare = (a: DecimalInput, b: DecimalInput): number => dec(a).cmp(dec(b));
export const isZero = (a: DecimalInput): boolean => dec(a).isZero();
export const abs = (a: DecimalInput): Decimal => dec(a).abs();
export const neg = (a: DecimalInput): Decimal => dec(a).negated();

let bcScaleValue = 4;

/** Mirrors `bcscale(max(2, totals_decimals() + tax_decimals()))` from Load_config. */
export function setBcScale(scale: number): void {
  bcScaleValue = Math.max(0, Math.trunc(scale));
}

export function getBcScale(): number {
  return bcScaleValue;
}

/** bcmath truncates toward zero at the configured scale. */
function truncateAtScale(value: Decimal, scale = bcScaleValue): Decimal {
  return value.toDecimalPlaces(scale, Decimal.ROUND_DOWN);
}

export function bcAdd(a: DecimalInput, b: DecimalInput, scale = bcScaleValue): Decimal {
  return truncateAtScale(dec(a).plus(dec(b)), scale);
}

export function bcSub(a: DecimalInput, b: DecimalInput, scale = bcScaleValue): Decimal {
  return truncateAtScale(dec(a).minus(dec(b)), scale);
}

export function bcMul(a: DecimalInput, b: DecimalInput, scale = bcScaleValue): Decimal {
  return truncateAtScale(dec(a).times(dec(b)), scale);
}

export function bcDiv(a: DecimalInput, b: DecimalInput, scale = bcScaleValue): Decimal {
  return truncateAtScale(dec(a).dividedBy(dec(b)), scale);
}

function halfOdd(value: Decimal, decimals: number): Decimal {
  const factor = new Decimal(10).pow(decimals);
  const scaled = value.times(factor);
  const floor = scaled.floor();
  const fraction = scaled.minus(floor);
  if (fraction.abs().eq(0.5)) {
    const down = floor;
    const up = floor.plus(1);
    const chosen = down.abs().mod(2).eq(1) ? down : up;
    return chosen.dividedBy(factor);
  }
  return scaled.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).dividedBy(factor);
}

/**
 * PHP `round($amount, $decimals, $mode)` with the OSPOS extra modes.
 * ROUND_UP/ROUND_DOWN use the upstream `ceil`/`floor` formulas (see
 * `Rounding_mode::round_number()`), including their behaviour on negatives.
 */
export function phpRound(
  value: DecimalInput,
  decimals = 0,
  mode: RoundingMode = ROUNDING_MODE.HALF_UP,
): Decimal {
  const amount = dec(value);
  switch (mode) {
    case ROUNDING_MODE.ROUND_UP: {
      const fig = new Decimal(10).pow(decimals);
      const scaled = amount.times(fig);
      return scaled.ceil().dividedBy(fig);
    }
    case ROUNDING_MODE.ROUND_DOWN: {
      const fig = new Decimal(10).pow(decimals);
      const scaled = amount.times(fig);
      return scaled.floor().dividedBy(fig);
    }
    case ROUNDING_MODE.HALF_FIVE:
      return phpRound(amount.dividedBy(5), decimals, ROUNDING_MODE.HALF_EVEN).times(5);
    case ROUNDING_MODE.HALF_ODD:
      return halfOdd(amount, decimals);
    case ROUNDING_MODE.HALF_DOWN:
      return amount.toDecimalPlaces(decimals, Decimal.ROUND_HALF_DOWN);
    case ROUNDING_MODE.HALF_EVEN:
      return amount.toDecimalPlaces(decimals, Decimal.ROUND_HALF_EVEN);
    case ROUNDING_MODE.HALF_UP:
    default:
      return amount.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  }
}

/**
 * The inline rounding branch used by `Tax_lib::round_taxes()`, which differs
 * from `Rounding_mode::round_number()` in two observable ways (UD-01):
 * HALF_ODD behaves as HALF_UP, and HALF_FIVE divides at zero decimals with
 * PHP's default HALF_UP. Its ROUND_UP/ROUND_DOWN figure is
 * `(int)str_pad('1', $decimals, '0')`, i.e. 10^(decimals-1), not 10^decimals.
 */
export function taxRound(
  value: DecimalInput,
  decimals: number,
  mode: RoundingMode,
): Decimal {
  const amount = dec(value);
  switch (mode) {
    case ROUNDING_MODE.HALF_ODD:
      return phpRound(amount, decimals, ROUNDING_MODE.HALF_UP);
    case ROUNDING_MODE.HALF_FIVE:
      return phpRound(amount.dividedBy(5), 0, ROUNDING_MODE.HALF_UP).times(5);
    case ROUNDING_MODE.ROUND_UP: {
      const fig = new Decimal(10).pow(Math.max(0, decimals - 1));
      return amount.times(fig).ceil().dividedBy(fig);
    }
    case ROUNDING_MODE.ROUND_DOWN: {
      const fig = new Decimal(10).pow(Math.max(0, decimals - 1));
      return amount.times(fig).floor().dividedBy(fig);
    }
    default:
      return phpRound(amount, decimals, mode);
  }
}

/** Canonical DB decimal string with a fixed scale (no exponent, no grouping). */
export function toDbDecimal(value: DecimalInput, scale: number): string {
  return dec(value).toFixed(scale);
}

/** Canonical trimmed decimal string (used where upstream stores a float/value). */
export function toDecimalString(value: DecimalInput): string {
  return dec(value).toFixed();
}

/** Compares with a tolerance of half a unit in the last stored place. */
export function withinTolerance(
  a: DecimalInput,
  b: DecimalInput,
  decimals: number,
): boolean {
  const tolerance = new Decimal(10).pow(-decimals).dividedBy(2);
  return dec(a).minus(dec(b)).abs().lte(tolerance);
}

/** Sums a list with bcmath scale truncation. */
export function bcSum(values: DecimalInput[], scale = bcScaleValue): Decimal {
  return values.reduce<Decimal>((acc, value) => bcAdd(acc, value, scale), new Decimal(0));
}

export { Decimal };
