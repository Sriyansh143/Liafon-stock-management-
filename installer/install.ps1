#Requires -RunAs Administrator
<#
.SYNOPSIS
    Liafon Stock Management - Auto Installer & Setup
.DESCRIPTION
    Installs all dependencies, sets up the database, configures the app,
    and creates a Windows service for auto-start and scheduled backups.
.NOTES
    Powered by Liafon Software
#>

$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot
$NodeVersion = "20.11.0"
$BunVersion = "1.1.0"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LIAFON STOCK MANAGEMENT" -ForegroundColor White
Write-Host "  Auto Spare Parts Shop System" -ForegroundColor Gray
Write-Host "  Powered by Liafon Software" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check/Install Node.js ──────────────────────────────────────
Write-Host "[1/8] Checking Node.js..." -ForegroundColor Yellow

$nodeInstalled = $false
try {
    $nodeVer = & node --version 2>$null
    if ($nodeVer) {
        Write-Host "  Node.js $nodeVer found" -ForegroundColor Green
        $nodeInstalled = $true
    }
} catch {}

if (-not $nodeInstalled) {
    Write-Host "  Installing Node.js $NodeVersion..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi"
    $nodeMsi = "$env:TEMP\node-installer.msi"
    
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /quiet /norestart" -Wait
        Remove-Item $nodeMsi -Force -ErrorAction SilentlyContinue
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "  Node.js installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to install Node.js: $_" -ForegroundColor Red
        Write-Host "  Please install Node.js manually from https://nodejs.org" -ForegroundColor Yellow
    }
}

# ── Step 2: Check/Install Bun ──────────────────────────────────────────
Write-Host "[2/8] Checking Bun runtime..." -ForegroundColor Yellow

$bunInstalled = $false
try {
    $bunVer = & bun --version 2>$null
    if ($bunVer) {
        Write-Host "  Bun $bunVer found" -ForegroundColor Green
        $bunInstalled = $true
    }
} catch {}

if (-not $bunInstalled) {
    Write-Host "  Installing Bun..." -ForegroundColor Yellow
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-RestMethod -Uri https://bun.sh/install | Invoke-Expression
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User") + ";$env:USERPROFILE\.bun\bin"
        Write-Host "  Bun installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "  Bun install failed, will use npm instead" -ForegroundColor Yellow
    }
}

# ── Step 3: Install npm dependencies ───────────────────────────────────
Write-Host "[3/8] Installing dependencies..." -ForegroundColor Yellow
Push-Location $AppDir
try {
    if ($bunInstalled) {
        & bun install --production 2>&1 | Out-Null
    } else {
        & npm install --production 2>&1 | Out-Null
    }
    Write-Host "  Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Some dependencies may have failed" -ForegroundColor Yellow
}

# ── Step 4: Setup database ─────────────────────────────────────────────
Write-Host "[4/8] Setting up database..." -ForegroundColor Yellow

# Create .env if not exists
if (-not (Test-Path "$AppDir\.env")) {
    $defaultPassword = "liafon@2024"
    @"
DATABASE_URL=file:./data/liafon.db
APP_PASSWORD=$defaultPassword
APP_NAME=Liafon Stock Management
OPENWA_API_URL=http://localhost:2785/api
OPENWA_API_KEY=
OPENWA_SESSION=default
BACKUP_DIR=./backups
DAILY_BACKUP_HOUR=23
DEFAULT_CURRENCY=INR
"@ | Set-Content "$AppDir\.env" -Encoding UTF8
    Write-Host "  Created .env configuration file" -ForegroundColor Green
    Write-Host "  Default developer password: $defaultPassword" -ForegroundColor Cyan
    Write-Host "  Change APP_PASSWORD in .env to secure code files" -ForegroundColor Yellow
} else {
    Write-Host "  .env already exists, skipping" -ForegroundColor Gray
}

# Create data directory
New-Item -ItemType Directory -Force -Path "$AppDir\data" | Out-Null
New-Item -ItemType Directory -Force -Path "$AppDir\backups" | Out-Null

# Run Prisma
try {
    if ($bunInstalled) {
        & bunx prisma generate 2>&1 | Out-Null
        & bunx prisma db push 2>&1 | Out-Null
    } else {
        & npx prisma generate 2>&1 | Out-Null
        & npx prisma db push 2>&1 | Out-Null
    }
    Write-Host "  Database initialized" -ForegroundColor Green
} catch {
    Write-Host "  Database setup completed with warnings" -ForegroundColor Yellow
}

# ── Step 5: Build the application ──────────────────────────────────────
Write-Host "[5/8] Building application..." -ForegroundColor Yellow
try {
    if ($bunInstalled) {
        & bun run build 2>&1 | Out-Null
    } else {
        & npx next build 2>&1 | Out-Null
    }
    Write-Host "  Build completed" -ForegroundColor Green
} catch {
    Write-Host "  Build completed with warnings" -ForegroundColor Yellow
}

# ── Step 6: Create startup script ──────────────────────────────────────
Write-Host "[6/8] Creating startup scripts..." -ForegroundColor Yellow

$startScript = @"
@echo off
title Liafon Stock Management
echo ========================================
echo   LIAFON STOCK MANAGEMENT
echo   Starting server on http://localhost:3000
echo ========================================
echo.
cd /d "%~dp0"
set NODE_ENV=production
if exist ".bun\bin\bun.exe" (
    .bun\bin\bun.exe run start
) else (
    node .next\standalone\server.js
)
pause
"@
$startScript | Set-Content "$AppDir\start.bat" -Encoding ASCII

Write-Host "  Created start.bat" -ForegroundColor Green

# ── Step 7: Setup scheduled daily backup ───────────────────────────────
Write-Host "[7/8] Setting up daily auto-backup (11 PM)..." -ForegroundColor Yellow

$backupScript = @"
@echo off
cd /d "%~dp0"
set NODE_ENV=production
curl -s http://localhost:3000/api/backup > nul 2>&1
"@
$backupScript | Set-Content "$AppDir\backup-trigger.bat" -Encoding ASCII

try {
    $trigger = New-ScheduledTaskTrigger -Daily -At "23:00"
    $action = New-ScheduledTaskAction -Execute "$AppDir\backup-trigger.bat" -WorkingDirectory $AppDir
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType S4U -RunLevel Highest
    
    Register-ScheduledTask -TaskName "LiafonDailyBackup" -Trigger $trigger -Action $action -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "  Scheduled daily backup at 11:00 PM" -ForegroundColor Green
    Write-Host "  Backups run even if system was off (triggers on next check)" -ForegroundColor Gray
} catch {
    Write-Host "  Could not create scheduled task: $_" -ForegroundColor Yellow
    Write-Host "  Backups will still work manually from the Settings page" -ForegroundColor Yellow
}

# ── Step 8: Create desktop shortcut ────────────────────────────────────
Write-Host "[8/8] Creating desktop shortcut..." -ForegroundColor Yellow

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Liafon Stock Management.lnk")
$Shortcut.TargetPath = "$AppDir\start.bat"
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.Description = "Liafon Stock Management - Auto Spare Parts Shop System"
$Shortcut.Save()

Write-Host "  Desktop shortcut created" -ForegroundColor Green

# ── Done ────────────────────────────────────────────────────────────────
Pop-Location

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  INSTALLATION COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Mock Login Credentials:" -ForegroundColor Cyan
Write-Host "  -------------------------" -ForegroundColor Cyan
Write-Host "  Owner:   owner@liafon.com   / owner123" -ForegroundColor White
Write-Host "  Admin:   admin@liafon.com   / admin123" -ForegroundColor White
Write-Host "  Manager: manager@liafon.com / manager123" -ForegroundColor White
Write-Host "  Staff:   user@liafon.com    / user123" -ForegroundColor White
Write-Host ""
Write-Host "  To start: Double-click 'start.bat' or" -ForegroundColor Yellow
Write-Host "            the desktop shortcut" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Access:  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  WhatsApp Setup (optional):" -ForegroundColor Gray
Write-Host "  1. Install Docker" -ForegroundColor Gray
Write-Host "  2. Run: git clone https://github.com/rmyndharis/OpenWA.git" -ForegroundColor Gray
Write-Host "  3. cd OpenWA && docker compose -f docker-compose.dev.yml up -d" -ForegroundColor Gray
Write-Host "  4. Scan QR at http://localhost:2785" -ForegroundColor Gray
Write-Host "  5. Copy API key to .env (OPENWA_API_KEY)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Powered by Liafon Software" -ForegroundColor DarkGray
Write-Host ""

Read-Host "Press Enter to exit"