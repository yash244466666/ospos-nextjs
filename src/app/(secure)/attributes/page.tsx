import { requirePermission } from "@/lib/auth/with-permission";
import { listDefinitions } from "@/lib/attributes/repository";
import AttributeTable from "@/components/attributes/attribute-table";
import Link from "next/link";

export default async function AttributesPage() {
  await requirePermission("attributes");
  const rows = listDefinitions();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Attributes</h1>
        <Link href="/attributes/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">New Attribute</Link>
      </div>
      <AttributeTable rows={rows} />
    </div>
  );
}