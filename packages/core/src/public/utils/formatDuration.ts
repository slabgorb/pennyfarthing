/**
 * Format duration in milliseconds to human-readable string
 *
 * Story MSSCI-13402 - Tool use visual design polish
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "245ms" or "2.3s"
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
