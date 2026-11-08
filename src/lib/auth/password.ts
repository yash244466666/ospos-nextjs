import { compare, hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees } from "@/db/schema";

const BCRYPT_COST = 10;

export interface AuthenticatedUser {
  personId: number;
  username: string;
  language: string | null;
  languageCode: string | null;
  upgradedFromMd5: boolean;
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

/**
 * `Employee::login`: reject deleted rows, hash_version 1 = MD5 then upgrade to
 * bcrypt, hash_version 2 = bcrypt verify. Returns null for any failure.
 */
export async function verifyPassword(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.username, username), eq(employees.deleted, false)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  let ok = false;
  let upgradedFromMd5 = false;
  if (row.hashVersion === 1) {
    const md5 = createHash("md5").update(password).digest("hex");
    if (md5 === row.password) {
      ok = true;
      upgradedFromMd5 = true;
      const newHash = await hash(password, BCRYPT_COST);
      await db
        .update(employees)
        .set({ password: newHash, hashVersion: 2 })
        .where(eq(employees.personId, row.personId));
    }
  } else {
    ok = await compare(password, row.password);
  }

  if (!ok) return null;
  return {
    personId: row.personId,
    username: row.username,
    language: row.language,
    languageCode: row.languageCode,
    upgradedFromMd5,
  };
}

/** `Employee::check_password` — verify without upgrading or touching sessions. */
export async function checkPassword(username: string, password: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.username, username), eq(employees.deleted, false)))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.hashVersion === 1) {
    return createHash("md5").update(password).digest("hex") === row.password;
  }
  return compare(password, row.password);
}
