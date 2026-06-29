import { and, eq, isNull, sql, like, asc, desc, ne, or } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { attributeDefinitions, attributeValues, attributeLinks } from "@/db/schema";

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

export function listDefinitions(): DefinitionRow[] {
  const db = getDbSync();
  return db.select().from(attributeDefinitions).where(eq(attributeDefinitions.deleted, false)).all();
}

export function getDefinition(definitionId: number): DefinitionRow | null {
  if (definitionId <= 0) return null;
  const db = getDbSync();
  return db.select().from(attributeDefinitions).where(eq(attributeDefinitions.definitionId, definitionId)).get() ?? null;
}

export function listDropdownValues(definitionId: number): { attributeId: number; attributeValue: string | null }[] {
  const db = getDbSync();
  const links = db.select({ attributeId: attributeLinks.attributeId }).from(attributeLinks)
    .where(and(eq(attributeLinks.definitionId, definitionId), isNull(attributeLinks.itemId))).all();
  const ids = links.map((l) => l.attributeId).filter((x): x is number => x !== null);
  if (ids.length === 0) return [];
  const rows = db.select().from(attributeValues).all().filter((v) => ids.includes(v.attributeId));
  return rows.map((r) => ({ attributeId: r.attributeId, attributeValue: r.attributeValue }));
}

export function saveDefinition(data: {
  definitionId?: number;
  definitionName: string;
  definitionType: DefinitionType;
  definitionUnit: string | null;
  definitionFlags: number;
  definitionFk: number | null;
}, values: string[]): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    const { definitionId, ...rest } = data;
    let id: number;
    if (definitionId && definitionId > 0) {
      id = definitionId;
      tx.update(attributeDefinitions).set(rest).where(eq(attributeDefinitions.definitionId, id)).run();
    } else {
      const inserted = tx.insert(attributeDefinitions).values({ ...rest, deleted: false }).returning({ id: attributeDefinitions.definitionId }).get();
      id = inserted.id;
    }
    if (data.definitionType === "DROPDOWN") {
      for (const v of values) {
        const trimmed = v.trim();
        if (!trimmed) continue;
        const existing = tx.select().from(attributeValues).all().find((row) => row.attributeValue === trimmed);
        let attrId: number;
        if (existing) {
          attrId = existing.attributeId;
        } else {
          const ins = tx.insert(attributeValues).values({ attributeValue: trimmed }).returning({ id: attributeValues.attributeId }).get();
          attrId = ins.id;
        }
        const linkExists = tx.select().from(attributeLinks).all().find(
          (l) => l.definitionId === id && l.attributeId === attrId && l.itemId == null
        );
        if (!linkExists) {
          tx.insert(attributeLinks).values({ definitionId: id, attributeId: attrId, itemId: null }).run();
        }
      }
    }
    return id;
  });
}

export function deleteDefinition(definitionId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    tx.delete(attributeLinks).where(eq(attributeLinks.definitionId, definitionId)).run();
    tx.update(attributeDefinitions).set({ deleted: true }).where(eq(attributeDefinitions.definitionId, definitionId)).run();
  });
}

export function undeleteDefinition(definitionId: number): void {
  getDbSync().update(attributeDefinitions).set({ deleted: false })
    .where(eq(attributeDefinitions.definitionId, definitionId)).run();
}

export function definitionExists(definitionName: string, definitionType: DefinitionType, excludeId?: number): boolean {
  const db = getDbSync();
  const row = db.select().from(attributeDefinitions)
    .where(and(eq(attributeDefinitions.definitionName, definitionName), eq(attributeDefinitions.definitionType, definitionType)))
    .get();
  if (!row) return false;
  if (excludeId && row.definitionId === excludeId) return false;
  return true;
}

export function searchDefinitions(term: string, limit = 25): DefinitionRow[] {
  return getDbSync().select().from(attributeDefinitions)
    .where(and(eq(attributeDefinitions.deleted, false), like(attributeDefinitions.definitionName, `%${term}%`)))
    .orderBy(asc(attributeDefinitions.definitionName)).limit(limit).all() as DefinitionRow[];
}

export function getAttributeRow(definitionId: number): DefinitionRow | null {
  return getDefinition(definitionId);
}

export function getAttributeValues(definitionId: number): { attributeId: number; attributeValue: string | null }[] {
  return listDropdownValues(definitionId);
}

export function getAttributesByItem(itemId: number): Array<{ definitionId: number; definitionName: string; definitionType: DefinitionType; value: string | null }> {
  const db = getDbSync();
  const rows = db.select({
    definitionId: attributeLinks.definitionId,
    definitionName: attributeDefinitions.definitionName,
    definitionType: attributeDefinitions.definitionType,
    attributeValue: attributeValues.attributeValue,
  })
    .from(attributeLinks)
    .innerJoin(attributeDefinitions, eq(attributeDefinitions.definitionId, attributeLinks.definitionId))
    .innerJoin(attributeValues, eq(attributeValues.attributeId, attributeLinks.attributeId))
    .where(and(eq(attributeLinks.itemId, itemId), eq(attributeDefinitions.deleted, false)))
    .all();
  return rows as any;
}

export function saveAttributeValue(input: { definitionId: number; itemId: number; attributeValue?: string | null }): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    const existing = tx.select().from(attributeLinks)
      .where(and(eq(attributeLinks.definitionId, input.definitionId), eq(attributeLinks.itemId, input.itemId)))
      .get();
    if (existing) {
      const aid = existing.attributeId!;
      tx.update(attributeValues).set({ attributeValue: input.attributeValue ?? null })
        .where(eq(attributeValues.attributeId, aid)).run();
      return aid;
    }
    const v = tx.insert(attributeValues).values({ attributeValue: input.attributeValue ?? null })
      .returning({ id: attributeValues.attributeId }).get();
    tx.insert(attributeLinks).values({ definitionId: input.definitionId, itemId: input.itemId, attributeId: v.id }).run();
    return v.id;
  });
}

export function deleteAttributeValue(attributeId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    tx.delete(attributeLinks).where(eq(attributeLinks.attributeId, attributeId)).run();
    tx.delete(attributeValues).where(eq(attributeValues.attributeId, attributeId)).run();
  });
}

export function copyAttributeLinks(fromItemId: number, toItemId: number): void {
  const db = getDbSync();
  const links = db.select().from(attributeLinks).where(eq(attributeLinks.itemId, fromItemId)).all();
  for (const l of links) {
    db.insert(attributeLinks).values({
      definitionId: l.definitionId, itemId: toItemId, saleId: l.saleId, receivingId: l.receivingId, attributeId: l.attributeId,
    }).onConflictDoNothing().run();
  }
}

export function getDefinitionsByFlags(flags: number): DefinitionRow[] {
  return getDbSync().select().from(attributeDefinitions)
    .where(and(eq(attributeDefinitions.deleted, false), sql`(${attributeDefinitions.definitionFlags} & ${flags}) = ${flags}`))
    .orderBy(asc(attributeDefinitions.definitionName))
    .all() as DefinitionRow[];
}

export function getDefinitionNames(): { definitionId: number; definitionName: string }[] {
  return getDbSync().select({ definitionId: attributeDefinitions.definitionId, definitionName: attributeDefinitions.definitionName })
    .from(attributeDefinitions).where(eq(attributeDefinitions.deleted, false))
    .orderBy(asc(attributeDefinitions.definitionName))
    .all() as { definitionId: number; definitionName: string }[];
}

export function getTotalDefinitionRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` }).from(attributeDefinitions)
    .where(eq(attributeDefinitions.deleted, false)).get();
  return r?.c ?? 0;
}

export function getSuggestions(term: string, limit = 25): DefinitionRow[] {
  return searchDefinitions(term, limit);
}

export function deleteOrphanedValues(definitionId: number): void {
  const db = getDbSync();
  const orphanIds = db.select({ id: attributeValues.attributeId }).from(attributeValues)
    .innerJoin(attributeLinks, eq(attributeLinks.attributeId, attributeValues.attributeId))
    .where(and(eq(attributeLinks.definitionId, definitionId), isNull(attributeLinks.itemId))).all();
  for (const o of orphanIds) {
    db.delete(attributeLinks).where(eq(attributeLinks.attributeId, o.id!)).run();
    db.delete(attributeValues).where(eq(attributeValues.attributeId, o.id!)).run();
  }
}

export function getLinkValue(definitionId: number, itemId: number): { attributeId: number; attributeValue: string | null } | null {
  const db = getDbSync();
  const row = db.select({ attributeId: attributeValues.attributeId, attributeValue: attributeValues.attributeValue })
    .from(attributeLinks)
    .innerJoin(attributeValues, eq(attributeValues.attributeId, attributeLinks.attributeId))
    .where(and(eq(attributeLinks.definitionId, definitionId), eq(attributeLinks.itemId, itemId)))
    .get();
  return (row as any) ?? null;
}

void ne;
void or;
void desc;