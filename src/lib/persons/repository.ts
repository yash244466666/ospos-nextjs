import { and, eq, like, or, ne, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { people, employees, customers, suppliers, grants, permissions, modules } from "@/db/schema";

export type PersonSubtype = "customer" | "supplier" | "employee";

export interface PersonInput {
  firstName: string;
  lastName?: string | null;
  gender?: number | null;
  email?: string | null;
  phoneNumber?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  comments?: string | null;
}

export interface CustomerInput {
  companyName?: string | null;
  accountNumber?: string | null;
  taxable?: boolean;
  discount?: number;
  discountType?: number;
  points?: number;
}

export interface SupplierInput {
  companyName?: string | null;
  agencyName?: string | null;
  accountNumber?: string | null;
}

export interface EmployeeInput {
  username: string;
  password?: string;
  language?: string | null;
  languageCode?: string | null;
  grants?: { permissionId: string; menuGroup?: string | null }[];
}

export function getPerson(personId: number) {
  const db = getDbSync();
  return db.select().from(people).where(eq(people.personId, personId)).get();
}

export function getCustomer(personId: number) {
  const db = getDbSync();
  const person = db.select().from(people).where(eq(people.personId, personId)).get();
  const customer = db.select().from(customers).where(eq(customers.personId, personId)).get();
  return person && customer ? { ...person, ...customer } : null;
}

export function getSupplier(personId: number) {
  const db = getDbSync();
  const person = db.select().from(people).where(eq(people.personId, personId)).get();
  const supplier = db.select().from(suppliers).where(eq(suppliers.personId, personId)).get();
  return person && supplier ? { ...person, ...supplier } : null;
}

export function getEmployee(personId: number) {
  const db = getDbSync();
  const person = db.select().from(people).where(eq(people.personId, personId)).get();
  const employee = db.select().from(employees).where(eq(employees.personId, personId)).get();
  if (!person || !employee) return null;
  const employeeGrants = db.select().from(grants).where(eq(grants.personId, personId)).all();
  return { ...person, ...employee, grants: employeeGrants };
}

export function saveCustomer(personId: number | null, person: PersonInput, customer: CustomerInput): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    let id = personId;
    if (personId && getPerson(personId)) {
      tx.update(people).set(person).where(eq(people.personId, personId)).run();
      tx.update(customers).set({
        companyName: customer.companyName ?? null,
        accountNumber: customer.accountNumber ?? null,
        taxable: customer.taxable ?? true,
        discount: customer.discount ?? 0,
        discountType: customer.discountType ?? 0,
        points: customer.points ?? 0,
      }).where(eq(customers.personId, personId)).run();
    } else {
      const inserted = tx.insert(people).values(person as typeof people.$inferInsert).returning({ id: people.personId }).get();
      id = inserted.id;
      tx.insert(customers).values({
        personId: id,
        companyName: customer.companyName ?? null,
        accountNumber: customer.accountNumber ?? null,
        taxable: customer.taxable ?? true,
        discount: customer.discount ?? 0,
        discountType: customer.discountType ?? 0,
        points: customer.points ?? 0,
      }).run();
    }
    return id!;
  });
}

export function saveSupplier(personId: number | null, person: PersonInput, supplier: SupplierInput): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    let id = personId;
    if (personId && getPerson(personId)) {
      tx.update(people).set(person).where(eq(people.personId, personId)).run();
      tx.update(suppliers).set({
        companyName: supplier.companyName ?? null,
        agencyName: supplier.agencyName ?? null,
        accountNumber: supplier.accountNumber ?? null,
      }).where(eq(suppliers.personId, personId)).run();
    } else {
      const inserted = tx.insert(people).values(person as typeof people.$inferInsert).returning({ id: people.personId }).get();
      id = inserted.id;
      tx.insert(suppliers).values({
        personId: id,
        companyName: supplier.companyName ?? null,
        agencyName: supplier.agencyName ?? null,
        accountNumber: supplier.accountNumber ?? null,
      }).run();
    }
    return id!;
  });
}

export function saveEmployee(personId: number | null, person: PersonInput, employee: EmployeeInput): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    let id = personId;
    if (personId && getPerson(personId)) {
      tx.update(people).set(person).where(eq(people.personId, personId)).run();
      const updates: Partial<typeof employees.$inferInsert> = {
        username: employee.username,
        language: employee.language ?? null,
        languageCode: employee.languageCode ?? null,
      };
      if (employee.password) updates.password = employee.password;
      tx.update(employees).set(updates).where(eq(employees.personId, personId)).run();
    } else {
      if (!employee.password) throw new Error("Password required for new employee");
      const inserted = tx.insert(people).values(person as typeof people.$inferInsert).returning({ id: people.personId }).get();
      id = inserted.id;
      tx.insert(employees).values({
        personId: id,
        username: employee.username,
        password: employee.password,
        hashVersion: 2,
        language: employee.language ?? null,
        languageCode: employee.languageCode ?? null,
      }).run();
    }
    if (employee.grants) {
      tx.delete(grants).where(eq(grants.personId, id!)).run();
      for (const g of employee.grants) {
        tx.insert(grants).values({
          permissionId: g.permissionId,
          personId: id!,
          menuGroup: (g.menuGroup as "home" | "office" | "both" | null) ?? "both",
        }).run();
      }
    }
    return id!;
  });
}

export function deleteCustomer(personId: number): void {
  const db = getDbSync();
  db.update(customers).set({ deleted: true }).where(eq(customers.personId, personId)).run();
}

export function deleteSupplier(personId: number): void {
  const db = getDbSync();
  db.update(suppliers).set({ deleted: true }).where(eq(suppliers.personId, personId)).run();
}

export function deleteEmployee(personId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    tx.delete(grants).where(eq(grants.personId, personId)).run();
    tx.update(employees).set({ deleted: true }).where(eq(employees.personId, personId)).run();
  });
}

export function searchCustomers(search: string, limit = 25) {
  const db = getDbSync();
  const pattern = `%${search}%`;
  return db.select({
    personId: people.personId,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    phoneNumber: people.phoneNumber,
    companyName: customers.companyName,
    accountNumber: customers.accountNumber,
    discount: customers.discount,
    discountType: customers.discountType,
    taxable: customers.taxable,
    points: customers.points,
  })
    .from(customers)
    .innerJoin(people, eq(people.personId, customers.personId))
    .where(and(
      eq(customers.deleted, false),
      search.trim() === ""
        ? undefined
        : or(
          like(people.firstName, pattern),
          like(people.lastName, pattern),
          like(people.email, pattern),
          like(people.phoneNumber, pattern),
          like(customers.companyName, pattern),
          like(customers.accountNumber, pattern),
        ) ?? undefined
    ))
    .limit(limit)
    .all();
}

export function searchSuppliers(search: string, limit = 25) {
  const db = getDbSync();
  const pattern = `%${search}%`;
  return db.select({
    personId: people.personId,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    phoneNumber: people.phoneNumber,
    companyName: suppliers.companyName,
    agencyName: suppliers.agencyName,
    accountNumber: suppliers.accountNumber,
  })
    .from(suppliers)
    .innerJoin(people, eq(people.personId, suppliers.personId))
    .where(and(
      eq(suppliers.deleted, false),
      search.trim() === ""
        ? undefined
        : or(
          like(people.firstName, pattern),
          like(people.lastName, pattern),
          like(people.email, pattern),
          like(suppliers.companyName, pattern),
          like(suppliers.agencyName, pattern),
          like(suppliers.accountNumber, pattern),
        ) ?? undefined
    ))
    .limit(limit)
    .all();
}

export function searchEmployees(search: string, limit = 25) {
  const db = getDbSync();
  const pattern = `%${search}%`;
  return db.select({
    personId: people.personId,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    username: employees.username,
    language: employees.language,
    languageCode: employees.languageCode,
  })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(and(
      eq(employees.deleted, false),
      search.trim() === ""
        ? undefined
        : or(
          like(people.firstName, pattern),
          like(people.lastName, pattern),
          like(people.email, pattern),
          like(employees.username, pattern),
        ) ?? undefined
    ))
    .limit(limit)
    .all();
}

export function suggestCustomers(search: string, limit = 25) {
  return searchCustomers(search, limit).map((c) => ({
    value: c.personId,
    label: c.companyName || `${c.firstName} ${c.lastName ?? ""}`.trim(),
    sublabel: c.email ?? "",
  }));
}

export function listAllPermissions() {
  const db = getDbSync();
  return db.select({
    permissionId: permissions.permissionId,
    moduleId: permissions.moduleId,
    moduleName: modules.nameLangKey,
  })
    .from(permissions)
    .innerJoin(modules, eq(modules.moduleId, permissions.moduleId))
    .all();
}

export function listEmployeeGrants(personId: number) {
  const db = getDbSync();
  return db.select().from(grants).where(eq(grants.personId, personId)).all();
}

export function emailExists(email: string, excludePersonId: number | null): boolean {
  const db = getDbSync();
  const row = db.select({ id: people.personId })
    .from(people)
    .where(and(eq(people.email, email), excludePersonId ? sql`${people.personId} != ${excludePersonId}` : sql`true`))
    .get();
  return !!row;
}

export function accountNumberExists(accountNumber: string, excludePersonId: number | null): boolean {
  const db = getDbSync();
  if (!accountNumber) return false;
  const c = db.select({ id: customers.personId })
    .from(customers)
    .where(and(eq(customers.accountNumber, accountNumber), excludePersonId ? sql`${customers.personId} != ${excludePersonId}` : sql`true`))
    .get();
  if (c) return true;
  const s = db.select({ id: suppliers.personId })
    .from(suppliers)
    .where(and(eq(suppliers.accountNumber, accountNumber), excludePersonId ? sql`${suppliers.personId} != ${excludePersonId}` : sql`true`))
    .get();
  return !!s;
}

export function usernameExists(username: string, excludePersonId: number | null): boolean {
  const db = getDbSync();
  const row = db.select({ id: employees.personId })
    .from(employees)
    .where(and(eq(employees.username, username), excludePersonId ? sql`${employees.personId} != ${excludePersonId}` : sql`true`))
    .get();
  return !!row;
}