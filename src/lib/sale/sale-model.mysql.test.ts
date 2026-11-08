import { beforeEach, describe, expect, it } from "vitest";
import { execMysql, queryMysql, truncateMysqlTables } from "@/test/mysql-db";
import {
  cancelSale,
  getSale,
  getSaleItems,
  getSalePayments,
  getSaleTaxes,
  saveSale,
  INSUFFICIENT_GIFTCARD_BALANCE,
} from "./sale-model";
import type { CartLine } from "./types";
import { SALE_STATUS, SALE_TYPE, STOCK_TYPE } from "@/lib/constants";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    line: 1,
    itemId: 1,
    itemLocation: 1,
    stockName: "stock",
    name: "Widget",
    itemNumber: null,
    attributeValues: "",
    attributeDtvalues: "",
    description: "Widget",
    serialnumber: "",
    allowAltDescription: false,
    isSerialized: false,
    quantity: "2",
    discount: "0",
    discountType: 0,
    inStock: "10",
    price: "100",
    costPrice: "50",
    total: "200.0000",
    discountedTotal: "200.0000",
    printOption: 0,
    stockType: STOCK_TYPE.HAS_STOCK,
    itemType: 0,
    hsnCode: "",
    taxCategoryId: null,
    taxedFlag: "T",
    ...overrides,
  };
}

async function seed(): Promise<void> {
  await execMysql(
    `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
     VALUES (1, 'Admin', 'User', '', '', '', '', '', '', '', '', '')`,
  );
  await execMysql(
    "INSERT INTO ospos_employees (person_id, username, password, hash_version) VALUES (1, 'admin', 'x', 2)",
  );
  await execMysql(
    "INSERT INTO ospos_stock_locations (location_id, location_name, deleted, is_default, sort_order) VALUES (1, 'stock', 0, 1, 0)",
  );
  await execMysql(
    `INSERT INTO ospos_items (item_id, name, category, description, cost_price, unit_price, allow_alt_description, is_serialized)
     VALUES (1, 'Widget', 'cat', 'Widget', '50.00', '100.00', 0, 0)`,
  );
  await execMysql(
    "INSERT INTO ospos_item_quantities (item_id, location_id, quantity) VALUES (1, 1, 10)",
  );
}

const input = {
  status: SALE_STATUS.COMPLETED,
  customerId: null,
  employeeId: 1,
  comment: "",
  invoiceNumber: null,
  quoteNumber: null,
  workOrderNumber: null,
  saleType: SALE_TYPE.POS,
  dinnerTableId: null,
  taxes: [
    {
      saleId: -1,
      taxType: 1,
      taxGroup: "VAT",
      saleTaxBasis: "200.0000",
      saleTaxAmount: "16.00",
      printSequence: 1,
      name: "VAT",
      taxRate: "8.0000",
      salesTaxCodeId: null,
      jurisdictionId: null,
      taxCategoryId: null,
      roundingCode: 1,
    },
  ],
  itemTaxes: [
    {
      itemId: 1,
      line: 1,
      name: "VAT",
      percent: "8.0000",
      taxType: 1,
      roundingCode: 1,
      cascadeSequence: 0,
      itemTaxAmount: "16.00",
      salesTaxCodeId: null,
      jurisdictionId: null,
      taxCategoryId: null,
    },
  ],
};

beforeEach(async () => {
  await truncateMysqlTables();
  await seed();
});

describe("Sale::save_value on MySQL", () => {
  it("writes header, line, payment, tax and stock in one transaction", async () => {
    const saleId = await saveSale({
      ...input,
      cart: [line()],
      payments: [
        {
          paymentType: "Cash",
          paymentAmount: "200.00",
          cashRefund: "0",
          cashAdjustment: 0,
          referenceCode: null,
        },
      ],
    });
    expect(saleId).toBeGreaterThan(0);

    const sale = await getSale(saleId);
    expect(sale?.saleStatus).toBe(SALE_STATUS.COMPLETED);
    expect(sale?.saleType).toBe(SALE_TYPE.POS);

    expect(await getSaleItems(saleId)).toHaveLength(1);
    const payments = await getSalePayments(saleId);
    expect(payments).toHaveLength(1);
    expect(payments[0].paymentId).toBeGreaterThan(0);
    const taxes = await getSaleTaxes(saleId);
    expect(taxes).toHaveLength(1);
    expect(taxes[0].printSequence).toBe(1);

    const quantity = await queryMysql<{ quantity: string }>(
      "SELECT quantity FROM ospos_item_quantities WHERE item_id = 1 AND location_id = 1",
    );
    expect(Number(quantity[0].quantity)).toBe(8);

    const inventory = await queryMysql<{ trans_comment: string; trans_inventory: string }>(
      "SELECT trans_comment, trans_inventory FROM ospos_inventory WHERE trans_items = 1",
    );
    expect(inventory).toHaveLength(1);
    expect(inventory[0].trans_comment).toBe(`POS ${saleId}`);
    expect(Number(inventory[0].trans_inventory)).toBe(-2);
  });

  it("keeps suspended sales out of stock", async () => {
    const saleId = await saveSale({
      ...input,
      status: SALE_STATUS.SUSPENDED,
      saleType: SALE_TYPE.QUOTE,
      quoteNumber: "Q26000001",
      cart: [line()],
      payments: [],
    });
    const sale = await getSale(saleId);
    expect(sale?.saleStatus).toBe(SALE_STATUS.SUSPENDED);
    expect(sale?.quoteNumber).toBe("Q26000001");
    const quantity = await queryMysql<{ quantity: string }>(
      "SELECT quantity FROM ospos_item_quantities WHERE item_id = 1 AND location_id = 1",
    );
    expect(Number(quantity[0].quantity)).toBe(10);
  });

  it("cancels a completed sale and restores stock", async () => {
    const saleId = await saveSale({
      ...input,
      cart: [line()],
      payments: [
        {
          paymentType: "Cash",
          paymentAmount: "200.00",
          cashRefund: "0",
          cashAdjustment: 0,
          referenceCode: null,
        },
      ],
    });
    await cancelSale(saleId, 1, true);
    expect((await getSale(saleId))?.saleStatus).toBe(SALE_STATUS.CANCELED);
    const quantity = await queryMysql<{ quantity: string }>(
      "SELECT quantity FROM ospos_item_quantities WHERE item_id = 1 AND location_id = 1",
    );
    expect(Number(quantity[0].quantity)).toBe(10);
  });

  it("returns -2 for an underfunded giftcard", async () => {
    await execMysql(
      "INSERT INTO ospos_giftcards (giftcard_id, giftcard_number, value, deleted) VALUES (1, 'GC1', '5.00', 0)",
    );
    const result = await saveSale({
      ...input,
      cart: [line()],
      payments: [
        {
          paymentType: "Gift Card:GC1",
          paymentAmount: "10.00",
          cashRefund: "0",
          cashAdjustment: 0,
          referenceCode: null,
        },
      ],
    });
    expect(result).toBe(INSUFFICIENT_GIFTCARD_BALANCE);
  });
});
