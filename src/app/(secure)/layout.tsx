import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import { getAllowedModules } from "@/lib/auth/rbac";
import { Sidebar } from "@/components/shared/sidebar";

export default async function SecureLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const personId = session.user.personId;
  const allowedModules = getAllowedModules(personId, "both");

  return (
    <div className="flex min-h-screen">
      <Sidebar modules={allowedModules} />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            OSPOS Next.js · {session.user.name ?? "user"}
          </div>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Logout
            </button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}