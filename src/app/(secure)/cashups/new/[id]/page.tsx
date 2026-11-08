import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees, people } from "@/db/schema";
import { getInfo as getCashup } from "@/lib/cashups/repository";
import CashupForm from "@/components/cashups/cashup-form";

export default async function CashupEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("cashups");
  const { id } = await params;
  const cashupId = parseInt(id, 10);
  const cashup = cashupId > 0 ? await getCashup(cashupId) : null;
  const db = await getDb();
  const employeeRows = await db
    .select({ personId: employees.personId, firstName: people.firstName, lastName: people.lastName })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(eq(employees.deleted, false));
  const employees_list = employeeRows.map((e) => ({
    personId: e.personId,
    label: `${e.firstName} ${e.lastName ?? ""}`.trim(),
  }));
  return <CashupForm initial={cashup} employees={employees_list} />;
}