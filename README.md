# Pack-Man VS Code Extension

Analyze and update package dependencies directly in Visual Studio Code. Pack-Man brings real-time dependency health monitoring to your editor with inline indicators, hover information, and quick update actions.

![Pack-Man Extension](https://pack-man.tech/og.png)

## Features

### 🔍 Real-time Dependency Analysis

- **Automatic Detection**: Activates when you open projects with `package.json`, `requirements.txt`, or `pubspec.yaml`
- **Multi-ecosystem Support**: Works with npm, pip, and pub package managers
- **Instant Feedback**: See dependency status as you edit your files

### 📊 Visual Indicators

- **CodeLens Integration**: Inline status indicators above each dependency
  - ✅ Green checkmark for up-to-date packages
  - ⚠️ Yellow warning for outdated packages with available version
  - ❌ Red error for packages with issues
- **Hover Information**: Detailed package info on hover including current version, latest version, documentation links, and registry URLs
- **Problems Panel**: Outdated and error dependencies appear in VS Code's Problems panel
- **Status Bar**: Project-wide dependency health at a glance

### ⚡ Quick Actions

- **One-Click Updates**: Update individual dependencies directly from CodeLens
- **Bulk Updates**: Update all outdated dependencies with a single command
- **File Preservation**: Maintains formatting and comments when updating
- **Progress Feedback**: Real-time notifications during updates

### 🎨 Rich UI

- **Detailed Webview**: Comprehensive analysis panel with statistics and package lists
- **Theme Support**: Respects your VS Code theme (light/dark mode)
- **Responsive Design**: Clean, intuitive interface

### 🚀 Smart Features

- **Auto-analysis on Save**: Automatically re-analyzes when you save package files
- **Intelligent Caching**: Reduces API calls with smart caching (5min success, 2min error TTL)
- **Multi-root Workspaces**: Handles multiple projects simultaneously
- **GitHub Token Support**: Analyze private repositories with authentication

## Installation

### For Developers (From Source)

If you're working on the extension or want to install from source:

```bash
npm install
npm run ext-install
```

This command builds the extension and installs it with auto-reload.

### From VSIX (For Testing)

1. Download the `.vsix` file
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Install from VSIX" and select the command
5. Choose the downloaded `.vsix` file
6. Reload VS Code when prompted

### From Marketplace (Coming Soon)

Search for "Pack-Man" in the VS Code Extensions marketplace and click Install.

## Usage

### Automatic Analysis

The extension automatically activates when you open a workspace containing:

- `package.json` (npm/Node.js projects)
- `requirements.txt` (Python/pip projects)
- `pubspec.yaml` (Flutter/Dart projects)

### Manual Commands

Access these commands via Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- **Pack-Man: Analyze Dependencies** - Analyze the active package file
- **Pack-Man: Analyze Workspace** - Analyze all package files in workspace
- **Pack-Man: Update All Dependencies** - Update all outdated packages in active file
- **Pack-Man: Show Analysis** - Open detailed analysis webview

### Keyboard Shortcuts

- `Ctrl+Shift+P A` (or `Cmd+Shift+P A` on Mac) - Analyze Dependencies
- `Ctrl+Shift+P U` (or `Cmd+Shift+P U` on Mac) - Update All Dependencies

## Configuration

Configure Pack-Man through VS Code settings (`File > Preferences > Settings` or `Ctrl+,`):

### API Endpoint

```json
"packman.apiEndpoint": "https://pack-man.tech"
```

Change this to use a self-hosted Pack-Man instance.

### Auto-analyze on Save

```json
"packman.autoAnalyzeOnSave": true
```

Automatically analyze dependencies when package files are saved.

### Auto-analyze on Open

```json
"packman.autoAnalyzeOnOpen": true
```

Automatically analyze dependencies when package files are opened.

### Exclude Folders

```json
"packman.excludeFolders": [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**"
]
```

Glob patterns for folders to exclude from package file analysis. By default, common build and dependency folders are excluded to improve performance and avoid unnecessary analysis.

**Common patterns:**
- `**/node_modules/**` - Node.js dependencies
- `**/.next/**` - Next.js build cache
- `**/dist/**` - Distribution/build folder
- `**/build/**` - Generic build folder
- `**/.venv/**` - Python virtual environment
- `**/.dart_tool/**` - Dart tool cache

See [EXCLUSAO_DE_PASTAS.md](./EXCLUSAO_DE_PASTAS.md) for detailed documentation in Portuguese.

Automatically re-analyze dependencies when you save package files.

### Show CodeLens

```json
"packman.showCodeLens": true
```

Display inline status indicators above dependencies.

### Show Diagnostics

```json
"packman.showDiagnostics": true
```

Show outdated/error dependencies in the Problems panel.

### GitHub Token (Secure Storage)

For private repositories or to increase API rate limits:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Search for "Preferences: Open Settings (UI)"
3. Search for "Pack-Man"
4. Click "Edit in settings.json" for GitHub Token
5. The token is stored securely in VS Code's SecretStorage

**Benefits of GitHub Token:**

- Access private repositories
- Increased rate limits (5000/hour vs 60/hour)
- Better reliability for large projects

## Supported Package Managers

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

## How It Works

1. **Detection**: Extension detects package files in your workspace
2. **Parsing**: Extracts dependencies from files
3. **Analysis**: Sends package list to Pack-Man API
4. **Display**: Shows results through CodeLens, hover, diagnostics, and status bar
5. **Caching**: Caches results to minimize API calls
6. **Updates**: Applies updates while preserving file formatting

## Troubleshooting

### Extension Not Activating

**Problem**: Extension doesn't activate when opening package files.

**Solutions**:

- Ensure the file is named correctly (`package.json`, `requirements.txt`, or `pubspec.yaml`)
- Check that the file is in the workspace root or a subdirectory
- Reload VS Code window (`Ctrl+Shift+P` > "Reload Window")

### No CodeLens Indicators

**Problem**: Inline indicators don't appear above dependencies.

**Solutions**:

- Check that `packman.showCodeLens` is enabled in settings
- Verify the file is a valid package file
- Wait a few seconds for initial analysis to complete
- Check Output panel (`View > Output` > select "Pack-Man") for errors

### API Connection Issues

**Problem**: "Failed to analyze dependencies" errors.

**Solutions**:

- Check your internet connection
- Verify `packman.apiEndpoint` is correct in settings
- Check if you're behind a proxy or firewall
- Try again in a few minutes (might be temporary API issue)

### Rate Limit Errors

**Problem**: "Rate limit exceeded" messages.

**Solutions**:

- Configure a GitHub token in settings (increases limit to 5000/hour)
- Wait for the rate limit to reset (usually 1 hour)
- Use caching to reduce API calls

### Updates Not Working

**Problem**: Update commands fail or don't change the file.

**Solutions**:

- Ensure the file is not read-only
- Check file permissions
- Verify you have write access to the file
- Close other programs that might have the file open

### Private Repository Access

**Problem**: Can't analyze dependencies in private repositories.

**Solutions**:

- Configure a GitHub token with appropriate permissions
- Ensure the token has `repo` scope for private repositories
- Verify the token is valid and not expired

## Performance

The extension is designed to be lightweight and efficient:

- **Activation Time**: < 500ms
- **Parsing**: Incremental parsing with caching
- **CodeLens Updates**: Debounced by 300ms
- **API Calls**: Cached for 5 minutes (success) or 2 minutes (errors)
- **Memory**: Minimal footprint with automatic cleanup

## Privacy & Security

- **GitHub Tokens**: Stored securely in VS Code's SecretStorage (encrypted)
- **API Communication**: HTTPS only
- **No Telemetry**: Extension doesn't collect or send usage data
- **Local Processing**: File parsing happens locally
- **Minimal Permissions**: Only requests necessary VS Code API permissions

## Contributing

Contributions are welcome! Please visit our [GitHub repository](https://github.com/pack-man/pack-man) for:

- Bug reports
- Feature requests
- Pull requests
- Documentation improvements

## Related Projects

- **Pack-Man Web App**: [pack-man.tech](https://pack-man.tech)
- **Pack-Man Chrome Extension**: Analyze dependencies on GitHub repository pages

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/avencadigital/pack-man-vscode/issues)
- **Documentation**: [docs.pack-man.tech](https://docs.pack-man.tech)
- **Website**: [pack-man.tech](https://pack-man.tech)

---

**Made with ❤️ by the Pack-Man team**
