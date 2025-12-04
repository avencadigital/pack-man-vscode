/**
 * Analysis Commands for VS Code Extension
 * 
 * Handles manual dependency analysis operations via command palette.
 * Provides progress feedback and error handling with troubleshooting guidance.
 */

import * as vscode from 'vscode';
import { AnalysisService } from '../services/analysisService';
import {
    showAuthenticationErrorPrompt,
    showInvalidTokenPrompt,
    showRateLimitPrompt,
    showNetworkErrorPrompt
} from './tokenCommands';

export class AnalysisCommands {
    private analysisService: AnalysisService;
    private context: vscode.ExtensionContext;

    constructor(analysisService: AnalysisService, context: vscode.ExtensionContext) {
        this.analysisService = analysisService;
        this.context = context;
    }

    /**
     * Analyzes dependencies in the active package file
     * Implements Requirements 9.1, 9.3
     */
    async analyzeDependencies(): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showWarningMessage('No active editor. Please open a package file (package.json, requirements.txt, or pubspec.yaml)');
            return;
        }

        const uri = editor.document.uri;
        const fileName = uri.fsPath.split(/[\\/]/).pop() || '';

        // Check if it's a supported package file
        if (!this.isPackageFile(fileName)) {
            vscode.window.showWarningMessage(
                `Unsupported file type: ${fileName}. Pack-Man supports package.json, requirements.txt, and pubspec.yaml files.`
            );
            return;
        }

        try {
            // Show progress notification during analysis
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Analyzing dependencies in ${fileName}...`,
                    cancellable: false
                },
                async () => {
                    const result = await this.analysisService.analyzeFile(uri);

                    // Show success message with statistics
                    const { total, upToDate, outdated, errors } = result.statistics;

                    if (total === 0) {
                        vscode.window.showInformationMessage('No dependencies found in file');
                    } else if (errors > 0 && total === errors) {
                        // All packages had errors
                        vscode.window.showErrorMessage(
                            `Analysis failed for all ${total} ${total === 1 ? 'dependency' : 'dependencies'}. Check the Problems panel for details.`
                        );
                    } else {
                        // Show summary
                        const parts: string[] = [];
                        if (upToDate > 0) {
                            parts.push(`${upToDate} up-to-date`);
                        }
                        if (outdated > 0) {
                            parts.push(`${outdated} outdated`);
                        }
                        if (errors > 0) {
                            parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
                        }

                        const message = `Analysis complete: ${parts.join(', ')}`;

                        if (outdated > 0 || errors > 0) {
                            vscode.window.showWarningMessage(message);
                        } else {
                            vscode.window.showInformationMessage(message);
                        }
                    }
                }
            );
        } catch (error) {
            this.handleAnalysisError(error, fileName);
        }
    }

    /**
     * Analyzes all package files in the workspace
     * Implements Requirements 9.2, 9.3
     */
    async analyzeWorkspace(): Promise<void> {
        try {
            // Show progress notification during workspace analysis
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Analyzing workspace dependencies...',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ message: 'Finding package files...' });

                    const result = await this.analysisService.analyzeWorkspace();

                    if (result.results.length === 0) {
                        vscode.window.showInformationMessage(
                            'No package files found in workspace. Pack-Man supports package.json, requirements.txt, and pubspec.yaml files.'
                        );
                        return;
                    }

                    // Show summary of workspace analysis
                    const { total, upToDate, outdated, errors } = result.aggregatedStatistics;
                    const fileCount = result.results.length;

                    if (total === 0) {
                        vscode.window.showInformationMessage(
                            `Analyzed ${fileCount} ${fileCount === 1 ? 'file' : 'files'}, no dependencies found`
                        );
                    } else {
                        const parts: string[] = [];
                        if (upToDate > 0) {
                            parts.push(`${upToDate} up-to-date`);
                        }
                        if (outdated > 0) {
                            parts.push(`${outdated} outdated`);
                        }
                        if (errors > 0) {
                            parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
                        }

                        const message = `Workspace analysis complete (${fileCount} ${fileCount === 1 ? 'file' : 'files'}): ${parts.join(', ')}`;

                        if (outdated > 0 || errors > 0) {
                            vscode.window.showWarningMessage(message);
                        } else {
                            vscode.window.showInformationMessage(message);
                        }
                    }
                }
            );
        } catch (error) {
            this.handleAnalysisError(error, 'workspace');
        }
    }

    /**
     * Handles analysis errors with troubleshooting guidance
     * Implements Requirements 9.5, 16.5, 11.3, 11.4, 11.5, 16.3, 16.4
     */
    private async handleAnalysisError(error: unknown, context: string): Promise<void> {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        console.error(`Analysis error for ${context}:`, error);

        // Determine error type and provide specific guidance
        if (errorMessage.includes('Authentication failed')) {
            // Check if token exists
            const existingToken = await this.context.secrets.get('packman.githubToken');

            if (existingToken) {
                // Token exists but is invalid
                await showInvalidTokenPrompt(this.context);
            } else {
                // No token configured
                await showAuthenticationErrorPrompt(this.context);
            }
        } else if (errorMessage.includes('Rate limit exceeded')) {
            // Rate limit error
            await showRateLimitPrompt(this.context);
        } else if (errorMessage.includes('Unable to reach API endpoint') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ENETUNREACH') ||
            errorMessage.includes('EHOSTUNREACH') ||
            errorMessage.includes('EAI_AGAIN') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('ECONNABORTED') ||
            errorMessage.includes('Network is unreachable') ||
            errorMessage.includes('DNS lookup failed') ||
            errorMessage.includes('Connection refused')) {
            // Network connectivity issue - Implements Requirement 16.4
            await showNetworkErrorPrompt();
        } else if (errorMessage.includes('parse') || errorMessage.includes('syntax')) {
            // Parse error
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to parse file. ${errorMessage}`,
                'View Problems'
            ).then(selection => {
                if (selection === 'View Problems') {
                    vscode.commands.executeCommand('workbench.action.problems.focus');
                }
            });
        } else {
            // Generic error
            vscode.window.showErrorMessage(
                `Pack-Man: Analysis failed. ${errorMessage}`,
                'View Output',
                'Report Issue'
            ).then(selection => {
                if (selection === 'View Output') {
                    vscode.window.showInformationMessage(
                        'Troubleshooting steps:\n' +
                        '1. Check the Output panel for detailed logs\n' +
                        '2. Verify the file format is correct\n' +
                        '3. Try analyzing a different file\n' +
                        '4. Check the API endpoint configuration\n' +
                        '5. Restart VS Code if the issue persists'
                    );
                } else if (selection === 'Report Issue') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/pack-man/issues'));
                }
            });
        }
    }

    /**
     * Checks if a file is a supported package file
     */
    private isPackageFile(fileName: string): boolean {
        return fileName === 'package.json' ||
            fileName === 'requirements.txt' ||
            fileName === 'pubspec.yaml';
    }
}

/**
 * Registers analysis commands with VS Code
 */
export function registerAnalysisCommands(
    context: vscode.ExtensionContext,
    analysisService: AnalysisService
): void {
    const analysisCommands = new AnalysisCommands(analysisService, context);

    // Register analyzeDependencies command
    const analyzeDependenciesCommand = vscode.commands.registerCommand(
        'packman.analyzeDependencies',
        () => analysisCommands.analyzeDependencies()
    );

    // Register analyzeWorkspace command
    const analyzeWorkspaceCommand = vscode.commands.registerCommand(
        'packman.analyzeWorkspace',
        () => analysisCommands.analyzeWorkspace()
    );

    context.subscriptions.push(
        analyzeDependenciesCommand,
        analyzeWorkspaceCommand
    );

    console.log('Analysis commands registered');
}
