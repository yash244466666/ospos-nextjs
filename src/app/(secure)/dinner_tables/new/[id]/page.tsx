import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dinnerTables } from "@/db/schema";
import DinnerTablesForm from "@/components/dinner_tables/dinner-tables-form";

export default async function DinnerTableEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("config");
  const { id } = await params;
  const dinnerTableId = parseInt(id, 10);
  const db = await getDb();
  const row =
    dinnerTableId > 0
      ? ((await db
          .select()
          .from(dinnerTables)
          .where(eq(dinnerTables.dinnerTableId, dinnerTableId))
          .limit(1))[0] ?? null)
      : null;
  return <DinnerTablesForm initial={row} />;
}