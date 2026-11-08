import { queryRows, DRIVER } from "./db";
import { APP_CONFIG_DEFAULTS } from "../../src/db/seed-data";
import { fail, ok, type Difference } from "./lib";

async function main(): Promise<void> {
  const rows = await queryRows<{ key: string; value: string }>(
    "SELECT `key`, value FROM ospos_app_config",
  );
  const differences: Difference[] = [];
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  for (const [key, expected] of Object.entries(APP_CONFIG_DEFAULTS)) {
    if (!byKey.has(key)) differences.push({ table: "app_config", issue: `missing ${key}` });
    else if (byKey.get(key) !== expected) {
      differences.push({
        table: "app_config",
        issue: `${key} = ${JSON.stringify(byKey.get(key))} != ${JSON.stringify(expected)}`,
      });
    }
  }
  // Upstream's integrations tab writes these optional keys on demand; they
  // are not part of the 138-key default seed.
  const OPTIONAL_KEYS = new Set(["mailchimp_api_key", "mailchimp_list_id"]);
  for (const key of byKey.keys()) {
    if (!(key in APP_CONFIG_DEFAULTS) && !OPTIONAL_KEYS.has(key)) {
      differences.push({ table: "app_config", issue: `unexpected ${key}` });
    }
  }

  const expectedCount = Object.keys(APP_CONFIG_DEFAULTS).length;
  const missingOptional = [...byKey.keys()].filter((key) => OPTIONAL_KEYS.has(key)).length;
  if (rows.length !== expectedCount + missingOptional) {
    differences.push({
      table: "app_config",
      issue: `row count ${rows.length} != ${expectedCount + missingOptional}`,
    });
  }
  if (differences.length > 0) fail(differences, `Config key parity (${DRIVER})`);
  ok(`Config key parity PASS (${DRIVER}): ${expectedCount} seeded keys`);
}

main().catch((error: unknown) => {
  console.error("Config parity failed:", (error as Error).message);
  process.exit(2);
});
