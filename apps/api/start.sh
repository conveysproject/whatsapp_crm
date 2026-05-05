#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[startup] Generating Prisma client..."
"$SCRIPT_DIR/node_modules/.bin/prisma" generate
echo "[startup] Running database migrations..."
"$SCRIPT_DIR/node_modules/.bin/prisma" migrate deploy
echo "[startup] Migrations complete. Starting server..."
exec node "$SCRIPT_DIR/dist/index.js"