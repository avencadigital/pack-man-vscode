/**
 * Statistics View Provider for Pack-Man VS Code Extension
 * 
 * Provides a webview-based statistics panel in the Activity Bar sidebar.
 * Displays aggregated dependency health metrics across all workspace files
 * with integrated action buttons for common operations.
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import * as vscode from 'vscode';
import { AnalysisService, AnalysisResult } from '../services/analysisService';

/**
 * Statistics data structure for the view
 */
export interface StatisticsData {
    total: number;
    upToDate: number;
    outdated: number;
    errors: number;
    lastUpdated: Date | null;
}

/**
 * Action types supported by the view
 */
export type ActionType = 'analyzeWorkspace' | 'refresh' | 'clearCache';

/**
 * Loading state for each action
 */
interface LoadingState {
    analyzeWorkspace: boolean;
    refresh: boolean;
    clearCache: boolean;
}

/**
 * Aggregates statistics from multiple analysis results.
 * Ensures total equals sum of up-to-date, outdated, and errors.
 * 
 * @param results Array of analysis results to aggregate
 * @returns Aggregated statistics data
 */
export function aggregateStatistics(results: AnalysisResult[]): StatisticsData {
    const aggregated = results.reduce(
        (acc, result) => ({
            total: acc.total + result.statistics.total,
            upToDate: acc.upToDate + result.statistics.upToDate,
            outdated: acc.outdated + result.statistics.outdated,
            errors: acc.errors + result.statistics.errors
        }),
        { total: 0, upToDate: 0, outdated: 0, errors: 0 }
    );

    // Find the most recent timestamp
    const timestamps = results
        .map(r => r.timestamp)
        .filter(t => t > 0);

    const lastUpdated = timestamps.length > 0
        ? new Date(Math.max(...timestamps))
        : null;

    return {
        ...aggregated,
        lastUpdated
    };
}


/**
 * StatisticsViewProvider implements WebviewViewProvider to display
 * aggregated dependency statistics with integrated action buttons
 * in the Activity Bar sidebar panel.
 */
export class StatisticsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'packman.statistics';

    private _view?: vscode.WebviewView;
    private _analysisService: AnalysisService;
    private _disposables: vscode.Disposable[] = [];
    private _statistics: StatisticsData = {
        total: 0,
        upToDate: 0,
        outdated: 0,
        errors: 0,
        lastUpdated: null
    };
    private _loadingState: LoadingState = {
        analyzeWorkspace: false,
        refresh: false,
        clearCache: false
    };

    constructor(analysisService: AnalysisService) {
        this._analysisService = analysisService;

        // Subscribe to analysis updates for real-time refresh
        this._disposables.push(
            this._analysisService.onAnalysisUpdate(() => {
                this._loadingState.analyzeWorkspace = false;
                this._loadingState.refresh = false;
                this._updateStatisticsFromCache();
                this._updateContent();
            })
        );
    }

    /**
     * Called when the view is first displayed
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };

        // Load initial statistics from cache
        this._updateStatisticsFromCache();

        // Set initial content
        this._updateContent();

        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateStatisticsFromCache();
                this._updateContent();
            }
        });

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            (message) => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    /**
     * Refreshes the view content
     */
    public refresh(): void {
        this._updateStatisticsFromCache();
        this._updateContent();
    }

    /**
     * Gets current statistics data
     */
    public getStatistics(): StatisticsData {
        return { ...this._statistics };
    }

    /**
     * Updates statistics from cached analysis results
     */
    private _updateStatisticsFromCache(): void {
        const cachedResults = this._analysisService.getAllCachedResults();
        this._statistics = aggregateStatistics(cachedResults);
    }

    /**
     * Updates the webview content
     */
    private _updateContent(): void {
        if (!this._view) {
            return;
        }

        this._view.webview.html = this._generateHTML(this._statistics);
    }

    /**
     * Sets loading state for a specific action
     */
    public setLoading(action: ActionType, loading: boolean): void {
        this._loadingState[action] = loading;
        this._updateContent();
    }

    /**
     * Handles messages from the webview
     */
    private async _handleMessage(message: { command: string }): Promise<void> {
        switch (message.command) {
            case 'analyzeWorkspace':
                await this._handleAnalyzeWorkspace();
                break;
            case 'refresh':
                await this._handleRefresh();
                break;
            case 'clearCache':
                await this._handleClearCache();
                break;
        }
    }

    /**
     * Handles the "Analyze Workspace" button click
     */
    private async _handleAnalyzeWorkspace(): Promise<void> {
        if (this._loadingState.analyzeWorkspace) {
            return;
        }

        this.setLoading('analyzeWorkspace', true);

        try {
            await vscode.commands.executeCommand('packman.analyzeWorkspace');
        } catch (error) {
            console.error('Failed to analyze workspace:', error);
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to analyze workspace. ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            this.setLoading('analyzeWorkspace', false);
        }
    }

    /**
     * Handles the "Refresh" button click
     */
    private async _handleRefresh(): Promise<void> {
        if (this._loadingState.refresh) {
            return;
        }

        this.setLoading('refresh', true);

        try {
            const cachedResults = this._analysisService.getAllCachedResults();

            if (cachedResults.length === 0) {
                await vscode.commands.executeCommand('packman.analyzeWorkspace');
            } else {
                for (const result of cachedResults) {
                    await this._analysisService.analyzeFile(result.uri);
                }
                vscode.window.showInformationMessage(
                    `Pack-Man: Refreshed ${cachedResults.length} ${cachedResults.length === 1 ? 'file' : 'files'}`
                );
            }
        } catch (error) {
            console.error('Failed to refresh analysis:', error);
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to refresh analysis. ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            this.setLoading('refresh', false);
        }
    }

    /**
     * Handles the "Clear Cache" button click
     */
    private async _handleClearCache(): Promise<void> {
        if (this._loadingState.clearCache) {
            return;
        }

        this.setLoading('clearCache', true);

        try {
            this._analysisService.clearCache();
            this._updateStatisticsFromCache();
            this._updateContent();
            vscode.window.showInformationMessage('Pack-Man: Cache cleared successfully');
        } catch (error) {
            console.error('Failed to clear cache:', error);
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to clear cache. ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            this.setLoading('clearCache', false);
        }
    }

    /**
     * Generates HTML content for the webview
     */
    private _generateHTML(stats: StatisticsData): string {
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
        const lastUpdatedText = stats.lastUpdated
            ? this._formatTimestamp(stats.lastUpdated)
            : 'Never';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pack-Man Overview</title>
    <style>
        ${this._getCSS(theme)}
    </style>
</head>
<body class="${theme}">
    <div class="container">
        ${this._generateStatsCards(stats)}
        ${this._generateLastUpdated(lastUpdatedText)}
        ${this._generateActionButtons()}
    </div>
    <script>
        ${this._getJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Generates statistics cards HTML with improved visual hierarchy
     */
    private _generateStatsCards(stats: StatisticsData): string {
        const totalPercentage = stats.total > 0
            ? Math.round((stats.upToDate / stats.total) * 100)
            : 0;

        return `
        <div class="stats-section">
            <div class="section-header">
                <h3 class="section-title">Dependency Health</h3>
            </div>
            
            <div class="stat-card-large total">
                <div class="stat-main">
                    <div class="stat-value-large">${stats.total}</div>
                    <div class="stat-label-large">Total Dependencies</div>
                </div>
                <div class="stat-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${totalPercentage}%"></div>
                    </div>
                    <div class="progress-label">${totalPercentage}% up to date</div>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card up-to-date">
                    <div class="stat-icon">${this._getCheckIcon()}</div>
                    <div class="stat-content">
                        <div class="stat-value">${stats.upToDate}</div>
                        <div class="stat-label">Up to Date</div>
                    </div>
                </div>
                <div class="stat-card outdated">
                    <div class="stat-icon">${this._getWarningIcon()}</div>
                    <div class="stat-content">
                        <div class="stat-value">${stats.outdated}</div>
                        <div class="stat-label">Outdated</div>
                    </div>
                </div>
                <div class="stat-card errors">
                    <div class="stat-icon">${this._getErrorIcon()}</div>
                    <div class="stat-content">
                        <div class="stat-value">${stats.errors}</div>
                        <div class="stat-label">Errors</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Generates last updated section HTML
     */
    private _generateLastUpdated(lastUpdatedText: string): string {
        return `
        <div class="last-updated">
            <div class="last-updated-icon">${this._getClockIcon()}</div>
            <div class="last-updated-content">
                <span class="last-updated-label">Last updated</span>
                <span class="last-updated-value">${lastUpdatedText}</span>
            </div>
        </div>`;
    }

    /**
     * Generates action buttons HTML
     */
    private _generateActionButtons(): string {
        const analyzeDisabled = this._loadingState.analyzeWorkspace || this._loadingState.refresh;
        const refreshDisabled = this._loadingState.analyzeWorkspace || this._loadingState.refresh;

        return `
        <div class="actions-section">
            <div class="section-header">
                <h3 class="section-title">Quick Actions</h3>
            </div>
            
            <div class="actions-grid">
                <div class="actions-row">
                    <button 
                        class="action-button primary compact ${this._loadingState.analyzeWorkspace ? 'loading' : ''}"
                        onclick="handleAction('analyzeWorkspace')"
                        ${analyzeDisabled ? 'disabled' : ''}
                        aria-label="Analyze all package files in workspace"
                    >
                        <span class="button-icon">${this._loadingState.analyzeWorkspace ? this._getSpinnerSVG() : this._getAnalyzeIcon()}</span>
                        <span class="button-text">Analyze</span>
                    </button>

                    <button 
                        class="action-button secondary compact ${this._loadingState.refresh ? 'loading' : ''}"
                        onclick="handleAction('refresh')"
                        ${refreshDisabled ? 'disabled' : ''}
                        aria-label="Refresh analysis for previously analyzed files"
                    >
                        <span class="button-icon">${this._loadingState.refresh ? this._getSpinnerSVG() : this._getRefreshIcon()}</span>
                        <span class="button-text">Refresh</span>
                    </button>
                </div>

                <button 
                    class="action-button tertiary full-width ${this._loadingState.clearCache ? 'loading' : ''}"
                    onclick="handleAction('clearCache')"
                    ${this._loadingState.clearCache ? 'disabled' : ''}
                    aria-label="Clear cached analysis results"
                >
                    <span class="button-icon">${this._loadingState.clearCache ? this._getSpinnerSVG() : this._getTrashIcon()}</span>
                    <span class="button-text">Clear Cache</span>
                </button>
            </div>
        </div>`;
    }

    /**
     * Formats a timestamp for display
     */
    private _formatTimestamp(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);

        if (diffSec < 60) {
            return 'Just now';
        } else if (diffMin < 60) {
            return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
        } else if (diffHour < 24) {
            return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    /**
     * Icon SVG methods
     */
    private _getCheckIcon(): string {
        return `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
        </svg>`;
    }

    private _getWarningIcon(): string {
        return `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
        </svg>`;
    }

    private _getErrorIcon(): string {
        return `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/>
        </svg>`;
    }

    private _getClockIcon(): string {
        return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
            <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
        </svg>`;
    }

    private _getAnalyzeIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.5 8a5.5 5.5 0 0 1 8.25-4.764.5.5 0 0 0 .5-.866A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0 5.5 5.5 0 1 1-11 0z"/>
            <path d="M15.354 3.354a.5.5 0 0 0-.708-.708L8 9.293 5.354 6.646a.5.5 0 1 0-.708.708l3 3a.5.5 0 0 0 .708 0l7-7z"/>
        </svg>`;
    }

    private _getRefreshIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>`;
    }

    private _getTrashIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>`;
    }

    private _getSpinnerSVG(): string {
        return `<svg class="spinner" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 1 0 8 8h-1.5A6.5 6.5 0 1 1 8 1.5V0z"/>
        </svg>`;
    }


    /**
     * Gets CSS styles for the webview with modern, clean design
     */
    private _getCSS(theme: string): string {
        const isDark = theme === 'dark';

        return `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            html, body {
                height: 100%;
                overflow: hidden;
            }

            body {
                font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                font-size: var(--vscode-font-size, 13px);
                line-height: 1.5;
                padding: 16px;
                background-color: transparent;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
            }

            .container {
                display: flex;
                flex-direction: column;
                gap: 20px;
                height: 100%;
                overflow-y: auto;
                padding-bottom: 8px;
            }

            /* Section Headers */
            .stats-section,
            .actions-section {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .section-header {
                margin-bottom: 4px;
            }

            .section-title {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            /* Large Total Card */
            .stat-card-large {
                background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'});
                border: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'});
                border-radius: 16px;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .stat-main {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .stat-value-large {
                font-size: 36px;
                font-weight: 700;
                line-height: 1;
                color: var(--vscode-foreground, ${isDark ? '#ffffff' : '#333333'});
            }

            .stat-label-large {
                font-size: 12px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            /* Progress Bar */
            .stat-progress {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .progress-bar {
                height: 6px;
                background-color: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#e8e8e8'});
                border-radius: 6px;
                overflow: hidden;
            }

            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, 
                    var(--vscode-terminal-ansiGreen, #4caf50) 0%, 
                    var(--vscode-terminal-ansiCyan, #26c6da) 100%);
                border-radius: 6px;
                transition: width 0.3s ease;
            }

            .progress-label {
                font-size: 11px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            /* Stats Grid */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
            }

            .stat-card {
                background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'});
                border: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'});
                border-radius: 12px;
                padding: 12px 8px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }

            .stat-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, ${isDark ? '0.3' : '0.1'});
            }

            .stat-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
            }

            .stat-card.up-to-date .stat-icon {
                color: var(--vscode-terminal-ansiGreen, #4caf50);
            }

            .stat-card.outdated .stat-icon {
                color: var(--vscode-terminal-ansiYellow, #ff9800);
            }

            .stat-card.errors .stat-icon {
                color: var(--vscode-errorForeground, #f44336);
            }

            .stat-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }

            .stat-value {
                font-size: 20px;
                font-weight: 700;
                line-height: 1;
            }

            .stat-card.up-to-date .stat-value {
                color: var(--vscode-terminal-ansiGreen, #4caf50);
            }

            .stat-card.outdated .stat-value {
                color: var(--vscode-terminal-ansiYellow, #ff9800);
            }

            .stat-card.errors .stat-value {
                color: var(--vscode-errorForeground, #f44336);
            }

            .stat-label {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
                text-align: center;
            }

            /* Last Updated */
            .last-updated {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'});
                border: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'});
                border-radius: 12px;
            }

            .last-updated-icon {
                display: flex;
                align-items: center;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            .last-updated-content {
                display: flex;
                flex-direction: column;
                gap: 2px;
                flex: 1;
            }

            .last-updated-label {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            .last-updated-value {
                font-size: 12px;
                font-weight: 500;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
            }

            /* Action Buttons */
            .actions-grid {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .actions-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }

            .action-button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 14px;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: inherit;
                min-height: 44px;
            }

            .action-button.compact {
                padding: 14px 10px;
            }

            .action-button.full-width {
                width: 100%;
                padding: 16px 14px;
            }

            .action-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .action-button:not(:disabled):hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 6px rgba(0, 0, 0, ${isDark ? '0.3' : '0.15'});
            }

            .action-button:not(:disabled):active {
                transform: translateY(0);
            }

            .action-button.primary {
                background: var(--vscode-button-background, #007acc);
                color: var(--vscode-button-foreground, #ffffff);
            }

            .action-button.primary:hover:not(:disabled) {
                background: var(--vscode-button-hoverBackground, #005a9e);
            }

            .action-button.secondary {
                background: var(--vscode-button-secondaryBackground, ${isDark ? '#3a3d41' : '#e0e0e0'});
                color: var(--vscode-button-secondaryForeground, ${isDark ? '#cccccc' : '#333333'});
            }

            .action-button.secondary:hover:not(:disabled) {
                background: var(--vscode-button-secondaryHoverBackground, ${isDark ? '#45494e' : '#d0d0d0'});
            }

            .action-button.tertiary {
                background: transparent;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
                border: 1px solid var(--vscode-input-border, ${isDark ? '#3e3e3e' : '#cecece'});
            }

            .action-button.tertiary:hover:not(:disabled) {
                background: var(--vscode-list-hoverBackground, ${isDark ? '#2a2d2e' : '#f0f0f0'});
            }

            .button-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                flex-shrink: 0;
            }

            .button-text {
                text-align: center;
            }

            /* Spinner Animation */
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .spinner {
                animation: spin 1s linear infinite;
            }

            .action-button.loading {
                pointer-events: none;
            }
        `;
    }

    /**
     * Gets JavaScript code for the webview
     */
    private _getJavaScript(): string {
        return `
            const vscode = acquireVsCodeApi();

            function handleAction(action) {
                vscode.postMessage({ command: action });
            }
        `;
    }

    /**
     * Disposes the provider
     */
    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
