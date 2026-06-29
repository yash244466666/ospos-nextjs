"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AllowedModule } from "@/lib/auth/rbac";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tags,
  Users,
  Truck,
  Gift,
  CreditCard,
  BarChart3,
  Settings,
  MessageSquare,
  Briefcase,
  ClipboardList,
  DollarSign,
  FolderTree,
  Percent,
  Layers,
  FileSpreadsheet,
} from "lucide-react";

const ROUTE_MAP: Record<string, string> = {
  config: "/config",
  customers: "/customers",
  employees: "/employees",
  giftcards: "/giftcards",
  items: "/items",
  item_kits: "/item_kits",
  messages: "/messages",
  receivings: "/receivings/register",
  reports: "/reports",
  sales: "/sales/register",
  suppliers: "/suppliers",
  attributes: "/attributes",
  expenses: "/expenses",
  expenses_categories: "/expenses_categories",
  taxes: "/taxes",
  cashups: "/cashups",
  home: "/",
};

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: LayoutDashboard,
  sales: ShoppingCart,
  items: Package,
  item_kits: Layers,
  attributes: Tags,
  customers: Users,
  suppliers: Truck,
  giftcards: Gift,
  receivings: ClipboardList,
  expenses: DollarSign,
  expenses_categories: FolderTree,
  taxes: Percent,
  cashups: CreditCard,
  reports: BarChart3,
  messages: MessageSquare,
  employees: Briefcase,
  config: Settings,
  office: FileSpreadsheet,
};

export function Sidebar({ modules }: { modules: AllowedModule[] }) {
  const pathname = usePathname();
  const home = modules.find((m) => m.moduleId === "home");
  const office = modules.find((m) => m.moduleId === "office");
  const homeMods = modules.filter((m) => m.moduleId !== "home" && m.moduleId !== "office");

  return (
    <aside className="w-60 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] flex flex-col shadow-lg">
      <div className="px-5 py-5 border-b border-slate-600 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
          <span className="font-bold text-sm">OS</span>
        </div>
        <span className="font-semibold text-lg tracking-tight">OSPOS</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5" aria-label="Main navigation">
        {home && (
          <SidebarLink href="/" label="Home" moduleId="home" active={pathname === "/"} />
        )}
        {homeMods.map((m) => {
          const href = ROUTE_MAP[m.moduleId] ?? `/${m.moduleId}`;
          return (
            <SidebarLink
              key={m.moduleId}
              href={href}
              label={m.nameLangKey}
              moduleId={m.moduleId}
              active={pathname?.startsWith(href.split("?")[0]) ?? false}
            />
          );
        })}
        {office && (
          <>
            <div className="mt-5 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Office
            </div>
            <SidebarLink href="/reports" label="Reports" moduleId="reports" active={pathname?.startsWith("/reports") ?? false} />
            <SidebarLink href="/config" label="Settings" moduleId="config" active={pathname?.startsWith("/config") ?? false} />
          </>
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({ href, label, moduleId, active }: { href: string; label: string; moduleId: string; active: boolean }) {
  const Icon = MODULE_ICONS[moduleId] ?? FileSpreadsheet;
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 px-5 py-2.5 text-sm transition-colors duration-200 rounded-r-full mr-3 ${
        active
          ? "bg-white/10 text-white font-medium border-l-4 border-[var(--color-accent)]"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={`w-4.5 h-4.5 ${active ? "text-[var(--color-accent)]" : "text-slate-400 group-hover:text-slate-200"}`} />
      <span>{label}</span>
    </Link>
  );
}
