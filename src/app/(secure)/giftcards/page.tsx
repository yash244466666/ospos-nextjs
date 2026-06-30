import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { giftcards } from "@/db/schema";
import GiftcardsTable from "@/components/giftcards/giftcards-table";
import Link from "next/link";

export default async function GiftcardsPage() {
  await requirePermission("giftcards");
  const db = getDbSync();
  const rows = db.select().from(giftcards).where(eq(giftcards.deleted, false)).all();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Gift Cards</h1>
        <Link href="/giftcards/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New Giftcard</Link>
      </div>
      <div data-testid="data-table">
        <GiftcardsTable rows={rows} />
      </div>
    </div>
  );
}