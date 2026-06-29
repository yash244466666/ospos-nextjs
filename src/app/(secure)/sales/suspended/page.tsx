import { requirePermission } from "@/lib/auth/with-permission";
import { getSuspendedSales } from "@/lib/sale/sale-model";
import SuspendedTable from "@/components/sales/suspended-table";

export default async function SuspendedPage() {
  await requirePermission("sales");
  const sales = getSuspendedSales();
  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">Suspended Sales</h1>
      <SuspendedTable sales={sales} />
    </div>
  );
}