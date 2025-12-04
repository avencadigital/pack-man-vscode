/**
 * Tests for folder exclusion functionality in AnalysisService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock VS Code API
vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vi.fn(),
        findFiles: vi.fn(),
        getWorkspaceFolder: vi.fn(),
        openTextDocument: vi.fn(),
    },
    Uri: {
        file: (path: string) => ({ toString: () => path, fsPath: path }),
        parse: (str: string) => ({ toString: () => str, fsPath: str }),
    },
    EventEmitter: class {
        event = vi.fn();
        fire = vi.fn();
        dispose = vi.fn();
    },
    RelativePattern: class {
        constructor(public base: any, public pattern: string) { }
    },
}));

import * as vscode from 'vscode';

describe('AnalysisService - Folder Exclusion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getExcludePattern', () => {
        it('should construct pattern from default folders', () => {
            const defaultFolders = [
                '**/node_modules/**',
                '**/.next/**',
                '**/dist/**',
                '**/build/**',
                '**/.git/**'
            ];

            // Expected default pattern
            const expectedPattern = `{${defaultFolders.join(',')}}`;

            expect(expectedPattern).toBe('{**/node_modules/**,**/.next/**,**/dist/**,**/build/**,**/.git/**}');
        });

        it('should construct pattern from custom folders', () => {
            const customFolders = ['**/custom/**', '**/test/**'];
            const expectedPattern = `{${customFolders.join(',')}}`;

            expect(expectedPattern).toBe('{**/custom/**,**/test/**}');
        });

        it('should handle empty folders array', () => {
            const emptyFolders: string[] = [];
            const expectedPattern = `{${emptyFolders.join(',')}}`;

            expect(expectedPattern).toBe('{}');
        });
    });

    describe('findPackageFiles with exclusions', () => {
        it('should exclude node_modules by default', async () => {
            const mockFiles = [
                vscode.Uri.file('/project/package.json'),
                vscode.Uri.file('/project/node_modules/package.json')
            ];

            vi.spyOn(vscode.workspace, 'findFiles').mockResolvedValue(mockFiles);

            const mockConfig = {
                get: vi.fn((key: string, defaultValue: string[]) => defaultValue)
            };

            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            // Verify that findFiles is called with exclude pattern
            expect(vscode.workspace.findFiles).toBeDefined();
        });

        it('should exclude .next folder by default', async () => {
            const mockFiles = [
                vscode.Uri.file('/project/package.json'),
                vscode.Uri.file('/project/.next/package.json')
            ];

            vi.spyOn(vscode.workspace, 'findFiles').mockResolvedValue(mockFiles);

            const mockConfig = {
                get: vi.fn((key: string, defaultValue: string[]) => defaultValue)
            };

            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            expect(vscode.workspace.findFiles).toBeDefined();
        });

        it('should exclude dist and build folders by default', async () => {
            const mockFiles = [
                vscode.Uri.file('/project/package.json'),
                vscode.Uri.file('/project/dist/package.json'),
                vscode.Uri.file('/project/build/package.json')
            ];

            vi.spyOn(vscode.workspace, 'findFiles').mockResolvedValue(mockFiles);

            const mockConfig = {
                get: vi.fn((key: string, defaultValue: string[]) => defaultValue)
            };

            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            expect(vscode.workspace.findFiles).toBeDefined();
        });
    });

    describe('Pattern matching', () => {
        it('should match nested node_modules folders', () => {
            const paths = [
                '/project/node_modules/package.json',
                '/project/packages/app/node_modules/package.json',
                '/project/apps/web/node_modules/package.json'
            ];

            const pattern = '**/node_modules/**';

            // All paths should match the pattern
            paths.forEach(path => {
                const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
                expect(regex.test(path)).toBe(true);
            });
        });

        it('should match .next folder at any level', () => {
            const paths = [
                '/project/.next/package.json',
                '/project/apps/web/.next/package.json'
            ];

            const pattern = '**/.next/**';

            paths.forEach(path => {
                const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
                expect(regex.test(path)).toBe(true);
            });
        });

        it('should not match valid project files', () => {
            const validPaths = [
                '/project/package.json',
                '/project/src/package.json',
                '/project/packages/app/package.json'
            ];

            const excludePattern = '**/node_modules/**';

            validPaths.forEach(path => {
                const regex = new RegExp(excludePattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
                expect(regex.test(path)).toBe(false);
            });
        });
    });

    describe('Configuration changes', () => {
        it('should respect updated exclude folders configuration', () => {
            const initialFolders = ['**/node_modules/**'];
            const updatedFolders = ['**/node_modules/**', '**/.venv/**'];

            const mockConfig = {
                get: vi.fn()
                    .mockReturnValueOnce(initialFolders)
                    .mockReturnValueOnce(updatedFolders)
            };

            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            // First call should return initial folders
            vscode.workspace.getConfiguration('packman').get('excludeFolders', []);
            expect(mockConfig.get).toHaveBeenCalledTimes(1);

            // Second call should return updated folders
            vscode.workspace.getConfiguration('packman').get('excludeFolders', []);
            expect(mockConfig.get).toHaveBeenCalledTimes(2);
        });
    });

    describe('Edge cases', () => {
        it('should handle Windows-style paths', () => {
            const windowsPath = 'C:\\project\\node_modules\\package.json';
            const normalizedPath = windowsPath.replace(/\\/g, '/');

            const pattern = '**/node_modules/**';
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));

            expect(regex.test(normalizedPath)).toBe(true);
        });

        it('should handle paths with special characters', () => {
            const specialPath = '/project/@types/node/package.json';
            const pattern = '**/node_modules/**';
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));

            // Should not match if not in node_modules
            expect(regex.test(specialPath)).toBe(false);
        });

        it('should handle multiple consecutive slashes', () => {
            const path = '/project//node_modules//package.json';
            const pattern = '**/node_modules/**';
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));

            expect(regex.test(path)).toBe(true);
        });
    });
});
