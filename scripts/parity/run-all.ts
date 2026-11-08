import { execFileSync } from "node:child_process";
import path from "node:path";

interface Gate {
  name: string;
  command: string;
  args: string[];
}

const driver = (process.env.DB_DRIVER ?? "sqlite") as "sqlite" | "mysql";

const gates: Gate[] = [
  ...(driver === "mysql"
    ? [{ name: "schema", command: "npx", args: ["tsx", "scripts/parity/mysql-schema.ts"] }]
    : [{ name: "schema", command: "npx", args: ["tsx", "scripts/parity/sqlite-schema.ts"] }]),
  { name: "config", command: "npx", args: ["tsx", "scripts/parity/config-keys.ts"] },
  { name: "seed", command: "npx", args: ["tsx", "scripts/parity/seed.ts"] },
  { name: "locales", command: "npx", args: ["tsx", "scripts/parity/locale-keys.ts"] },
  { name: "no-stubs", command: "bash", args: ["scripts/parity/no-stubs.sh"] },
  { name: "sql-safety", command: "bash", args: ["scripts/parity/sql-safety.sh"] },
];

const failures: string[] = [];
for (const gate of gates) {
  process.stdout.write(`\n▶ ${gate.name} (${driver})\n`);
  try {
    execFileSync(gate.command, gate.args, {
      stdio: "inherit",
      cwd: path.resolve(process.cwd()),
      env: process.env,
    });
  } catch {
    failures.push(gate.name);
  }
}

if (failures.length > 0) {
  console.error(`\nParity gates failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nAll parity gates passed (${driver}).`);
