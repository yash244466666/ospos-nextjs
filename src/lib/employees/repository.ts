import { eq, and, like, desc, sql, asc, ne, or } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { employees, people, modules, grants } from "@/db/schema";

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

export function getAll(limit = 25, offset = 0): EmployeeInfo[] {
  return baseQuery()
    .where(eq(employees.deleted, false))
    .orderBy(asc(employees.username))
    .limit(limit).offset(offset).all() as EmployeeInfo[];
}

export function getInfo(personId: number): EmployeeInfo | null {
  return (baseQuery().where(eq(employees.personId, personId)).get() as EmployeeInfo) ?? null;
}

export function getInfoByUsername(username: string): EmployeeInfo | null {
  return (baseQuery().where(and(eq(employees.username, username), eq(employees.deleted, false))).get() as EmployeeInfo) ?? null;
}

function baseQuery() {
  const db = getDbSync();
  return db.select({
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

export function getEmployee(personId: number): EmployeeRow | null {
  const db = getDbSync();
  const row = db.select({
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
    .get();
  return (row as EmployeeRow) ?? null;
}

export function getLogguedInEmployeeInfo(personId: number): EmployeeInfo | null {
  return getInfo(personId);
}

export function search(term: string, limit = 25): EmployeeInfo[] {
  return baseQuery()
    .where(and(eq(employees.deleted, false), sql`(${employees.username} LIKE ${`%${term}%`} OR ${people.firstName} LIKE ${`%${term}%`} OR ${people.lastName} LIKE ${`%${term}%`})`))
    .orderBy(asc(employees.username))
    .limit(limit).all() as EmployeeInfo[];
}

export function getSearchSuggestions(term: string, limit = 25): EmployeeInfo[] {
  return search(term, limit);
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` }).from(employees)
    .where(eq(employees.deleted, false)).get();
  return r?.c ?? 0;
}

export function usernameExists(username: string, excludeId?: number): boolean {
  if (!username) return false;
  const db = getDbSync();
  const row = db.select().from(employees).where(eq(employees.username, username)).get();
  if (!row) return false;
  if (excludeId && row.personId === excludeId) return false;
  return true;
}

export function checkPassword(personId: number, password: string): boolean {
  const emp = getEmployee(personId);
  if (!emp) return false;
  return emp.password === password;
}

export function changePassword(personId: number, hashedPassword: string, hashVersion = 2): void {
  getDbSync().update(employees).set({ password: hashedPassword, hashVersion })
    .where(eq(employees.personId, personId)).run();
}

export function getEmployeeGrants(personId: number): string[] {
  const db = getDbSync();
  const rows = db.select({ permissionId: grants.permissionId })
    .from(grants).where(eq(grants.personId, personId)).all();
  return rows.map((r) => r.permissionId);
}

export function saveEmployee(input: {
  personId?: number;
  username: string;
  password: string;
  hashVersion: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  grants: string[];
}): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    let pid = input.personId;
    if (pid) {
      tx.update(people).set({
        firstName: input.firstName, lastName: input.lastName, email: input.email, phoneNumber: input.phoneNumber,
      }).where(eq(people.personId, pid)).run();
      tx.update(employees).set({
        username: input.username, password: input.password, hashVersion: input.hashVersion,
      }).where(eq(employees.personId, pid)).run();
    } else {
      const inserted = tx.insert(people).values({
        firstName: input.firstName, lastName: input.lastName, email: input.email, phoneNumber: input.phoneNumber,
      }).returning({ id: people.personId }).get();
      pid = inserted.id;
      tx.insert(employees).values({
        personId: pid, username: input.username, password: input.password,
        hashVersion: input.hashVersion, deleted: false,
      }).run();
    }
    tx.delete(grants).where(eq(grants.personId, pid!)).run();
    for (const permissionId of input.grants) {
      tx.insert(grants).values({ personId: pid!, permissionId }).onConflictDoNothing().run();
    }
    return pid!;
  });
}

export function deleteEmployee(personId: number): void {
  getDbSync().update(employees).set({ deleted: true })
    .where(eq(employees.personId, personId)).run();
}

export function deleteList(ids: number[]): void {
  const db = getDbSync();
  for (const id of ids) db.update(employees).set({ deleted: true })
    .where(eq(employees.personId, id)).run();
}

void like;
void asc;
void desc;
void ne;
void or;
void modules;
