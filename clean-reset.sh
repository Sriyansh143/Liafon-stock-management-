#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Liafon Stock Management — Clean Reset Script (Linux / macOS)
# Deletes all build caches, stale databases, and node_modules so you
# can do a 100% fresh install of the latest version.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "========================================"
echo "  LIAFON STOCK MANAGEMENT — CLEAN RESET"
echo "========================================"
echo

cd "$(dirname "$0")"

echo "[1/5] Stopping any running dev servers..."
pkill -f "next dev" 2>/dev/null || true
sleep 2

echo "[2/5] Deleting .next build cache..."
rm -rf .next
echo "  Done."

echo "[3/5] Deleting stale databases..."
rm -f data/liafon.db data/liafon.db-journal
rm -rf prisma/data
rm -f db/custom.db
echo "  Done."

echo "[4/5] Deleting node_modules and lockfile (forces fresh install)..."
rm -rf node_modules package-lock.json bun.lock .bun
echo "  Done."

echo "[5/5] Deleting old .env (will be recreated from .env.example)..."
rm -f .env
echo "  Done."

echo
echo "========================================"
echo "  CLEAN RESET COMPLETE!"
echo "========================================"
echo
echo "Now run these commands to start fresh:"
echo
echo "  npm install"
echo "  cp .env.example .env"
echo "  npx prisma db push"
echo "  npm run dev"
echo
echo "Then open http://localhost:3000"
