/**
 * Command Actions for VS Code Extension
 * 
 * Provides actions for generated update commands:
 * - Copy to Clipboard
 * - Run in Terminal
 * 
 * Requirements: 19.4, 19.5, 20.2, 20.3, 20.4, 20.5
 */

import * as vscode from 'vscode';
import { UpdateCommand } from '../services/commandGeneratorService';
import { TerminalManager } from '../ui/terminalManager';

export class CommandActions {
    private terminalManager: TerminalManager;
    private onCommandSuccess?: () => Promise<void>;

    constructor(terminalManager: TerminalManager, onCommandSuccess?: () => Promise<void>) {
        this.terminalManager = terminalManager;
        this.onCommandSuccess = onCommandSuccess;
    }

    /**
     * Copies a command to the clipboard
     * @param command The command to copy
     * @returns Promise that resolves when copy is complete
     */
    async copyToClipboard(command: UpdateCommand): Promise<void> {
        try {
            await vscode.env.clipboard.writeText(command.command);
            vscode.window.showInformationMessage(
                `✓ Copied to clipboard: ${command.command}`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(
                `Failed to copy to clipboard: ${errorMessage}`
            );
            throw error;
        }
    }

    /**
     * Runs a command in the integrated terminal
     * Requirements: 20.2 - Execute in correct workspace folder
     * Requirements: 20.3 - Wait for command completion
     * Requirements: 20.4 - Display terminal output on failure
     * Requirements: 20.5 - Trigger re-analysis on success
     * 
     * @param command The command to run
     * @param workspaceFolder The workspace folder to run the command in
     * @returns Promise that resolves when command execution is complete
     */
    async runInTerminal(
        command: UpdateCommand,
        workspaceFolder?: vscode.WorkspaceFolder
    ): Promise<void> {
        try {
            // Use TerminalManager to run command with proper handling
            await this.terminalManager.runCommandWithHandlers(
                command.command,
                workspaceFolder,
                this.onCommandSuccess, // Re-analyze on success (Requirement 20.5)
                async (error) => {
                    // Error already displayed by TerminalManager (Requirement 20.4)
                    console.error('Command execution failed:', error);
                }
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(
                `Failed to run command in terminal: ${errorMessage}`
            );
            throw error;
        }
    }

    /**
     * Shows a quick pick menu with command actions
     * @param command The command to show actions for
     * @param workspaceFolder Optional workspace folder for terminal execution
     */
    async showCommandActions(
        command: UpdateCommand,
        workspaceFolder?: vscode.WorkspaceFolder
    ): Promise<void> {
        const actions = [
            {
                label: '$(clippy) Copy to Clipboard',
                description: 'Copy the command to clipboard',
                action: 'copy'
            },
            {
                label: '$(terminal) Run in Terminal',
                description: 'Execute the command in integrated terminal',
                action: 'run'
            }
        ];

        const selected = await vscode.window.showQuickPick(actions, {
            placeHolder: `${command.command}`,
            title: 'Command Actions'
        });

        if (!selected) {
            return;
        }

        switch (selected.action) {
            case 'copy':
                await this.copyToClipboard(command);
                break;
            case 'run':
                await this.runInTerminal(command, workspaceFolder);
                break;
        }
    }
}

/**
 * Registers command action commands with VS Code
 * @param context VS Code extension context
 * @param terminalManager Terminal manager instance
 * @param onCommandSuccess Optional callback to execute after successful command execution
 */
export function registerCommandActions(
    context: vscode.ExtensionContext,
    terminalManager: TerminalManager,
    onCommandSuccess?: () => Promise<void>
): CommandActions {
    const commandActions = new CommandActions(terminalManager, onCommandSuccess);

    // Register copyCommand command
    const copyCommandCommand = vscode.commands.registerCommand(
        'packman.copyCommand',
        async (command: UpdateCommand) => {
            await commandActions.copyToClipboard(command);
        }
    );

    // Register runCommand command
    const runCommandCommand = vscode.commands.registerCommand(
        'packman.runCommand',
        async (command: UpdateCommand, workspaceFolder?: vscode.WorkspaceFolder) => {
            await commandActions.runInTerminal(command, workspaceFolder);
        }
    );

    // Register showCommandActions command
    const showCommandActionsCommand = vscode.commands.registerCommand(
        'packman.showCommandActions',
        async (command: UpdateCommand, workspaceFolder?: vscode.WorkspaceFolder) => {
            await commandActions.showCommandActions(command, workspaceFolder);
        }
    );

    context.subscriptions.push(
        copyCommandCommand,
        runCommandCommand,
        showCommandActionsCommand
    );

    return commandActions;
}
