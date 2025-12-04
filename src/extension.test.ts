import { describe, it, expect } from 'vitest';

describe('Extension Setup', () => {
    it('should have a working test environment', () => {
        expect(true).toBe(true);
    });

    it('should support basic TypeScript features', () => {
        const testObject = { name: 'test', value: 42 };
        expect(testObject.name).toBe('test');
        expect(testObject.value).toBe(42);
    });
});
