#!/bin/sh
set -e

echo "[startup] Running database migrations..."
node ./node_modules/.bin/prisma migrate deploy
echo "[startup] Migrations complete. Starting server..."
exec node dist/index.js
