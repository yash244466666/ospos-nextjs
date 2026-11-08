#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
status=0
# Raw array interpolation into IN (...) lists.
if grep -rnE 'IN \(\$\{[^}]*\.join' src --include='*.ts' --include='*.tsx'; then
  echo "FAIL: interpolated IN (...) list"
  status=1
fi
# Template interpolation of joined id arrays inside drizzle sql`` fragments.
if grep -rnE 'sql`[^`]*\$\{[^}]*\.join\(' src --include='*.ts' --include='*.tsx'; then
  echo "FAIL: interpolated array inside sql``"
  status=1
fi
if [ "$status" -eq 0 ]; then echo "PASS: no unsafe SQL interpolation"; fi
exit "$status"
