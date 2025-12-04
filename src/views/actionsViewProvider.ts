/**
 * Actions View Provider for Pack-Man VS Code Extension
 * 
 * Provides a webview-based actions panel in the Activity Bar sidebar.
 * Displays quick action buttons for common operations like analyzing
 * workspace, refreshing results, and opening settings.
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import * as vscode from 'vscode';
import { AnalysisService } from '../services/analysisService';

/**
 * Action types supported by the view
 */
export type ActionType = 'analyzeWorkspace' | 'refresh' | 'openSettings';

/**
 * Loading state for each action
 */
interface LoadingState {
    analyzeWorkspace: boolean;
    refresh: boolean;
    openSettings: boolean;
}

/**
 * ActionsViewProvider implements WebviewViewProvider to display
 * quick action buttons in the Activity Bar sidebar panel.
 */
export class ActionsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'packman.actions';

    private _view?: vscode.WebviewView;
    private _analysisService: AnalysisService;
    private _disposables: vscode.Disposable[] = [];
    private _loadingState: LoadingState = {
        analyzeWorkspace: false,
        refresh: false,
        openSettings: false
    };

    constructor(analysisService: AnalysisService) {
        this._analysisService = analysisService;

        // Subscribe to analysis updates to reset loading state
        this._disposables.push(
            this._analysisService.onAnalysisUpdate(() => {
                // Analysis completed, reset loading states
                this._loadingState.analyzeWorkspace = false;
                this._loadingState.refresh = false;
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

        // Set initial content
        this._updateContent();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            (message) => this._handleMessage(message),
            null,
            this._disposables
        );

        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateContent();
            }
        });
    }

    /**
     * Sets loading state for a specific action
     * @param action The action type
     * @param loading Whether the action is loading
     */
    public setLoading(action: ActionType, loading: boolean): void {
        this._loadingState[action] = loading;
        this._updateContent();
    }

    /**
     * Refreshes the view content
     */
    public refresh(): void {
        this._updateContent();
    }

    /**
     * Updates the webview content
     */
    private _updateContent(): void {
        if (!this._view) {
            return;
        }

        this._view.webview.html = this._generateHTML();
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
            case 'openSettings':
                await this._handleOpenSettings();
                break;
        }
    }

    /**
     * Handles the "Analyze Workspace" button click
     * Triggers analysis of all package files in the workspace
     */
    private async _handleAnalyzeWorkspace(): Promise<void> {
        if (this._loadingState.analyzeWorkspace) {
            return; // Already analyzing
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
     * Re-analyzes all previously analyzed files
     */
    private async _handleRefresh(): Promise<void> {
        if (this._loadingState.refresh) {
            return; // Already refreshing
        }

        this.setLoading('refresh', true);

        try {
            // Get all cached results and re-analyze those files
            const cachedResults = this._analysisService.getAllCachedResults();

            if (cachedResults.length === 0) {
                // No cached results, analyze workspace instead
                await vscode.commands.executeCommand('packman.analyzeWorkspace');
            } else {
                // Re-analyze each cached file
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
     * Handles the "Open Settings" button click
     * Opens VS Code settings filtered to Pack-Man configuration
     */
    private async _handleOpenSettings(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'packman');
        } catch (error) {
            console.error('Failed to open settings:', error);
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to open settings. ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Generates HTML content for the webview
     */
    private _generateHTML(): string {
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pack-Man Actions</title>
    <style>
        ${this._getCSS(theme)}
    </style>
</head>
<body class="${theme}">
    <div class="container">
        ${this._generateActionButtons()}
    </div>
    <script>
        ${this._getJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Generates action buttons HTML
     */
    private _generateActionButtons(): string {
        const analyzeDisabled = this._loadingState.analyzeWorkspace || this._loadingState.refresh;
        const refreshDisabled = this._loadingState.analyzeWorkspace || this._loadingState.refresh;

        return `
        <div class="actions-section">
            <button 
                class="action-button primary ${this._loadingState.analyzeWorkspace ? 'loading' : ''}"
                onclick="handleAction('analyzeWorkspace')"
                ${analyzeDisabled ? 'disabled' : ''}
                aria-label="Analyze all package files in workspace"
            >
                <span class="button-icon">${this._loadingState.analyzeWorkspace ? this._getSpinnerSVG() : this._getAnalyzeIcon()}</span>
                <span class="button-text">Analyze Workspace</span>
            </button>

            <button 
                class="action-button secondary ${this._loadingState.refresh ? 'loading' : ''}"
                onclick="handleAction('refresh')"
                ${refreshDisabled ? 'disabled' : ''}
                aria-label="Refresh analysis for previously analyzed files"
            >
                <span class="button-icon">${this._loadingState.refresh ? this._getSpinnerSVG() : this._getRefreshIcon()}</span>
                <span class="button-text">Refresh</span>
            </button>

            <div class="divider"></div>

            <button 
                class="action-button tertiary"
                onclick="handleAction('openSettings')"
                aria-label="Open Pack-Man settings in VS Code"
            >
                <span class="button-icon">${this._getSettingsIcon()}</span>
                <span class="button-text">Open Settings</span>
            </button>
        </div>`;
    }

    /**
     * Gets the analyze icon SVG
     */
    private _getAnalyzeIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-5zM4 3.5A1.5 1.5 0 0 1 5.5 2h5A1.5 1.5 0 0 1 12 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 12.5v-9z"/>
            <path d="M6 5h4v1H6V5zm0 2h4v1H6V7zm0 2h4v1H6V9zm0 2h2v1H6v-1z"/>
        </svg>`;
    }

    /**
     * Gets the refresh icon SVG
     */
    private _getRefreshIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>`;
    }

    /**
     * Gets the settings icon SVG
     */
    private _getSettingsIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
            <path fill-rule="evenodd" d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
        </svg>`;
    }

    /**
     * Gets the spinner SVG for loading state
     */
    private _getSpinnerSVG(): string {
        return `<svg class="spinner" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 1 0 8 8h-1.5A6.5 6.5 0 1 1 8 1.5V0z"/>
        </svg>`;
    }

    /**
     * Gets CSS styles for the webview
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
                padding: 12px;
                background-color: transparent;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
            }

            .container {
                display: flex;
                flex-direction: column;
                gap: 12px;
                height: 100%;
                overflow-y: auto;
                padding-bottom: 8px;
            }

            .actions-section {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .action-button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 16px;
                border: none;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s, opacity 0.2s;
                width: 100%;
            }

            .action-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .action-button.primary {
                background-color: var(--vscode-button-background, #007acc);
                color: var(--vscode-button-foreground, #ffffff);
            }

            .action-button.primary:hover:not(:disabled) {
                background-color: var(--vscode-button-hoverBackground, #005a9e);
            }

            .action-button.secondary {
                background-color: var(--vscode-button-secondaryBackground, ${isDark ? '#3a3d41' : '#e0e0e0'});
                color: var(--vscode-button-secondaryForeground, ${isDark ? '#cccccc' : '#333333'});
            }

            .action-button.secondary:hover:not(:disabled) {
                background-color: var(--vscode-button-secondaryHoverBackground, ${isDark ? '#45494e' : '#d0d0d0'});
            }

            .action-button.tertiary {
                background-color: transparent;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
                border: 1px solid var(--vscode-input-border, ${isDark ? '#3e3e3e' : '#cecece'});
            }

            .action-button.tertiary:hover:not(:disabled) {
                background-color: var(--vscode-list-hoverBackground, ${isDark ? '#2a2d2e' : '#f0f0f0'});
            }

            .action-button.loading {
                pointer-events: none;
            }

            .button-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
            }

            .button-icon svg {
                width: 16px;
                height: 16px;
            }

            .button-text {
                flex: 1;
                text-align: left;
            }

            .divider {
                height: 1px;
                background-color: var(--vscode-sideBarSectionHeader-border, ${isDark ? '#3e3e3e' : '#e0e0e0'});
                margin: 4px 0;
            }

            @keyframes spin {
                from {
                    transform: rotate(0deg);
                }
                to {
                    transform: rotate(360deg);
                }
            }

            .spinner {
                animation: spin 1s linear infinite;
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
