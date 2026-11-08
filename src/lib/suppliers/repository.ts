import { and, desc, eq, ne, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { suppliers, people } from "@/db/schema";

export interface SupplierRow {
  personId: number;
  companyName: string | null;
  accountNumber: string | null;
  agencyName: string | null;
  deleted: boolean;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}

const supplierSelection = {
  personId: suppliers.personId,
  companyName: suppliers.companyName,
  accountNumber: suppliers.accountNumber,
  agencyName: suppliers.agencyName,
  deleted: suppliers.deleted,
  firstName: people.firstName,
  lastName: people.lastName,
  email: people.email,
  phoneNumber: people.phoneNumber,
};

export async function getAll(limit = 25, offset = 0): Promise<SupplierRow[]> {
  const db = await getDb();
  return db
    .select(supplierSelection)
    .from(suppliers)
    .leftJoin(people, eq(people.personId, suppliers.personId))
    .where(eq(suppliers.deleted, false))
    .orderBy(desc(suppliers.personId))
    .limit(limit)
    .offset(offset);
}

export async function getInfo(personId: number): Promise<SupplierRow | null> {
  const db = await getDb();
  const rows = await db
    .select(supplierSelection)
    .from(suppliers)
    .leftJoin(people, eq(people.personId, suppliers.personId))
    .where(eq(suppliers.personId, personId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSearchSuggestions(
  term: string,
  limit = 25,
): Promise<SupplierRow[]> {
  const db = await getDb();
  const pattern = `%${term}%`;
  return db
    .select(supplierSelection)
    .from(suppliers)
    .leftJoin(people, eq(people.personId, suppliers.personId))
    .where(
      and(
        eq(suppliers.deleted, false),
        sql`(${suppliers.companyName} LIKE ${pattern} OR ${people.firstName} LIKE ${pattern} OR ${people.lastName} LIKE ${pattern} OR ${suppliers.accountNumber} LIKE ${pattern})`,
      ),
    )
    .limit(limit);
}

export async function getCategories(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ c: suppliers.agencyName })
    .from(suppliers)
    .where(and(eq(suppliers.deleted, false), ne(suppliers.agencyName, "")));
  return rows.map((r) => r.c ?? "").filter((c): c is string => Boolean(c));
}

export async function getCategoryName(agencyName: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.agencyName, agencyName))
    .limit(1);
  return rows[0]?.agencyName ?? null;
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(suppliers)
    .where(eq(suppliers.deleted, false));
  return Number(rows[0]?.c ?? 0);
}

export async function existsAccountNumber(
  accountNumber: string,
  excludeId?: number,
): Promise<boolean> {
  if (!accountNumber) return false;
  const db = await getDb();
  const rows = await db
    .select({ personId: suppliers.personId })
    .from(suppliers)
    .where(eq(suppliers.accountNumber, accountNumber))
    .limit(1);
  if (rows.length === 0) return false;
  if (excludeId && rows[0].personId === excludeId) return false;
  return true;
}

export async function saveValue(input: {
  personId?: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  companyName: string | null;
  accountNumber: string | null;
  agencyName: string | null;
  category?: number;
  taxId?: string;
}): Promise<number> {
  return withTransaction(async (tx) => {
    let pid = input.personId;
    if (pid) {
      await tx
        .update(people)
        .set({
          firstName: input.firstName,
          lastName: input.lastName ?? "",
          email: input.email ?? "",
          phoneNumber: input.phoneNumber ?? "",
        })
        .where(eq(people.personId, pid));
      await tx
        .update(suppliers)
        .set({
          companyName: input.companyName ?? "",
          accountNumber: input.accountNumber,
          agencyName: input.agencyName ?? "",
          taxId: input.taxId ?? "",
          category: input.category ?? 0,
        })
        .where(eq(suppliers.personId, pid));
    } else {
      const inserted = await insertReturning(tx, people, {
          firstName: input.firstName,
          lastName: input.lastName ?? "",
          phoneNumber: input.phoneNumber ?? "",
          email: input.email ?? "",
          address1: "",
          address2: "",
          city: "",
          state: "",
          zip: "",
          country: "",
          comments: "",
        }, people.personId);
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      pid = result.id;
      await tx.insert(suppliers).values({
        personId: pid,
        companyName: input.companyName ?? "",
        accountNumber: input.accountNumber,
        agencyName: input.agencyName ?? "",
        taxId: input.taxId ?? "",
        deleted: false,
        category: input.category ?? 0,
      });
    }
    return pid;
  });
}

export async function deleteSupplier(personId: number): Promise<void> {
  const db = await getDb();
  await db.update(suppliers).set({ deleted: true }).where(eq(suppliers.personId, personId));
}
