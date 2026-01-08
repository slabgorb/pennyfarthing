import { Router } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { detectPennyfarthingProject, loadThemeConfig, loadThemeYaml } from '../pennyfarthing.js';
/**
 * Get all agent-to-character mappings from current theme
 * @param projectDir - The project directory
 * @returns Map of role -> character data
 */
export function getThemeAgents(projectDir) {
    if (!detectPennyfarthingProject(projectDir)) {
        return null;
    }
    const config = loadThemeConfig(projectDir);
    if (!config) {
        return null;
    }
    // Find theme file path
    const possiblePaths = [
        join(projectDir, '.claude', 'personas', 'themes', `${config.theme}.yaml`),
        join(projectDir, '.claude', 'pennyfarthing', 'themes', `${config.theme}.yaml`),
        join(projectDir, 'pennyfarthing-dist', 'personas', 'themes', `${config.theme}.yaml`),
    ];
    let themePath = null;
    for (const path of possiblePaths) {
        if (existsSync(path)) {
            themePath = path;
            break;
        }
    }
    if (!themePath) {
        return null;
    }
    const agents = loadThemeYaml(themePath);
    if (!agents) {
        return null;
    }
    // Build mapping of role -> character info
    const result = {};
    for (const [role, persona] of Object.entries(agents)) {
        result[role] = {
            character: persona.character,
            shortName: persona.shortName,
        };
    }
    return result;
}
/**
 * Create theme agents API router
 */
export function createThemeAgentsRouter(getProjectDir) {
    const router = Router();
    // Theme Agents API - GET all agent character mappings
    router.get('/', (_req, res) => {
        const projectDir = getProjectDir();
        const agents = getThemeAgents(projectDir);
        if (!agents) {
            return res.status(404).json({ error: 'No theme agents found' });
        }
        res.json(agents);
    });
    return router;
}
//# sourceMappingURL=theme-agents.js.map