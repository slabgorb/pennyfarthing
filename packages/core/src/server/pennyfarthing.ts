/**
 * Pennyfarthing detection stub for server module.
 * Provides functions used by API routes without cyclist pennyfarthing dependency.
 */

export interface Persona {
  character?: string;
  agent?: string;
  theme?: string;
  portrait?: string;
  [key: string]: unknown;
}

export function detectPennyfarthingProject(_projectDir: string): boolean {
  return true;
}

export function getCurrentPersona(_projectDir: string, _sessionId?: string): Persona | null {
  return { character: 'default', agent: 'unknown' };
}

export function getFullPersonaDetails(_projectDir: string, _sessionId?: string): unknown {
  return null;
}

export function watchAgentChanges(_projectDir: string, _sessionId?: string, _callback?: (agentRole: string) => void): void {}

export function loadThemeConfig(_projectDir: string): unknown {
  return null;
}

export function loadThemeYaml(_projectDir: string, _themeName: string): unknown {
  return null;
}
