/**
 * Parser types stub for server module.
 * Provides types used by API routes without cyclist parser dependency.
 */

export interface ParsedStats {
  model?: string;
  status?: string;
  pwd?: string;
  [key: string]: unknown;
}
