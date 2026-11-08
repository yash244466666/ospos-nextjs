import { beforeEach, describe, expect, it } from "vitest";
import { execMysql, queryMysql, truncateMysqlTables } from "@/test/mysql-db";
import { acquireNextSequence, getConfig, invalidateConfigCache, loadConfig, setConfig, setConfigBatch } from "./index";

beforeEach(async () => {
  await truncateMysqlTables();
  await execMysql(
    "INSERT INTO ospos_app_config (`key`, value) VALUES ('company', 'Open Source Point of Sale'), ('last_used_invoice_number', '1')",
  );
  invalidateConfigCache();
  await loadConfig(true);
});

describe("config repository on MySQL", () => {
  it("inserts then updates a key without ON CONFLICT support", async () => {
    await setConfig("company", "Updated Co");
    const rows = await queryMysql<{ value: string }>(
      "SELECT value FROM ospos_app_config WHERE `key` = 'company'",
    );
    expect(rows[0].value).toBe("Updated Co");

    await setConfig("company", "Updated Again");
    const rows2 = await queryMysql<{ value: string }>(
      "SELECT value FROM ospos_app_config WHERE `key` = 'company'",
    );
    expect(rows2[0].value).toBe("Updated Again");
  });

  it("saves a batch transactionally", async () => {
    await setConfigBatch({ company: "Batch Co", phone: "123" });
    const rows = await queryMysql<{ key: string; value: string }>(
      "SELECT `key`, value FROM ospos_app_config WHERE `key` IN ('company', 'phone') ORDER BY `key`",
    );
    expect(rows).toEqual([
      { key: "company", value: "Batch Co" },
      { key: "phone", value: "123" },
    ]);
    await loadConfig(true);
    expect(getConfig("company")).toBe("Batch Co");
  });

  it("increments the invoice sequence atomically", async () => {
    expect(await acquireNextSequence("last_used_invoice_number")).toBe(2);
    expect(await acquireNextSequence("last_used_invoice_number")).toBe(3);
    const rows = await queryMysql<{ value: string }>(
      "SELECT value FROM ospos_app_config WHERE `key` = 'last_used_invoice_number'",
    );
    expect(rows[0].value).toBe("3");
  });

  it("serializes concurrent sequence acquisition without duplicates", async () => {
    const values = await Promise.all(
      Array.from({ length: 10 }, () => acquireNextSequence("last_used_invoice_number")),
    );
    expect(new Set(values).size).toBe(10);
    expect([...values].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("creates a missing sequence key at 1", async () => {
    expect(await acquireNextSequence("last_used_quote_number")).toBe(1);
    expect(await acquireNextSequence("last_used_quote_number")).toBe(2);
  });
});
