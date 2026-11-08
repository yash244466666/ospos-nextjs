"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import {
  deleteLocation,
  getLocationName,
  saveValue,
  setDefaultLocation,
} from "@/lib/stock_locations/repository";

export async function saveStockLocationAction(formData: FormData) {
  await requirePermission("config");
  const id = Number(formData.get("locationId") ?? 0) || 0;
  const name = ((formData.get("locationName") as string) || "").trim();
  if (!name) throw new Error("Location name required");
  if (id > 0 && (await getLocationName(id)) !== name) {
    // Rename side effects are handled by saveValue (permissions/grants).
  }
  const savedId = await saveValue({ locationId: id || undefined, locationName: name });
  if (formData.get("isDefault") === "on") {
    await setDefaultLocation(savedId);
  }
  revalidatePath("/config/stock-locations");
  redirect("/config/stock-locations");
}

export async function deleteStockLocationAction(locationId: number) {
  await requirePermission("config");
  await deleteLocation(locationId);
  revalidatePath("/config/stock-locations");
  redirect("/config/stock-locations");
}

export async function setDefaultStockLocationAction(locationId: number) {
  await requirePermission("config");
  await setDefaultLocation(locationId);
  revalidatePath("/config/stock-locations");
}
