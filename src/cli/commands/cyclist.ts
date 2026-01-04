/**
 * Story 15-1: Cyclist launcher command
 *
 * Launches Cyclist with Pennyfarthing context.
 *
 * STUB FILE - Implementation pending (RED state)
 */

export interface CyclistOptions {
  port?: number;
  noOpen?: boolean;
  cyclistPath?: string;
}

export interface ThemeConfig {
  theme: string;
}

export interface CyclistDeps {
  spawn: typeof import('child_process').spawn;
  open: (url: string) => Promise<void>;
}

/**
 * Find cyclist installation
 *
 * Priority:
 * 1. CYCLIST_PATH environment variable
 * 2. Sibling directory ../cyclist
 * 3. Relative to pennyfarthing install
 */
export function findCyclist(): string {
  // TODO: Implement - Story 15-1
  throw new Error('Not implemented: findCyclist');
}

/**
 * Load theme configuration from persona-config.yaml
 */
export function loadThemeConfig(projectDir: string): ThemeConfig {
  // TODO: Implement - Story 15-1
  throw new Error('Not implemented: loadThemeConfig');
}

/**
 * Resolve path to theme YAML file
 */
export function resolveThemePath(theme: string, projectDir: string): string {
  // TODO: Implement - Story 15-1
  throw new Error('Not implemented: resolveThemePath');
}

/**
 * Main cyclist command
 *
 * Finds cyclist, sets environment, spawns server, opens browser
 */
export async function cyclistCommand(
  options: CyclistOptions,
  deps?: CyclistDeps
): Promise<void> {
  // TODO: Implement - Story 15-1
  throw new Error('Not implemented: cyclistCommand');
}
