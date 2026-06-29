import { requirePermission } from "@/lib/auth/with-permission";
import { CsvImportForm } from "@/components/items/csv-import-form";

export default async function CsvImportPage() {
  await requirePermission("items");
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">CSV Import</h1>
      <CsvImportForm />
    </div>
  );
}