"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AllowedModule } from "@/lib/auth/rbac";

const ROUTE_MAP: Record<string, string> = {
  config: "/config",
  customers: "/customers",
  employees: "/employees",
  giftcards: "/giftcards",
  items: "/items",
  item_kits: "/item_kits",
  messages: "/messages",
  receivings: "/receivings",
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

export function Sidebar({ modules }: { modules: AllowedModule[] }) {
  const pathname = usePathname();
  const home = modules.find((m) => m.moduleId === "home");
  const office = modules.find((m) => m.moduleId === "office");
  const homeMods = modules.filter((m) => m.moduleId !== "home" && m.moduleId !== "office");

  return (
    <aside className="w-56 bg-slate-800 text-slate-100 flex flex-col">
      <div className="px-4 py-5 border-b border-slate-700 font-bold">
        OSPOS
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {home && (
          <SidebarLink href="/" label="Home" active={pathname === "/"} />
        )}
        {homeMods.map((m) => {
          const href = ROUTE_MAP[m.moduleId] ?? `/${m.moduleId}`;
          return (
            <SidebarLink
              key={m.moduleId}
              href={href}
              label={m.nameLangKey}
              active={pathname?.startsWith(href.split("?")[0])}
            />
          );
        })}
        {office && homeMods.length > 0 && (
          <div className="mt-4 px-4 py-1 text-xs uppercase text-slate-400">
            Office
          </div>
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block px-4 py-2 text-sm hover:bg-slate-700 ${
        active ? "bg-slate-700 border-l-4 border-blue-400" : ""
      }`}
    >
      {label}
    </Link>
  );
}