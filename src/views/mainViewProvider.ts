/**
 * Main View Provider for Pack-Man VS Code Extension
 * 
 * Unified webview with tabs combining Statistics, Settings, and Help.
 * Solves the sidebar height limitation when multiple views are open.
 */

import * as vscode from 'vscode';
import { AnalysisService, AnalysisResult } from '../services/analysisService';
import { validateApiEndpoint } from '../utils/urlValidator';

export type TabType = 'overview' | 'settings' | 'help';

export interface StatisticsData {
    total: number;
    upToDate: number;
    outdated: number;
    errors: number;
    lastUpdated: Date | null;
}

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

interface LoadingState {
    analyzeWorkspace: boolean;
    refresh: boolean;
    clearCache: boolean;
}

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

    const timestamps = results.map(r => r.timestamp).filter(t => t > 0);
    const lastUpdated = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
    return { ...aggregated, lastUpdated };
}

const HELP_LINKS = [
    { label: 'Documentation', url: 'https://docs.pack-man.tech/', icon: 'book', description: 'Learn how to use Pack-Man' },
    { label: 'Changelog', url: 'https://github.com/gzpaitch/pack-man', icon: 'history', description: "See what's new" },
    { label: 'Report an Issue', url: 'https://github.com/gzpaitch/pack-man', icon: 'bug', description: 'Found a bug? Let us know' },
    { label: 'Rate our extension', url: 'https://marketplace.visualstudio.com/items?itemName=pack-man.pack-man-vscode&ssr=false#review-details', icon: 'star', description: 'Help us with a 5-star review' },
    { label: 'Buy Me a Coffee', url: 'https://buymeacoffee.com/avenca.digital', icon: 'heart', description: 'Support the development' }
];

export class MainViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'packman.main';

    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _analysisService: AnalysisService;
    private _disposables: vscode.Disposable[] = [];
    private _activeTab: TabType = 'overview';
    private _statistics: StatisticsData = { total: 0, upToDate: 0, outdated: 0, errors: 0, lastUpdated: null };
    private _loadingState: LoadingState = { analyzeWorkspace: false, refresh: false, clearCache: false };
    private _extensionVersion: string;

    constructor(context: vscode.ExtensionContext, analysisService: AnalysisService) {
        this._context = context;
        this._analysisService = analysisService;

        const extension = vscode.extensions.getExtension('pack-man.pack-man-vscode');
        this._extensionVersion = extension?.packageJSON?.version || context.extension?.packageJSON?.version || '1.1.0';

        this._disposables.push(
            this._analysisService.onAnalysisUpdate(() => {
                this._loadingState.analyzeWorkspace = false;
                this._loadingState.refresh = false;
                this._updateStatisticsFromCache();
                this._updateContent();
            }),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('packman')) this._updateContent();
            }),
            context.secrets.onDidChange((e) => {
                if (e.key === 'packman.githubToken') this._updateContent();
            })
        );
    }

    public resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
        this._updateStatisticsFromCache();
        this._updateContent();

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateStatisticsFromCache();
                this._updateContent();
            }
        });

        webviewView.webview.onDidReceiveMessage((message) => this._handleMessage(message), null, this._disposables);
    }

    public refresh(): void {
        this._updateStatisticsFromCache();
        this._updateContent();
    }

    public getStatistics(): StatisticsData { return { ...this._statistics }; }

    private _updateStatisticsFromCache(): void {
        this._statistics = aggregateStatistics(this._analysisService.getAllCachedResults());
    }

    private async _updateContent(): Promise<void> {
        if (!this._view) return;
        const settings = await this._getSettingsData();
        this._view.webview.html = this._generateHTML(settings);
    }

    private async _getSettingsData(): Promise<SettingsData> {
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
            excludeFolders: config.get<string[]>('excludeFolders', ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**', '**/.git/**']) || []
        };
    }

    private async _handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'switchTab': this._activeTab = message.tab; this._updateContent(); break;
            case 'analyzeWorkspace': await this._handleAnalyzeWorkspace(); break;
            case 'refresh': await this._handleRefresh(); break;
            case 'clearCache': await this._handleClearCache(); break;
            case 'updateApiEndpoint': await this._updateApiEndpoint(message.value); break;
            case 'updateToggle': await this._updateToggle(message.setting, message.value); break;
            case 'configureToken': await vscode.commands.executeCommand('packman.configureGitHubToken'); break;
            case 'removeToken': await this._removeToken(); break;
            case 'openSettings': await vscode.commands.executeCommand('workbench.action.openSettings', 'packman'); break;
            case 'openLink': if (message.url) await vscode.env.openExternal(vscode.Uri.parse(message.url)); break;
            case 'openFile': if (message.uri) await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(message.uri)); break;
            case 'addExcludeFolder': await this._addExcludeFolder(message.pattern); break;
            case 'removeExcludeFolder': await this._removeExcludeFolder(message.index); break;
            case 'resetExcludeFolders': await this._resetExcludeFolders(); break;
        }
    }

    private async _handleAnalyzeWorkspace(): Promise<void> {
        if (this._loadingState.analyzeWorkspace) return;
        this._loadingState.analyzeWorkspace = true;
        this._updateContent();
        try { await vscode.commands.executeCommand('packman.analyzeWorkspace'); }
        catch (error) { vscode.window.showErrorMessage(`Pack-Man: Failed to analyze workspace. ${error instanceof Error ? error.message : 'Unknown error'}`); }
        finally { this._loadingState.analyzeWorkspace = false; this._updateContent(); }
    }

    private async _handleRefresh(): Promise<void> {
        if (this._loadingState.refresh) return;
        this._loadingState.refresh = true;
        this._updateContent();
        try {
            const cachedResults = this._analysisService.getAllCachedResults();
            if (cachedResults.length === 0) { await vscode.commands.executeCommand('packman.analyzeWorkspace'); }
            else {
                for (const result of cachedResults) await this._analysisService.analyzeFile(result.uri);
                vscode.window.showInformationMessage(`Pack-Man: Refreshed ${cachedResults.length} file${cachedResults.length === 1 ? '' : 's'}`);
            }
        } catch (error) { vscode.window.showErrorMessage(`Pack-Man: Failed to refresh. ${error instanceof Error ? error.message : 'Unknown error'}`); }
        finally { this._loadingState.refresh = false; this._updateContent(); }
    }

    private async _handleClearCache(): Promise<void> {
        if (this._loadingState.clearCache) return;
        this._loadingState.clearCache = true;
        this._updateContent();
        try { this._analysisService.clearCache(); this._updateStatisticsFromCache(); vscode.window.showInformationMessage('Pack-Man: Cache cleared'); }
        catch (error) { vscode.window.showErrorMessage(`Pack-Man: Failed to clear cache. ${error instanceof Error ? error.message : 'Unknown error'}`); }
        finally { this._loadingState.clearCache = false; this._updateContent(); }
    }

    private async _updateApiEndpoint(value: string): Promise<void> {
        const validation = validateApiEndpoint(value);
        if (!validation.isValid) { this._view?.webview.postMessage({ command: 'validationError', field: 'apiEndpoint', error: validation.error }); return; }
        try {
            await vscode.workspace.getConfiguration('packman').update('apiEndpoint', value, vscode.ConfigurationTarget.Global);
            this._view?.webview.postMessage({ command: 'validationSuccess', field: 'apiEndpoint' });
            vscode.window.showInformationMessage(`Pack-Man: API endpoint updated to ${value}`);
        } catch { this._view?.webview.postMessage({ command: 'validationError', field: 'apiEndpoint', error: 'Failed to save' }); }
    }

    private async _updateToggle(setting: string, value: boolean): Promise<void> {
        try { await vscode.workspace.getConfiguration('packman').update(setting, value, vscode.ConfigurationTarget.Global); }
        catch (error) { vscode.window.showErrorMessage(`Pack-Man: Failed to update setting. ${error instanceof Error ? error.message : 'Unknown error'}`); }
    }

    private async _removeToken(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage('Remove your GitHub token?', { modal: true }, 'Remove');
        if (confirm === 'Remove') {
            try { await this._context.secrets.delete('packman.githubToken'); vscode.window.showInformationMessage('Pack-Man: Token removed'); this._updateContent(); }
            catch (error) { vscode.window.showErrorMessage(`Pack-Man: Failed to remove token. ${error instanceof Error ? error.message : 'Unknown error'}`); }
        }
    }

    private async _addExcludeFolder(pattern: string): Promise<void> {
        if (!pattern?.trim()) { this._view?.webview.postMessage({ command: 'excludeFolderError', error: 'Pattern cannot be empty' }); return; }
        const config = vscode.workspace.getConfiguration('packman');
        const current = config.get<string[]>('excludeFolders', []);
        if (current.includes(pattern.trim())) { this._view?.webview.postMessage({ command: 'excludeFolderError', error: 'Pattern already exists' }); return; }
        try { await config.update('excludeFolders', [...current, pattern.trim()], vscode.ConfigurationTarget.Global); this._view?.webview.postMessage({ command: 'excludeFolderSuccess' }); this._updateContent(); }
        catch { this._view?.webview.postMessage({ command: 'excludeFolderError', error: 'Failed to add pattern' }); }
    }

    private async _removeExcludeFolder(index: number): Promise<void> {
        const config = vscode.workspace.getConfiguration('packman');
        const current = config.get<string[]>('excludeFolders', []);
        if (index < 0 || index >= current.length) return;
        try { await config.update('excludeFolders', current.filter((_, i) => i !== index), vscode.ConfigurationTarget.Global); this._updateContent(); }
        catch (error) { vscode.window.showErrorMessage(`Pack-Man: Failed to remove pattern. ${error instanceof Error ? error.message : 'Unknown error'}`); }
    }

    private async _resetExcludeFolders(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage('Reset exclude folders to defaults?', { modal: true }, 'Reset');
        if (confirm === 'Reset') {
            try { await vscode.workspace.getConfiguration('packman').update('excludeFolders', ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**', '**/.git/**'], vscode.ConfigurationTarget.Global); vscode.window.showInformationMessage('Pack-Man: Exclude folders reset'); this._updateContent(); }
            catch (error) { vscode.window.showErrorMessage(`Pack-Man: Failed to reset. ${error instanceof Error ? error.message : 'Unknown error'}`); }
        }
    }

    private _generateHTML(settings: SettingsData): string {
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pack-Man</title>
    <style>${this._getCSS(theme)}</style>
</head>
<body class="${theme}">
    <div class="main-container">
        ${this._generateTabs()}
        <div class="tab-content">
            ${this._activeTab === 'overview' ? this._generateOverviewTab() : ''}
            ${this._activeTab === 'settings' ? this._generateSettingsTab(settings) : ''}
            ${this._activeTab === 'help' ? this._generateHelpTab() : ''}
        </div>
    </div>
    <script>${this._getJavaScript()}</script>
</body>
</html>`;
    }

    private _generateTabs(): string {
        return `<div class="tabs-wrapper">
            <div class="tabs-container">
                <div class="tab-indicator" style="transform: translateX(${this._activeTab === 'overview' ? '0' : this._activeTab === 'settings' ? '100' : '200'}%)"></div>
                <button class="tab-button ${this._activeTab === 'overview' ? 'active' : ''}" onclick="switchTab('overview')" aria-selected="${this._activeTab === 'overview'}">
                    ${this._getOverviewIcon()}
                    <span>Overview</span>
                </button>
                <button class="tab-button ${this._activeTab === 'settings' ? 'active' : ''}" onclick="switchTab('settings')" aria-selected="${this._activeTab === 'settings'}">
                    ${this._getSettingsIcon()}
                    <span>Settings</span>
                </button>
                <button class="tab-button ${this._activeTab === 'help' ? 'active' : ''}" onclick="switchTab('help')" aria-selected="${this._activeTab === 'help'}">
                    ${this._getHelpIcon()}
                    <span>Help</span>
                </button>
            </div>
        </div>`;
    }

    private _generateOverviewTab(): string {
        const stats = this._statistics;
        const pct = stats.total > 0 ? Math.round((stats.upToDate / stats.total) * 100) : 0;
        const lastUpdated = stats.lastUpdated ? this._formatTimestamp(stats.lastUpdated) : 'Never';
        const analyzeDisabled = this._loadingState.analyzeWorkspace || this._loadingState.refresh;
        const refreshDisabled = this._loadingState.analyzeWorkspace || this._loadingState.refresh;

        return `<div class="tab-panel">
            <div class="stat-card-large">
                <div class="stat-main">
                    <div class="stat-value-large">${stats.total}</div>
                    <div class="stat-label-large">Total Dependencies</div>
                </div>
                <div class="stat-progress">
                    <div class="progress-bar"><div class="progress-fill" style="width: ${pct}%"></div></div>
                    <div class="progress-label">${pct}% up to date</div>
                </div>
            </div>
            <div class="stats-grid">
                <div class="stat-card up-to-date">
                    <div class="stat-icon">${this._getCheckIcon()}</div>
                    <div class="stat-value">${stats.upToDate}</div>
                    <div class="stat-label">Up to Date</div>
                </div>
                <div class="stat-card outdated">
                    <div class="stat-icon">${this._getWarningIcon()}</div>
                    <div class="stat-value">${stats.outdated}</div>
                    <div class="stat-label">Outdated</div>
                </div>
                <div class="stat-card errors">
                    <div class="stat-icon">${this._getErrorIcon()}</div>
                    <div class="stat-value">${stats.errors}</div>
                    <div class="stat-label">Errors</div>
                </div>
            </div>
            <div class="last-updated">
                ${this._getClockIcon()}
                <span>Last updated: <strong>${lastUpdated}</strong></span>
            </div>
            <div class="actions-section">
                <div class="actions-row">
                    <button class="action-button primary ${this._loadingState.analyzeWorkspace ? 'loading' : ''}" onclick="handleAction('analyzeWorkspace')" ${analyzeDisabled ? 'disabled' : ''}>
                        ${this._loadingState.analyzeWorkspace ? this._getSpinnerSVG() : this._getAnalyzeIcon()} Analyze
                    </button>
                    <button class="action-button secondary ${this._loadingState.refresh ? 'loading' : ''}" onclick="handleAction('refresh')" ${refreshDisabled ? 'disabled' : ''}>
                        ${this._loadingState.refresh ? this._getSpinnerSVG() : this._getRefreshIcon()} Refresh
                    </button>
                </div>
                <button class="action-button tertiary ${this._loadingState.clearCache ? 'loading' : ''}" onclick="handleAction('clearCache')" ${this._loadingState.clearCache ? 'disabled' : ''}>
                    ${this._loadingState.clearCache ? this._getSpinnerSVG() : this._getTrashIcon()} Clear Cache
                </button>
            </div>
            ${this._generatePackageFilesSection()}
        </div>`;
    }

    private _generatePackageFilesSection(): string {
        const cachedResults = this._analysisService.getAllCachedResults();

        if (cachedResults.length === 0) {
            return `
            <section class="package-files-section">
                <h3 class="section-title">${this._getFileIcon()} Package Files</h3>
                <div class="empty-files">
                    <p>No package files analyzed yet.</p>
                    <p class="hint">Click "Analyze" to scan your workspace.</p>
                </div>
            </section>`;
        }

        const fileItems = cachedResults.map(result => {
            const fileName = result.uri.fsPath.split(/[\\/]/).pop() || 'Unknown';
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(result.uri);
            const relativePath = workspaceFolder ? vscode.workspace.asRelativePath(result.uri, false) : fileName;
            const dirPath = relativePath.split(/[\\/]/).slice(0, -1).join('/');

            const status = result.statistics.errors > 0 ? 'error'
                : result.statistics.outdated > 0 ? 'outdated'
                    : result.statistics.upToDate > 0 ? 'healthy' : 'unknown';

            const statusIcon = status === 'healthy' ? this._getCheckIcon()
                : status === 'outdated' ? this._getWarningIcon()
                    : status === 'error' ? this._getErrorIcon() : this._getQuestionIcon();

            const statusClass = status === 'healthy' ? 'up-to-date' : status;
            const stats = `${result.statistics.upToDate}✓ ${result.statistics.outdated}↑ ${result.statistics.errors}✗`;

            return `
            <div class="file-item ${statusClass}" onclick="openFile('${this._escapeHtml(result.uri.toString())}')">
                <div class="file-icon ${statusClass}">${statusIcon}</div>
                <div class="file-info">
                    <span class="file-name">${this._escapeHtml(fileName)}</span>
                    ${dirPath ? `<span class="file-path">${this._escapeHtml(dirPath)}</span>` : ''}
                </div>
                <div class="file-stats">${stats}</div>
            </div>`;
        }).join('');

        return `
        <section class="package-files-section">
            <h3 class="section-title">Package Files <span class="file-count">${cachedResults.length}</span></h3>
            <div class="files-list">
                ${fileItems}
            </div>
        </section>`;
    }

    private _generateSettingsTab(settings: SettingsData): string {
        const tokenStatus = settings.hasGitHubToken
            ? `<span class="token-status configured">✓ Token configured</span>`
            : `<span class="token-status not-configured">○ No token</span>`;
        const tokenActions = settings.hasGitHubToken
            ? `<button class="action-button secondary compact" onclick="configureToken()">Update</button>
               <button class="action-button danger compact" onclick="removeToken()">Remove</button>`
            : `<button class="action-button primary" onclick="configureToken()">Add Token</button>`;

        const excludeList = settings.excludeFolders.length > 0
            ? settings.excludeFolders.map((f, i) => `<div class="exclude-item"><code>${this._escapeHtml(f)}</code><button class="remove-btn" onclick="removeExcludeFolder(${i})">×</button></div>`).join('')
            : '<p class="empty-state">No exclusions</p>';

        return `<div class="tab-panel">
            <section class="settings-section">
                <h3 class="section-title">Auto-Analyze</h3>
                <div class="toggle-row">
                    <div class="toggle-info"><label>On Save</label><p class="desc">Analyze when files are saved</p></div>
                    <label class="toggle-switch"><input type="checkbox" ${settings.autoAnalyzeOnSave ? 'checked' : ''} onchange="updateToggle('autoAnalyzeOnSave', this.checked)"/><span class="toggle-slider"></span></label>
                </div>
                <div class="toggle-row">
                    <div class="toggle-info"><label>On Open</label><p class="desc">Analyze when files are opened</p></div>
                    <label class="toggle-switch"><input type="checkbox" ${settings.autoAnalyzeOnOpen ? 'checked' : ''} onchange="updateToggle('autoAnalyzeOnOpen', this.checked)"/><span class="toggle-slider"></span></label>
                </div>
            </section>
            <section class="settings-section">
                <h3 class="section-title">Display</h3>
                <div class="toggle-row">
                    <div class="toggle-info"><label>CodeLens</label><p class="desc">Inline indicators above dependencies</p></div>
                    <label class="toggle-switch"><input type="checkbox" ${settings.showCodeLens ? 'checked' : ''} onchange="updateToggle('showCodeLens', this.checked)"/><span class="toggle-slider"></span></label>
                </div>
                <div class="toggle-row">
                    <div class="toggle-info"><label>Inline Warnings</label><p class="desc">Squiggly lines for outdated deps</p></div>
                    <label class="toggle-switch"><input type="checkbox" ${settings.showInlineWarnings ? 'checked' : ''} onchange="updateToggle('showInlineWarnings', this.checked)"/><span class="toggle-slider"></span></label>
                </div>
                <div class="toggle-row">
                    <div class="toggle-info"><label>Diagnostics</label><p class="desc">Show in Problems panel</p></div>
                    <label class="toggle-switch"><input type="checkbox" ${settings.showDiagnostics ? 'checked' : ''} onchange="updateToggle('showDiagnostics', this.checked)"/><span class="toggle-slider"></span></label>
                </div>
            </section>
            <section class="settings-section">
                <h3 class="section-title">Exclude Folders</h3>
                <div class="exclude-list">${excludeList}</div>
                <div class="input-group">
                    <input type="text" id="newExcludePattern" class="setting-input" placeholder="e.g., **/.venv/**"/>
                    <button class="save-button" onclick="addExcludeFolder()">+</button>
                </div>
                <div id="excludeFolder-error" class="error-message" style="display:none;"></div>
                <button class="action-button tertiary compact" onclick="resetExcludeFolders()">Reset to Defaults</button>
            </section>
            <section class="settings-section">
                <h3 class="section-title">Advanced</h3>
                <div class="setting-item">
                    <label>API Endpoint</label>
                    <div class="input-group">
                        <input type="text" id="apiEndpoint" class="setting-input" value="${this._escapeHtml(settings.apiEndpoint)}" placeholder="https://pack-man.tech"/>
                        <button class="save-button" onclick="saveApiEndpoint()">✓</button>
                    </div>
                    <div id="apiEndpoint-error" class="error-message" style="display:none;"></div>
                </div>
                <div class="setting-item">
                    <label>GitHub Token</label>
                    <p class="desc">Increases rate limits (60 → 5,000/hour)</p>
                    <div class="token-container">${tokenStatus}<div class="token-actions">${tokenActions}</div></div>
                </div>
                <button class="action-button secondary" onclick="openSettings()">Open Full Settings</button>
            </section>
        </div>`;
    }

    private _generateHelpTab(): string {
        const links = HELP_LINKS.map(link => `
            <a class="help-link" href="#" onclick="openLink('${this._escapeHtml(link.url)}')">
                <span class="link-icon">${this._getLinkIcon(link.icon)}</span>
                <div class="link-content">
                    <span class="link-label">${this._escapeHtml(link.label)}</span>
                    <span class="link-desc">${this._escapeHtml(link.description)}</span>
                </div>
                ${this._getExternalIcon()}
            </a>
        `).join('');

        return `<div class="tab-panel">
            <section class="help-section">
                <h3 class="section-title">Resources</h3>
                <div class="links-container">${links}</div>
            </section>
            <div class="version-info">
                <span>Pack-Man Extension</span>
                <strong>v${this._escapeHtml(this._extensionVersion)}</strong>
            </div>
        </div>`;
    }

    private _formatTimestamp(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHour = Math.floor(diffMin / 60);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        return date.toLocaleDateString();
    }

    private _escapeHtml(text: string): string {
        return text.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] || m));
    }

    // Icons
    private _getOverviewIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 11a1 1 0 1 1 2 0v1a1 1 0 1 1-2 0v-1zm6-4a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V7zM7 9a1 1 0 0 1 2 0v3a1 1 0 1 1-2 0V9z"/><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`; }
    private _getSettingsIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>`; }
    private _getHelpIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/></svg>`; }
    private _getCheckIcon(): string { return `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`; }
    private _getWarningIcon(): string { return `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>`; }
    private _getErrorIcon(): string { return `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/></svg>`; }
    private _getClockIcon(): string { return `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>`; }
    private _getAnalyzeIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 8a5.5 5.5 0 0 1 8.25-4.764.5.5 0 0 0 .5-.866A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0 5.5 5.5 0 1 1-11 0z"/><path d="M15.354 3.354a.5.5 0 0 0-.708-.708L8 9.293 5.354 6.646a.5.5 0 1 0-.708.708l3 3a.5.5 0 0 0 .708 0l7-7z"/></svg>`; }
    private _getRefreshIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>`; }
    private _getTrashIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`; }
    private _getSpinnerSVG(): string { return `<svg class="spinner" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 0 8 8h-1.5A6.5 6.5 0 1 1 8 1.5V0z"/></svg>`; }
    private _getExternalIcon(): string { return `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" class="external-icon"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>`; }
    private _getFileIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/></svg>`; }
    private _getQuestionIcon(): string { return `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/></svg>`; }
    private _getLinkIcon(name: string): string {
        const icons: Record<string, string> = {
            book: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/></svg>`,
            history: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0v1z"/><path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5z"/></svg>`,
            bug: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.355.522a.5.5 0 0 1 .623.333l.291.956A4.979 4.979 0 0 1 8 1c1.007 0 1.946.298 2.731.811l.29-.956a.5.5 0 1 1 .957.29l-.41 1.352A4.985 4.985 0 0 1 13 6h.5a.5.5 0 0 0 .5-.5V5a.5.5 0 0 1 1 0v.5A1.5 1.5 0 0 1 13.5 7H13v1h1.5a.5.5 0 0 1 0 1H13v1h.5a1.5 1.5 0 0 1 1.5 1.5v.5a.5.5 0 1 1-1 0v-.5a.5.5 0 0 0-.5-.5H13a5 5 0 0 1-10 0h-.5a.5.5 0 0 0-.5.5v.5a.5.5 0 1 1-1 0v-.5A1.5 1.5 0 0 1 2.5 10H3V9H1.5a.5.5 0 0 1 0-1H3V7h-.5A1.5 1.5 0 0 1 1 5.5V5a.5.5 0 0 1 1 0v.5a.5.5 0 0 0 .5.5H3a5 5 0 0 1 1.432-3.503l-.41-1.352a.5.5 0 0 1 .333-.623zM4 7v4a4 4 0 0 0 3.5 3.97V7H4zm4.5 0v7.97A4 4 0 0 0 12 11V7H8.5zM12 6a3.989 3.989 0 0 0-1.334-2.982A3.983 3.983 0 0 0 8 2a3.983 3.983 0 0 0-2.667 1.018A3.989 3.989 0 0 0 4 6h8z"/></svg>`,
            star: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/></svg>`,
            heart: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>`
        };
        return icons[name] || icons.book;
    }

    private _getCSS(theme: string): string {
        const isDark = theme === 'dark';
        return `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { height: 100%; overflow: hidden; }
            body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); font-size: 13px; line-height: 1.4; background: transparent; color: var(--vscode-foreground, ${isDark ? '#ccc' : '#333'}); }
            .main-container { display: flex; flex-direction: column; height: 100%; }
            .tabs-wrapper { padding: 10px 10px 0; flex-shrink: 0; }
            .tabs-container { display: grid; grid-template-columns: repeat(3, 1fr); position: relative; background: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#e8e8e8'}); border-radius: 10px; padding: 3px; gap: 2px; }
            .tab-indicator { position: absolute; top: 3px; left: 3px; width: calc(33.333% - 2px); height: calc(100% - 6px); background: var(--vscode-button-background, #007acc); border-radius: 8px; transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); z-index: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
            .tab-button { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 8px 6px; border: none; background: transparent; color: var(--vscode-foreground, ${isDark ? '#999' : '#666'}); cursor: pointer; font-size: 11px; font-weight: 500; border-radius: 8px; transition: color 0.2s; }
            .tab-button:hover:not(.active) { color: var(--vscode-foreground, ${isDark ? '#ccc' : '#333'}); }
            .tab-button.active { color: var(--vscode-button-foreground, #fff); }
            .tab-button svg { flex-shrink: 0; width: 13px; height: 13px; }
            .tab-button span { white-space: nowrap; }
            .tab-content { flex: 1; overflow: hidden; }
            .tab-panel { height: 100%; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
            .stat-card-large { background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'}); border: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'}); border-radius: 12px; padding: 14px; }
            .stat-main { margin-bottom: 10px; }
            .stat-value-large { font-size: 32px; font-weight: 700; line-height: 1; }
            .stat-label-large { font-size: 11px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); margin-top: 4px; }
            .stat-progress { display: flex; flex-direction: column; gap: 4px; }
            .progress-bar { height: 5px; background: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#e8e8e8'}); border-radius: 5px; overflow: hidden; }
            .progress-fill { height: 100%; background: linear-gradient(90deg, var(--vscode-terminal-ansiGreen, #4caf50), var(--vscode-terminal-ansiCyan, #26c6da)); border-radius: 5px; transition: width 0.3s; }
            .progress-label { font-size: 10px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
            .stat-card { background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'}); border: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'}); border-radius: 10px; padding: 10px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: transform 0.2s; }
            .stat-card:hover { transform: translateY(-1px); }
            .stat-icon { display: flex; }
            .stat-card.up-to-date .stat-icon, .stat-card.up-to-date .stat-value { color: var(--vscode-terminal-ansiGreen, #4caf50); }
            .stat-card.outdated .stat-icon, .stat-card.outdated .stat-value { color: var(--vscode-terminal-ansiYellow, #ff9800); }
            .stat-card.errors .stat-icon, .stat-card.errors .stat-value { color: var(--vscode-errorForeground, #f44336); }
            .stat-value { font-size: 18px; font-weight: 700; line-height: 1; }
            .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .last-updated { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'}); border: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'}); border-radius: 8px; font-size: 11px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .actions-section { display: flex; flex-direction: column; gap: 8px; }
            .actions-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .action-button { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border: none; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; font-family: inherit; }
            .action-button:disabled { opacity: 0.5; cursor: not-allowed; }
            .action-button:not(:disabled):hover { transform: translateY(-1px); }
            .action-button.primary { background: var(--vscode-button-background, #007acc); color: var(--vscode-button-foreground, #fff); }
            .action-button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, #005a9e); }
            .action-button.secondary { background: var(--vscode-button-secondaryBackground, ${isDark ? '#3a3d41' : '#e0e0e0'}); color: var(--vscode-button-secondaryForeground, ${isDark ? '#ccc' : '#333'}); }
            .action-button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, ${isDark ? '#45494e' : '#d0d0d0'}); }
            .action-button.tertiary { background: transparent; color: var(--vscode-foreground, ${isDark ? '#ccc' : '#333'}); border: 1px solid var(--vscode-input-border, ${isDark ? '#3e3e3e' : '#cecece'}); }
            .action-button.tertiary:hover:not(:disabled) { background: var(--vscode-list-hoverBackground, ${isDark ? '#2a2d2e' : '#f0f0f0'}); }
            .action-button.danger { background: transparent; color: var(--vscode-errorForeground, #f44336); border: 1px solid var(--vscode-errorForeground, #f44336); }
            .action-button.compact { padding: 6px 10px; font-size: 11px; }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .spinner { animation: spin 1s linear infinite; }
            .action-button.loading { pointer-events: none; }

            /* Settings Tab */
            .settings-section { background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'}); border-radius: 10px; padding: 10px; margin-bottom: 8px; }
            .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'}); }
            .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
            .toggle-info { flex: 1; }
            .toggle-info label { font-weight: 500; font-size: 12px; display: block; }
            .toggle-info .desc, .desc { font-size: 10px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); margin-top: 2px; }
            .toggle-switch { position: relative; width: 36px; height: 18px; flex-shrink: 0; }
            .toggle-switch input { opacity: 0; width: 0; height: 0; }
            .toggle-slider { position: absolute; cursor: pointer; inset: 0; background: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#ccc'}); border-radius: 18px; transition: 0.2s; }
            .toggle-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; }
            input:checked + .toggle-slider { background: var(--vscode-button-background, #007acc); }
            input:checked + .toggle-slider:before { transform: translateX(18px); }
            .setting-item { margin-bottom: 10px; }
            .setting-item label { font-weight: 500; font-size: 12px; display: block; margin-bottom: 4px; }
            .input-group { display: flex; gap: 6px; margin-top: 4px; }
            .setting-input { flex: 1; padding: 6px 8px; border: 1px solid var(--vscode-input-border, ${isDark ? '#3e3e3e' : '#cecece'}); border-radius: 6px; background: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#fff'}); color: var(--vscode-input-foreground, ${isDark ? '#ccc' : '#333'}); font-size: 12px; outline: none; }
            .setting-input:focus { border-color: var(--vscode-focusBorder, #007acc); }
            .save-button { padding: 6px 10px; border: none; border-radius: 6px; background: var(--vscode-button-background, #007acc); color: var(--vscode-button-foreground, #fff); cursor: pointer; font-size: 12px; }
            .save-button:hover { background: var(--vscode-button-hoverBackground, #005a9e); }
            .error-message { color: var(--vscode-errorForeground, #f44336); font-size: 11px; margin-top: 4px; }
            .exclude-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; max-height: 120px; overflow-y: auto; }
            .exclude-item { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#fff'}); border-radius: 4px; }
            .exclude-item code { font-size: 11px; color: var(--vscode-foreground, ${isDark ? '#ccc' : '#333'}); }
            .remove-btn { background: none; border: none; color: var(--vscode-errorForeground, #f44336); cursor: pointer; font-size: 14px; padding: 0 4px; }
            .empty-state { font-size: 11px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); font-style: italic; }
            .token-container { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
            .token-status { font-size: 11px; padding: 6px 8px; border-radius: 6px; }
            .token-status.configured { background: ${isDark ? 'rgba(76, 175, 80, 0.15)' : 'rgba(76, 175, 80, 0.1)'}; color: var(--vscode-terminal-ansiGreen, #4caf50); }
            .token-status.not-configured { background: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#f0f0f0'}); color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .token-actions { display: flex; gap: 6px; }
            /* Help Tab */
            .help-section { background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'}); border-radius: 10px; padding: 10px; }
            .links-container { display: flex; flex-direction: column; gap: 2px; }
            .help-link { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; text-decoration: none; color: var(--vscode-foreground, ${isDark ? '#ccc' : '#333'}); cursor: pointer; transition: background 0.15s; }
            .help-link:hover { background: var(--vscode-list-hoverBackground, ${isDark ? '#2a2d2e' : '#e8e8e8'}); }
            .link-icon { color: var(--vscode-textLink-foreground, #3794ff); display: flex; }
            .help-link:nth-child(4) .link-icon { color: #f5a623; }
            .help-link:last-child .link-icon { color: #ff6b6b; }
            .link-content { flex: 1; }
            .link-label { font-weight: 500; font-size: 12px; display: block; }
            .link-desc { font-size: 10px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .external-icon { opacity: 0; transition: opacity 0.15s; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .help-link:hover .external-icon { opacity: 1; }
            .version-info { text-align: center; padding: 12px; font-size: 12px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .version-info strong { display: block; margin-top: 4px; color: var(--vscode-foreground, ${isDark ? '#ccc' : '#333'}); }
            /* Package Files Section */
            .package-files-section { background: var(--vscode-sideBar-background, ${isDark ? '#252526' : '#f3f3f3'}); border: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'}); border-radius: 12px; padding: 12px; }
            .package-files-section .section-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border, ${isDark ? '#3e3e3e' : '#e0e0e0'}); }
            .package-files-section .section-title svg { opacity: 0.7; }
            .file-count { background: var(--vscode-badge-background, ${isDark ? '#4d4d4d' : '#c4c4c4'}); color: var(--vscode-badge-foreground, #fff); font-size: 10px; padding: 1px 6px; border-radius: 10px; margin-left: auto; }
            .files-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
            .file-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--vscode-input-background, ${isDark ? '#3c3c3c' : '#fff'}); border-radius: 8px; cursor: pointer; transition: all 0.15s; }
            .file-item:hover { background: var(--vscode-list-hoverBackground, ${isDark ? '#2a2d2e' : '#e8e8e8'}); }
            .file-icon { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; }
            .file-icon.up-to-date { color: var(--vscode-terminal-ansiGreen, #4caf50); }
            .file-icon.outdated { color: var(--vscode-terminal-ansiYellow, #ff9800); }
            .file-icon.error { color: var(--vscode-errorForeground, #f44336); }
            .file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
            .file-name { font-size: 12px; font-weight: 500; color: var(--vscode-foreground, ${isDark ? '#ccc' : '#333'}); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .file-path { font-size: 10px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .file-stats { font-size: 10px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); white-space: nowrap; flex-shrink: 0; }
            .empty-files { text-align: center; padding: 16px 8px; color: var(--vscode-descriptionForeground, ${isDark ? '#888' : '#717171'}); }
            .empty-files p { font-size: 12px; margin: 0; }
            .empty-files .hint { font-size: 11px; margin-top: 4px; opacity: 0.8; }
        `;
    }

    private _getJavaScript(): string {
        return `
            const vscode = acquireVsCodeApi();
            function switchTab(tab) { vscode.postMessage({ command: 'switchTab', tab }); }
            function handleAction(action) { vscode.postMessage({ command: action }); }
            function updateToggle(setting, value) { vscode.postMessage({ command: 'updateToggle', setting, value }); }
            function saveApiEndpoint() { vscode.postMessage({ command: 'updateApiEndpoint', value: document.getElementById('apiEndpoint').value }); }
            function configureToken() { vscode.postMessage({ command: 'configureToken' }); }
            function removeToken() { vscode.postMessage({ command: 'removeToken' }); }
            function openSettings() { vscode.postMessage({ command: 'openSettings' }); }
            function openLink(url) { vscode.postMessage({ command: 'openLink', url }); }
            function openFile(uri) { vscode.postMessage({ command: 'openFile', uri }); }
            function addExcludeFolder() {
                const input = document.getElementById('newExcludePattern');
                vscode.postMessage({ command: 'addExcludeFolder', pattern: input.value });
                input.value = '';
            }
            function removeExcludeFolder(index) { vscode.postMessage({ command: 'removeExcludeFolder', index }); }
            function resetExcludeFolders() { vscode.postMessage({ command: 'resetExcludeFolders' }); }
            window.addEventListener('message', event => {
                const msg = event.data;
                if (msg.command === 'validationError') {
                    const el = document.getElementById(msg.field + '-error');
                    if (el) { el.textContent = msg.error; el.style.display = 'block'; }
                } else if (msg.command === 'validationSuccess') {
                    const el = document.getElementById(msg.field + '-error');
                    if (el) el.style.display = 'none';
                } else if (msg.command === 'excludeFolderError') {
                    const el = document.getElementById('excludeFolder-error');
                    if (el) { el.textContent = msg.error; el.style.display = 'block'; }
                } else if (msg.command === 'excludeFolderSuccess') {
                    const el = document.getElementById('excludeFolder-error');
                    if (el) el.style.display = 'none';
                }
            });
        `;
    }

    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
