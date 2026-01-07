/**
 * Portrait Resolver - Smart path resolution for Pennyfarthing portraits
 *
 * Checks paths in priority order:
 * 1. PENNYFARTHING_DIST env var (explicit override)
 * 2. Monorepo root (pennyfarthing-dist/ at repo root for dogfooding)
 * 3. Sibling directory (for dev scenarios)
 * 4. Scoped npm (node_modules/@pennyfarthing/core/pennyfarthing-dist/)
 * 5. Legacy npm (node_modules/pennyfarthing/pennyfarthing-dist/)
 */
/**
 * Resolve the pennyfarthing-dist directory path
 * Checks multiple locations in priority order
 */
export function resolvePennyfarthingDist() {
    // TODO: Implement path resolution logic
    throw new Error('Not implemented');
}
/**
 * Resolve the full path to a portrait image
 * @param theme - Theme name (e.g., 'shakespeare', 'norse-mythology')
 * @param agent - Agent name (e.g., 'sm', 'tea', 'dev')
 * @returns Full path to portrait file, or null if not found
 */
export function resolvePortraitPath(theme, agent) {
    // TODO: Implement portrait path resolution
    throw new Error('Not implemented');
}
/**
 * Get all portrait-related paths for a resolved dist directory
 */
export function getPortraitPaths(distPath) {
    // TODO: Implement path building
    throw new Error('Not implemented');
}
//# sourceMappingURL=portrait-resolver.js.map