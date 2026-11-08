import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { checkThrottle } from "@/lib/auth/throttle";
import { requestIp } from "@/lib/session";
import { lang } from "@/lib/i18n/lang";

export const dynamic = "force-dynamic";

const LOCK_FILE = path.resolve(process.cwd(), ".migration.lock");

/**
 * Returns `null` when the database cannot be reached, `0` when it is a new
 * install (no employees / no schema), and `1` otherwise. Mirrors
 * `MY_Migration::getCurrentVersion()` gating in upstream `Login::migrate`.
 */
async function databaseState(): Promise<0 | 1 | null> {
  try {
    const db = await getDb();
    const rows = await db.select({ value: count() }).from(employees);
    return Number(rows[0]?.value ?? 0) === 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = (error as { cause?: { code?: string; errno?: number } }).cause;
    const code = (error as { code?: string }).code ?? cause?.code;
    const errno = (error as { errno?: number }).errno ?? cause?.errno;
    if (
      code === "ER_NO_SUCH_TABLE" ||
      errno === 1146 ||
      /no such table/i.test(message)
    ) {
      return 0;
    }
    return null;
  }
}

async function readCredentials(request: Request): Promise<{ username: string; password: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      username: typeof body.username === "string" ? body.username : "",
      password: typeof body.password === "string" ? body.password : "",
    };
  }
  const form = await request.formData().catch(() => null);
  const username = form?.get("username");
  const password = form?.get("password");
  return {
    username: typeof username === "string" ? username : "",
    password: typeof password === "string" ? password : "",
  };
}

export async function POST(request: Request) {
  const state = await databaseState();
  if (state === null) {
    return NextResponse.json(
      { success: false, message: lang("Login.migration_error_connection") },
      { status: 503 },
    );
  }

  const { username, password } = await readCredentials(request);
  if (!checkThrottle(requestIp(request), username)) {
    return NextResponse.json(
      { success: false, message: lang("Login.too_many_attempts") },
      { status: 429 },
    );
  }

  if (state !== 0) {
    const user = username && password ? await verifyPassword(username, password) : null;
    if (!user) {
      return NextResponse.json(
        { success: false, message: lang("Login.invalid_username_and_password") },
        { status: 401 },
      );
    }
  }

  let lock: number | null = null;
  try {
    lock = fs.openSync(LOCK_FILE, "wx");
  } catch {
    return NextResponse.json(
      { success: false, message: lang("Login.migration_running") },
      { status: 202 },
    );
  }

  try {
    execSync("npm run db:migrate", { stdio: "inherit" });
    return NextResponse.json({ success: true, message: "Migration completed successfully" });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: `Migration failed: ${error instanceof Error ? error.message : "unknown error"}`,
      },
      { status: 500 },
    );
  } finally {
    fs.closeSync(lock);
    fs.rmSync(LOCK_FILE, { force: true });
  }
}
