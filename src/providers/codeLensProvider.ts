/**
 * CodeLens Provider for Pack-Man VS Code Extension
 * 
 * Displays inline indicators below dependencies showing their status
 * (up-to-date, outdated, or error) with actionable commands.
 */

import * as vscode from 'vscode';
import { AnalysisService, PackageAnalysis } from '../services/analysisService';
import { ParserService } from '../services/parserService';
import { getChangeTypeIcon, getSeverityIcon } from '../utils/versionUtils';

export class DependencyCodeLensProvider implements vscode.CodeLensProvider {
    private analysisService: AnalysisService;
    private parserService: ParserService;
    private codeLensEmitter: vscode.EventEmitter<void>;
    private debounceTimer: NodeJS.Timeout | undefined;
    private readonly DEBOUNCE_DELAY = 300; // 300ms debounce

    public readonly onDidChangeCodeLenses: vscode.Event<void>;

    constructor(analysisService: AnalysisService, parserService: ParserService) {
        this.analysisService = analysisService;
        this.parserService = parserService;
        this.codeLensEmitter = new vscode.EventEmitter<void>();
        this.onDidChangeCodeLenses = this.codeLensEmitter.event;

        // Subscribe to analysis updates to refresh CodeLens
        this.analysisService.onAnalysisUpdate(() => {
            this.refreshCodeLenses();
        });
    }

    /**
     * Provides CodeLens items for a document
     * @param document The document to provide CodeLens for
     * @param token Cancellation token
     * @returns Array of CodeLens items
     */
    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        // Check if CodeLens is enabled in settings
        const config = vscode.workspace.getConfiguration('packman');
        const showCodeLens = config.get<boolean>('showCodeLens', true);

        if (!showCodeLens) {
            return [];
        }

        // Check if this is a supported package file
        const fileName = document.uri.fsPath.split(/[\\/]/).pop() || '';
        const fileType = this.parserService.detectFileType(fileName);

        if (!fileType) {
            return [];
        }

        // Get cached analysis result
        const analysisResult = this.analysisService.getCachedResult(document.uri);

        if (!analysisResult || analysisResult.packages.length === 0) {
            return [];
        }

        // Create CodeLens for each package
        const codeLenses: vscode.CodeLens[] = [];

        for (let i = 0; i < analysisResult.packages.length; i++) {
            const pkg = analysisResult.packages[i];

            // Convert 1-based line number to 0-based for VS Code Range
            const lineIndex = pkg.line - 1;

            // Position CodeLens BELOW the package line (lineIndex + 1)
            const codeLensLine = lineIndex + 1;
            const range = new vscode.Range(codeLensLine, 0, codeLensLine, 0);

            // Create the main status CodeLens
            const statusCodeLens = new vscode.CodeLens(range, {
                title: this.getCodeLensTitle(pkg),
                command: '',
                tooltip: this.getCodeLensTooltip(pkg)
            });
            codeLenses.push(statusCodeLens);

            // Add update command CodeLens for outdated packages (on the same line)
            const updateCommand = this.getCodeLensCommand(pkg, document.uri);
            if (updateCommand) {
                const updateCodeLens = new vscode.CodeLens(range, updateCommand);
                codeLenses.push(updateCodeLens);
            }
        }

        return codeLenses;
    }

    /**
     * Resolves a CodeLens item
     * @param codeLens The CodeLens to resolve
     * @param token Cancellation token
     * @returns Resolved CodeLens
     */
    resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens> {
        // CodeLens is already resolved in provideCodeLenses
        return codeLens;
    }

    /**
     * Refreshes CodeLens with debouncing
     */
    private refreshCodeLenses(): void {
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Set new timer
        this.debounceTimer = setTimeout(() => {
            this.codeLensEmitter.fire();
        }, this.DEBOUNCE_DELAY);
    }

    /**
     * Gets the title for a CodeLens based on package status
     * @param pkg Package analysis data
     * @returns CodeLens title
     */
    private getCodeLensTitle(pkg: PackageAnalysis): string {
        switch (pkg.status) {
            case 'up-to-date':
                return '✅ $(check) Up to date';
            case 'outdated':
                // Show change type and severity for outdated packages
                const icon = pkg.changeType ? getChangeTypeIcon(pkg.changeType) : '$(warning)';
                const changeLabel = pkg.changeType ? ` [${pkg.changeType.toUpperCase()}]` : '';

                // Add colored emoji based on severity
                let severityEmoji = '';
                if (pkg.updateSeverity === 'critical') {
                    severityEmoji = '🔴 | 🛑⚠️ | ';
                } else if (pkg.updateSeverity === 'important') {
                    severityEmoji = '🟡 | ⚠️ ';
                } else if (pkg.updateSeverity === 'normal') {
                    severityEmoji = '🟢 | ';
                }

                return `${severityEmoji}${icon} Update available: ${pkg.latestVersion}${changeLabel}`;
            case 'error':
                return `❌ $(error) ${pkg.error || 'Error analyzing package'}`;
            default:
                return '❓ $(question) Unknown status';
        }
    }

    /**
     * Gets the command for a CodeLens based on package status
     * @param pkg Package analysis data
     * @param uri Document URI
     * @returns CodeLens command or undefined
     */
    private getCodeLensCommand(pkg: PackageAnalysis, uri: vscode.Uri): vscode.Command | undefined {
        if (pkg.status === 'outdated') {
            return {
                title: '⬆️ Update',
                command: 'packman.updateDependency',
                arguments: [uri, pkg.name, pkg.latestVersion]
            };
        }
        // No command for up-to-date or error packages
        return undefined;
    }

    /**
     * Gets the tooltip for a CodeLens
     * @param pkg Package analysis data
     * @returns Tooltip text
     */
    private getCodeLensTooltip(pkg: PackageAnalysis): string {
        switch (pkg.status) {
            case 'up-to-date':
                return `✅ ${pkg.name} is up to date (${pkg.currentVersion})`;
            case 'outdated':
                let tooltip = `📦 ${pkg.name}: ${pkg.currentVersion} → ${pkg.latestVersion}`;

                if (pkg.changeType) {
                    const changeDesc = pkg.changeType === 'major'
                        ? '💥 Breaking changes expected'
                        : pkg.changeType === 'minor'
                            ? '✨ New features'
                            : '🔧 Bug fixes';
                    tooltip += `\n${changeDesc}`;
                }

                if (pkg.updateSeverity === 'critical') {
                    tooltip += '\n🔴 | 🛑⚠️ | CRITICAL: Major version update - review breaking changes';
                } else if (pkg.updateSeverity === 'important') {
                    tooltip += '\n🟡 | ⚠️ | IMPORTANT: Significant version gap detected';
                } else if (pkg.updateSeverity === 'normal') {
                    tooltip += '\n🟢 | Normal update';
                }

                tooltip += '\n\n⬆️ Click to update.';
                return tooltip;
            case 'error':
                return `❌ ${pkg.name}: ${pkg.error || 'Error analyzing package'}`;
            default:
                return `❓ ${pkg.name}`;
        }
    }

    /**
     * Disposes the CodeLens provider
     */
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.codeLensEmitter.dispose();
    }
}
