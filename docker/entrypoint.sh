#!/bin/sh
set -e

# Apply migrations and seed, then start the server.
echo "[entrypoint] Running migrations for DB_DRIVER=${DB_DRIVER:-sqlite}..."
npm run db:migrate || { echo "[entrypoint] Migration failed"; exit 1; }

echo "[entrypoint] Seeding database..."
npm run db:seed || { echo "[entrypoint] Seed failed (may already be seeded)"; }

echo "[entrypoint] Starting Next.js production server..."
exec node server.js