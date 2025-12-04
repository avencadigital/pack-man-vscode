/**
 * Token Commands for VS Code Extension
 * 
 * Handles GitHub token configuration, validation, and removal.
 */

import * as vscode from 'vscode';

/**
 * Registers token-related commands
 */
export function registerTokenCommands(context: vscode.ExtensionContext): void {
    // Command to configure GitHub token
    const configureTokenCommand = vscode.commands.registerCommand(
        'packman.configureGitHubToken',
        async () => {
            await configureGitHubToken(context);
        }
    );

    // Command to remove GitHub token
    const removeTokenCommand = vscode.commands.registerCommand(
        'packman.removeGitHubToken',
        async () => {
            await removeGitHubToken(context);
        }
    );

    context.subscriptions.push(configureTokenCommand, removeTokenCommand);
}

/**
 * Prompts user to configure GitHub token
 */
export async function configureGitHubToken(context: vscode.ExtensionContext): Promise<void> {
    const token = await vscode.window.showInputBox({
        prompt: 'Enter your GitHub Personal Access Token',
        password: true,
        placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value) {
                return 'Token cannot be empty';
            }
            if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
                return 'Invalid token format. GitHub tokens start with "ghp_" or "github_pat_"';
            }
            if (value.length < 40) {
                return 'Token appears to be too short. Please check your token.';
            }
            return null;
        }
    });

    if (token) {
        try {
            // Store token in SecretStorage
            await context.secrets.store('packman.githubToken', token);

            vscode.window.showInformationMessage(
                'Pack-Man: GitHub token configured successfully',
                'Learn More'
            ).then(selection => {
                if (selection === 'Learn More') {
                    vscode.env.openExternal(
                        vscode.Uri.parse('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token')
                    );
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to store GitHub token: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}

/**
 * Removes GitHub token from SecretStorage
 */
export async function removeGitHubToken(context: vscode.ExtensionContext): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
        'Are you sure you want to remove your GitHub token?',
        { modal: true },
        'Remove Token'
    );

    if (confirmation === 'Remove Token') {
        try {
            await context.secrets.delete('packman.githubToken');

            vscode.window.showInformationMessage(
                'Pack-Man: GitHub token removed successfully'
            );
        } catch (error) {
            vscode.window.showErrorMessage(
                `Pack-Man: Failed to remove GitHub token: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}

/**
 * Shows authentication error prompt with action to configure token
 */
export async function showAuthenticationErrorPrompt(context: vscode.ExtensionContext): Promise<void> {
    const selection = await vscode.window.showErrorMessage(
        'Pack-Man: Authentication failed. A GitHub token is required to access the API.',
        'Configure Token',
        'Learn More',
        'Dismiss'
    );

    if (selection === 'Configure Token') {
        await configureGitHubToken(context);
    } else if (selection === 'Learn More') {
        vscode.env.openExternal(
            vscode.Uri.parse('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token')
        );
    }
}

/**
 * Shows invalid token error prompt with action to reconfigure
 */
export async function showInvalidTokenPrompt(context: vscode.ExtensionContext): Promise<void> {
    const selection = await vscode.window.showErrorMessage(
        'Pack-Man: Your GitHub token appears to be invalid or expired. Please update your token.',
        'Update Token',
        'Remove Token',
        'Learn More'
    );

    if (selection === 'Update Token') {
        await configureGitHubToken(context);
    } else if (selection === 'Remove Token') {
        await removeGitHubToken(context);
    } else if (selection === 'Learn More') {
        vscode.env.openExternal(
            vscode.Uri.parse('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token')
        );
    }
}

/**
 * Shows rate limit error prompt with suggestion to configure token
 */
export async function showRateLimitPrompt(context: vscode.ExtensionContext): Promise<void> {
    // Check if token is already configured
    const existingToken = await context.secrets.get('packman.githubToken');

    if (existingToken) {
        // Token exists but still hit rate limit
        vscode.window.showWarningMessage(
            'Pack-Man: API rate limit exceeded. Please try again later.',
            'Learn More'
        ).then(selection => {
            if (selection === 'Learn More') {
                vscode.env.openExternal(
                    vscode.Uri.parse('https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting')
                );
            }
        });
    } else {
        // No token configured - suggest adding one
        const selection = await vscode.window.showWarningMessage(
            'Pack-Man: API rate limit exceeded. Configure a GitHub token to increase your rate limit from 60 to 5,000 requests per hour.',
            'Configure Token',
            'Learn More',
            'Dismiss'
        );

        if (selection === 'Configure Token') {
            await configureGitHubToken(context);
        } else if (selection === 'Learn More') {
            vscode.env.openExternal(
                vscode.Uri.parse('https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting')
            );
        }
    }
}

/**
 * Shows network error prompt with troubleshooting guidance
 * Implements Requirement 16.4
 */
export async function showNetworkErrorPrompt(): Promise<void> {
    const selection = await vscode.window.showErrorMessage(
        'Pack-Man: Unable to reach the API endpoint. Please check your network connection and API endpoint configuration.',
        'Troubleshoot',
        'Check Settings',
        'Retry',
        'Dismiss'
    );

    if (selection === 'Troubleshoot') {
        // Show detailed troubleshooting guidance
        const troubleshootingMessage = [
            'Pack-Man Network Troubleshooting:',
            '',
            '1. Check Network Connectivity:',
            '   • Verify you have an active internet connection',
            '   • Try accessing other websites to confirm connectivity',
            '   • Check if you\'re behind a firewall or proxy',
            '',
            '2. Verify API Endpoint Configuration:',
            '   • Default endpoint: https://pack-man.tech',
            '   • Check Settings → Extensions → Pack-Man → API Endpoint',
            '   • Ensure the endpoint URL is correct and accessible',
            '',
            '3. Check Firewall/Proxy Settings:',
            '   • Ensure VS Code can make outbound HTTPS requests',
            '   • Configure proxy settings if needed (File → Preferences → Settings → Proxy)',
            '',
            '4. Try Again Later:',
            '   • The API endpoint might be temporarily unavailable',
            '   • Wait a few minutes and retry',
            '',
            '5. Check VS Code Output:',
            '   • View → Output → Select "Pack-Man" from dropdown',
            '   • Look for detailed error messages'
        ].join('\n');

        vscode.window.showInformationMessage(
            troubleshootingMessage,
            { modal: true },
            'Check Settings',
            'Retry'
        ).then(action => {
            if (action === 'Check Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'packman.apiEndpoint');
            } else if (action === 'Retry') {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    vscode.commands.executeCommand('packman.analyzeDependencies');
                }
            }
        });
    } else if (selection === 'Check Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'packman.apiEndpoint');
    } else if (selection === 'Retry') {
        // Trigger re-analysis of active file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            vscode.commands.executeCommand('packman.analyzeDependencies');
        }
    }
}
