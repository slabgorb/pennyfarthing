/**
 * useSubagentHelper Hook
 *
 * React hook for fetching themed helper data for subagent display.
 * Story MSSCI-12776 - Theme-Aware Subagent Display Messages
 *
 * Combines persona lookup with helper resolution to provide
 * themed helper information for subagent spans.
 */

import { useState, useEffect } from 'react';

export interface Helper {
  name: string;
  style: string;
}

export interface UseSubagentHelperResult {
  helper: Helper | null;
  isLoading: boolean;
  error: Error | null;
}

export function useSubagentHelper(subagentType: string): UseSubagentHelperResult {
  throw new Error('useSubagentHelper not implemented');
}
