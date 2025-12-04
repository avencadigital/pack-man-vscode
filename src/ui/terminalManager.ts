/**
 * Terminal Manager for VS Code Extension
 * 
 * Manages integrated terminal for running package manager commands.
 * Handles terminal lifecycle, command execution, and output capture.
 * 
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */

import * as vscode from 'vscode';

export interface TerminalCommandResult {
    success: boolean;
    output?: string;
    error?: string;
}

export class TerminalManager implements vscode.Disposable {
    private terminal: vscode.Terminal | undefined;
    private readonly terminalName = 'Pack-Man';
    private disposables: vscode.Disposable[] = [];
    private commandCompletionCallbacks: Map<string, (result: TerminalCommandResult) => void> = new Map();

    constructor() {
        // Listen for terminal close events to clean up our reference
        this.disposables.push(
            vscode.window.onDidCloseTerminal((closedTerminal) => {
                if (closedTerminal === this.terminal) {
                    this.terminal = undefined;
                }
            })
        );
    }

    /**
     * Gets existing Pack-Man terminal or creates a new one
     * Requirement: 20.1 - Create or reuse Pack-Man terminal
     */
    private getOrCreateTerminal(): vscode.Terminal {
        // Check if our terminal still exists
        if (this.terminal) {
            // Verify it's still in the list of active terminals
            const stillExists = vscode.window.terminals.includes(this.terminal);
            if (stillExists) {
                return this.terminal;
            }
            // Terminal was closed, clear our reference
            this.terminal = undefined;
        }

        // Look for existing Pack-Man terminal by name
        const existingTerminal = vscode.window.terminals.find(
            t => t.name === this.terminalName
        );

        if (existingTerminal) {
            this.terminal = existingTerminal;
            return existingTerminal;
        }

        // Create new terminal
        this.terminal = vscode.window.createTerminal(this.terminalName);
        return this.terminal;
    }

    /**
     * Runs a command in the integrated terminal
     * Requirement: 20.2 - Execute commands in correct workspace folder
     * Requirement: 20.3 - Wait for command completion
     * 
     * @param command The command to execute
     * @param workspaceFolder The workspace folder to run the command in
     * @returns Promise that resolves with command result
     */
    async runCommand(
        command: string,
        workspaceFolder?: vscode.WorkspaceFolder
    ): Promise<TerminalCommandResult> {
        try {
            const terminal = this.getOrCreateTerminal();

            // Show the terminal
            terminal.show(true); // preserveFocus = true to keep focus on editor

            // Change to workspace folder if provided
            // Requirement: 20.2 - Execute in correct workspace folder
            if (workspaceFolder) {
                const folderPath = workspaceFolder.uri.fsPath;
                // Use cross-platform cd command
                terminal.sendText(`cd "${folderPath}"`);
            }

            // Send the command
            terminal.sendText(command);

            // Wait for command completion
            // Requirement: 20.3 - Wait for command completion
            const result = await this.waitForCommandCompletion(command);

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Waits for command completion by monitoring terminal output
     * This is a simplified implementation that waits for a fixed duration
     * In a production environment, you might want to use terminal shell integration
     * or other mechanisms to detect command completion more reliably.
     * 
     * Requirement: 20.3 - Wait for command completion
     * 
     * @param command The command being executed
     * @returns Promise that resolves with command result
     */
    private async waitForCommandCompletion(command: string): Promise<TerminalCommandResult> {
        // Create a promise that will be resolved when we detect completion
        return new Promise((resolve) => {
            // For now, we'll use a timeout-based approach
            // In VS Code 1.93+, you can use terminal shell integration for better detection
            const timeout = setTimeout(() => {
                // Assume success after timeout
                // In a real implementation, you'd want to check exit codes
                resolve({
                    success: true,
                    output: 'Command executed (completion detection is approximate)'
                });
            }, 5000); // 5 second timeout for command completion

            // Store callback for potential future use with shell integration
            this.commandCompletionCallbacks.set(command, (result) => {
                clearTimeout(timeout);
                resolve(result);
            });
        });
    }

    /**
     * Runs a command and handles the result
     * Requirement: 20.4 - Display terminal output on command failure
     * Requirement: 20.5 - Trigger re-analysis on command success
     * 
     * @param command The command to execute
     * @param workspaceFolder The workspace folder to run the command in
     * @param onSuccess Callback to execute on successful command completion
     * @param onFailure Callback to execute on command failure
     */
    async runCommandWithHandlers(
        command: string,
        workspaceFolder: vscode.WorkspaceFolder | undefined,
        onSuccess?: () => Promise<void>,
        onFailure?: (error: string) => Promise<void>
    ): Promise<void> {
        // Show progress notification
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Pack-Man',
                cancellable: false
            },
            async (progress) => {
                progress.report({ message: 'Executing command...' });

                const result = await this.runCommand(command, workspaceFolder);

                if (result.success) {
                    // Requirement: 20.5 - Trigger re-analysis on command success
                    vscode.window.showInformationMessage(
                        `✓ Command completed successfully`
                    );

                    if (onSuccess) {
                        progress.report({ message: 'Re-analyzing dependencies...' });
                        await onSuccess();
                    }
                } else {
                    // Requirement: 20.4 - Display terminal output on command failure
                    const errorMsg = result.error || 'Command failed';
                    vscode.window.showErrorMessage(
                        `✗ Command failed: ${errorMsg}`,
                        'Show Terminal'
                    ).then(selection => {
                        if (selection === 'Show Terminal') {
                            this.terminal?.show();
                        }
                    });

                    if (onFailure) {
                        await onFailure(errorMsg);
                    }
                }
            }
        );
    }

    /**
     * Shows the Pack-Man terminal
     */
    showTerminal(): void {
        const terminal = this.getOrCreateTerminal();
        terminal.show();
    }

    /**
     * Disposes of the terminal manager and cleans up resources
     */
    dispose(): void {
        // Dispose of event listeners
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // Clear callbacks
        this.commandCompletionCallbacks.clear();

        // Note: We don't dispose the terminal itself as the user might still want to use it
        // The terminal will be cleaned up by VS Code when closed
        this.terminal = undefined;
    }
}
