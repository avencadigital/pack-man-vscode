/**
 * Tests for Diagnostic Provider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { DependencyDiagnosticProvider } from './diagnosticProvider';
import { AnalysisService, AnalysisResult, PackageAnalysis } from '../services/analysisService';

// Mock vscode module
vi.mock('vscode', () => ({
    languages: {
        createDiagnosticCollection: vi.fn(() => ({
            set: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
            dispose: vi.fn()
        }))
    },
    workspace: {
        getConfiguration: vi.fn(() => ({
            get: vi.fn((key: string, defaultValue: any) => defaultValue)
        })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() }))
    },
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3
    },
    Diagnostic: class {
        constructor(
            public range: any,
            public message: string,
            public severity: number
        ) { }
        source?: string;
        code?: string;
    },
    Range: class {
        constructor(
            public startLine: number,
            public startChar: number,
            public endLine: number,
            public endChar: number
        ) { }
    },
    Uri: {
        file: (path: string) => ({ fsPath: path, toString: () => path })
    }
}));

describe('DependencyDiagnosticProvider', () => {
    let analysisService: AnalysisService;
    let diagnosticProvider: DependencyDiagnosticProvider;
    let mockDiagnosticCollection: any;
    let analysisUpdateCallback: ((result: AnalysisResult) => void) | undefined;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();
        analysisUpdateCallback = undefined;

        // Create mock diagnostic collection
        mockDiagnosticCollection = {
            set: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
            dispose: vi.fn()
        };

        // Mock createDiagnosticCollection
        vi.mocked(vscode.languages.createDiagnosticCollection).mockReturnValue(
            mockDiagnosticCollection
        );

        // Create mock analysis service with proper callback capture
        analysisService = {
            onAnalysisUpdate: vi.fn((callback: (result: AnalysisResult) => void) => {
                analysisUpdateCallback = callback;
                return { dispose: vi.fn() };
            }),
            getCachedResult: vi.fn(),
            getAllCachedResults: vi.fn(() => [])
        } as any;

        // Create diagnostic provider
        diagnosticProvider = new DependencyDiagnosticProvider(analysisService);
    });

    describe('constructor', () => {
        it('should create diagnostic collection', () => {
            expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith('packman');
        });

        it('should subscribe to analysis updates', () => {
            expect(analysisService.onAnalysisUpdate).toHaveBeenCalled();
        });
    });

    describe('updateDiagnostics', () => {
        it('should create warning diagnostic for outdated dependency', () => {
            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'react',
                        currentVersion: '18.0.0',
                        latestVersion: '18.2.0',
                        status: 'outdated',
                        registry: 'npm',
                        line: 5,
                        updateSeverity: 'important'
                    }
                ],
                statistics: { total: 1, upToDate: 0, outdated: 1, errors: 0 },
                timestamp: Date.now()
            };

            diagnosticProvider.updateDiagnostics(uri, result);

            expect(mockDiagnosticCollection.set).toHaveBeenCalledWith(
                uri,
                expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining('react: Update available (18.0.0 → 18.2.0)'),
                        severity: vscode.DiagnosticSeverity.Warning
                    })
                ])
            );
        });

        it('should create error diagnostic for error dependency', () => {
            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'invalid-package',
                        currentVersion: '1.0.0',
                        latestVersion: '1.0.0',
                        status: 'error',
                        registry: 'npm',
                        error: 'Package not found',
                        line: 3
                    }
                ],
                statistics: { total: 1, upToDate: 0, outdated: 0, errors: 1 },
                timestamp: Date.now()
            };

            diagnosticProvider.updateDiagnostics(uri, result);

            expect(mockDiagnosticCollection.set).toHaveBeenCalledWith(
                uri,
                expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining('invalid-package: Package not found'),
                        severity: vscode.DiagnosticSeverity.Error
                    })
                ])
            );
        });

        it('should not create diagnostic for up-to-date dependency', () => {
            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'react',
                        currentVersion: '18.2.0',
                        latestVersion: '18.2.0',
                        status: 'up-to-date',
                        registry: 'npm',
                        line: 5
                    }
                ],
                statistics: { total: 1, upToDate: 1, outdated: 0, errors: 0 },
                timestamp: Date.now()
            };

            diagnosticProvider.updateDiagnostics(uri, result);

            // Should delete diagnostics when all are up-to-date
            expect(mockDiagnosticCollection.delete).toHaveBeenCalledWith(uri);
        });

        it('should clear diagnostics when all dependencies are up-to-date', () => {
            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'react',
                        currentVersion: '18.2.0',
                        latestVersion: '18.2.0',
                        status: 'up-to-date',
                        registry: 'npm',
                        line: 5
                    },
                    {
                        name: 'vue',
                        currentVersion: '3.3.0',
                        latestVersion: '3.3.0',
                        status: 'up-to-date',
                        registry: 'npm',
                        line: 6
                    }
                ],
                statistics: { total: 2, upToDate: 2, outdated: 0, errors: 0 },
                timestamp: Date.now()
            };

            diagnosticProvider.updateDiagnostics(uri, result);

            expect(mockDiagnosticCollection.delete).toHaveBeenCalledWith(uri);
        });

        it('should include package name, current version, and latest version in message', () => {
            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'lodash',
                        currentVersion: '4.17.20',
                        latestVersion: '4.17.21',
                        status: 'outdated',
                        registry: 'npm',
                        line: 10
                    }
                ],
                statistics: { total: 1, upToDate: 0, outdated: 1, errors: 0 },
                timestamp: Date.now()
            };

            diagnosticProvider.updateDiagnostics(uri, result);

            const setCall = mockDiagnosticCollection.set.mock.calls[0];
            expect(setCall).toBeDefined();
            expect(setCall[0]).toBe(uri);

            const diagnostics = setCall[1];
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('lodash');
            expect(diagnostics[0].message).toContain('4.17.20');
            expect(diagnostics[0].message).toContain('4.17.21');
        });

        it('should handle multiple packages with mixed statuses', () => {
            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'react',
                        currentVersion: '18.2.0',
                        latestVersion: '18.2.0',
                        status: 'up-to-date',
                        registry: 'npm',
                        line: 5
                    },
                    {
                        name: 'vue',
                        currentVersion: '3.2.0',
                        latestVersion: '3.3.0',
                        status: 'outdated',
                        registry: 'npm',
                        line: 6,
                        updateSeverity: 'important'
                    },
                    {
                        name: 'invalid',
                        currentVersion: '1.0.0',
                        latestVersion: '1.0.0',
                        status: 'error',
                        registry: 'npm',
                        error: 'Not found',
                        line: 7
                    }
                ],
                statistics: { total: 3, upToDate: 1, outdated: 1, errors: 1 },
                timestamp: Date.now()
            };

            diagnosticProvider.updateDiagnostics(uri, result);

            // Should create diagnostics for outdated and error, but not up-to-date
            expect(mockDiagnosticCollection.set).toHaveBeenCalledWith(
                uri,
                expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining('vue'),
                        severity: vscode.DiagnosticSeverity.Warning
                    }),
                    expect.objectContaining({
                        message: expect.stringContaining('invalid'),
                        severity: vscode.DiagnosticSeverity.Error
                    })
                ])
            );

            // Should have exactly 2 diagnostics
            const setCall = mockDiagnosticCollection.set.mock.calls[0];
            expect(setCall[1]).toHaveLength(2);
        });

        it('should respect showDiagnostics configuration', () => {
            // Mock configuration to disable diagnostics
            vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
                get: vi.fn((key: string, defaultValue: any) => {
                    if (key === 'showDiagnostics') {
                        return false;
                    }
                    return defaultValue;
                })
            } as any);

            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'react',
                        currentVersion: '18.0.0',
                        latestVersion: '18.2.0',
                        status: 'outdated',
                        registry: 'npm',
                        line: 5
                    }
                ],
                statistics: { total: 1, upToDate: 0, outdated: 1, errors: 0 },
                timestamp: Date.now()
            };

            diagnosticProvider.updateDiagnostics(uri, result);

            // Should delete diagnostics when disabled
            expect(mockDiagnosticCollection.delete).toHaveBeenCalledWith(uri);
            expect(mockDiagnosticCollection.set).not.toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('should clear all diagnostics', () => {
            diagnosticProvider.clear();
            expect(mockDiagnosticCollection.clear).toHaveBeenCalled();
        });
    });

    describe('clearForUri', () => {
        it('should clear diagnostics for specific URI', () => {
            const uri = vscode.Uri.file('/test/package.json');
            diagnosticProvider.clearForUri(uri);
            expect(mockDiagnosticCollection.delete).toHaveBeenCalledWith(uri);
        });
    });

    describe('dispose', () => {
        it('should dispose diagnostic collection', () => {
            diagnosticProvider.dispose();
            expect(mockDiagnosticCollection.dispose).toHaveBeenCalled();
        });
    });

    describe('analysis update integration', () => {
        it('should update diagnostics when analysis updates', () => {
            // Verify callback was captured
            expect(analysisUpdateCallback).toBeDefined();

            // Ensure configuration returns true for showDiagnostics
            vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
                get: vi.fn((key: string, defaultValue: any) => {
                    if (key === 'showDiagnostics') {
                        return true;
                    }
                    return defaultValue;
                })
            } as any);

            const uri = vscode.Uri.file('/test/package.json');
            const result: AnalysisResult = {
                uri,
                packages: [
                    {
                        name: 'react',
                        currentVersion: '18.0.0',
                        latestVersion: '18.2.0',
                        status: 'outdated',
                        registry: 'npm',
                        line: 5
                    }
                ],
                statistics: { total: 1, upToDate: 0, outdated: 1, errors: 0 },
                timestamp: Date.now()
            };

            // Clear previous calls
            mockDiagnosticCollection.set.mockClear();
            mockDiagnosticCollection.delete.mockClear();

            // Trigger analysis update callback
            analysisUpdateCallback!(result);

            expect(mockDiagnosticCollection.set).toHaveBeenCalledWith(
                uri,
                expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining('react')
                    })
                ])
            );
        });
    });
});
