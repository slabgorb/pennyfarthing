import { existsSync, readFileSync, writeFileSync, unlinkSync, symlinkSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';

const { copySync, ensureDirSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { prompts } from '../utils/prompts.js';
import {
  manifestExists,
  readManifest,
  writeManifest,
  updateManifestForUpdate
} from '../utils/manifest.js';
import {
  pathExists,
  isDirectory,
  isSymlink,
  hashFile,
  getDirectoryHashes,
  getAllFiles
} from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';

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

  // Always check and update settings (idempotent - only makes changes if needed)
  const assetsPath = getAssetsPath();
  const settingsUpdated = await mergeSettingsHooks(projectRoot, assetsPath, { dryRun });

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

  // 4. Handle user-modified files
  let skipFiles: string[] = [];

  if (updateInfo.userModifiedFiles.length > 0 && !options.force) {
    const action = await prompts.modifiedFiles(updateInfo.userModifiedFiles);

    if (action === 'skip') {
      skipFiles = updateInfo.userModifiedFiles;
    } else if (action === 'backup') {
      await backupFiles(projectRoot, updateInfo.userModifiedFiles, { dryRun });
    }
    // 'overwrite' - continue normally
  }

  // 5. Update managed files
  logger.newline();
  logger.info('Updating files...');

  // New structure: everything installs to .claude/pennyfarthing/
  const managedCopies = [
    { src: 'agents', dest: '.claude/pennyfarthing/agents' },
    { src: 'subagents', dest: '.claude/pennyfarthing/subagents' },
    { src: 'commands', dest: '.claude/pennyfarthing/commands' },
    { src: 'guides', dest: '.claude/pennyfarthing/guides' },
    { src: 'skills', dest: '.claude/pennyfarthing/skills' },
    { src: 'personas', dest: '.claude/pennyfarthing/personas' },
    { src: 'scripts', dest: '.claude/pennyfarthing/scripts' }
  ];

  for (const { src, dest } of managedCopies) {
    const srcPath = join(assetsPath, src);
    const destPath = join(projectRoot, dest);

    if (!pathExists(srcPath)) continue;

    // Handle individual files vs directories
    if (!isDirectory(srcPath)) {
      // Single file copy
      if (skipFiles.some(sf => dest.includes(sf) || sf.includes(dest))) {
        logger.skipped(dest, 'user modified');
        continue;
      }

      if (!dryRun) {
        ensureDirSync(join(destPath, '..'));
        copySync(srcPath, destPath, { overwrite: true });
      }
      logger.updated(dest);
      continue;
    }

    // Directory copy - get all files recursively
    const files = getAllFiles(srcPath);

    for (const file of files) {
      const fullDest = join(destPath, file);
      const relativePath = join(dest, file);

      // Check if this file should be skipped
      if (skipFiles.some(sf => relativePath.includes(sf) || sf.includes(relativePath))) {
        logger.skipped(relativePath, 'user modified');
        continue;
      }

      if (!dryRun) {
        ensureDirSync(join(destPath, file, '..'));
        copySync(join(srcPath, file), fullDest, { overwrite: true });
      }
      logger.updated(relativePath);
    }
  }

  // Update statusline
  const statuslineSrc = join(assetsPath, 'statusline.sh');
  const statuslineDest = join(projectRoot, '.claude/pennyfarthing/statusline.sh');
  if (pathExists(statuslineSrc)) {
    if (!dryRun) {
      ensureDirSync(join(projectRoot, '.claude/pennyfarthing'));
      copySync(statuslineSrc, statuslineDest, { overwrite: true });
    }
    logger.updated('.claude/pennyfarthing/statusline.sh');
  }

  // Ensure symlinks exist for Claude Code to find commands
  // These point from .claude/ into .claude/pennyfarthing/
  logger.newline();
  logger.info('Updating symlinks...');

  const symlinks = [
    { target: 'pennyfarthing/commands', link: '.claude/commands' },
    { target: 'pennyfarthing/agents', link: '.claude/agents' },
    { target: 'pennyfarthing/subagents', link: '.claude/subagents' },
    { target: 'pennyfarthing/guides', link: '.claude/guides' },
    { target: 'pennyfarthing/skills', link: '.claude/skills' },
    { target: 'pennyfarthing/personas', link: '.claude/personas' }
  ];

  for (const { target, link } of symlinks) {
    const linkPath = join(projectRoot, link);

    // Check if symlink already exists and points to correct target
    if (pathExists(linkPath)) {
      continue; // Already exists
    }

    if (!dryRun) {
      try {
        symlinkSync(target, linkPath);
        logger.created(`${link} -> ${target}`);
      } catch (e) {
        logger.warning(`Could not create symlink ${link}: ${e}`);
      }
    } else {
      logger.created(`${link} -> ${target}`);
    }
  }

  // Ensure settings.local.json has required hooks
  await mergeSettingsHooks(projectRoot, assetsPath, { dryRun });

  // 6. Update manifest
  logger.newline();
  logger.info('Updating manifest...');

  const newHashes = collectFileHashes(projectRoot, managedCopies);
  const newManifest = updateManifestForUpdate(
    manifest,
    packageVersion,
    newHashes,
    skipFiles.length > 0 ? skipFiles : undefined
  );

  writeManifest(projectRoot, newManifest, { dryRun });
  logger.updated('.claude/manifest.json');

  // 7. Success
  logger.newline();
  logger.success(`Updated to v${packageVersion}`);

  // 8. Run doctor
  logger.newline();
  logger.info('Running health check...');
  const { doctorCommand } = await import('./doctor.js');
  await doctorCommand({ quiet: true });
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

async function backupFiles(
  projectRoot: string,
  files: string[],
  options: { dryRun?: boolean }
): Promise<void> {
  const backupDir = join(projectRoot, '.claude/backups', new Date().toISOString().split('T')[0]);

  if (!options.dryRun) {
    ensureDirSync(backupDir);
  }

  for (const file of files) {
    const srcPath = join(projectRoot, file);
    const destPath = join(backupDir, file);

    if (pathExists(srcPath) && !options.dryRun) {
      ensureDirSync(join(destPath, '..'));
      copySync(srcPath, destPath);
    }

    logger.info(`  Backed up: ${file}`);
  }
}

function collectFileHashes(
  projectRoot: string,
  managedCopies: Array<{ src: string; dest: string }>
): Record<string, string> {
  const hashes: Record<string, string> = {};

  for (const { dest } of managedCopies) {
    const destPath = join(projectRoot, dest);
    if (isDirectory(destPath)) {
      const dirHashes = getDirectoryHashes(destPath);
      for (const [file, hash] of Object.entries(dirHashes)) {
        hashes[join(dest, file)] = hash;
      }
    }
  }

  return hashes;
}

/**
 * Merge required hooks into existing settings.local.json
 * This ensures critical hooks like SessionStart are always configured
 * Returns true if any changes were made
 */
async function mergeSettingsHooks(
  projectRoot: string,
  assetsPath: string,
  options: { dryRun?: boolean }
): Promise<boolean> {
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
  let existingSettings: Record<string, unknown>;
  try {
    existingSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    logger.warning('Could not parse existing settings.local.json, skipping merge');
    return false;
  }

  let modified = false;

  // Ensure hooks object exists
  if (!existingSettings.hooks) {
    existingSettings.hooks = {};
    modified = true;
  }

  const hooks = existingSettings.hooks as Record<string, unknown>;

  // Merge SessionStart hooks - these are critical for PROJECT_ROOT
  if (!hooks.SessionStart) {
    hooks.SessionStart = templateContent.hooks?.SessionStart || [];
    modified = true;
    logger.info('Added missing SessionStart hooks');
  } else if (Array.isArray(hooks.SessionStart)) {
    // Check if session-start.sh hook is configured
    const hasSessionStartHook = hooks.SessionStart.some((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        return hookEntry.hooks?.some(h =>
          h.command?.includes('session-start.sh')
        );
      }
      return false;
    });

    if (!hasSessionStartHook && templateContent.hooks?.SessionStart) {
      // Prepend the session-start.sh hook entry
      const sessionStartEntry = templateContent.hooks.SessionStart.find((entry: unknown) => {
        if (typeof entry === 'object' && entry !== null) {
          const hookEntry = entry as { hooks?: Array<{ command?: string }> };
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
  const statusLine = existingSettings.statusLine as Record<string, unknown> | undefined;
  if (!statusLine) {
    existingSettings.statusLine = templateContent.statusLine;
    modified = true;
    logger.info('Added missing statusLine configuration');
  } else if (statusLine.command && typeof statusLine.command === 'string' &&
             statusLine.command.includes('.claude/core/statusline.sh')) {
    // Migrate from old path to new path
    statusLine.command = statusLine.command.replace(
      '.claude/core/statusline.sh',
      '.claude/pennyfarthing/statusline.sh'
    );
    modified = true;
    logger.info('Updated statusLine path to new location');
  }

  if (modified && !options.dryRun) {
    writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');
    logger.updated('.claude/settings.local.json');
  }

  return modified;
}
