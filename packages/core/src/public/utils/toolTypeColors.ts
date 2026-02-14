/**
 * Tool type color mappings
 *
 * Story MSSCI-13402 - Tool use visual design polish
 *
 * Provides color values and CSS class names for each tool type.
 */

/** Tool type to color hex mapping */
export const TOOL_TYPE_COLORS: Record<string, string> = {
  Read: '#3b82f6',    // blue
  Write: '#f97316',   // orange
  Bash: '#22c55e',    // green
  Glob: '#a855f7',    // purple
  Grep: '#06b6d4',    // cyan
  Edit: '#eab308',    // yellow
  Task: '#ec4899',    // pink
};

/** Default color for unknown tools */
export const DEFAULT_TOOL_COLOR = '#6b7280'; // gray

/**
 * Get the color hex value for a tool type
 *
 * @param toolName - The name of the tool
 * @returns Color hex string
 */
export function getToolTypeColor(toolName: string): string {
  return TOOL_TYPE_COLORS[toolName] || DEFAULT_TOOL_COLOR;
}

/**
 * Get the CSS class name for a tool type
 *
 * @param toolName - The name of the tool
 * @returns CSS class name like "tool-read" or "tool-unknown"
 */
export function getToolTypeClass(toolName: string): string {
  const knownTools = ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'Edit', 'Task'];
  if (knownTools.includes(toolName)) {
    return `tool-${toolName.toLowerCase()}`;
  }
  return '';
}
