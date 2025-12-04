# Dev Install Script - Pack-Man VS Code Extension
# Cleans, builds, packages and installs the extension in a single command

param(
    [switch]$SkipBuild,
    [switch]$SkipClean,
    [switch]$Reload
)

# Continue on non-critical errors
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Pack-Man VS Code Extension - Dev Install      " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Clean previous files
if (-not $SkipClean) {
    Write-Host "[1/5] Cleaning previous files..." -ForegroundColor Yellow
    
    # Remove dist folder
    if (Test-Path "dist") {
        Remove-Item -Path "dist" -Recurse -Force
        Write-Host "      - dist/ removed" -ForegroundColor DarkGray
    }
    
    # Remove old VSIX files
    $oldVsix = Get-ChildItem -Path "." -Filter "*.vsix" -ErrorAction SilentlyContinue
    if ($oldVsix) {
        $oldVsix | Remove-Item -Force
        Write-Host "      - $($oldVsix.Count) VSIX file(s) removed" -ForegroundColor DarkGray
    }
    
    Write-Host "      OK" -ForegroundColor Green
} else {
    Write-Host "[1/5] Clean skipped (--SkipClean)" -ForegroundColor DarkGray
}

# 2. Build
if (-not $SkipBuild) {
    Write-Host "[2/5] Building..." -ForegroundColor Yellow
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      ERROR: Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "      OK" -ForegroundColor Green
} else {
    Write-Host "[2/5] Build skipped (--SkipBuild)" -ForegroundColor DarkGray
}

# 3. Package
Write-Host "[3/5] Packaging VSIX..." -ForegroundColor Yellow
npm run package 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR: Package failed!" -ForegroundColor Red
    exit 1
}

# Find generated VSIX
$vsixFile = Get-ChildItem -Path "." -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsixFile) {
    Write-Host "      ERROR: No VSIX file found!" -ForegroundColor Red
    exit 1
}
Write-Host "      OK - $($vsixFile.Name)" -ForegroundColor Green

# 4. Uninstall previous version
Write-Host "[4/5] Uninstalling previous version..." -ForegroundColor Yellow
try {
    $uninstallOutput = & code --uninstall-extension gzprogrammer.pack-man-vscode 2>&1 | Out-String
    Write-Host "      OK - Previous version removed" -ForegroundColor Green
} catch {
    Write-Host "      OK - No previous version found" -ForegroundColor DarkGray
}
# Ignore error if extension is not installed
$LASTEXITCODE = 0

# 5. Install new version
Write-Host "[5/5] Installing new version..." -ForegroundColor Yellow
& code --install-extension $vsixFile.FullName --force 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR: Installation failed!" -ForegroundColor Red
    exit 1
}
Write-Host "      OK" -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Installation completed successfully!          " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# Auto reload if requested
if ($Reload) {
    Write-Host ""
    Write-Host "Reloading VS Code..." -ForegroundColor Cyan
    
    # Try to reopen VS Code in current folder
    Start-Process -FilePath "code" -ArgumentList "-r", "." -WindowStyle Hidden -ErrorAction SilentlyContinue
    
    Start-Sleep -Milliseconds 500
    
    Write-Host ""
    Write-Host "[!] If the window did not reload automatically:" -ForegroundColor Yellow
    Write-Host "    Press: Ctrl+Shift+P > 'Developer: Reload Window'" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "To reload, press: " -NoNewline -ForegroundColor Yellow
    Write-Host "Ctrl+Shift+P > 'Developer: Reload Window'" -ForegroundColor White
}

Write-Host ""
