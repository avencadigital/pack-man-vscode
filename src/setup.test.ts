import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Property-Based Testing Setup', () => {
    it('should support fast-check property tests', () => {
        fc.assert(
            fc.property(fc.integer(), fc.integer(), (a, b) => {
                return a + b === b + a; // Commutative property of addition
            }),
            { numRuns: 100 }
        );
    });

    it('should generate random strings', () => {
        fc.assert(
            fc.property(fc.string(), (str) => {
                return typeof str === 'string';
            }),
            { numRuns: 100 }
        );
    });

    it('should generate random objects', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: fc.string(),
                    age: fc.integer({ min: 0, max: 120 })
                }),
                (obj) => {
                    return typeof obj.name === 'string' && obj.age >= 0 && obj.age <= 120;
                }
            ),
            { numRuns: 100 }
        );
    });
});
