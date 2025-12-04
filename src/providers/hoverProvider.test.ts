/**
 * Unit tests for Hover Provider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyHoverProvider } from './hoverProvider';
import { AnalysisService, PackageAnalysis, AnalysisResult } from '../services/analysisService';
import { ParserService } from '../services/parserService';
import * as vscode from 'vscode';

// Mock vscode module
vi.mock('vscode', () => ({
    Range: class {
        constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) { }
    },
    Position: class {
        constructor(public line: number, public character: number) { }
    },
    Hover: class {
        constructor(public contents: any, public range?: any) { }
    },
    MarkdownString: class {
        private content: string = '';
        isTrusted: boolean = false;
        supportHtml: boolean = false;

        appendMarkdown(value: string) {
            this.content += value;
        }

        toString() {
            return this.content;
        }
    }
}));

describe('DependencyHoverProvider', () => {
    let provider: DependencyHoverProvider;
    let mockAnalysisService: any;
    let mockParserService: any;

    beforeEach(() => {
        // Create mock services
        mockAnalysisService = {
            getCachedResult: vi.fn()
        };

        mockParserService = {
            detectFileType: vi.fn()
        };

        provider = new DependencyHoverProvider(mockAnalysisService, mockParserService);
    });

    describe('provideHover', () => {
        it('should return undefined for unsupported file types', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/unknown.txt' },
                lineAt: () => ({ text: '' })
            } as any;

            const mockPosition = new vscode.Position(0, 0);

            mockParserService.detectFileType.mockReturnValue(undefined);

            const result = provider.provideHover(mockDocument, mockPosition, {} as any);

            expect(result).toBeUndefined();
        });

        it('should return undefined when no cached result exists', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                lineAt: () => ({ text: '' })
            } as any;

            const mockPosition = new vscode.Position(0, 0);

            mockParserService.detectFileType.mockReturnValue('package.json');
            mockAnalysisService.getCachedResult.mockReturnValue(undefined);

            const result = provider.provideHover(mockDocument, mockPosition, {} as any);

            expect(result).toBeUndefined();
        });

        it('should return undefined when cursor is not on a package name', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                lineAt: (line: number) => ({
                    text: '  "dependencies": {'
                })
            } as any;

            const mockPosition = new vscode.Position(0, 5);

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

            const result = provider.provideHover(mockDocument, mockPosition, {} as any);

            expect(result).toBeUndefined();
        });

        it('should return hover for up-to-date package', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                lineAt: (line: number) => ({
                    text: '    "react": "^18.0.0"'
                })
            } as any;

            const mockPosition = new vscode.Position(4, 6); // Position on "react"

            const mockPackage: PackageAnalysis = {
                name: 'react',
                currentVersion: '18.0.0',
                latestVersion: '18.0.0',
                status: 'up-to-date',
                registry: 'npm',
                documentationUrl: 'https://react.dev',
                registryUrl: 'https://www.npmjs.com/package/react',
                line: 5 // 1-based line number
            };

            const mockResult: AnalysisResult = {
                uri: mockDocument.uri,
                packages: [mockPackage],
                statistics: { total: 1, upToDate: 1, outdated: 0, errors: 0 },
                timestamp: Date.now()
            };

            mockParserService.detectFileType.mockReturnValue('package.json');
            mockAnalysisService.getCachedResult.mockReturnValue(mockResult);

            const result = provider.provideHover(mockDocument, mockPosition, {} as any) as vscode.Hover;

            expect(result).toBeDefined();
            expect(result).toBeInstanceOf(vscode.Hover);

            // Check that hover contains expected content
            const hoverContent = result.contents.toString();
            expect(hoverContent).toContain('react');
            expect(hoverContent).toContain('Up to date');
            expect(hoverContent).toContain('18.0.0');
        });

        it('should return hover for outdated package', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                lineAt: (line: number) => ({
                    text: '    "react": "^17.0.0"'
                })
            } as any;

            const mockPosition = new vscode.Position(4, 6);

            const mockPackage: PackageAnalysis = {
                name: 'react',
                currentVersion: '17.0.0',
                latestVersion: '18.0.0',
                status: 'outdated',
                registry: 'npm',
                documentationUrl: 'https://react.dev',
                registryUrl: 'https://www.npmjs.com/package/react',
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

            const result = provider.provideHover(mockDocument, mockPosition, {} as any) as vscode.Hover;

            expect(result).toBeDefined();

            const hoverContent = result.contents.toString();
            expect(hoverContent).toContain('react');
            expect(hoverContent).toContain('Version Update');
            expect(hoverContent).toContain('17.0.0');
            expect(hoverContent).toContain('18.0.0');
        });

        it('should return hover with error message for error package', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                lineAt: (line: number) => ({
                    text: '    "unknown-package": "^1.0.0"'
                })
            } as any;

            const mockPosition = new vscode.Position(4, 6);

            const mockPackage: PackageAnalysis = {
                name: 'unknown-package',
                currentVersion: '1.0.0',
                latestVersion: '1.0.0',
                status: 'error',
                registry: 'npm',
                error: 'Package not found in registry',
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

            const result = provider.provideHover(mockDocument, mockPosition, {} as any) as vscode.Hover;

            expect(result).toBeDefined();

            const hoverContent = result.contents.toString();
            expect(hoverContent).toContain('unknown-package');
            expect(hoverContent).toContain('Error');
            expect(hoverContent).toContain('Package not found in registry');
        });

        it('should include documentation and registry links when available', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/package.json' },
                lineAt: (line: number) => ({
                    text: '    "react": "^18.0.0"'
                })
            } as any;

            const mockPosition = new vscode.Position(4, 6);

            const mockPackage: PackageAnalysis = {
                name: 'react',
                currentVersion: '18.0.0',
                latestVersion: '18.0.0',
                status: 'up-to-date',
                registry: 'npm',
                documentationUrl: 'https://react.dev',
                registryUrl: 'https://www.npmjs.com/package/react',
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

            const result = provider.provideHover(mockDocument, mockPosition, {} as any) as vscode.Hover;

            expect(result).toBeDefined();

            const hoverContent = result.contents.toString();
            expect(hoverContent).toContain('Documentation');
            expect(hoverContent).toContain('https://react.dev');
            expect(hoverContent).toContain('Registry');
            expect(hoverContent).toContain('https://www.npmjs.com/package/react');
        });

        it('should work with PyPI packages', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/requirements.txt' },
                lineAt: (line: number) => ({
                    text: 'django==4.2.0'
                })
            } as any;

            const mockPosition = new vscode.Position(0, 3);

            const mockPackage: PackageAnalysis = {
                name: 'django',
                currentVersion: '4.2.0',
                latestVersion: '4.2.0',
                status: 'up-to-date',
                registry: 'pypi',
                line: 1
            };

            const mockResult: AnalysisResult = {
                uri: mockDocument.uri,
                packages: [mockPackage],
                statistics: { total: 1, upToDate: 1, outdated: 0, errors: 0 },
                timestamp: Date.now()
            };

            mockParserService.detectFileType.mockReturnValue('requirements.txt');
            mockAnalysisService.getCachedResult.mockReturnValue(mockResult);

            const result = provider.provideHover(mockDocument, mockPosition, {} as any) as vscode.Hover;

            expect(result).toBeDefined();

            const hoverContent = result.contents.toString();
            expect(hoverContent).toContain('django');
            expect(hoverContent).toContain('PyPI');
        });

        it('should work with pub packages', () => {
            const mockDocument = {
                uri: { fsPath: '/path/to/pubspec.yaml' },
                lineAt: (line: number) => ({
                    text: '  flutter: ^3.0.0'
                })
            } as any;

            const mockPosition = new vscode.Position(4, 4);

            const mockPackage: PackageAnalysis = {
                name: 'flutter',
                currentVersion: '3.0.0',
                latestVersion: '3.0.0',
                status: 'up-to-date',
                registry: 'pub',
                line: 5
            };

            const mockResult: AnalysisResult = {
                uri: mockDocument.uri,
                packages: [mockPackage],
                statistics: { total: 1, upToDate: 1, outdated: 0, errors: 0 },
                timestamp: Date.now()
            };

            mockParserService.detectFileType.mockReturnValue('pubspec.yaml');
            mockAnalysisService.getCachedResult.mockReturnValue(mockResult);

            const result = provider.provideHover(mockDocument, mockPosition, {} as any) as vscode.Hover;

            expect(result).toBeDefined();

            const hoverContent = result.contents.toString();
            expect(hoverContent).toContain('flutter');
            expect(hoverContent).toContain('pub.dev');
        });
    });
});
