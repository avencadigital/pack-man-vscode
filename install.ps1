# Quick Install Script - Pack-Man VS Code Extension
# Run this script to install the extension automatically

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Pack-Man VS Code Extension Installer  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if VS Code is installed
$vscodePath = Get-Command code -ErrorAction SilentlyContinue

if (-not $vscodePath) {
    Write-Host "[X] VS Code not found!" -ForegroundColor Red
    Write-Host "    Please install VS Code first: https://code.visualstudio.com/" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] VS Code found: $($vscodePath.Source)" -ForegroundColor Green
Write-Host ""

# Find the most recent VSIX file
$vsixFile = Get-ChildItem -Path "." -Filter "pack-man-vscode-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $vsixFile) {
    Write-Host "[X] VSIX file not found!" -ForegroundColor Red
    Write-Host "    Run 'npm run package' first to create the file." -ForegroundColor Yellow
    exit 1
}

$vsixFile = $vsixFile.Name
Write-Host "[OK] VSIX file found: $vsixFile" -ForegroundColor Green
Write-Host ""

# Install the extension
Write-Host "[*] Installing extension..." -ForegroundColor Cyan
try {
    & code --install-extension $vsixFile --force
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  [OK] Installation completed!          " -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Reload VS Code (Ctrl+Shift+P > 'Reload Window')" -ForegroundColor White
        Write-Host "2. Open a project with package.json, requirements.txt or pubspec.yaml" -ForegroundColor White
        Write-Host "3. The extension will activate automatically!" -ForegroundColor White
        Write-Host ""
        Write-Host "Useful commands:" -ForegroundColor Cyan
        Write-Host "- Ctrl+Shift+P > 'Pack-Man: Analyze Dependencies'" -ForegroundColor White
        Write-Host "- Ctrl+Shift+P > 'Pack-Man: Show Analysis'" -ForegroundColor White
        Write-Host ""
        Write-Host "Read README.md for more information" -ForegroundColor Yellow
    } else {
        throw "Installation failed"
    }
} catch {
    Write-Host ""
    Write-Host "[X] Error during installation!" -ForegroundColor Red
    Write-Host "    Try installing manually:" -ForegroundColor Yellow
    Write-Host "    1. Open VS Code" -ForegroundColor White
    Write-Host "    2. Press Ctrl+Shift+P" -ForegroundColor White
    Write-Host "    3. Type 'Extensions: Install from VSIX...'" -ForegroundColor White
    Write-Host "    4. Select the file: $vsixFile" -ForegroundColor White
    exit 1
}
