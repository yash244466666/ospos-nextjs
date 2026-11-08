import { and, asc, eq, sql } from "drizzle-orm";
import { insertIgnoreRow, insertReturning } from "@/lib/db/insert";
import { getDb, type Db } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { employees, people, grants } from "@/db/schema";

export interface EmployeeRow {
  personId: number;
  username: string;
  password: string;
  hashVersion: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  deleted: boolean;
}

export interface EmployeeInfo {
  personId: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  deleted: boolean;
}

function baseQuery(db: Db) {
  return db
    .select({
      personId: employees.personId,
      username: employees.username,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phoneNumber: people.phoneNumber,
      deleted: employees.deleted,
    })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId));
}

export async function getAll(limit = 25, offset = 0): Promise<EmployeeInfo[]> {
  const db = await getDb();
  return baseQuery(db)
    .where(eq(employees.deleted, false))
    .orderBy(asc(employees.username))
    .limit(limit)
    .offset(offset);
}

export async function getInfo(personId: number): Promise<EmployeeInfo | null> {
  const db = await getDb();
  const rows = await baseQuery(db)
    .where(eq(employees.personId, personId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getInfoByUsername(username: string): Promise<EmployeeInfo | null> {
  const db = await getDb();
  const rows = await baseQuery(db)
    .where(and(eq(employees.username, username), eq(employees.deleted, false)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEmployee(personId: number): Promise<EmployeeRow | null> {
  const db = await getDb();
  const rows = await db
    .select({
      personId: employees.personId,
      username: employees.username,
      password: employees.password,
      hashVersion: employees.hashVersion,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phoneNumber: people.phoneNumber,
      deleted: employees.deleted,
    })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(eq(employees.personId, personId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLogguedInEmployeeInfo(personId: number): Promise<EmployeeInfo | null> {
  return getInfo(personId);
}

export async function search(term: string, limit = 25): Promise<EmployeeInfo[]> {
  const db = await getDb();
  return baseQuery(db)
    .where(
      and(
        eq(employees.deleted, false),
        sql`(${employees.username} LIKE ${`%${term}%`} OR ${people.firstName} LIKE ${`%${term}%`} OR ${people.lastName} LIKE ${`%${term}%`})`,
      ),
    )
    .orderBy(asc(employees.username))
    .limit(limit);
}

export async function getSearchSuggestions(
  term: string,
  limit = 25,
): Promise<EmployeeInfo[]> {
  return search(term, limit);
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(employees)
    .where(eq(employees.deleted, false));
  return Number(rows[0]?.c ?? 0);
}

export async function usernameExists(
  username: string,
  excludeId?: number,
): Promise<boolean> {
  if (!username) return false;
  const db = await getDb();
  const rows = await db
    .select({ personId: employees.personId })
    .from(employees)
    .where(eq(employees.username, username))
    .limit(1);
  if (rows.length === 0) return false;
  if (excludeId && rows[0].personId === excludeId) return false;
  return true;
}

export async function checkPassword(personId: number, password: string): Promise<boolean> {
  const emp = await getEmployee(personId);
  if (!emp) return false;
  return emp.password === password;
}

export async function changePassword(
  personId: number,
  hashedPassword: string,
  hashVersion = 2,
): Promise<void> {
  const db = await getDb();
  await db
    .update(employees)
    .set({ password: hashedPassword, hashVersion })
    .where(eq(employees.personId, personId));
}

export async function getEmployeeGrants(personId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ permissionId: grants.permissionId })
    .from(grants)
    .where(eq(grants.personId, personId));
  return rows.map((r) => r.permissionId);
}

export async function saveEmployee(input: {
  personId?: number;
  username: string;
  password: string;
  hashVersion: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  grants: string[];
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
        .update(employees)
        .set({
          username: input.username,
          password: input.password,
          hashVersion: input.hashVersion,
        })
        .where(eq(employees.personId, pid));
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
      await tx.insert(employees).values({
        personId: pid,
        username: input.username,
        password: input.password,
        hashVersion: input.hashVersion,
        deleted: false,
      });
    }
    await tx.delete(grants).where(eq(grants.personId, pid!));
    for (const permissionId of input.grants) {
      await insertIgnoreRow(tx, grants, { personId: pid!, permissionId });
    }
    return pid!;
  });
}

export async function deleteEmployee(personId: number): Promise<void> {
  const db = await getDb();
  await db.update(employees).set({ deleted: true }).where(eq(employees.personId, personId));
}

export async function deleteList(ids: number[]): Promise<void> {
  const db = await getDb();
  for (const id of ids) {
    await db.update(employees).set({ deleted: true }).where(eq(employees.personId, id));
  }
}
