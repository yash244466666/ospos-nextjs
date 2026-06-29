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
        <a className="bg-white p-4 rounded shadow-sm hover:bg-slate-50" href="/reports">Reports</a>
        <a className="bg-white p-4 rounded shadow-sm hover:bg-slate-50" href="/config">Settings</a>
        <a className="bg-white p-4 rounded shadow-sm hover:bg-slate-50" href="/sales/register">POS Register</a>
      </div>
    </div>
  );
}
