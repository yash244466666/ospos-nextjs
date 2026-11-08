#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
PATTERN='TODO|FIXME|NotImplemented|not implemented|throw new Error\("not implemented'
if grep -rnE "$PATTERN" src --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx'; then
  echo "FAIL: stub markers found in src/"
  exit 1
fi
echo "PASS: no stub markers in src/"
