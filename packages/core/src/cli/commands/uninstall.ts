import { rmSync, statSync, lstatSync, readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { pathExists } from '../utils/files.js';
import { readManifest } from '../utils/manifest.js';
import { confirm } from '../utils/prompts.js';
import { cleanManagedEntries } from '../utils/symlinks.js';

interface UninstallOptions {
  force?: boolean;
  all?: boolean;
  dryRun?: boolean;
}

// Managed paths - always removed during uninstall
// Primary (.pennyfarthing/) + legacy (.claude/) locations
const MANAGED_PATHS = [
  // Current canonical locations (.pennyfarthing/)
  '.pennyfarthing/agents',
  '.pennyfarthing/guides',
  '.pennyfarthing/output-styles',
  '.pennyfarthing/personas',
  '.pennyfarthing/scripts',
  '.pennyfarthing/workflows',
  '.pennyfarthing/manifest.json',
  '.pennyfarthing/project',
  // .claude/ items managed by pennyfarthing
  '.claude/commands',
  '.claude/skills',
  '.claude/settings.local.json',
  // Legacy locations (pre-v7 installs)
  '.claude/pennyfarthing',
  '.claude/agents',
  '.claude/subagents',
  '.claude/guides',
  '.claude/personas',
  '.claude/manifest.json'
];

// Project paths - only removed with --all
const PROJECT_PATHS = [
  '.claude/project',
  '.pennyfarthing/persona-config.yaml',
  '.pennyfarthing/config.local.yaml',
  '.session'
];

// Always preserved - even with --all
const PRESERVED_PATHS = [
  'sprint/archive',
  'sprint/context'
];

export async function uninstallCommand(options: UninstallOptions): Promise<void> {
  const projectRoot = process.cwd();
  const dryRun = options.dryRun;

  // Check for manifest
  const manifest = readManifest(projectRoot);
  if (!manifest) {
    logger.error('No Pennyfarthing installation found in this directory.');
    logger.info('(missing .pennyfarthing/manifest.json)');
    process.exit(1);
  }

  logger.header('Pennyfarthing Uninstall');
  logger.info(`Project: ${projectRoot}`);
  logger.info(`Installed version: ${manifest.version}`);

  if (dryRun) {
    logger.newline();
    logger.info('Dry run mode - no changes will be made');
  }

  // Show what will be removed
  logger.newline();
  logger.header('Files to remove (managed):');

  const managedToRemove: string[] = [];
  for (const path of MANAGED_PATHS) {
    const fullPath = join(projectRoot, path);
    if (pathExists(fullPath)) {
      const info = getPathInfo(fullPath);
      logger.info(`  ${path}${info}`);
      managedToRemove.push(path);
    }
  }

  const projectToRemove: string[] = [];
  if (options.all) {
    logger.newline();
    logger.header('Files to remove (project-specific):');

    for (const path of PROJECT_PATHS) {
      const fullPath = join(projectRoot, path);
      if (pathExists(fullPath)) {
        const info = getPathInfo(fullPath);
        logger.info(`  ${path}${info}`);
        projectToRemove.push(path);
      }
    }

    // Sprint YAML (but not archive/context)
    const sprintYaml = join(projectRoot, 'sprint/current-sprint.yaml');
    if (pathExists(sprintYaml)) {
      logger.info('  sprint/current-sprint.yaml');
      projectToRemove.push('sprint/current-sprint.yaml');
    }
  } else {
    logger.newline();
    logger.header('Files preserved (project-specific):');
    for (const path of PROJECT_PATHS) {
      const fullPath = join(projectRoot, path);
      if (pathExists(fullPath)) {
        logger.success(`  ${path}`);
      }
    }
    if (pathExists(join(projectRoot, 'sprint'))) {
      logger.success('  sprint/');
    }
    logger.newline();
    logger.info('Use --all to also remove project-specific files');
  }

  // Show preserved paths
  logger.newline();
  logger.header('Files ALWAYS preserved (archived work):');
  for (const path of PRESERVED_PATHS) {
    const fullPath = join(projectRoot, path);
    if (pathExists(fullPath)) {
      const info = getPathInfo(fullPath);
      logger.success(`  ${path}${info}`);
    }
  }

  // Confirm unless --force
  if (!options.force && !dryRun) {
    logger.newline();
    const confirmed = await confirm('Proceed with uninstall?');
    if (!confirmed) {
      logger.info('Aborted.');
      return;
    }
  }

  // Remove files
  logger.newline();
  logger.header('Removing files...');

  // Directories where only pf-* entries should be removed (preserves user content)
  const SELECTIVE_CLEAN_DIRS = ['.claude/commands', '.claude/skills'];

  // Remove managed paths
  for (const path of managedToRemove) {
    const fullPath = join(projectRoot, path);
    if (SELECTIVE_CLEAN_DIRS.includes(path)) {
      // Clean only pf-* managed entries, preserve user content
      const removed = cleanManagedEntries(fullPath, 'pf-', dryRun);
      if (removed > 0) {
        logger.error(`  ✗ ${path} (${removed} managed entries removed)`);
      }
      // Only remove the directory itself if empty after cleaning
      if (!dryRun && pathExists(fullPath) && isDirEmpty(fullPath)) {
        rmSync(fullPath, { recursive: true });
        logger.error(`  ✗ ${path}/ (empty, removed)`);
      }
    } else {
      if (!dryRun) {
        rmSync(fullPath, { recursive: true, force: true });
      }
      logger.error(`  ✗ ${path}`);
    }
  }

  // Remove project paths if --all
  if (options.all) {
    for (const path of projectToRemove) {
      const fullPath = join(projectRoot, path);
      if (!dryRun) {
        rmSync(fullPath, { recursive: true, force: true });
      }
      logger.error(`  ✗ ${path}`);
    }

    // Show preserved
    logger.newline();
    logger.header('Preserved:');
    for (const path of PRESERVED_PATHS) {
      const fullPath = join(projectRoot, path);
      if (pathExists(fullPath)) {
        logger.success(`  ✓ ${path}`);
      }
    }
  }

  // Clean up empty directories
  cleanupEmptyDirs(projectRoot, dryRun);

  // Remove symlinks in .claude/ if they exist
  const symlinks = ['agents', 'subagents', 'commands', 'guides'];
  for (const link of symlinks) {
    const linkPath = join(projectRoot, '.claude', link);
    try {
      const stats = lstatSync(linkPath);
      if (stats.isSymbolicLink()) {
        if (!dryRun) {
          rmSync(linkPath);
        }
        logger.error(`  ✗ .claude/${link} (symlink)`);
      }
    } catch {
      // Ignore - doesn't exist or not a symlink
    }
  }

  logger.newline();
  logger.success('Pennyfarthing uninstalled successfully.');
  logger.newline();
  logger.info('To reinstall:');
  logger.info('  pf setup');
}

function getPathInfo(fullPath: string): string {
  try {
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      const files = countFiles(fullPath);
      return ` (${files} files)`;
    }
    return '';
  } catch {
    return '';
  }
}

function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += countFiles(join(dir, entry.name));
      }
    }
  } catch {
    // Ignore errors
  }
  return count;
}

function cleanupEmptyDirs(projectRoot: string, dryRun?: boolean): void {
  // Clean up .claude if empty
  const claudeDir = join(projectRoot, '.claude');
  if (pathExists(claudeDir) && isDirEmpty(claudeDir)) {
    if (!dryRun) {
      rmSync(claudeDir, { recursive: true });
    }
    logger.error('  ✗ .claude/ (empty)');
  }

  // Clean up scripts if empty
  const scriptsDir = join(projectRoot, 'scripts');
  if (pathExists(scriptsDir) && isDirEmpty(scriptsDir)) {
    if (!dryRun) {
      rmSync(scriptsDir, { recursive: true });
    }
    logger.error('  ✗ scripts/ (empty)');
  }
}

function isDirEmpty(dir: string): boolean {
  try {
    const entries = readdirSync(dir);
    if (entries.length === 0) return true;

    // Check if all entries are empty directories
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isFile()) return false;
      if (stats.isDirectory() && !isDirEmpty(fullPath)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
