/**
 * Dangerous path detection stub for server module.
 * Provides functions used by hook-request API route without cyclist dependency.
 */

export function isDangerousPath(_path: string): boolean {
  return false;
}

export function getPathCategory(_path: string): string {
  return 'unknown';
}

export function extractBashTargetPaths(_command: string): string[] {
  return [];
}
