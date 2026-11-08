import { and, asc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { attributeDefinitions, attributeValues, attributeLinks } from "@/db/schema";
import { toDbDecimal } from "@/lib/money";

export const DEFINITION_TYPES = ["TEXT", "DROPDOWN", "DECIMAL", "DATE", "CHECKBOX", "GROUP"] as const;
export type DefinitionType = typeof DEFINITION_TYPES[number];

export const SHOW_IN_ITEMS = 1;
export const SHOW_IN_SALES = 2;
export const SHOW_IN_RECEIVINGS = 4;

export interface DefinitionRow {
  definitionId: number;
  definitionName: string;
  definitionType: DefinitionType;
  definitionUnit: string | null;
  definitionFlags: number;
  definitionFk: number | null;
  deleted: boolean;
}

function toDefinitionRow(row: typeof attributeDefinitions.$inferSelect): DefinitionRow {
  return {
    definitionId: row.definitionId,
    definitionName: row.definitionName,
    definitionType: row.definitionType as DefinitionType,
    definitionUnit: row.definitionUnit,
    definitionFlags: row.definitionFlags,
    definitionFk: row.definitionFk,
    deleted: row.deleted,
  };
}

export async function listDefinitions(): Promise<DefinitionRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.deleted, false));
  return rows.map(toDefinitionRow);
}

export async function getDefinition(definitionId: number): Promise<DefinitionRow | null> {
  if (definitionId <= 0) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.definitionId, definitionId))
    .limit(1);
  return rows[0] ? toDefinitionRow(rows[0]) : null;
}

export async function listDropdownValues(
  definitionId: number,
): Promise<{ attributeId: number; attributeValue: string | null }[]> {
  const db = await getDb();
  const links = await db
    .select({ attributeId: attributeLinks.attributeId })
    .from(attributeLinks)
    .where(
      and(
        eq(attributeLinks.definitionId, definitionId),
        isNull(attributeLinks.itemId),
        isNull(attributeLinks.saleId),
        isNull(attributeLinks.receivingId),
      ),
    );
  const ids = links.map((l) => l.attributeId).filter((x): x is number => x !== null);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ attributeId: attributeValues.attributeId, attributeValue: attributeValues.attributeValue })
    .from(attributeValues)
    .where(inArray(attributeValues.attributeId, ids))
    .orderBy(asc(attributeValues.attributeValue));
  return rows;
}

export async function saveDefinition(
  data: {
    definitionId?: number;
    definitionName: string;
    definitionType: DefinitionType;
    definitionUnit: string | null;
    definitionFlags: number;
    definitionFk: number | null;
  },
  values: string[],
): Promise<number> {
  return withTransaction(async (tx) => {
    const { definitionId, ...rest } = data;
    let id: number;
    if (definitionId && definitionId > 0) {
      id = definitionId;
      await tx
        .update(attributeDefinitions)
        .set(rest)
        .where(eq(attributeDefinitions.definitionId, id));
    } else {
      const inserted = await tx
        .insert(attributeDefinitions)
        .values({ ...rest, deleted: false })
        .returning({ id: attributeDefinitions.definitionId });
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      id = result.id;
    }
    if (data.definitionType === "DROPDOWN") {
      for (const v of values) {
        const trimmed = v.trim();
        if (!trimmed) continue;
        const existingValue = await tx
          .select({ attributeId: attributeValues.attributeId })
          .from(attributeValues)
          .where(eq(attributeValues.attributeValue, trimmed))
          .limit(1);
        let attrId: number;
        if (existingValue[0]) {
          attrId = existingValue[0].attributeId;
        } else {
          const ins = await tx
            .insert(attributeValues)
            .values({ attributeValue: trimmed })
            .returning({ id: attributeValues.attributeId });
          const result = Array.isArray(ins) ? ins[0] : ins;
          attrId = result.id;
        }
        const linkExists = await tx
          .select({ attributeId: attributeLinks.attributeId })
          .from(attributeLinks)
          .where(
            and(
              eq(attributeLinks.definitionId, id),
              eq(attributeLinks.attributeId, attrId),
              isNull(attributeLinks.itemId),
              isNull(attributeLinks.saleId),
              isNull(attributeLinks.receivingId),
            ),
          )
          .limit(1);
        if (linkExists.length === 0) {
          await tx
            .insert(attributeLinks)
            .values({ definitionId: id, attributeId: attrId, itemId: null });
        }
      }
    }
    return id;
  });
}

export async function deleteDefinition(definitionId: number): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.delete(attributeLinks).where(eq(attributeLinks.definitionId, definitionId));
    await tx
      .update(attributeDefinitions)
      .set({ deleted: true })
      .where(eq(attributeDefinitions.definitionId, definitionId));
  });
}

export async function undeleteDefinition(definitionId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(attributeDefinitions)
    .set({ deleted: false })
    .where(eq(attributeDefinitions.definitionId, definitionId));
}

export async function definitionExists(
  definitionName: string,
  definitionType: DefinitionType,
  excludeId?: number,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ definitionId: attributeDefinitions.definitionId })
    .from(attributeDefinitions)
    .where(
      and(
        eq(attributeDefinitions.definitionName, definitionName),
        eq(attributeDefinitions.definitionType, definitionType),
      ),
    );
  if (rows.length === 0) return false;
  if (excludeId && rows[0].definitionId === excludeId) return false;
  return true;
}

export async function searchDefinitions(term: string, limit = 25): Promise<DefinitionRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(attributeDefinitions)
    .where(
      and(
        eq(attributeDefinitions.deleted, false),
        like(attributeDefinitions.definitionName, `%${term}%`),
      ),
    )
    .orderBy(asc(attributeDefinitions.definitionName))
    .limit(limit);
  return rows.map(toDefinitionRow);
}

export async function getAttributeRow(definitionId: number): Promise<DefinitionRow | null> {
  return getDefinition(definitionId);
}

export async function getAttributeValues(
  definitionId: number,
): Promise<{ attributeId: number; attributeValue: string | null }[]> {
  return listDropdownValues(definitionId);
}

export async function getAttributesByItem(
  itemId: number,
): Promise<
  Array<{
    definitionId: number;
    definitionName: string;
    definitionType: DefinitionType;
    value: string | null;
  }>
> {
  const db = await getDb();
  const rows = await db
    .select({
      definitionId: attributeLinks.definitionId,
      definitionName: attributeDefinitions.definitionName,
      definitionType: attributeDefinitions.definitionType,
      attributeValue: attributeValues.attributeValue,
    })
    .from(attributeLinks)
    .innerJoin(
      attributeDefinitions,
      eq(attributeDefinitions.definitionId, attributeLinks.definitionId),
    )
    .innerJoin(attributeValues, eq(attributeValues.attributeId, attributeLinks.attributeId))
    .where(
      and(
        eq(attributeLinks.itemId, itemId),
        isNull(attributeLinks.saleId),
        isNull(attributeLinks.receivingId),
        eq(attributeDefinitions.deleted, false),
      ),
    );
  return rows.map((r) => ({
    definitionId: r.definitionId,
    definitionName: r.definitionName,
    definitionType: r.definitionType as DefinitionType,
    value: r.attributeValue,
  }));
}

export async function saveAttributeValue(input: {
  definitionId: number;
  itemId: number;
  attributeValue?: string | null;
}): Promise<number> {
  return withTransaction(async (tx) => {
    const value = input.attributeValue ?? null;
    const existingLink = await tx
      .select({ attributeId: attributeLinks.attributeId })
      .from(attributeLinks)
      .where(
        and(
          eq(attributeLinks.definitionId, input.definitionId),
          eq(attributeLinks.itemId, input.itemId),
          isNull(attributeLinks.saleId),
          isNull(attributeLinks.receivingId),
        ),
      )
      .limit(1);

    let attributeId: number | null = null;
    if (value !== null) {
      const existingValue = await tx
        .select({ attributeId: attributeValues.attributeId })
        .from(attributeValues)
        .where(eq(attributeValues.attributeValue, value))
        .limit(1);
      attributeId = existingValue[0]?.attributeId ?? null;
    } else if (existingLink[0]?.attributeId != null) {
      attributeId = existingLink[0].attributeId;
    }
    if (attributeId === null) {
      const inserted = await tx
        .insert(attributeValues)
        .values({ attributeValue: value })
        .returning({ id: attributeValues.attributeId });
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      attributeId = result.id;
    }

    if (existingLink.length > 0) {
      await tx
        .update(attributeLinks)
        .set({ attributeId })
        .where(
          and(
            eq(attributeLinks.definitionId, input.definitionId),
            eq(attributeLinks.itemId, input.itemId),
            isNull(attributeLinks.saleId),
            isNull(attributeLinks.receivingId),
          ),
        );
    } else {
      await tx
        .insert(attributeLinks)
        .values({
          definitionId: input.definitionId,
          itemId: input.itemId,
          attributeId,
        });
    }
    return attributeId;
  });
}

export async function deleteAttributeValue(attributeId: number): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.delete(attributeLinks).where(eq(attributeLinks.attributeId, attributeId));
    await tx.delete(attributeValues).where(eq(attributeValues.attributeId, attributeId));
  });
}

export async function copyAttributeLinks(fromItemId: number, toItemId: number): Promise<void> {
  const db = await getDb();
  const links = await db
    .select()
    .from(attributeLinks)
    .where(
      and(
        eq(attributeLinks.itemId, fromItemId),
        isNull(attributeLinks.saleId),
        isNull(attributeLinks.receivingId),
      ),
    );
  for (const l of links) {
    await db
      .insert(attributeLinks)
      .values({
        definitionId: l.definitionId,
        itemId: toItemId,
        saleId: l.saleId,
        receivingId: l.receivingId,
        attributeId: l.attributeId,
      })
      .onConflictDoNothing();
  }
}

export async function getDefinitionsByFlags(flags: number): Promise<DefinitionRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(attributeDefinitions)
    .where(
      and(
        eq(attributeDefinitions.deleted, false),
        sql`(${attributeDefinitions.definitionFlags} & ${flags}) = ${flags}`,
      ),
    )
    .orderBy(asc(attributeDefinitions.definitionName));
  return rows.map(toDefinitionRow);
}

export async function getDefinitionNames(): Promise<
  { definitionId: number; definitionName: string }[]
> {
  const db = await getDb();
  return db
    .select({
      definitionId: attributeDefinitions.definitionId,
      definitionName: attributeDefinitions.definitionName,
    })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.deleted, false))
    .orderBy(asc(attributeDefinitions.definitionName));
}

export async function getTotalDefinitionRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.deleted, false));
  return Number(rows[0]?.c ?? 0);
}

export async function getSuggestions(term: string, limit = 25): Promise<DefinitionRow[]> {
  return searchDefinitions(term, limit);
}

export async function deleteOrphanedValues(): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.run(
      sql`DELETE FROM ospos_attribute_values
          WHERE attribute_id NOT IN (
            SELECT attribute_id FROM ospos_attribute_links WHERE attribute_id IS NOT NULL
          )`,
    );
  });
}

export async function getLinkValue(
  definitionId: number,
  itemId: number,
): Promise<{ attributeId: number; attributeValue: string | null } | null> {
  const db = await getDb();
  const rows = await db
    .select({
      attributeId: attributeValues.attributeId,
      attributeValue: attributeValues.attributeValue,
    })
    .from(attributeLinks)
    .innerJoin(attributeValues, eq(attributeValues.attributeId, attributeLinks.attributeId))
    .where(
      and(
        eq(attributeLinks.definitionId, definitionId),
        eq(attributeLinks.itemId, itemId),
        isNull(attributeLinks.saleId),
        isNull(attributeLinks.receivingId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}


/**
 * Type-aware item attribute save: DATE -> attribute_date, DECIMAL ->
 * attribute_decimal, CHECKBOX/TEXT/DROPDOWN -> attribute_value. Empty values
 * remove the link (and leave shared value rows for orphan cleanup).
 */
export async function saveTypedItemAttribute(input: {
  definitionId: number;
  itemId: number;
  definitionType: string;
  value: string | null;
}): Promise<void> {
  await withTransaction(async (tx) => {
    const value = input.value?.trim() ?? "";
    if (value === "") {
      await tx
        .delete(attributeLinks)
        .where(
          and(
            eq(attributeLinks.definitionId, input.definitionId),
            eq(attributeLinks.itemId, input.itemId),
            isNull(attributeLinks.saleId),
            isNull(attributeLinks.receivingId),
          ),
        );
      return;
    }

    let attributeId: number | null = null;
    if (input.definitionType === "DATE") {
      const rows = await tx
        .select({ id: attributeValues.attributeId })
        .from(attributeValues)
        .where(eq(attributeValues.attributeDate, value))
        .limit(1);
      attributeId =
        rows[0]?.id ??
        (
          await tx
            .insert(attributeValues)
            .values({ attributeDate: value })
            .returning({ id: attributeValues.attributeId })
        ).at(0)?.id ??
        null;
    } else if (input.definitionType === "DECIMAL") {
      const numeric = toDbDecimal(value, 3);
      const rows = await tx
        .select({ id: attributeValues.attributeId })
        .from(attributeValues)
        .where(eq(attributeValues.attributeDecimal, numeric))
        .limit(1);
      attributeId =
        rows[0]?.id ??
        (
          await tx
            .insert(attributeValues)
            .values({ attributeDecimal: numeric })
            .returning({ id: attributeValues.attributeId })
        ).at(0)?.id ??
        null;
    } else {
      const normalized =
        input.definitionType === "CHECKBOX"
          ? value === "1" || value.toLowerCase() === "true"
            ? "1"
            : "0"
          : value;
      const rows = await tx
        .select({ id: attributeValues.attributeId })
        .from(attributeValues)
        .where(eq(attributeValues.attributeValue, normalized))
        .limit(1);
      attributeId =
        rows[0]?.id ??
        (
          await tx
            .insert(attributeValues)
            .values({ attributeValue: normalized })
            .returning({ id: attributeValues.attributeId })
        ).at(0)?.id ??
        null;
    }

    if (attributeId === null) throw new Error("Could not store attribute value");
    await tx
      .delete(attributeLinks)
      .where(
        and(
          eq(attributeLinks.definitionId, input.definitionId),
          eq(attributeLinks.itemId, input.itemId),
          isNull(attributeLinks.saleId),
          isNull(attributeLinks.receivingId),
        ),
      );
    await tx.insert(attributeLinks).values({
      attributeId,
      definitionId: input.definitionId,
      itemId: input.itemId,
    });
  });
}
