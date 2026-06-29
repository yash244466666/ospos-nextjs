import { requirePermission } from "@/lib/auth/with-permission";
import { getSupplier } from "@/lib/persons/repository";
import SupplierForm from "@/components/suppliers/supplier-form";

export default async function SupplierEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("suppliers");
  const { id } = await params;
  const personId = parseInt(id, 10);
  const supplier = personId > 0 ? getSupplier(personId) : null;
  return <SupplierForm initial={supplier} />;
}