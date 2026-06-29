import { requirePermission } from "@/lib/auth/with-permission";
import { searchSuppliers } from "@/lib/persons/repository";
import SuppliersTable from "@/components/suppliers/suppliers-table";
import Link from "next/link";

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("suppliers");
  const { q = "" } = await searchParams;
  const rows = searchSuppliers(q, 100);
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Suppliers</h1>
        <Link href="/suppliers/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">New Supplier</Link>
      </div>
      <form className="mb-3">
        <input type="text" name="q" defaultValue={q} placeholder="Search…" className="border px-2 py-1 w-full" />
      </form>
      <SuppliersTable rows={rows} />
    </div>
  );
}