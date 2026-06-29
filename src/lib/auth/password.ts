import { compare, hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { employees, people } from "@/db/schema";

const BCRYPT_COST = 10;

export interface AuthenticatedUser {
  personId: number;
  username: string;
  language: string | null;
  languageCode: string | null;
}

export async function verifyPassword(
  username: string,
  password: string
): Promise<AuthenticatedUser | null> {
  const db = getDbSync();
  const row = db
    .select({
      personId: employees.personId,
      username: employees.username,
      password: employees.password,
      hashVersion: employees.hashVersion,
      deleted: employees.deleted,
      language: employees.language,
      languageCode: employees.languageCode,
      firstName: people.firstName,
      lastName: people.lastName,
    })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(eq(employees.username, username))
    .get();

  if (!row || row.deleted) return null;

  let ok = false;
  if (row.hashVersion === 1) {
    const md5 = createHash("md5").update(password).digest("hex");
    if (md5 === row.password) {
      ok = true;
      const newHash = await hash(password, BCRYPT_COST);
      db.update(employees)
        .set({ password: newHash, hashVersion: 2 })
        .where(eq(employees.personId, row.personId))
        .run();
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
  };
}