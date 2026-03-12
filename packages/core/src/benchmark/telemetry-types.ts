/**
 * Telemetry Types - OpenTelemetry semantic conventions for GenAI
 *
 * Defines TypeScript interfaces for rich telemetry following OTEL gen_ai.*
 * semantic conventions. These types are foundational for all Epic 19 stories.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 * @see https://github.com/TechNickAI/claude_telemetry (reference implementation)
 */

// =============================================================================
// Span Status Types
// =============================================================================

/**
 * Status of a telemetry span
 */
export type SpanStatus = 'running' | 'completed' | 'error';

// =============================================================================
// OTEL gen_ai.* Semantic Convention Attributes
// =============================================================================

/**
 * OTEL gen_ai.* semantic convention attributes for agent spans
 *
 * These follow the OpenTelemetry GenAI semantic conventions:
 * - gen_ai.system: The AI system being used
 * - gen_ai.request.model: Model identifier
 * - gen_ai.usage.*: Token usage metrics
 *
 * Extended with Pennyfarthing-specific attributes for agent/story context.
 */
export interface AgentSpanAttributes {
  /** AI system identifier - always 'claude' for Claude Code */
  'gen_ai.system': 'claude';

  /** Model identifier (e.g., 'claude-sonnet-4-20250514') */
  'gen_ai.request.model': string;

  /** Number of input tokens used */
  'gen_ai.usage.input_tokens'?: number;

  /** Number of output tokens generated */
  'gen_ai.usage.output_tokens'?: number;

  /** Total cost in USD for this span */
  'gen_ai.usage.total_cost_usd'?: number;

  // Pennyfarthing extensions

  /** Active Pennyfarthing agent role (sm, tea, dev, reviewer) */
  'pennyfarthing.agent'?: string;

  /** Active story ID (e.g., '19-2') */
  'pennyfarthing.story_id'?: string;

  /** Current persona theme (e.g., 'shakespeare', '1984') */
  'pennyfarthing.theme'?: string;
}

/**
 * Attributes for tool execution spans
 */
export interface ToolSpanAttributes {
  /** Tool name (e.g., 'Read', 'Write', 'Bash', 'Grep') */
  'tool.name': string;

  /** Tool input (truncated for large inputs) */
  'tool.input'?: string;

  /** Tool output (truncated for large outputs) */
  'tool.output'?: string;

  /** Tool execution duration in milliseconds */
  'tool.duration_ms'?: number;

  /** Whether the tool execution succeeded */
  'tool.success': boolean;

  /** Error message if tool failed */
  'tool.error'?: string;
}

// =============================================================================
// Span Types
// =============================================================================

/**
 * Parent span for agent execution
 *
 * Represents a top-level agent session or major execution unit.
 * Contains child tool spans and prompt events.
 *
 * @example
 * ```typescript
 * const span: AgentSpan = {
 *   traceId: 'abc123',
 *   spanId: 'span456',
 *   name: 'claude.agent.run',
 *   startTime: Date.now(),
 *   attributes: {
 *     'gen_ai.system': 'claude',
 *     'gen_ai.request.model': 'claude-sonnet-4-20250514',
 *     'pennyfarthing.agent': 'dev',
 *     'pennyfarthing.story_id': '19-2',
 *   },
 *   events: [],
 *   childSpans: [],
 *   status: 'running',
 * };
 * ```
 */
export interface AgentSpan {
  /** Unique trace identifier (links related spans) */
  traceId: string;

  /** Unique span identifier */
  spanId: string;

  /** Parent span ID (undefined for root spans) */
  parentSpanId?: string;

  /** Span name (e.g., 'claude.agent.run') */
  name: string;

  /** Start time as Unix timestamp (milliseconds) */
  startTime: number;

  /** End time as Unix timestamp (milliseconds) */
  endTime?: number;

  /** OTEL gen_ai.* and Pennyfarthing attributes */
  attributes: AgentSpanAttributes;

  /** Prompt and completion events within this span */
  events: PromptEvent[];

  /** Child tool spans */
  childSpans: ToolSpan[];

  /** Current span status */
  status: SpanStatus;
}

/**
 * Child span for tool execution
 *
 * Represents a single tool call within an agent span.
 * Always has a parent span ID linking to the agent span.
 *
 * @example
 * ```typescript
 * const toolSpan: ToolSpan = {
 *   traceId: 'abc123',
 *   spanId: 'tool789',
 *   parentSpanId: 'span456',
 *   name: 'tool.Read',
 *   startTime: Date.now(),
 *   endTime: Date.now() + 50,
 *   attributes: {
 *     'tool.name': 'Read',
 *     'tool.input': '/path/to/file.ts',
 *     'tool.duration_ms': 50,
 *     'tool.success': true,
 *   },
 * };
 * ```
 */
export interface ToolSpan {
  /** Trace ID (matches parent AgentSpan) */
  traceId: string;

  /** Unique span identifier */
  spanId: string;

  /** Parent agent span ID (always present for tool spans) */
  parentSpanId: string;

  /** Span name (e.g., 'tool.Read', 'tool.Write') */
  name: string;

  /** Start time as Unix timestamp (milliseconds) */
  startTime: number;

  /** End time as Unix timestamp (milliseconds) */
  endTime?: number;

  /** Tool execution attributes */
  attributes: ToolSpanAttributes;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Event within an agent span (prompts, completions, markers)
 *
 * Events are point-in-time occurrences within a span, such as
 * user prompts, agent completions, or custom markers.
 *
 * @example
 * ```typescript
 * const event: PromptEvent = {
 *   name: 'user.prompt',
 *   timestamp: Date.now(),
 *   attributes: {
 *     'prompt.text': 'Create the telemetry types file',
 *     'prompt.tokens': 42,
 *   },
 * };
 * ```
 */
export interface PromptEvent {
  /** Event name (e.g., 'user.prompt', 'agent.completed', 'error.occurred') */
  name: string;

  /** Event timestamp as Unix timestamp (milliseconds) */
  timestamp: number;

  /** Event-specific attributes */
  attributes: Record<string, string | number | boolean>;
}

// =============================================================================
// Token & Cost Types
// =============================================================================

/**
 * Token usage breakdown
 *
 * Tracks token counts by category. Compatible with existing TokenStats
 * from otlp-receiver.ts but focused on the count fields only.
 */
export interface TokenUsage {
  /** Number of input tokens */
  inputTokens: number;

  /** Number of output tokens */
  outputTokens: number;

  /** Number of tokens read from cache */
  cacheReadTokens: number;

  /** Number of tokens written to cache */
  cacheCreationTokens: number;
}

/**
 * Cost attribution across agents and stories
 *
 * Enables cost tracking and attribution for billing,
 * budgeting, and efficiency analysis.
 *
 * @example
 * ```typescript
 * const costs: CostAttribution = {
 *   totalCostUsd: 0.42,
 *   byAgent: {
 *     'sm': 0.05,
 *     'tea': 0.12,
 *     'dev': 0.20,
 *     'reviewer': 0.05,
 *   },
 *   byStory: {
 *     '19-1': 0.15,
 *     '19-2': 0.27,
 *   },
 * };
 * ```
 */
export interface CostAttribution {
  /** Total cost in USD */
  totalCostUsd: number;

  /** Cost breakdown by agent role */
  byAgent: Record<string, number>;

  /** Cost breakdown by story ID */
  byStory: Record<string, number>;
}

// =============================================================================
// Session & Aggregation Types
// =============================================================================

/**
 * Aggregated telemetry for a session
 *
 * Combines token usage, cost attribution, and span data
 * for a complete session overview.
 */
export interface SessionTelemetry {
  /** Session identifier */
  sessionId: string;

  /** Session start time */
  startTime: number;

  /** Session end time (if completed) */
  endTime?: number;

  /** Aggregated token usage */
  tokens: TokenUsage;

  /** Cost attribution data */
  costs: CostAttribution;

  /** Root agent spans for this session */
  spans: AgentSpan[];

  /** Current session status */
  status: SpanStatus;
}

// =============================================================================
// TDD Metrics Types (for Story 19-6)
// =============================================================================

/**
 * TDD phase timing metrics
 *
 * Tracks time spent in each TDD phase for efficiency analysis.
 */
export interface TDDMetrics {
  /** Story ID being tracked */
  storyId: string;

  /** RED phase duration (test writing) in milliseconds */
  redPhaseDurationMs?: number;

  /** GREEN phase duration (implementation) in milliseconds */
  greenPhaseDurationMs?: number;

  /** REVIEW phase duration in milliseconds */
  reviewPhaseDurationMs?: number;

  /** Total cycle time in milliseconds */
  totalCycleDurationMs?: number;

  /** Timestamps for phase transitions */
  phases: {
    redStart?: number;
    redEnd?: number;
    greenStart?: number;
    greenEnd?: number;
    reviewStart?: number;
    reviewEnd?: number;
  };
}

// =============================================================================
// Agent Evaluation Types (for Story 19-9)
// =============================================================================

/**
 * Quality signals for agent performance
 */
export interface QualitySignals {
  /** Whether tests are currently passing */
  testsPassing?: boolean;

  /** Rate of review approvals (0.0-1.0) */
  reviewApprovalRate?: number;

  /** Whether lint checks pass */
  lintClean?: boolean;

  /** Whether build succeeds */
  buildSuccess?: boolean;
}

/**
 * Performance metrics for a specific agent role
 */
export interface AgentMetrics {
  /** Agent role (sm, tea, dev, reviewer) */
  agentRole: string;

  /** Task completion rate (0.0-1.0) */
  taskCompletionRate: number;

  /** Average tokens per task */
  averageTokens: number;

  /** Average time per task in milliseconds */
  averageTimeMs: number;

  /** Tool usage efficiency (0.0-1.0) */
  toolEfficiency: number;

  /** Error/failure rate (0.0-1.0) */
  errorRate: number;

  /** Quality signals from CI/review */
  qualitySignals: QualitySignals;
}

/**
 * Performance metrics for a specific persona/theme
 */
export interface PersonaMetrics extends AgentMetrics {
  /** Persona character name (e.g., 'Hamlet') */
  persona?: string;

  /** Theme name (e.g., 'shakespeare') */
  theme: string;
}

/**
 * Metrics broken down by task type
 */
export interface TaskMetrics {
  /** Task type identifier */
  taskType: string;

  /** Number of tasks of this type */
  count: number;

  /** Average tokens for this task type */
  averageTokens: number;

  /** Average time for this task type in milliseconds */
  averageTimeMs: number;

  /** Success rate for this task type (0.0-1.0) */
  successRate: number;
}

/**
 * Regression alert for performance drops
 */
export interface RegressionAlert {
  /** Agent role affected */
  agentRole: string;

  /** Metric that regressed */
  metric: string;

  /** Current metric value */
  currentValue: number;

  /** Baseline metric value */
  baselineValue: number;

  /** Percent change from baseline */
  percentChange: number;

  /** Severity level */
  severity: 'info' | 'warning' | 'critical';
}

/**
 * Job-fair baseline data for comparison
 */
export interface JobFairBaseline {
  /** Persona character name */
  persona: string;

  /** Agent role */
  agentRole: string;

  /** Task type */
  taskType: string;

  /** Baseline metrics */
  metrics: {
    averageTokens: number;
    averageTimeMs: number;
    completionRate: number;
  };
}

/**
 * Trend direction for historical analysis
 */
export type TrendDirection = 'improving' | 'stable' | 'declining' | 'unknown';

/**
 * Complete agent evaluation result
 */
export interface AgentEvaluation {
  /** Unique evaluation identifier */
  evaluationId: string;

  /** Evaluation timestamp */
  timestamp: number;

  /** Story ID if evaluation is story-scoped */
  storyId?: string;

  /** Metrics aggregated by agent role */
  agentMetrics: Record<string, AgentMetrics>;

  /** Metrics aggregated by persona/theme */
  personaMetrics: Record<string, PersonaMetrics>;

  /** Metrics aggregated by task type */
  taskTypeMetrics: Record<string, TaskMetrics>;

  /** Active regression alerts */
  regressionAlerts: RegressionAlert[];

  /** Generated recommendations */
  recommendations: string[];
}

// =============================================================================
// Type Guards & Utilities
// =============================================================================

/**
 * Check if a span is an agent span (has childSpans and events)
 */
export function isAgentSpan(span: AgentSpan | ToolSpan): span is AgentSpan {
  return 'childSpans' in span && 'events' in span;
}

/**
 * Check if a span is a tool span (has tool.name attribute)
 */
export function isToolSpan(span: AgentSpan | ToolSpan): span is ToolSpan {
  return 'attributes' in span && 'tool.name' in (span.attributes as ToolSpanAttributes);
}

/**
 * Create an empty token usage object
 */
export function createEmptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

/**
 * Create an empty cost attribution object
 */
export function createEmptyCostAttribution(): CostAttribution {
  return {
    totalCostUsd: 0,
    byAgent: {},
    byStory: {},
  };
}
