/**
 * Enriched span exporter stub for server module.
 * Provides functions used by spans API route without cyclist dependency.
 */

export interface EnrichedSpan {
  [key: string]: unknown;
}

export async function getEnrichedSpans(): Promise<EnrichedSpan[]> {
  return [];
}

export function clearEnrichedSpans(): void {}

export interface SpanFilter {
  toolName?: string;
  [key: string]: unknown;
}

export function filterSpans(_spans: EnrichedSpan[], _filter: SpanFilter): EnrichedSpan[] { return []; }
export function formatSpanForExport(_span: EnrichedSpan): unknown { return null; }
export function exportEnrichedSpans(_filter?: SpanFilter): Promise<EnrichedSpan[]> { return Promise.resolve([]); }
