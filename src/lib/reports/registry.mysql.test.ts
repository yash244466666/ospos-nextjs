import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";
import { REPORTS } from "./registry";

beforeAll(async () => {
  await loadConfig(true);
});

describe("report registry on MySQL", () => {
  it("executes every report key without a dialect error", async () => {
    for (const report of REPORTS) {
      await expect(
        report.run({
          start: "2000-01-01",
          end: "2100-12-31",
          saleType: "complete",
          locationId: "all",
          discountType: "0",
          discount: "0",
          customerId: "0",
          employeeId: "0",
          supplierId: "0",
          itemCount: "all",
          receivingType: "all",
        }),
        report.key,
      ).resolves.toBeInstanceOf(Array);
    }
  });
});
