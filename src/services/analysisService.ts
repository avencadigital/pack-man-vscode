/**
 * Analysis Service for VS Code Extension
 * 
 * Orchestrates dependency analysis workflow by coordinating
 * parser and API client services. Manages result caching and
 * event emission for UI updates.
 */

import * as vscode from 'vscode';
import { ParserService, PackageInfo } from './parserService';
import { APIClientService, APIAnalysisResult } from './apiClientService';
import { getChangeType, getUpdateSeverity, ChangeType, UpdateSeverity } from '../utils/versionUtils';

export interface PackageAnalysis {
    name: string;
    currentVersion: string;
    latestVersion: string;
    status: 'up-to-date' | 'outdated' | 'error';
    registry: 'npm' | 'pypi' | 'pub';
    documentationUrl?: string;
    registryUrl?: string;
    error?: string;
    line: number;
    changeType?: ChangeType;
    updateSeverity?: UpdateSeverity;
}

export interface AnalysisResult {
    uri: vscode.Uri;
    packages: PackageAnalysis[];
    statistics: {
        total: number;
        upToDate: number;
        outdated: number;
        errors: number;
    };
    timestamp: number;
}

export interface WorkspaceAnalysisResult {
    results: AnalysisResult[];
    aggregatedStatistics: {
        total: number;
        upToDate: number;
        outdated: number;
        errors: number;
    };
}

export class AnalysisService {
    private parserService: ParserService;
    private apiClientService: APIClientService;
    private resultCache: Map<string, AnalysisResult>;
    private updateEmitter: vscode.EventEmitter<AnalysisResult>;
    private workspaceFolderResults: Map<string, Map<string, AnalysisResult>>; // workspace folder URI -> file URI -> result

    public readonly onAnalysisUpdate: vscode.Event<AnalysisResult>;

    constructor(apiClientService: APIClientService, parserService: ParserService) {
        this.apiClientService = apiClientService;
        this.parserService = parserService;
        this.resultCache = new Map();
        this.workspaceFolderResults = new Map();
        this.updateEmitter = new vscode.EventEmitter<AnalysisResult>();
        this.onAnalysisUpdate = this.updateEmitter.event;
    }

    /**
     * Analyzes a package file and returns results
     * @param uri URI of the package file
     * @returns Analysis result
     */
    async analyzeFile(uri: vscode.Uri): Promise<AnalysisResult> {
        try {
            // Read file content
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            // Detect file type
            const fileName = uri.fsPath.split(/[\\/]/).pop() || '';
            const fileType = this.parserService.detectFileType(fileName);

            if (!fileType) {
                throw new Error(`Unsupported file type: ${fileName}`);
            }

            // Parse file
            const parseResult = this.parserService.parseFile(content, fileType);

            if (parseResult.errors.length > 0) {
                // Return error result if parsing failed
                return this.createErrorResult(uri, parseResult.errors[0].message);
            }

            if (parseResult.packages.length === 0) {
                // Return empty result if no packages found
                return this.createEmptyResult(uri);
            }

            // Analyze packages via API
            const apiResult = await this.apiClientService.analyzePackages(parseResult.packages);

            // Merge parse result with API result
            const result = this.mergeResults(uri, parseResult.packages, apiResult);

            // Cache result
            this.resultCache.set(uri.toString(), result);

            // Track result for workspace folder
            this.trackResultForWorkspaceFolder(uri, result);

            // Emit update event
            this.updateEmitter.fire(result);

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const result = this.createErrorResult(uri, errorMessage);

            // Cache error result
            this.resultCache.set(uri.toString(), result);

            // Track result for workspace folder
            this.trackResultForWorkspaceFolder(uri, result);

            // Emit update event
            this.updateEmitter.fire(result);

            return result;
        }
    }

    /**
     * Analyzes all package files in workspace
     * @returns Workspace analysis result
     */
    async analyzeWorkspace(): Promise<WorkspaceAnalysisResult> {
        const results: AnalysisResult[] = [];

        // Find all package files in workspace
        const packageFiles = await this.findPackageFiles();

        // Analyze each file
        for (const uri of packageFiles) {
            try {
                const result = await this.analyzeFile(uri);
                results.push(result);
            } catch (error) {
                // Continue with other files if one fails
                console.error(`Failed to analyze ${uri.fsPath}:`, error);
            }
        }

        // Aggregate statistics
        const aggregatedStatistics = this.aggregateStatistics(results);

        return {
            results,
            aggregatedStatistics
        };
    }

    /**
     * Analyzes all package files in a specific workspace folder
     * @param workspaceFolder Workspace folder to analyze
     * @returns Workspace analysis result for the folder
     */
    async analyzeWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<WorkspaceAnalysisResult> {
        const results: AnalysisResult[] = [];

        // Find all package files in this workspace folder
        const packageFiles = await this.findPackageFilesInFolder(workspaceFolder);

        // Analyze each file
        for (const uri of packageFiles) {
            try {
                const result = await this.analyzeFile(uri);
                results.push(result);
            } catch (error) {
                // Continue with other files if one fails
                console.error(`Failed to analyze ${uri.fsPath}:`, error);
            }
        }

        // Aggregate statistics
        const aggregatedStatistics = this.aggregateStatistics(results);

        return {
            results,
            aggregatedStatistics
        };
    }

    /**
     * Gets aggregated statistics for a specific workspace folder
     * @param workspaceFolder Workspace folder
     * @returns Aggregated statistics
     */
    getAggregatedStatisticsForFolder(workspaceFolder: vscode.WorkspaceFolder): {
        total: number;
        upToDate: number;
        outdated: number;
        errors: number;
    } {
        const results = this.getResultsForWorkspaceFolder(workspaceFolder);
        const resultArray = Array.from(results.values());
        return this.aggregateStatistics(resultArray);
    }

    /**
     * Gets aggregated statistics across all workspace folders
     * @returns Aggregated statistics
     */
    getAggregatedStatisticsForAllFolders(): {
        total: number;
        upToDate: number;
        outdated: number;
        errors: number;
    } {
        const allResults: AnalysisResult[] = [];

        // Collect all results from all workspace folders
        for (const folderResults of this.workspaceFolderResults.values()) {
            allResults.push(...Array.from(folderResults.values()));
        }

        return this.aggregateStatistics(allResults);
    }

    /**
     * Gets cached analysis result if available
     * @param uri URI of the package file
     * @returns Cached result or undefined
     */
    getCachedResult(uri: vscode.Uri): AnalysisResult | undefined {
        return this.resultCache.get(uri.toString());
    }

    /**
     * Gets all cached analysis results
     * @returns Array of all cached analysis results
     */
    getAllCachedResults(): AnalysisResult[] {
        return Array.from(this.resultCache.values());
    }

    /**
     * Clears cached results
     */
    clearCache(): void {
        this.resultCache.clear();
    }

    /**
     * Clears cached result for a specific file
     * @param uri URI of the package file
     */
    clearCacheForFile(uri: vscode.Uri): void {
        const uriString = uri.toString();
        this.resultCache.delete(uriString);

        // Also remove from workspace folder tracking
        const workspaceFolder = this.getWorkspaceFolder(uri);
        if (workspaceFolder) {
            const folderUri = workspaceFolder.uri.toString();
            const results = this.workspaceFolderResults.get(folderUri);
            if (results) {
                results.delete(uriString);
            }
        }
    }

    /**
     * Disposes the analysis service
     */
    dispose(): void {
        this.updateEmitter.dispose();
        this.clearCache();
    }

    /**
     * Gets the exclude pattern from configuration
     */
    private getExcludePattern(): string {
        const config = vscode.workspace.getConfiguration('packman');
        const excludeFolders = config.get<string[]>('excludeFolders', [
            '**/node_modules/**',
            '**/.next/**',
            '**/dist/**',
            '**/build/**',
            '**/.git/**'
        ]);

        // Join patterns with comma for VS Code's findFiles API
        return `{${excludeFolders.join(',')}}`;
    }

    /**
     * Finds all package files in workspace
     */
    private async findPackageFiles(): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];
        const excludePattern = this.getExcludePattern();

        // Find package.json files
        const packageJsonFiles = await vscode.workspace.findFiles(
            '**/package.json',
            excludePattern
        );
        files.push(...packageJsonFiles);

        // Find requirements.txt files
        const requirementsTxtFiles = await vscode.workspace.findFiles(
            '**/requirements.txt',
            excludePattern
        );
        files.push(...requirementsTxtFiles);

        // Find pubspec.yaml files
        const pubspecYamlFiles = await vscode.workspace.findFiles(
            '**/pubspec.yaml',
            excludePattern
        );
        files.push(...pubspecYamlFiles);

        return files;
    }

    /**
     * Gets the workspace folder for a given URI
     * @param uri URI of the file
     * @returns Workspace folder or undefined
     */
    getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(uri);
    }

    /**
     * Finds all package files in a specific workspace folder
     * @param workspaceFolder Workspace folder to search
     * @returns Array of package file URIs
     */
    async findPackageFilesInFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];
        const excludePattern = this.getExcludePattern();

        // Find package.json files
        const packageJsonFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/package.json'),
            excludePattern
        );
        files.push(...packageJsonFiles);

        // Find requirements.txt files
        const requirementsTxtFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/requirements.txt'),
            excludePattern
        );
        files.push(...requirementsTxtFiles);

        // Find pubspec.yaml files
        const pubspecYamlFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/pubspec.yaml'),
            excludePattern
        );
        files.push(...pubspecYamlFiles);

        return files;
    }

    /**
     * Gets all analysis results for a specific workspace folder
     * @param workspaceFolder Workspace folder
     * @returns Map of file URI to analysis result
     */
    getResultsForWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): Map<string, AnalysisResult> {
        const folderUri = workspaceFolder.uri.toString();
        let results = this.workspaceFolderResults.get(folderUri);

        if (!results) {
            results = new Map();
            this.workspaceFolderResults.set(folderUri, results);
        }

        return results;
    }

    /**
     * Tracks a result for a specific workspace folder
     * @param uri File URI
     * @param result Analysis result
     */
    private trackResultForWorkspaceFolder(uri: vscode.Uri, result: AnalysisResult): void {
        const workspaceFolder = this.getWorkspaceFolder(uri);

        if (workspaceFolder) {
            const folderUri = workspaceFolder.uri.toString();
            let results = this.workspaceFolderResults.get(folderUri);

            if (!results) {
                results = new Map();
                this.workspaceFolderResults.set(folderUri, results);
            }

            results.set(uri.toString(), result);
        }
    }

    /**
     * Removes tracking for a workspace folder
     * @param workspaceFolder Workspace folder to remove
     */
    removeWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): void {
        const folderUri = workspaceFolder.uri.toString();
        const results = this.workspaceFolderResults.get(folderUri);

        if (results) {
            // Clear cache for all files in this folder
            for (const fileUri of results.keys()) {
                this.resultCache.delete(fileUri);
            }

            // Remove folder tracking
            this.workspaceFolderResults.delete(folderUri);
        }
    }

    /**
     * Merges parse result with API result
     */
    private mergeResults(
        uri: vscode.Uri,
        packages: PackageInfo[],
        apiResult: APIAnalysisResult
    ): AnalysisResult {
        const packageAnalyses: PackageAnalysis[] = [];

        // Create a map of API results by package name
        const apiResultMap = new Map(
            apiResult.results.map(r => [r.name, r])
        );

        // Merge each package with its API result
        for (const pkg of packages) {
            const apiData = apiResultMap.get(pkg.name);

            if (apiData) {
                // Calculate change type and severity for outdated packages
                const changeType = apiData.status === 'outdated'
                    ? getChangeType(apiData.currentVersion, apiData.latestVersion)
                    : undefined;

                const updateSeverity = apiData.status === 'outdated'
                    ? getUpdateSeverity(apiData.currentVersion, apiData.latestVersion)
                    : undefined;

                packageAnalyses.push({
                    name: pkg.name,
                    currentVersion: apiData.currentVersion,
                    latestVersion: apiData.latestVersion,
                    status: apiData.status,
                    registry: apiData.registry,
                    documentationUrl: apiData.documentationUrl,
                    registryUrl: apiData.registryUrl,
                    error: apiData.error,
                    line: pkg.line,
                    changeType,
                    updateSeverity
                });
            } else {
                // If no API result, mark as error
                packageAnalyses.push({
                    name: pkg.name,
                    currentVersion: pkg.version,
                    latestVersion: pkg.version,
                    status: 'error',
                    registry: pkg.registry,
                    error: 'No analysis result available',
                    line: pkg.line
                });
            }
        }

        // Calculate statistics
        const statistics = this.calculateStatistics(packageAnalyses);

        return {
            uri,
            packages: packageAnalyses,
            statistics,
            timestamp: Date.now()
        };
    }

    /**
     * Calculates statistics from package analyses
     */
    private calculateStatistics(packages: PackageAnalysis[]): AnalysisResult['statistics'] {
        return {
            total: packages.length,
            upToDate: packages.filter(p => p.status === 'up-to-date').length,
            outdated: packages.filter(p => p.status === 'outdated').length,
            errors: packages.filter(p => p.status === 'error').length
        };
    }

    /**
     * Aggregates statistics from multiple results
     */
    private aggregateStatistics(results: AnalysisResult[]): WorkspaceAnalysisResult['aggregatedStatistics'] {
        return results.reduce(
            (acc, result) => ({
                total: acc.total + result.statistics.total,
                upToDate: acc.upToDate + result.statistics.upToDate,
                outdated: acc.outdated + result.statistics.outdated,
                errors: acc.errors + result.statistics.errors
            }),
            { total: 0, upToDate: 0, outdated: 0, errors: 0 }
        );
    }

    /**
     * Creates an error result
     */
    private createErrorResult(uri: vscode.Uri, errorMessage: string): AnalysisResult {
        return {
            uri,
            packages: [],
            statistics: {
                total: 0,
                upToDate: 0,
                outdated: 0,
                errors: 1
            },
            timestamp: Date.now()
        };
    }

    /**
     * Creates an empty result
     */
    private createEmptyResult(uri: vscode.Uri): AnalysisResult {
        return {
            uri,
            packages: [],
            statistics: {
                total: 0,
                upToDate: 0,
                outdated: 0,
                errors: 0
            },
            timestamp: Date.now()
        };
    }
}
