import { requirePermission } from "@/lib/auth/with-permission";
import Register from "@/components/sales/register";
import { getCart } from "@/lib/sale/cart-store";
import { getTaxes } from "@/lib/tax";
import { getCartTotals } from "@/lib/sale/types";
import { getConfig, getConfigBool } from "@/lib/config";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { stockLocations, customers, people, giftcards, dinnerTables } from "@/db/schema";
import { getPaymentOptions } from "@/lib/sale/sale-model";
import { getAll as listDinnerTables } from "@/lib/dinner_tables/repository";

export default async function RegisterPage() {
  await requirePermission("sales");
  const cart = await getCart();
  const { taxes, itemTaxes } = getTaxes(cart.cart, cart.customerId, cart.mode);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  const totals = getCartTotals(cart.cart, taxTotal, getConfigBool("tax_included", false));
  const db = getDbSync();
  const locations = db.select().from(stockLocations).where(eq(stockLocations.deleted, false)).all();
  const customerRows = db
    .select({ customerId: customers.personId, companyName: customers.companyName, firstName: people.firstName, lastName: people.lastName })
    .from(customers)
    .innerJoin(people, eq(people.personId, customers.personId))
    .where(eq(customers.deleted, false))
    .all();
  const customersList = customerRows.map((c) => ({
    customerId: c.customerId,
    label: c.companyName || `${c.firstName} ${c.lastName}`.trim(),
    balance: 0,
  }));
  const dinnerTableRows = listDinnerTables().map((t) => ({
    id: t.dinnerTableId,
    name: t.name,
    status: t.status === 1 ? "occupied" : "free",
  }));
  const giftcardRows = db.select().from(giftcards).where(eq(giftcards.deleted, false)).all().map((g) => ({
    id: g.giftcardId,
    number: g.giftcardNumber,
    value: g.value,
  }));
  const invoiceFormat = getConfig("sales_invoice_format", "{CO}");
  const paymentOptions = getPaymentOptions(true, true);
  return (
    <Register
      initialCart={cart}
      taxes={taxes}
      itemTaxes={itemTaxes}
      totals={totals}
      locations={locations.map((l) => ({ locationId: l.locationId, locationName: l.locationName }))}
      customers={customersList}
      dinnerTables={dinnerTableRows}
      paymentOptions={paymentOptions}
      giftcards={giftcardRows}
      invoiceFormat={invoiceFormat}
      taxIncluded={getConfigBool("tax_included", false)}
      dinnerTableEnabled={getConfigBool("dinner_table_enable", false)}
      currencySymbol={getConfig("currency_symbol", "$")}
      emailReceipt={cart.emailReceipt}
      priceWorkOrders={cart.priceWorkOrders}
    />
  );
}
