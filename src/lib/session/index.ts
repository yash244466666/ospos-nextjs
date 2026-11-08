import { randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions } from "@/db/schema";
import { auth } from "@/lib/auth/options";
import { nowDb } from "@/lib/datetime";

/**
 * Application session state, mirroring CI4's database session handler:
 * `ospos_sessions` keyed by (id, ip_address), a 2-hour lifetime and
 * matchIP=true. The session id travels in the NextAuth JWT (`appSessionId`),
 * so cart state is per browser session rather than per person (ADR-03).
 */

export const SESSION_LIFETIME_SECONDS = 7200;

export type SessionData = Record<string, unknown>;

function newSessionId(): string {
  return randomBytes(32).toString("base64url").slice(0, 64);
}

export function requestIp(request?: Request): string {
  if (!request) return "127.0.0.1";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}

function decodeData(data: Buffer | string | null): SessionData {
  if (!data) return {};
  try {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : data;
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SessionData) : {};
  } catch {
    return {};
  }
}

export async function createAppSession(
  personId: number,
  ipAddress: string,
  initial: SessionData = {},
): Promise<string> {
  const db = await getDb();
  const id = newSessionId();
  const now = nowDb();
  await db.delete(sessions).where(
    lt(sessions.timestamp, new Date(Date.now() - SESSION_LIFETIME_SECONDS * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")),
  );
  const data: SessionData = {
    person_id: personId,
    menu_group: "home",
    ...initial,
  };
  await db.insert(sessions).values({
    id,
    ipAddress,
    timestamp: now,
    data: Buffer.from(JSON.stringify(data), "utf8"),
  });
  return id;
}

export async function readAppSession(
  id: string,
  ipAddress: string,
): Promise<SessionData | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.ipAddress, ipAddress)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const timestamp = String(row.timestamp);
  if (new Date(`${timestamp.replace(" ", "T")}Z`).getTime() < Date.now() - SESSION_LIFETIME_SECONDS * 1000) {
    await destroyAppSession(id, ipAddress);
    return null;
  }
  await db
    .update(sessions)
    .set({ timestamp: nowDb() })
    .where(and(eq(sessions.id, id), eq(sessions.ipAddress, ipAddress)));
  return decodeData(row.data as Buffer);
}

export async function writeAppSession(
  id: string,
  ipAddress: string,
  data: SessionData,
): Promise<void> {
  const db = await getDb();
  await db
    .update(sessions)
    .set({ data: Buffer.from(JSON.stringify(data), "utf8"), timestamp: nowDb() })
    .where(and(eq(sessions.id, id), eq(sessions.ipAddress, ipAddress)));
}

export async function destroyAppSession(id: string, ipAddress: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.ipAddress, ipAddress)));
}

export async function destroyAllSessionsForPerson(personId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select().from(sessions);
  for (const row of rows) {
    const data = decodeData(row.data as Buffer);
    if (data.person_id === personId) {
      await db.delete(sessions).where(eq(sessions.id, row.id));
    }
  }
}

async function currentSessionContext(): Promise<{ id: string; ip: string } | null> {
  const session = await auth();
  const id = session?.user?.appSessionId;
  if (!id) return null;
  const ip = session.user.sessionIp ?? "127.0.0.1";
  return { id, ip };
}

export async function getSessionData(): Promise<SessionData> {
  const ctx = await currentSessionContext();
  if (!ctx) return {};
  return (await readAppSession(ctx.id, ctx.ip)) ?? {};
}

export async function updateSessionData(
  mutate: (data: SessionData) => SessionData | void,
): Promise<void> {
  const ctx = await currentSessionContext();
  if (!ctx) return;
  const data = (await readAppSession(ctx.id, ctx.ip)) ?? {};
  const next = mutate(data) ?? data;
  await writeAppSession(ctx.id, ctx.ip, next);
}

export async function clearSessionData(): Promise<void> {
  const ctx = await currentSessionContext();
  if (!ctx) return;
  await writeAppSession(ctx.id, ctx.ip, { person_id: (await getSessionData()).person_id ?? null });
}
