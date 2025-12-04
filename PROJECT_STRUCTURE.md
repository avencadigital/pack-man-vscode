# VS Code Extension Project Structure

## Overview

This is a self-contained VS Code extension project for Pack-Man dependency analysis. The extension is built with TypeScript and uses esbuild for bundling.

## Directory Structure

```
vscode-extension/
├── .vscode/                    # VS Code workspace configuration
│   ├── launch.json            # Debug configurations
│   ├── tasks.json             # Build tasks
│   └── settings.json          # Workspace settings
├── src/                       # Source code
│   ├── commands/              # Command handlers (to be implemented)
│   ├── providers/             # CodeLens, Hover, Diagnostic providers (to be implemented)
│   ├── services/              # Core services (to be implemented)
│   │   ├── CacheService      # Response caching with TTL
│   │   ├── ParserService     # Package file parsing
│   │   ├── APIClientService  # Pack-Man API integration
│   │   └── AnalysisService   # Orchestration layer
│   ├── ui/                    # UI components (to be implemented)
│   │   ├── StatusBarManager  # Status bar integration
│   │   ├── WebviewManager    # Rich UI panels
│   │   └── TerminalManager   # Terminal integration
│   ├── extension.ts           # Extension entry point
│   ├── extension.test.ts      # Basic unit tests
│   └── setup.test.ts          # Property-based testing setup verification
├── dist/                      # Compiled extension (generated)
├── out/                       # TypeScript compilation output (generated)
├── node_modules/              # Dependencies (generated)
├── package.json               # Extension manifest and dependencies
├── tsconfig.json              # TypeScript configuration
├── vitest.config.ts           # Vitest test configuration
├── eslint.config.mjs          # ESLint configuration
├── esbuild.js                 # Build script
├── .vscodeignore              # Files to exclude from extension package
├── .gitignore                 # Git ignore patterns
├── README.md                  # User documentation
├── CHANGELOG.md               # Version history
└── PROJECT_STRUCTURE.md       # This file
```

## Key Files

### package.json
- Extension manifest with VS Code configuration
- Defines commands, configuration options, and keybindings
- Lists dependencies and build scripts
- Activation events for automatic extension loading

### tsconfig.json
- TypeScript compiler configuration
- Isolated from main Pack-Man project
- Targets ES2020 with CommonJS modules
- Strict type checking enabled

### esbuild.js
- Bundles extension into single file for distribution
- Handles production minification
- Supports watch mode for development
- Excludes VS Code API from bundle

### vitest.config.ts
- Test framework configuration
- Supports both unit tests and property-based tests
- Coverage reporting enabled

## Development Workflow

### Initial Setup
```bash
cd vscode-extension
npm install
```

### Development
```bash
npm run watch          # Watch mode with auto-rebuild
```

Then press F5 in VS Code to launch Extension Development Host.

### Testing
```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
```

### Building
```bash
npm run build         # Production build
```

### Linting
```bash
npm run lint          # Check code style
```

### Packaging
```bash
npm run package       # Create .vsix file for distribution
```

## Testing Strategy

### Unit Tests
- Located alongside source files with `.test.ts` suffix
- Use Vitest as test runner
- Test individual functions and classes in isolation

### Property-Based Tests
- Use fast-check library for generative testing
- Minimum 100 iterations per property
- Tagged with comments referencing design document properties
- Format: `// Feature: vscode-extension, Property N: [property text]`

### Integration Tests
- Use @vscode/test-electron for VS Code API testing
- Test provider registration and lifecycle
- Test command execution and UI updates

## Dependencies

### Runtime Dependencies
- **axios**: HTTP client for API requests

### Development Dependencies
- **@types/vscode**: VS Code API type definitions
- **@types/node**: Node.js type definitions
- **typescript**: TypeScript compiler
- **esbuild**: Fast bundler
- **vitest**: Test framework
- **fast-check**: Property-based testing library
- **@vscode/test-electron**: VS Code extension testing
- **@vscode/vsce**: Extension packaging tool
- **eslint**: Code linting
- **@typescript-eslint/**: TypeScript ESLint plugins

## Build Output

### Development Build
- Output: `dist/extension.js`
- Includes source maps
- Not minified

### Production Build
- Output: `dist/extension.js`
- Minified
- No source maps
- Optimized for size

## Extension Activation

The extension activates when:
- A JSON file is opened (for package.json)
- A YAML file is opened (for pubspec.yaml)
- A plaintext file is opened (for requirements.txt)
- Workspace contains package.json
- Workspace contains requirements.txt
- Workspace contains pubspec.yaml

## Configuration

Users can configure:
- **packman.apiEndpoint**: API endpoint URL (default: https://pack-man.tech)
- **packman.autoAnalyzeOnSave**: Auto-analyze on save (default: true)
- **packman.showCodeLens**: Show CodeLens indicators (default: true)
- **packman.showDiagnostics**: Show diagnostics (default: true)
- **packman.githubToken**: GitHub token (stored in SecretStorage)

## Next Steps

1. Implement core services (Cache, Parser, API Client, Analysis)
2. Implement providers (CodeLens, Hover, Diagnostic)
3. Implement UI components (Status Bar, Webview, Terminal)
4. Implement commands (Analyze, Update)
5. Add comprehensive tests
6. Create documentation and examples
7. Package and publish to VS Code Marketplace

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
