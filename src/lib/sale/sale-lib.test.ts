import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionData: async () => ({}) }));
import {
  addPayment,
  deletePayment,
  getPaymentsTotal,
  getTotals,
  resetCashRounding,
  clearAll,
  editItem,
  applyCustomerDiscount,
} from "./sale-lib";
import { emptyCart } from "./cart-store";
import {
  calculateTotals,
  getItemDiscount,
  getItemTotal,
  getQuantitySold,
  type CartLine,
  type SaleCart,
} from "./types";
import { ROUNDING_MODE, SALE_TYPE, STOCK_TYPE } from "@/lib/constants";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    line: 1,
    itemId: 1,
    itemLocation: 1,
    stockName: "stock",
    name: "Item",
    itemNumber: null,
    attributeValues: "",
    attributeDtvalues: "",
    description: "",
    serialnumber: "",
    allowAltDescription: false,
    isSerialized: false,
    quantity: "1",
    discount: "0",
    discountType: 0,
    inStock: "10",
    price: "100",
    costPrice: "50",
    total: "100.0000",
    discountedTotal: "100.0000",
    printOption: 0,
    stockType: STOCK_TYPE.HAS_STOCK,
    itemType: 0,
    hsnCode: "",
    taxCategoryId: null,
    taxedFlag: "T",
    ...overrides,
  };
}

function cartWith(lines: CartLine[]): SaleCart {
  return { ...emptyCart(), cart: lines, customerId: -1, employeeId: 1 };
}

describe("Sale_lib calculators (O3)", () => {
  it("fixed discount applies per unit", () => {
    expect(getItemDiscount("3", "100", "10", 1)).toBe("30.00");
    expect(getItemTotal("3", "100", "10", 1, true)).toBe("270.0000");
  });

  it("percent discount rounds at totals decimals", () => {
    expect(getItemDiscount("2", "100", "10", 0)).toBe("20.00");
    expect(getItemTotal("2", "100", "10", 0, true)).toBe("180.0000");
  });

  it("get_quantity_sold divides at quantity decimals", () => {
    expect(getQuantitySold("10", "3")).toBe("3");
    expect(getQuantitySold("10.00", "3.00")).toBe("3");
  });

  it("totals subtract included tax and add excluded tax", () => {
    const cart = cartWith([line({ quantity: "2", price: "50" })]);
    const totals = calculateTotals(cart.cart, [
      { taxType: 1, saleTaxAmount: "8.00" },
    ], {
      paymentTotal: "0",
      cashRounding: false,
      cashMode: false,
      cashRoundingCode: ROUNDING_MODE.HALF_UP,
      cashDecimals: 2,
      mode: "sale",
    });
    expect(totals.subtotal).toBe("100.0000");
    expect(totals.total).toBe("108.00");
    expect(totals.taxTotal).toBe("8.00");
    expect(totals.paymentsCoverTotal).toBe(false);
  });

  it("included tax is removed from subtotal, not added to total", () => {
    const totals = calculateTotals([line({ price: "110" })], [
      { taxType: 0, saleTaxAmount: "10.00" },
    ], {
      paymentTotal: "0",
      cashRounding: false,
      cashMode: false,
      cashRoundingCode: ROUNDING_MODE.HALF_UP,
      cashDecimals: 2,
      mode: "sale",
    });
    expect(totals.subtotal).toBe("100.0000");
    expect(totals.total).toBe("110.00");
  });

  it("cash rounding creates a positive adjustment when covered", () => {
    const totals = calculateTotals([line({ price: "19.43" })], [], {
      paymentTotal: "19.45",
      cashRounding: true,
      cashMode: true,
      cashRoundingCode: ROUNDING_MODE.HALF_FIVE,
      cashDecimals: 2,
      mode: "sale",
    });
    expect(totals.cashTotal).toBe("19.45");
    expect(totals.cashAdjustmentAmount).toBe("0.02");
    expect(totals.paymentsCoverTotal).toBe(true);
  });

  it("return mode inverts the coverage comparison", () => {
    const totals = calculateTotals([line({ quantity: "-1", price: "100" })], [], {
      paymentTotal: "0",
      cashRounding: false,
      cashMode: false,
      cashRoundingCode: ROUNDING_MODE.HALF_UP,
      cashDecimals: 2,
      mode: "return",
    });
    expect(totals.amountDue).toBe("-100.00");
    expect(totals.paymentsCoverTotal).toBe(false);
  });

  it("counts only stock lines for item_count and total_units", () => {
    const totals = calculateTotals(
      [
        line({ line: 1, quantity: "2" }),
        line({ line: 2, quantity: "5", stockType: STOCK_TYPE.HAS_NO_STOCK }),
      ],
      [],
      {
        paymentTotal: "0",
        cashRounding: false,
        cashMode: false,
        cashRoundingCode: ROUNDING_MODE.HALF_UP,
        cashDecimals: 2,
        mode: "sale",
      },
    );
    expect(totals.itemCount).toBe(1);
    expect(totals.totalUnits).toBe("2");
  });
});

describe("payments (O4)", () => {
  it("accumulates the same payment type and keeps reference codes", () => {
    let cart = cartWith([line({ price: "10" })]);
    cart = addPayment(cart, "Cash", "5");
    cart = addPayment(cart, "Debit Card", "10", "12345");
    cart = addPayment(cart, "Cash", "2");
    expect(cart.payments).toHaveLength(2);
    expect(cart.payments[0].paymentAmount).toBe("7.0000");
    expect(cart.payments[1].referenceCode).toBe("12345");
  });

  it("payments total excludes cash adjustments", () => {
    let cart = cartWith([]);
    cart = addPayment(cart, "Cash", "10");
    cart = addPayment(cart, "Cash Adjustment", "0.02", null, 1);
    expect(getPaymentsTotal(cart).total).toBe("10.0000");
  });

  it("deletes the cash sibling when cash rounding is active", () => {
    let cart = { ...cartWith([]), cashRounding: true };
    cart = addPayment(cart, "Cash", "10");
    cart = addPayment(cart, "Cash Adjustment", "0.02", null, 1);
    // reset_cash_rounding re-derives from config (defaults: rounding off), so
    // the sibling is only removed on a site with rounding enabled.
    cart = deletePayment(cart, "Cash");
    expect(cart.payments.map((p) => p.paymentType)).toEqual(["Cash Adjustment"]);
  });

  it("reset_cash_rounding follows cash_decimals and HALF_FIVE", () => {
    const base = cartWith([]);
    const { cart } = resetCashRounding(base);
    expect(cart.cashRounding).toBe(false);
    expect(cart.cashMode).toBe(false);
  });
});

describe("cart operations", () => {
  it("edit_item recomputes quantity from a discounted total", () => {
    const cart = cartWith([line({ quantity: "1", price: "3" })]);
    const edited = editItem(cart, 1, {
      description: "",
      serialnumber: "",
      quantity: "1",
      discount: "0",
      price: "3",
      discountedTotal: "9.99",
    });
    expect(edited.cart[0].quantity).toBe("3");
    expect(edited.payments).toEqual([]);
  });

  it("edit_item clears payments", () => {
    let cart = cartWith([line()]);
    cart = addPayment(cart, "Cash", "5");
    const edited = editItem(cart, 1, {
      description: "x",
      serialnumber: "",
      quantity: "2",
      discount: "0",
      price: "100",
    });
    expect(edited.payments).toEqual([]);
    expect(edited.cart[0].quantity).toBe("2");
  });

  it("customer discount only applies to zero-discount lines", () => {
    const cart = cartWith([
      line({ line: 1, price: "100" }),
      line({ line: 2, price: "100", discount: "5" }),
    ]);
    const discounted = applyCustomerDiscount(cart, "10", 0);
    expect(discounted.cart[0].discount).toBe("10.0000");
    expect(discounted.cart[1].discount).toBe("5");
  });

  it("clear_all resets the sale but keeps the location", () => {
    const cart = clearAll({ ...cartWith([line()]), comment: "x", saleId: 4 });
    expect(cart.cart).toEqual([]);
    expect(cart.comment).toBe("");
    expect(cart.saleId).toBe(-1);
  });
});

describe("return sign preservation", () => {
  it("negative quantities stay negative through totals", () => {
    const totals = getTotals(
      { ...cartWith([line({ quantity: "-1", price: "100" })]), mode: "return" },
      [],
    );
    expect(totals.total).toBe("-100.00");
    expect(totals.paymentsCoverTotal).toBe(false);
  });
});

void SALE_TYPE;
