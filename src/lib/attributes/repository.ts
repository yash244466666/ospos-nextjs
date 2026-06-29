import { and, eq, isNull } from "drizzle-orm";
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