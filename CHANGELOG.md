# Changelog

All notable changes to the Pack-Man VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2024-12-03

### Added

- **Visual Folder Exclusion Interface**: New UI in Settings panel for managing excluded folders
  - Add/remove patterns with one click
  - Visual list of all active patterns
  - Quick reset to default values
  - Integrated pattern examples
  - Real-time validation
- **Folder Exclusion**: New configuration option to exclude specific folders from analysis
  - Default exclusions: `node_modules`, `.next`, `dist`, `build`, `.git`
  - Configurable via `packman.excludeFolders` setting
  - Supports glob patterns for flexible matching
  - Improves performance by avoiding unnecessary analysis in build/cache folders
- **Documentation**: Added comprehensive guides
  - RELEASE_NOTES_v1.1.0.md - Release notes

### Changed

- **File Discovery**: Updated file search logic to respect exclusion patterns
- **Auto-analysis**: File watchers now skip excluded folders
- **Performance**: Reduced memory usage and analysis time in large projects
- **Settings Panel**: Enhanced with new Exclude Folders section
- **Sidebar Layout**: Views now start collapsed except Overview for better UX

## [1.0.1] - 2024-11-28

### Fixed

- **requirements.txt Updates**: Fixed regex pattern that prevented version updates in requirements.txt files
- **pubspec.yaml Updates**: Fixed regex pattern that prevented version updates in pubspec.yaml files
- **Regex Escaping**: Corrected escapeRegex function to properly escape special characters (was using UUID instead of `\\$&`)
- **Version Matching**: Improved version matching to handle various formats:
  - requirements.txt: Supports `==`, `>=`, `~=`, etc.
  - pubspec.yaml: Supports versions with/without `^` prefix and with/without quotes

### Technical Details

- Fixed incomplete regex patterns in `updateRequirementsTxtVersion` and `updatePubspecYamlVersion` methods
- All update methods now properly preserve file formatting and special characters
- Added comprehensive test coverage for all three file formats

## [1.0.0] - 2024-01-XX

### Initial Release

#### Features

##### Core Functionality

- **Multi-format Support**: Analyze dependencies from `package.json` (npm), `requirements.txt` (pip), and `pubspec.yaml` (pub)
- **Automatic Activation**: Extension activates when opening projects with supported package files
- **Real-time Analysis**: Instant dependency health checking against official registries

##### Visual Indicators

- **CodeLens Integration**: Inline status indicators above each dependency
  - Green checkmark (✅) for up-to-date packages
  - Yellow warning (⚠️) for outdated packages with available version
  - Red error (❌) for packages with issues
- **Hover Provider**: Detailed package information on hover including:
  - Current and latest versions
  - Package status
  - Documentation links
  - Registry URLs
- **Diagnostics**: Outdated and error dependencies appear in VS Code's Problems panel
- **Status Bar**: Project-wide dependency health indicator with click-to-view details

##### Update Functionality

- **Single Dependency Updates**: One-click updates from CodeLens indicators
- **Bulk Updates**: Update all outdated dependencies with a single command
- **Format Preservation**: Maintains file formatting and comments during updates
- **Progress Notifications**: Real-time feedback during update operations
- **Success/Error Notifications**: Clear feedback on update results

##### Smart Features

- **Auto-analysis on Save**: Automatically re-analyzes when package files are saved
- **Intelligent Caching**:
  - 5-minute TTL for successful API responses
  - 2-minute TTL for error responses
  - Maximum 100 cache entries with LRU eviction
- **File System Watching**: Monitors package file changes
- **Multi-root Workspace Support**: Handles multiple projects simultaneously

##### Commands

- `Pack-Man: Analyze Dependencies` - Analyze active package file
- `Pack-Man: Analyze Workspace` - Analyze all package files in workspace
- `Pack-Man: Update Dependency` - Update specific dependency
- `Pack-Man: Update All Dependencies` - Update all outdated packages
- `Pack-Man: Show Analysis` - Open detailed analysis webview

##### Configuration

- `packman.apiEndpoint` - Configure API endpoint (default: https://pack-man.tech)
- `packman.autoAnalyzeOnSave` - Enable/disable auto-analysis on save (default: true)
- `packman.showCodeLens` - Show/hide CodeLens indicators (default: true)
- `packman.showDiagnostics` - Show/hide diagnostics in Problems panel (default: true)
- GitHub Token support via VS Code SecretStorage for private repositories

##### Keyboard Shortcuts

- `Ctrl+Shift+P A` (Mac: `Cmd+Shift+P A`) - Analyze Dependencies
- `Ctrl+Shift+P U` (Mac: `Cmd+Shift+P U`) - Update All Dependencies

##### UI Components

- **Webview Panel**: Rich analysis view with:
  - Statistics dashboard (up-to-date, outdated, errors)
  - Detailed package list with status indicators
  - Update actions for outdated packages
  - Theme support (light/dark mode)

##### Performance

- Fast activation time (< 500ms target)
- Debounced CodeLens updates (300ms)
- Incremental parsing for large files
- Asynchronous processing to avoid blocking UI

##### Error Handling

- Retry logic with exponential backoff (3 retries)
- Timeout handling (30 seconds)
- Rate limit detection with helpful guidance
- Network error handling with troubleshooting tips
- Authentication error prompts for GitHub token configuration

#### Requirements Implemented

This release implements all core requirements from the specification:

- ✅ Requirement 1: Automatic activation for package files
- ✅ Requirement 2: Inline CodeLens indicators
- ✅ Requirement 3: Hover information cards
- ✅ Requirement 4: Problems panel diagnostics
- ✅ Requirement 5: Status bar indicator
- ✅ Requirement 6: Single dependency updates
- ✅ Requirement 7: Bulk dependency updates
- ✅ Requirement 8: Auto-analysis on save
- ✅ Requirement 9: Manual analysis commands
- ✅ Requirement 10: API endpoint configuration
- ✅ Requirement 11: GitHub token support
- ✅ Requirement 12: Response caching
- ✅ Requirement 13: Webview panel
- ✅ Requirement 15: File parsing (package.json, requirements.txt, pubspec.yaml)
- ✅ Requirement 16: API error handling
- ✅ Requirement 17: Performance optimization
- ✅ Requirement 18: Keyboard shortcuts

#### Known Limitations

The following features are planned for future releases:

- **Multi-root Workspace**: Full multi-root workspace support (Requirement 14)
- **Terminal Integration**: Run update commands in integrated terminal (Requirement 20)
- **Update Command Generation**: Generate package manager specific commands (Requirement 19)
- **Advanced Error Handling**: Enhanced authentication and rate limit handling (Requirement 16)

#### Technical Details

- **Minimum VS Code Version**: 1.85.0
- **Language**: TypeScript
- **Build System**: esbuild for fast bundling
- **Testing**: Vitest for unit tests, fast-check for property-based testing
- **Dependencies**:
  - axios (HTTP client)
  - VS Code Extension API

#### Security

- GitHub tokens stored securely in VS Code's SecretStorage (encrypted)
- HTTPS-only API communication
- No telemetry or usage data collection
- Minimal permission requirements

---

## Future Roadmap

### Planned Features

#### Version 1.1.0

- Full multi-root workspace support with independent folder analysis
- Terminal integration for running update commands
- Update command generation (npm, pip, pub)
- Enhanced authentication error handling
- Rate limit optimization

#### Version 1.2.0

- Monorepo support (Lerna, Nx, Turborepo)
- Dependency graph visualization
- Security vulnerability scanning
- Custom registry support (private npm/pip/pub)

#### Version 2.0.0

- Automated PR creation for dependency updates
- CI/CD integration
- Dependency insights (download stats, maintenance status, licenses)
- Smart update strategies based on semver and changelogs

---

## Support

For issues, feature requests, or contributions:

- **GitHub**: [github.com/avencadigital/pack-man-vscode](https://github.com/avencadigital/pack-man-vscode)
- **Website**: [pack-man.tech](https://pack-man.tech)
- **Documentation**: [docs.pack-man.vercel.tech](https://docs.pack-man.tech/)
