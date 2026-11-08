#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
CONTEXT="${ORACLE_CONTEXT:-/tmp/ospos-oracle-context}"
rm -rf "$CONTEXT"
mkdir -p "$CONTEXT"
# Stage a read-only copy of upstream plus the harness files; upstream itself
# is never modified.
cp -a /home/yash/ospos/. "$CONTEXT/"
cp docker/parity/apache.conf docker/parity/entrypoint.sh docker/parity/Dockerfile.oracle-context "$CONTEXT/"
# Docker's default ignore rules exclude .env.example; the oracle needs it.
sed -i '/^\.env/d' "$CONTEXT/.dockerignore"
docker build -f "$CONTEXT/Dockerfile.oracle-context" -t parity-oracle:local "$CONTEXT"
echo "Built parity-oracle:local from upstream 603b2c7 (read-only copy)."
