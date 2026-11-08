import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import Register from "@/components/sales/register";
import { getCart, saveCart } from "@/lib/sale/cart-store";
import { getTaxes } from "@/lib/tax";
import { getTotals } from "@/lib/sale/sale-lib";
import { getPaymentOptions } from "@/lib/sale/sale-model";
import { getStockLocations } from "@/lib/items/repository";
import { getConfig, getConfigBool, loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { customers, dinnerTables, giftcards, people } from "@/db/schema";

export default async function RegisterPage() {
  await requirePermission("sales");
  await loadConfig();
  let cart = await getCart();
  if (!cart.allowTempItems) {
    cart = { ...cart, allowTempItems: true };
    await saveCart(cart);
  }
  const { taxes, itemTaxes } = await getTaxes(
    cart.cart.map((line) => ({
      itemId: line.itemId,
      line: line.line,
      quantity: line.quantity,
      price: line.price,
      discount: line.discount,
      discountType: line.discountType,
      taxCategoryId: line.taxCategoryId,
    })),
    { saleId: cart.saleId, registerMode: cart.mode, customerId: cart.customerId ?? -1 },
  );
  const totals = getTotals(cart, taxes);
  const db = await getDb();
  const locations = await getStockLocations();
  const customerRows = await db
    .select({
      customerId: customers.personId,
      companyName: customers.companyName,
      firstName: people.firstName,
      lastName: people.lastName,
      balance: customers.points,
    })
    .from(customers)
    .innerJoin(people, eq(people.personId, customers.personId))
    .where(eq(customers.deleted, false));
  const dinnerTableRows = await db
    .select()
    .from(dinnerTables)
    .where(eq(dinnerTables.deleted, false));
  const giftcardRows = await db
    .select()
    .from(giftcards)
    .where(eq(giftcards.deleted, false));
  const paymentOptions = await getPaymentOptions(true, true, cart.mode);

  return (
    <Register
      initialCart={cart}
      taxes={taxes}
      itemTaxes={itemTaxes}
      totals={totals}
      locations={locations.map((location) => ({
        locationId: location.locationId,
        locationName: location.locationName,
      }))}
      customers={customerRows.map((customer) => ({
        customerId: customer.customerId,
        label:
          customer.companyName ||
          `${customer.firstName} ${customer.lastName}`.trim(),
        balance: customer.balance ?? 0,
      }))}
      dinnerTables={dinnerTableRows.map((table) => ({
        id: table.dinnerTableId,
        name: table.name,
        status: table.status === 1 ? "occupied" : "free",
      }))}
      paymentOptions={paymentOptions}
      giftcards={giftcardRows.map((card) => ({
        id: card.giftcardId,
        number: card.giftcardNumber ?? "",
        value: Number(card.value),
      }))}
      invoiceFormat={getConfig("sales_invoice_format", "{CO}")}
      taxIncluded={getConfigBool("tax_included", false)}
      dinnerTableEnabled={getConfigBool("dinner_table_enable", false)}
      currencySymbol={getConfig("currency_symbol", "$")}
      emailReceipt={cart.emailReceipt}
      priceWorkOrders={cart.priceWorkOrders}
    />
  );
}
