import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import Register from "@/components/receivings/register";
import { getReceivingCart } from "@/lib/receiving/receiving-store";
import { getTotal } from "@/lib/receiving/receiving-lib";
import { getStockLocations } from "@/lib/items/repository";
import { loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { people, suppliers } from "@/db/schema";

export default async function ReceivingsRegisterPage() {
  await requirePermission("receivings");
  await loadConfig();
  const cart = await getReceivingCart();
  const total = getTotal(cart);
  const locations = await getStockLocations();
  const db = await getDb();
  const supplierRows = await db
    .select({
      supplierId: suppliers.personId,
      companyName: suppliers.companyName,
      firstName: people.firstName,
      lastName: people.lastName,
    })
    .from(suppliers)
    .innerJoin(people, eq(people.personId, suppliers.personId))
    .where(eq(suppliers.deleted, false));
  return (
    <Register
      initialCart={cart}
      total={total}
      locations={locations.map((location) => ({
        locationId: location.locationId,
        locationName: location.locationName,
      }))}
      suppliers={supplierRows.map((supplier) => ({
        supplierId: supplier.supplierId,
        label:
          supplier.companyName ||
          `${supplier.firstName} ${supplier.lastName}`.trim(),
      }))}
    />
  );
}
