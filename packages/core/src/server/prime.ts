/**
 * Prime context stub for server module.
 * Provides functions/types used by API routes without cyclist prime dependency.
 */

export type ContextTier = 'FULL' | 'REFRESH' | 'HANDOFF' | 'MINIMAL';

export interface PrimeOutput {
  tiers: Record<string, unknown>;
  totalTokens: number;
  [key: string]: unknown;
}

export function getPrimeContextJson(_agentOrProjectDir: string, _projectDir?: string, _tier?: ContextTier): PrimeOutput | null {
  return null;
}
