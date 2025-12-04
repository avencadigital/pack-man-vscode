/**
 * Package Files Tree Provider for Pack-Man VS Code Extension
 * 
 * Provides a tree view of package files in the workspace with their
 * dependency status. Supports hierarchical display with file items
 * at root level and package items as children.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import * as vscode from 'vscode';
import { AnalysisService, AnalysisResult, PackageAnalysis } from '../services/analysisService';

/**
 * Status types for tree items
 */
export type TreeItemStatus = 'healthy' | 'outdated' | 'error' | 'unknown';

/**
 * Tree item types
 */
export type TreeItemType = 'file' | 'package';

/**
 * PackageTreeItem represents a node in the package files tree.
 * Can be either a file node (root level) or a package node (child level).
 */
export class PackageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly type: TreeItemType,
        public readonly name: string,
        public readonly status: TreeItemStatus,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly uri?: vscode.Uri,
        public readonly currentVersion?: string,
        public readonly latestVersion?: string,
        public readonly registry?: 'npm' | 'pypi' | 'pub'
    ) {
        super(name, collapsibleState);

        // Set icon based on status
        this.iconPath = this.getStatusIcon();

        // Set description (version info for packages, path for files)
        if (type === 'package' && currentVersion) {
            if (status === 'outdated' && latestVersion) {
                this.description = `${currentVersion} → ${latestVersion}`;
            } else {
                this.description = currentVersion;
            }
        } else if (type === 'file' && uri) {
            // Show relative path for files
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (workspaceFolder) {
                const relativePath = vscode.workspace.asRelativePath(uri, false);
                const dirPath = relativePath.split(/[\\/]/).slice(0, -1).join('/');
                if (dirPath) {
                    this.description = dirPath;
                }
            }
        }

        // Set command to open file (for file items)
        if (type === 'file' && uri) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [uri]
            };
        }

        // Set tooltip
        this.tooltip = this.getTooltip();

        // Set context value for context menu
        this.contextValue = `packman.${type}.${status}`;
    }

    /**
     * Gets the appropriate icon for the item's status
     */
    private getStatusIcon(): vscode.ThemeIcon {
        switch (this.status) {
            case 'healthy':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case 'outdated':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
            case 'error':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }

    /**
     * Gets the tooltip text for the item
     */
    private getTooltip(): string {
        if (this.type === 'file') {
            const statusText = this.getStatusText();
            return `${this.name}\nStatus: ${statusText}`;
        } else {
            let tooltip = this.name;
            if (this.currentVersion) {
                tooltip += `\nCurrent: ${this.currentVersion}`;
            }
            if (this.latestVersion && this.status === 'outdated') {
                tooltip += `\nLatest: ${this.latestVersion}`;
            }
            if (this.registry) {
                tooltip += `\nRegistry: ${this.registry}`;
            }
            return tooltip;
        }
    }

    /**
     * Gets human-readable status text
     */
    private getStatusText(): string {
        switch (this.status) {
            case 'healthy':
                return 'All packages up to date';
            case 'outdated':
                return 'Has outdated packages';
            case 'error':
                return 'Has errors';
            default:
                return 'Unknown';
        }
    }
}


/**
 * PackageFilesTreeProvider implements TreeDataProvider to display
 * package files and their dependencies in the Activity Bar sidebar.
 */
export class PackageFilesTreeProvider implements vscode.TreeDataProvider<PackageTreeItem> {
    public static readonly viewType = 'packman.packageFiles';

    private _onDidChangeTreeData: vscode.EventEmitter<PackageTreeItem | undefined | null | void> =
        new vscode.EventEmitter<PackageTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _analysisService: AnalysisService;
    private _disposables: vscode.Disposable[] = [];
    private _fileWatchers: vscode.FileSystemWatcher[] = [];

    constructor(analysisService: AnalysisService) {
        this._analysisService = analysisService;

        // Subscribe to analysis updates for real-time refresh
        this._disposables.push(
            this._analysisService.onAnalysisUpdate(() => {
                this.refresh();
            })
        );

        // Set up file system watchers for package files
        this._setupFileWatchers();
    }

    /**
     * Refreshes the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the tree item for display
     * @param element The tree item element
     * @returns The tree item for VS Code to display
     */
    public getTreeItem(element: PackageTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Gets children for a tree item
     * @param element Parent element (undefined for root)
     * @returns Array of child tree items
     */
    public async getChildren(element?: PackageTreeItem): Promise<PackageTreeItem[]> {
        if (!element) {
            // Root level: return file items
            return this._getFileItems();
        } else if (element.type === 'file' && element.uri) {
            // File level: return package items
            return this._getPackageItems(element.uri);
        }

        return [];
    }

    /**
     * Gets file items for the root level of the tree
     * @returns Array of file tree items
     */
    private async _getFileItems(): Promise<PackageTreeItem[]> {
        const items: PackageTreeItem[] = [];
        const cachedResults = this._analysisService.getAllCachedResults();

        // If we have cached results, use them
        if (cachedResults.length > 0) {
            for (const result of cachedResults) {
                const item = this._createFileItem(result);
                items.push(item);
            }
        } else {
            // No cached results, find package files in workspace
            const packageFiles = await this._findPackageFiles();

            for (const uri of packageFiles) {
                const fileName = uri.fsPath.split(/[\\/]/).pop() || 'Unknown';
                const item = new PackageTreeItem(
                    'file',
                    fileName,
                    'unknown',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    uri
                );
                items.push(item);
            }
        }

        // Sort items by name
        items.sort((a, b) => a.name.localeCompare(b.name));

        return items;
    }

    /**
     * Creates a file tree item from an analysis result
     * @param result Analysis result for the file
     * @returns File tree item
     */
    private _createFileItem(result: AnalysisResult): PackageTreeItem {
        const fileName = result.uri.fsPath.split(/[\\/]/).pop() || 'Unknown';
        const status = this._determineFileStatus(result);
        const hasPackages = result.packages.length > 0;

        return new PackageTreeItem(
            'file',
            fileName,
            status,
            hasPackages ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            result.uri
        );
    }

    /**
     * Determines the overall status of a file based on its packages
     * @param result Analysis result
     * @returns File status
     */
    private _determineFileStatus(result: AnalysisResult): TreeItemStatus {
        if (result.statistics.errors > 0) {
            return 'error';
        }
        if (result.statistics.outdated > 0) {
            return 'outdated';
        }
        if (result.statistics.upToDate > 0) {
            return 'healthy';
        }
        return 'unknown';
    }

    /**
     * Gets package items for a file
     * @param uri File URI
     * @returns Array of package tree items
     */
    private _getPackageItems(uri: vscode.Uri): PackageTreeItem[] {
        const result = this._analysisService.getCachedResult(uri);

        if (!result || result.packages.length === 0) {
            return [];
        }

        return result.packages.map(pkg => this._createPackageItem(pkg));
    }

    /**
     * Creates a package tree item from a package analysis
     * @param pkg Package analysis data
     * @returns Package tree item
     */
    private _createPackageItem(pkg: PackageAnalysis): PackageTreeItem {
        const status = this._mapPackageStatus(pkg.status);

        return new PackageTreeItem(
            'package',
            pkg.name,
            status,
            vscode.TreeItemCollapsibleState.None,
            undefined,
            pkg.currentVersion,
            pkg.latestVersion,
            pkg.registry
        );
    }

    /**
     * Maps package analysis status to tree item status
     * @param status Package analysis status
     * @returns Tree item status
     */
    private _mapPackageStatus(status: 'up-to-date' | 'outdated' | 'error'): TreeItemStatus {
        switch (status) {
            case 'up-to-date':
                return 'healthy';
            case 'outdated':
                return 'outdated';
            case 'error':
                return 'error';
            default:
                return 'unknown';
        }
    }

    /**
     * Finds all package files in the workspace
     * @returns Array of package file URIs
     */
    private async _findPackageFiles(): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];

        // Find package.json files
        const packageJsonFiles = await vscode.workspace.findFiles(
            '**/package.json',
            '**/node_modules/**'
        );
        files.push(...packageJsonFiles);

        // Find requirements.txt files
        const requirementsTxtFiles = await vscode.workspace.findFiles(
            '**/requirements.txt',
            '**/node_modules/**'
        );
        files.push(...requirementsTxtFiles);

        // Find pubspec.yaml files
        const pubspecYamlFiles = await vscode.workspace.findFiles(
            '**/pubspec.yaml',
            '**/node_modules/**'
        );
        files.push(...pubspecYamlFiles);

        return files;
    }

    /**
     * Sets up file system watchers for package files
     * Refreshes tree when package files are added/removed
     */
    private _setupFileWatchers(): void {
        // Watch for package.json files
        const packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
        packageJsonWatcher.onDidCreate(() => this.refresh());
        packageJsonWatcher.onDidDelete(() => this.refresh());
        this._fileWatchers.push(packageJsonWatcher);

        // Watch for requirements.txt files
        const requirementsTxtWatcher = vscode.workspace.createFileSystemWatcher('**/requirements.txt');
        requirementsTxtWatcher.onDidCreate(() => this.refresh());
        requirementsTxtWatcher.onDidDelete(() => this.refresh());
        this._fileWatchers.push(requirementsTxtWatcher);

        // Watch for pubspec.yaml files
        const pubspecYamlWatcher = vscode.workspace.createFileSystemWatcher('**/pubspec.yaml');
        pubspecYamlWatcher.onDidCreate(() => this.refresh());
        pubspecYamlWatcher.onDidDelete(() => this.refresh());
        this._fileWatchers.push(pubspecYamlWatcher);
    }

    /**
     * Disposes the provider and cleans up resources
     */
    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];

        this._fileWatchers.forEach(w => w.dispose());
        this._fileWatchers = [];

        this._onDidChangeTreeData.dispose();
    }
}
