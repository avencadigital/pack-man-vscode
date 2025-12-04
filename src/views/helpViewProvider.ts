/**
 * Help View Provider for Pack-Man VS Code Extension
 * 
 * Provides a webview-based help panel in the Activity Bar sidebar.
 * Displays documentation links, support resources, and extension version.
 * 
 */

import * as vscode from 'vscode';

/**
 * Help link structure
 */
export interface HelpLink {
    label: string;
    url: string;
    icon: string;
    description?: string;
}

/**
 * HelpViewProvider implements WebviewViewProvider to display
 * help content and documentation links in the Activity Bar sidebar panel.
 */
export class HelpViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'packman.help';

    private _view?: vscode.WebviewView;
    private _extensionVersion: string;
    private _disposables: vscode.Disposable[] = [];

    /**
     * Documentation and support links
     */
    private readonly _helpLinks: HelpLink[] = [
        {
            label: 'Documentation',
            url: 'https://docs.pack-man.tech',
            icon: 'book',
            description: 'Learn how to use Pack-Man'
        },
        {
            label: 'Changelog',
            url: 'https://github.com/gzpaitch/pack-man',
            icon: 'history',
            description: 'See what\'s new'
        },
        {
            label: 'Report an Issue',
            url: 'https://github.com/gzpaitch/pack-man',
            icon: 'bug',
            description: 'Found a bug? Let us know'
        },
        {
            label: 'Buy Me a Coffee',
            url: 'https://buymeacoffee.com/avenca.digital',
            icon: 'heart',
            description: 'Support the development'
        }
    ];

    constructor(context: vscode.ExtensionContext) {
        // Read version from package.json via extension context
        // Try multiple approaches for robustness
        const extension = vscode.extensions.getExtension('pack-man.pack-man-vscode');
        if (extension?.packageJSON?.version) {
            this._extensionVersion = extension.packageJSON.version;
        } else if (context.extension?.packageJSON?.version) {
            this._extensionVersion = context.extension.packageJSON.version;
        } else {
            this._extensionVersion = '1.0.0'; // Fallback to known version
        }
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
     * Gets the extension version
     */
    public getVersion(): string {
        return this._extensionVersion;
    }

    /**
     * Gets the help links
     */
    public getHelpLinks(): HelpLink[] {
        return [...this._helpLinks];
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
    private async _handleMessage(message: { command: string; url?: string }): Promise<void> {
        switch (message.command) {
            case 'openLink':
                if (message.url) {
                    await vscode.env.openExternal(vscode.Uri.parse(message.url));
                }
                break;
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
    <title>Pack-Man Help</title>
    <style>
        ${this._getCSS(theme)}
    </style>
</head>
<body class="${theme}">
    <div class="container">
        ${this._generateLinksSection()}
        ${this._generateVersionSection()}
    </div>
    <script>
        ${this._getJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Generates help links section HTML
     */
    private _generateLinksSection(): string {
        const linksHtml = this._helpLinks.map(link => `
            <a 
                class="help-link" 
                href="#" 
                onclick="openLink('${this._escapeHtml(link.url)}')"
                aria-label="${this._escapeHtml(link.label)}"
            >
                <span class="link-icon">${this._getIcon(link.icon)}</span>
                <div class="link-content">
                    <span class="link-label">${this._escapeHtml(link.label)}</span>
                    ${link.description ? `<span class="link-description">${this._escapeHtml(link.description)}</span>` : ''}
                </div>
                <span class="link-arrow">${this._getExternalIcon()}</span>
            </a>
        `).join('');

        return `
        <section class="help-section">
            <h3 class="section-title">Resources</h3>
            <div class="links-container">
                ${linksHtml}
            </div>
        </section>`;
    }


    /**
     * Generates version section HTML
     */
    private _generateVersionSection(): string {
        return `
        <section class="help-section version-section">
            <div class="version-info">
                <span class="version-label">Pack-Man Extension</span>
                <span class="version-number">v${this._escapeHtml(this._extensionVersion)}</span>
            </div>
        </section>`;
    }

    /**
     * Gets an icon SVG by name
     */
    private _getIcon(name: string): string {
        switch (name) {
            case 'book':
                return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                </svg>`;
            case 'history':
                return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022l-.074.997zm2.004.45a7.003 7.003 0 0 0-.985-.299l.219-.976c.383.086.76.2 1.126.342l-.36.933zm1.37.71a7.01 7.01 0 0 0-.439-.27l.493-.87a8.025 8.025 0 0 1 .979.654l-.615.789a6.996 6.996 0 0 0-.418-.302zm1.834 1.79a6.99 6.99 0 0 0-.653-.796l.724-.69c.27.285.52.59.747.91l-.818.576zm.744 1.352a7.08 7.08 0 0 0-.214-.468l.893-.45a7.976 7.976 0 0 1 .45 1.088l-.95.313a7.023 7.023 0 0 0-.179-.483zm.53 2.507a6.991 6.991 0 0 0-.1-1.025l.985-.17c.067.386.106.778.116 1.17l-1 .025zm-.131 1.538c.033-.17.06-.339.081-.51l.993.123a7.957 7.957 0 0 1-.23 1.155l-.964-.267c.046-.165.086-.332.12-.501zm-.952 2.379c.184-.29.346-.594.486-.908l.914.405c-.16.36-.345.706-.555 1.038l-.845-.535zm-.964 1.205c.122-.122.239-.248.35-.378l.758.653a8.073 8.073 0 0 1-.401.432l-.707-.707z"/>
                    <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0v1z"/>
                    <path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5z"/>
                </svg>`;
            case 'bug':
                return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.355.522a.5.5 0 0 1 .623.333l.291.956A4.979 4.979 0 0 1 8 1c1.007 0 1.946.298 2.731.811l.29-.956a.5.5 0 1 1 .957.29l-.41 1.352A4.985 4.985 0 0 1 13 6h.5a.5.5 0 0 0 .5-.5V5a.5.5 0 0 1 1 0v.5A1.5 1.5 0 0 1 13.5 7H13v1h1.5a.5.5 0 0 1 0 1H13v1h.5a1.5 1.5 0 0 1 1.5 1.5v.5a.5.5 0 1 1-1 0v-.5a.5.5 0 0 0-.5-.5H13a5 5 0 0 1-10 0h-.5a.5.5 0 0 0-.5.5v.5a.5.5 0 1 1-1 0v-.5A1.5 1.5 0 0 1 2.5 10H3V9H1.5a.5.5 0 0 1 0-1H3V7h-.5A1.5 1.5 0 0 1 1 5.5V5a.5.5 0 0 1 1 0v.5a.5.5 0 0 0 .5.5H3a5 5 0 0 1 1.432-3.503l-.41-1.352a.5.5 0 0 1 .333-.623zM4 7v4a4 4 0 0 0 3.5 3.97V7H4zm4.5 0v7.97A4 4 0 0 0 12 11V7H8.5zM12 6a3.989 3.989 0 0 0-1.334-2.982A3.983 3.983 0 0 0 8 2a3.983 3.983 0 0 0-2.667 1.018A3.989 3.989 0 0 0 4 6h8z"/>
                </svg>`;
            case 'heart':
                return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path fill-rule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/>
                </svg>`;
            default:
                return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                    <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
                </svg>`;
        }
    }

    /**
     * Gets the external link icon SVG
     */
    private _getExternalIcon(): string {
        return `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
            <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
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
                gap: 16px;
                height: 100%;
                overflow-y: auto;
                padding-bottom: 8px;
            }

            .help-section {
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

            .links-container {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .help-link {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                border-radius: 8px;
                text-decoration: none;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
                transition: background-color 0.15s;
                cursor: pointer;
            }

            .help-link:hover {
                background-color: var(--vscode-list-hoverBackground, ${isDark ? '#2a2d2e' : '#e8e8e8'});
            }

            .help-link:focus {
                outline: 1px solid var(--vscode-focusBorder, #007acc);
                outline-offset: -1px;
            }

            .link-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                color: var(--vscode-textLink-foreground, #3794ff);
                flex-shrink: 0;
            }

            .help-link:last-child .link-icon {
                color: #ff6b6b;
            }

            .help-link:last-child:hover .link-icon {
                color: #ff5252;
            }

            .link-icon svg {
                width: 16px;
                height: 16px;
            }

            .link-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0;
            }

            .link-label {
                font-weight: 500;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
            }

            .link-description {
                font-size: 11px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
                margin-top: 2px;
            }

            .link-arrow {
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
                opacity: 0;
                transition: opacity 0.15s;
                flex-shrink: 0;
            }

            .help-link:hover .link-arrow {
                opacity: 1;
            }

            .version-section {
                text-align: center;
                padding: 16px 12px;
            }

            .version-info {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
            }

            .version-label {
                font-size: 12px;
                color: var(--vscode-descriptionForeground, ${isDark ? '#888888' : '#717171'});
            }

            .version-number {
                font-size: 14px;
                font-weight: 600;
                color: var(--vscode-foreground, ${isDark ? '#cccccc' : '#333333'});
            }
        `;
    }

    /**
     * Gets JavaScript code for the webview
     */
    private _getJavaScript(): string {
        return `
            const vscode = acquireVsCodeApi();

            function openLink(url) {
                vscode.postMessage({
                    command: 'openLink',
                    url: url
                });
            }
        `;
    }

    /**
     * Escapes HTML special characters
     */
    private _escapeHtml(text: string): string {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m as keyof typeof map]);
    }

    /**
     * Disposes the provider
     */
    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
