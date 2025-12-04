/**
 * Diagnostic Provider for Pack-Man VS Code Extension
 * 
 * Reports dependency issues in the VS Code Problems panel.
 * Creates warning diagnostics for outdated dependencies and
 * error diagnostics for packages with errors.
 */

import * as vscode from 'vscode';
import { AnalysisService, AnalysisResult, PackageAnalysis } from '../services/analysisService';
import { getChangeTypeDescription, getSeverityDescription } from '../utils/versionUtils';

export class DependencyDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private analysisService: AnalysisService;
    private disposables: vscode.Disposable[] = [];

    constructor(analysisService: AnalysisService) {
        this.analysisService = analysisService;

        // Create diagnostic collection
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('packman');

        // Subscribe to analysis updates
        this.disposables.push(
            this.analysisService.onAnalysisUpdate((result) => {
                this.updateDiagnostics(result.uri, result);
            })
        );

        // Listen for configuration changes to refresh diagnostics
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('packman.showDiagnostics') ||
                    e.affectsConfiguration('packman.showInlineWarnings')) {
                    this.refreshAllDiagnostics();
                }
            })
        );
    }

    /**
     * Refreshes diagnostics for all cached analysis results
     */
    private refreshAllDiagnostics(): void {
        // Get all cached results and re-apply diagnostics
        const cachedResults = this.analysisService.getAllCachedResults();
        for (const result of cachedResults) {
            this.updateDiagnostics(result.uri, result);
        }
    }

    /**
     * Updates diagnostics for a document
     * @param uri Document URI
     * @param result Analysis result
     */
    updateDiagnostics(uri: vscode.Uri, result: AnalysisResult): void {
        // Check if diagnostics are enabled in settings
        const config = vscode.workspace.getConfiguration('packman');
        const showDiagnostics = config.get<boolean>('showDiagnostics', true);
        const showInlineWarnings = config.get<boolean>('showInlineWarnings', true);

        if (!showDiagnostics) {
            // Clear diagnostics if disabled
            this.diagnosticCollection.delete(uri);
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];

        // Create diagnostics for each package with issues
        for (const pkg of result.packages) {
            const diagnostic = this.createDiagnostic(pkg, showInlineWarnings);
            if (diagnostic) {
                diagnostics.push(diagnostic);
            }
        }

        // Update diagnostic collection
        if (diagnostics.length > 0) {
            this.diagnosticCollection.set(uri, diagnostics);
        } else {
            // Clear diagnostics if all dependencies are up-to-date
            this.diagnosticCollection.delete(uri);
        }
    }

    /**
     * Creates a diagnostic for a package
     * @param pkg Package analysis data
     * @param showInlineWarnings Whether to show inline squiggly lines
     * @returns Diagnostic or undefined if no issue
     */
    private createDiagnostic(pkg: PackageAnalysis, showInlineWarnings: boolean = true): vscode.Diagnostic | undefined {
        // Only create diagnostics for outdated or error packages
        if (pkg.status === 'up-to-date') {
            return undefined;
        }

        // Create range for the diagnostic (entire line)
        const range = new vscode.Range(
            pkg.line - 1, // Convert to 0-based line number
            0,
            pkg.line - 1,
            999 // End of line
        );

        // Create diagnostic message
        const message = this.createDiagnosticMessage(pkg);

        // Determine severity based on update criticality
        let severity: vscode.DiagnosticSeverity;

        if (!showInlineWarnings) {
            // Use Hint severity to show in Problems panel without squiggly lines
            severity = vscode.DiagnosticSeverity.Hint;
        } else if (pkg.status === 'error') {
            severity = vscode.DiagnosticSeverity.Error;
        } else if (pkg.updateSeverity === 'critical') {
            // Critical updates (major versions) shown as errors to draw attention
            severity = vscode.DiagnosticSeverity.Error;
        } else if (pkg.updateSeverity === 'important') {
            // Important updates shown as warnings
            severity = vscode.DiagnosticSeverity.Warning;
        } else {
            // Normal updates shown as information
            severity = vscode.DiagnosticSeverity.Information;
        }

        // Create diagnostic
        const diagnostic = new vscode.Diagnostic(range, message, severity);

        // Set source
        diagnostic.source = 'Pack-Man';

        // Add code for potential quick fixes
        diagnostic.code = pkg.status === 'outdated' ? 'outdated-dependency' : 'dependency-error';

        return diagnostic;
    }

    /**
     * Creates diagnostic message for a package
     * @param pkg Package analysis data
     * @returns Diagnostic message
     */
    private createDiagnosticMessage(pkg: PackageAnalysis): string {
        if (pkg.status === 'outdated') {
            // Add colored emoji based on severity
            let severityPrefix = '';
            if (pkg.updateSeverity === 'critical') {
                severityPrefix = '🔴 | 🛑⚠️ | ';
            } else if (pkg.updateSeverity === 'important') {
                severityPrefix = '🟡 | ⚠️ ';
            } else if (pkg.updateSeverity === 'normal') {
                severityPrefix = '🟢 | ';
            }

            let message = `${severityPrefix}${pkg.name}: Update available (${pkg.currentVersion} → ${pkg.latestVersion})`;

            // Add change type information
            if (pkg.changeType) {
                message += ` - ${getChangeTypeDescription(pkg.changeType)}`;
            }

            // Add severity label for critical/important updates
            if (pkg.updateSeverity === 'critical') {
                message += ' [CRITICAL]';
            } else if (pkg.updateSeverity === 'important') {
                message += ' [IMPORTANT]';
            }

            return message;
        } else if (pkg.status === 'error') {
            const errorMsg = pkg.error || 'Error analyzing package';
            return `❌ ${pkg.name}: ${errorMsg}`;
        }

        return `❓ ${pkg.name}: Unknown issue`;
    }

    /**
     * Clears all diagnostics
     */
    clear(): void {
        this.diagnosticCollection.clear();
    }

    /**
     * Clears diagnostics for a specific URI
     * @param uri Document URI
     */
    clearForUri(uri: vscode.Uri): void {
        this.diagnosticCollection.delete(uri);
    }

    /**
     * Disposes the diagnostic provider
     */
    dispose(): void {
        this.diagnosticCollection.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
