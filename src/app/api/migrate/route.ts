import { execSync } from "child_process";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    execSync("npm run db:migrate", { stdio: "inherit" });
    return NextResponse.json({ ok: true, message: "Migrations applied" });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "migrate", method: "POST" });
}
