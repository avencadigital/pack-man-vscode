/**
 * Tests for Update Commands
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateCommands } from './updateCommands';
import { ParserService } from '../services/parserService';
import { AnalysisService } from '../services/analysisService';
import * as vscode from 'vscode';

// Mock vscode module
vi.mock('vscode', () => ({
    window: {
        withProgress: vi.fn((options, task) => task({ report: vi.fn() })),
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        activeTextEditor: undefined
    },
    workspace: {
        openTextDocument: vi.fn(),
        applyEdit: vi.fn(() => Promise.resolve(true)),
        getConfiguration: vi.fn(() => ({
            get: vi.fn((key: string, defaultValue: any) => defaultValue)
        }))
    },
    WorkspaceEdit: vi.fn(() => ({
        replace: vi.fn()
    })),
    Range: vi.fn((start, end) => ({ start, end })),
    Uri: {
        file: vi.fn((path: string) => ({ fsPath: path, toString: () => path }))
    },
    ProgressLocation: {
        Notification: 15
    }
}));

describe('UpdateCommands', () => {
    let updateCommands: UpdateCommands;
    let parserService: ParserService;
    let analysisService: any;

    beforeEach(() => {
        parserService = new ParserService();
        analysisService = {
            analyzeFile: vi.fn(),
            getCachedResult: vi.fn(),
            onAnalysisUpdate: vi.fn()
        };
        updateCommands = new UpdateCommands(parserService, analysisService);
    });

    describe('updateVersionInContent', () => {
        it('should update version in package.json', () => {
            const content = `{
  "dependencies": {
    "react": "^18.0.0",
    "axios": "^1.0.0"
  }
}`;
            const result = (updateCommands as any).updateVersionInContent(
                content,
                'package.json',
                'react',
                '^18.0.0',
                '^19.0.0'
            );

            expect(result).toContain('"react": "^19.0.0"');
            expect(result).toContain('"axios": "^1.0.0"');
        });

        it('should update version in requirements.txt', () => {
            const content = `requests==2.28.0
flask>=2.0.0
django~=4.0.0`;

            const result = (updateCommands as any).updateVersionInContent(
                content,
                'requirements.txt',
                'requests',
                '2.28.0',
                '2.31.0'
            );

            expect(result).toContain('requests==2.31.0');
            expect(result).toContain('flask>=2.0.0');
        });

        it('should update version in requirements.txt with Windows line endings', () => {
            const content = `requests==2.28.0\r\nflask>=2.0.0\r\ndjango~=4.0.0\r\n`;

            const result = (updateCommands as any).updateVersionInContent(
                content,
                'requirements.txt',
                'requests',
                '2.28.0',
                '2.31.0'
            );

            expect(result).toContain('requests==2.31.0');
            expect(result).toContain('flask>=2.0.0');
        });

        it('should update version in pubspec.yaml', () => {
            const content = `dependencies:
  flutter:
    sdk: flutter
  http: ^0.13.0
  provider: ^6.0.0`;

            const result = (updateCommands as any).updateVersionInContent(
                content,
                'pubspec.yaml',
                'http',
                '^0.13.0',
                '^1.0.0'
            );

            expect(result).toContain('http: ^1.0.0');
            expect(result).toContain('provider: ^6.0.0');
        });

        it('should update version in pubspec.yaml preserving caret when API returns version without caret', () => {
            const content = `dependencies:
  flutter_svg: ^2.0.17
  http: ^0.13.0`;

            // Simulates: oldVersion from parser has ^, newVersion from API doesn't
            const result = (updateCommands as any).updateVersionInContent(
                content,
                'pubspec.yaml',
                'flutter_svg',
                '^2.0.17',
                '2.2.3'
            );

            expect(result).toContain('flutter_svg: ^2.2.3');
            expect(result).toContain('http: ^0.13.0');
        });

        it('should update version in pubspec.yaml with Windows line endings', () => {
            const content = `dependencies:\r\n  flutter_svg: ^2.0.17\r\n  http: ^0.13.0\r\n`;

            const result = (updateCommands as any).updateVersionInContent(
                content,
                'pubspec.yaml',
                'flutter_svg',
                '^2.0.17',
                '2.2.3'
            );

            expect(result).toContain('flutter_svg: ^2.2.3');
            expect(result).toContain('http: ^0.13.0');
        });

        it('should preserve formatting in package.json', () => {
            const content = `{
  "dependencies": {
    "react": "^18.0.0"
  }
}`;
            const result = (updateCommands as any).updateVersionInContent(
                content,
                'package.json',
                'react',
                '^18.0.0',
                '^19.0.0'
            );

            // Check that formatting is preserved
            expect(result).toContain('{\n  "dependencies"');
            expect(result).toContain('\n}');
        });

        it('should preserve comments in requirements.txt', () => {
            const content = `# Web framework
flask>=2.0.0
# HTTP library
requests==2.28.0`;

            const result = (updateCommands as any).updateVersionInContent(
                content,
                'requirements.txt',
                'requests',
                '2.28.0',
                '2.31.0'
            );

            expect(result).toContain('# Web framework');
            expect(result).toContain('# HTTP library');
            expect(result).toContain('requests==2.31.0');
        });
    });

    describe('escapeRegex', () => {
        it('should escape special regex characters', () => {
            const result = (updateCommands as any).escapeRegex('^1.0.0');
            expect(result).toBe('\\^1\\.0\\.0');
        });

        it('should escape multiple special characters', () => {
            const result = (updateCommands as any).escapeRegex('>=1.0.0+build.1');
            expect(result).toBe('>=1\\.0\\.0\\+build\\.1');
        });
    });
});
