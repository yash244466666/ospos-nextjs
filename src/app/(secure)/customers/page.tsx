import { requirePermission } from "@/lib/auth/with-permission";
import { searchCustomers } from "@/lib/persons/repository";
import CustomersTable from "@/components/customers/customers-table";
import Link from "next/link";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("customers");
  const { q = "" } = await searchParams;
  const rows = await searchCustomers(q, 100);
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Customers</h1>
        <Link href="/customers/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New Customer</Link>
      </div>
      <form className="mb-3">
        <input type="text" name="q" defaultValue={q} placeholder="Search…" data-testid="search-input" className="border px-2 py-1 w-full" />
      </form>
      <div data-testid="data-table">
        <CustomersTable rows={rows} />
      </div>
    </div>
  );
}