/**
 * ContextIndicator Component
 *
 * Displays context window usage as a visual progress bar with threshold colors.
 * Story MSSCI-12712 - ContextIndicator Component
 *
 * Features:
 * - Percentage display with clamping (0-100%)
 * - Color thresholds: normal (<70%), elevated (70-89%), high (90%+)
 * - Real-time updates via IPC subscriptions
 * - Warning display at 90% threshold
 * - Tooltip showing exact token count (shadcn Tooltip)
 * - Accessible with ARIA attributes
 * - Uses shadcn Progress primitive for the progress bar
 */

import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import './ContextIndicator.css';

// ============================================================================
// Constants
// ============================================================================

/** Threshold values for context level colors */
export const CONTEXT_THRESHOLDS = {
  WARNING: 70,
  DANGER: 90,
} as const;

/** Test IDs for DOM querying */
export const CONTEXT_INDICATOR_TESTID = 'context-indicator';
export const CONTEXT_PERCENT_TESTID = 'context-percent';
export const CONTEXT_BAR_TESTID = 'context-bar';
export const CONTEXT_FILL_TESTID = 'context-fill';

/** CSS class names */
export const COMPONENT_CLASSNAME = 'context-indicator';
export const COMPACT_MODE_CLASSNAME = 'context-indicator--compact';

/** Accessibility constants */
export const PROGRESS_BAR_ROLE = 'progressbar';
export const CONTEXT_INDICATOR_ARIA_LIVE = 'polite';

/** Warning message displayed at high context usage */
export const CONTEXT_WARNING_MESSAGE = 'Context usage is high. Consider starting a new conversation.';

// ============================================================================
// Types
// ============================================================================

export type ContextLevel = 'normal' | 'elevated' | 'high';

export interface ContextData {
  percent: number;
  used?: number;
  total?: number;
}

export interface ContextIndicatorProps {
  /** Override percentage (0-100). If not provided, uses hook data */
  percent?: number;
  /** Used tokens for tooltip */
  used?: number;
  /** Total tokens for tooltip */
  total?: number;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Additional CSS class name */
  className?: string;
}

interface UseContextIndicatorResult {
  context: ContextData | null;
  isLoading: boolean;
  error: Error | null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a number as a percentage string with clamping.
 * @param value - The percentage value (may be outside 0-100)
 * @returns Formatted string like "45%"
 */
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return `${clamped}%`;
}

/**
 * Format a token count with thousands separator.
 * @param count - The token count
 * @returns Formatted string like "50,000"
 */
export function formatTokenCount(count: number | null | undefined): string {
  if (count === null || count === undefined || isNaN(count)) {
    return '—';
  }
  return count.toLocaleString('en-US');
}

/**
 * Format tooltip text showing used/total tokens.
 * @param used - Used tokens
 * @param total - Total tokens
 * @returns Formatted string like "50,000 / 200,000 tokens"
 */
export function formatTooltip(
  used: number | null | undefined,
  total: number | null | undefined
): string {
  const usedStr = formatTokenCount(used);
  const totalStr = formatTokenCount(total);
  return `${usedStr} / ${totalStr} tokens`;
}

/**
 * Determine the context level based on percentage.
 * @param percent - The percentage value (0-100)
 * @returns The context level: 'normal', 'elevated', or 'high'
 */
export function getContextLevel(percent: number): ContextLevel {
  if (percent >= CONTEXT_THRESHOLDS.DANGER) {
    return 'high';
  }
  if (percent >= CONTEXT_THRESHOLDS.WARNING) {
    return 'elevated';
  }
  return 'normal';
}

/**
 * Get the CSS class name for a context level.
 * @param level - The context level
 * @returns CSS class name like "level-normal"
 */
export function getLevelClassName(level: ContextLevel): string {
  return `level-${level}`;
}

/**
 * Determine if warning should be shown.
 * @param percent - The percentage value
 * @returns True if at or above danger threshold
 */
export function shouldShowWarning(percent: number): boolean {
  return percent >= CONTEXT_THRESHOLDS.DANGER;
}

/**
 * Get ARIA attributes for the progress bar.
 * @param valuenow - Current value
 * @param valuemax - Maximum value
 * @returns Object with aria attributes
 */
export function getAriaAttributes(
  valuenow: number,
  valuemax: number
): {
  'aria-valuenow': number;
  'aria-valuemin': number;
  'aria-valuemax': number;
  'aria-label': string;
} {
  return {
    'aria-valuenow': valuenow,
    'aria-valuemin': 0,
    'aria-valuemax': valuemax,
    'aria-label': `Context usage: ${valuenow}%`,
  };
}

// ============================================================================
// Progress bar color mapping
// ============================================================================

/** Tailwind indicator color classes keyed by context level */
const LEVEL_INDICATOR_COLORS: Record<ContextLevel, string> = {
  normal: 'bg-green-500',
  elevated: 'bg-amber-500',
  high: 'bg-red-500',
};

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for fetching and subscribing to context data.
 * Uses WebSocket /ws/context for real-time updates.
 */
export function useContextIndicator(): UseContextIndicatorResult {
  const [context, setContext] = useState<ContextData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Connect to context WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/context`);

    ws.onopen = () => {
      console.log('[ContextIndicator] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          setContext(data.context as ContextData | null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[ContextIndicator] Failed to parse message:', err);
        setError(err instanceof Error ? err : new Error('Failed to parse context'));
      }
    };

    ws.onerror = () => {
      setError(new Error('WebSocket connection failed'));
      setIsLoading(false);
    };

    ws.onclose = () => {
      console.log('[ContextIndicator] WebSocket disconnected');
    };

    return () => ws.close();
  }, []);

  return { context, isLoading, error };
}

// Re-export as useContext for test compatibility
export const useContext = useContextIndicator;

// ============================================================================
// Component
// ============================================================================

/**
 * ContextIndicator Component
 *
 * Displays context window usage as a visual progress bar using shadcn
 * Progress and Tooltip primitives.
 */
export default function ContextIndicator({
  percent: propPercent,
  used: propUsed,
  total: propTotal,
  compact = false,
  className = '',
}: ContextIndicatorProps): React.ReactElement {
  const { context } = useContextIndicator();

  // Use props if provided, otherwise use hook data
  const percent = propPercent ?? context?.percent ?? 0;
  const used = propUsed ?? context?.used;
  const total = propTotal ?? context?.total;

  const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));
  const level = getContextLevel(percent);
  const levelClass = getLevelClassName(level);
  const showWarning = shouldShowWarning(percent);
  const tooltip = formatTooltip(used, total);
  const ariaAttrs = getAriaAttributes(percent, 100);

  const rootClassNames = cn(
    COMPONENT_CLASSNAME,
    levelClass,
    compact && COMPACT_MODE_CLASSNAME,
    className,
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={rootClassNames}
            data-testid={CONTEXT_INDICATOR_TESTID}
            data-warning={showWarning || undefined}
            aria-live={CONTEXT_INDICATOR_ARIA_LIVE}
          >
            <Progress
              value={clampedPercent}
              className={cn(
                'context-bar',
                compact ? 'h-1 min-w-[40px] max-w-[60px]' : 'h-1.5 min-w-[60px] max-w-[100px]',
              )}
              data-testid={CONTEXT_BAR_TESTID}
              {...ariaAttrs}
              indicatorClassName={cn(
                'transition-all duration-300 ease-out',
                LEVEL_INDICATOR_COLORS[level],
              )}
            />
            <span
              className={cn('context-percent', `text-${level}`)}
              data-testid={CONTEXT_PERCENT_TESTID}
            >
              {formatPercentage(percent)}
            </span>
            {showWarning && (
              <span className="context-warning visually-hidden">
                {CONTEXT_WARNING_MESSAGE}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
