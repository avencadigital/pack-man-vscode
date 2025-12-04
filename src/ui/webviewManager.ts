/**
 * Webview Manager for VS Code Extension
 * 
 * Manages the webview panel for displaying detailed dependency analysis.
 * Handles webview lifecycle (create, reveal, dispose) and message passing.
 */

import * as vscode from 'vscode';
import { AnalysisService, AnalysisResult } from '../services/analysisService';

export class WebviewManager implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private analysisService: AnalysisService;
    private context: vscode.ExtensionContext;
    private currentResult: AnalysisResult | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(analysisService: AnalysisService, context: vscode.ExtensionContext) {
        this.analysisService = analysisService;
        this.context = context;

        // Subscribe to analysis updates
        this.disposables.push(
            this.analysisService.onAnalysisUpdate((result) => {
                // Update webview if it's showing the same file
                if (this.panel && this.currentResult &&
                    result.uri.toString() === this.currentResult.uri.toString()) {
                    this.currentResult = result;
                    this.updateWebviewContent();
                }
            })
        );
    }

    /**
     * Shows the analysis webview panel
     * @param result Analysis result to display
     */
    showAnalysis(result: AnalysisResult): void {
        this.currentResult = result;

        if (this.panel) {
            // Panel already exists, reveal it
            this.panel.reveal(vscode.ViewColumn.Two);
            this.updateWebviewContent();
        } else {
            // Create new panel
            this.panel = vscode.window.createWebviewPanel(
                'packmanAnalysis',
                'Pack-Man Analysis',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            // Set initial content
            this.updateWebviewContent();

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.currentResult = undefined;
            }, null, this.disposables);

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                (message) => this.handleWebviewMessage(message),
                null,
                this.disposables
            );
        }
    }

    /**
     * Updates the webview content with current result
     */
    private updateWebviewContent(): void {
        if (!this.panel || !this.currentResult) {
            return;
        }

        this.panel.webview.html = this.generateHTML(this.currentResult);
    }

    /**
     * Generates HTML content for the webview
     * @param result Analysis result to display
     * @returns HTML string
     */
    private generateHTML(result: AnalysisResult): string {
        const fileName = result.uri.fsPath.split(/[\\/]/).pop() || 'Unknown';
        const { statistics, packages } = result;

        // Get VS Code theme kind
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pack-Man Analysis</title>
    <style>
        ${this.getCSS(theme)}
    </style>
</head>
<body class="${theme}">
    <div class="container">
        <header>
            <h1>📦 Pack-Man Analysis</h1>
            <p class="file-name">${this.escapeHtml(fileName)}</p>
        </header>

        <section class="statistics">
            <h2>Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${statistics.total}</div>
                    <div class="stat-label">Total Packages</div>
                </div>
                <div class="stat-card success">
                    <div class="stat-value">${statistics.upToDate}</div>
                    <div class="stat-label">Up to Date</div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-value">${statistics.outdated}</div>
                    <div class="stat-label">Outdated</div>
                </div>
                <div class="stat-card error">
                    <div class="stat-value">${statistics.errors}</div>
                    <div class="stat-label">Errors</div>
                </div>
            </div>
        </section>

        <section class="packages">
            <h2>Packages</h2>
            ${this.generatePackageList(packages)}
        </section>
    </div>

    <script>
        ${this.getJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Generates the package list HTML
     * @param packages Array of package analyses
     * @returns HTML string
     */
    private generatePackageList(packages: any[]): string {
        if (packages.length === 0) {
            return '<p class="empty-state">No packages found</p>';
        }

        return `
            <div class="package-list">
                ${packages.map(pkg => this.generatePackageCard(pkg)).join('')}
            </div>
        `;
    }

    /**
     * Generates a single package card HTML
     * @param pkg Package analysis data
     * @returns HTML string
     */
    private generatePackageCard(pkg: any): string {
        const statusClass = pkg.status === 'up-to-date' ? 'success' :
            pkg.status === 'outdated' ? 'warning' : 'error';

        const statusIcon = pkg.status === 'up-to-date' ? '✓' :
            pkg.status === 'outdated' ? '⚠' : '✗';

        const statusText = pkg.status === 'up-to-date' ? 'Up to date' :
            pkg.status === 'outdated' ? 'Update available' : 'Error';

        return `
            <div class="package-card ${statusClass}">
                <div class="package-header">
                    <div class="package-name">
                        <span class="status-icon">${statusIcon}</span>
                        <strong>${this.escapeHtml(pkg.name)}</strong>
                    </div>
                    <span class="package-registry">${pkg.registry}</span>
                </div>
                
                <div class="package-versions">
                    <div class="version-info">
                        <span class="version-label">Current:</span>
                        <span class="version-value">${this.escapeHtml(pkg.currentVersion)}</span>
                    </div>
                    <div class="version-info">
                        <span class="version-label">Latest:</span>
                        <span class="version-value">${this.escapeHtml(pkg.latestVersion)}</span>
                    </div>
                </div>

                ${pkg.status === 'error' && pkg.error ? `
                    <div class="package-error">
                        <span class="error-icon">⚠</span>
                        ${this.escapeHtml(pkg.error)}
                    </div>
                ` : ''}

                <div class="package-actions">
                    ${pkg.documentationUrl ? `
                        <a href="${this.escapeHtml(pkg.documentationUrl)}" class="action-link" target="_blank">
                            📚 Documentation
                        </a>
                    ` : ''}
                    ${pkg.registryUrl ? `
                        <a href="${this.escapeHtml(pkg.registryUrl)}" class="action-link" target="_blank">
                            🔗 Registry
                        </a>
                    ` : ''}
                    ${pkg.status === 'outdated' ? `
                        <button class="action-button" onclick="updatePackage('${this.escapeHtml(pkg.name)}', ${pkg.line})">
                            🔄 Update
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Gets CSS styles for the webview
     * @param theme Current theme (light or dark)
     * @returns CSS string
     */
    private getCSS(theme: string): string {
        const isDark = theme === 'dark';

        return `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                padding: 20px;
                background-color: ${isDark ? '#1e1e1e' : '#ffffff'};
                color: ${isDark ? '#cccccc' : '#333333'};
            }

            .container {
                max-width: 1200px;
                margin: 0 auto;
            }

            header {
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 1px solid ${isDark ? '#3e3e3e' : '#e0e0e0'};
            }

            h1 {
                font-size: 28px;
                font-weight: 600;
                margin-bottom: 8px;
                color: ${isDark ? '#ffffff' : '#000000'};
            }

            h2 {
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 16px;
                color: ${isDark ? '#ffffff' : '#000000'};
            }

            .file-name {
                font-size: 14px;
                color: ${isDark ? '#888888' : '#666666'};
                font-family: 'Courier New', monospace;
            }

            .statistics {
                margin-bottom: 30px;
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
            }

            .stat-card {
                padding: 20px;
                border-radius: 8px;
                background-color: ${isDark ? '#2d2d2d' : '#f5f5f5'};
                border: 1px solid ${isDark ? '#3e3e3e' : '#e0e0e0'};
                text-align: center;
            }

            .stat-card.success {
                border-color: ${isDark ? '#4caf50' : '#4caf50'};
                background-color: ${isDark ? '#1b3a1e' : '#e8f5e9'};
            }

            .stat-card.warning {
                border-color: ${isDark ? '#ff9800' : '#ff9800'};
                background-color: ${isDark ? '#3a2e1b' : '#fff3e0'};
            }

            .stat-card.error {
                border-color: ${isDark ? '#f44336' : '#f44336'};
                background-color: ${isDark ? '#3a1b1b' : '#ffebee'};
            }

            .stat-value {
                font-size: 32px;
                font-weight: 700;
                margin-bottom: 8px;
                color: ${isDark ? '#ffffff' : '#000000'};
            }

            .stat-label {
                font-size: 14px;
                color: ${isDark ? '#888888' : '#666666'};
            }

            .packages {
                margin-bottom: 30px;
            }

            .package-list {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }

            .package-card {
                padding: 20px;
                border-radius: 8px;
                background-color: ${isDark ? '#2d2d2d' : '#f5f5f5'};
                border: 1px solid ${isDark ? '#3e3e3e' : '#e0e0e0'};
            }

            .package-card.success {
                border-left: 4px solid #4caf50;
            }

            .package-card.warning {
                border-left: 4px solid #ff9800;
            }

            .package-card.error {
                border-left: 4px solid #f44336;
            }

            .package-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .package-name {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 16px;
            }

            .status-icon {
                font-size: 18px;
            }

            .package-registry {
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
                background-color: ${isDark ? '#3e3e3e' : '#e0e0e0'};
                color: ${isDark ? '#cccccc' : '#666666'};
                text-transform: uppercase;
                font-weight: 600;
            }

            .package-versions {
                display: flex;
                gap: 24px;
                margin-bottom: 12px;
            }

            .version-info {
                display: flex;
                gap: 8px;
            }

            .version-label {
                color: ${isDark ? '#888888' : '#666666'};
            }

            .version-value {
                font-family: 'Courier New', monospace;
                font-weight: 600;
                color: ${isDark ? '#ffffff' : '#000000'};
            }

            .package-error {
                padding: 12px;
                margin-bottom: 12px;
                border-radius: 4px;
                background-color: ${isDark ? '#3a1b1b' : '#ffebee'};
                color: ${isDark ? '#ff8a80' : '#c62828'};
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .error-icon {
                font-size: 16px;
            }

            .package-actions {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
            }

            .action-link,
            .action-button {
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 13px;
                text-decoration: none;
                border: none;
                cursor: pointer;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .action-link {
                background-color: ${isDark ? '#3e3e3e' : '#e0e0e0'};
                color: ${isDark ? '#cccccc' : '#333333'};
            }

            .action-link:hover {
                background-color: ${isDark ? '#4e4e4e' : '#d0d0d0'};
            }

            .action-button {
                background-color: #007acc;
                color: #ffffff;
                font-weight: 600;
            }

            .action-button:hover {
                background-color: #005a9e;
            }

            .empty-state {
                text-align: center;
                padding: 40px;
                color: ${isDark ? '#888888' : '#666666'};
            }
        `;
    }

    /**
     * Gets JavaScript code for the webview
     * @returns JavaScript string
     */
    private getJavaScript(): string {
        return `
            const vscode = acquireVsCodeApi();

            function updatePackage(packageName, line) {
                vscode.postMessage({
                    command: 'updatePackage',
                    packageName: packageName,
                    line: line
                });
            }

            // Listen for theme changes
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'updateTheme') {
                    document.body.className = message.theme;
                }
            });
        `;
    }

    /**
     * Handles messages from the webview
     * @param message Message from webview
     */
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updatePackage':
                await this.handleUpdatePackage(message.packageName, message.line);
                break;
        }
    }

    /**
     * Handles update package request from webview
     * @param packageName Name of package to update
     * @param line Line number in file
     */
    private async handleUpdatePackage(packageName: string, line: number): Promise<void> {
        if (!this.currentResult) {
            return;
        }

        try {
            // Execute the update command
            await vscode.commands.executeCommand(
                'packman.updateDependency',
                this.currentResult.uri,
                packageName,
                line
            );
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to update ${packageName}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Escapes HTML special characters
     * @param text Text to escape
     * @returns Escaped text
     */
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    /**
     * Disposes the webview manager
     */
    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }

        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
