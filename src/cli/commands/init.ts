import { existsSync, readFileSync, writeFileSync, unlinkSync, symlinkSync, realpathSync, readdirSync } from 'fs';
import { join, basename, relative, dirname } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync, copySync, removeSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { prompts, confirm } from '../utils/prompts.js';
import {
  manifestExists,
  readManifest,
  writeManifest,
  createManifest
} from '../utils/manifest.js';
import {
  pathExists,
  isSymlink,
  isDirectory,
  copyDirectory,
  getDirectoryHashes,
  ensureDir
} from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';

/**
 * Find pennyfarthing in node_modules (handles monorepo hoisting)
 * Returns the absolute path to pennyfarthing-dist/ or null if not found
 */
function findNodeModulesPath(projectRoot: string): string | null {
  // Check standard location first
  const standard = join(projectRoot, 'node_modules/pennyfarthing/pennyfarthing-dist');
  if (pathExists(standard)) return standard;

  // Check hoisted locations (monorepo)
  let dir = dirname(projectRoot);
  while (dir !== '/' && dir !== dirname(dir)) {
    const hoisted = join(dir, 'node_modules/pennyfarthing/pennyfarthing-dist');
    if (pathExists(hoisted)) return hoisted;
    dir = dirname(dir);
  }

  return null;
}

/**
 * Compute relative path for symlink from link location to target
 */
function computeRelativeSymlink(linkPath: string, targetPath: string): string {
  const linkDir = dirname(linkPath);
  return relative(linkDir, targetPath);
}

/**
 * Create commands directory with individual symlinks to each command file.
 * This allows users to add their own commands alongside built-in ones.
 *
 * @param projectRoot - Project root directory
 * @param builtInCommandsPath - Path to built-in commands (e.g., node_modules/.../commands)
 * @param projectCommandsPath - Path to user project commands (e.g., .claude/project/commands)
 * @param dryRun - If true, don't make actual changes
 */
function createCommandsDirectory(
  projectRoot: string,
  builtInCommandsPath: string,
  projectCommandsPath: string,
  dryRun: boolean
): void {
  const commandsDir = join(projectRoot, '.claude/commands');

  // Remove existing symlink or directory
  if (pathExists(commandsDir) || isSymlink(commandsDir)) {
    if (!dryRun) {
      try {
        unlinkSync(commandsDir);
      } catch {
        try {
          removeSync(commandsDir);
        } catch {
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
        } catch (e) {
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
      // Don't override built-in commands (user can explicitly remove built-in symlink if needed)
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
        } catch (e) {
          logger.warning(`Could not create symlink for ${cmd}: ${e}`);
        }
      } else {
        linkedCount++;
      }
    }
    if (linkedCount > 0) {
      logger.info(`  Linked ${linkedCount} user commands from project/commands/`);
    }
  }
}

interface InitOptions {
  force?: boolean;
  skipTemplates?: boolean;
  dryRun?: boolean;
}

const AGENTS = [
  'dev', 'tea', 'sm', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator'
];

export async function initCommand(
  projectName: string | undefined,
  options: InitOptions
): Promise<void> {
  const projectRoot = process.cwd();
  const claudeDir = join(projectRoot, '.claude');
  const dryRun = options.dryRun;

  logger.header('Pennyfarthing Initialization');

  if (dryRun) {
    logger.info('Dry run mode - no changes will be made');
  }

  // Detect project name
  const detectedName = projectName || basename(projectRoot);

  // 1. Check for existing installations
  const hasManifest = manifestExists(projectRoot);
  const hasClaudeDir = pathExists(claudeDir);

  // 2. Handle existing npm installation
  if (hasManifest) {
    const manifest = readManifest(projectRoot);
    if (!options.force) {
      const action = await prompts.alreadyInstalled(manifest?.version || 'unknown');
      if (action === 'abort') {
        logger.info('Aborted');
        return;
      }
      if (action === 'update') {
        // Delegate to update command
        const { updateCommand } = await import('./update.js');
        return updateCommand(options);
      }
      // reinstall - continue below
    }
  }

  // 4. Handle existing .claude directory without manifest
  if (hasClaudeDir && !hasManifest && !options.force) {
    const action = await prompts.existingSetup();
    if (action === 'abort') {
      logger.info('Aborted');
      return;
    }
    // Both 'merge' and 'overwrite' proceed - merge just preserves project/
  }

  // 5. Get final project name
  const finalName = options.force ? detectedName : await prompts.projectName(detectedName);

  logger.newline();
  logger.header('Installing Pennyfarthing...');

  const assetsPath = getAssetsPath();
  const version = getPackageVersion();

  // 6. Create directory structure
  logger.info('Creating directories...');
  const directories = [
    '.claude',
    '.claude/project/agents',
    '.claude/project/commands',
    '.claude/project/skills',
    '.claude/project/docs',
    '.claude/project/hooks',
    'sprint',
    '.session'
  ];

  for (const dir of directories) {
    const fullPath = join(projectRoot, dir);
    if (!pathExists(fullPath)) {
      ensureDir(fullPath, { dryRun });
      logger.created(dir);
    }
  }

  // 7. Determine installation mode: symlink (preferred) or copy (fallback)
  const nodeModulesPath = findNodeModulesPath(projectRoot);
  const useSymlinkMode = nodeModulesPath !== null;

  // Track installation type for manifest
  let installationType: 'symlink' | 'copy' = 'copy';
  let nodeModulesRelPath: string | undefined;

  if (useSymlinkMode) {
    installationType = 'symlink';
    // Compute relative path from project root to node_modules pennyfarthing-dist
    nodeModulesRelPath = relative(projectRoot, nodeModulesPath);

    logger.newline();
    logger.info('Creating symlinks to node_modules...');
    logger.info(`  Found: ${nodeModulesRelPath}`);

    // Remove legacy .claude/pennyfarthing/ if it exists (migration from copy mode)
    const legacyPennyfarthingDir = join(projectRoot, '.claude/pennyfarthing');
    if (pathExists(legacyPennyfarthingDir) && isDirectory(legacyPennyfarthingDir)) {
      if (!dryRun) {
        removeSync(legacyPennyfarthingDir);
      }
      logger.info('Removed legacy .claude/pennyfarthing/ (migrating to symlink mode)');
    }

    // Create symlinks pointing to node_modules (except commands - handled separately)
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

      // Remove existing symlink or file
      if (pathExists(linkPath) || isSymlink(linkPath)) {
        if (!dryRun) {
          try {
            unlinkSync(linkPath);
          } catch (e) {
            // Might be a directory from copy mode
            try {
              removeSync(linkPath);
            } catch {
              // Ignore
            }
          }
        }
      }

      if (!dryRun) {
        const relativeTarget = computeRelativeSymlink(linkPath, targetPath);
        try {
          symlinkSync(relativeTarget, linkPath);
          logger.created(`${link} -> ${relativeTarget}`);
        } catch (e) {
          logger.warning(`Could not create symlink ${link}: ${e}`);
        }
      } else {
        const relativeTarget = computeRelativeSymlink(linkPath, targetPath);
        logger.created(`${link} -> ${relativeTarget}`);
      }
    }

    // Create commands directory with individual symlinks (allows user commands)
    const builtInCommandsPath = join(nodeModulesPath, 'commands');
    const projectCommandsPath = join(projectRoot, '.claude/project/commands');
    createCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsPath, dryRun || false);
  } else {
    // Fallback: Copy mode (for npx usage or development)
    logger.newline();
    logger.warning('node_modules/pennyfarthing not found - using copy mode');
    logger.info('  (Add pennyfarthing to package.json dependencies for symlink mode)');
    logger.newline();
    logger.info('Copying core files...');

    // Create pennyfarthing directory for copies
    const pennyfarthingDir = join(projectRoot, '.claude/pennyfarthing');
    if (!pathExists(pennyfarthingDir)) {
      ensureDir(pennyfarthingDir, { dryRun });
    }

    const managedCopies = [
      { src: 'agents', dest: '.claude/pennyfarthing/agents' },
      { src: 'commands', dest: '.claude/pennyfarthing/commands' },
      { src: 'guides', dest: '.claude/pennyfarthing/guides' },
      { src: 'skills', dest: '.claude/pennyfarthing/skills' },
      { src: 'personas', dest: '.claude/pennyfarthing/personas' },
      { src: 'scripts', dest: '.claude/pennyfarthing/scripts' }
    ];

    for (const { src, dest } of managedCopies) {
      const srcPath = join(assetsPath, src);
      const destPath = join(projectRoot, dest);

      if (pathExists(srcPath)) {
        if (!dryRun) {
          copySync(srcPath, destPath, { overwrite: true });
        }
        logger.updated(dest);
      }
    }

    // Create symlinks from .claude/ to .claude/pennyfarthing/ (except commands)
    logger.newline();
    logger.info('Creating symlinks...');

    const symlinks = [
      { target: 'pennyfarthing/agents', link: '.claude/agents' },
      { target: 'pennyfarthing/guides', link: '.claude/guides' },
      { target: 'pennyfarthing/skills', link: '.claude/skills' },
      { target: 'pennyfarthing/personas', link: '.claude/personas' },
      { target: 'pennyfarthing/scripts', link: '.claude/scripts' }
    ];

    for (const { target, link } of symlinks) {
      const linkPath = join(projectRoot, link);

      if (pathExists(linkPath) || isSymlink(linkPath)) {
        if (!dryRun) {
          try {
            unlinkSync(linkPath);
          } catch (e) {
            // Ignore errors - might be a directory
          }
        }
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

    // Create commands directory with individual symlinks (allows user commands)
    const builtInCommandsPath = join(projectRoot, '.claude/pennyfarthing/commands');
    const projectCommandsPath = join(projectRoot, '.claude/project/commands');
    createCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsPath, dryRun || false);
  }

  // 8. Create agent sidecars if not exist
  logger.newline();
  logger.info('Creating agent sidecars...');

  const sidecarTemplatesPath = join(assetsPath, 'templates/sidecar');

  for (const agent of AGENTS) {
    const sidecarDir = join(projectRoot, `.claude/project/agents/${agent}-sidecar`);
    if (!pathExists(sidecarDir)) {
      ensureDir(sidecarDir, { dryRun });

      // Create standard sidecar files using templates
      const sidecarFiles = ['patterns.md', 'gotchas.md', 'decisions.md'];
      for (const file of sidecarFiles) {
        const filePath = join(sidecarDir, file);
        const templatePath = join(sidecarTemplatesPath, `${file}.template`);

        if (!dryRun) {
          let content: string;

          // Use template if available, otherwise fall back to simple header
          if (pathExists(templatePath)) {
            content = readFileSync(templatePath, 'utf8');
            content = content.replace(/\$\{AGENT_NAME\}/g, agent);
          } else {
            content = `# ${agent} ${file.replace('.md', '')}\n\n`;
          }

          writeFileSync(filePath, content, 'utf8');
        }
      }
      logger.created(`.claude/project/agents/${agent}-sidecar/`);
    }
  }

  // 9. Generate template files (if not exist and not skipped)
  if (!options.skipTemplates) {
    logger.newline();
    logger.info('Generating configuration files...');

    await generateTemplateFiles(projectRoot, finalName, assetsPath, { dryRun });
  }

  // 10. Write manifest
  logger.newline();
  logger.info('Writing manifest...');

  // For symlink mode, no file hashes needed
  // For copy mode, collect hashes of copied files
  let fileHashes: Record<string, string> = {};
  if (installationType === 'copy') {
    const managedCopies = [
      { src: 'agents', dest: '.claude/pennyfarthing/agents' },
      { src: 'commands', dest: '.claude/pennyfarthing/commands' },
      { src: 'guides', dest: '.claude/pennyfarthing/guides' },
      { src: 'skills', dest: '.claude/pennyfarthing/skills' },
      { src: 'personas', dest: '.claude/pennyfarthing/personas' },
      { src: 'scripts', dest: '.claude/pennyfarthing/scripts' }
    ];
    fileHashes = collectFileHashes(projectRoot, managedCopies);
  }

  const manifest = createManifest(finalName, version, {
    installationType,
    nodeModulesPath: nodeModulesRelPath,
    fileHashes
  });
  writeManifest(projectRoot, manifest, { dryRun });
  logger.created('.claude/manifest.json');

  // 11. Update .gitignore
  await updateGitignore(projectRoot, { dryRun });

  // 12. Success message
  logger.newline();
  logger.success(`Pennyfarthing v${version} initialized in ${finalName}`);
  logger.newline();
  logger.info('Next steps:');
  logger.info('  1. Edit .claude/project/docs/shared-context.md with your project info');
  logger.info('  2. Configure .claude/persona-config.yaml for your preferred theme');
  logger.info('  3. Run `pennyfarthing doctor` to verify installation');
}

async function generateTemplateFiles(
  projectRoot: string,
  projectName: string,
  assetsPath: string,
  options: { dryRun?: boolean }
): Promise<void> {
  const templatesPath = join(assetsPath, 'templates');

  // Templates that should be skipped if they exist (user-customized)
  const skipIfExistsTemplates = [
    { template: 'persona-config.yaml.template', dest: '.claude/persona-config.yaml' },
    { template: 'preferences.yaml.template', dest: '.claude/preferences.yaml' },
    { template: 'shared-context.md.template', dest: '.claude/project/docs/shared-context.md' },
    { template: 'agent-scopes.yaml.template', dest: '.claude/project/docs/agent-scopes.yaml' },
    { template: 'repos.yaml.template', dest: '.claude/project/repos.yaml' },
    { template: 'setup-env.sh.template', dest: '.claude/project/hooks/setup-env.sh' }
  ];

  for (const { template, dest } of skipIfExistsTemplates) {
    const destPath = join(projectRoot, dest);

    // Skip if already exists
    if (pathExists(destPath)) {
      logger.skipped(dest, 'already exists');
      continue;
    }

    const templatePath = join(templatesPath, template);

    if (pathExists(templatePath)) {
      if (!options.dryRun) {
        let content = readFileSync(templatePath, 'utf8');
        content = content.replace(/\$\{PROJECT_NAME\}/g, projectName);
        content = content.replace(/\$\{PROJECT_ROOT\}/g, projectRoot);
        ensureDirSync(join(projectRoot, dest, '..'));
        writeFileSync(destPath, content, 'utf8');
      }
      logger.created(dest);
    }
  }

  // Handle settings.local.json specially - merge required hooks
  await mergeSettingsLocalJson(projectRoot, assetsPath, options);
}

/**
 * Merge required hooks into existing settings.local.json
 * This ensures critical hooks like SessionStart are always configured
 */
async function mergeSettingsLocalJson(
  projectRoot: string,
  assetsPath: string,
  options: { dryRun?: boolean }
): Promise<void> {
  const settingsPath = join(projectRoot, '.claude/settings.local.json');
  const templatePath = join(assetsPath, 'templates/settings.local.json.template');

  if (!pathExists(templatePath)) {
    logger.warning('settings.local.json template not found');
    return;
  }

  const templateContent = JSON.parse(readFileSync(templatePath, 'utf8'));

  // If no existing settings, create from template
  if (!pathExists(settingsPath)) {
    if (!options.dryRun) {
      ensureDirSync(join(projectRoot, '.claude'));
      writeFileSync(settingsPath, JSON.stringify(templateContent, null, 2), 'utf8');
    }
    logger.created('.claude/settings.local.json');
    return;
  }

  // Read existing settings
  let existingSettings: Record<string, unknown>;
  try {
    existingSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    logger.warning('Could not parse existing settings.local.json, skipping merge');
    return;
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
  } else if (statusLine.command && typeof statusLine.command === 'string') {
    // Migrate from any legacy path to new path (.claude/scripts/statusline.sh)
    const legacyPaths = [
      '.claude/core/statusline.sh',
      '.claude/statusline.sh',
      '.claude/pennyfarthing/statusline.sh'  // Also migrate from old copy-mode path
    ];
    for (const legacyPath of legacyPaths) {
      if (statusLine.command.includes(legacyPath)) {
        statusLine.command = statusLine.command.replace(
          legacyPath,
          '.claude/scripts/statusline.sh'
        );
        modified = true;
        logger.info(`Updated statusLine path from ${legacyPath} to new location`);
        break;
      }
    }
  }

  if (modified && !options.dryRun) {
    writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');
    logger.updated('.claude/settings.local.json');
  } else if (!modified) {
    logger.skipped('.claude/settings.local.json', 'hooks already configured');
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

async function updateGitignore(
  projectRoot: string,
  options: { dryRun?: boolean }
): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore');
  const entries = [
    '',
    '# Pennyfarthing runtime',
    '.session/*',
    '!.session/.gitkeep',
    '.claude/settings.local.json'
  ];

  let content = '';
  if (pathExists(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf8');
  }

  // Check which entries need to be added
  const toAdd = entries.filter(entry => {
    if (entry === '') return false;
    if (entry.startsWith('#')) return !content.includes(entry);
    return !content.includes(entry);
  });

  if (toAdd.length > 0 && !options.dryRun) {
    const addition = '\n' + entries.join('\n') + '\n';
    writeFileSync(gitignorePath, content + addition, 'utf8');
    logger.updated('.gitignore');
  }
}
