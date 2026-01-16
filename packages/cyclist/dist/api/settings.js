/**
 * Settings API Router (Story 35-1)
 *
 * Provides HTTP API endpoints for settings management:
 * - GET /api/settings - Get current settings
 * - PATCH /api/settings - Update partial settings
 * - GET /api/settings/themes - Get available themes metadata
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getCurrentSettings, saveUserSettings } from '../settings.js';
import { getProjectDirectory } from '../paths.js';
/**
 * Create a consistent error response object
 * AC4: Helper for consistent error formatting
 */
export function createErrorResponse(code, message) {
    return {
        error: true,
        code,
        message,
    };
}
/**
 * Create the settings router
 */
export function createSettingsRouter() {
    const router = Router();
    /**
     * GET / - Get current settings
     * AC4: Returns consistent error format
     */
    router.get('/', (_req, res) => {
        try {
            const settings = getCurrentSettings();
            res.json(settings);
        }
        catch (error) {
            console.error('[Settings API] Failed to get settings:', error);
            res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to load settings'));
        }
    });
    /**
     * PATCH / - Update partial settings
     * Accepts a partial settings object and merges with current settings
     * AC4: Returns consistent error format with user-friendly messages
     */
    router.patch('/', async (req, res) => {
        try {
            const partialSettings = req.body;
            if (!partialSettings || typeof partialSettings !== 'object') {
                return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid settings object'));
            }
            // AC4: Validate specific field constraints before saving
            if (partialSettings.display?.sidebar_width !== undefined) {
                const width = partialSettings.display.sidebar_width;
                if (typeof width !== 'number' || width < 200 || width > 500) {
                    return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Sidebar width must be between 200 and 500'));
                }
            }
            // Validate font settings are non-empty if provided
            if (partialSettings.display?.font_ui !== undefined && partialSettings.display.font_ui === '') {
                return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Font UI must be a non-empty string'));
            }
            if (partialSettings.display?.font_mono !== undefined && partialSettings.display.font_mono === '') {
                return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Font Mono must be a non-empty string'));
            }
            // Validate theme is non-empty if provided
            if (partialSettings.pennyfarthing?.theme !== undefined && partialSettings.pennyfarthing.theme === '') {
                return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Theme must be a non-empty string'));
            }
            // Validate handoff_mode enum
            if (partialSettings.workflow?.handoff_mode !== undefined) {
                const mode = partialSettings.workflow.handoff_mode;
                if (mode !== 'auto' && mode !== 'manual') {
                    return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Handoff mode must be "auto" or "manual"'));
                }
            }
            // Save settings using the settings module
            const success = saveUserSettings(partialSettings);
            if (!success) {
                return res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to save settings to file'));
            }
            // Dual-write theme to persona-config.local.yaml for Pennyfarthing compatibility (24-2)
            const projectDir = getProjectDirectory();
            if (partialSettings.pennyfarthing?.theme && projectDir) {
                try {
                    const personaConfigPath = path.join(projectDir, '.claude', 'persona-config.local.yaml');
                    fs.writeFileSync(personaConfigPath, `theme: "${partialSettings.pennyfarthing.theme}"\n`, 'utf-8');
                }
                catch (err) {
                    console.error('[Settings API] Failed to write persona-config.local.yaml:', err);
                }
            }
            res.json(getCurrentSettings());
        }
        catch (error) {
            console.error('[Settings API] Failed to save settings:', error);
            res.status(500).json(createErrorResponse('UNKNOWN_ERROR', 'Failed to save settings'));
        }
    });
    /**
     * GET /themes - Get available themes metadata
     */
    router.get('/themes', async (_req, res) => {
        try {
            const projectDir = getProjectDirectory();
            if (!projectDir) {
                return res.json([]);
            }
            const themesDir = path.join(projectDir, 'pennyfarthing-dist', 'personas', 'themes');
            if (!fs.existsSync(themesDir)) {
                return res.json([]);
            }
            const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.yaml')).sort();
            const themes = files.map(f => ({
                id: f.replace('.yaml', ''),
                name: f.replace('.yaml', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            }));
            res.json(themes);
        }
        catch (error) {
            console.error('[Settings API] Failed to load themes:', error);
            res.status(500).json({ error: 'Failed to load themes' });
        }
    });
    return router;
}
//# sourceMappingURL=settings.js.map