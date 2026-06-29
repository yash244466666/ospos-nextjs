import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { cashups, employees, people } from "@/db/schema";
import CashupForm from "@/components/cashups/cashup-form";

export default async function CashupEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("cashups");
  const { id } = await params;
  const cashupId = parseInt(id, 10);
  const db = getDbSync();
  const cashup = cashupId > 0 ? (db.select().from(cashups).where(eq(cashups.cashupId, cashupId)).get() ?? null) : null;
  const employeeRows = db
    .select({ personId: employees.personId, firstName: people.firstName, lastName: people.lastName })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(eq(employees.deleted, false))
    .all();
  const employees_list = employeeRows.map((e) => ({
    personId: e.personId,
    label: `${e.firstName} ${e.lastName ?? ""}`.trim(),
  }));
  return <CashupForm initial={cashup} employees={employees_list} />;
}