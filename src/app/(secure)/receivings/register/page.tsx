import { requirePermission } from "@/lib/auth/with-permission";
import Register from "@/components/receivings/register";
import { getReceivingCart } from "@/lib/receiving/receiving-store";
import { getReceivingTotals } from "@/lib/receiving/receiving-lib";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { stockLocations, suppliers, people } from "@/db/schema";

export default async function ReceivingsRegisterPage() {
  await requirePermission("receivings");
  const cart = await getReceivingCart();
  const totals = getReceivingTotals(cart.cart);
  const db = getDbSync();
  const locations = db.select().from(stockLocations).where(eq(stockLocations.deleted, false)).all();
  const supplierRows = db
    .select({ supplierId: suppliers.personId, companyName: suppliers.companyName, firstName: people.firstName, lastName: people.lastName })
    .from(suppliers)
    .innerJoin(people, eq(people.personId, suppliers.personId))
    .where(eq(suppliers.deleted, false))
    .all();
  const suppliersList = supplierRows.map((s) => ({
    supplierId: s.supplierId,
    label: s.companyName || `${s.firstName} ${s.lastName ?? ""}`.trim(),
  }));
  return (
    <Register
      initialCart={cart}
      totals={totals}
      locations={locations.map((l) => ({ locationId: l.locationId, locationName: l.locationName }))}
      suppliers={suppliersList}
    />
  );
}