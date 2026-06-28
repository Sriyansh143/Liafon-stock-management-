@echo off
REM ────────────────────────────────────────────────────────────────────────────
REM Liafon Stock Management — Clean Reset Script (Windows)
REM Deletes all build caches, stale databases, and node_modules so you
REM can do a 100% fresh install of the latest version.
REM ────────────────────────────────────────────────────────────────────────────
echo ========================================
echo   LIAFON STOCK MANAGEMENT — CLEAN RESET
echo ========================================
echo.

cd /d "%~dp0"

echo [1/5] Stopping any running dev servers...
taskkill /f /im node.exe 2>nul
taskkill /f /im next.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/5] Deleting .next build cache...
if exist ".next" rmdir /s /q ".next"
if exist ".next" (
  echo   WARNING: Could not delete .next — close your editor/dev server and try again.
) else (
  echo   Done.
)

echo [3/5] Deleting stale databases...
if exist "data\liafon.db" del /f /q "data\liafon.db"
if exist "data\liafon.db-journal" del /f /q "data\liafon.db-journal"
if exist "prisma\data" rmdir /s /q "prisma\data"
if exist "db\custom.db" del /f /q "db\custom.db"
echo   Done.

echo [4/5] Deleting node_modules and lockfile (forces fresh install)...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "package-lock.json" del /f /q "package-lock.json"
if exist "bun.lock" del /f /q "bun.lock"
if exist ".bun" rmdir /s /q ".bun"
echo   Done.

echo [5/5] Deleting old .env (will be recreated from .env.example)...
if exist ".env" del /f /q ".env"
echo   Done.

echo.
echo ========================================
echo   CLEAN RESET COMPLETE!
echo ========================================
echo.
echo Now run these commands to start fresh:
echo.
echo   npm install
echo   copy .env.example .env
echo   npx prisma db push
echo   npm run dev
echo.
echo Then open http://localhost:3000
echo.
pause
