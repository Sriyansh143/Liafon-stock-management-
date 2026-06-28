#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Liafon Stock Management — Production Start (Linux / macOS)
#
# This script builds the app for production and starts the standalone server.
# Use start.sh for development instead.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "========================================"
echo "  LIAFON STOCK MANAGEMENT (Production)"
echo "  Server: http://localhost:3000"
echo "========================================"
echo ""

# ── Check Node.js ──────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed. Install from https://nodejs.org/"
    exit 1
fi

# ── Install dependencies if needed ─────────────────────────────────────────
if [ ! -d "node_modules" ]; then
    echo "[SETUP] Installing dependencies..."
    npm install
fi

# ── Create .env if missing ─────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[SETUP] .env created from .env.example — edit it before deploying!"
fi

# ── Create dirs ────────────────────────────────────────────────────────────
mkdir -p data backups

# ── Generate Prisma client + sync DB ───────────────────────────────────────
echo "[SETUP] Generating Prisma client..."
npx prisma generate
echo "[SETUP] Syncing database..."
npx prisma db push

# ── Build for production ───────────────────────────────────────────────────
echo "[BUILD] Building production bundle (may take 1-2 minutes)..."
npm run build

# ── Copy static assets to standalone ───────────────────────────────────────
echo "[BUILD] Copying static assets..."
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

# ── Start production server ────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Starting production server..."
echo "  Open http://localhost:3000"
echo "  Press Ctrl+C to stop"
echo "========================================"
echo ""

export NODE_ENV=production
export PORT=3000
export HOSTNAME=0.0.0.0
exec node .next/standalone/server.js
