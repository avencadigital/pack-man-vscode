/**
 * Settings View Provider for Pack-Man VS Code Extension
 * 
 * Provides a webview-based settings panel in the Activity Bar sidebar.
 * Allows users to configure API endpoint, auto-analyze options, and GitHub token.
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import * as vscode from 'vscode';
import { validateApiEndpoint } from '../utils/urlValidator';

/**
 * Settings data structure for the view
 */
export interface SettingsData {
    apiEndpoint: string;
    autoAnalyzeOnSave: boolean;
    autoAnalyzeOnOpen: boolean;
    showCodeLens: boolean;
    showDiagnostics: boolean;
    showInlineWarnings: boolean;
    hasGitHubToken: boolean;
    excludeFolders: string[];
}

/**
 * SettingsViewProvider implements WebviewViewProvider to display
 * extension settings in the Activity Bar sidebar panel.
 */
export class SettingsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'packman.settings';

    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this._context = context;

        // Listen for configuration changes
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('packman')) {
                    this.refresh();
                }
            })
        );

        // Listen for secret storage changes (GitHub token)
        this._disposables.push(
            context.secrets.onDidChange((e) => {
                if (e.key === 'packman.githubToken') {
                    this.refresh();
                }
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
     * Refreshes the view content
     */
    public refresh(): void {
        this._updateContent();
    }

    /**
     * Gets current settings data
     */
    public async getSettingsData(): Promise<SettingsData> {
        const config = vscode.workspace.getConfiguration('packman');
        const hasToken = !!(await this._context.secrets.get('packman.githubToken'));

        return {
            apiEndpoint: config.get<string>('apiEndpoint', 'https://pack-man.tech'),
            autoAnalyzeOnSave: config.get<boolean>('autoAnalyzeOnSave', true),
            autoAnalyzeOnOpen: config.get<boolean>('autoAnalyzeOnOpen', true),
            showCodeLens: config.get<boolean>('showCodeLens', true),
            showDiagnostics: config.get<boolean>('showDiagnostics', true),
            showInlineWarnings: config.get<boolean>('showInlineWarnings', true),
            hasGitHubToken: hasToken,
            excludeFolders: config.get<string[]>('excludeFolders', [
                '**/node_modules/**',
                '**/.next/**',
                '**/dist/**',
                '**/build/**',
                '**/.git/**'
            ]) || []
        };
    }

    /**
     * Updates the webview content
     */
    private async _updateContent(): Promise<void> {
        if (!this._view) {
            return;
        }

        const settings = await this.getSettingsData();
        this._view.webview.html = this._generateHTML(settings);
    }

    /**
     * Handles messages from the webview
     */
    private async _handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updateApiEndpoint':
                await this._updateApiEndpoint(message.value);
                break;
            case 'updateToggle':
                await this._updateToggle(message.setting, message.value);
                break;
            case 'configureToken':
                await vscode.commands.executeCommand('packman.configureGitHubToken');
                break;
            case 'removeToken':
                await this._removeToken();
                break;
            case 'openSettings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'packman');
                break;
            case 'addExcludeFolder':
                await this._addExcludeFolder(message.pattern);
                break;
            case 'removeExcludeFolder':
                await this._removeExcludeFolder(message.index);
                break;
            case 'resetExcludeFolders':
                await this._resetExcludeFolders();
                break;
        }
    }

    /**
     * Updates the API endpoint configuration
     */
    private async _updateApiEndpoint(value: string): Promise<void> {
        const validation = validateApiEndpoint(value);

        if (!validation.isValid) {
            // Send error back to webview
            this._view?.webview.postMessage({
                command: 'validationError',
                field: 'apiEndpoint',
                error: validation.error
            });
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('packman');
            await config.update('apiEndpoint', value, vscode.ConfigurationTarget.Global);

            // Send success back to webview
            this._view?.webview.postMessage({
                command: 'validationSuccess',
                field: 'apiEndpoint'
            });

            vscode.window.showInformationMessage(`Pack-Man: API endpoint updated to ${value}`);
        } catch (error) {
            this._view?.webview.postMessage({
                command: 'validationError',
                field: 'apiEndpoint',
                error: 'Failed to save configuration'
            });
        }
    }

    /**
     * Updates a toggle setting
     */
    private async _updateToggle(setting: string, value: boolean): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('packman');
            await config.update(setting, value, vscode.ConfigurationTarget.Global);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to update setting: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Removes the GitHub token with confirmation
     */
    private async _removeToken(): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            'Are you sure you want to remove your GitHub token?',
            { modal: true },
            'Remove Token'
        );

        if (confirmation === 'Remove Token') {
            try {
                await this._context.secrets.delete('packman.githubToken');
                vscode.window.showInformationMessage('Pack-Man: GitHub token removed successfully');
                this.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Pack-Man: Failed to remove token: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    }

    /**
     * Adds a new exclude folder pattern
     */
    private async _addExcludeFolder(pattern: string): Promise<void> {
        if (!pattern || !pattern.trim()) {
            this._view?.webview.postMessage({
                command: 'excludeFolderError',
                error: 'Pattern cannot be empty'
            });
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('packman');
            const currentFolders = config.get<string[]>('excludeFolders', []);

            // Check for duplicates
            if (currentFolders.includes(pattern.trim())) {
                this._view?.webview.postMessage({
                    command: 'excludeFolderError',
                    error: 'Pattern already exists'
                });
                return;
            }

            const updatedFolders = [...currentFolders, pattern.trim()];
            await config.update('excludeFolders', updatedFolders, vscode.ConfigurationTarget.Global);

            this._view?.webview.postMessage({
                command: 'excludeFolderSuccess'
            });

            this.refresh();
        } catch (error) {
            this._view?.webview.postMessage({
                command: 'excludeFolderError',
                error: 'Failed to add pattern'
            });
        }
    }

    /**
     * Removes an exclude folder pattern by index
     */
    private async _removeExcludeFolder(index: number): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('packman');
            const currentFolders = config.get<string[]>('excludeFolders', []);

            if (index < 0 || index >= currentFolders.length) {
                return;
            }

            const updatedFolders = currentFolders.filter((_, i) => i !== index);
            await config.update('excludeFolders', updatedFolders, vscode.ConfigurationTarget.Global);

            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to remove pattern: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Resets exclude folders to default values
     */
    private async _resetExcludeFolders(): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            'Reset exclude folders to default values?',
            { modal: true },
            'Reset'
        );

        if (confirmation === 'Reset') {
            try {
                const config = vscode.workspace.getConfiguration('packman');
                const defaultFolders = [
                    '**/node_modules/**',
                    '**/.next/**',
                    '**/dist/**',
                    '**/build/**',
                    '**/.git/**'
                ];
                await config.update('excludeFolders', defaultFolders, vscode.ConfigurationTarget.Global);

                vscode.window.showInformationMessage('Pack-Man: Exclude folders reset to defaults');
                this.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Pack-Man: Failed to reset: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    }

    /**
     * Generates HTML content for the webview
     */
    private _generateHTML(settings: SettingsData): string {
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pack-Man Settings</title>
    <style>
        ${this._getCSS(theme)}
    </style>
</head>
<body class="${theme}">
    <div class="container">
        ${this._generateAutoAnalyzeSection(settings)}
        ${this._generateDisplaySection(settings)}
        ${this._generateExcludeFoldersSection(settings)}
        ${this._generateAdvancedSection(settings)}
    </div>
    <script>
        ${this._getJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Generates auto-analyze toggle section
     */
    private _generateAutoAnalyzeSection(settings: SettingsData): string {
        return `
        <section class="settings-section">
            <h3 class="section-title">Auto-Analyze</h3>
            <div class="setting-item">
                <div class="toggle-row">
                    <div class="toggle-info">
                        <label class="setting-label">Analyze on Save</label>
                        <p class="setting-description">Automatically analyze when package files are saved</p>
                    </div>
                    <label class="toggle-switch">
                        <input 
                            type="checkbox" 
                            id="autoAnalyzeOnSave"
                            ${settings.autoAnalyzeOnSave ? 'checked' : ''}
                            onchange="updateToggle('autoAnalyzeOnSave', this.checked)"
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="setting-item">
                <div class="toggle-row">
                    <div class="toggle-info">
                        <label class="setting-label">Analyze on Open</label>
                        <p class="setting-description">Automatically analyze when package files are opened</p>
                    </div>
                    <label class="toggle-switch">
                        <input 
                            type="checkbox" 
                            id="autoAnalyzeOnOpen"
                            ${settings.autoAnalyzeOnOpen ? 'checked' : ''}
                            onchange="updateToggle('autoAnalyzeOnOpen', this.checked)"
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        </section>`;
    }

    /**
     * Generates display settings section (CodeLens, Diagnostics, and Inline Warnings)
     */
    private _generateDisplaySection(settings: SettingsData): string {
        return `
        <section class="settings-section">
            <h3 class="section-title">Display</h3>
            <div class="setting-item">
                <div class="toggle-row">
                    <div class="toggle-info">
                        <label class="setting-label">Show CodeLens</label>
                        <p class="setting-description">Show inline indicators above dependencies with update actions</p>
                    </div>
                    <label class="toggle-switch">
                        <input 
                            type="checkbox" 
                            id="showCodeLens"
                            ${settings.showCodeLens ? 'checked' : ''}
                            onchange="updateToggle('showCodeLens', this.checked)"
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="setting-item">
                <div class="toggle-row">
                    <div class="toggle-info">
                        <label class="setting-label">Show Inline Warnings</label>
                        <p class="setting-description">Show squiggly line decorations in the editor for outdated dependencies</p>
                    </div>
                    <label class="toggle-switch">
                        <input 
                            type="checkbox" 
                            id="showInlineWarnings"
                            ${settings.showInlineWarnings ? 'checked' : ''}
                            onchange="updateToggle('showInlineWarnings', this.checked)"
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
             <div class="setting-item">
                <div class="toggle-row">
                    <div class="toggle-info">
                        <label class="setting-label">Show Diagnostics</label>
                        <p class="setting-description">Show outdated dependencies in the Problems panel</p>
                    </div>
                    <label class="toggle-switch">
                        <input
                            type="checkbox"
                            id="showDiagnostics"
                            ${settings.showDiagnostics ? 'checked' : ''}
                            onchange="updateToggle('showDiagnostics', this.checked)"
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        </section>`;
    }

    /**
     * Generates exclude folders section
     */
    private _generateExcludeFoldersSection(settings: SettingsData): string {
        const excludeFolders = settings.excludeFolders || [];
        const foldersList = excludeFolders.length > 0
            ? excludeFolders.map((folder, index) => `
                <div class="exclude-item">
                    <code class="exclude-pattern">${this._escapeHtml(folder)}</code>
                    <button class="remove-button" onclick="removeExcludeFolder(${index})" aria-label="Remove pattern">
                        ${this._getRemoveIcon()}
                    </button>
                </div>
            `).join('')
            : '<p class="empty-state">No exclusion patterns configured</p>';

        return `
        <section class="settings-section">
            <h3 class="section-title">Exclude Folders</h3>
            <div class="setting-item">
                <label class="setting-label">Excluded Patterns</label>
                <p class="setting-description">
                    Glob patterns for folders to exclude from analysis. Improves performance by skipping build and cache folders.
                </p>
                
                <div class="exclude-list">
                    ${foldersList}
                </div>

                <div class="add-pattern-container">
                    <div class="input-group">
                        <input 
                            type="text" 
                            id="newExcludePattern" 
                            class="setting-input" 
                            placeholder="e.g., **/.venv/**"
                        />
                        <button class="save-button" onclick="addExcludeFolder()" aria-label="Add pattern">
                            ${this._getAddIcon()}
                        </button>
                    </div>
                    <div id="excludeFolder-error" class="error-message" style="display: none;"></div>
                </div>

                <div class="exclude-actions">
                    <button class="action-button secondary compact" onclick="resetExcludeFolders()">
                        Reset to Defaults
                    </button>
                </div>

                <div class="info-box">
                    <strong>Common patterns:</strong>
                    <ul class="pattern-examples">
                        <li><code>**/node_modules/**</code> - Node.js dependencies</li>
                        <li><code>**/.next/**</code> - Next.js build cache</li>
                        <li><code>**/.venv/**</code> - Python virtual env</li>
                        <li><code>**/dist/**</code> - Distribution folder</li>
                    </ul>
                </div>
            </div>
        </section>`;
    }

    /**
     * Generates advanced settings section (includes API Configuration and GitHub Token)
     */
    private _generateAdvancedSection(settings: SettingsData): string {
        const tokenStatus = settings.hasGitHubToken
            ? `<span class="token-status configured">
                   <span class="status-icon">✓</span>
                   Token configured
                   <span class="token-mask">••••••••••••</span>
               </span>`
            : `<span class="token-status not-configured">
                   <span class="status-icon">○</span>
                   No token configured
               </span>`;

        const tokenActions = settings.hasGitHubToken
            ? `<button class="action-button secondary compact" onclick="configureToken()">Update Token</button>
               <button class="action-button danger compact" onclick="removeToken()">Remove Token</button>`
            : `<button class="action-button primary full-width" onclick="configureToken()">Add Token</button>`;

        return `
        <section class="settings-section">
            <h3 class="section-title">Advanced</h3>
            
            <!-- API Configuration -->
            <div class="setting-item">
                <label for="apiEndpoint" class="setting-label">API Endpoint</label>
                <p class="setting-description">The Pack-Man API endpoint URL for dependency analysis</p>
                <div class="input-group">
                    <input 
                        type="text" 
                        id="apiEndpoint" 
                        class="setting-input" 
                        value="${this._escapeHtml(settings.apiEndpoint)}"
                        placeholder="https://pack-man.tech"
                    />
                    <button class="save-button icon-only" onclick="saveApiEndpoint()" aria-label="Save API endpoint">
                        ${this._getSaveIcon()}
                    </button>
                </div>
                <div id="apiEndpoint-error" class="error-message" style="display: none;"></div>
                <div id="apiEndpoint-success" class="success-message" style="display: none;">Saved successfully</div>
            </div>

            <div class="section-divider"></div>

            <!-- GitHub Token -->
            <div class="setting-item">
                <label class="setting-label">GitHub Token</label>
                <p class="setting-description">
                    Increases API rate limits from 60 to 5,000 requests/hour and enables private repository access.
                </p>
                <div class="token-container">
                    ${tokenStatus}
                    <div class="token-actions">
                        ${tokenActions}
                    </div>
                </div>
            </div>

            <div class="section-divider"></div>

            <!-- Open Full Settings -->
            <div class="setting-item">
                <button class="action-button secondary full-width tall" onclick="openSettings()">
                    Open Full Settings
                </button>
            </div>
        </section>`;
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
                gap: 16px;
                height: 100%;
                overflow-y: auto;
                padding-bottom: 8px;
            }

            .settings-section {
                background-color: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'});
                border-radius: 12px;
                padding: 12px;
            }

            .section-title {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--vscode-sideBarSectionHeader-foreground, ${isDark ? '#bbbbbb' : '#6f6f6f'});
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, ${isDark ? '#3e3e3e' : '#e0e0e0'});
            }

            .setting-item {
                margin-bottom: 12px;
            }

            .setting-item:last-child {
                margin-bottom: 0;
            }

            .section-divider {
                height: 1px;
                background-color: var(--vscode-sideBarSectionHeader-border, ${isDark ? '#3e3e3e' : '#e0e0e0'});
                margin: 16px 0;
            }

            .setting-label {
                font-weight: 500;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
                display: block;
                margin-bottom: 4px;
            }

            .setting-description {
                font-size: 12px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
                margin-bottom: 8px;
            }

            .input-group {
                display: flex;
                gap: 8px;
            }

            .setting-input {
                flex: 1;
                padding: 6px 10px;
                border: 1px solid var(--vscode-input-border, ${isDark ? '#3e3e3e' : '#cecece'});
                border-radius: 8px;
                background-color: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#ffffff'});
                color: var(--vscode-input-foreground, ${isDark ? '#cccccc' : '#333333'});
                font-size: 13px;
                outline: none;
            }

            .setting-input:focus {
                border-color: var(--vscode-focusBorder, #007acc);
            }

            .setting-input.error {
                border-color: var(--vscode-inputValidation-errorBorder, #f44336);
            }

            .save-button {
                padding: 6px 12px;
                border: none;
                border-radius: 8px;
                background-color: var(--vscode-button-background, #007acc);
                color: var(--vscode-button-foreground, #ffffff);
                font-size: 13px;
                cursor: pointer;
                white-space: nowrap;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s;
            }

            .save-button.icon-only {
                padding: 8px;
                min-width: 36px;
                min-height: 36px;
            }

            .save-button:hover {
                background-color: var(--vscode-button-hoverBackground, #005a9e);
            }

            .error-message {
                color: var(--vscode-errorForeground, #f44336);
                font-size: 12px;
                margin-top: 6px;
            }

            .success-message {
                color: var(--vscode-terminal-ansiGreen, #4caf50);
                font-size: 12px;
                margin-top: 6px;
            }

            .toggle-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 12px;
            }

            .toggle-info {
                flex: 1;
            }

            .toggle-switch {
                position: relative;
                display: inline-block;
                width: 40px;
                height: 20px;
                flex-shrink: 0;
            }

            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#cccccc'});
                border-radius: 20px;
                transition: 0.2s;
            }

            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 14px;
                width: 14px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                border-radius: 50%;
                transition: 0.2s;
            }

            input:checked + .toggle-slider {
                background-color: var(--vscode-button-background, #007acc);
            }

            input:checked + .toggle-slider:before {
                transform: translateX(20px);
            }

            .token-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .token-status {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-radius: 10px;
                font-size: 13px;
            }

            .token-status.configured {
                background-color: ${isDark ? 'rgba(76, 175, 80, 0.15)' : 'rgba(76, 175, 80, 0.1)'};
                color: var(--vscode-terminal-ansiGreen, #4caf50);
            }

            .token-status.not-configured {
                background-color: ${isDark ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)'};
                color: var(--vscode-terminal-ansiYellow, #ff9800);
            }

            .status-icon {
                font-size: 14px;
            }

            .token-mask {
                font-family: monospace;
                margin-left: auto;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            .token-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .token-actions .action-button.compact {
                flex: 1;
                min-width: 0;
            }

            .action-button {
                padding: 6px 12px;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
                transition: background-color 0.2s;
                min-height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .action-button.compact {
                padding: 10px 12px;
            }

            .action-button.full-width {
                width: 100%;
                padding: 14px 12px;
            }

            .action-button.tall {
                padding: 14px 12px;
            }

            .action-button.primary {
                background-color: var(--vscode-button-background, #007acc);
                color: var(--vscode-button-foreground, #ffffff);
            }

            .action-button.primary:hover {
                background-color: var(--vscode-button-hoverBackground, #005a9e);
            }

            .action-button.secondary {
                background-color: var(--vscode-button-secondaryBackground, ${isDark ? '#3a3d41' : '#e0e0e0'});
                color: var(--vscode-button-secondaryForeground, ${isDark ? '#cccccc' : '#333333'});
            }

            .action-button.secondary:hover {
                background-color: var(--vscode-button-secondaryHoverBackground, ${isDark ? '#45494e' : '#d0d0d0'});
            }

            .action-button.danger {
                background-color: ${isDark ? 'rgba(244, 67, 54, 0.2)' : 'rgba(244, 67, 54, 0.1)'};
                color: var(--vscode-errorForeground, #f44336);
            }

            .action-button.danger:hover {
                background-color: ${isDark ? 'rgba(244, 67, 54, 0.3)' : 'rgba(244, 67, 54, 0.2)'};
            }

            .action-button.full-width {
                width: 100%;
            }

            /* Exclude Folders Styles */
            .exclude-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 12px;
                max-height: 200px;
                overflow-y: auto;
                padding: 2px;
            }

            .exclude-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                background-color: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#ffffff'});
                border: 1px solid var(--vscode-input-border, ${isDark ? '#3e3e3e' : '#cecece'});
                border-radius: 6px;
                transition: background-color 0.2s;
            }

            .exclude-item:hover {
                background-color: var(--vscode-list-hoverBackground, ${isDark ? '#2a2d2e' : '#f0f0f0'});
            }

            .exclude-pattern {
                flex: 1;
                font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
                font-size: 12px;
                color: var(--vscode-textPreformat-foreground, ${isDark ? '#d4d4d4' : '#333333'});
                word-break: break-all;
            }

            .remove-button {
                padding: 4px;
                border: none;
                background: transparent;
                color: var(--vscode-errorForeground, #f44336);
                cursor: pointer;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s;
                flex-shrink: 0;
            }

            .remove-button:hover {
                background-color: ${isDark ? 'rgba(244, 67, 54, 0.2)' : 'rgba(244, 67, 54, 0.1)'};
            }

            .add-pattern-container {
                margin-bottom: 12px;
            }

            .exclude-actions {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
            }

            .empty-state {
                text-align: center;
                padding: 20px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
                font-size: 12px;
                font-style: italic;
            }

            .info-box {
                background-color: ${isDark ? 'rgba(33, 150, 243, 0.1)' : 'rgba(33, 150, 243, 0.05)'};
                border-left: 3px solid var(--vscode-textLink-foreground, #2196f3);
                padding: 10px 12px;
                border-radius: 6px;
                font-size: 12px;
                margin-top: 12px;
            }

            .info-box strong {
                display: block;
                margin-bottom: 6px;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
            }

            .pattern-examples {
                list-style: none;
                padding: 0;
                margin: 0;
            }

            .pattern-examples li {
                padding: 4px 0;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            .pattern-examples code {
                font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
                font-size: 11px;
                background-color: var(--vscode-textCodeBlock-background, ${isDark ? '#1e1e1e' : '#f5f5f5'});
                padding: 2px 6px;
                border-radius: 3px;
                color: var(--vscode-textPreformat-foreground, ${isDark ? '#d4d4d4' : '#333333'});
            }
        `;
    }

    /**
     * Gets JavaScript code for the webview
     */
    private _getJavaScript(): string {
        return `
            const vscode = acquireVsCodeApi();

            function saveApiEndpoint() {
                const input = document.getElementById('apiEndpoint');
                const value = input.value.trim();
                
                // Clear previous messages
                document.getElementById('apiEndpoint-error').style.display = 'none';
                document.getElementById('apiEndpoint-success').style.display = 'none';
                input.classList.remove('error');
                
                vscode.postMessage({
                    command: 'updateApiEndpoint',
                    value: value
                });
            }

            function updateToggle(setting, value) {
                vscode.postMessage({
                    command: 'updateToggle',
                    setting: setting,
                    value: value
                });
            }

            function configureToken() {
                vscode.postMessage({
                    command: 'configureToken'
                });
            }

            function removeToken() {
                vscode.postMessage({
                    command: 'removeToken'
                });
            }

            function openSettings() {
                vscode.postMessage({
                    command: 'openSettings'
                });
            }

            function addExcludeFolder() {
                const input = document.getElementById('newExcludePattern');
                if (!input) return;
                const pattern = input.value.trim();
                
                // Clear previous messages
                const errorEl = document.getElementById('excludeFolder-error');
                if (errorEl) errorEl.style.display = 'none';
                
                if (!pattern) {
                    if (errorEl) {
                        errorEl.textContent = 'Pattern cannot be empty';
                        errorEl.style.display = 'block';
                    }
                    return;
                }
                
                vscode.postMessage({
                    command: 'addExcludeFolder',
                    pattern: pattern
                });
            }

            function removeExcludeFolder(index) {
                vscode.postMessage({
                    command: 'removeExcludeFolder',
                    index: index
                });
            }

            function resetExcludeFolders() {
                vscode.postMessage({
                    command: 'resetExcludeFolders'
                });
            }

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'validationError':
                        if (message.field === 'apiEndpoint') {
                            const input = document.getElementById('apiEndpoint');
                            const errorEl = document.getElementById('apiEndpoint-error');
                            input.classList.add('error');
                            errorEl.textContent = message.error;
                            errorEl.style.display = 'block';
                            document.getElementById('apiEndpoint-success').style.display = 'none';
                        }
                        break;
                    case 'validationSuccess':
                        if (message.field === 'apiEndpoint') {
                            const input = document.getElementById('apiEndpoint');
                            input.classList.remove('error');
                            document.getElementById('apiEndpoint-error').style.display = 'none';
                            document.getElementById('apiEndpoint-success').style.display = 'block';
                            setTimeout(() => {
                                document.getElementById('apiEndpoint-success').style.display = 'none';
                            }, 3000);
                        }
                        break;
                    case 'excludeFolderError':
                        const excludeErrorEl = document.getElementById('excludeFolder-error');
                        if (excludeErrorEl) {
                            excludeErrorEl.textContent = message.error;
                            excludeErrorEl.style.display = 'block';
                        }
                        break;
                    case 'excludeFolderSuccess':
                        const excludeInput = document.getElementById('newExcludePattern');
                        if (excludeInput) excludeInput.value = '';
                        const excludeSuccessErrorEl = document.getElementById('excludeFolder-error');
                        if (excludeSuccessErrorEl) excludeSuccessErrorEl.style.display = 'none';
                        break;
                }
            });

            // Handle Enter key in API endpoint input
            const apiEndpointInput = document.getElementById('apiEndpoint');
            if (apiEndpointInput) {
                apiEndpointInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        saveApiEndpoint();
                    }
                });
            }

            // Handle Enter key in exclude pattern input
            const excludePatternInput = document.getElementById('newExcludePattern');
            if (excludePatternInput) {
                excludePatternInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        addExcludeFolder();
                    }
                });
            }
        `;
    }

    /**
     * Gets the save icon SVG
     */
    private _getSaveIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
        </svg>`;
    }

    /**
     * Gets the add icon SVG
     */
    private _getAddIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
        </svg>`;
    }

    /**
     * Gets the remove icon SVG
     */
    private _getRemoveIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>`;
    }

    /**
     * Escapes HTML special characters
     */
    private _escapeHtml(text: string): string {
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
     * Disposes the provider
     */
    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
