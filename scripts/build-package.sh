#!/bin/bash
# ============================================================================
# Liafon Stock Management - Build & Package Script
# Creates a distributable ZIP with all necessary files
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_NAME="Liafon-Stock-Management"
BUILD_DIR="$PROJECT_DIR/dist"
ZIP_NAME="${BUILD_NAME}-v1.0.0.zip"

echo "============================================================"
echo "  LIAFON STOCK MANAGEMENT - BUILD & PACKAGE"
echo "============================================================"
echo ""

# Clean previous build
echo "[1/6] Cleaning previous build..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/$BUILD_NAME"

# Copy application source files
echo "[2/6] Copying application files..."
cp -r "$PROJECT_DIR/src" "$BUILD_DIR/$BUILD_NAME/"
cp -r "$PROJECT_DIR/public" "$BUILD_DIR/$BUILD_NAME/"
cp -r "$PROJECT_DIR/prisma" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/package.json" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/tsconfig.json" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/next.config.ts" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/postcss.config.mjs" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/tailwind.config.ts" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/components.json" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/eslint.config.mjs" "$BUILD_DIR/$BUILD_NAME/"
cp "$PROJECT_DIR/bun.lock" "$BUILD_DIR/$BUILD_NAME/" 2>/dev/null || true

# Copy installer
echo "[3/6] Copying installer..."
cp -r "$PROJECT_DIR/installer" "$BUILD_DIR/$BUILD_NAME/"

# Create necessary directories
echo "[4/6] Creating data directories..."
mkdir -p "$BUILD_DIR/$BUILD_NAME/db"
mkdir -p "$BUILD_DIR/$BUILD_NAME/backups"
mkdir -p "$BUILD_DIR/$BUILD_NAME/uploads"
mkdir -p "$BUILD_DIR/$BUILD_NAME/logs"

# Create .env template
echo "[5/6] Creating configuration..."
cat > "$BUILD_DIR/$BUILD_NAME/.env" << 'ENVFILE'
# ============================================================
# LIAFON STOCK MANAGEMENT - CONFIGURATION
# IMPORTANT: Change APP_PASSWORD before first use!
# ============================================================

DATABASE_URL=file:./db/liafon.db
APP_PASSWORD=liafon@2024
APP_NAME=Liafon Stock Management

# OpenWA WhatsApp Gateway (optional - falls back to wa.me links)
OPENWA_API_URL=http://localhost:2785/api
OPENWA_API_KEY=
OPENWA_SESSION=default

# Backup Settings
BACKUP_DIR=./backups
DAILY_BACKUP_HOUR=23

# Server Port
PORT=3000
ENVFILE

# Create README
cat > "$BUILD_DIR/$BUILD_NAME/README.txt" << 'EOF'
============================================================
LIAFON STOCK MANAGEMENT v1.0.0
Auto Spare Parts Shop Management System
============================================================

QUICK START (Windows):
1. Extract this ZIP to your desired location
2. Right-click "installer/install.ps1" > Run with PowerShell
3. Follow the installation wizard
4. Double-click "START.bat" to launch the app
5. Open http://localhost:3000 in your browser
6. Login with the password from .env file

DEFAULT PASSWORD: liafon@2024
(Change it in .env file before first use!)

FEATURES:
- Complete inventory management (add/edit/delete parts)
- Sales recording with auto stock deduction
- Purchase tracking with auto stock addition
- WhatsApp integration (OpenWA self-hosted or wa.me fallback)
- Excel import/export for inventory
- Daily automated backups
- Reports and analytics dashboard
- Department management for team notifications
- Password-protected access

WHATSAPP SETUP (Optional - Full API messaging):
1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Open PowerShell as Administrator in the install folder
3. Run: git clone https://github.com/rmyndharis/OpenWA.git
4. Run: cd OpenWA && docker compose -f docker-compose.dev.yml up -d
5. Open http://localhost:2785 and scan WhatsApp QR code
6. Copy the API key from the OpenWA dashboard
7. Enter it in the app Settings > WhatsApp Configuration

WITHOUT OPENWA (Still works!):
The app works perfectly without Docker/OpenWA!
WhatsApp sharing uses wa.me links that open WhatsApp
Web/Desktop with pre-filled messages automatically.

BACKUP:
- Backups saved in the /backups folder (accessible to users)
- Daily automated backup scheduled at 11:00 PM
- Manual backup available from Settings page
- Restore from any backup file via Settings

DATA SECURITY:
- Source code is compiled (Next.js build) - not readable
- Only backup files and uploads are user-accessible
- Password protection prevents unauthorized access
- All data stored locally on your machine

TECH STACK:
- Next.js 16 (React Framework)
- SQLite (Database - zero configuration)
- Prisma ORM
- Tailwind CSS 4 + shadcn/ui Components
- Recharts (Analytics & Charts)
- OpenWA (Self-hosted WhatsApp API - optional)

============================================================
EOF

echo "[6/6] Packaging..."
cd "$BUILD_DIR"
if command -v zip &>/dev/null; then
    zip -r "$ZIP_NAME" "$BUILD_NAME/" -x "*.DS_Store" "*node_modules*" "*/.next/*"
    ZIP_SIZE=$(du -h "$ZIP_NAME" | cut -f1)
    echo ""
    echo "============================================================"
    echo "  BUILD COMPLETE!"
    echo "============================================================"
    echo "  Output: $BUILD_DIR/$ZIP_NAME"
    echo "  Size:   $ZIP_SIZE"
    echo "============================================================"
else
    echo "zip not found. Creating tar.gz instead..."
    tar -czf "${ZIP_NAME%.zip}.tar.gz" "$BUILD_NAME/"
    echo "Output: $BUILD_DIR/${ZIP_NAME%.zip}.tar.gz"
fi