#!/bin/bash
# Liafon Stock Management - Package Script
# Creates a single ZIP file for distribution

set -e

APP_NAME="Liafon-Stock-Management"
BUILD_DIR=".next/standalone"
OUTPUT_DIR="dist"
ZIP_NAME="${APP_NAME}.zip"

echo "========================================"
echo "  LIAFON STOCK MANAGEMENT"
echo "  Packaging for distribution"
echo "========================================"
echo ""

# Clean previous builds
echo "[1/5] Cleaning previous builds..."
rm -rf "$OUTPUT_DIR" "$ZIP_NAME"
rm -rf "$BUILD_DIR"

# Build the application
echo "[2/5] Building application..."
NODE_ENV=production npx next build 2>&1 | tail -5

# Prepare standalone output
echo "[3/5] Preparing standalone files..."
cp -r .next/static "$BUILD_DIR/.next/" 2>/dev/null || true
cp -r public "$BUILD_DIR/" 2>/dev/null || true

# Copy essential files
echo "[4/5] Copying essential files..."
cp -r prisma "$BUILD_DIR/"
cp package.json "$BUILD_DIR/"
cp .env "$BUILD_DIR/"
cp -r installer "$BUILD_DIR/"

# Create data and backup dirs
mkdir -p "$BUILD_DIR/data"
mkdir -p "$BUILD_DIR/backups"

# Create start scripts
cat > "$BUILD_DIR/start.bat" << 'BATEOF'
@echo off
title Liafon Stock Management
echo ========================================
echo   LIAFON STOCK MANAGEMENT
echo   Starting server on http://localhost:3000
echo ========================================
echo.
cd /d "%~dp0"
set NODE_ENV=production
node .next\standalone\server.js
pause
BATEOF

cat > "$BUILD_DIR/start.sh" << 'SHEOF'
#!/bin/bash
echo "========================================"
echo "  LIAFON STOCK MANAGEMENT"
echo "  Starting server on http://localhost:3000"
echo "========================================"
cd "$(dirname "$0")"
export NODE_ENV=production
node .next/standalone/server.js
SHEOF
chmod +x "$BUILD_DIR/start.sh"

# Create ZIP
echo "[5/5] Creating ZIP package..."
cd "$BUILD_DIR"
zip -r "../$OUTPUT_DIR/$ZIP_NAME" . -x "*.map" -x "*.log"
cd ..

echo ""
echo "========================================"
echo "  PACKAGE CREATED!"
echo "  Location: $OUTPUT_DIR/$ZIP_NAME"
echo "========================================"
echo ""
echo "  Installation:"
echo "  1. Extract the ZIP to any folder"
echo "  2. Run install.ps1 (PowerShell, Run as Admin)"
echo "  3. Or run: npm install && npx prisma db push && npm run build"
echo "  4. Start with: start.bat (Windows) or ./start.sh (Linux/Mac)"
echo "  5. Open http://localhost:3000"
echo ""