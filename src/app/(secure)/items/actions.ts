"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import {
  saveItem, deleteItem, adjustInventory, bulkUpdate, itemNumberExists,
} from "@/lib/items/repository";
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