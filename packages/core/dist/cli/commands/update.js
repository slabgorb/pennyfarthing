import { existsSync, readFileSync, writeFileSync, symlinkSync, copyFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import fsExtra from 'fs-extra';
const { ensureDirSync, removeSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { manifestExists, readManifest, writeManifest, createManifest } from '../utils/manifest.js';
import { pathExists, isDirectory, isSymlink, hashFile } from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';
import { computeRelativeSymlink, createCommandsDirectory, createSkillsDirectory, needsCommandsMigration, needsSkillsMigration, removeSymlinkOrDirectory } from '../utils/symlinks.js';
import { findNodeModulesPath } from '../utils/node-modules.js';
import { DIRECTORY_SYMLINKS, CORE_AGENTS } from '../utils/constants.js';
export async function updateCommand(options) {
    const projectRoot = process.cwd();
    const dryRun = options.dryRun;
    // 1. Check for manifest
    if (!manifestExists(projectRoot)) {
        logger.error('Pennyfarthing not initialized. Run `pennyfarthing init` first.');
        process.exit(1);
    }
    const manifest = readManifest(projectRoot);
    if (!manifest) {
        logger.error('Failed to read manifest');
        process.exit(1);
    }
    // 2. Compare versions
    const packageVersion = getPackageVersion();
    const updateInfo = await checkForUpdates(projectRoot, manifest);
    if (options.check) {
        // Just check and exit
        if (updateInfo.needsUpdate) {
            logger.info(`Update available: ${updateInfo.currentVersion} → ${updateInfo.availableVersion}`);
            process.exit(0);
        }
        else {
            logger.success(`Already up to date (v${updateInfo.currentVersion})`);
            process.exit(0);
        }
    }
    // 3. Show update info
    logger.header('Pennyfarthing Update');
    // Check installation type and node_modules availability
    const nodeModulesPath = findNodeModulesPath(projectRoot);
    const currentInstallType = manifest.installationType || 'copy'; // Default to copy for old manifests
    // Always check and update settings (idempotent - only makes changes if needed)
    const assetsPath = getAssetsPath();
    // Copy mode is deprecated - force migration
    if (currentInstallType === 'copy') {
        if (nodeModulesPath) {
            logger.info('Migrating from deprecated copy mode to symlink mode...');
            await migrateToSymlinkMode(projectRoot, nodeModulesPath, manifest.projectName, packageVersion, { dryRun });
            return;
        }
        else {
            logger.error('Copy mode is deprecated and node_modules/pennyfarthing not found');
            logger.error('');
            logger.error('Please reinstall with npm:');
            logger.error('  npm install pennyfarthing');
            logger.error('  npx pennyfarthing init --force');
            process.exit(1);
        }
    }
    // Must have node_modules for symlink mode
    if (!nodeModulesPath) {
        logger.error('node_modules/pennyfarthing not found');
        logger.error('');
        logger.error('Please ensure pennyfarthing is installed:');
        logger.error('  npm install pennyfarthing');
        process.exit(1);
    }
    const settingsUpdated = await mergeSettingsHooks(projectRoot, assetsPath, { dryRun });
    if (!updateInfo.needsUpdate && updateInfo.userModifiedFiles.length === 0 && !settingsUpdated) {
        logger.success(`Already up to date (v${updateInfo.currentVersion})`);
        return;
    }
    if (updateInfo.needsUpdate) {
        logger.info(`Updating ${updateInfo.currentVersion} → ${updateInfo.availableVersion}`);
    }
    else {
        logger.info(`Refreshing files (v${updateInfo.currentVersion})`);
    }
    if (dryRun) {
        logger.info('Dry run mode - no changes will be made');
    }
    // Symlink mode: verify symlinks are correct
    await updateSymlinkMode(projectRoot, nodeModulesPath, manifest, packageVersion, { dryRun });
    // 7. Success
    logger.newline();
    logger.success(`Updated to v${packageVersion}`);
    // 8. Run doctor
    logger.newline();
    logger.info('Running health check...');
    const { doctorCommand } = await import('./doctor.js');
    await doctorCommand({ quiet: true });
}
/**
 * Migrate from copy mode to symlink mode
 */
async function migrateToSymlinkMode(projectRoot, nodeModulesPath, projectName, version, options) {
    const dryRun = options.dryRun;
    logger.newline();
    logger.info('Migrating to symlink mode...');
    if (dryRun) {
        logger.info('Dry run mode - no changes will be made');
    }
    // 1. Remove old .claude/pennyfarthing/ directory
    const pennyfarthingDir = join(projectRoot, '.claude/pennyfarthing');
    if (pathExists(pennyfarthingDir)) {
        if (!dryRun) {
            removeSync(pennyfarthingDir);
        }
        logger.info('Removed .claude/pennyfarthing/ directory');
    }
    // 2. Ensure project/commands directory exists
    const projectCommandsDir = join(projectRoot, '.claude/project/commands');
    if (!pathExists(projectCommandsDir)) {
        if (!dryRun) {
            ensureDirSync(projectCommandsDir);
        }
        logger.created('.claude/project/commands/ (for user custom commands)');
    }
    // 3. Remove old symlinks and create new ones pointing to node_modules (except commands and skills)
    logger.newline();
    logger.info('Creating symlinks to node_modules...');
    for (const { name, link } of DIRECTORY_SYMLINKS) {
        const linkPath = join(projectRoot, link);
        const targetPath = join(nodeModulesPath, name);
        // Remove existing symlink or directory
        removeSymlinkOrDirectory(linkPath, dryRun);
        if (!dryRun) {
            const relativeTarget = computeRelativeSymlink(linkPath, targetPath);
            try {
                symlinkSync(relativeTarget, linkPath);
                logger.created(`${link} -> ${relativeTarget}`);
            }
            catch (e) {
                logger.warning(`Could not create symlink ${link}: ${e}`);
            }
        }
        else {
            const relativeTarget = computeRelativeSymlink(linkPath, targetPath);
            logger.created(`${link} -> ${relativeTarget}`);
        }
    }
    // 4. Create commands directory with individual symlinks (allows user commands)
    const builtInCommandsPath = join(nodeModulesPath, 'commands');
    createCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsDir, dryRun || false);
    // 4b. Create skills directory with individual symlinks (allows user skills)
    const builtInSkillsPath = join(nodeModulesPath, 'skills');
    const projectSkillsDir = join(projectRoot, '.claude/project/skills');
    createSkillsDirectory(projectRoot, builtInSkillsPath, projectSkillsDir, dryRun || false);
    // 5. Migrate persona config to .pennyfarthing/
    await migratePersonaConfig(projectRoot, { dryRun });
    // 6. Update settings.local.json paths
    const assetsPath = getAssetsPath();
    await mergeSettingsHooks(projectRoot, assetsPath, { dryRun });
    // 7. Write new manifest
    logger.newline();
    logger.info('Updating manifest...');
    const nodeModulesRelPath = relative(projectRoot, nodeModulesPath);
    const newManifest = createManifest(projectName, version, {
        nodeModulesPath: nodeModulesRelPath
    });
    writeManifest(projectRoot, newManifest, { dryRun });
    logger.updated('.claude/manifest.json');
    logger.newline();
    logger.success(`Migrated to symlink mode (v${version})`);
    logger.info('Git-tracked files reduced from ~120 to 6 symlinks');
}
/**
 * Update in symlink mode - verify symlinks point to correct location
 */
async function updateSymlinkMode(projectRoot, nodeModulesPath, manifest, version, options) {
    const dryRun = options.dryRun;
    logger.newline();
    logger.info('Verifying symlinks...');
    // Verify standard symlinks (not commands or skills - handled separately)
    for (const { name, link } of DIRECTORY_SYMLINKS) {
        const linkPath = join(projectRoot, link);
        const targetPath = join(nodeModulesPath, name);
        const expectedRelative = computeRelativeSymlink(linkPath, targetPath);
        if (!isSymlink(linkPath)) {
            // Create missing symlink
            if (!dryRun) {
                try {
                    if (pathExists(linkPath)) {
                        removeSync(linkPath);
                    }
                    symlinkSync(expectedRelative, linkPath);
                    logger.created(`${link} -> ${expectedRelative}`);
                }
                catch (e) {
                    logger.warning(`Could not create symlink ${link}: ${e}`);
                }
            }
        }
        else {
            // Verify symlink points to correct location
            logger.info(`  ✓ ${link}`);
        }
    }
    // Handle commands directory - migrate from symlink to directory if needed
    const projectCommandsDir = join(projectRoot, '.claude/project/commands');
    if (!pathExists(projectCommandsDir)) {
        if (!dryRun) {
            ensureDirSync(projectCommandsDir);
        }
        logger.created('.claude/project/commands/ (for user custom commands)');
    }
    if (needsCommandsMigration(projectRoot)) {
        logger.info('Migrating commands to new directory structure...');
        const builtInCommandsPath = join(nodeModulesPath, 'commands');
        createCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsDir, dryRun || false);
    }
    else {
        const commandsDir = join(projectRoot, '.claude/commands');
        if (isDirectory(commandsDir)) {
            logger.info(`  ✓ .claude/commands/ (directory with individual symlinks)`);
        }
    }
    // Handle skills directory - migrate from symlink to directory if needed
    const projectSkillsDir = join(projectRoot, '.claude/project/skills');
    if (!pathExists(projectSkillsDir)) {
        if (!dryRun) {
            ensureDirSync(projectSkillsDir);
        }
        logger.created('.claude/project/skills/ (for user custom skills)');
    }
    if (needsSkillsMigration(projectRoot)) {
        logger.info('Migrating skills to new directory structure...');
        const builtInSkillsPath = join(nodeModulesPath, 'skills');
        createSkillsDirectory(projectRoot, builtInSkillsPath, projectSkillsDir, dryRun || false);
    }
    else {
        const skillsDir = join(projectRoot, '.claude/skills');
        if (isDirectory(skillsDir)) {
            logger.info(`  ✓ .claude/skills/ (directory with individual symlinks)`);
        }
    }
    // Migrate sidecars from old location to new location
    await migrateSidecars(projectRoot, { dryRun });
    // Migrate persona config to .pennyfarthing/ directory
    await migratePersonaConfig(projectRoot, { dryRun });
    // Update settings
    const assetsPath = getAssetsPath();
    await mergeSettingsHooks(projectRoot, assetsPath, { dryRun });
    // Update manifest version
    logger.newline();
    logger.info('Updating manifest...');
    const nodeModulesRelPath = relative(projectRoot, nodeModulesPath);
    const newManifest = createManifest(manifest?.projectName || 'unknown', version, {
        nodeModulesPath: nodeModulesRelPath
    });
    writeManifest(projectRoot, newManifest, { dryRun });
    logger.updated('.claude/manifest.json');
}
/**
 * Migrate sidecars from .claude/project/agents/{agent}-sidecar/ to .pennyfarthing/sidecars/{agent}/
 * Also migrates from old sprint/sidecars/ location
 * Preserves user content while moving to new location
 */
async function migrateSidecars(projectRoot, options) {
    const dryRun = options.dryRun;
    let migrated = 0;
    // Ensure new sidecars directory exists
    const newSidecarsDir = join(projectRoot, '.pennyfarthing/sidecars');
    if (!pathExists(newSidecarsDir)) {
        if (!dryRun) {
            ensureDirSync(newSidecarsDir);
        }
    }
    for (const agent of CORE_AGENTS) {
        // Check both legacy locations
        const legacyDir1 = join(projectRoot, `.claude/project/agents/${agent}-sidecar`);
        const legacyDir2 = join(projectRoot, `sprint/sidecars/${agent}`);
        const oldDir = pathExists(legacyDir1) ? legacyDir1 : (pathExists(legacyDir2) ? legacyDir2 : null);
        const newDir = join(projectRoot, `.pennyfarthing/sidecars/${agent}`);
        // Skip if no legacy directory found
        if (!oldDir) {
            continue;
        }
        // Create new directory if needed
        if (!pathExists(newDir)) {
            if (!dryRun) {
                ensureDirSync(newDir);
            }
        }
        // Copy each .md file from old to new (don't overwrite existing)
        try {
            const files = readdirSync(oldDir);
            for (const file of files) {
                if (!file.endsWith('.md'))
                    continue;
                const oldPath = join(oldDir, file);
                const newPath = join(newDir, file);
                // Don't overwrite if new file already exists
                if (pathExists(newPath)) {
                    continue;
                }
                if (!dryRun) {
                    copyFileSync(oldPath, newPath);
                }
                migrated++;
            }
        }
        catch {
            // Ignore errors reading old directory
        }
    }
    if (migrated > 0) {
        logger.info(`Migrated ${migrated} sidecar files to .pennyfarthing/sidecars/`);
    }
    // Clean up old sprint/sidecars directory if it exists and is now empty or fully migrated
    const oldSprintSidecars = join(projectRoot, 'sprint/sidecars');
    if (pathExists(oldSprintSidecars)) {
        try {
            const remaining = readdirSync(oldSprintSidecars);
            // Check if all remaining items are agent directories that have been migrated
            const allMigrated = remaining.every(item => {
                const itemPath = join(oldSprintSidecars, item);
                if (!isDirectory(itemPath))
                    return false;
                // Check if this agent's sidecar now exists in new location
                const newAgentDir = join(projectRoot, `.pennyfarthing/sidecars/${item}`);
                return pathExists(newAgentDir);
            });
            if (allMigrated && !dryRun) {
                removeSync(oldSprintSidecars);
                logger.info('Removed legacy sprint/sidecars/ directory');
            }
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
/**
 * Migrate persona config from .claude/persona-config.local.yaml to .pennyfarthing/config.local.yaml
 * The new location is agent-writable and better suited for dogfooding
 */
async function migratePersonaConfig(projectRoot, options) {
    const dryRun = options.dryRun;
    const oldConfigPath = join(projectRoot, '.claude/persona-config.local.yaml');
    const newConfigDir = join(projectRoot, '.pennyfarthing');
    const newConfigPath = join(newConfigDir, 'config.local.yaml');
    // Skip if old config doesn't exist
    if (!existsSync(oldConfigPath)) {
        return;
    }
    // Skip if new config already exists (already migrated)
    if (existsSync(newConfigPath)) {
        // Remove old config if new one exists
        if (!dryRun) {
            removeSync(oldConfigPath);
        }
        logger.info('Removed legacy .claude/persona-config.local.yaml (already migrated)');
        return;
    }
    // Ensure new directory exists
    if (!existsSync(newConfigDir)) {
        if (!dryRun) {
            ensureDirSync(newConfigDir);
        }
        logger.created('.pennyfarthing/');
    }
    // Read old config content
    const oldContent = readFileSync(oldConfigPath, 'utf8');
    // Write to new location with updated header
    if (!dryRun) {
        const header = '# Pennyfarthing Local Configuration\n# This file is gitignored - your personal preferences\n# Agents can write to this file during dogfooding\n\n';
        // Parse and re-write to ensure clean format
        // If it starts with a comment, strip old comments and add new header
        const lines = oldContent.split('\n');
        const contentLines = lines.filter(line => !line.startsWith('#') || line.trim() === '');
        const cleanContent = contentLines.join('\n').trim();
        writeFileSync(newConfigPath, header + cleanContent + '\n', 'utf8');
        removeSync(oldConfigPath);
    }
    logger.info('Migrated persona config to .pennyfarthing/config.local.yaml');
}
async function checkForUpdates(projectRoot, manifest) {
    const packageVersion = getPackageVersion();
    const assetsPath = getAssetsPath();
    const changedFiles = [];
    const userModifiedFiles = [];
    if (!manifest) {
        return {
            currentVersion: '0.0.0',
            availableVersion: packageVersion,
            needsUpdate: true,
            changedFiles: [],
            userModifiedFiles: []
        };
    }
    // Check each file in manifest
    for (const [filePath, expectedHash] of Object.entries(manifest.fileHashes)) {
        const fullPath = join(projectRoot, filePath);
        if (!pathExists(fullPath)) {
            changedFiles.push(filePath);
            continue;
        }
        const currentHash = hashFile(fullPath);
        if (currentHash !== expectedHash) {
            // File has been modified locally
            userModifiedFiles.push(filePath);
        }
        // Check if package has a newer version
        // Map installed path back to source path
        const assetsFile = filePath
            .replace('.claude/pennyfarthing/', '')
            .replace('scripts/', 'scripts/');
        const assetsFilePath = join(assetsPath, assetsFile);
        if (pathExists(assetsFilePath)) {
            const packageHash = hashFile(assetsFilePath);
            if (packageHash !== expectedHash) {
                changedFiles.push(filePath);
            }
        }
    }
    // Compare versions
    const needsUpdate = compareVersions(packageVersion, manifest.version) > 0;
    return {
        currentVersion: manifest.version,
        availableVersion: packageVersion,
        needsUpdate,
        changedFiles,
        userModifiedFiles
    };
}
function compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA > numB)
            return 1;
        if (numA < numB)
            return -1;
    }
    return 0;
}
/**
 * Merge required hooks into existing settings.local.json
 * This ensures critical hooks like SessionStart are always configured
 * Returns true if any changes were made
 */
async function mergeSettingsHooks(projectRoot, assetsPath, options) {
    const settingsPath = join(projectRoot, '.claude/settings.local.json');
    const templatePath = join(assetsPath, 'templates/settings.local.json.template');
    if (!pathExists(templatePath)) {
        return false;
    }
    const templateContent = JSON.parse(readFileSync(templatePath, 'utf8'));
    // If no existing settings, create from template
    if (!pathExists(settingsPath)) {
        if (!options.dryRun) {
            ensureDirSync(join(projectRoot, '.claude'));
            writeFileSync(settingsPath, JSON.stringify(templateContent, null, 2), 'utf8');
        }
        logger.created('.claude/settings.local.json');
        return true;
    }
    // Read existing settings
    let existingSettings;
    try {
        existingSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    }
    catch {
        logger.warning('Could not parse existing settings.local.json, skipping merge');
        return false;
    }
    let modified = false;
    // Ensure hooks object exists
    if (!existingSettings.hooks) {
        existingSettings.hooks = {};
        modified = true;
    }
    const hooks = existingSettings.hooks;
    // Merge SessionStart hooks - these are critical for PROJECT_ROOT
    if (!hooks.SessionStart) {
        hooks.SessionStart = templateContent.hooks?.SessionStart || [];
        modified = true;
        logger.info('Added missing SessionStart hooks');
    }
    else if (Array.isArray(hooks.SessionStart)) {
        // Check if session-start.sh hook is configured
        const hasSessionStartHook = hooks.SessionStart.some((entry) => {
            if (typeof entry === 'object' && entry !== null) {
                const hookEntry = entry;
                return hookEntry.hooks?.some(h => h.command?.includes('session-start.sh'));
            }
            return false;
        });
        if (!hasSessionStartHook && templateContent.hooks?.SessionStart) {
            // Prepend the session-start.sh hook entry
            const sessionStartEntry = templateContent.hooks.SessionStart.find((entry) => {
                if (typeof entry === 'object' && entry !== null) {
                    const hookEntry = entry;
                    return hookEntry.hooks?.some(h => h.command?.includes('session-start.sh'));
                }
                return false;
            });
            if (sessionStartEntry) {
                hooks.SessionStart = [sessionStartEntry, ...hooks.SessionStart];
                modified = true;
                logger.info('Added missing session-start.sh hook');
            }
        }
    }
    // Merge SessionEnd hooks if missing
    if (!hooks.SessionEnd && templateContent.hooks?.SessionEnd) {
        hooks.SessionEnd = templateContent.hooks.SessionEnd;
        modified = true;
        logger.info('Added missing SessionEnd hooks');
    }
    // Ensure statusLine is configured and points to new location
    const statusLine = existingSettings.statusLine;
    if (!statusLine) {
        existingSettings.statusLine = templateContent.statusLine;
        modified = true;
        logger.info('Added missing statusLine configuration');
    }
    else if (statusLine.command && typeof statusLine.command === 'string') {
        // Migrate from any legacy path to new path (.claude/scripts/statusline.sh)
        const legacyPaths = [
            '.claude/core/statusline.sh',
            '.claude/statusline.sh',
            '.claude/pennyfarthing/statusline.sh' // Also migrate from old copy-mode path
        ];
        for (const legacyPath of legacyPaths) {
            if (statusLine.command.includes(legacyPath)) {
                statusLine.command = statusLine.command.replace(legacyPath, '.claude/scripts/statusline.sh');
                modified = true;
                logger.info(`Updated statusLine path from ${legacyPath} to new location`);
                break;
            }
        }
    }
    if (modified && !options.dryRun) {
        writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');
        logger.updated('.claude/settings.local.json');
    }
    return modified;
}
//# sourceMappingURL=update.js.map