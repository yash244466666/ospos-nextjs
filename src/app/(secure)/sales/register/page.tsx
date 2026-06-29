import { requirePermission } from "@/lib/auth/with-permission";
import Register from "@/components/sales/register";
import { getCart } from "@/lib/sale/cart-store";
import { getTaxes } from "@/lib/tax";
import { getCartTotals } from "@/lib/sale/types";
import { getConfig, getConfigBool } from "@/lib/config";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { stockLocations, customers, people } from "@/db/schema";

export default async function RegisterPage() {
  await requirePermission("sales");
  const cart = await getCart();
  const { taxes, itemTaxes } = getTaxes(cart.cart);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  const totals = getCartTotals(cart.cart, taxTotal, getConfigBool("tax_included", false));
  const db = getDbSync();
  const locations = db.select().from(stockLocations).where(eq(stockLocations.deleted, false)).all();
  const customerRows = db
    .select({ customerId: customers.personId, companyName: customers.companyName, first_name: people.firstName, last_name: people.lastName })
    .from(customers)
    .innerJoin(people, eq(people.personId, customers.personId))
    .where(eq(customers.deleted, false))
    .all();
  const customers_list = customerRows.map((c) => ({
    customerId: c.customerId,
    label: c.companyName || `${c.first_name} ${c.last_name}`.trim(),
  }));
  const invoiceFormat = getConfig("sales_invoice_format", "{CO}");
  return (
    <Register
      initialCart={cart}
      taxes={taxes}
      itemTaxes={itemTaxes}
      totals={totals}
      locations={locations.map((l) => ({ locationId: l.locationId, locationName: l.locationName }))}
      customers={customers_list}
      invoiceFormat={invoiceFormat}
      taxIncluded={getConfigBool("tax_included", false)}
      dinnerTableEnabled={getConfigBool("dinner_table_enable", false)}
      currencySymbol={getConfig("currency_symbol", "$")}
    />
  );
}