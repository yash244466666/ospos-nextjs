import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import { getAllowedModules } from "@/lib/auth/rbac";
import { Sidebar } from "@/components/shared/sidebar";
import { UserCircle, LogOut, Bell, Store } from "lucide-react";

export default async function SecureLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const personId = session.user.personId;
  const allowedModules = getAllowedModules(personId, "both");

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      <Sidebar modules={allowedModules} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[var(--color-border)] px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-30">
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Store className="w-4 h-4" />
              <span className="font-medium">OSPOS Next.js</span>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5 text-slate-700">
              <UserCircle className="w-4 h-4" />
              <span>{session.user.name ?? "User"}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Notifications">
              <Bell className="w-4 h-4" />
            </button>
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                data-testid="logout-button"
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
