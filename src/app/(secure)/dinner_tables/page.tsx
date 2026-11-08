import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dinnerTables } from "@/db/schema";
import DinnerTablesTable from "@/components/dinner_tables/dinner-tables-table";
import Link from "next/link";

export default async function DinnerTablesPage() {
  await requirePermission("config");
  const db = await getDb();
  const rows = await db.select().from(dinnerTables).where(eq(dinnerTables.deleted, false));
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Dinner Tables</h1>
        <Link href="/dinner_tables/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New</Link>
      </div>
      <div data-testid="data-table">
        <DinnerTablesTable rows={rows} />
      </div>
    </div>
  );
}