# GitHub Release Instructions

## Release URL

https://github.com/avencadigital/pack-man-vscode/releases/new

---

## Current Release: v1.1.0-beta

### Release tag
```
v1.1.0-beta
```

### Release title
```
Pack-Man v1.1.0-beta - First Public Release
```

### Release notes

```markdown
## 🎉 First Public Release

This is the first public beta release of Pack-Man VS Code Extension. Analyze and update package dependencies directly in your editor.

> ⚠️ **Pre-release**: This version is not yet production-ready. Please report any issues you encounter.

### ✨ Features

- **Multi-ecosystem Support** - npm (`package.json`), pip (`requirements.txt`), pub (`pubspec.yaml`)
- **CodeLens Indicators** - Inline status above each dependency
- **Hover Information** - Current vs. latest version, docs links
- **Status Bar** - Project-wide dependency health at a glance
- **Quick Actions** - One-click updates for individual or all dependencies
- **Folder Exclusion** - Configurable patterns to skip `node_modules`, `.next`, etc.
- **GitHub Token Support** - Access private repos with higher rate limits

### 🚀 Performance

- Smart caching (5min success, 2min error TTL)
- Folder exclusion reduces analysis time by ~87%
- Minimal memory footprint

### 📦 Installation

Download the `.vsix` file and install via:
- VS Code: `Ctrl+Shift+P` → "Install from VSIX"
- CLI: `code --install-extension pack-man-vscode-1.1.0.vsix`

### 📚 Documentation

- [README.md](./README.md) - Full documentation
- [QUICK_START.md](./QUICK_START.md) - Get started in 3 steps

### � Feedback

This is a beta release. Please report bugs and suggestions:
- [GitHub Issues](https://github.com/avencadigital/pack-man-vscode/issues)
```

---

## Tagging Guidelines

| Type | Format | Example |
|------|--------|---------|
| Production | `vX.Y.Z` | `v1.0.0`, `v2.3.4` |
| Alpha | `vX.Y.Z-alpha` | `v0.2.0-alpha` |
| Beta | `vX.Y.Z-beta.N` | `v5.9.0-beta.3` |

---

## Checklist

- [ ] Tag matches version (`v1.1.0-beta`)
- [ ] Release notes are complete
- [ ] `.vsix` file attached
- [ ] **"Set as a pre-release" checked** ⚠️
- [ ] "Set as latest release" unchecked (pre-release)
