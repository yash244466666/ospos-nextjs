import { eq, and, like, desc, sql, ne } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { suppliers, people } from "@/db/schema";

export interface SupplierRow {
  personId: number;
  companyName: string | null;
  accountNumber: string | null;
  agencyName: string | null;
  deleted: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
}

export function getAll(limit = 25, offset = 0): SupplierRow[] {
  const db = getDbSync();
  const rows = db.select({
    personId: suppliers.personId,
    companyName: suppliers.companyName,
    accountNumber: suppliers.accountNumber,
    agencyName: suppliers.agencyName,
    deleted: suppliers.deleted,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    phoneNumber: people.phoneNumber,
  })
    .from(suppliers)
    .leftJoin(people, eq(people.personId, suppliers.personId))
    .where(eq(suppliers.deleted, false))
    .orderBy(desc(suppliers.personId))
    .limit(limit).offset(offset).all() as SupplierRow[];
  return rows;
}

export function getInfo(personId: number): SupplierRow | null {
  const db = getDbSync();
  const row = db.select({
    personId: suppliers.personId,
    companyName: suppliers.companyName,
    accountNumber: suppliers.accountNumber,
    agencyName: suppliers.agencyName,
    deleted: suppliers.deleted,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    phoneNumber: people.phoneNumber,
  })
    .from(suppliers)
    .leftJoin(people, eq(people.personId, suppliers.personId))
    .where(eq(suppliers.personId, personId))
    .get() as SupplierRow | undefined;
  return row ?? null;
}

export function getSearchSuggestions(term: string, limit = 25): SupplierRow[] {
  const db = getDbSync();
  const pattern = `%${term}%`;
  return db.select({
    personId: suppliers.personId,
    companyName: suppliers.companyName,
    accountNumber: suppliers.accountNumber,
    agencyName: suppliers.agencyName,
    deleted: suppliers.deleted,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    phoneNumber: people.phoneNumber,
  })
    .from(suppliers)
    .leftJoin(people, eq(people.personId, suppliers.personId))
    .where(and(
      eq(suppliers.deleted, false),
      sql`(${suppliers.companyName} LIKE ${pattern} OR ${people.firstName} LIKE ${pattern} OR ${people.lastName} LIKE ${pattern} OR ${suppliers.accountNumber} LIKE ${pattern})`
    ))
    .limit(limit).all() as SupplierRow[];
}

export function getCategories(): string[] {
  const db = getDbSync();
  const rows = db.selectDistinct({ c: suppliers.agencyName })
    .from(suppliers)
    .where(and(eq(suppliers.deleted, false), ne(suppliers.agencyName, "")))
    .all();
  return rows.map((r) => r.c ?? "").filter(Boolean) as string[];
}

export function getCategoryName(agencyName: string): string | null {
  const db = getDbSync();
  const row = db.select().from(suppliers).where(eq(suppliers.agencyName, agencyName)).get();
  return row?.agencyName ?? null;
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` })
    .from(suppliers).where(eq(suppliers.deleted, false)).get();
  return r?.c ?? 0;
}

export function existsAccountNumber(accountNumber: string, excludeId?: number): boolean {
  if (!accountNumber) return false;
  const db = getDbSync();
  const row = db.select().from(suppliers).where(eq(suppliers.accountNumber, accountNumber)).get();
  if (!row) return false;
  if (excludeId && row.personId === excludeId) return false;
  return true;
}

export function saveValue(input: {
  personId?: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  companyName: string | null;
  accountNumber: string | null;
  agencyName: string | null;
}): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    let pid = input.personId;
    if (pid) {
      tx.update(people).set({
        firstName: input.firstName, lastName: input.lastName,
        email: input.email, phoneNumber: input.phoneNumber,
      }).where(eq(people.personId, pid)).run();
      tx.update(suppliers).set({
        companyName: input.companyName, accountNumber: input.accountNumber, agencyName: input.agencyName,
      }).where(eq(suppliers.personId, pid)).run();
    } else {
      const inserted = tx.insert(people).values({
        firstName: input.firstName, lastName: input.lastName, email: input.email, phoneNumber: input.phoneNumber,
      }).returning({ id: people.personId }).get();
      pid = inserted.id;
      tx.insert(suppliers).values({
        personId: pid, companyName: input.companyName, accountNumber: input.accountNumber,
        agencyName: input.agencyName, deleted: false,
      }).run();
    }
    return pid!;
  });
}

export function deleteSupplier(personId: number): void {
  getDbSync().update(suppliers).set({ deleted: true })
    .where(eq(suppliers.personId, personId)).run();
}

void like;
