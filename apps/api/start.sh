#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[startup] Generating Prisma client..."
"$SCRIPT_DIR/node_modules/.bin/prisma" generate

echo "[startup] Running database migrations..."
# If a previous deploy left 20260527_normalize_phone_strip_plus in a failed state,
# mark it as rolled-back so migrate deploy can re-run it with the current SQL.
"$SCRIPT_DIR/node_modules/.bin/prisma" migrate resolve --rolled-back 20260527_normalize_phone_strip_plus 2>/dev/null || true
"$SCRIPT_DIR/node_modules/.bin/prisma" migrate resolve --rolled-back 20260604021723_add_campaign_media_url 2>/dev/null || true
"$SCRIPT_DIR/node_modules/.bin/prisma" migrate deploy

echo "[startup] Migrations complete. Starting server..."
exec node "$SCRIPT_DIR/dist/index.js"
