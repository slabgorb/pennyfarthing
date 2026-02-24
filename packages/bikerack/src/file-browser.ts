/**
 * File browser utility stub for server module.
 * Provides functions used by file-browser API route without cyclist dependency.
 */

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

export interface FileContent {
  content: string;
  language?: string;
}

export function listDirectory(_dirPath: string, _opts?: unknown): DirectoryEntry[] {
  return [];
}

export function readFile(_filePath: string, _opts?: unknown): FileContent | null {
  return null;
}
