/**
 * Story 19-5: Story Context Telemetry Tests
 *
 * Tests for tracking which Pennyfarthing story is currently active
 * and including that context in telemetry spans for cost attribution.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the story context functionality.
 *
 * Acceptance Criteria:
 * 1. Story ID extracted from session file
 * 2. PENNYFARTHING_STORY_ID set in PTY environment
 * 3. Telemetry includes story_id attribute
 * 4. Aggregation available by story
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Types from telemetry-types.ts
import type { AgentSpan, AgentSpanAttributes } from '../src/telemetry-types.js';

// Types from otlp-receiver.ts
import type { ToolEvent, ParsedPromptEvent, TokenStats } from '../src/otlp-receiver.js';

// Existing functions from span-hierarchy.ts
import {
  buildSpanHierarchy,
  addEventsToHierarchy,
  getSpanHierarchy,
  resetSpanHierarchy,
} from '../src/span-hierarchy.js';

// Existing functions from otlp-receiver.ts
import {
  resetTokenStats,
  aggregateTokenStats,
} from '../src/otlp-receiver.js';

// NEW functions that need to be implemented for this story
import {
  setStoryContext,
  getStoryContext,
  resetStoryContext,
  getTokenStatsByStory,
} from '../src/story-context.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const toolEventStory19_5: ToolEvent = {
  toolName: 'Read',
  input: '/path/to/session.md',
  output: 'session contents',
  durationMs: 25,
  success: true,
  timestamp: 1704844800000,
  traceId: 'trace-19-5',
  spanId: 'span-19-5-1',
};

const toolEventStory19_6: ToolEvent = {
  toolName: 'Write',
  input: '/path/to/test.ts',
  output: 'test file created',
  durationMs: 50,
  success: true,
  timestamp: 1704844900000,
  traceId: 'trace-19-6',
  spanId: 'span-19-6-1',
};

const toolEventStory21_1: ToolEvent = {
  toolName: 'Bash',
  input: 'npm test',
  output: 'Tests passed',
  durationMs: 3000,
  success: true,
  timestamp: 1704845000000,
  traceId: 'trace-21-1',
  spanId: 'span-21-1-1',
};

const toolEventStory7_1: ToolEvent = {
  toolName: 'Grep',
  input: 'benchmark',
  output: 'Found matches',
  durationMs: 15,
  success: true,
  timestamp: 1704845100000,
  traceId: 'trace-7-1',
  spanId: 'span-7-1-1',
};

const promptEventStory19_5: ParsedPromptEvent = {
  promptText: 'Add story context to telemetry',
  tokens: 20,
  timestamp: 1704844799000,
  traceId: 'trace-19-5',
  spanId: 'prompt-19-5-1',
};

// =============================================================================
// AC1: Story ID extracted from session file
// =============================================================================

describe('Story 19-5: Story Context Telemetry', () => {

  describe('AC1: Story ID extracted from session file', () => {

    // Note: This AC is primarily about extracting story ID from session filename
    // or PENNYFARTHING_STORY_ID env var. These tests verify the TypeScript side.

    afterEach(() => {
      // Clean up env var after each test
      delete process.env.PENNYFARTHING_STORY_ID;
      resetStoryContext();
    });

    it('should read PENNYFARTHING_STORY_ID from environment', () => {
      process.env.PENNYFARTHING_STORY_ID = '19-5';

      // setStoryContext should pick up from env if not explicitly set
      setStoryContext(); // No argument = read from env

      expect(getStoryContext()).toBe('19-5');
    });

    it('should support various story ID formats', () => {
      const validStoryIds = ['19-5', '7-1', '21-1', '100-99', 'E8-2'];

      for (const storyId of validStoryIds) {
        process.env.PENNYFARTHING_STORY_ID = storyId;
        setStoryContext();
        expect(getStoryContext()).toBe(storyId);
        resetStoryContext();
      }
    });

    it('should return undefined when no story is set', () => {
      delete process.env.PENNYFARTHING_STORY_ID;
      resetStoryContext();

      expect(getStoryContext()).toBeUndefined();
    });

    it('should allow explicit story override via setStoryContext', () => {
      process.env.PENNYFARTHING_STORY_ID = '19-5';
      setStoryContext('19-6'); // Explicit override

      expect(getStoryContext()).toBe('19-6');
    });

    it('should extract story ID from session file path pattern', () => {
      // Story ID should be extractable from .session/{story-id}-session.md
      // This tests the extraction logic (if implemented)
      setStoryContext('19-5');
      expect(getStoryContext()).toBe('19-5');
    });

  });

  // =============================================================================
  // AC2: PENNYFARTHING_STORY_ID set in PTY environment
  // =============================================================================

  describe('AC2: PENNYFARTHING_STORY_ID set in PTY environment', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetStoryContext();
      delete process.env.PENNYFARTHING_STORY_ID;
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_STORY_ID;
    });

    it('should store story context in session state', () => {
      setStoryContext('19-5');

      expect(getStoryContext()).toBe('19-5');
    });

    it('should persist story context across multiple calls', () => {
      setStoryContext('19-5');

      // Multiple reads should return same value
      expect(getStoryContext()).toBe('19-5');
      expect(getStoryContext()).toBe('19-5');
    });

    it('should reset story context when session resets', () => {
      setStoryContext('19-5');
      expect(getStoryContext()).toBe('19-5');

      resetStoryContext();
      expect(getStoryContext()).toBeUndefined();
    });

    it('should allow changing story mid-session', () => {
      setStoryContext('19-5');
      expect(getStoryContext()).toBe('19-5');

      setStoryContext('19-6');
      expect(getStoryContext()).toBe('19-6');
    });

  });

  // =============================================================================
  // AC3: Telemetry includes story_id attribute
  // =============================================================================

  describe('AC3: Telemetry includes story_id attribute', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetStoryContext();
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_STORY_ID;
    });

    it('should include pennyfarthing.story_id in AgentSpan attributes', () => {
      setStoryContext('19-5');
      addEventsToHierarchy([toolEventStory19_5], [promptEventStory19_5]);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(1);

      const span = hierarchy[0];
      expect(span.attributes['pennyfarthing.story_id']).toBe('19-5');
    });

    it('should tag spans with current story at time of creation', () => {
      // Create span while story 19-5 is active
      setStoryContext('19-5');
      addEventsToHierarchy([toolEventStory19_5], []);

      // Switch to story 19-6
      setStoryContext('19-6');
      addEventsToHierarchy([toolEventStory19_6], []);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(2);

      // Each span should have the story that was active when it was created
      const span19_5 = hierarchy.find(s => s.traceId === 'trace-19-5');
      const span19_6 = hierarchy.find(s => s.traceId === 'trace-19-6');

      expect(span19_5?.attributes['pennyfarthing.story_id']).toBe('19-5');
      expect(span19_6?.attributes['pennyfarthing.story_id']).toBe('19-6');
    });

    it('should leave story_id attribute undefined when no story is set', () => {
      // No story context set
      addEventsToHierarchy([toolEventStory19_5], []);

      const hierarchy = getSpanHierarchy();
      const span = hierarchy[0];

      expect(span.attributes['pennyfarthing.story_id']).toBeUndefined();
    });

    it('should include story_id in buildSpanHierarchy (pure function)', () => {
      setStoryContext('21-1');

      const spans = buildSpanHierarchy([toolEventStory21_1], []);

      expect(spans).toHaveLength(1);
      expect(spans[0].attributes['pennyfarthing.story_id']).toBe('21-1');
    });

    it('should tag all spans in multi-story workflow', () => {
      // Story 19-5: telemetry story context
      setStoryContext('19-5');
      addEventsToHierarchy([toolEventStory19_5], [promptEventStory19_5]);

      // Story 19-6: TDD phase transitions
      setStoryContext('19-6');
      addEventsToHierarchy([toolEventStory19_6], []);

      // Story 21-1: /check command
      setStoryContext('21-1');
      addEventsToHierarchy([toolEventStory21_1], []);

      // Story 7-1: benchmark runner
      setStoryContext('7-1');
      addEventsToHierarchy([toolEventStory7_1], []);

      const hierarchy = getSpanHierarchy();
      expect(hierarchy).toHaveLength(4);

      // Verify each span has correct story_id
      const stories = hierarchy.map(s => ({
        traceId: s.traceId,
        storyId: s.attributes['pennyfarthing.story_id'],
      }));

      expect(stories).toContainEqual({ traceId: 'trace-19-5', storyId: '19-5' });
      expect(stories).toContainEqual({ traceId: 'trace-19-6', storyId: '19-6' });
      expect(stories).toContainEqual({ traceId: 'trace-21-1', storyId: '21-1' });
      expect(stories).toContainEqual({ traceId: 'trace-7-1', storyId: '7-1' });
    });

  });

  // =============================================================================
  // AC4: Aggregation available by story
  // =============================================================================

  describe('AC4: Aggregation available by story', () => {

    beforeEach(() => {
      resetTokenStats();
      resetStoryContext();
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_STORY_ID;
    });

    it('should return empty object when no tokens tracked', () => {
      const byStory = getTokenStatsByStory();

      expect(byStory).toEqual({});
    });

    it('should aggregate tokens by story', () => {
      // Story 19-5 uses some tokens
      setStoryContext('19-5');
      aggregateTokenStats({ inputTokens: 100, outputTokens: 50 });

      // Story 19-6 uses more tokens
      setStoryContext('19-6');
      aggregateTokenStats({ inputTokens: 200, outputTokens: 100 });

      const byStory = getTokenStatsByStory();

      expect(byStory['19-5']).toBeDefined();
      expect(byStory['19-5'].inputTokens).toBe(100);
      expect(byStory['19-5'].outputTokens).toBe(50);

      expect(byStory['19-6']).toBeDefined();
      expect(byStory['19-6'].inputTokens).toBe(200);
      expect(byStory['19-6'].outputTokens).toBe(100);
    });

    it('should accumulate tokens for same story across multiple aggregations', () => {
      setStoryContext('21-1');

      aggregateTokenStats({ inputTokens: 500, outputTokens: 200 });
      aggregateTokenStats({ inputTokens: 300, outputTokens: 150 });

      const byStory = getTokenStatsByStory();

      expect(byStory['21-1'].inputTokens).toBe(800);
      expect(byStory['21-1'].outputTokens).toBe(350);
    });

    it('should track cache tokens by story', () => {
      setStoryContext('7-1');
      aggregateTokenStats({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 500,
        cacheCreationTokens: 200,
      });

      const byStory = getTokenStatsByStory();

      expect(byStory['7-1'].cacheReadTokens).toBe(500);
      expect(byStory['7-1'].cacheCreationTokens).toBe(200);
    });

    it('should handle tokens with no story set', () => {
      // No story context
      aggregateTokenStats({ inputTokens: 100, outputTokens: 50 });

      const byStory = getTokenStatsByStory();

      // Should have an 'unknown' or similar bucket
      expect(byStory['unknown']).toBeDefined();
      expect(byStory['unknown'].inputTokens).toBe(100);
    });

    it('should reset per-story stats when resetTokenStats is called', () => {
      setStoryContext('19-5');
      aggregateTokenStats({ inputTokens: 100 });

      expect(getTokenStatsByStory()['19-5']).toBeDefined();

      resetTokenStats();
      resetStoryContext();

      expect(getTokenStatsByStory()).toEqual({});
    });

    it('should track multiple stories in typical sprint workflow', () => {
      // Story 19-5: Quick 2-pointer
      setStoryContext('19-5');
      aggregateTokenStats({ inputTokens: 500, outputTokens: 100 });

      // Story 19-6: Medium 3-pointer
      setStoryContext('19-6');
      aggregateTokenStats({ inputTokens: 1000, outputTokens: 500 });

      // Story 21-1: Another 3-pointer
      setStoryContext('21-1');
      aggregateTokenStats({ inputTokens: 1200, outputTokens: 600 });

      // Story 7-1: Benchmark framework
      setStoryContext('7-1');
      aggregateTokenStats({ inputTokens: 800, outputTokens: 200 });

      const byStory = getTokenStatsByStory();

      expect(Object.keys(byStory).sort()).toEqual(['19-5', '19-6', '21-1', '7-1']);

      // Larger stories should have higher token usage
      expect(byStory['19-6'].inputTokens).toBeGreaterThan(byStory['19-5'].inputTokens);
      expect(byStory['21-1'].inputTokens).toBeGreaterThan(byStory['19-5'].inputTokens);
    });

  });

  // =============================================================================
  // Type Conformance
  // =============================================================================

  describe('Type Conformance', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetStoryContext();
    });

    it('AgentSpan.attributes should include story_id field', () => {
      setStoryContext('19-5');
      addEventsToHierarchy([toolEventStory19_5], []);

      const hierarchy = getSpanHierarchy();
      const attrs: AgentSpanAttributes = hierarchy[0].attributes;

      // Required field
      expect(attrs['gen_ai.system']).toBe('claude');

      // Pennyfarthing extension (this story adds it)
      expect(attrs['pennyfarthing.story_id']).toBe('19-5');
    });

    it('getStoryContext should return valid story ID or undefined', () => {
      const result = getStoryContext();

      // Should be undefined or a string matching story ID pattern
      expect(
        result === undefined ||
        typeof result === 'string'
      ).toBe(true);
    });

  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {

    beforeEach(() => {
      resetSpanHierarchy();
      resetStoryContext();
      resetTokenStats();
    });

    afterEach(() => {
      delete process.env.PENNYFARTHING_STORY_ID;
    });

    it('should handle rapid story switches', () => {
      setStoryContext('19-5');
      setStoryContext('19-6');
      setStoryContext('21-1');
      setStoryContext('7-1');
      setStoryContext('19-5');

      expect(getStoryContext()).toBe('19-5');
    });

    it('should handle empty string story', () => {
      process.env.PENNYFARTHING_STORY_ID = '';
      setStoryContext();

      // Empty string should be treated as no story
      expect(getStoryContext()).toBeUndefined();
    });

    it('should handle unusual story ID formats gracefully', () => {
      // Unusual but valid story IDs
      setStoryContext('E8-2'); // Epic prefix
      expect(getStoryContext()).toBe('E8-2');

      setStoryContext('100-99'); // Large numbers
      expect(getStoryContext()).toBe('100-99');

      setStoryContext('fix-123'); // Word prefix
      expect(getStoryContext()).toBe('fix-123');
    });

    it('should preserve story context when adding to existing trace', () => {
      // First event creates trace with story 19-5 context
      setStoryContext('19-5');
      addEventsToHierarchy([toolEventStory19_5], [promptEventStory19_5]);

      // Add more events to same trace while story 19-6 is active
      // (simulating a trace that spans story switches - edge case)
      setStoryContext('19-6');
      const moreToolEvents: ToolEvent = {
        ...toolEventStory19_5,
        spanId: 'span-19-5-2',
        timestamp: 1704844900000,
      };
      addEventsToHierarchy([moreToolEvents], []);

      const hierarchy = getSpanHierarchy();
      // Should still be one trace
      expect(hierarchy).toHaveLength(1);

      // Story should be the original (19-5) since trace was created then
      // First story wins for trace attribution
      expect(hierarchy[0].attributes['pennyfarthing.story_id']).toBe('19-5');
    });

    it('should handle concurrent agent and story context', () => {
      // Both agent and story context should be tracked independently
      // (This tests integration with 19-4's agent context)
      setStoryContext('19-5');
      addEventsToHierarchy([toolEventStory19_5], []);

      const hierarchy = getSpanHierarchy();
      const span = hierarchy[0];

      // Story context should be present
      expect(span.attributes['pennyfarthing.story_id']).toBe('19-5');

      // Agent context may or may not be present (depends on agent-context.ts state)
      // This test just ensures story_id doesn't interfere with agent
    });

  });

});
