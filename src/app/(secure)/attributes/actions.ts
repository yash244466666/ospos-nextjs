"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import {
  deleteDefinition,
  saveDefinition,
  listDefinitions,
  getDefinition,
  searchDefinitions,
  getTotalDefinitionRows,
  getAttributesByItem,
  saveAttributeValue,
  deleteAttributeValue,
  listDropdownValues as getDropdownValues,
  getSuggestions,
  DEFINITION_TYPES,
  SHOW_IN_ITEMS,
  SHOW_IN_SALES,
  SHOW_IN_RECEIVINGS,
  type DefinitionType,
} from "@/lib/attributes/repository";

const FLAG_MAP: Record<string, number> = {
  show_in_items: SHOW_IN_ITEMS,
  show_in_sales: SHOW_IN_SALES,
  show_in_receivings: SHOW_IN_RECEIVINGS,
};

export async function saveAttributeAction(formData: FormData) {
  await requirePermission("attributes");
  const definitionId = parseInt((formData.get("definitionId") as string) || "0", 10);
  const definitionName = ((formData.get("definitionName") as string) || "").trim();
  if (!definitionName) throw new Error("Name required");
  const definitionType = ((formData.get("definitionType") as string) || "TEXT") as DefinitionType;
  if (!DEFINITION_TYPES.includes(definitionType)) throw new Error("Invalid type");
  const definitionUnit = (formData.get("definitionUnit") as string) || null;
  const flagValues = formData.getAll("definitionFlags") as string[];
  const definitionFlags = flagValues.reduce((acc, k) => acc + (FLAG_MAP[k] ?? 0), 0);
  const definitionFkRaw = formData.get("definitionFk") as string;
  const definitionFk = definitionFkRaw ? parseInt(definitionFkRaw, 10) : null;
  const valuesJson = (formData.get("values") as string) || "[]";
  const values: string[] = JSON.parse(valuesJson);

  const id = saveDefinition({
    definitionId,
    definitionName,
    definitionType,
    definitionUnit: definitionUnit || null,
    definitionFlags,
    definitionFk,
  }, values);
  revalidatePath("/attributes");
  redirect(`/attributes/new/${id}`);
}

export async function deleteAttributeAction(definitionId: number) {
  await requirePermission("attributes");
  deleteDefinition(definitionId);
  revalidatePath("/attributes");
}

export async function searchAttributesAction(term: string) {
  await requirePermission("attributes");
  return searchDefinitions(term);
}

export async function getAttributeRowAction(definitionId: number) {
  await requirePermission("attributes");
  return getDefinition(definitionId);
}

export async function getAttributeValuesAction(definitionId: number) {
  await requirePermission("attributes");
  return getDropdownValues(definitionId);
}

export async function saveAttributeValueAction(definitionId: number, itemId: number, value: string) {
  await requirePermission("attributes");
  saveAttributeValue({ definitionId, itemId, attributeValue: value });
  revalidatePath(`/items/${itemId}`);
}

export async function deleteAttributeValueAction(attributeId: number) {
  await requirePermission("attributes");
  deleteAttributeValue(attributeId);
  revalidatePath("/attributes");
}

export async function getAttributesByItemAction(itemId: number) {
  await requirePermission("attributes");
  return getAttributesByItem(itemId);
}

export { listDefinitions, getTotalDefinitionRows, getSuggestions };