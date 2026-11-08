import Link from "next/link";
import { auth } from "@/lib/auth/options";
import { redirect } from "next/navigation";

export default async function OfficePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Office</h1>
      <p className="text-slate-600">Office module shortcuts.</p>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
        <Link className="bg-white p-4 rounded shadow-sm hover:bg-slate-50" href="/reports" data-testid="office-shortcut-reports">Reports</Link>
        <Link className="bg-white p-4 rounded shadow-sm hover:bg-slate-50" href="/config" data-testid="office-shortcut-config">Settings</Link>
        <Link className="bg-white p-4 rounded shadow-sm hover:bg-slate-50" href="/sales/register" data-testid="office-shortcut-pos">POS Register</Link>
      </div>
    </div>
  );
}
