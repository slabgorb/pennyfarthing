/**
 * Theme Loader - Load and parse Pennyfarthing theme configurations
 */

export interface ThemeAgent {
  character: string;
  style: string;
  role: string;
  trait: string;
  quote: string;
  helper?: string;
}

export interface Theme {
  name: string;
  description: string;
  agents: Record<string, ThemeAgent>;
}

/**
 * Load a theme configuration by name
 * @param themeName - Name of the theme (e.g., 'shakespeare', 'norse-mythology')
 * @returns Parsed theme configuration or null if not found
 */
export function loadTheme(themeName: string): Theme | null {
  // TODO: Implement theme loading
  throw new Error('Not implemented');
}

/**
 * List all available themes
 * @returns Array of theme names
 */
export function listThemes(): string[] {
  // TODO: Implement theme listing
  throw new Error('Not implemented');
}

/**
 * Get agent persona from a theme
 * @param themeName - Theme name
 * @param agentName - Agent name (e.g., 'sm', 'tea', 'dev')
 * @returns Agent persona or null if not found
 */
export function getAgentPersona(themeName: string, agentName: string): ThemeAgent | null {
  // TODO: Implement agent persona retrieval
  throw new Error('Not implemented');
}
