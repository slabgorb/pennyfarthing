/**
 * Scenario Schema Tests
 * Story 43-1: Add red_herrings schema to scenarios
 *
 * RED phase: These tests define the expected behavior for scenario
 * schema validation with the new red_herrings field.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateScenario } from './scenario-schema.js';

describe('scenario-schema', () => {
  describe('basic scenario validation', () => {
    it('should validate a scenario with name and title', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject a scenario missing name', () => {
      const result = validateScenario({
        title: 'Order Service Code Review',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field === 'name'));
    });

    it('should reject a scenario missing title', () => {
      const result = validateScenario({
        name: 'order-service-review',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field === 'title'));
    });

    it('should reject non-object input', () => {
      const result = validateScenario(null);
      assert.strictEqual(result.valid, false);

      const result2 = validateScenario('not an object');
      assert.strictEqual(result2.valid, false);
    });
  });

  describe('red_herrings field — backward compatibility', () => {
    it('should validate a scenario without red_herrings (optional field)', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should validate a scenario with empty red_herrings array', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [],
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  describe('red_herrings field — valid entries', () => {
    it('should validate a scenario with well-formed red_herrings', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [
          {
            description: 'Unused import that is actually used via reflection',
            location: 'line 12',
            trap_type: 'false-unused',
          },
          {
            description: 'Magic number that is actually a well-known HTTP status',
            location: 'line 45',
            trap_type: 'false-magic-number',
          },
        ],
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should validate a single red herring entry with all required fields', () => {
      const result = validateScenario({
        name: 'test-scenario',
        title: 'Test',
        red_herrings: [
          {
            description: 'Something misleading',
            location: 'line 1',
            trap_type: 'false-positive',
          },
        ],
      });
      assert.strictEqual(result.valid, true);
    });
  });

  describe('red_herrings field — missing required subfields', () => {
    it('should reject red herring entry missing description', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [
          {
            location: 'line 12',
            trap_type: 'false-unused',
          },
        ],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field.includes('description')));
    });

    it('should reject red herring entry missing location', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [
          {
            description: 'Unused import used via reflection',
            trap_type: 'false-unused',
          },
        ],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field.includes('location')));
    });

    it('should reject red herring entry missing trap_type', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [
          {
            description: 'Unused import used via reflection',
            location: 'line 12',
          },
        ],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field.includes('trap_type')));
    });

    it('should report errors for multiple missing fields in one entry', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [
          {
            description: 'Only description provided',
          },
        ],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field.includes('location')));
      assert.ok(result.errors.some(e => e.field.includes('trap_type')));
    });
  });

  describe('red_herrings field — edge cases', () => {
    it('should reject red_herrings that is not an array', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: 'not an array',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field === 'red_herrings'));
    });

    it('should reject red herring entry that is not an object', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: ['just a string'],
      });
      assert.strictEqual(result.valid, false);
    });

    it('should reject empty string values for required fields', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [
          {
            description: '',
            location: 'line 12',
            trap_type: 'false-unused',
          },
        ],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.field.includes('description')));
    });

    it('should validate multiple entries and report all errors', () => {
      const result = validateScenario({
        name: 'order-service-review',
        title: 'Order Service Code Review',
        red_herrings: [
          {
            description: 'Valid entry',
            location: 'line 1',
            trap_type: 'false-positive',
          },
          {
            description: 'Missing location and trap_type',
          },
        ],
      });
      assert.strictEqual(result.valid, false);
      // First entry is valid, second has errors
      assert.ok(result.errors.length >= 2);
    });
  });
});
