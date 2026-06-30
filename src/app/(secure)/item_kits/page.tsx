import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { itemKits } from "@/db/schema";
import ItemKitTable from "@/components/item_kits/item-kit-table";
import Link from "next/link";

export default async function ItemKitsPage() {
  await requirePermission("item_kits");
  const db = getDbSync();
  const rows = db.select().from(itemKits).all();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Item Kits</h1>
        <Link href="/item_kits/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New Kit</Link>
      </div>
      <div data-testid="data-table">
        <ItemKitTable rows={rows} />
      </div>
    </div>
  );
}