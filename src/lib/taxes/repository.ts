import { eq, and, sql, like, asc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { taxCategories, taxCodes, taxJurisdictions, taxCodeLinks } from "@/db/schema";

export interface TaxCategoryRow {
  taxCategoryId: number;
  taxCategory: string;
  taxGroupSeq: string | null;
  deleted: boolean;
}

export interface TaxCodeRow {
  taxCodeId: number;
  taxCode: string;
  taxCodeName: string;
  city: string | null;
  state: string | null;
  deleted: boolean;
}

export interface TaxJurisdictionRow {
  jurisdictionId: number;
  jurisdictionName: string;
  taxType: string;
  reportingAuthority: string | null;
  taxableAmount: number | null;
  taxRate: number;
  taxGroup: string | null;
  roundCode: number;
  cascadeSequence: number;
  deleted: boolean;
}

export interface TaxCodeLinkRow {
  taxCodeId: number;
  taxCategoryId: number;
  jurisdictionId: number;
  taxRate: number;
  roundCode: number;
  cascadeSequence: number;
}

export function getAllTaxCategories(): TaxCategoryRow[] {
  return getDbSync().select().from(taxCategories)
    .where(eq(taxCategories.deleted, false))
    .orderBy(asc(taxCategories.taxCategory))
    .all() as TaxCategoryRow[];
}

export function getTaxCategory(taxCategoryId: number): TaxCategoryRow | null {
  return (getDbSync().select().from(taxCategories)
    .where(eq(taxCategories.taxCategoryId, taxCategoryId)).get() as TaxCategoryRow) ?? null;
}

export function getEmptyTaxCategory(): TaxCategoryRow {
  return { taxCategoryId: 0, taxCategory: "", taxGroupSeq: null, deleted: false };
}

export function saveTaxCategory(input: TaxCategoryRow): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.taxCategoryId) {
      tx.update(taxCategories).set({ taxCategory: input.taxCategory, taxGroupSeq: input.taxGroupSeq })
        .where(eq(taxCategories.taxCategoryId, input.taxCategoryId)).run();
      return input.taxCategoryId;
    }
    return tx.insert(taxCategories).values({
      taxCategory: input.taxCategory, taxGroupSeq: input.taxGroupSeq, deleted: false,
    }).returning({ id: taxCategories.taxCategoryId }).get().id;
  });
}

export function deleteTaxCategory(taxCategoryId: number): void {
  getDbSync().update(taxCategories).set({ deleted: true })
    .where(eq(taxCategories.taxCategoryId, taxCategoryId)).run();
}

export function getTaxCategorySuggestions(term: string, limit = 25): TaxCategoryRow[] {
  return getDbSync().select().from(taxCategories)
    .where(and(eq(taxCategories.deleted, false), like(taxCategories.taxCategory, `%${term}%`)))
    .orderBy(asc(taxCategories.taxCategory)).limit(limit).all() as TaxCategoryRow[];
}

export function getAllTaxCodes(): TaxCodeRow[] {
  return getDbSync().select().from(taxCodes)
    .where(eq(taxCodes.deleted, false))
    .orderBy(asc(taxCodes.taxCodeName))
    .all() as TaxCodeRow[];
}

export function getTaxCode(taxCodeId: number): TaxCodeRow | null {
  return (getDbSync().select().from(taxCodes)
    .where(eq(taxCodes.taxCodeId, taxCodeId)).get() as TaxCodeRow) ?? null;
}

export function getEmptyTaxCode(): TaxCodeRow {
  return { taxCodeId: 0, taxCode: "", taxCodeName: "", city: null, state: null, deleted: false };
}

export function saveTaxCode(input: { taxCodeId?: number; taxCode: string; taxCodeName: string; city: string | null; state: string | null; jurisdictions: TaxCodeLinkRow[] }): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    let id = input.taxCodeId;
    if (id) {
      tx.update(taxCodes).set({
        taxCode: input.taxCode, taxCodeName: input.taxCodeName,
        city: input.city, state: input.state,
      }).where(eq(taxCodes.taxCodeId, id)).run();
    } else {
      id = tx.insert(taxCodes).values({
        taxCode: input.taxCode, taxCodeName: input.taxCodeName,
        city: input.city, state: input.state, deleted: false,
      }).returning({ id: taxCodes.taxCodeId }).get().id;
    }
    tx.delete(taxCodeLinks).where(eq(taxCodeLinks.taxCodeId, id!)).run();
    for (const j of input.jurisdictions) {
      tx.insert(taxCodeLinks).values({ taxCodeId: id!, jurisdictionId: j.jurisdictionId, taxCategoryId: j.taxCategoryId, taxRate: j.taxRate, roundCode: j.roundCode, cascadeSequence: j.cascadeSequence }).run();
    }
    return id!;
  });
}

export function deleteTaxCode(taxCodeId: number): void {
  getDbSync().update(taxCodes).set({ deleted: true }).where(eq(taxCodes.taxCodeId, taxCodeId)).run();
}

export function getTaxCodeSearchSuggestions(term: string, limit = 25): TaxCodeRow[] {
  return getDbSync().select().from(taxCodes)
    .where(and(eq(taxCodes.deleted, false), like(taxCodes.taxCodeName, `%${term}%`)))
    .orderBy(asc(taxCodes.taxCodeName)).limit(limit).all() as TaxCodeRow[];
}

export function getTaxCodeLinks(taxCodeId: number): TaxCodeLinkRow[] {
  return getDbSync().select().from(taxCodeLinks)
    .where(eq(taxCodeLinks.taxCodeId, taxCodeId)).all() as TaxCodeLinkRow[];
}

export function getAllJurisdictions(): TaxJurisdictionRow[] {
  return getDbSync().select().from(taxJurisdictions)
    .where(eq(taxJurisdictions.deleted, false))
    .orderBy(asc(taxJurisdictions.jurisdictionName))
    .all() as TaxJurisdictionRow[];
}

export function getJurisdiction(jurisdictionId: number): TaxJurisdictionRow | null {
  return (getDbSync().select().from(taxJurisdictions)
    .where(eq(taxJurisdictions.jurisdictionId, jurisdictionId)).get() as TaxJurisdictionRow) ?? null;
}

export function getEmptyJurisdiction(): TaxJurisdictionRow {
  return { jurisdictionId: 0, jurisdictionName: "", taxType: "EXCLUDED", reportingAuthority: null, taxableAmount: null, taxRate: 0, taxGroup: null, roundCode: 1, cascadeSequence: 0, deleted: false };
}

export function saveJurisdiction(input: TaxJurisdictionRow): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.jurisdictionId) {
      tx.update(taxJurisdictions).set({
        jurisdictionName: input.jurisdictionName, taxType: input.taxType,
        reportingAuthority: input.reportingAuthority, taxableAmount: input.taxableAmount,
        taxRate: input.taxRate, taxGroup: input.taxGroup,
        roundCode: input.roundCode, cascadeSequence: input.cascadeSequence,
      }).where(eq(taxJurisdictions.jurisdictionId, input.jurisdictionId)).run();
      return input.jurisdictionId;
    }
    return tx.insert(taxJurisdictions).values({
      jurisdictionName: input.jurisdictionName, taxType: input.taxType,
      reportingAuthority: input.reportingAuthority, taxableAmount: input.taxableAmount,
      taxRate: input.taxRate, taxGroup: input.taxGroup,
      roundCode: input.roundCode, cascadeSequence: input.cascadeSequence, deleted: false,
    }).returning({ id: taxJurisdictions.jurisdictionId }).get().id;
  });
}

export function deleteJurisdiction(jurisdictionId: number): void {
  getDbSync().update(taxJurisdictions).set({ deleted: true })
    .where(eq(taxJurisdictions.jurisdictionId, jurisdictionId)).run();
}

export function getTaxCategoryUsage(taxCategoryId: number): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` })
    .from(taxCodeLinks).where(eq(taxCodeLinks.taxCategoryId, taxCategoryId)).get();
  return r?.c ?? 0;
}

export function getRateInfo(taxCodeId: number, taxCategoryId: number): number {
  const r = getDbSync().select({ r: taxCodeLinks.taxRate })
    .from(taxCodeLinks)
    .where(and(eq(taxCodeLinks.taxCodeId, taxCodeId), eq(taxCodeLinks.taxCategoryId, taxCategoryId)))
    .get();
  return r?.r ?? 0;
}

export function getTaxCategoryId(name: string): number | null {
  const r = getDbSync().select({ id: taxCategories.taxCategoryId })
    .from(taxCategories).where(and(eq(taxCategories.taxCategory, name), eq(taxCategories.deleted, false)))
    .get();
  return r?.id ?? null;
}

export const getTaxCategories = getAllTaxCategories;
