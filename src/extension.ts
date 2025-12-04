import * as vscode from 'vscode';
import { CacheService } from './services/cacheService';
import { ParserService } from './services/parserService';
import { APIClientService } from './services/apiClientService';
import { AnalysisService } from './services/analysisService';
import { DependencyCodeLensProvider } from './providers/codeLensProvider';
import { DependencyHoverProvider } from './providers/hoverProvider';
import { DependencyDiagnosticProvider } from './providers/diagnosticProvider';
import { StatusBarManager } from './ui/statusBarManager';
import { WebviewManager } from './ui/webviewManager';
import { TerminalManager } from './ui/terminalManager';
import { registerUpdateCommands } from './commands/updateCommands';
import { registerAnalysisCommands } from './commands/analysisCommands';
import { registerCommandActions } from './commands/commandActions';
import { registerTokenCommands } from './commands/tokenCommands';
import { CommandGeneratorService } from './services/commandGeneratorService';
import { MainViewProvider } from './views/mainViewProvider';

// Global services that need to be accessible across the extension
let cacheService: CacheService;
let apiClientService: APIClientService;
let parserService: ParserService;
let analysisService: AnalysisService;
let commandGeneratorService: CommandGeneratorService;
let terminalManager: TerminalManager;

/**
 * Extension activation function
 * Called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('Pack-Man extension is now active');

    // Initialize services
    cacheService = new CacheService();
    parserService = new ParserService();
    commandGeneratorService = new CommandGeneratorService();

    // Get initial configuration
    const config = vscode.workspace.getConfiguration('packman');
    const apiEndpoint = config.get<string>('apiEndpoint', 'https://pack-man.tech');

    apiClientService = new APIClientService(cacheService, apiEndpoint);
    analysisService = new AnalysisService(apiClientService, parserService);

    // Set up GitHub token from SecretStorage
    initializeGitHubToken(context).catch(error => {
        console.error('Failed to initialize GitHub token:', error);
    });

    // Set up configuration watchers
    setupConfigurationWatchers(context);

    // Register CodeLens provider
    const codeLensProvider = new DependencyCodeLensProvider(analysisService, parserService);
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        [
            { language: 'json', pattern: '**/package.json' },
            { language: 'plaintext', pattern: '**/requirements.txt' },
            { language: 'pip-requirements', pattern: '**/requirements.txt' },
            { pattern: '**/requirements.txt' },  // Fallback for any language
            { language: 'yaml', pattern: '**/pubspec.yaml' }
        ],
        codeLensProvider
    );
    context.subscriptions.push(codeLensDisposable, codeLensProvider);

    // Register Hover provider
    const hoverProvider = new DependencyHoverProvider(analysisService, parserService);
    const hoverDisposable = vscode.languages.registerHoverProvider(
        [
            { language: 'json', pattern: '**/package.json' },
            { language: 'plaintext', pattern: '**/requirements.txt' },
            { language: 'pip-requirements', pattern: '**/requirements.txt' },
            { pattern: '**/requirements.txt' },  // Fallback for any language
            { language: 'yaml', pattern: '**/pubspec.yaml' }
        ],
        hoverProvider
    );
    context.subscriptions.push(hoverDisposable);

    // Register Diagnostic provider
    const diagnosticProvider = new DependencyDiagnosticProvider(analysisService);
    context.subscriptions.push(diagnosticProvider);

    // Register Status Bar manager
    const statusBarManager = new StatusBarManager(analysisService);
    context.subscriptions.push(statusBarManager);

    // Register Webview manager
    const webviewManager = new WebviewManager(analysisService, context);
    context.subscriptions.push(webviewManager);

    // Register Terminal manager
    terminalManager = new TerminalManager();
    context.subscriptions.push(terminalManager);

    // Register Main View Provider for Activity Bar sidebar (unified tabs view)
    const mainViewProvider = new MainViewProvider(context, analysisService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MainViewProvider.viewType,
            mainViewProvider
        ),
        mainViewProvider
    );

    // Register token commands
    registerTokenCommands(context);

    // Register update commands
    registerUpdateCommands(context, parserService, analysisService);

    // Register analysis commands
    registerAnalysisCommands(context, analysisService);

    // Register command actions with terminal manager and re-analysis callback
    registerCommandActions(
        context,
        terminalManager,
        async () => {
            // Re-analyze active file after successful command execution
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const uri = activeEditor.document.uri;
                const fileName = uri.fsPath.split(/[\\/]/).pop() || '';
                const isPackageFile = fileName === 'package.json' ||
                    fileName === 'requirements.txt' ||
                    fileName === 'pubspec.yaml';

                if (isPackageFile) {
                    await analysisService.analyzeFile(uri);
                }
            }
        }
    );

    // Register showAnalysis command (with error handling for reload scenarios)
    let showAnalysisCommand;
    try {
        showAnalysisCommand = vscode.commands.registerCommand('packman.showAnalysis', async (uri?: vscode.Uri) => {
            try {
                // If no URI provided, use active editor
                const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

                if (!targetUri) {
                    vscode.window.showErrorMessage('No package file is currently open');
                    return;
                }

                // Get cached result or analyze file
                let result = analysisService.getCachedResult(targetUri);

                if (!result) {
                    // Show progress while analyzing
                    result = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: 'Analyzing dependencies...',
                            cancellable: false
                        },
                        async () => {
                            return await analysisService.analyzeFile(targetUri);
                        }
                    );
                }

                // Show webview with result
                webviewManager.showAnalysis(result);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to show analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        });
        context.subscriptions.push(showAnalysisCommand);
    } catch (error) {
        console.error('[Pack-Man] Failed to register showAnalysis command (may already exist):', error);
        // Command already exists, likely from a previous activation
        // This is fine during development with hot reload
    }

    // Set up file watchers
    console.log('[Pack-Man] Setting up file watchers...');
    setupFileWatchers(context, analysisService);

    // Set up active editor change handler (auto-analyze on file open)
    console.log('[Pack-Man] Setting up active editor handler...');
    setupActiveEditorHandler(context, analysisService);

    // Set up workspace folder event handlers
    console.log('[Pack-Man] Setting up workspace folder handlers...');
    setupWorkspaceFolderHandlers(context, analysisService);

    // Add services to subscriptions for cleanup
    context.subscriptions.push({
        dispose: () => {
            cacheService.dispose();
            analysisService.dispose();
        }
    });

    console.log('Pack-Man extension services initialized');
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export function deactivate(): void {
    console.log('Pack-Man extension is now deactivated');
    // Cleanup handled by subscriptions
}

/**
 * Initializes GitHub token from SecretStorage
 */
async function initializeGitHubToken(context: vscode.ExtensionContext): Promise<void> {
    const token = await context.secrets.get('packman.githubToken');
    if (token) {
        apiClientService.setGitHubToken(token);
        console.log('GitHub token loaded from SecretStorage');
    }
}

/**
 * Sets up configuration change watchers
 */
function setupConfigurationWatchers(context: vscode.ExtensionContext): void {
    // Watch for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(async (event) => {
        // Handle API endpoint changes
        if (event.affectsConfiguration('packman.apiEndpoint')) {
            const config = vscode.workspace.getConfiguration('packman');
            const newEndpoint = config.get<string>('apiEndpoint', 'https://pack-man.tech');

            // Validate endpoint
            if (validateApiEndpoint(newEndpoint)) {
                apiClientService.setEndpoint(newEndpoint);

                // Clear cache and trigger re-analysis
                cacheService.clear();
                analysisService.clearCache();

                vscode.window.showInformationMessage(`Pack-Man: API endpoint updated to ${newEndpoint}`);
                console.log(`API endpoint changed to: ${newEndpoint}`);
            } else {
                vscode.window.showErrorMessage(
                    'Pack-Man: Invalid API endpoint. Please provide a valid URL.',
                    'Open Settings'
                ).then(selection => {
                    if (selection === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'packman.apiEndpoint');
                    }
                });
            }
        }
    });

    // Watch for secret storage changes (GitHub token)
    context.secrets.onDidChange(async (event) => {
        if (event.key === 'packman.githubToken') {
            const token = await context.secrets.get('packman.githubToken');
            apiClientService.setGitHubToken(token);

            if (token) {
                vscode.window.showInformationMessage('Pack-Man: GitHub token updated');
                console.log('GitHub token updated');
            } else {
                vscode.window.showInformationMessage('Pack-Man: GitHub token removed');
                console.log('GitHub token removed');
            }
        }
    });

    context.subscriptions.push(configWatcher);
}

/**
 * Validates API endpoint URL
 */
function validateApiEndpoint(endpoint: string): boolean {
    try {
        const url = new URL(endpoint);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Gets the current configuration
 */
export function getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('packman');
}

/**
 * Gets the API endpoint from configuration
 */
export function getApiEndpoint(): string {
    const config = getConfiguration();
    return config.get<string>('apiEndpoint', 'https://pack-man.tech');
}

/**
 * Gets the GitHub token from SecretStorage
 */
export async function getGitHubToken(context: vscode.ExtensionContext): Promise<string | undefined> {
    return await context.secrets.get('packman.githubToken');
}

/**
 * Sets the GitHub token in SecretStorage
 */
export async function setGitHubToken(context: vscode.ExtensionContext, token: string): Promise<void> {
    await context.secrets.store('packman.githubToken', token);
}

/**
 * Clears the GitHub token from SecretStorage
 */
export async function clearGitHubToken(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete('packman.githubToken');
}

/**
 * Gets the analysis service instance
 */
export function getAnalysisService(): AnalysisService {
    return analysisService;
}

/**
 * Gets the cache service instance
 */
export function getCacheService(): CacheService {
    return cacheService;
}

/**
 * Gets the command generator service instance
 */
export function getCommandGeneratorService(): CommandGeneratorService {
    return commandGeneratorService;
}

/**
 * Gets the terminal manager instance
 */
export function getTerminalManager(): TerminalManager {
    return terminalManager;
}

/**
 * Checks if a file should be excluded based on configuration
 */
function shouldExcludeFile(uri: vscode.Uri): boolean {
    const config = vscode.workspace.getConfiguration('packman');
    const excludeFolders = config.get<string[]>('excludeFolders', [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**'
    ]);

    const filePath = uri.fsPath.replace(/\\/g, '/');

    // Check if file matches any exclude pattern
    for (const pattern of excludeFolders) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\//g, '\\/');

        const regex = new RegExp(regexPattern);

        if (regex.test(filePath)) {
            console.log(`[Pack-Man] File excluded by pattern "${pattern}": ${filePath}`);
            return true;
        }
    }

    return false;
}

/**
 * Sets up file system watchers for package files
 * Implements debouncing to prevent excessive analysis
 */
function setupFileWatchers(context: vscode.ExtensionContext, analysisService: AnalysisService): void {
    // Map to track debounce timers for each file
    const debounceTimers = new Map<string, NodeJS.Timeout>();
    const DEBOUNCE_DELAY = 300; // 300ms debounce delay

    /**
     * Handles file save events with debouncing
     */
    const handleFileSave = (uri: vscode.Uri) => {
        // Check if file should be excluded
        if (shouldExcludeFile(uri)) {
            return;
        }

        const uriString = uri.toString();

        // Clear existing timer for this file
        const existingTimer = debounceTimers.get(uriString);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new debounced timer
        const timer = setTimeout(async () => {
            try {
                console.log(`Auto-analyzing file: ${uri.fsPath}`);
                await analysisService.analyzeFile(uri);
                console.log(`Auto-analysis complete: ${uri.fsPath}`);
            } catch (error) {
                console.error(`Auto-analysis failed for ${uri.fsPath}:`, error);
            } finally {
                debounceTimers.delete(uriString);
            }
        }, DEBOUNCE_DELAY);

        debounceTimers.set(uriString, timer);
    };

    /**
     * Checks if a document is a package file
     */
    const isPackageFile = (document: vscode.TextDocument): boolean => {
        const fileName = document.uri.fsPath.split(/[\\/]/).pop() || '';
        return fileName === 'package.json' ||
            fileName === 'requirements.txt' ||
            fileName === 'pubspec.yaml';
    };

    // Watch for document save events
    const saveWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
        if (isPackageFile(document)) {
            handleFileSave(document.uri);
        }
    });

    // Create file system watchers for each package file type
    const packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
    const requirementsTxtWatcher = vscode.workspace.createFileSystemWatcher('**/requirements.txt');
    const pubspecYamlWatcher = vscode.workspace.createFileSystemWatcher('**/pubspec.yaml');

    // Handle file creation events
    const handleFileCreate = (uri: vscode.Uri) => {
        console.log(`Package file created: ${uri.fsPath}`);
        handleFileSave(uri);
    };

    // Handle file change events (for external changes)
    const handleFileChange = (uri: vscode.Uri) => {
        console.log(`Package file changed externally: ${uri.fsPath}`);
        handleFileSave(uri);
    };

    // Handle file deletion events
    const handleFileDelete = (uri: vscode.Uri) => {
        console.log(`Package file deleted: ${uri.fsPath}`);
        // Clear any pending timers
        const uriString = uri.toString();
        const existingTimer = debounceTimers.get(uriString);
        if (existingTimer) {
            clearTimeout(existingTimer);
            debounceTimers.delete(uriString);
        }
        // Clear cached result
        analysisService.clearCacheForFile(uri);
    };

    // Register event handlers for package.json
    packageJsonWatcher.onDidCreate(handleFileCreate);
    packageJsonWatcher.onDidChange(handleFileChange);
    packageJsonWatcher.onDidDelete(handleFileDelete);

    // Register event handlers for requirements.txt
    requirementsTxtWatcher.onDidCreate(handleFileCreate);
    requirementsTxtWatcher.onDidChange(handleFileChange);
    requirementsTxtWatcher.onDidDelete(handleFileDelete);

    // Register event handlers for pubspec.yaml
    pubspecYamlWatcher.onDidCreate(handleFileCreate);
    pubspecYamlWatcher.onDidChange(handleFileChange);
    pubspecYamlWatcher.onDidDelete(handleFileDelete);

    // Add watchers to subscriptions for cleanup
    context.subscriptions.push(
        saveWatcher,
        packageJsonWatcher,
        requirementsTxtWatcher,
        pubspecYamlWatcher
    );

    // Clean up timers on deactivation
    context.subscriptions.push({
        dispose: () => {
            debounceTimers.forEach(timer => clearTimeout(timer));
            debounceTimers.clear();
        }
    });

    console.log('File watchers initialized for package files');
}

/**
 * Sets up active editor change handler to auto-analyze when package files are opened
 * Implements debouncing to prevent excessive analysis
 */
function setupActiveEditorHandler(context: vscode.ExtensionContext, analysisService: AnalysisService): void {
    console.log('[Pack-Man] setupActiveEditorHandler function called');

    // Track last analyzed file to prevent duplicate analysis
    let lastAnalyzedUri: string | undefined;
    let debounceTimer: NodeJS.Timeout | undefined;
    const DEBOUNCE_DELAY = 500; // 500ms debounce delay

    /**
     * Checks if a document is a package file
     */
    const isPackageFile = (document: vscode.TextDocument): boolean => {
        const fileName = document.uri.fsPath.split(/[\\/]/).pop() || '';
        const result = fileName === 'package.json' ||
            fileName === 'requirements.txt' ||
            fileName === 'pubspec.yaml';
        console.log(`[Pack-Man] isPackageFile check: ${fileName} = ${result}`);
        return result;
    };

    /**
     * Analyzes the active editor if it's a package file
     */
    const analyzeActiveEditor = async (editor: vscode.TextEditor | undefined) => {
        console.log('[Pack-Man] analyzeActiveEditor called');

        if (!editor) {
            console.log('[Pack-Man] No active editor');
            return;
        }

        const document = editor.document;
        console.log(`[Pack-Man] Active document: ${document.uri.fsPath}`);

        if (!isPackageFile(document)) {
            console.log('[Pack-Man] Not a package file');
            return;
        }

        // Check if file should be excluded
        if (shouldExcludeFile(document.uri)) {
            console.log('[Pack-Man] File is in excluded folder');
            return;
        }

        console.log('[Pack-Man] Package file detected!');
        const uriString = document.uri.toString();

        // Check if auto-analyze is enabled
        const config = vscode.workspace.getConfiguration('packman');
        const autoAnalyze = config.get<boolean>('autoAnalyzeOnOpen', true);

        if (!autoAnalyze) {
            console.log('[Pack-Man] Auto-analyze on open is disabled');
            return;
        }

        // Skip if we just analyzed this file (within last 2 seconds)
        if (lastAnalyzedUri === uriString) {
            console.log('[Pack-Man] File was just analyzed, skipping');
            return;
        }

        console.log('[Pack-Man] Starting auto-analysis...');

        // Clear existing timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // Set new debounced timer
        debounceTimer = setTimeout(async () => {
            try {
                console.log(`[Pack-Man] Auto-analyzing opened file: ${document.uri.fsPath}`);
                lastAnalyzedUri = uriString;

                // Reset after 2 seconds to allow re-analysis if user switches away and back
                setTimeout(() => {
                    if (lastAnalyzedUri === uriString) {
                        lastAnalyzedUri = undefined;
                    }
                }, 2000);

                // Show subtle progress indicator
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Window,
                        title: 'Pack-Man: Analyzing dependencies...',
                        cancellable: false
                    },
                    async () => {
                        await analysisService.analyzeFile(document.uri);
                    }
                );

                console.log(`[Pack-Man] Auto-analysis complete: ${document.uri.fsPath}`);
            } catch (error) {
                console.error(`[Pack-Man] Auto-analysis failed for ${document.uri.fsPath}:`, error);
                // Don't show error message to avoid being intrusive
            }
        }, DEBOUNCE_DELAY);
    };

    // Analyze current active editor on activation
    console.log('[Pack-Man] Checking for active editor on activation...');
    if (vscode.window.activeTextEditor) {
        console.log(`[Pack-Man] Active editor found: ${vscode.window.activeTextEditor.document.uri.fsPath}`);
        analyzeActiveEditor(vscode.window.activeTextEditor);
    } else {
        console.log('[Pack-Man] No active editor on activation');
    }

    // Watch for active editor changes
    console.log('[Pack-Man] Registering onDidChangeActiveTextEditor listener...');
    const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
        console.log('[Pack-Man] onDidChangeActiveTextEditor event fired!');
        if (editor) {
            console.log(`[Pack-Man] New active editor: ${editor.document.uri.fsPath}`);
        } else {
            console.log('[Pack-Man] Editor closed or no editor active');
        }
        analyzeActiveEditor(editor);
    });

    context.subscriptions.push(activeEditorChangeListener);

    // Clean up timer on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
        }
    });

    console.log('[Pack-Man] Active editor handler initialized for auto-analysis on file open');
}

/**
 * Sets up workspace folder event handlers for multi-root workspace support
 * Handles workspace folder addition and removal events
 */
function setupWorkspaceFolderHandlers(context: vscode.ExtensionContext, analysisService: AnalysisService): void {
    // Handle workspace folder changes
    const workspaceFoldersChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        // Handle removed folders
        for (const removedFolder of event.removed) {
            console.log(`Workspace folder removed: ${removedFolder.uri.fsPath}`);
            analysisService.removeWorkspaceFolder(removedFolder);
        }

        // Handle added folders
        for (const addedFolder of event.added) {
            console.log(`Workspace folder added: ${addedFolder.uri.fsPath}`);

            // Find and analyze package files in the new folder
            try {
                const packageFiles = await analysisService.findPackageFilesInFolder(addedFolder);
                console.log(`Found ${packageFiles.length} package files in new workspace folder`);

                // Analyze each package file
                for (const uri of packageFiles) {
                    try {
                        await analysisService.analyzeFile(uri);
                    } catch (error) {
                        console.error(`Failed to analyze ${uri.fsPath}:`, error);
                    }
                }
            } catch (error) {
                console.error(`Failed to process new workspace folder ${addedFolder.uri.fsPath}:`, error);
            }
        }
    });

    context.subscriptions.push(workspaceFoldersChangeListener);

    console.log('Workspace folder handlers initialized');
}
