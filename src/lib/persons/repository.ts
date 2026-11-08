import { and, eq, like, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import {
  people,
  employees,
  customers,
  suppliers,
  grants,
  permissions,
  modules,
} from "@/db/schema";
import { toDbDecimal, type DecimalInput } from "@/lib/money";
import { nowDb } from "@/lib/datetime";
import { timezone } from "@/lib/config";

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
  discount?: DecimalInput;
  discountType?: number;
  points?: number | null;
  taxId?: string;
  salesTaxCodeId?: number | null;
  packageId?: number | null;
  employeeId?: number;
  consent?: boolean;
  date?: string;
}

export interface SupplierInput {
  companyName?: string | null;
  agencyName?: string | null;
  accountNumber?: string | null;
  taxId?: string;
  category?: number;
}

export interface EmployeeInput {
  username: string;
  password?: string;
  language?: string | null;
  languageCode?: string | null;
  grants?: { permissionId: string; menuGroup?: string | null }[];
}

/** `ospos_people` columns are NOT NULL; normalize optional input at the boundary. */
function personValues(person: PersonInput) {
  return {
    firstName: person.firstName,
    lastName: person.lastName ?? "",
    gender: person.gender ?? null,
    email: person.email ?? "",
    phoneNumber: person.phoneNumber ?? "",
    address1: person.address1 ?? "",
    address2: person.address2 ?? "",
    city: person.city ?? "",
    state: person.state ?? "",
    zip: person.zip ?? "",
    country: person.country ?? "",
    comments: person.comments ?? "",
  };
}

export async function getPerson(personId: number) {
  const db = await getDb();
  const rows = await db.select().from(people).where(eq(people.personId, personId)).limit(1);
  return rows[0];
}

export async function getCustomer(personId: number) {
  const db = await getDb();
  const personRows = await db
    .select()
    .from(people)
    .where(eq(people.personId, personId))
    .limit(1);
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.personId, personId))
    .limit(1);
  const person = personRows[0];
  const customer = customerRows[0];
  return person && customer ? { ...person, ...customer } : null;
}

export async function getSupplier(personId: number) {
  const db = await getDb();
  const personRows = await db
    .select()
    .from(people)
    .where(eq(people.personId, personId))
    .limit(1);
  const supplierRows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.personId, personId))
    .limit(1);
  const person = personRows[0];
  const supplier = supplierRows[0];
  return person && supplier ? { ...person, ...supplier } : null;
}

export async function getEmployee(personId: number) {
  const db = await getDb();
  const personRows = await db
    .select()
    .from(people)
    .where(eq(people.personId, personId))
    .limit(1);
  const employeeRows = await db
    .select()
    .from(employees)
    .where(eq(employees.personId, personId))
    .limit(1);
  const person = personRows[0];
  const employee = employeeRows[0];
  if (!person || !employee) return null;
  const employeeGrants = await db
    .select()
    .from(grants)
    .where(eq(grants.personId, personId));
  return { ...person, ...employee, grants: employeeGrants };
}

export async function saveCustomer(
  personId: number | null,
  person: PersonInput,
  customer: CustomerInput,
): Promise<number> {
  return withTransaction(async (tx) => {
    let id = personId;
    if (personId) {
      const existing = await tx
        .select({ personId: people.personId })
        .from(people)
        .where(eq(people.personId, personId))
        .limit(1);
      if (existing.length > 0) {
        await tx.update(people).set(personValues(person)).where(eq(people.personId, personId));
        await tx
          .update(customers)
          .set({
            companyName: customer.companyName ?? null,
            accountNumber: customer.accountNumber ?? null,
            taxable: customer.taxable ?? true,
            taxId: customer.taxId ?? "",
            salesTaxCodeId: customer.salesTaxCodeId ?? null,
            packageId: customer.packageId ?? null,
            points: customer.points ?? null,
            discount: toDbDecimal(customer.discount ?? 0, 2),
            discountType: customer.discountType ?? 0,
            consent: customer.consent ?? false,
          })
          .where(eq(customers.personId, personId));
        return personId;
      }
    }

    const inserted = await tx
      .insert(people)
      .values(personValues(person))
      .returning({ id: people.personId });
    const result = Array.isArray(inserted) ? inserted[0] : inserted;
    id = result.id;
    await tx.insert(customers).values({
      personId: id,
      companyName: customer.companyName ?? null,
      accountNumber: customer.accountNumber ?? null,
      taxable: customer.taxable ?? true,
      taxId: customer.taxId ?? "",
      salesTaxCodeId: customer.salesTaxCodeId ?? null,
      packageId: customer.packageId ?? null,
      points: customer.points ?? null,
      deleted: false,
      discount: toDbDecimal(customer.discount ?? 0, 2),
      discountType: customer.discountType ?? 0,
      date: customer.date ?? nowDb(timezone()),
      employeeId: customer.employeeId ?? 0,
      consent: customer.consent ?? false,
    });
    return id;
  });
}

export async function saveSupplier(
  personId: number | null,
  person: PersonInput,
  supplier: SupplierInput,
): Promise<number> {
  return withTransaction(async (tx) => {
    let id = personId;
    if (personId) {
      const existing = await tx
        .select({ personId: people.personId })
        .from(people)
        .where(eq(people.personId, personId))
        .limit(1);
      if (existing.length > 0) {
        await tx.update(people).set(personValues(person)).where(eq(people.personId, personId));
        await tx
          .update(suppliers)
          .set({
            companyName: supplier.companyName ?? "",
            agencyName: supplier.agencyName ?? "",
            accountNumber: supplier.accountNumber ?? null,
            taxId: supplier.taxId ?? "",
            category: supplier.category ?? 0,
          })
          .where(eq(suppliers.personId, personId));
        return personId;
      }
    }

    const inserted = await tx
      .insert(people)
      .values(personValues(person))
      .returning({ id: people.personId });
    const result = Array.isArray(inserted) ? inserted[0] : inserted;
    id = result.id;
    await tx.insert(suppliers).values({
      personId: id,
      companyName: supplier.companyName ?? "",
      agencyName: supplier.agencyName ?? "",
      accountNumber: supplier.accountNumber ?? null,
      taxId: supplier.taxId ?? "",
      deleted: false,
      category: supplier.category ?? 0,
    });
    return id;
  });
}

export async function saveEmployee(
  personId: number | null,
  person: PersonInput,
  employee: EmployeeInput,
): Promise<number> {
  return withTransaction(async (tx) => {
    let id = personId;
    let updated = false;
    if (personId) {
      const existing = await tx
        .select({ personId: people.personId })
        .from(people)
        .where(eq(people.personId, personId))
        .limit(1);
      if (existing.length > 0) {
        await tx.update(people).set(personValues(person)).where(eq(people.personId, personId));
        const updates: Partial<typeof employees.$inferInsert> = {
          username: employee.username,
          language: employee.language ?? null,
          languageCode: employee.languageCode ?? null,
        };
        if (employee.password) updates.password = employee.password;
        await tx.update(employees).set(updates).where(eq(employees.personId, personId));
        id = personId;
        updated = true;
      }
    }

    if (!updated) {
      if (!employee.password) throw new Error("Password required for new employee");
      const inserted = await tx
        .insert(people)
        .values(personValues(person))
        .returning({ id: people.personId });
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      id = result.id;
      await tx.insert(employees).values({
        personId: id,
        username: employee.username,
        password: employee.password,
        hashVersion: 2,
        language: employee.language ?? null,
        languageCode: employee.languageCode ?? null,
      });
    }

    if (employee.grants) {
      await tx.delete(grants).where(eq(grants.personId, id!));
      for (const g of employee.grants) {
        await tx.insert(grants).values({
          permissionId: g.permissionId,
          personId: id!,
          menuGroup: g.menuGroup ?? "home",
        });
      }
    }
    return id!;
  });
}

export async function deleteCustomer(personId: number): Promise<void> {
  const db = await getDb();
  await db.update(customers).set({ deleted: true }).where(eq(customers.personId, personId));
}

export async function deleteSupplier(personId: number): Promise<void> {
  const db = await getDb();
  await db.update(suppliers).set({ deleted: true }).where(eq(suppliers.personId, personId));
}

export async function deleteEmployee(personId: number): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.delete(grants).where(eq(grants.personId, personId));
    await tx.update(employees).set({ deleted: true }).where(eq(employees.personId, personId));
  });
}

function searchCondition(
  search: string,
  columns: Parameters<typeof or>[0][],
) {
  return search.trim() === "" ? undefined : or(...columns);
}

export async function searchCustomers(search: string, limit = 25) {
  const db = await getDb();
  const pattern = `%${search}%`;
  return db
    .select({
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
    .where(
      and(
        eq(customers.deleted, false),
        searchCondition(search, [
          like(people.firstName, pattern),
          like(people.lastName, pattern),
          like(people.email, pattern),
          like(people.phoneNumber, pattern),
          like(customers.companyName, pattern),
          like(customers.accountNumber, pattern),
        ]),
      ),
    )
    .limit(limit);
}

export async function searchSuppliers(search: string, limit = 25) {
  const db = await getDb();
  const pattern = `%${search}%`;
  return db
    .select({
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
    .where(
      and(
        eq(suppliers.deleted, false),
        searchCondition(search, [
          like(people.firstName, pattern),
          like(people.lastName, pattern),
          like(people.email, pattern),
          like(suppliers.companyName, pattern),
          like(suppliers.agencyName, pattern),
          like(suppliers.accountNumber, pattern),
        ]),
      ),
    )
    .limit(limit);
}

export async function searchEmployees(search: string, limit = 25) {
  const db = await getDb();
  const pattern = `%${search}%`;
  return db
    .select({
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
    .where(
      and(
        eq(employees.deleted, false),
        searchCondition(search, [
          like(people.firstName, pattern),
          like(people.lastName, pattern),
          like(people.email, pattern),
          like(employees.username, pattern),
        ]),
      ),
    )
    .limit(limit);
}

export async function suggestCustomers(search: string, limit = 25) {
  const rows = await searchCustomers(search, limit);
  return rows.map((c) => ({
    value: c.personId,
    label: c.companyName || `${c.firstName} ${c.lastName ?? ""}`.trim(),
    sublabel: c.email ?? "",
  }));
}

export async function listAllPermissions() {
  const db = await getDb();
  return db
    .select({
      permissionId: permissions.permissionId,
      moduleId: permissions.moduleId,
      moduleName: modules.nameLangKey,
    })
    .from(permissions)
    .innerJoin(modules, eq(modules.moduleId, permissions.moduleId));
}

export async function listEmployeeGrants(personId: number) {
  const db = await getDb();
  return db.select().from(grants).where(eq(grants.personId, personId));
}

export async function emailExists(
  email: string,
  excludePersonId: number | null,
): Promise<boolean> {
  const db = await getDb();
  const conditions = [eq(people.email, email)];
  if (excludePersonId) conditions.push(ne(people.personId, excludePersonId));
  const rows = await db
    .select({ id: people.personId })
    .from(people)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

export async function accountNumberExists(
  accountNumber: string,
  excludePersonId: number | null,
): Promise<boolean> {
  if (!accountNumber) return false;
  const db = await getDb();
  const customerConditions = [eq(customers.accountNumber, accountNumber)];
  if (excludePersonId) customerConditions.push(ne(customers.personId, excludePersonId));
  const customerRows = await db
    .select({ id: customers.personId })
    .from(customers)
    .where(and(...customerConditions))
    .limit(1);
  if (customerRows.length > 0) return true;

  const supplierConditions = [eq(suppliers.accountNumber, accountNumber)];
  if (excludePersonId) supplierConditions.push(ne(suppliers.personId, excludePersonId));
  const supplierRows = await db
    .select({ id: suppliers.personId })
    .from(suppliers)
    .where(and(...supplierConditions))
    .limit(1);
  return supplierRows.length > 0;
}

export async function usernameExists(
  username: string,
  excludePersonId: number | null,
): Promise<boolean> {
  const db = await getDb();
  const conditions = [eq(employees.username, username)];
  if (excludePersonId) conditions.push(ne(employees.personId, excludePersonId));
  const rows = await db
    .select({ id: employees.personId })
    .from(employees)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}
