import { copyOsposDatabase } from "./lib/copy-ospos-mysql";

interface Args {
  source: string;
  target: string;
  force: boolean;
  dryRun: boolean;
  includeSessions: boolean;
  verify: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    source: process.env.DATABASE_URL ?? "",
    target: process.env.EXPORT_DATABASE_URL ?? "",
    force: false,
    dryRun: false,
    includeSessions: false,
    verify: true,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--source": args.source = argv[++i] ?? args.source; break;
      case "--target": args.target = argv[++i] ?? args.target; break;
      case "--force": args.force = true; break;
      case "--dry-run": args.dryRun = true; break;
      case "--include-sessions": args.includeSessions = true; break;
      case "--no-verify": args.verify = false; break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!args.source || !args.target) {
    throw new Error("--source and --target MySQL URLs are required");
  }
  return args;
}

/**
 * Round-trips the target schema into an OSPOS-compatible MySQL database.
 * Columns, IDs, timestamps and decimal strings are copied verbatim.
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.source === args.target) {
    throw new Error("Source and target must be different databases");
  }

  const report = await copyOsposDatabase(args.source, args.target, {
    force: args.force,
    dryRun: args.dryRun,
    includeSessions: args.includeSessions,
    verify: args.verify,
  });

  const total = report.copied.reduce((sum, entry) => sum + entry.rows, 0);
  console.log(
    `${args.dryRun ? "DRY RUN — " : ""}Exported ${report.copied.length} tables, ${total} rows.`,
  );
  if (report.missingColumns.length > 0) {
    console.error("Target columns missing from source:");
    for (const entry of report.missingColumns) {
      console.error(`  ${entry.table}: ${entry.columns.join(", ")}`);
    }
    process.exitCode = 1;
  }
  const mismatches = report.verified.filter((entry) => entry.source !== entry.target);
  if (mismatches.length > 0) {
    console.error("Checksum mismatches:");
    for (const entry of mismatches) {
      console.error(`  ${entry.table}: ${entry.source} != ${entry.target}`);
    }
    process.exitCode = 1;
  } else if (report.verified.length > 0) {
    console.log(`Verified ${report.verified.length} table checksums.`);
  }
}

main().catch((error: unknown) => {
  console.error("Export failed:", (error as Error).message);
  process.exit(1);
});
