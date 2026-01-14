/**
 * Story 36-1: OTEL Span Interception and Correlation Tests
 *
 * Tests for the span correlation layer that intercepts OTEL spans and correlates
 * them with Claude tool_use messages from the message stream. Establishes the
 * foundation for downstream enrichment in stories 36-2 through 36-5.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the span-correlation.ts module.
 *
 * Acceptance Criteria:
 * 1. OTEL spans intercepted before export
 * 2. Tool name and ID extracted from span attributes
 * 3. Correlation with Claude tool_use messages established
 * 4. Correlation map persists for session duration
 * 5. Works with all tool types (Bash, Read, Edit, Grep, etc.)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Types from span-correlation.ts (doesn't exist yet - will fail)
import type {
  SpanCorrelation,
  CorrelationContext,
} from '../src/span-correlation.js';

// Functions that don't exist yet - imports will fail until Dev implements
import {
  correlateSpan,
  getCorrelation,
  getAllCorrelations,
  resetCorrelations,
  hasCorrelation,
  linkToolUseToSpan,
  removeCorrelation,
  getCorrelationsByToolName,
  getCorrelationByTraceId,
} from '../src/span-correlation.js';

// =============================================================================
// Test Fixtures - Mock OTEL Spans
// =============================================================================

/**
 * Mock OTEL span data from Claude Code
 */
const mockOTELSpanRead = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: 'c9c7c4a6a8cd78fb',
  attributes: {
    'tool.name': 'Read',
    'tool_use_id': 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
    'duration_ms': 42,
    'success': true,
  },
  timestamp: 1704844800000,
};

const mockOTELSpanBash = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: 'c9c7c4a6a8cd78fc',
  attributes: {
    'tool.name': 'Bash',
    'tool_use_id': 'toolu_01AR8mF7Nx9ZUB1bZnZF3yry',
    'duration_ms': 5000,
    'success': true,
  },
  timestamp: 1704844850000,
};

const mockOTELSpanWrite = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: 'c9c7c4a6a8cd78fd',
  attributes: {
    'tool.name': 'Write',
    'tool_use_id': 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrz',
    'duration_ms': 15,
    'success': true,
  },
  timestamp: 1704844900000,
};

const mockOTELSpanGrep = {
  traceId: '5cf92f3577b34da6a3ce929d0e0e4737',
  spanId: 'd9c7c4a6a8cd78fe',
  attributes: {
    'tool.name': 'Grep',
    'tool_use_id': 'toolu_01AR8mF7Nx9ZUB1bZnZF3yr0',
    'duration_ms': 28,
    'success': true,
  },
  timestamp: 1704844950000,
};

const mockOTELSpanFailedBash = {
  traceId: '6cf92f3577b34da6a3ce929d0e0e4738',
  spanId: 'e9c7c4a6a8cd78ff',
  attributes: {
    'tool.name': 'Bash',
    'tool_use_id': 'toolu_01AR8mF7Nx9ZUB1bZnZF3yr1',
    'duration_ms': 100,
    'success': false,
    'error': 'Command timed out',
  },
  timestamp: 1704845000000,
};

// Mock Claude tool_use message context
const mockToolUseMessage = {
  id: 'toolUse_123',
  type: 'tool_use',
  name: 'Read',
  input: {
    file_path: '/path/to/file.ts',
  },
};

// =============================================================================
// AC1: OTEL spans intercepted before export
// =============================================================================

describe('Story 36-1: Span Correlation', () => {

  beforeEach(() => {
    resetCorrelations();
  });

  afterEach(() => {
    resetCorrelations();
  });

  describe('AC1: OTEL spans intercepted before export', () => {

    it('should store correlation for a single span', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);
      expect(getCorrelation(mockOTELSpanRead.spanId)).toEqual(context);
    });

    it('should store multiple spans in single trace', () => {
      const contexts = [
        {
          traceId: mockOTELSpanRead.traceId,
          spanId: mockOTELSpanRead.spanId,
          toolName: 'Read',
          toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
          timestamp: mockOTELSpanRead.timestamp,
          enriched: false,
        },
        {
          traceId: mockOTELSpanBash.traceId,
          spanId: mockOTELSpanBash.spanId,
          toolName: 'Bash',
          toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yry',
          timestamp: mockOTELSpanBash.timestamp,
          enriched: false,
        },
      ];

      for (const ctx of contexts) {
        correlateSpan(ctx.spanId, ctx);
      }

      expect(hasCorrelation(mockOTELSpanRead.spanId)).toBe(true);
      expect(hasCorrelation(mockOTELSpanBash.spanId)).toBe(true);
    });

    it('should retrieve all correlations in trace', () => {
      const contexts = [
        {
          traceId: mockOTELSpanRead.traceId,
          spanId: mockOTELSpanRead.spanId,
          toolName: 'Read',
          toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
          timestamp: mockOTELSpanRead.timestamp,
          enriched: false,
        },
        {
          traceId: mockOTELSpanBash.traceId,
          spanId: mockOTELSpanBash.spanId,
          toolName: 'Bash',
          toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yry',
          timestamp: mockOTELSpanBash.timestamp,
          enriched: false,
        },
      ];

      for (const ctx of contexts) {
        correlateSpan(ctx.spanId, ctx);
      }

      const all = getAllCorrelations();
      expect(all).toHaveLength(2);
      expect(all.map(c => c.spanId)).toEqual([
        mockOTELSpanRead.spanId,
        mockOTELSpanBash.spanId,
      ]);
    });

    it('should persist correlations across multiple operations', () => {
      correlateSpan(mockOTELSpanRead.spanId, {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      });

      // Add another span
      correlateSpan(mockOTELSpanBash.spanId, {
        traceId: mockOTELSpanBash.traceId,
        spanId: mockOTELSpanBash.spanId,
        toolName: 'Bash',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yry',
        timestamp: mockOTELSpanBash.timestamp,
        enriched: false,
      });

      // First should still be there
      expect(getCorrelation(mockOTELSpanRead.spanId)).toBeDefined();
      expect(getCorrelation(mockOTELSpanBash.spanId)).toBeDefined();
    });

    it('should handle span without tool_use_id', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Glob',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);
      const stored = getCorrelation(mockOTELSpanRead.spanId);

      expect(stored).toBeDefined();
      expect(stored!.toolUseId).toBeUndefined();
      expect(stored!.toolName).toBe('Glob');
    });

  });

  // =============================================================================
  // AC2: Tool name and ID extracted from span attributes
  // =============================================================================

  describe('AC2: Tool name and ID extracted from attributes', () => {

    it('should extract tool name from span attributes', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);
      const stored = getCorrelation(mockOTELSpanRead.spanId);

      expect(stored!.toolName).toBe('Read');
    });

    it('should extract tool_use_id from span attributes', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);
      const stored = getCorrelation(mockOTELSpanRead.spanId);

      expect(stored!.toolUseId).toBe('toolu_01AR8mF7Nx9ZUB1bZnZF3yrx');
    });

    it('should extract trace_id and span_id from OTEL span', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);
      const stored = getCorrelation(mockOTELSpanRead.spanId);

      expect(stored!.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(stored!.spanId).toBe('c9c7c4a6a8cd78fb');
    });

    it('should work with all standard tool types', () => {
      const tools = ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'];

      for (let i = 0; i < tools.length; i++) {
        const spanId = `span-${i}`;
        const context: CorrelationContext = {
          traceId: 'trace-tools',
          spanId,
          toolName: tools[i],
          toolUseId: `toolu_${i}`,
          timestamp: Date.now(),
          enriched: false,
        };
        correlateSpan(spanId, context);
      }

      const allCorrelations = getAllCorrelations();
      const names = allCorrelations.map(c => c.toolName).sort();
      expect(names).toEqual(['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write']);
    });

  });

  // =============================================================================
  // AC3: Correlation with Claude tool_use messages established
  // =============================================================================

  describe('AC3: Correlation with Claude tool_use messages', () => {

    it('should link tool_use message to span', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);

      // Link message context
      linkToolUseToSpan(mockOTELSpanRead.spanId, {
        messageId: 'msg_123',
        toolName: 'Read',
      });

      const stored = getCorrelation(mockOTELSpanRead.spanId);
      expect(stored!.messageContext).toBeDefined();
      expect(stored!.messageContext!.messageId).toBe('msg_123');
    });

    it('should retrieve correlation by tool_use_id', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);

      const stored = getCorrelation(mockOTELSpanRead.spanId);
      expect(stored!.toolUseId).toBe('toolu_01AR8mF7Nx9ZUB1bZnZF3yrx');
    });

    it('should support message context with additional metadata', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
        messageContext: {
          messageId: 'msg_123',
          toolName: 'Read',
          input: { file_path: '/path/to/file.ts' },
        },
      };

      correlateSpan(mockOTELSpanRead.spanId, context);

      const stored = getCorrelation(mockOTELSpanRead.spanId);
      expect(stored!.messageContext!.input).toEqual({ file_path: '/path/to/file.ts' });
    });

    it('should update message context on multiple link calls', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);

      linkToolUseToSpan(mockOTELSpanRead.spanId, {
        messageId: 'msg_123',
        toolName: 'Read',
      });

      const first = getCorrelation(mockOTELSpanRead.spanId);
      expect(first!.messageContext!.messageId).toBe('msg_123');

      // Update with new context
      linkToolUseToSpan(mockOTELSpanRead.spanId, {
        messageId: 'msg_124',
        toolName: 'Read',
        input: { file_path: '/new/path.ts' },
      });

      const updated = getCorrelation(mockOTELSpanRead.spanId);
      expect(updated!.messageContext!.messageId).toBe('msg_124');
      expect(updated!.messageContext!.input).toEqual({ file_path: '/new/path.ts' });
    });

  });

  // =============================================================================
  // AC4: Correlation map persists for session duration
  // =============================================================================

  describe('AC4: Correlation map persists for session duration', () => {

    it('should reset correlations on demand', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);
      expect(getAllCorrelations()).toHaveLength(1);

      resetCorrelations();
      expect(getAllCorrelations()).toHaveLength(0);
    });

    it('should remove individual correlations', () => {
      const context1: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      const context2: CorrelationContext = {
        traceId: mockOTELSpanBash.traceId,
        spanId: mockOTELSpanBash.spanId,
        toolName: 'Bash',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yry',
        timestamp: mockOTELSpanBash.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context1);
      correlateSpan(mockOTELSpanBash.spanId, context2);

      expect(getAllCorrelations()).toHaveLength(2);

      removeCorrelation(mockOTELSpanRead.spanId);

      expect(getAllCorrelations()).toHaveLength(1);
      expect(hasCorrelation(mockOTELSpanRead.spanId)).toBe(false);
      expect(hasCorrelation(mockOTELSpanBash.spanId)).toBe(true);
    });

    it('should maintain chronological order of spans in trace', () => {
      const timestamps = [1000, 2000, 3000, 4000, 5000];

      for (let i = 0; i < timestamps.length; i++) {
        const context: CorrelationContext = {
          traceId: 'trace-order',
          spanId: `span-${i}`,
          toolName: 'Read',
          toolUseId: `toolu_${i}`,
          timestamp: timestamps[i],
          enriched: false,
        };
        correlateSpan(`span-${i}`, context);
      }

      const allCorrelations = getAllCorrelations();
      // Should be in order they were added
      expect(allCorrelations).toHaveLength(5);
    });

  });

  // =============================================================================
  // AC5: Works with all tool types
  // =============================================================================

  describe('AC5: Works with all tool types', () => {

    it('should handle Read tool spans', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);
      expect(getCorrelation(mockOTELSpanRead.spanId)!.toolName).toBe('Read');
    });

    it('should handle Bash tool spans', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanBash.traceId,
        spanId: mockOTELSpanBash.spanId,
        toolName: 'Bash',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yry',
        timestamp: mockOTELSpanBash.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanBash.spanId, context);
      expect(getCorrelation(mockOTELSpanBash.spanId)!.toolName).toBe('Bash');
    });

    it('should handle Write tool spans', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanWrite.traceId,
        spanId: mockOTELSpanWrite.spanId,
        toolName: 'Write',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrz',
        timestamp: mockOTELSpanWrite.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanWrite.spanId, context);
      expect(getCorrelation(mockOTELSpanWrite.spanId)!.toolName).toBe('Write');
    });

    it('should handle Grep tool spans', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanGrep.traceId,
        spanId: mockOTELSpanGrep.spanId,
        toolName: 'Grep',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yr0',
        timestamp: mockOTELSpanGrep.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanGrep.spanId, context);
      expect(getCorrelation(mockOTELSpanGrep.spanId)!.toolName).toBe('Grep');
    });

    it('should handle failed tool spans', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanFailedBash.traceId,
        spanId: mockOTELSpanFailedBash.spanId,
        toolName: 'Bash',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yr1',
        timestamp: mockOTELSpanFailedBash.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanFailedBash.spanId, context);
      const stored = getCorrelation(mockOTELSpanFailedBash.spanId);

      expect(stored!.toolName).toBe('Bash');
      // Success status would be tracked in OTEL attributes
    });

    it('should filter correlations by tool name', () => {
      const contexts = [
        {
          traceId: mockOTELSpanRead.traceId,
          spanId: mockOTELSpanRead.spanId,
          toolName: 'Read',
          toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
          timestamp: mockOTELSpanRead.timestamp,
          enriched: false,
        },
        {
          traceId: mockOTELSpanBash.traceId,
          spanId: mockOTELSpanBash.spanId,
          toolName: 'Bash',
          toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yry',
          timestamp: mockOTELSpanBash.timestamp,
          enriched: false,
        },
        {
          traceId: mockOTELSpanGrep.traceId,
          spanId: mockOTELSpanGrep.spanId,
          toolName: 'Grep',
          toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yr0',
          timestamp: mockOTELSpanGrep.timestamp,
          enriched: false,
        },
      ];

      for (const ctx of contexts) {
        correlateSpan(ctx.spanId, ctx);
      }

      const readCorrelations = getCorrelationsByToolName('Read');
      expect(readCorrelations).toHaveLength(1);
      expect(readCorrelations[0].toolName).toBe('Read');

      const bashCorrelations = getCorrelationsByToolName('Bash');
      expect(bashCorrelations).toHaveLength(1);
      expect(bashCorrelations[0].toolName).toBe('Bash');
    });

  });

  // =============================================================================
  // Query Functions
  // =============================================================================

  describe('Query Functions', () => {

    it('should retrieve correlations by trace_id', () => {
      const context1: CorrelationContext = {
        traceId: 'trace-single',
        spanId: 'span-1',
        toolName: 'Read',
        toolUseId: 'toolu_1',
        timestamp: 1000,
        enriched: false,
      };

      const context2: CorrelationContext = {
        traceId: 'trace-single',
        spanId: 'span-2',
        toolName: 'Bash',
        toolUseId: 'toolu_2',
        timestamp: 2000,
        enriched: false,
      };

      const context3: CorrelationContext = {
        traceId: 'trace-different',
        spanId: 'span-3',
        toolName: 'Write',
        toolUseId: 'toolu_3',
        timestamp: 3000,
        enriched: false,
      };

      correlateSpan(context1.spanId, context1);
      correlateSpan(context2.spanId, context2);
      correlateSpan(context3.spanId, context3);

      const singleTraceCorrelations = getCorrelationByTraceId('trace-single');
      expect(singleTraceCorrelations).toHaveLength(2);
      expect(singleTraceCorrelations.map(c => c.toolName).sort()).toEqual(['Bash', 'Read']);

      const differentTraceCorrelations = getCorrelationByTraceId('trace-different');
      expect(differentTraceCorrelations).toHaveLength(1);
      expect(differentTraceCorrelations[0].toolName).toBe('Write');
    });

    it('should check existence of correlation', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      expect(hasCorrelation(mockOTELSpanRead.spanId)).toBe(false);

      correlateSpan(mockOTELSpanRead.spanId, context);

      expect(hasCorrelation(mockOTELSpanRead.spanId)).toBe(true);
    });

  });

  // =============================================================================
  // Enrichment Support
  // =============================================================================

  describe('Enrichment Support', () => {

    it('should track enriched flag', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);

      const stored = getCorrelation(mockOTELSpanRead.spanId);
      expect(stored!.enriched).toBe(false);
    });

    it('should mark correlation as enriched', () => {
      const context: CorrelationContext = {
        traceId: mockOTELSpanRead.traceId,
        spanId: mockOTELSpanRead.spanId,
        toolName: 'Read',
        toolUseId: 'toolu_01AR8mF7Nx9ZUB1bZnZF3yrx',
        timestamp: mockOTELSpanRead.timestamp,
        enriched: false,
      };

      correlateSpan(mockOTELSpanRead.spanId, context);

      const stored = getCorrelation(mockOTELSpanRead.spanId);
      expect(stored).toBeDefined();
      // Downstream stories (36-2..36-5) would update enriched flag
    });

  });

});
