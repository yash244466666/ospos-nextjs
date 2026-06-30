process.env.DATABASE_URL = ":memory:";

import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@/lib/auth/options", () => ({
  auth: async () => ({ user: { personId: 1 } }),
}));

import { getDbSync } from "@/lib/db";
import {
  items, itemQuantities, stockLocations, people, employees,
  sales, salesItems, dinnerTables, customers,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  emptyCartShape, addPayment, deletePayment, returnEntireSale,
} from "@/lib/sale/sale-lib";
import { cancelSale, saveSale } from "@/lib/sale/sale-model";
import { SALE_STATUS, SALE_TYPE, CASH_ADJUSTMENT_PAYMENT_TYPE, PERCENT } from "@/lib/constants";
import type { CartLine, SaleCart } from "@/lib/sale/types";

describe("Sale_lib port", () => {
  let employeeId: number;
  let locationId: number;
  let itemId: number;

  beforeAll(() => {
    const db = getDbSync();

    const person = db.insert(people).values({ firstName: "Test" }).returning().get();
    const emp = db.insert(employees).values({
      personId: person.personId,
      username: "test",
      password: "x",
      hashVersion: 2,
    }).returning().get();
    employeeId = emp.personId;

    const loc = db.insert(stockLocations).values({ locationName: "Stock", deleted: false }).returning().get();
    locationId = loc.locationId;

    const item = db.insert(items).values({
      name: "Widget",
      costPrice: 10,
      unitPrice: 100,
      stockType: 0,
      itemType: 0,
      deleted: false,
    }).returning().get();
    itemId = item.itemId;

    db.insert(itemQuantities).values({ itemId, locationId, quantity: 5 }).run();
  });

  function buildCart(overrides: Partial<SaleCart> = {}): SaleCart {
    return { ...emptyCartShape(), ...overrides };
  }

  function buildReturnLine(qty: number, price: number, line = 1): CartLine {
    const total = -(qty * price);
    return {
      line,
      itemId,
      itemLocation: locationId,
      itemName: "Widget",
      itemNumber: null,
      stockName: "",
      attributeValues: "",
      attributeDtvalues: "",
      description: "",
      serialnumber: "",
      allowAltDescription: false,
      isSerialized: false,
      quantity: -qty,
      discount: 0,
      discountType: PERCENT,
      inStock: 0,
      price,
      costPrice: 10,
      total,
      discountedTotal: total,
      printOption: 0,
      stockType: 0,
      itemType: 0,
      hsnCode: "",
      taxCategoryId: null,
      taxedFlag: "",
      promotionDiscount: 0,
      unitPriceBeforePromo: price,
      promoQuantitySold: 0,
      printAfterPromo: false,
    };
  }

  it("returnEntireSale creates negative quantities and totals", async () => {
    const db = getDbSync();
    const sale = db.insert(sales).values({
      saleTime: Math.floor(Date.now() / 1000),
      employeeId,
      customerId: null,
      saleStatus: SALE_STATUS.COMPLETED,
      saleType: SALE_TYPE.POS,
      saleLocation: locationId,
    }).returning().get();

    db.insert(salesItems).values({
      saleId: sale.saleId,
      itemId,
      line: 1,
      quantityPurchased: 2,
      itemCostPrice: 10,
      itemUnitPrice: 100,
      discount: 0,
      discountType: PERCENT,
      itemLocation: locationId,
    }).run();

    const cart = buildCart();
    await returnEntireSale(cart, `POS ${sale.saleId}`);

    expect(cart.mode).toBe("return");
    expect(cart.saleType).toBe(SALE_TYPE.RETURN);
    expect(cart.cart).toHaveLength(1);
    expect(cart.cart[0].quantity).toBe(-2);
    expect(cart.cart[0].total).toBeCloseTo(-200, 2);
    expect(cart.cart[0].discountedTotal).toBeCloseTo(-200, 2);
    expect(cart.payments).toHaveLength(0);
    expect(cart.saleId).toBe(-1);
  });

  it("addPayment records cash refunds in cashRefund, not negative paymentAmount", async () => {
    const cart = buildCart();
    await addPayment(cart, "Cash", -50, 0, employeeId);

    expect(cart.payments).toHaveLength(1);
    expect(cart.payments[0].paymentType).toBe("Cash");
    expect(cart.payments[0].paymentAmount).toBe(0);
    expect(cart.payments[0].cashRefund).toBe(50);
  });

  it("addPayment keeps non-cash refunds as negative paymentAmount", async () => {
    const cart = buildCart();
    await addPayment(cart, "Check", -30, 0, employeeId);

    expect(cart.payments).toHaveLength(1);
    expect(cart.payments[0].paymentType).toBe("Check");
    expect(cart.payments[0].paymentAmount).toBe(-30);
    expect(cart.payments[0].cashRefund).toBe(0);
  });

  it("deletePayment removes only the sibling cash-adjustment row", async () => {
    const cart = buildCart();
    await addPayment(cart, "Cash", 100, 0.03, employeeId);
    await addPayment(cart, "Check", 50, -0.01, employeeId);

    const cashPayment = cart.payments.find((p) => p.paymentType === "Cash");
    expect(cashPayment).toBeDefined();
    const cashAdjustment = cart.payments.find((p) => p.paymentType === CASH_ADJUSTMENT_PAYMENT_TYPE && p.paymentAmount === 0.03);
    expect(cashAdjustment).toBeDefined();

    await deletePayment(cart, cashPayment!.paymentId);

    expect(cart.payments.find((p) => p.paymentType === "Cash")).toBeUndefined();
    expect(cart.payments.find((p) => p.paymentType === CASH_ADJUSTMENT_PAYMENT_TYPE && p.paymentAmount === 0.03)).toBeUndefined();
    expect(cart.payments.find((p) => p.paymentType === "Check")).toBeDefined();
    expect(cart.payments.find((p) => p.paymentType === CASH_ADJUSTMENT_PAYMENT_TYPE && p.paymentAmount === -0.01)).toBeDefined();
  });

  it("cancelSale releases the dinner table", () => {
    const db = getDbSync();
    const table = db.insert(dinnerTables).values({ name: "T1", status: 1, deleted: false }).returning().get();

    const sale = db.insert(sales).values({
      saleTime: Math.floor(Date.now() / 1000),
      employeeId,
      customerId: null,
      saleStatus: SALE_STATUS.COMPLETED,
      saleType: SALE_TYPE.POS,
      saleLocation: locationId,
      dinnerTableId: table.dinnerTableId,
    }).returning().get();

    db.insert(salesItems).values({
      saleId: sale.saleId,
      itemId,
      line: 1,
      quantityPurchased: 1,
      itemCostPrice: 10,
      itemUnitPrice: 100,
      discount: 0,
      discountType: PERCENT,
      itemLocation: locationId,
    }).run();

    cancelSale(sale.saleId, employeeId, false);

    const canceled = db.select().from(sales).where(eq(sales.saleId, sale.saleId)).get();
    expect(canceled?.saleStatus).toBe(SALE_STATUS.CANCELED);
    const released = db.select().from(dinnerTables).where(eq(dinnerTables.dinnerTableId, table.dinnerTableId)).get();
    expect(released?.status).toBe(0);
  });

  it("saveSale restores inventory for returns", async () => {
    const cart = buildCart({
      mode: "return",
      saleType: SALE_TYPE.RETURN,
      employeeId,
      locationId,
      cart: [buildReturnLine(2, 100)],
    });

    const result = await saveSale({
      cart,
      taxes: [],
      itemTaxes: [],
      saleStatus: SALE_STATUS.COMPLETED,
      employeeId,
      subtotal: -200,
      total: -200,
      taxTotal: 0,
    });

    const db = getDbSync();
    const qty = db.select().from(itemQuantities)
      .where(and(eq(itemQuantities.itemId, itemId), eq(itemQuantities.locationId, locationId)))
      .get();
    expect(qty?.quantity).toBe(7);

    const inv = db.select().from(inventory)
      .where(and(eq(inventory.transItems, itemId), eq(inventory.transComment, `POS ${result.saleId}`)))
      .get();
    expect(inv?.transInventory).toBe(2);
  });
});

import { inventory } from "@/db/schema";
import { and } from "drizzle-orm";
