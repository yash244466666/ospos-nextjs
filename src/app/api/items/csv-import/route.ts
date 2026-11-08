import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { auth } from "@/lib/auth/options";
import { csrfRejection, isSameOrigin } from "@/lib/auth/csrf";
import { requirePermissionApi } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import {
  attributeDefinitions,
  attributeLinks,
  attributeValues,
  inventory,
  itemQuantities,
  items,
  itemsTaxes,
  stockLocations,
  suppliers,
} from "@/db/schema";
import { STOCK_TYPE, ITEM_TYPE, NEW_ENTRY } from "@/lib/constants";
import { getConfigBool, dateFormat, loadConfig, timezone } from "@/lib/config";
import { parseCsv } from "@/lib/csv/parse";
import { nowDb, isValidDate } from "@/lib/datetime";
import { toDbDecimal } from "@/lib/money";
import { deleteOrphanedValues } from "@/lib/attributes/repository";
import { lang } from "@/lib/i18n/lang";

const FIXED_HEADERS = [
  "Id", "Barcode", "Item Name", "Category", "Supplier ID", "Cost Price", "Unit Price",
  "Tax 1 Name", "Tax 1 Percent", "Tax 2 Name", "Tax 2 Percent", "Reorder Level",
  "Description", "Allow Alt Description", "Item has Serial Number", "Image", "HSN",
];

const ALPHA_NUMERIC_PUNCT = /^[A-Za-z0-9 .,!?;:@#$%^&*()\-_+=\[\]{}'"|\\/<>~`]+$/;

class ImportFailure extends Error {
  constructor(public readonly rows: number[]) {
    super(`CSV import failed on rows ${rows.join(", ")}`);
  }
}

interface DefinitionInfo {
  definitionId: number;
  definitionName: string;
  definitionType: string;
  dropdownValues: string[];
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return csrfRejection();
  const permission = await requirePermissionApi("items");
  if (!permission.ok) {
    return Response.json(permission.body, { status: permission.status });
  }
  void auth;
  await loadConfig();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return Response.json({ success: false, message: lang("Items.csv_import_nodata_wrongformat") }, { status: 400 });
  }

  const text = (await file.text()).replace(/^﻿/, "");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return Response.json({ success: false, message: lang("Items.csv_import_nodata_wrongformat") }, { status: 400 });
  }

  const db = await getDb();
  const locations = await db
    .select()
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false));
  const definitions = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.deleted, false));
  const definitionInfo: DefinitionInfo[] = [];
  for (const definition of definitions) {
    let dropdownValues: string[] = [];
    if (definition.definitionType === "DROPDOWN") {
      const links = await db
        .select({ attributeId: attributeLinks.attributeId })
        .from(attributeLinks)
        .where(
          and(
            eq(attributeLinks.definitionId, definition.definitionId),
            isNull(attributeLinks.itemId),
            isNull(attributeLinks.saleId),
            isNull(attributeLinks.receivingId),
          ),
        );
      const ids = links
        .map((link) => link.attributeId)
        .filter((id): id is number => id !== null);
      if (ids.length > 0) {
        const values = await db
          .select({ attributeValue: attributeValues.attributeValue })
          .from(attributeValues)
          .where(inArray(attributeValues.attributeId, ids));
        dropdownValues = values
          .map((value) => value.attributeValue ?? "")
          .filter((value) => value !== "");
      }
    }
    definitionInfo.push({
      definitionId: definition.definitionId,
      definitionName: definition.definitionName,
      definitionType: definition.definitionType,
      dropdownValues,
    });
  }

  const headers = rows[0];
  const requiredHeaders = [
    ...FIXED_HEADERS,
    ...locations.map((location) => `location_${location.locationName ?? ""}`),
    ...definitionInfo.map((definition) => `attribute_${definition.definitionName}`),
  ];
  const present = new Set(headers);
  if (requiredHeaders.some((header) => !present.has(header))) {
    return Response.json(
      { success: false, message: lang("Items.csv_import_nodata_wrongformat") },
      { status: 400 },
    );
  }

  const allowedLocationNames = locations.map((location) => location.locationName ?? "");
  const locationByName = new Map(
    locations.map((location) => [location.locationName ?? "", location.locationId]),
  );
  const datePattern = dateFormat();
  const failures: number[] = [];

  try {
    await withTransaction(async (tx) => {
      for (let index = 1; index < rows.length; index++) {
        const row = rows[index];
        const rowNumber = index + 1;
        if (row.length !== headers.length) {
          failures.push(rowNumber);
          continue;
        }
        const values: Record<string, string> = {};
        headers.forEach((header, column) => {
          values[header] = row[column] ?? "";
        });

        const itemId = Number(values["Id"]) || 0;
        const isUpdate = itemId > NEW_ENTRY;

        const existingItem = isUpdate
          ? (
              await tx
                .select({ itemId: items.itemId })
                .from(items)
                .where(eq(items.itemId, itemId))
                .limit(1)
            )[0]
          : null;
        if (isUpdate && !existingItem) {
          failures.push(rowNumber);
          continue;
        }

        const name = values["Item Name"] ?? "";
        const category = values["Category"] ?? "";
        const unitPrice = values["Unit Price"] ?? "";
        const costPrice = values["Cost Price"] ?? "";
        if (
          !isUpdate &&
          (name === "" || category === "" || unitPrice === "")
        ) {
          failures.push(rowNumber);
          continue;
        }

        const numericChecks: [string, string][] = [
          ["Cost Price", costPrice],
          ["Unit Price", unitPrice],
          ["Reorder Level", values["Reorder Level"] ?? ""],
          ["Supplier ID", values["Supplier ID"] ?? ""],
          ["Tax 1 Percent", values["Tax 1 Percent"] ?? ""],
          ["Tax 2 Percent", values["Tax 2 Percent"] ?? ""],
          ...allowedLocationNames.map((name) => [
            `location_${name}`,
            values[`location_${name}`] ?? "",
          ] as [string, string]),
        ];
        if (
          numericChecks.some(
            ([, value]) => value !== "" && !Number.isFinite(Number(value)),
          )
        ) {
          failures.push(rowNumber);
          continue;
        }

        const itemNumber = values["Barcode"] ?? "";
        if (itemNumber !== "" && !ALPHA_NUMERIC_PUNCT.test(itemNumber)) {
          failures.push(rowNumber);
          continue;
        }
        if (itemNumber !== "" && !getConfigBool("allow_duplicate_barcodes", false)) {
          const clash = await tx
            .select({ itemId: items.itemId })
            .from(items)
            .where(eq(items.itemNumber, itemNumber));
          if (clash.some((entry) => entry.itemId !== itemId)) {
            failures.push(rowNumber);
            continue;
          }
        }

        const invalidLocation = Object.keys(values).some((key) => {
          if (!key.startsWith("location_")) return false;
          return !allowedLocationNames.includes(key.slice("location_".length));
        });
        if (invalidLocation) {
          failures.push(rowNumber);
          continue;
        }

        let attributeFailure = false;
        for (const definition of definitionInfo) {
          const raw = values[`attribute_${definition.definitionName}`];
          if (raw === undefined || raw === "") continue;
          if (raw.toLowerCase() === "_delete_") continue;
          if (
            definition.definitionType === "DROPDOWN" &&
            raw !== "" &&
            !definition.dropdownValues.includes(raw)
          ) {
            attributeFailure = true;
          }
          if (definition.definitionType === "DECIMAL" && !Number.isFinite(Number(raw))) {
            attributeFailure = true;
          }
          if (definition.definitionType === "DATE" && !isValidDate(raw, datePattern)) {
            attributeFailure = true;
          }
        }
        if (attributeFailure) {
          failures.push(rowNumber);
          continue;
        }

        let supplierId: number | null = null;
        if ((values["Supplier ID"] ?? "") !== "") {
          const supplier = await tx
            .select({ personId: suppliers.personId })
            .from(suppliers)
            .where(eq(suppliers.personId, Number(values["Supplier ID"])))
            .limit(1);
          supplierId = supplier[0]?.personId ?? null;
        }

        const allowAltRaw = values["Allow Alt Description"] ?? "";
        const serializedRaw = values["Item has Serial Number"] ?? "";

        const itemValues: Record<string, unknown> = {
          name,
          description: values["Description"] ?? "",
          category,
          costPrice: toDbDecimal(costPrice === "" ? 0 : costPrice, 2),
          unitPrice: toDbDecimal(unitPrice === "" ? 0 : unitPrice, 2),
          reorderLevel:
            (values["Reorder Level"] ?? "") === ""
              ? undefined
              : toDbDecimal(values["Reorder Level"], 3),
          deleted: false,
        };
        if (isUpdate) {
          if (allowAltRaw !== "") itemValues.allowAltDescription = allowAltRaw !== "0";
          if (serializedRaw !== "") itemValues.isSerialized = serializedRaw !== "0";
        } else {
          itemValues.allowAltDescription = allowAltRaw !== "" && allowAltRaw !== "0";
          itemValues.isSerialized = serializedRaw !== "" && serializedRaw !== "0";
          itemValues.stockType = STOCK_TYPE.HAS_STOCK;
          itemValues.itemType = ITEM_TYPE.ITEM;
          if ((values["Reorder Level"] ?? "") === "") itemValues.reorderLevel = "0";
        }
        if (supplierId !== null) itemValues.supplierId = supplierId;
        if (itemNumber !== "") itemValues.itemNumber = itemNumber;
        if ((values["HSN"] ?? "") !== "") itemValues.hsnCode = values["HSN"];
        if ((values["Image"] ?? "") !== "") itemValues.picFilename = values["Image"];

        let savedItemId = itemId;
        if (isUpdate) {
          await tx.update(items).set(itemValues).where(eq(items.itemId, itemId));
        } else {
          const inserted = await insertReturning(tx, items, itemValues as typeof items.$inferInsert, items.itemId);
          savedItemId = (Array.isArray(inserted) ? inserted[0] : inserted).id;
          await tx
            .update(items)
            .set({ lowSellItemId: savedItemId })
            .where(eq(items.itemId, savedItemId));
        }

        await tx.delete(itemsTaxes).where(eq(itemsTaxes.itemId, savedItemId));
        for (const [nameKey, percentKey] of [
          ["Tax 1 Name", "Tax 1 Percent"],
          ["Tax 2 Name", "Tax 2 Percent"],
        ] as const) {
          const percent = values[percentKey] ?? "";
          const taxName = values[nameKey] ?? "";
          if (percent !== "" && Number.isFinite(Number(percent)) && Number(percent) < 0) {
            failures.push(rowNumber);
            attributeFailure = true;
          }
          if (
            percent !== "" &&
            Number.isFinite(Number(percent)) &&
            Number(percent) >= 0 &&
            taxName !== ""
          ) {
            await insertReturning(tx, itemsTaxes, {
              itemId: savedItemId,
              name: taxName,
              percent: toDbDecimal(percent, 3),
            });
          }
        }
        if (attributeFailure) continue;

        for (const location of locations) {
          const locationName = location.locationName ?? "";
          const raw = values[`location_${locationName}`];
          if (raw !== undefined && raw !== "") {
            const quantity = toDbDecimal(raw === "0" ? 0 : raw, 3);
            const existing = await tx
              .select({ itemId: itemQuantities.itemId })
              .from(itemQuantities)
              .where(
                and(
                  eq(itemQuantities.itemId, savedItemId),
                  eq(itemQuantities.locationId, location.locationId),
                ),
              )
              .limit(1);
            if (existing.length > 0) {
              await tx
                .update(itemQuantities)
                .set({ quantity })
                .where(
                  and(
                    eq(itemQuantities.itemId, savedItemId),
                    eq(itemQuantities.locationId, location.locationId),
                  ),
                );
            } else {
              await tx.insert(itemQuantities).values({
                itemId: savedItemId,
                locationId: location.locationId,
                quantity,
              });
            }
            await tx.insert(inventory).values({
              transDate: nowDb(timezone()),
              transItems: savedItemId,
              transUser: permission.session.user.personId ?? 0,
              transLocation: location.locationId,
              transComment: lang("Items.inventory_CSV_import_quantity"),
              transInventory: quantity,
            });
          } else if (!isUpdate) {
            await tx.insert(itemQuantities).values({
              itemId: savedItemId,
              locationId: location.locationId,
              quantity: "0",
            });
            await tx.insert(inventory).values({
              transDate: nowDb(timezone()),
              transItems: savedItemId,
              transUser: permission.session.user.personId ?? 0,
              transLocation: location.locationId,
              transComment: lang("Items.inventory_CSV_import_quantity"),
              transInventory: "0",
            });
          }
        }

        for (const definition of definitionInfo) {
          const raw = values[`attribute_${definition.definitionName}`];
          if (raw === undefined) continue;
          if (raw.toLowerCase() === "_delete_") {
            await tx
              .delete(attributeLinks)
              .where(
                and(
                  eq(attributeLinks.itemId, savedItemId),
                  eq(attributeLinks.definitionId, definition.definitionId),
                  isNull(attributeLinks.saleId),
                  isNull(attributeLinks.receivingId),
                ),
              );
            continue;
          }
          if (raw === "") continue;

          let attributeId: number | null = null;
          if (definition.definitionType === "CHECKBOX") {
            const normalized =
              raw.toLowerCase() === "false" || raw === "0" ? "0" : "1";
            const existing = await tx
              .select({ attributeId: attributeValues.attributeId })
              .from(attributeValues)
              .where(eq(attributeValues.attributeValue, normalized))
              .limit(1);
            attributeId =
              existing[0]?.attributeId ??
              (
                await insertReturning(
                  tx,
                  attributeValues,
                  { attributeValue: normalized },
                  attributeValues.attributeId,
                )
              )[0]?.id ??
              null;
          } else if (definition.definitionType === "DECIMAL") {
            const numeric = toDbDecimal(raw, 3);
            const existing = await tx
              .select({ attributeId: attributeValues.attributeId })
              .from(attributeValues)
              .where(eq(attributeValues.attributeDecimal, numeric))
              .limit(1);
            attributeId =
              existing[0]?.attributeId ??
              (
                await insertReturning(tx, attributeValues, { attributeDecimal: numeric }, attributeValues.attributeId)
              ).at(0)?.id ??
              null;
          } else if (definition.definitionType === "DATE") {
            const parsed = new Date(
              `${raw.split("/").reverse().join("-")}T00:00:00Z`,
            );
            void parsed;
            const existing = await tx
              .select({ attributeId: attributeValues.attributeId })
              .from(attributeValues)
              .where(eq(attributeValues.attributeDate, raw))
              .limit(1);
            attributeId =
              existing[0]?.attributeId ??
              (
                await insertReturning(tx, attributeValues, { attributeDate: raw }, attributeValues.attributeId)
              ).at(0)?.id ??
              null;
          } else {
            const existing = await tx
              .select({ attributeId: attributeValues.attributeId, attributeValue: attributeValues.attributeValue })
              .from(attributeValues)
              .where(eq(attributeValues.attributeValue, raw))
              .limit(1);
            attributeId =
              existing[0]?.attributeId ??
              (
                await insertReturning(tx, attributeValues, { attributeValue: raw }, attributeValues.attributeId)
              ).at(0)?.id ??
              null;
          }

          if (attributeId === null) {
            failures.push(rowNumber);
            continue;
          }
          await tx
            .delete(attributeLinks)
            .where(
              and(
                eq(attributeLinks.itemId, savedItemId),
                eq(attributeLinks.definitionId, definition.definitionId),
                isNull(attributeLinks.saleId),
                isNull(attributeLinks.receivingId),
              ),
            );
          await tx.insert(attributeLinks).values({
            attributeId,
            definitionId: definition.definitionId,
            itemId: savedItemId,
          });
        }
      }

      if (failures.length > 0) {
        throw new ImportFailure(failures);
      }
    });
  } catch (error) {
    if (error instanceof ImportFailure) {
      return Response.json({
        success: false,
        message: lang("Items.csv_import_partially_failed", {
          0: error.rows.length,
          1: error.rows.join(", "),
        }),
      });
    }
    throw error;
  }

  await deleteOrphanedValues();
  return Response.json({ success: true, message: lang("Items.csv_import_success") });
}

void inArray;
void ne;
