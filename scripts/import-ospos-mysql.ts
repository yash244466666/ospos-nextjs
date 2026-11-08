import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { copyOsposDatabase } from "./lib/copy-ospos-mysql";

interface Args {
  source: string;
  target: string;
  force: boolean;
  dryRun: boolean;
  includeSessions: boolean;
  verify: boolean;
  backup: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    source: process.env.SOURCE_DATABASE_URL ?? "",
    target: process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    force: false,
    dryRun: false,
    includeSessions: false,
    verify: true,
    backup: true,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--source": args.source = argv[++i] ?? args.source; break;
      case "--target": args.target = argv[++i] ?? args.target; break;
      case "--force": args.force = true; break;
      case "--dry-run": args.dryRun = true; break;
      case "--include-sessions": args.includeSessions = true; break;
      case "--no-verify": args.verify = false; break;
      case "--no-backup": args.backup = false; break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!args.source || !args.target) {
    throw new Error("--source and --target MySQL URLs are required");
  }
  return args;
}

function backupTarget(targetUrl: string): string {
  const url = new URL(targetUrl);
  const database = url.pathname.replace(/^\//, "");
  const directory = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(
    directory,
    `ospos-target-${database}-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`,
  );
  execFileSync(
    "mysqldump",
    [
      `--host=${url.hostname}`,
      `--port=${url.port || "3306"}`,
      `--user=${decodeURIComponent(url.username)}`,
      `--password=${decodeURIComponent(url.password)}`,
      "--single-transaction",
      "--routines=false",
      "--triggers=false",
      database,
    ],
    { stdio: ["ignore", fs.openSync(file, "w"), "inherit"] },
  );
  return file;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.source === args.target) {
    throw new Error("Source and target must be different databases");
  }

  if (args.force && args.backup && !args.dryRun) {
    try {
      const file = backupTarget(args.target);
      console.log(`Backed up target to ${file}`);
    } catch (error) {
      throw new Error(
        `Refusing to overwrite without a backup. mysqldump failed: ${
          (error as Error).message
        }. Re-run with --no-backup to proceed anyway.`,
      );
    }
  }

  const report = await copyOsposDatabase(args.source, args.target, {
    force: args.force,
    dryRun: args.dryRun,
    includeSessions: args.includeSessions,
    verify: args.verify,
  });

  console.log(`\n${args.dryRun ? "DRY RUN — " : ""}Copied tables:`);
  for (const entry of report.copied) {
    console.log(`  ${entry.table}: ${entry.rows} rows`);
  }
  if (report.skipped.length > 0) {
    console.log(`Skipped: ${report.skipped.join(", ")}`);
  }
  if (report.missingColumns.length > 0) {
    console.error("Source columns missing from target:");
    for (const entry of report.missingColumns) {
      console.error(`  ${entry.table}: ${entry.columns.join(", ")}`);
    }
    process.exitCode = 1;
  }
  if (report.verified.length > 0) {
    const mismatches = report.verified.filter((entry) => entry.source !== entry.target);
    if (mismatches.length > 0) {
      console.error("Checksum mismatches:");
      for (const entry of mismatches) {
        console.error(`  ${entry.table}: ${entry.source} != ${entry.target}`);
      }
      process.exitCode = 1;
    } else {
      console.log(`Verified ${report.verified.length} table checksums.`);
    }
  }
}

main().catch((error: unknown) => {
  console.error("Import failed:", (error as Error).message);
  process.exit(1);
});
