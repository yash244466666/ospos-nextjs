import { auth } from "@/lib/auth/options";
import { getDb } from "@/lib/db";
import { sales, itemQuantities, items } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { loadConfig, timezone } from "@/lib/config";
import { formatInstant } from "@/lib/datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Package, PauseCircle, ArrowRight, TrendingUp, DollarSign } from "lucide-react";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();
  await loadConfig();
  const db = await getDb();
  // eslint-disable-next-line react-hooks/purity
  const startOfDay = formatInstant(new Date(Date.now() - 24 * 60 * 60 * 1000), timezone(), "Y-m-d H:i:s");
  const salesToday = Number((await db.select({ count: sql<number>`COUNT(*)` }).from(sales)
    .where(and(eq(sales.saleStatus, 0), gte(sales.saleTime, startOfDay))))[0]?.count ?? 0);
  const itemsInStock = Number((await db.select({ count: sql<number>`COUNT(DISTINCT ${itemQuantities.itemId})` })
    .from(itemQuantities).where(gte(itemQuantities.quantity, "1")))[0]?.count ?? 0);
  const suspendedSales = Number((await db.select({ count: sql<number>`COUNT(*)` }).from(sales)
    .where(eq(sales.saleStatus, 1)))[0]?.count ?? 0);
  const totalItems = Number((await db.select({ count: sql<number>`COUNT(*)` }).from(items)
    .where(eq(items.deleted, false)))[0]?.count ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Welcome, {session?.user?.name ?? "User"}
        </h1>
        <p className="text-slate-500 mt-1">Here&apos;s your store overview for today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Sales today"
          value={salesToday}
          icon={ShoppingCart}
          accent="bg-blue-50 text-blue-600"
          href="/sales/manage"
          testId="metric-sales"
        />
        <MetricCard
          title="Items in stock"
          value={itemsInStock}
          icon={Package}
          accent="bg-emerald-50 text-emerald-600"
          href="/items"
          testId="metric-stock"
        />
        <MetricCard
          title="Suspended sales"
          value={suspendedSales}
          icon={PauseCircle}
          accent="bg-amber-50 text-amber-600"
          href="/sales/suspended"
          testId="metric-suspended"
        />
        <MetricCard
          title="Total items"
          value={totalItems}
          icon={TrendingUp}
          accent="bg-slate-100 text-slate-600"
          href="/items"
          testId="metric-items"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-[var(--color-border)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" /> Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickAction href="/sales/register" label="Open POS Register" />
            <QuickAction href="/items/new" label="Add new item" />
            <QuickAction href="/receivings/register" label="New receiving" />
            <QuickAction href="/reports" label="View reports" />
          </CardContent>
        </Card>

        <Card className="border-[var(--color-border)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-slate-800">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-2">
            <p>Use the sidebar to navigate modules. Start with the POS register to create sales, manage inventory in Items, and review reports.</p>
            <Link href="/sales/register" className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline font-medium">
              Open register <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, accent, href, testId }: { title: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string; href: string; testId?: string }) {
  return (
    <Link href={href} className="group" data-testid={testId}
    >
      <Card className="border-[var(--color-border)] shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium">{title}</p>
            <p className="text-3xl font-semibold text-slate-900 mt-1">{value}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent}`}>
            <Icon className="w-6 h-6" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      data-testid={`quick-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 transition-colors group"
    >
      {label}
      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
    </Link>
  );
}
