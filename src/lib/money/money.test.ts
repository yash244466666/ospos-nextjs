import { describe, expect, it } from "vitest";
import {
  bcAdd,
  bcDiv,
  bcMul,
  dec,
  phpRound,
  ROUND,
  setBcScale,
  taxRound,
  toDbDecimal,
} from "@/lib/money";

function r(value: string, decimals: number, mode: number): string {
  return toDbDecimal(phpRound(value, decimals, mode as 1), decimals);
}

describe("phpRound — the seven OSPOS rounding modes", () => {
  it("HALF_UP rounds ties away from zero", () => {
    expect(r("2.345", 2, ROUND.HALF_UP)).toBe("2.35");
    expect(r("-2.345", 2, ROUND.HALF_UP)).toBe("-2.35");
    expect(r("1.005", 2, ROUND.HALF_UP)).toBe("1.01");
  });

  it("HALF_DOWN rounds ties toward zero", () => {
    expect(r("2.345", 2, ROUND.HALF_DOWN)).toBe("2.34");
    expect(r("-2.345", 2, ROUND.HALF_DOWN)).toBe("-2.34");
  });

  it("HALF_EVEN ties to even", () => {
    expect(r("2.345", 2, ROUND.HALF_EVEN)).toBe("2.34");
    expect(r("2.355", 2, ROUND.HALF_EVEN)).toBe("2.36");
    expect(r("-2.345", 2, ROUND.HALF_EVEN)).toBe("-2.34");
  });

  it("HALF_ODD ties to odd", () => {
    expect(r("2.345", 2, ROUND.HALF_ODD)).toBe("2.35");
    expect(r("2.355", 2, ROUND.HALF_ODD)).toBe("2.35");
    expect(r("-2.345", 2, ROUND.HALF_ODD)).toBe("-2.35");
  });

  it("ROUND_UP moves toward +infinity", () => {
    expect(r("2.345", 2, ROUND.ROUND_UP)).toBe("2.35");
    expect(r("-2.345", 2, ROUND.ROUND_UP)).toBe("-2.34");
  });

  it("ROUND_DOWN moves toward -infinity", () => {
    expect(r("2.345", 2, ROUND.ROUND_DOWN)).toBe("2.34");
    expect(r("-2.345", 2, ROUND.ROUND_DOWN)).toBe("-2.35");
  });

  it("HALF_FIVE rounds to multiples of five units", () => {
    expect(r("1.234", 2, ROUND.HALF_FIVE)).toBe("1.25");
    expect(r("2.345", 2, ROUND.HALF_FIVE)).toBe("2.35");
    expect(r("-2.345", 2, ROUND.HALF_FIVE)).toBe("-2.35");
    expect(r("12.35", 0, ROUND.HALF_FIVE)).toBe("10");
  });
});

describe("taxRound — Tax_lib::round_taxes quirks (UD-01)", () => {
  it("treats HALF_ODD as HALF_UP", () => {
    expect(toDbDecimal(taxRound("2.345", 2, ROUND.HALF_ODD), 2)).toBe("2.35");
    expect(toDbDecimal(taxRound("2.355", 2, ROUND.HALF_ODD), 2)).toBe("2.36");
  });

  it("uses round(x/5)*5 at zero decimals for HALF_FIVE", () => {
    expect(toDbDecimal(taxRound("2.345", 2, ROUND.HALF_FIVE), 2)).toBe("0.00");
    expect(toDbDecimal(taxRound("12.50", 2, ROUND.HALF_FIVE), 2)).toBe("15.00");
  });

  it("uses 10^(decimals-1) for ROUND_UP / ROUND_DOWN", () => {
    expect(toDbDecimal(taxRound("1.2345", 2, ROUND.ROUND_UP), 2)).toBe("1.30");
    expect(toDbDecimal(taxRound("1.2345", 2, ROUND.ROUND_DOWN), 2)).toBe("1.20");
  });
});

describe("bcmath scale", () => {
  it("truncates add/mul/div toward zero at the configured scale", () => {
    setBcScale(4);
    expect(toDbDecimal(bcAdd("1.00005", "0"), 4)).toBe("1.0000");
    expect(toDbDecimal(bcMul("10.88885", "1"), 4)).toBe("10.8888");
    expect(toDbDecimal(bcDiv("1", "3"), 4)).toBe("0.3333");
    expect(toDbDecimal(bcAdd("-1.00005", "0"), 4)).toBe("-1.0000");
    setBcScale(4);
  });

  it("does not lose decimal precision through number coercion", () => {
    expect(dec("0.1").plus(dec("0.2")).toFixed(2)).toBe("0.30");
    expect(dec("9999999999999.99").plus("0.01").toFixed(2)).toBe("10000000000000.00");
  });
});
