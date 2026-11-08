import { requirePermission } from "@/lib/auth/with-permission";
import { getDefinition, listDropdownValues, listDefinitions } from "@/lib/attributes/repository";
import AttributeForm from "@/components/attributes/attribute-form";

export default async function AttributeEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("attributes");
  const { id } = await params;
  const definitionId = parseInt(id, 10);
  const def = await getDefinition(definitionId);
  const values = definitionId > 0 ? await listDropdownValues(definitionId) : [];
  const allDefs = (await listDefinitions()).filter((d) => d.definitionType === "GROUP" && d.definitionId !== definitionId);
  return <AttributeForm initial={def} values={values} groups={allDefs} />;
}