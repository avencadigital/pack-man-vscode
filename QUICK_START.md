# ⚡ Quick Start - Pack-Man VS Code Extension

## 🎯 3 Steps to Get Started

### 1️⃣ Install the Extension

**For developers (from source):**
```bash
npm run ext-install
```
This builds and installs the extension with auto-reload.

**From VSIX file:**
```bash
code --install-extension pack-man-vscode-1.1.0.vsix
```

**Or use the script:**
- Windows: `.\install.ps1`
- Linux/Mac: `./install.sh`

### 2️⃣ Open a Project

Open any project containing:
- `package.json` (npm)
- `requirements.txt` (pip)
- `pubspec.yaml` (pub)

### 3️⃣ Watch the Magic Happen! ✨

The extension will:
- ✅ Activate automatically
- 📊 Analyze your dependencies
- 🎨 Show inline indicators
- 📈 Display status in the bottom bar

---

## 🚀 Main Features

### CodeLens Indicators
Indicators above each dependency:
- ✅ **Green**: Up to date
- ⚠️ **Yellow**: Outdated (with available version)
- ❌ **Red**: Error

### Hover Information
Hover over any dependency to see:
- Current vs. latest version
- Status
- Documentation links
- Registry link

### Status Bar
Bottom bar shows:
- 🟢 `Dependencies: OK` - All up to date
- 🟡 `Dependencies: X outdated` - Outdated packages
- 🔴 `Dependencies: X errors` - Errors found

**Click** on the status to see detailed analysis!

### Quick Actions
- **Update**: Click on CodeLens to update a package
- **Update All**: Use the command to update all

---

## 🎮 Essential Commands

Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Pack-Man: Analyze Dependencies` | Analyzes current file |
| `Pack-Man: Analyze Workspace` | Analyzes entire workspace |
| `Pack-Man: Update All Dependencies` | Updates all packages |
| `Pack-Man: Show Analysis` | Opens detailed panel |

### Keyboard Shortcuts

- `Ctrl+Shift+P A` - Analyze Dependencies
- `Ctrl+Shift+P U` - Update All Dependencies

---

## ⚙️ Quick Configuration

### Main Settings

```json
{
  // API URL
  "packman.apiEndpoint": "https://pack-man.tech",
  
  // Auto-analyze on save
  "packman.autoAnalyzeOnSave": true,
  
  // Show CodeLens
  "packman.showCodeLens": true,
  
  // Show Diagnostics
  "packman.showDiagnostics": true
}
```

### GitHub Token (Optional)

For private repositories or higher rate limit:
1. Open Settings (`Ctrl+,`)
2. Search for "Pack-Man"
3. Configure the GitHub Token
4. Token is stored securely

**Benefits:**
- ✅ Access to private repos
- ✅ Rate limit: 60/hour → 5000/hour

---

## 📦 Supported Formats

### npm (package.json)
```json
{
  "dependencies": {
    "react": "^18.0.0",
    "axios": "^1.0.0"
  },
  "devDependencies": {
    "vitest": "^4.0.0"
  }
}
```

### pip (requirements.txt)
```
django==4.2.0
requests>=2.28.0
pytest~=7.3.0
```

### pub (pubspec.yaml)
```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
```

---

## 🎯 Practical Example

### 1. Create a test project

```bash
mkdir test-packman && cd test-packman
```

### 2. Create a package.json

```json
{
  "name": "test",
  "version": "1.0.0",
  "dependencies": {
    "react": "^17.0.0",
    "axios": "^0.21.0"
  }
}
```

### 3. Open in VS Code

```bash
code .
```

### 4. Observe

- ⚠️ Yellow indicators appear (outdated packages)
- 🟡 Status bar shows "Dependencies: 2 outdated"
- 📋 Problems panel lists the packages

### 5. Update

- Click "Update" on any indicator
- Or use `Pack-Man: Update All Dependencies`

### 6. Result

- ✅ Indicators turn green
- 🟢 Status bar shows "Dependencies: OK"
- 📋 Problems panel is clean

---

## 🔥 Pro Tips

### 1. Auto-analysis
Keep `autoAnalyzeOnSave: true` for automatic analysis on save.

### 2. Detailed Webview
Click on the status bar to see complete analysis with statistics.

### 3. Problems Panel
Use `Ctrl+Shift+M` to see all outdated packages.

### 4. Bulk Updates
Use `Update All` to update everything at once.

### 5. Hover for Details
Hover over any dependency to see complete information.

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Extension doesn't activate | Reload VS Code (`Ctrl+Shift+P` > "Reload Window") |
| CodeLens doesn't appear | Wait a few seconds, check settings |
| API error | Check connection, endpoint in settings |
| Update doesn't work | Check file permissions |

---

## 📚 More Information

- 📖 **README.md** - Complete documentation
- 📖 **TESTING_GUIDE.md** - Complete testing guide
- 📖 **CHANGELOG.md** - Version history

---

## 🌐 Links

- **Website**: [pack-man.tech](https://pack-man.tech)
- **GitHub**: [github.com/avencadigital/pack-man-vscode](https://github.com/avencadigital/pack-man-vscode)
- **Issues**: [github.com/avencadigital/pack-man-vscode/issues](https://github.com/avencadigital/pack-man-vscode/issues)

---

## ✅ Installation Checklist

- [ ] Extension installed
- [ ] VS Code reloaded
- [ ] Test project created
- [ ] CodeLens appearing
- [ ] Status bar working
- [ ] Hover working
- [ ] Update working

**All good? You're ready! 🎉**

---

**Made with ❤️ by the Pack-Man team**
