import { describe, it, expect } from 'vitest';
import { validateApiEndpoint, isValidApiEndpoint } from './urlValidator';

describe('urlValidator', () => {
    describe('validateApiEndpoint', () => {
        describe('valid URLs', () => {
            it('accepts HTTPS URLs', () => {
                const result = validateApiEndpoint('https://api.example.com');
                expect(result.isValid).toBe(true);
                expect(result.error).toBeUndefined();
            });

            it('accepts HTTP URLs', () => {
                const result = validateApiEndpoint('http://api.example.com');
                expect(result.isValid).toBe(true);
            });

            it('accepts localhost URLs', () => {
                const result = validateApiEndpoint('http://localhost:3000');
                expect(result.isValid).toBe(true);
            });

            it('accepts URLs with paths', () => {
                const result = validateApiEndpoint('https://api.example.com/v1/analyze');
                expect(result.isValid).toBe(true);
            });

            it('accepts URLs with query parameters', () => {
                const result = validateApiEndpoint('https://api.example.com?key=value');
                expect(result.isValid).toBe(true);
            });

            it('accepts IP address URLs', () => {
                const result = validateApiEndpoint('http://192.168.1.1:8080');
                expect(result.isValid).toBe(true);
            });
        });

        describe('invalid URLs', () => {
            it('rejects empty strings', () => {
                const result = validateApiEndpoint('');
                expect(result.isValid).toBe(false);
                expect(result.error).toBe('API endpoint URL is required');
            });

            it('rejects whitespace-only strings', () => {
                const result = validateApiEndpoint('   ');
                expect(result.isValid).toBe(false);
                expect(result.error).toBe('API endpoint URL cannot be empty or whitespace only');
            });

            it('rejects malformed URLs', () => {
                const result = validateApiEndpoint('not-a-url');
                expect(result.isValid).toBe(false);
                expect(result.error).toContain('Invalid URL format');
            });

            it('rejects FTP protocol', () => {
                const result = validateApiEndpoint('ftp://files.example.com');
                expect(result.isValid).toBe(false);
                expect(result.error).toBe('URL must use HTTP or HTTPS protocol');
            });

            it('rejects file protocol', () => {
                const result = validateApiEndpoint('file:///path/to/file');
                expect(result.isValid).toBe(false);
                expect(result.error).toBe('URL must use HTTP or HTTPS protocol');
            });

            it('rejects URLs without hostname', () => {
                const result = validateApiEndpoint('http://');
                expect(result.isValid).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('trims whitespace from valid URLs', () => {
                const result = validateApiEndpoint('  https://api.example.com  ');
                expect(result.isValid).toBe(true);
            });
        });
    });

    describe('isValidApiEndpoint', () => {
        it('returns true for valid URLs', () => {
            expect(isValidApiEndpoint('https://api.example.com')).toBe(true);
        });

        it('returns false for invalid URLs', () => {
            expect(isValidApiEndpoint('')).toBe(false);
            expect(isValidApiEndpoint('not-a-url')).toBe(false);
        });
    });
});
