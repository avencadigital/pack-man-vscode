/**
 * Tests for Analysis Service - Multi-root Workspace Support
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { AnalysisService } from './analysisService';
import { ParserService } from './parserService';
import { APIClientService } from './apiClientService';
import { CacheService } from './cacheService';

// Mock VS Code API
vi.mock('vscode', () => ({
    workspace: {
        getWorkspaceFolder: vi.fn(),
        findFiles: vi.fn(),
        openTextDocument: vi.fn(),
    },
    Uri: {
        parse: (str: string) => ({ toString: () => str, fsPath: str }),
    },
    EventEmitter: class {
        event = vi.fn();
        fire = vi.fn();
        dispose = vi.fn();
    },
}));

describe('AnalysisService - Multi-root Workspace Support', () => {
    let analysisService: AnalysisService;
    let parserService: ParserService;
    let apiClientService: APIClientService;
    let cacheService: CacheService;

    beforeEach(() => {
        cacheService = new CacheService();
        apiClientService = new APIClientService(cacheService, 'https://test.com');
        parserService = new ParserService();
        analysisService = new AnalysisService(apiClientService, parserService);
    });

    describe('Workspace Folder Detection', () => {
        it('should get workspace folder for a URI', () => {
            const mockUri = vscode.Uri.parse('file:///workspace1/package.json');
            const mockFolder = {
                uri: vscode.Uri.parse('file:///workspace1'),
                name: 'workspace1',
                index: 0,
            } as vscode.WorkspaceFolder;

            vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(mockFolder);

            const result = analysisService.getWorkspaceFolder(mockUri);

            expect(result).toBe(mockFolder);
            expect(vscode.workspace.getWorkspaceFolder).toHaveBeenCalledWith(mockUri);
        });

        it('should return undefined for URI not in workspace', () => {
            const mockUri = vscode.Uri.parse('file:///outside/package.json');

            vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);

            const result = analysisService.getWorkspaceFolder(mockUri);

            expect(result).toBeUndefined();
        });
    });

    describe('Workspace Folder Results Tracking', () => {
        it('should track results per workspace folder', () => {
            const mockFolder = {
                uri: vscode.Uri.parse('file:///workspace1'),
                name: 'workspace1',
                index: 0,
            } as vscode.WorkspaceFolder;

            const results = analysisService.getResultsForWorkspaceFolder(mockFolder);

            expect(results).toBeInstanceOf(Map);
            expect(results.size).toBe(0);
        });

        it('should return same results map for same workspace folder', () => {
            const mockFolder = {
                uri: vscode.Uri.parse('file:///workspace1'),
                name: 'workspace1',
                index: 0,
            } as vscode.WorkspaceFolder;

            const results1 = analysisService.getResultsForWorkspaceFolder(mockFolder);
            const results2 = analysisService.getResultsForWorkspaceFolder(mockFolder);

            expect(results1).toBe(results2);
        });
    });

    describe('Workspace Folder Removal', () => {
        it('should remove all results for a workspace folder', () => {
            const mockFolder = {
                uri: vscode.Uri.parse('file:///workspace1'),
                name: 'workspace1',
                index: 0,
            } as vscode.WorkspaceFolder;

            // Get results to initialize tracking
            const results = analysisService.getResultsForWorkspaceFolder(mockFolder);

            // Add a mock result
            const mockResult = {
                uri: vscode.Uri.parse('file:///workspace1/package.json'),
                packages: [],
                statistics: { total: 0, upToDate: 0, outdated: 0, errors: 0 },
                timestamp: Date.now(),
            };
            results.set('file:///workspace1/package.json', mockResult);

            // Remove workspace folder
            analysisService.removeWorkspaceFolder(mockFolder);

            // Verify results are cleared
            const newResults = analysisService.getResultsForWorkspaceFolder(mockFolder);
            expect(newResults.size).toBe(0);
        });
    });

    describe('Aggregated Statistics', () => {
        it('should aggregate statistics across all workspace folders', () => {
            const mockFolder1 = {
                uri: vscode.Uri.parse('file:///workspace1'),
                name: 'workspace1',
                index: 0,
            } as vscode.WorkspaceFolder;

            const mockFolder2 = {
                uri: vscode.Uri.parse('file:///workspace2'),
                name: 'workspace2',
                index: 1,
            } as vscode.WorkspaceFolder;

            // Add results for folder 1
            const results1 = analysisService.getResultsForWorkspaceFolder(mockFolder1);
            results1.set('file:///workspace1/package.json', {
                uri: vscode.Uri.parse('file:///workspace1/package.json'),
                packages: [],
                statistics: { total: 5, upToDate: 3, outdated: 2, errors: 0 },
                timestamp: Date.now(),
            });

            // Add results for folder 2
            const results2 = analysisService.getResultsForWorkspaceFolder(mockFolder2);
            results2.set('file:///workspace2/package.json', {
                uri: vscode.Uri.parse('file:///workspace2/package.json'),
                packages: [],
                statistics: { total: 3, upToDate: 1, outdated: 1, errors: 1 },
                timestamp: Date.now(),
            });

            // Get aggregated statistics
            const stats = analysisService.getAggregatedStatisticsForAllFolders();

            expect(stats.total).toBe(8);
            expect(stats.upToDate).toBe(4);
            expect(stats.outdated).toBe(3);
            expect(stats.errors).toBe(1);
        });

        it('should return zero statistics when no folders have results', () => {
            const stats = analysisService.getAggregatedStatisticsForAllFolders();

            expect(stats.total).toBe(0);
            expect(stats.upToDate).toBe(0);
            expect(stats.outdated).toBe(0);
            expect(stats.errors).toBe(0);
        });
    });

    describe('Clear Cache for File', () => {
        it('should clear cache and workspace folder tracking for a file', () => {
            const mockFolder = {
                uri: vscode.Uri.parse('file:///workspace1'),
                name: 'workspace1',
                index: 0,
            } as vscode.WorkspaceFolder;

            const mockUri = vscode.Uri.parse('file:///workspace1/package.json');

            vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(mockFolder);

            // Add a result to workspace folder tracking
            const results = analysisService.getResultsForWorkspaceFolder(mockFolder);
            results.set(mockUri.toString(), {
                uri: mockUri,
                packages: [],
                statistics: { total: 0, upToDate: 0, outdated: 0, errors: 0 },
                timestamp: Date.now(),
            });

            // Clear cache for file
            analysisService.clearCacheForFile(mockUri);

            // Verify it's removed from workspace folder tracking
            expect(results.has(mockUri.toString())).toBe(false);
        });
    });
});
