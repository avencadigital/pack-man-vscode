/**
 * Status Bar Manager for VS Code Extension
 * 
 * Manages the status bar item that displays overall dependency health
 * across all workspace files. Subscribes to analysis updates and
 * aggregates statistics to show project-wide status.
 */

import * as vscode from 'vscode';
import { AnalysisService, AnalysisResult } from '../services/analysisService';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private analysisService: AnalysisService;
    private analysisResults: Map<string, AnalysisResult>;
    private disposables: vscode.Disposable[] = [];

    constructor(analysisService: AnalysisService) {
        this.analysisService = analysisService;
        this.analysisResults = new Map();

        // Create status bar item
        // Priority 100 places it prominently in the status bar
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        // Set command to open webview when clicked
        this.statusBarItem.command = 'packman.showAnalysis';

        // Subscribe to analysis updates
        const subscription = this.analysisService.onAnalysisUpdate((result) => {
            this.handleAnalysisUpdate(result);
        });

        this.disposables.push(subscription);

        // Initialize with current workspace state
        this.initializeWorkspaceState();

        // Show the status bar item
        this.statusBarItem.show();
    }

    /**
     * Handles analysis update events
     * @param result Analysis result for a file
     */
    private handleAnalysisUpdate(result: AnalysisResult): void {
        // Store or update result for this file
        this.analysisResults.set(result.uri.toString(), result);

        // Update status bar display
        this.updateStatusBar();
    }

    /**
     * Initializes workspace state by loading cached results
     */
    private async initializeWorkspaceState(): Promise<void> {
        try {
            // Find all package files in workspace
            const packageFiles = await this.findPackageFiles();

            // Load cached results for each file
            for (const uri of packageFiles) {
                const cachedResult = this.analysisService.getCachedResult(uri);
                if (cachedResult) {
                    this.analysisResults.set(uri.toString(), cachedResult);
                }
            }

            // Update status bar with initial state
            this.updateStatusBar();
        } catch (error) {
            console.error('Failed to initialize workspace state:', error);
        }
    }

    /**
     * Finds all package files in workspace
     */
    private async findPackageFiles(): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];

        try {
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
        } catch (error) {
            console.error('Failed to find package files:', error);
        }

        return files;
    }

    /**
     * Updates the status bar item based on aggregated statistics
     */
    private updateStatusBar(): void {
        // Aggregate statistics across all files
        const stats = this.aggregateStatistics();

        // If no files analyzed yet, show default state
        if (stats.total === 0) {
            this.statusBarItem.text = '$(package) Pack-Man';
            this.statusBarItem.tooltip = 'Pack-Man: No dependencies analyzed yet';
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.color = undefined;
            return;
        }

        // Determine status and update display
        if (stats.errors > 0) {
            // Show error state
            this.statusBarItem.text = `$(error) Dependencies: ${stats.errors} error${stats.errors > 1 ? 's' : ''}`;
            this.statusBarItem.tooltip = this.buildTooltip(stats);
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        } else if (stats.outdated > 0) {
            // Show warning state
            this.statusBarItem.text = `$(warning) Dependencies: ${stats.outdated} outdated`;
            this.statusBarItem.tooltip = this.buildTooltip(stats);
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        } else {
            // Show success state
            this.statusBarItem.text = '$(check) Dependencies: OK';
            this.statusBarItem.tooltip = this.buildTooltip(stats);
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.color = undefined;
        }
    }

    /**
     * Aggregates statistics across all workspace files
     * Uses the analysis service's aggregation method for multi-root workspace support
     */
    private aggregateStatistics(): {
        total: number;
        upToDate: number;
        outdated: number;
        errors: number;
    } {
        // Use the analysis service's aggregation method which handles multi-root workspaces
        return this.analysisService.getAggregatedStatisticsForAllFolders();
    }

    /**
     * Builds tooltip text with detailed statistics
     */
    private buildTooltip(stats: {
        total: number;
        upToDate: number;
        outdated: number;
        errors: number;
    }): string {
        const lines = [
            'Pack-Man Dependency Status',
            '',
            `Total: ${stats.total}`,
            `✓ Up-to-date: ${stats.upToDate}`,
            `⚠ Outdated: ${stats.outdated}`,
            `✗ Errors: ${stats.errors}`,
            '',
            'Click to view detailed analysis'
        ];

        return lines.join('\n');
    }

    /**
     * Clears a result for a specific file (e.g., when file is deleted)
     * @param uri URI of the file
     */
    public clearResultForFile(uri: vscode.Uri): void {
        this.analysisResults.delete(uri.toString());
        this.updateStatusBar();
    }

    /**
     * Clears all results
     */
    public clearAllResults(): void {
        this.analysisResults.clear();
        this.updateStatusBar();
    }

    /**
     * Disposes the status bar manager
     */
    public dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
        this.analysisResults.clear();
    }
}
