/**
 * Markdown Utilities - STUB for TDD RED phase
 *
 * Story MSSCI-13969: Extract markdown functions from markdown-parser.js
 * This stub allows tests to compile but fail on assertions.
 *
 * TODO: Dev extracts and implements these in GREEN phase
 */

/**
 * Parse markdown text to HTML with XSS protection.
 * @param markdown - Raw markdown text
 * @returns HTML string
 */
export function parseMarkdown(markdown: string): string {
  // STUB: Not implemented - for TDD RED phase
  throw new Error('parseMarkdown not implemented');
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param text - Raw text that may contain HTML
 * @returns Escaped text safe for HTML rendering
 */
export function escapeHtml(text: string): string {
  // STUB: Not implemented - for TDD RED phase
  throw new Error('escapeHtml not implemented');
}

/**
 * Strip CYCLIST markers from text before rendering.
 * Markers are used for machine parsing but should be invisible to users.
 * @param text - Text that may contain CYCLIST markers
 * @returns Text with markers removed
 */
export function stripMarkers(text: string): string {
  // STUB: Not implemented - for TDD RED phase
  throw new Error('stripMarkers not implemented');
}
