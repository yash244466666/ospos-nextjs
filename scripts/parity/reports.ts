import { REPORTS } from "../../src/lib/reports/registry";
import { fail, ok } from "./lib";
import { DRIVER } from "./db";

async function main(): Promise<void> {
  const differences: { table: string; issue: string }[] = [];
  for (const report of REPORTS) {
    try {
      await report.run({
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
      });
    } catch (error) {
      differences.push({
        table: report.key,
        issue: (error as Error).message,
      });
    }
  }
  if (differences.length > 0) fail(differences, `Report execution (${DRIVER})`);
  ok(`Report execution PASS (${DRIVER}): ${REPORTS.length} report keys`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Report parity failed:", (error as Error).message);
  process.exit(2);
});
