import { and, asc, eq, like, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { taxCategories, taxCodes, taxJurisdictions, taxRates } from "@/db/schema";
import { toDbDecimal } from "@/lib/money";

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
  taxType: number;
  reportingAuthority: string | null;
  taxGroup: string;
  taxGroupSequence: number;
  cascadeSequence: number;
  deleted: boolean;
}

export interface TaxCodeLinkRow {
  taxCodeId: number;
  taxCategoryId: number;
  jurisdictionId: number;
  taxRate: string;
  roundCode: number;
  cascadeSequence: number;
  taxRateId?: number;
  /** Legacy alias for `taxRateId`, retained for the tax-rate screens. */
  taxCodeLinkId?: number;
  taxCode?: string | null;
  taxCodeName?: string | null;
  taxCategory?: string | null;
  jurisdictionName?: string | null;
}

export async function getAllTaxCategories(): Promise<TaxCategoryRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      taxCategoryId: taxCategories.taxCategoryId,
      taxCategory: taxCategories.taxCategory,
      taxGroupSeq: taxCategories.taxGroupSequence,
      deleted: taxCategories.deleted,
    })
    .from(taxCategories)
    .where(eq(taxCategories.deleted, false))
    .orderBy(asc(taxCategories.taxGroupSequence), asc(taxCategories.taxCategory));
  return rows.map((r) => ({
    ...r,
    taxGroupSeq: r.taxGroupSeq === null ? null : String(r.taxGroupSeq),
  }));
}

export async function getTaxCategory(taxCategoryId: number): Promise<TaxCategoryRow | null> {
  const db = await getDb();
  const rows = await db
    .select({
      taxCategoryId: taxCategories.taxCategoryId,
      taxCategory: taxCategories.taxCategory,
      taxGroupSeq: taxCategories.taxGroupSequence,
      deleted: taxCategories.deleted,
    })
    .from(taxCategories)
    .where(and(eq(taxCategories.taxCategoryId, taxCategoryId), eq(taxCategories.deleted, false)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, taxGroupSeq: String(row.taxGroupSeq) };
}

export function getEmptyTaxCategory(): TaxCategoryRow {
  return { taxCategoryId: 0, taxCategory: "", taxGroupSeq: null, deleted: false };
}

export async function saveTaxCategory(input: TaxCategoryRow): Promise<number> {
  const values = {
    taxCategory: input.taxCategory,
    taxGroupSequence: Number(input.taxGroupSeq ?? 0) || 0,
  };
  return withTransaction(async (tx) => {
    if (input.taxCategoryId) {
      await tx
        .update(taxCategories)
        .set(values)
        .where(eq(taxCategories.taxCategoryId, input.taxCategoryId));
      return input.taxCategoryId;
    }
    const inserted = await insertReturning(tx, taxCategories, { ...values, deleted: false }, taxCategories.taxCategoryId);
    const result = Array.isArray(inserted) ? inserted[0] : inserted;
    return result.id;
  });
}

export async function deleteTaxCategory(taxCategoryId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(taxCategories)
    .set({ deleted: true })
    .where(eq(taxCategories.taxCategoryId, taxCategoryId));
}

export async function getTaxCategorySuggestions(
  term: string,
  limit = 25,
): Promise<TaxCategoryRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      taxCategoryId: taxCategories.taxCategoryId,
      taxCategory: taxCategories.taxCategory,
      taxGroupSeq: taxCategories.taxGroupSequence,
      deleted: taxCategories.deleted,
    })
    .from(taxCategories)
    .where(and(eq(taxCategories.deleted, false), like(taxCategories.taxCategory, `%${term}%`)))
    .orderBy(asc(taxCategories.taxCategory))
    .limit(limit);
  return rows.map((r) => ({ ...r, taxGroupSeq: String(r.taxGroupSeq) }));
}

export async function getAllTaxCodes(): Promise<TaxCodeRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(taxCodes)
    .where(eq(taxCodes.deleted, false))
    .orderBy(asc(taxCodes.taxCodeName));
}

export async function getTaxCode(taxCodeId: number): Promise<TaxCodeRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(taxCodes)
    .where(and(eq(taxCodes.taxCodeId, taxCodeId), eq(taxCodes.deleted, false)))
    .limit(1);
  return rows[0] ?? null;
}

export function getEmptyTaxCode(): TaxCodeRow {
  return { taxCodeId: 0, taxCode: "", taxCodeName: "", city: null, state: null, deleted: false };
}

export async function saveTaxCode(input: {
  taxCodeId?: number;
  taxCode: string;
  taxCodeName: string;
  city: string | null;
  state: string | null;
  jurisdictions: TaxCodeLinkRow[];
}): Promise<number> {
  return withTransaction(async (tx) => {
    let id = input.taxCodeId;
    const values = {
      taxCode: input.taxCode,
      taxCodeName: input.taxCodeName,
      city: input.city ?? "",
      state: input.state ?? "",
    };
    if (id) {
      await tx.update(taxCodes).set(values).where(eq(taxCodes.taxCodeId, id));
    } else {
      const inserted = await insertReturning(tx, taxCodes, { ...values, deleted: false }, taxCodes.taxCodeId);
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      id = result.id;
    }
    await tx.delete(taxRates).where(eq(taxRates.rateTaxCodeId, id));
    for (const j of input.jurisdictions) {
      await insertReturning(tx, taxRates, {
        rateTaxCodeId: id,
        rateTaxCategoryId: j.taxCategoryId,
        rateJurisdictionId: j.jurisdictionId,
        taxRate: toDbDecimal(j.taxRate, 4),
        taxRoundingCode: j.roundCode,
      });
    }
    return id;
  });
}

export async function deleteTaxCode(taxCodeId: number): Promise<void> {
  const db = await getDb();
  await db.update(taxCodes).set({ deleted: true }).where(eq(taxCodes.taxCodeId, taxCodeId));
}

export async function getTaxCodeSearchSuggestions(
  term: string,
  limit = 25,
): Promise<TaxCodeRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(taxCodes)
    .where(and(eq(taxCodes.deleted, false), like(taxCodes.taxCodeName, `%${term}%`)))
    .orderBy(asc(taxCodes.taxCodeName))
    .limit(limit);
}

export async function getTaxCodeLinks(taxCodeId: number): Promise<TaxCodeLinkRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      taxRateId: taxRates.taxRateId,
      taxCodeId: taxRates.rateTaxCodeId,
      taxCategoryId: taxRates.rateTaxCategoryId,
      jurisdictionId: taxRates.rateJurisdictionId,
      taxRate: taxRates.taxRate,
      roundCode: taxRates.taxRoundingCode,
      cascadeSequence: taxJurisdictions.cascadeSequence,
      taxCode: taxCodes.taxCode,
      taxCodeName: taxCodes.taxCodeName,
      taxCategory: taxCategories.taxCategory,
      jurisdictionName: taxJurisdictions.jurisdictionName,
    })
    .from(taxRates)
    .leftJoin(taxCodes, eq(taxCodes.taxCodeId, taxRates.rateTaxCodeId))
    .leftJoin(taxCategories, eq(taxCategories.taxCategoryId, taxRates.rateTaxCategoryId))
    .leftJoin(taxJurisdictions, eq(taxJurisdictions.jurisdictionId, taxRates.rateJurisdictionId))
    .where(eq(taxRates.rateTaxCodeId, taxCodeId))
    .orderBy(asc(taxJurisdictions.cascadeSequence), asc(taxJurisdictions.taxGroup));
  return rows.map((r) => ({
    ...r,
    taxCodeLinkId: r.taxRateId,
    cascadeSequence: r.cascadeSequence ?? 0,
    jurisdictionName: r.jurisdictionName ?? "",
  }));
}

export async function getAllJurisdictions(): Promise<TaxJurisdictionRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(taxJurisdictions)
    .where(eq(taxJurisdictions.deleted, false))
    .orderBy(asc(taxJurisdictions.jurisdictionName));
  return rows.map((r) => ({ ...r, jurisdictionName: r.jurisdictionName ?? "" }));
}

export async function getJurisdiction(
  jurisdictionId: number,
): Promise<TaxJurisdictionRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(taxJurisdictions)
    .where(
      and(
        eq(taxJurisdictions.jurisdictionId, jurisdictionId),
        eq(taxJurisdictions.deleted, false),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, jurisdictionName: row.jurisdictionName ?? "" };
}

export function getEmptyJurisdiction(): TaxJurisdictionRow {
  return {
    jurisdictionId: 0,
    jurisdictionName: "",
    taxType: 1,
    reportingAuthority: null,
    taxGroup: "",
    taxGroupSequence: 0,
    cascadeSequence: 0,
    deleted: false,
  };
}

export async function saveJurisdiction(input: TaxJurisdictionRow): Promise<number> {
  const values = {
    jurisdictionName: input.jurisdictionName ?? "",
    taxType: Number(input.taxType) || 0,
    reportingAuthority: input.reportingAuthority,
    taxGroup: input.taxGroup ?? "",
    taxGroupSequence: Number(input.taxGroupSequence) || 0,
    cascadeSequence: Number(input.cascadeSequence) || 0,
  };
  return withTransaction(async (tx) => {
    if (input.jurisdictionId) {
      await tx
        .update(taxJurisdictions)
        .set(values)
        .where(eq(taxJurisdictions.jurisdictionId, input.jurisdictionId));
      return input.jurisdictionId;
    }
    const inserted = await insertReturning(
      tx,
      taxJurisdictions,
      { ...values, deleted: false },
      taxJurisdictions.jurisdictionId,
    );
    return inserted[0]!.id;
  });
}

export async function deleteJurisdiction(jurisdictionId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(taxJurisdictions)
    .set({ deleted: true })
    .where(eq(taxJurisdictions.jurisdictionId, jurisdictionId));
}

export async function getTaxCategoryUsage(taxCategoryId: number): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(taxRates)
    .where(eq(taxRates.rateTaxCategoryId, taxCategoryId));
  return Number(rows[0]?.c ?? 0);
}

export async function getRateInfo(taxCodeId: number, taxCategoryId: number): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select({ r: taxRates.taxRate })
    .from(taxRates)
    .where(
      and(eq(taxRates.rateTaxCodeId, taxCodeId), eq(taxRates.rateTaxCategoryId, taxCategoryId)),
    )
    .limit(1);
  return rows[0]?.r ?? "0";
}

export async function getTaxCategoryId(name: string): Promise<number | null> {
  const db = await getDb();
  const rows = await db
    .select({ id: taxCategories.taxCategoryId })
    .from(taxCategories)
    .where(and(eq(taxCategories.taxCategory, name), eq(taxCategories.deleted, false)))
    .limit(1);
  return rows[0]?.id ?? null;
}

export const getTaxCategories = getAllTaxCategories;
