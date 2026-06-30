import { requirePermission } from "@/lib/auth/with-permission";
import { searchEmployees } from "@/lib/persons/repository";
import EmployeesTable from "@/components/employees/employees-table";
import Link from "next/link";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("employees");
  const { q = "" } = await searchParams;
  const rows = searchEmployees(q, 100);
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Employees</h1>
        <Link href="/employees/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New Employee</Link>
      </div>
      <form className="mb-3">
        <input type="text" name="q" defaultValue={q} placeholder="Search…" data-testid="search-input" className="border px-2 py-1 w-full" />
      </form>
      <div data-testid="data-table">
        <EmployeesTable rows={rows} />
      </div>
    </div>
  );
}