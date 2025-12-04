/**
 * Hover Provider for Pack-Man VS Code Extension
 * 
 * Displays detailed package information when hovering over dependency names
 * including current version, latest version, status, documentation links,
 * and registry URLs.
 */

import * as vscode from 'vscode';
import { AnalysisService, PackageAnalysis } from '../services/analysisService';
import { ParserService } from '../services/parserService';
import { getChangeTypeDescription, getSeverityDescription } from '../utils/versionUtils';

export class DependencyHoverProvider implements vscode.HoverProvider {
    private analysisService: AnalysisService;
    private parserService: ParserService;

    constructor(analysisService: AnalysisService, parserService: ParserService) {
        this.analysisService = analysisService;
        this.parserService = parserService;
    }

    /**
     * Provides hover information for a position in a document
     * @param document The document to provide hover for
     * @param position The position in the document
     * @param token Cancellation token
     * @returns Hover information or undefined
     */
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Check if this is a supported package file
        const fileName = document.uri.fsPath.split(/[\\/]/).pop() || '';
        const fileType = this.parserService.detectFileType(fileName);

        if (!fileType) {
            return undefined;
        }

        // Get cached analysis result
        const analysisResult = this.analysisService.getCachedResult(document.uri);

        if (!analysisResult || analysisResult.packages.length === 0) {
            return undefined;
        }

        // Find the package at the current position
        const pkg = this.findPackageAtPosition(document, position, analysisResult.packages);

        if (!pkg) {
            return undefined;
        }

        // Create hover content
        const markdown = this.createHoverContent(pkg);

        // Create hover with the package name range
        const range = this.getPackageNameRange(document, position, pkg.name);

        return new vscode.Hover(markdown, range);
    }

    /**
     * Finds the package at the given position
     * @param document The document
     * @param position The position
     * @param packages List of packages
     * @returns Package analysis or undefined
     */
    private findPackageAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        packages: PackageAnalysis[]
    ): PackageAnalysis | undefined {
        // Get the line at the position
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Find package whose name appears on this line
        for (const pkg of packages) {
            // Check if this is the correct line (0-based vs 1-based)
            if (pkg.line - 1 === position.line) {
                // Check if the cursor is on the package name
                const nameIndex = lineText.indexOf(pkg.name);
                if (nameIndex !== -1) {
                    const nameStart = nameIndex;
                    const nameEnd = nameIndex + pkg.name.length;

                    if (position.character >= nameStart && position.character <= nameEnd) {
                        return pkg;
                    }
                }
            }
        }

        return undefined;
    }

    /**
     * Gets the range of the package name in the document
     * @param document The document
     * @param position The position
     * @param packageName The package name
     * @returns Range of the package name
     */
    private getPackageNameRange(
        document: vscode.TextDocument,
        position: vscode.Position,
        packageName: string
    ): vscode.Range {
        const line = document.lineAt(position.line);
        const lineText = line.text;
        const nameIndex = lineText.indexOf(packageName);

        if (nameIndex !== -1) {
            return new vscode.Range(
                position.line,
                nameIndex,
                position.line,
                nameIndex + packageName.length
            );
        }

        // Fallback to current position
        return new vscode.Range(position, position);
    }

    /**
     * Creates hover content markdown
     * @param pkg Package analysis data
     * @returns Markdown string
     */
    private createHoverContent(pkg: PackageAnalysis): vscode.MarkdownString {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.supportHtml = true;

        // Title with package name
        markdown.appendMarkdown(`## 📦 ${pkg.name}\n\n`);

        // Handle different statuses with specific layouts
        if (pkg.status === 'up-to-date') {
            this.createUpToDateContent(markdown, pkg);
        } else if (pkg.status === 'outdated') {
            this.createOutdatedContent(markdown, pkg);
        } else if (pkg.status === 'error') {
            this.createErrorContent(markdown, pkg);
        }

        // Links section (always at the bottom if available)
        if (pkg.documentationUrl || pkg.registryUrl) {
            markdown.appendMarkdown(`\n---\n\n`);
            markdown.appendMarkdown(`**🔗 Quick Links**\n\n`);

            if (pkg.documentationUrl) {
                markdown.appendMarkdown(`[📚 Documentation](${pkg.documentationUrl}) • `);
            }

            if (pkg.registryUrl) {
                markdown.appendMarkdown(`[📦 Registry](${pkg.registryUrl})`);
            }

            markdown.appendMarkdown(`\n\n`);
        }

        return markdown;
    }

    /**
     * Creates content for up-to-date packages
     */
    private createUpToDateContent(markdown: vscode.MarkdownString, pkg: PackageAnalysis): void {
        markdown.appendMarkdown(`✅ **Up to date** • \`${pkg.currentVersion}\`\n\n`);
        markdown.appendMarkdown(`*Registry:* ${this.getRegistryName(pkg.registry)}\n\n`);
    }

    /**
     * Creates content for outdated packages
     */
    private createOutdatedContent(markdown: vscode.MarkdownString, pkg: PackageAnalysis): void {
        // Severity banner at the top
        if (pkg.updateSeverity) {
            const banner = this.getSeverityBanner(pkg.updateSeverity);
            markdown.appendMarkdown(`${banner}\n\n`);
        }

        // Version comparison - prominent display
        markdown.appendMarkdown(`### 📊 Version Update\n\n`);
        markdown.appendMarkdown(`\`${pkg.currentVersion}\` → \`${pkg.latestVersion}\`\n\n`);

        // Update details in a compact format
        if (pkg.changeType) {
            const changeTypeEmoji = pkg.changeType === 'major' ? '💥' :
                pkg.changeType === 'minor' ? '✨' : '🔧';
            const changeDesc = pkg.changeType === 'major' ? 'Breaking changes expected' :
                pkg.changeType === 'minor' ? 'New features available' : 'Bug fixes & improvements';

            markdown.appendMarkdown(`${changeTypeEmoji} **${pkg.changeType.toUpperCase()} Update** • ${changeDesc}\n\n`);
        }

        // Registry info
        markdown.appendMarkdown(`*Registry:* ${this.getRegistryName(pkg.registry)}\n\n`);

        // Additional warnings for critical updates
        if (pkg.updateSeverity === 'critical') {
            markdown.appendMarkdown(`\n> ⚠️ **Important:** Review breaking changes before updating\n\n`);
        } else if (pkg.updateSeverity === 'important') {
            markdown.appendMarkdown(`\n> 💡 **Note:** Significant version gap detected - review changelog\n\n`);
        }
    }

    /**
     * Creates content for packages with errors
     */
    private createErrorContent(markdown: vscode.MarkdownString, pkg: PackageAnalysis): void {
        markdown.appendMarkdown(`❌ **Error**\n\n`);
        markdown.appendMarkdown(`\`${pkg.currentVersion}\`\n\n`);

        if (pkg.error) {
            markdown.appendMarkdown(`> ${pkg.error}\n\n`);
        }

        markdown.appendMarkdown(`*Registry:* ${this.getRegistryName(pkg.registry)}\n\n`);
    }

    /**
     * Gets severity banner for outdated packages
     */
    private getSeverityBanner(severity: 'critical' | 'important' | 'normal' | 'none'): string {
        switch (severity) {
            case 'critical':
                return `> ⚠️ **CRITICAL UPDATE** ⚠️`;
            case 'important':
                return `> **IMPORTANT UPDATE**`;
            case 'normal':
                return `> **Update Available**`;
            case 'none':
                return `> **Update Available**`;
        }
    }

    /**
     * Gets status icon for display
     * @param status Package status
     * @returns Icon string
     */
    private getStatusIcon(status: PackageAnalysis['status']): string {
        switch (status) {
            case 'up-to-date':
                return '✅';
            case 'outdated':
                return '⚠️';
            case 'error':
                return '❌';
            default:
                return '❓';
        }
    }

    /**
     * Gets status text for display
     * @param status Package status
     * @returns Status text
     */
    private getStatusText(status: PackageAnalysis['status']): string {
        switch (status) {
            case 'up-to-date':
                return 'Up to date';
            case 'outdated':
                return 'Update available';
            case 'error':
                return 'Error';
            default:
                return 'Unknown';
        }
    }

    /**
     * Gets registry display name
     * @param registry Registry type
     * @returns Registry name
     */
    private getRegistryName(registry: PackageAnalysis['registry']): string {
        switch (registry) {
            case 'npm':
                return 'npm';
            case 'pypi':
                return 'PyPI';
            case 'pub':
                return 'pub.dev';
            default:
                return registry;
        }
    }
}
