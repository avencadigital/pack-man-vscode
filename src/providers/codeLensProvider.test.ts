/**
 * Unit tests for CodeLens Provider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyCodeLensProvider } from './codeLensProvider';
import { AnalysisService, PackageAnalysis, AnalysisResult } from '../services/analysisService';
import { ParserService } from '../services/parserService';
import * as vscode from 'vscode';

// Mock vscode module
vi.mock('vscode', () => ({
    Range: class {
        constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) { }
    },
    CodeLens: class {
        constructor(public range: any, public command?: any) { }
    },
    EventEmitter: class {
        private listeners: Array<() => void> = [];
        event = (listener: () => void) => {
            this.listeners.push(listener);
            return { dispose: () => { } };
        };
        fire() {
            this.listeners.forEach(l => l());
        }
        dispose() { }
    },
    workspace: {
        getConfiguration: () => ({
            get: (key: string, defaultValue: any) => defaultValue
        })
    }
}));

describe('DependencyCodeLensProvider', () => {
    let provider: DependencyCodeLensProvider;
    let mockAnalysisService: any;
    let mockParserService: any;

    beforeEach(() => {
        // Create mock services
        mockAnalysisService = {
            onAnalysisUpdate: vi.fn((callback: any) => ({ dispose: () => { } })),
            getCachedResult: vi.fn()
        };

        mockParserService = {
            detectFileType: vi.fn()
        };

        provider = new DependencyCodeLensProvider(mockAnalysisService, mockParserService);
    });

    describe('provideCodeLenses', () => {
        it('should return empty array for unsupported file types', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/unknown.txt' },
                getText: () => ''
            } as any;

            mockParserService.detectFileType.mockReturnValue(undefined);

            const result = provider.provideCodeLenses(mockDocument, {} as any);

            expect(result).toEqual([]);
        });

        it('should return empty array when no cached result exists', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                getText: () => ''
            } as any;

            mockParserService.detectFileType.mockReturnValue('package.json');
            mockAnalysisService.getCachedResult.mockReturnValue(undefined);

            const result = provider.provideCodeLenses(mockDocument, {} as any);

            expect(result).toEqual([]);
        });

        it('should create CodeLens for up-to-date packages', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                getText: () => ''
            } as any;

            const mockPackage: PackageAnalysis = {
                name: 'react',
                currentVersion: '18.0.0',
                latestVersion: '18.0.0',
                status: 'up-to-date',
                registry: 'npm',
                line: 5
            };

            const mockResult: AnalysisResult = {
                uri: mockDocument.uri,
                packages: [mockPackage],
                statistics: { total: 1, upToDate: 1, outdated: 0, errors: 0 },
                timestamp: Date.now()
            };

            mockParserService.detectFileType.mockReturnValue('package.json');
            mockAnalysisService.getCachedResult.mockReturnValue(mockResult);

            const result = provider.provideCodeLenses(mockDocument, {} as any) as vscode.CodeLens[];

            expect(result).toHaveLength(1);
            expect(result[0].command?.title).toContain('Up to date');
        });

        it('should create CodeLens with update command for outdated packages', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                getText: () => ''
            } as any;

            const mockPackage: PackageAnalysis = {
                name: 'react',
                currentVersion: '17.0.0',
                latestVersion: '18.0.0',
                status: 'outdated',
                registry: 'npm',
                line: 5
            };

            const mockResult: AnalysisResult = {
                uri: mockDocument.uri,
                packages: [mockPackage],
                statistics: { total: 1, upToDate: 0, outdated: 1, errors: 0 },
                timestamp: Date.now()
            };

            mockParserService.detectFileType.mockReturnValue('package.json');
            mockAnalysisService.getCachedResult.mockReturnValue(mockResult);

            const result = provider.provideCodeLenses(mockDocument, {} as any) as vscode.CodeLens[];

            // Should have 2 CodeLens: status + update command
            expect(result).toHaveLength(2);
            expect(result[0].command?.title).toContain('Update available');
            expect(result[1].command?.command).toBe('packman.updateDependency');
        });

        it('should create CodeLens for error packages', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                getText: () => ''
            } as any;

            const mockPackage: PackageAnalysis = {
                name: 'unknown-package',
                currentVersion: '1.0.0',
                latestVersion: '1.0.0',
                status: 'error',
                registry: 'npm',
                error: 'Package not found',
                line: 5
            };

            const mockResult: AnalysisResult = {
                uri: mockDocument.uri,
                packages: [mockPackage],
                statistics: { total: 1, upToDate: 0, outdated: 0, errors: 1 },
                timestamp: Date.now()
            };

            mockParserService.detectFileType.mockReturnValue('package.json');
            mockAnalysisService.getCachedResult.mockReturnValue(mockResult);

            const result = provider.provideCodeLenses(mockDocument, {} as any) as vscode.CodeLens[];

            expect(result).toHaveLength(1);
            expect(result[0].command?.title).toContain('Package not found');
        });
    });

    describe('resolveCodeLens', () => {
        it('should return the same CodeLens', () => {
            const mockCodeLens = {
                range: new vscode.Range(0, 0, 0, 0),
                command: { title: 'Test', command: 'test' }
            } as any;

            const result = provider.resolveCodeLens(mockCodeLens, {} as any);

            expect(result).toBe(mockCodeLens);
        });
    });
});
