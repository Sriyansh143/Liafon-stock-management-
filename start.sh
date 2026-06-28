#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Liafon Stock Management — Quick Start (Linux / macOS)
#
# Runs the setup commands:
#   1. cd to the script directory
#   2. npm install
#   3. cp .env.example .env
#   4. npx prisma db push
#   5. npm run dev
#   6. (Optional) start WhatsApp API in a new terminal
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "========================================"
echo "  LIAFON STOCK MANAGEMENT"
echo "  Dev server: http://localhost:3000"
echo "========================================"
echo ""

# ── Check Node.js ──────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed. Install from https://nodejs.org/"
    exit 1
fi
echo "[OK] Node.js: $(node --version)"

# ── Step 1: Install dependencies ───────────────────────────────────────────
echo ""
echo "[1/5] Installing dependencies (npm install)..."
npm install
echo "[OK] Dependencies installed."

# ── Step 2: Create .env ────────────────────────────────────────────────────
echo ""
echo "[2/5] Creating .env from .env.example..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[OK] .env created."
else
    echo "[OK] .env already exists."
fi

# ── Step 3: Generate Prisma client ─────────────────────────────────────────
echo ""
echo "[3/5] Generating Prisma client..."
npx prisma generate

# ── Step 4: Create/sync database ───────────────────────────────────────────
echo ""
echo "[4/5] Creating database tables (npx prisma db push)..."
npx prisma db push
echo "[OK] Database ready."

# ── Step 5: Start WhatsApp API (optional, in new terminal) ─────────────────
if [ -d "../OpenWA" ] && [ -f "../OpenWA/package.json" ]; then
    echo ""
    echo "[5/5] Starting WhatsApp API (OpenWA) in new terminal..."
    osascript -e 'tell app "Terminal" to do script "cd '"$(cd .. && pwd)"'/OpenWA && npm start"' 2>/dev/null \
        || gnome-terminal -- bash -c "cd ../OpenWA && npm start; exec bash" 2>/dev/null \
        || xterm -e "cd ../OpenWA && npm start" 2>/dev/null \
        || echo "  Could not auto-start OpenWA. Run it manually: cd ../OpenWA && npm start"
    echo "[OK] OpenWA starting in separate terminal. Scan the QR code there."
elif [ -d "../openwa" ] && [ -f "../openwa/package.json" ]; then
    echo ""
    echo "[5/5] Starting WhatsApp API (OpenWA) in new terminal..."
    osascript -e 'tell app "Terminal" to do script "cd '"$(cd .. && pwd)"'/openwa && npm start"' 2>/dev/null \
        || gnome-terminal -- bash -c "cd ../openwa && npm start; exec bash" 2>/dev/null \
        || echo "  Could not auto-start OpenWA. Run it manually: cd ../openwa && npm start"
    echo "[OK] OpenWA starting in separate terminal."
else
    echo ""
    echo "[5/5] OpenWA not found in sibling directory — skipping."
    echo "      WhatsApp will fall back to wa.me deep links."
    echo "      To enable OpenWA: see OPENWA_SETUP.md"
fi

# ── Start dev server ───────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Starting dev server (npm run dev)..."
echo "  Open http://localhost:3000"
echo "  Press Ctrl+C to stop"
echo "========================================"
echo ""

exec npm run dev
