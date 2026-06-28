@echo off
REM ────────────────────────────────────────────────────────────────────────────
REM Liafon Stock Management — Production Start (Windows)
REM
REM This script builds the app for production and starts the standalone server.
REM Use start.bat for development instead.
REM ────────────────────────────────────────────────────────────────────────────
title Liafon Stock Management (Production)
cd /d "%~dp0"

echo.
echo ========================================
echo   LIAFON STOCK MANAGEMENT (Production)
echo   Server: http://localhost:3000
echo ========================================
echo.

REM ── Check Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Install from https://nodejs.org/
    pause
    exit /b 1
)

REM ── Install dependencies if needed ─────────────────────────────────────────
if not exist "node_modules" (
    echo [SETUP] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM ── Create .env if missing ─────────────────────────────────────────────────
if not exist ".env" (
    copy .env.example .env >nul
    echo [SETUP] .env created from .env.example — edit it before deploying!
)

REM ── Create dirs ────────────────────────────────────────────────────────────
if not exist "data" mkdir data
if not exist "backups" mkdir backups

REM ── Generate Prisma client + sync DB ───────────────────────────────────────
echo [SETUP] Generating Prisma client...
call npx prisma generate
echo [SETUP] Syncing database...
call npx prisma db push

REM ── Build for production ───────────────────────────────────────────────────
echo [BUILD] Building production bundle (may take 1-2 minutes)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

REM ── Copy static assets to standalone ───────────────────────────────────────
REM Next.js standalone output doesn't include the static folder by default
if not exist ".next\standalone\.next\static" (
    echo [BUILD] Copying static assets...
    xcopy /E /I /Y ".next\static" ".next\standalone\.next\static" >nul
)
if not exist ".next\standalone\public" (
    echo [BUILD] Copying public assets...
    xcopy /E /I /Y "public" ".next\standalone\public" >nul
)

REM ── Start production server ────────────────────────────────────────────────
echo.
echo ========================================
echo   Starting production server...
echo   Open http://localhost:3000
echo   Press Ctrl+C to stop
echo ========================================
echo.

set NODE_ENV=production
set PORT=3000
set HOSTNAME=0.0.0.0
node .next\standalone\server.js

pause
