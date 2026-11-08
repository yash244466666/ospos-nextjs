import { requirePermission } from "@/lib/auth/with-permission";
import { getCustomer } from "@/lib/persons/repository";
import CustomerForm from "@/components/customers/customer-form";

export default async function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("customers");
  const { id } = await params;
  const personId = parseInt(id, 10);
  const customer = personId > 0 ? await getCustomer(personId) : null;
  return <CustomerForm initial={customer} />;
}