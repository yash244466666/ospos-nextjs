"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import {
  saveItem, deleteItem, adjustInventory, bulkUpdate, itemNumberExists,
  searchItems, getItemById, getInventoryHistory,
  suggestItems,
  getKitSearchSuggestions, getLowSellSuggestions,
  getCategorySuggestions, getLocationSuggestions,
  getItemInfo, getInfoByIdOrNumber, changeCostPrice, updateItemNumber,
  updateItemName, updateItemDescription, undeleteItem, getAllItems,
} from "@/lib/items/repository";
import { getAll as getAllStockLocations } from "@/lib/stock_locations/repository";
import { listDefinitions, getAttributesByItem, saveAttributeValue, copyAttributeLinks } from "@/lib/attributes/repository";
import { getTaxCategories } from "@/lib/taxes/repository";
import { generateBarcodesPdf } from "@/lib/barcode";
import { z } from "zod";
import { parseFormDataEntries } from "./form-data";

const ItemSchema = z.object({
  itemId: z.coerce.number().optional(),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  supplierId: z.coerce.number().optional().nullable(),
  itemNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  costPrice: z.coerce.number(),
  unitPrice: z.coerce.number(),
  reorderLevel: z.coerce.number().default(0),
  receivingQuantity: z.coerce.number().default(1),
  allowAltDescription: z.coerce.boolean().default(false),
  isSerialized: z.coerce.boolean().default(false),
  stockType: z.coerce.number().default(0),
  itemType: z.coerce.number().default(0),
  taxCategoryId: z.coerce.number().optional().nullable(),
  qtyPerPack: z.coerce.number().default(1),
  packName: z.string().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  picFilename: z.string().optional().nullable(),
  taxes: z.array(z.object({
    name: z.string(),
    percent: z.coerce.number(),
  })).optional(),
  quantities: z.array(z.object({
    locationId: z.coerce.number(),
    quantity: z.coerce.number(),
  })).optional(),
});

export async function saveItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const personId = session.user.personId;

  const parsed = ItemSchema.safeParse(parseFormDataEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  if (data.itemNumber && itemNumberExists(data.itemNumber, data.itemId)) {
    return { error: { itemNumber: "Barcode already exists" } };
  }
  const itemId = saveItem({
    ...data,
    category: data.category ?? null,
    description: data.description ?? null,
    itemNumber: data.itemNumber ?? null,
    packName: data.packName ?? null,
    hsnCode: data.hsnCode ?? null,
    supplierId: data.supplierId ?? null,
    taxCategoryId: data.taxCategoryId ?? null,
    picFilename: data.picFilename ?? null,
    employeeId: personId,
  });
  revalidatePath("/items");
  redirect(`/items/${itemId}`);
}

export async function deleteItemAction(itemId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  deleteItem(itemId, session.user.personId);
  revalidatePath("/items");
  redirect("/items");
}

export async function adjustInventoryAction(itemId: number, locationId: number, newQuantity: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  adjustInventory(itemId, locationId, newQuantity, session.user.personId);
  revalidatePath(`/items/${itemId}`);
}

export async function bulkUpdateAction(itemIds: number[], fields: Partial<{ category: string; supplierId: number; costPrice: number; unitPrice: number }>) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  bulkUpdate(itemIds, fields, session.user.personId);
  revalidatePath("/items");
}

export async function searchItemsAction(filters: any) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return searchItems(filters);
}

export async function getItemRowAction(itemId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getItemById(itemId);
}

export async function getItemByNumberOrIdAction(input: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getInfoByIdOrNumber(input);
}

export async function getItemInfoAction(input: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getItemInfo(parseInt(input, 10));
}

export async function getInventoryAction(itemId: number, locationId?: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getInventoryHistory(itemId, locationId);
}

export async function suggestItemsAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return suggestItems(term, { limit: 10 });
}

export async function suggestLowSellAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getLowSellSuggestions(term);
}

export async function suggestKitsAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getKitSearchSuggestions(term);
}

export async function suggestCategoryAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getCategorySuggestions(term);
}

export async function suggestLocationAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getLocationSuggestions(term);
}

export async function checkItemNumberAction(itemNumber: string, excludeId: number | null) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return itemNumberExists(itemNumber, excludeId ?? undefined);
}

export async function changeItemNumberAction(itemId: number, itemNumber: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  updateItemNumber(itemId, itemNumber);
  revalidatePath(`/items/${itemId}`);
}

export async function changeItemNameAction(itemId: number, name: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  updateItemName(itemId, name);
  revalidatePath(`/items/${itemId}`);
}

export async function changeItemDescriptionAction(itemId: number, description: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  updateItemDescription(itemId, description);
  revalidatePath(`/items/${itemId}`);
}

export async function undeleteItemAction(itemId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  undeleteItem(itemId);
  revalidatePath("/items");
}

export async function getAttributesAction(itemId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return {
    definitions: listDefinitions(),
    values: getAttributesByItem(itemId),
  };
}

export async function saveAttributesAction(itemId: number, values: Record<number, string>) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  for (const [definitionId, value] of Object.entries(values)) {
    saveAttributeValue({ definitionId: parseInt(definitionId, 10), itemId, attributeValue: value });
  }
  revalidatePath(`/items/${itemId}`);
}

export async function generateBarcodesAction(itemIds: number[]) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const items = itemIds.map((id) => getItemById(id)).filter((i): i is NonNullable<typeof i> => !!i);
  return generateBarcodesPdf(items);
}

export async function getStockLocationsAction() {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getAllStockLocations();
}

export async function getTaxCategoriesAction() {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getTaxCategories();
}

export async function getItemTotalRowsAction() {
  return getAllItems().length;
}