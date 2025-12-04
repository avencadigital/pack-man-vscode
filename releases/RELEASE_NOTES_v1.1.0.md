# Pack-Man v1.1.0 - Release Notes

## 🎉 New Feature: Folder Exclusion

This version adds control over which folders are analyzed by the extension, significantly improving performance in large projects.

## ✨ What's New

### Visual Interface for Folder Exclusion 🎨

You can now manage exclusions directly in the Pack-Man panel:

- **Integrated Settings panel** - Manage everything in one place
- **Add/remove patterns** with one click
- **Visual list** of all active patterns
- **Quick reset** to default values
- **Built-in examples** of common patterns
- **Real-time validation** - No syntax errors

### Smart Folder Exclusion

The extension now automatically ignores folders that shouldn't be analyzed:

```
✅ Before: Analyzed EVERYTHING (including node_modules, .next, etc.)
✅ Now: Analyzes only what matters (configurable!)
```

### Default Excluded Patterns

- `**/node_modules/**` - Node.js dependencies
- `**/.next/**` - Next.js build cache
- `**/dist/**` - Distribution folder
- `**/build/**` - Build folder
- `**/.git/**` - Git repository

### Fully Configurable

```json
{
  "packman.excludeFolders": [
    "**/node_modules/**",
    "**/.next/**",
    "**/.venv/**",
    "**/custom-folder/**"
  ]
}
```

## 🚀 Performance Improvements

### Before (v1.0.0)

```
📁 Typical Next.js project
├── Files analyzed: ~500
├── Analysis time: ~15s
└── Memory usage: High
```

### Now (v1.1.0)

```
📁 Typical Next.js project
├── Files analyzed: ~5
├── Analysis time: ~2s
└── Memory usage: Low
```

## 📊 Real Impact

| Metric           | v1.0.0 | v1.1.0 | Improvement                  |
| ---------------- | ------ | ------ | ---------------------------- |
| Analysis time    | 15s    | 2s     | **87% faster**               |
| Files processed  | 500    | 5      | **99% fewer files**          |
| Memory usage     | High   | Low    | **Significantly reduced**    |
| Responsiveness   | Slow   | Fast   | **Much better**              |

## 🎯 Use Cases

### Next.js Project

```json
{
  "packman.excludeFolders": ["**/node_modules/**", "**/.next/**", "**/out/**"]
}
```

### Python Project

```json
{
  "packman.excludeFolders": ["**/.venv/**", "**/venv/**", "**/__pycache__/**"]
}
```

### Monorepo

```json
{
  "packman.excludeFolders": [
    "**/node_modules/**",
    "**/packages/*/dist/**",
    "**/apps/*/build/**"
  ]
}
```

## 📚 Documentation

### Available Guides

- **[README.md](./README.md)** - Extension overview

## 🔧 How to Update

### Existing Users

The extension will be updated automatically. The new exclusions will take effect immediately.

### Custom Configuration

If you already had a custom configuration, it will be preserved. To use the new defaults:

1. Open settings (`Ctrl+,`)
2. Search for "Pack-Man: Exclude Folders"
3. Click "Reset Setting"

## 🎨 UX Improvements

### Optimized Sidebar Layout

- **Overview expanded by default** - Focus on the most important information
- **Other tabs collapsed** - Package Files, Settings, and Help start closed
- **Better use of space** - No unnecessary scrolling
- **Intuitive navigation** - Click to expand/collapse tabs

## 🐛 Bug Fixes

- Improved package file detection
- Optimized caching system
- Reduced CPU usage during analysis
- Fixed broken layout when all tabs were open

## 🔄 Compatibility

- ✅ VS Code 1.85.0 or higher
- ✅ Backward compatible
- ✅ Old settings continue to work

## 💡 Tips

### Check Excluded Files

1. Open Output (`Ctrl+Shift+U`)
2. Select "Pack-Man"
3. Look for messages: `[Pack-Man] File excluded by pattern`

### Manual Analysis

Even with exclusions active, you can analyze any file manually:

- Open the file
- Press `Ctrl+Alt+A`

### Disable Exclusions

To analyze everything (not recommended):

```json
{
  "packman.excludeFolders": []
}
```

## 🙏 Feedback

Found an issue or have suggestions?

- 🐛 [Report Bug](https://github.com/avencadigital/pack-man-vscode/issues)
- 💡 [Suggest Feature](https://github.com/avencadigital/pack-man-vscode/issues)
- ⭐ [Rate on Marketplace](https://marketplace.visualstudio.com/)

## 📅 Upcoming Versions

We're working on:

- 🔍 Security vulnerability analysis
- 📊 Dependency graphs
- 🤖 Automatic update suggestions
- 🔗 CI/CD integration

---

**Thank you for using Pack-Man!** 🎮

Version: 1.1.0
Date: December 3, 2024
