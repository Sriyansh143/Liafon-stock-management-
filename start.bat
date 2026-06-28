@echo off
REM ────────────────────────────────────────────────────────────────────────────
REM Liafon Stock Management — Quick Start (Windows)
REM
REM Runs the setup commands in PowerShell:
REM   1. cd to the script directory
REM   2. npm install
REM   3. cp .env.example .env
REM   4. npx prisma db push
REM   5. npm run dev
REM   6. (Optional) start WhatsApp API in a new window
REM ────────────────────────────────────────────────────────────────────────────
title Liafon Stock Management
cd /d "%~dp0"

echo.
echo ========================================
echo   LIAFON STOCK MANAGEMENT
echo   Dev server: http://localhost:3000
echo ========================================
echo.

REM ── Check Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo         Please install Node.js 18.18+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js: 
node --version

REM ── Step 1: Install dependencies ───────────────────────────────────────────
echo.
echo [1/5] Installing dependencies (npm install)...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.

REM ── Step 2: Create .env ────────────────────────────────────────────────────
echo.
echo [2/5] Creating .env from .env.example...
if not exist ".env" (
    copy .env.example .env >nul
    echo [OK] .env created.
) else (
    echo [OK] .env already exists.
)

REM ── Step 3: Generate Prisma client ─────────────────────────────────────────
echo.
echo [3/5] Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
    echo [ERROR] Prisma generate failed.
    pause
    exit /b 1
)

REM ── Step 4: Create/sync database ───────────────────────────────────────────
echo.
echo [4/5] Creating database tables (npx prisma db push)...
call npx prisma db push
if errorlevel 1 (
    echo [ERROR] prisma db push failed. Check .env DATABASE_URL.
    pause
    exit /b 1
)
echo [OK] Database ready.

REM ── Step 5: Start WhatsApp API (optional, in new window) ───────────────────
REM Check if OpenWA is installed in a sibling directory and start it
if exist "..\OpenWA\package.json" (
    echo.
    echo [5/5] Starting WhatsApp API (OpenWA) in new window...
    start "WhatsApp API - OpenWA" cmd /k "cd /d ..\OpenWA && npm start"
    echo [OK] OpenWA starting in separate window. Scan the QR code there.
    echo       Add the API key to .env (OPENWA_API_URL, OPENWA_API_KEY).
) else if exist "..\openwa\package.json" (
    echo.
    echo [5/5] Starting WhatsApp API (OpenWA) in new window...
    start "WhatsApp API - OpenWA" cmd /k "cd /d ..\openwa && npm start"
    echo [OK] OpenWA starting in separate window. Scan the QR code there.
) else (
    echo.
    echo [5/5] OpenWA not found in sibling directory — skipping.
    echo       WhatsApp will fall back to wa.me deep links.
    echo       To enable OpenWA: see OPENWA_SETUP.md
)

REM ── Start dev server ───────────────────────────────────────────────────────
echo.
echo ========================================
echo   Starting dev server (npm run dev)...
echo   Open http://localhost:3000
echo   Press Ctrl+C to stop
echo ========================================
echo.

call npm run dev

pause
