import { beforeEach, describe, expect, it } from "vitest";
import { getRawSqlite } from "@/lib/db/sqlite";
import { resetTestDatabase } from "@/test/db";
import { invalidateConfigCache } from "@/lib/config";
import { buildSaleDocumentData } from "./data";

function sql(sqlText: string): void {
  getRawSqlite().exec(sqlText);
}

function seed(): void {
  sql(
    `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
     VALUES (1, 'John', 'Doe', '', '', '', '', '', '', '', '', ''),
            (2, 'Cara', 'Customer', '', '', '1 Main St', '', 'Dhaka', '', '', '', '')`,
  );
  sql(
    "INSERT INTO ospos_employees (person_id, username, password, hash_version) VALUES (1, 'admin', 'x', 2)",
  );
  sql(
    "INSERT INTO ospos_customers (person_id, company_name, taxable, discount, discount_type, tax_id, employee_id, date) VALUES (2, '', 0, 0, 0, '', 1, '2024-01-01 00:00:00')",
  );
  sql(
    "INSERT INTO ospos_stock_locations (location_id, location_name, deleted, is_default, sort_order) VALUES (1, 'stock', 0, 1, 0)",
  );
  sql(
    `INSERT INTO ospos_items (item_id, name, category, description, cost_price, unit_price, allow_alt_description, is_serialized, item_number)
     VALUES (1, 'Widget', 'Tools', 'A widget', '4.00', '10.00', 0, 0, 'W-1')`,
  );
  sql(
    `INSERT INTO ospos_sales (sale_id, sale_time, customer_id, employee_id, comment, invoice_number, sale_status, sale_type)
     VALUES (1, '2024-01-15 10:00:00', 2, 1, 'thanks', 'INV-1', 0, 0)`,
  );
  sql(
    `INSERT INTO ospos_sales_items (sale_id, item_id, description, serialnumber, line, quantity_purchased, item_cost_price, item_unit_price, discount, discount_type, item_location, print_option)
     VALUES (1, 1, 'A widget', 'SN-1', 1, 2, 4.00, 10.00, 10, 0, 1, 0)`,
  );
  sql(
    `INSERT INTO ospos_sales_items_taxes (sale_id, item_id, line, name, percent, tax_type, rounding_code, cascade_sequence, item_tax_amount)
     VALUES (1, 1, 1, 'VAT', 8.0000, 1, 1, 0, 1.44)`,
  );
  sql(
    `INSERT INTO ospos_sales_taxes (sale_id, tax_type, tax_group, sale_tax_basis, sale_tax_amount, print_sequence, name, tax_rate, rounding_code)
     VALUES (1, 1, 'VAT', 18.0000, 1.44, 1, 'VAT', 8.0000, 1)`,
  );
  sql(
    `INSERT INTO ospos_sales_payments (payment_id, sale_id, payment_type, payment_amount, cash_refund, cash_adjustment, employee_id)
     VALUES (1, 1, 'Cash', 20.00, 0.00, 0, 1)`,
  );
}

beforeEach(() => {
  resetTestDatabase();
  invalidateConfigCache();
  seed();
});

describe("SaleDocument data", () => {
  it("computes prediscount, discounted subtotal, tax and change with decimals", async () => {
    const data = await buildSaleDocumentData(1);
    expect(data).not.toBeNull();
    expect(data!.prediscountSubtotal).toBe("20.0000");
    expect(data!.subtotal).toBe("18.0000");
    expect(data!.discountTotal).toBe("2.0000");
    expect(data!.taxes[0]).toMatchObject({ name: "VAT", rate: "8.00", amount: "1.4400" });
    expect(data!.total).toBe("19.4400");
    expect(data!.amountDue).toBe("-0.5600");
    expect(data!.change).toBe("0.5600");
  });

  it("carries receipt line fields and the tax indicator", async () => {
    const data = await buildSaleDocumentData(1);
    const line = data!.lines[0];
    expect(line).toMatchObject({
      name: "Widget",
      description: "A widget",
      serialnumber: "SN-1",
      itemNumber: "W-1",
      price: "10.00",
      quantity: "2.000",
      total: "20.0000",
      discountedTotal: "18.0000",
      discount: "2.0000",
      taxedFlag: "T",
      printOption: 0,
    });
  });

  it("identifies the customer and employee display names", async () => {
    const data = await buildSaleDocumentData(1);
    expect(data!.customerName).toBe("Cara Customer");
    expect(data!.employeeName).toBe("John D");
    expect(data!.invoiceNumber).toBe("INV-1");
  });

  it("exposes the receipt flag matrix", async () => {
    const data = await buildSaleDocumentData(1);
    expect(data!.flags).toMatchObject({
      showDescription: true,
      showSerialnumber: true,
      showTaxes: false,
      showTotalDiscount: false,
      template: "receipt_default",
    });
  });
});
