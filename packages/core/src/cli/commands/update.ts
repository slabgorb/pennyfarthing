import { copyFileSync, readdirSync, renameSync, unlinkSync, existsSync } from 'fs';
import { join, relative } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync, removeSync } = fsExtra;
import { logger } from '../utils/logger.js';
import {
  manifestExists,
  readManifest,
  writeManifest,
  createManifest
} from '../utils/manifest.js';
import {
  pathExists,
  isDirectory,
  hashFile
} from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';
import {
  createDirectorySymlink,
  copyCommandsDirectory,
  copySkillsDirectory,
  removeSymlinkOrDirectory
} from '../utils/symlinks.js';
import { findNodeModulesPath } from '../utils/node-modules.js';
import { DIRECTORY_SYMLINKS, CORE_AGENTS } from '../utils/constants.js';
import { mergeSettingsLocalJson, migrateSettingsFile, ensureSettingsSymlink } from '../utils/settings.js';
import { getPfVersion, installPfCli } from '../utils/python.js';
import { installGitHooks } from './init.js';
import { writeVersionSentinel } from '../utils/version-sentinel.js';
import {
  listMigrationFiles,
  getPendingMigrations,
  runMigrations,
} from '../utils/migrations.js';
import type { Migration } from '../utils/migrations.js';

interface UpdateOptions {
  force?: boolean;
  backup?: boolean;
  check?: boolean;
  dryRun?: boolean;
}

interface UpdateInfo {
  currentVersion: string;
  availableVersion: string;
  needsUpdate: boolean;
  changedFiles: string[];
  userModifiedFiles: string[];
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
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
    } else {
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

  // Copy mode is no longer supported - require fresh install
  if (currentInstallType === 'copy') {
    logger.error('Copy mode installations are no longer supported.');
    logger.error('');
    logger.error('Please reinstall with npm:');
    logger.error('  npm install pennyfarthing');
    logger.error('  npx pennyfarthing init --force');
    process.exit(1);
  }

  // Must have node_modules for symlink mode
  if (!nodeModulesPath) {
    logger.error('@pennyfarthing/core (or pennyfarthing) not found');
    logger.error('');
    logger.error('Please ensure pennyfarthing is installed:');
    logger.error('  npm install pennyfarthing');
    process.exit(1);
  }

  // Migrate manifest from .claude/ to .pennyfarthing/ if needed
  migrateManifest(projectRoot, { dryRun });

  // Remove legacy .claude/ directories (agents, guides, personas, scripts)
  removeLegacyClaudeDirectories(projectRoot, { dryRun });

  // Migrate template files from .claude/ to .pennyfarthing/
  migrateTemplateFiles(projectRoot, { dryRun });

  // Migrate settings.local.json from .claude/ to .pennyfarthing/ if needed
  if (!dryRun) {
    migrateSettingsFile(projectRoot);
  }

  const settingsUpdated = await mergeSettingsLocalJson(projectRoot, assetsPath, { dryRun });

  // Ensure symlink at .claude/settings.local.json
  if (!dryRun) {
    ensureSettingsSymlink(projectRoot);
  }

  if (!updateInfo.needsUpdate && updateInfo.userModifiedFiles.length === 0 && !settingsUpdated) {
    logger.success(`Already up to date (v${updateInfo.currentVersion})`);
    return;
  }

  if (updateInfo.needsUpdate) {
    logger.info(`Updating ${updateInfo.currentVersion} → ${updateInfo.availableVersion}`);
  } else {
    logger.info(`Refreshing files (v${updateInfo.currentVersion})`);
  }

  if (dryRun) {
    logger.info('Dry run mode - no changes will be made');
  }

  // Update installed content by re-copying from package
  await updateInstalledContent(projectRoot, nodeModulesPath, manifest, packageVersion, { dryRun });

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
 * Update installed content by re-copying from package
 * This ensures .pennyfarthing/ has the latest content
 */
async function updateInstalledContent(
  projectRoot: string,
  nodeModulesPath: string,
  manifest: ReturnType<typeof readManifest>,
  version: string,
  options: { dryRun?: boolean }
): Promise<void> {
  const dryRun = options.dryRun;

  logger.newline();
  logger.info('Updating Pennyfarthing content...');

  // Remove legacy .claude/ directories before re-linking
  removeLegacyClaudeDirectories(projectRoot, { dryRun });

  // Migrate template files from .claude/ to .pennyfarthing/
  migrateTemplateFiles(projectRoot, { dryRun });

  // Re-link directories from package to .pennyfarthing/ (symlinks, not copies)
  for (const { name, link } of DIRECTORY_SYMLINKS) {
    const sourcePath = join(nodeModulesPath, name);
    const destPath = join(projectRoot, link);

    if (createDirectorySymlink(sourcePath, destPath, dryRun)) {
      logger.updated(`${link}/`);
    } else {
      logger.warning(`Could not update ${link}`);
    }
  }

  // Ensure project directories exist
  const projectCommandsDir = join(projectRoot, '.pennyfarthing/project/commands');
  if (!pathExists(projectCommandsDir)) {
    if (!dryRun) {
      ensureDirSync(projectCommandsDir);
    }
    logger.created('.pennyfarthing/project/commands/ (for user custom commands)');
  }

  const projectSkillsDir = join(projectRoot, '.pennyfarthing/project/skills');
  if (!pathExists(projectSkillsDir)) {
    if (!dryRun) {
      ensureDirSync(projectSkillsDir);
    }
    logger.created('.pennyfarthing/project/skills/ (for user custom skills)');
  }

  // Re-copy commands and skills
  const builtInCommandsPath = join(nodeModulesPath, 'commands');
  copyCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsDir, dryRun || false);

  const builtInSkillsPath = join(nodeModulesPath, 'skills');
  copySkillsDirectory(projectRoot, builtInSkillsPath, projectSkillsDir, dryRun || false);

  // Migrate sidecars from old location to new location
  await migrateSidecars(projectRoot, { dryRun });

  // Migrate and update settings
  const assetsPath = getAssetsPath();
  if (!dryRun) {
    migrateSettingsFile(projectRoot);
  }
  await mergeSettingsLocalJson(projectRoot, assetsPath, { dryRun });
  if (!dryRun) {
    ensureSettingsSymlink(projectRoot);
  }

  // Refresh git hooks (updates stale copies in .git/hooks/)
  await installGitHooks(projectRoot, nodeModulesPath, { dryRun });

  // Ensure Python scripts (pf CLI) are installed
  await installPythonScripts(nodeModulesPath, { dryRun });

  // Update manifest version
  logger.newline();
  logger.info('Updating manifest...');

  const nodeModulesRelPath = relative(projectRoot, nodeModulesPath);
  const newManifest = createManifest(manifest?.projectName || 'unknown', version, {
    nodeModulesPath: nodeModulesRelPath
  });

  writeManifest(projectRoot, newManifest, { dryRun });
  logger.updated('.pennyfarthing/manifest.json');

  // Write version sentinel
  writeVersionSentinel(projectRoot, version, { dryRun });

  // Run versioned migrations
  const migrationsDir = join(nodeModulesPath, 'migrations');
  const migrationFiles = listMigrationFiles(migrationsDir);

  if (migrationFiles.length > 0) {
    logger.newline();
    logger.info('Running migrations...');

    try {
      const loadedMigrations: Migration[] = [];
      for (const file of migrationFiles) {
        const mod = await import(file);
        loadedMigrations.push({
          id: mod.id,
          description: mod.description,
          up: mod.up,
          check: mod.check,
          ...(mod.down && { down: mod.down }),
        });
      }

      const appliedIds = manifest?.migrationsRun ?? [];
      const pending = getPendingMigrations(loadedMigrations, appliedIds);

      if (pending.length > 0) {
        const result = await runMigrations(pending, projectRoot, appliedIds, {
          dryRun,
          logger,
        });

        if (result.applied.length > 0 && !dryRun) {
          // Update manifest with newly applied migration IDs
          const currentManifest = readManifest(projectRoot);
          if (currentManifest) {
            currentManifest.migrationsRun = [
              ...(currentManifest.migrationsRun ?? []),
              ...result.applied,
            ];
            writeManifest(projectRoot, currentManifest);
          }
        }

        if (!result.success && result.failed) {
          logger.warning(`Migration ${result.failed.id} failed: ${result.failed.error}`);
        }
      }
    } catch (err) {
      logger.warning(`Migration runner error: ${err}`);
    }
  }
}

/**
 * Install pennyfarthing_scripts Python package as the `pf` CLI tool.
 * Uses shared utility that checks local source first, then PyPI.
 */
async function installPythonScripts(
  nodeModulesPath: string,
  options: { dryRun?: boolean }
): Promise<void> {
  logger.newline();
  logger.info('Checking Python scripts (pf CLI)...');

  const version = getPfVersion();
  if (version) {
    logger.skipped('pf CLI', `already installed (${version})`);
    return;
  }

  if (options.dryRun) {
    logger.info('Would install pf CLI via uv/pipx');
    return;
  }

  if (!installPfCli(nodeModulesPath)) {
    logger.warning('Could not install pf CLI — install manually: uv tool install pennyfarthing-scripts');
  }
}

/**
 * Migrate sidecars from .claude/project/agents/{agent}-sidecar/ to .pennyfarthing/sidecars/{agent}/
 * Also migrates from old sprint/sidecars/ location
 * Preserves user content while moving to new location
 */
async function migrateSidecars(
  projectRoot: string,
  options: { dryRun?: boolean }
): Promise<void> {
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
        if (!file.endsWith('.md')) continue;

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
    } catch {
      // Ignore errors reading old directory
    }
  }

  if (migrated > 0) {
    logger.info(`Migrated ${migrated} sidecar files to .pennyfarthing/sidecars/`);
  }

  // Clean up legacy sidecar directories after migration
  // 1. Clean up .claude/project/agents/{agent}-sidecar/ directories
  const legacyAgentsDir = join(projectRoot, '.claude/project/agents');
  if (pathExists(legacyAgentsDir)) {
    let removedCount = 0;
    for (const agent of CORE_AGENTS) {
      const legacySidecarDir = join(legacyAgentsDir, `${agent}-sidecar`);
      if (pathExists(legacySidecarDir)) {
        // Only remove if the agent's sidecar now exists at the new location
        const newAgentDir = join(projectRoot, `.pennyfarthing/sidecars/${agent}`);
        if (pathExists(newAgentDir) && !dryRun) {
          removeSync(legacySidecarDir);
          removedCount++;
        }
      }
    }
    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} legacy .claude/project/agents/ sidecar directories`);
    }

    // Remove the agents/ directory itself if now empty
    try {
      const remaining = readdirSync(legacyAgentsDir);
      if (remaining.length === 0 && !dryRun) {
        removeSync(legacyAgentsDir);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  // 2. Clean up sprint/sidecars/ directory
  const oldSprintSidecars = join(projectRoot, 'sprint/sidecars');
  if (pathExists(oldSprintSidecars)) {
    try {
      const remaining = readdirSync(oldSprintSidecars);
      // Check if all remaining items are agent directories that have been migrated
      const allMigrated = remaining.every(item => {
        const itemPath = join(oldSprintSidecars, item);
        if (!isDirectory(itemPath)) return false;
        // Check if this agent's sidecar now exists in new location
        const newAgentDir = join(projectRoot, `.pennyfarthing/sidecars/${item}`);
        return pathExists(newAgentDir);
      });

      if (allMigrated && !dryRun) {
        removeSync(oldSprintSidecars);
        logger.info('Removed legacy sprint/sidecars/ directory');
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Migrate manifest from .claude/manifest.json to .pennyfarthing/manifest.json
 * If manifest only exists at .claude/, move it to .pennyfarthing/.
 * If already at .pennyfarthing/, no-op.
 */
export function migrateManifest(
  projectRoot: string,
  options: { dryRun?: boolean }
): void {
  const oldPath = join(projectRoot, '.claude/manifest.json');
  const newPath = join(projectRoot, '.pennyfarthing/manifest.json');

  // Already at new location — nothing to do
  if (existsSync(newPath)) {
    return;
  }

  // No legacy manifest — nothing to migrate
  if (!existsSync(oldPath)) {
    return;
  }

  if (!options.dryRun) {
    ensureDirSync(join(projectRoot, '.pennyfarthing'));
    renameSync(oldPath, newPath);
  }
  logger.info('Migrated manifest from .claude/ to .pennyfarthing/');
}

/**
 * Remove legacy .claude/{agents,guides,personas,scripts} directories.
 * These now live under .pennyfarthing/ as symlinks to node_modules.
 * Does NOT touch .claude/commands or .claude/skills (required for Claude Code discovery).
 */
export function removeLegacyClaudeDirectories(
  projectRoot: string,
  options: { dryRun?: boolean }
): void {
  const legacyDirs = ['agents', 'guides', 'personas', 'scripts'];

  for (const name of legacyDirs) {
    const legacyPath = join(projectRoot, '.claude', name);
    if (pathExists(legacyPath)) {
      removeSymlinkOrDirectory(legacyPath, options.dryRun);
      logger.info(`Removed legacy .claude/${name}`);
    }
  }
}

/**
 * Migrate template files from .claude/ to .pennyfarthing/.
 * Moves user-customizable files to their new canonical locations.
 * Does NOT overwrite if file already exists at new location.
 * Does NOT move shared-context.md (user-owned, stays at .claude/).
 */
export function migrateTemplateFiles(
  projectRoot: string,
  options: { dryRun?: boolean }
): void {
  const migrations: Array<{ oldPath: string; newPath: string }> = [
    {
      oldPath: '.claude/project/docs/agent-scopes.yaml',
      newPath: '.pennyfarthing/project/docs/agent-scopes.yaml',
    },
    {
      oldPath: '.claude/project/hooks/setup-env.sh',
      newPath: '.pennyfarthing/project/hooks/setup-env.sh',
    },
    {
      oldPath: '.claude/project/pennyfarthing-settings.yaml',
      newPath: '.pennyfarthing/project/pennyfarthing-settings.yaml',
    },
    {
      oldPath: '.claude/preferences.yaml',
      newPath: '.pennyfarthing/preferences.yaml',
    },
    {
      oldPath: '.claude/persona-config.yaml',
      newPath: '.pennyfarthing/persona-config.yaml',
    },
  ];

  let migrated = 0;

  for (const { oldPath, newPath } of migrations) {
    const fullOldPath = join(projectRoot, oldPath);
    const fullNewPath = join(projectRoot, newPath);

    // Skip if old file doesn't exist
    if (!existsSync(fullOldPath)) {
      continue;
    }

    // Don't overwrite if already at new location
    if (existsSync(fullNewPath)) {
      // Just remove the old file since new location already has content
      if (!options.dryRun) {
        unlinkSync(fullOldPath);
      }
      continue;
    }

    if (!options.dryRun) {
      // Ensure destination directory exists
      ensureDirSync(join(fullNewPath, '..'));
      renameSync(fullOldPath, fullNewPath);
    }
    migrated++;
  }

  if (migrated > 0) {
    logger.info(`Migrated ${migrated} template files to .pennyfarthing/`);
  }

  // Clean up empty .claude/project/ subdirectories after migration
  if (!options.dryRun) {
    const dirsToClean = [
      '.claude/project/hooks',
      '.claude/project/docs',
      '.claude/project',
    ];
    for (const dir of dirsToClean) {
      const fullDir = join(projectRoot, dir);
      if (existsSync(fullDir)) {
        try {
          const entries = readdirSync(fullDir);
          if (entries.length === 0) {
            removeSync(fullDir);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}

async function checkForUpdates(
  projectRoot: string,
  manifest: ReturnType<typeof readManifest>
): Promise<UpdateInfo> {
  const packageVersion = getPackageVersion();
  const assetsPath = getAssetsPath();

  const changedFiles: string[] = [];
  const userModifiedFiles: string[] = [];

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

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}
