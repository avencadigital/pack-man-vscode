/**
 * Update Commands for VS Code Extension
 * 
 * Handles single and bulk dependency update operations.
 * Preserves file formatting and comments while updating versions.
 * 
 * Multi-root Workspace Support:
 * - Updates are isolated to the specific file URI provided
 * - File paths are verified to belong to a workspace folder
 * - Updates only affect the relevant workspace folder
 * - Each workspace folder maintains independent analysis results
 */

import * as vscode from 'vscode';
import { ParserService, PackageFileType } from '../services/parserService';
import { AnalysisService, PackageAnalysis } from '../services/analysisService';

export interface UpdateResult {
    success: boolean;
    packageName: string;
    oldVersion: string;
    newVersion: string;
    error?: string;
}

export class UpdateCommands {
    private parserService: ParserService;
    private analysisService: AnalysisService;

    constructor(parserService: ParserService, analysisService: AnalysisService) {
        this.parserService = parserService;
        this.analysisService = analysisService;
    }

    /**
     * Updates a single dependency in a package file
     * @param uri URI of the package file
     * @param packageName Name of the package to update
     * @param newVersion New version to set
     * @returns Update result
     */
    async updateDependency(
        uri: vscode.Uri,
        packageName: string,
        newVersion: string
    ): Promise<UpdateResult> {
        try {
            // Verify the file belongs to a workspace folder
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                throw new Error('File is not part of any workspace folder');
            }

            // Show progress notification
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Updating ${packageName}...`,
                    cancellable: false
                },
                async () => {
                    // Read file content
                    const document = await vscode.workspace.openTextDocument(uri);
                    const content = document.getText();

                    // Detect file type
                    const fileName = uri.fsPath.split(/[\\/]/).pop() || '';
                    const fileType = this.parserService.detectFileType(fileName);

                    if (!fileType) {
                        throw new Error(`Unsupported file type: ${fileName}`);
                    }

                    // Parse to get current version
                    const parseResult = this.parserService.parseFile(content, fileType);
                    const pkg = parseResult.packages.find(p => p.name === packageName);

                    if (!pkg) {
                        throw new Error(`Package ${packageName} not found in file`);
                    }

                    const oldVersion = pkg.version;

                    // Update version in content
                    const updatedContent = this.updateVersionInContent(
                        content,
                        fileType,
                        packageName,
                        oldVersion,
                        newVersion
                    );

                    // Write updated content back to file
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(
                        uri,
                        new vscode.Range(
                            document.positionAt(0),
                            document.positionAt(content.length)
                        ),
                        updatedContent
                    );

                    const success = await vscode.workspace.applyEdit(edit);

                    if (!success) {
                        throw new Error('Failed to apply edit to file');
                    }

                    // Save the document
                    await document.save();

                    // Trigger re-analysis
                    await this.analysisService.analyzeFile(uri);

                    return {
                        success: true,
                        packageName,
                        oldVersion,
                        newVersion
                    };
                }
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                packageName,
                oldVersion: '',
                newVersion,
                error: errorMessage
            };
        }
    }

    /**
     * Updates all outdated dependencies in a package file
     * @param uri URI of the package file
     * @returns Array of update results
     */
    async updateAllDependencies(uri: vscode.Uri): Promise<UpdateResult[]> {
        const results: UpdateResult[] = [];

        try {
            // Get analysis result to find outdated packages
            const analysisResult = await this.analysisService.analyzeFile(uri);
            const outdatedPackages = analysisResult.packages.filter(
                p => p.status === 'outdated'
            );

            if (outdatedPackages.length === 0) {
                vscode.window.showInformationMessage('No outdated dependencies found');
                return results;
            }

            // Update each outdated package with progress
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Updating dependencies...',
                    cancellable: false
                },
                async (progress) => {
                    const total = outdatedPackages.length;

                    for (let i = 0; i < outdatedPackages.length; i++) {
                        const pkg = outdatedPackages[i];

                        // Update progress
                        progress.report({
                            message: `${i + 1}/${total}: ${pkg.name}`,
                            increment: (100 / total)
                        });

                        // Update the package
                        const result = await this.updateDependency(
                            uri,
                            pkg.name,
                            pkg.latestVersion
                        );

                        results.push(result);

                        // Small delay to avoid overwhelming the system
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            );

            return results;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to update dependencies: ${errorMessage}`);
            return results;
        }
    }

    /**
     * Updates version in file content while preserving formatting
     */
    private updateVersionInContent(
        content: string,
        fileType: PackageFileType,
        packageName: string,
        oldVersion: string,
        newVersion: string
    ): string {
        switch (fileType) {
            case 'package.json':
                return this.updatePackageJsonVersion(content, packageName, oldVersion, newVersion);
            case 'requirements.txt':
                return this.updateRequirementsTxtVersion(content, packageName, oldVersion, newVersion);
            case 'pubspec.yaml':
                return this.updatePubspecYamlVersion(content, packageName, oldVersion, newVersion);
            default:
                return content;
        }
    }

    /**
     * Updates version in package.json content
     */
    private updatePackageJsonVersion(
        content: string,
        packageName: string,
        oldVersion: string,
        newVersion: string
    ): string {
        // Use regex to find and replace the version while preserving formatting
        // Matches: "packageName": "version" or "packageName": 'version'
        const pattern = new RegExp(
            `("${packageName}"\\s*:\\s*)["']${this.escapeRegex(oldVersion)}["']`,
            'g'
        );

        return content.replace(pattern, `$1"${newVersion}"`);
    }

    /**
     * Updates version in requirements.txt content
     */
    private updateRequirementsTxtVersion(
        content: string,
        packageName: string,
        oldVersion: string,
        newVersion: string
    ): string {
        const lines = content.split('\n');
        const escapedPackageName = this.escapeRegex(packageName);
        
        // Clean versions (remove any trailing whitespace/CR)
        const cleanOldVersion = oldVersion.trim();
        const cleanNewVersion = newVersion.trim();
        
        const updatedLines = lines.map(line => {
            // Remove trailing \r for comparison but preserve it for output
            const lineContent = line.replace(/\r$/, '');
            const hasCarriageReturn = line.endsWith('\r');
            
            // Skip comments and empty lines
            if (lineContent.trim().startsWith('#') || !lineContent.trim()) {
                return line;
            }

            // Match package name with version specifier (case-insensitive for package name)
            const pattern = new RegExp(`^(${escapedPackageName}\\s*[=<>~!]+\\s*)(.+)$`, 'i');
            const match = lineContent.match(pattern);
            
            if (match) {
                const prefix = match[1];
                const versionPart = match[2].trim();
                
                // Check if this line contains the old version
                if (versionPart === cleanOldVersion || versionPart.includes(cleanOldVersion)) {
                    const result = prefix + cleanNewVersion;
                    return hasCarriageReturn ? result + '\r' : result;
                }
            }
            return line;
        });

        return updatedLines.join('\n');
    }

    /**
     * Updates version in pubspec.yaml content
     */
    private updatePubspecYamlVersion(
        content: string,
        packageName: string,
        oldVersion: string,
        newVersion: string
    ): string {
        const lines = content.split('\n');
        const escapedPackageName = this.escapeRegex(packageName);
        
        // Clean versions (remove ^ prefix and any trailing whitespace/CR)
        const cleanOldVersion = oldVersion.replace(/^\^/, '').trim();
        const cleanNewVersion = newVersion.replace(/^\^/, '').trim();
        
        const updatedLines = lines.map(line => {
            // Remove trailing \r for comparison but preserve it for output
            const lineContent = line.replace(/\r$/, '');
            const hasCarriageReturn = line.endsWith('\r');
            
            // Match package name with version (handles: "pkg: ^1.0.0", "pkg: 1.0.0", "pkg: "^1.0.0"")
            const match = lineContent.match(new RegExp(`^(\\s*${escapedPackageName}:\\s*)(.+)$`));
            if (match) {
                const prefix = match[1];
                const versionPart = match[2].trim();
                
                // Determine if version has caret prefix and/or quotes
                const hasQuotes = versionPart.startsWith('"') || versionPart.startsWith("'");
                const quoteChar = hasQuotes ? versionPart[0] : '';
                const innerVersion = hasQuotes ? versionPart.slice(1, -1) : versionPart;
                const hasCaret = innerVersion.startsWith('^');
                
                // Check if this line contains the old version
                if (innerVersion.includes(cleanOldVersion)) {
                    // Build new version preserving caret if it existed
                    const newInnerVersion = hasCaret ? `^${cleanNewVersion}` : cleanNewVersion;
                    const newVersionPart = hasQuotes ? `${quoteChar}${newInnerVersion}${quoteChar}` : newInnerVersion;
                    const result = prefix + newVersionPart;
                    return hasCarriageReturn ? result + '\r' : result;
                }
            }
            return line;
        });

        return updatedLines.join('\n');
    }

    /**
     * Escapes special regex characters
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Verifies that a file URI is correctly resolved within its workspace folder
     * @param uri File URI to verify
     * @returns True if the file path is correctly resolved
     */
    verifyFilePathResolution(uri: vscode.Uri): boolean {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

        if (!workspaceFolder) {
            return false;
        }

        // Verify the file path starts with the workspace folder path
        const filePath = uri.fsPath;
        const folderPath = workspaceFolder.uri.fsPath;

        return filePath.startsWith(folderPath);
    }
}

/**
 * Registers update commands with VS Code
 */
export function registerUpdateCommands(
    context: vscode.ExtensionContext,
    parserService: ParserService,
    analysisService: AnalysisService
): void {
    const updateCommands = new UpdateCommands(parserService, analysisService);

    // Register updateDependency command
    const updateDependencyCommand = vscode.commands.registerCommand(
        'packman.updateDependency',
        async (uri: vscode.Uri, packageName: string, newVersion: string) => {
            const result = await updateCommands.updateDependency(uri, packageName, newVersion);

            if (result.success) {
                vscode.window.showInformationMessage(
                    `✓ Updated ${result.packageName} from ${result.oldVersion} to ${result.newVersion}`
                );
            } else {
                vscode.window.showErrorMessage(
                    `✗ Failed to update ${result.packageName}: ${result.error}`
                );
            }
        }
    );

    // Register updateAll command
    const updateAllCommand = vscode.commands.registerCommand(
        'packman.updateAll',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const uri = editor.document.uri;
            const results = await updateCommands.updateAllDependencies(uri);

            // Show summary
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;

            if (results.length === 0) {
                return; // Already showed message in updateAllDependencies
            }

            if (failed === 0) {
                vscode.window.showInformationMessage(
                    `✓ Successfully updated ${successful} ${successful === 1 ? 'dependency' : 'dependencies'}`
                );
            } else {
                vscode.window.showWarningMessage(
                    `Updated ${successful} ${successful === 1 ? 'dependency' : 'dependencies'}, ${failed} failed`
                );
            }
        }
    );

    context.subscriptions.push(updateDependencyCommand, updateAllCommand);
}
