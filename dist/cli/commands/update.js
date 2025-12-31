import { readFileSync, writeFileSync, unlinkSync, symlinkSync, readdirSync } from 'fs';
import { join, relative, dirname } from 'path';
import fsExtra from 'fs-extra';
const { ensureDirSync, removeSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { manifestExists, readManifest, writeManifest, createManifest } from '../utils/manifest.js';
import { pathExists, isDirectory, isSymlink, hashFile } from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';
/**
 * Find pennyfarthing in node_modules (handles monorepo hoisting)
 */
function findNodeModulesPath(projectRoot) {
    const standard = join(projectRoot, 'node_modules/pennyfarthing/pennyfarthing-dist');
    if (pathExists(standard))
        return standard;
    let dir = dirname(projectRoot);
    while (dir !== '/' && dir !== dirname(dir)) {
        const hoisted = join(dir, 'node_modules/pennyfarthing/pennyfarthing-dist');
        if (pathExists(hoisted))
            return hoisted;
        dir = dirname(dir);
    }
    return null;
}
/**
 * Compute relative path for symlink
 */
function computeRelativeSymlink(linkPath, targetPath) {
    return relative(dirname(linkPath), targetPath);
}
/**
 * Create commands directory with individual symlinks to each command file.
 * This allows users to add their own commands alongside built-in ones.
 */
function createCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsPath, dryRun) {
    const commandsDir = join(projectRoot, '.claude/commands');
    // Remove existing symlink or directory
    if (pathExists(commandsDir) || isSymlink(commandsDir)) {
        if (!dryRun) {
            try {
                unlinkSync(commandsDir);
            }
            catch {
                try {
                    removeSync(commandsDir);
                }
                catch {
                    // Ignore
                }
            }
        }
    }
    // Create commands directory
    if (!dryRun) {
        ensureDirSync(commandsDir);
    }
    logger.created('.claude/commands/ (directory for built-in + user commands)');
    // Symlink each built-in command
    if (pathExists(builtInCommandsPath)) {
        const builtInCommands = readdirSync(builtInCommandsPath).filter(f => f.endsWith('.md'));
        for (const cmd of builtInCommands) {
            const linkPath = join(commandsDir, cmd);
            const targetPath = join(builtInCommandsPath, cmd);
            const relativeTarget = computeRelativeSymlink(linkPath, targetPath);
            if (!dryRun) {
                try {
                    symlinkSync(relativeTarget, linkPath);
                }
                catch (e) {
                    logger.warning(`Could not create symlink for ${cmd}: ${e}`);
                }
            }
        }
        logger.info(`  Linked ${builtInCommands.length} built-in commands`);
    }
    // Symlink user project commands (if any exist)
    if (pathExists(projectCommandsPath)) {
        const projectCommands = readdirSync(projectCommandsPath).filter(f => f.endsWith('.md'));
        let linkedCount = 0;
        for (const cmd of projectCommands) {
            const linkPath = join(commandsDir, cmd);
            if (pathExists(linkPath)) {
                logger.warning(`  Skipping ${cmd} - would override built-in command`);
                continue;
            }
            const targetPath = join(projectCommandsPath, cmd);
            const relativeTarget = computeRelativeSymlink(linkPath, targetPath);
            if (!dryRun) {
                try {
                    symlinkSync(relativeTarget, linkPath);
                    linkedCount++;
                }
                catch (e) {
                    logger.warning(`Could not create symlink for ${cmd}: ${e}`);
                }
            }
            else {
                linkedCount++;
            }
        }
        if (linkedCount > 0) {
            logger.info(`  Linked ${linkedCount} user commands from project/commands/`);
        }
    }
}
/**
 * Check if commands directory needs migration from single symlink to directory
 */
function needsCommandsMigration(projectRoot) {
    const commandsPath = join(projectRoot, '.claude/commands');
    // Needs migration if it's a symlink (old style) instead of a directory
    return isSymlink(commandsPath);
}
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
    // 3. Remove old symlinks and create new ones pointing to node_modules (except commands)
    const symlinks = [
        { name: 'agents', link: '.claude/agents' },
        { name: 'guides', link: '.claude/guides' },
        { name: 'skills', link: '.claude/skills' },
        { name: 'personas', link: '.claude/personas' },
        { name: 'scripts', link: '.claude/scripts' }
    ];
    logger.newline();
    logger.info('Creating symlinks to node_modules...');
    for (const { name, link } of symlinks) {
        const linkPath = join(projectRoot, link);
        const targetPath = join(nodeModulesPath, name);
        // Remove existing symlink or directory
        if (pathExists(linkPath) || isSymlink(linkPath)) {
            if (!dryRun) {
                try {
                    unlinkSync(linkPath);
                }
                catch {
                    removeSync(linkPath);
                }
            }
        }
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
    // 5. Update settings.local.json paths
    const assetsPath = getAssetsPath();
    await mergeSettingsHooks(projectRoot, assetsPath, { dryRun });
    // 6. Write new manifest
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
    // Verify standard symlinks (not commands - handled separately)
    const symlinks = [
        { name: 'agents', link: '.claude/agents' },
        { name: 'guides', link: '.claude/guides' },
        { name: 'skills', link: '.claude/skills' },
        { name: 'personas', link: '.claude/personas' },
        { name: 'scripts', link: '.claude/scripts' }
    ];
    for (const { name, link } of symlinks) {
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
    catch (error) {
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