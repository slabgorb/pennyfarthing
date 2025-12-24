import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync, copySync } = fsExtra;
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
import { migrateFromSubmodule, hasSubmodule } from './migrate.js';

interface InitOptions {
  force?: boolean;
  migrate?: boolean;
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
  const hasSub = hasSubmodule(projectRoot);
  const hasClaudeDir = pathExists(claudeDir);

  // 2. Handle submodule installation
  if (hasSub) {
    if (options.force || options.migrate) {
      await migrateFromSubmodule(projectRoot, { dryRun });
    } else {
      const action = await prompts.submoduleDetected();
      if (action === 'abort') {
        logger.info('Aborted');
        return;
      }
      await migrateFromSubmodule(projectRoot, { dryRun });
    }
    // After migration, continue with normal init to ensure everything is set up
  }

  // 3. Handle existing npm installation
  if (hasManifest && !hasSub) {
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
  if (hasClaudeDir && !hasManifest && !hasSub && !options.force) {
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
    '.claude/core',
    '.claude/skills',
    '.claude/personas',
    '.claude/project/agents',
    '.claude/project/skills',
    '.claude/project/docs',
    '.claude/project/hooks',
    'scripts/hooks',
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

  // 7. Copy managed assets
  logger.newline();
  logger.info('Copying core files...');

  const managedCopies = [
    { src: 'core/agents', dest: '.claude/core/agents' },
    { src: 'core/subagents', dest: '.claude/core/subagents' },
    { src: 'core/commands', dest: '.claude/core/commands' },
    { src: 'core/guides', dest: '.claude/core/guides' },
    { src: 'skills', dest: '.claude/skills' },
    { src: 'personas', dest: '.claude/personas' },
    { src: 'scripts/hooks', dest: 'scripts/hooks' },
    { src: 'scripts/utils', dest: 'scripts/utils' },
    { src: 'scripts/run.sh', dest: 'scripts/run.sh' },
    { src: 'scripts/agent-session.sh', dest: 'scripts/agent-session.sh' },
    { src: 'scripts/check-context.sh', dest: 'scripts/check-context.sh' },
    { src: 'scripts/repo-utils.sh', dest: 'scripts/repo-utils.sh' },
    { src: 'scripts/worktree-manager.sh', dest: 'scripts/worktree-manager.sh' },
    { src: 'scripts/release.sh', dest: 'scripts/release.sh' },
    { src: 'scripts/uninstall.sh', dest: 'scripts/uninstall.sh' }
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

  // Copy statusline.sh
  const statuslineSrc = join(assetsPath, 'core/statusline.sh');
  const statuslineDest = join(projectRoot, '.claude/core/statusline.sh');
  if (pathExists(statuslineSrc)) {
    if (!dryRun) {
      copySync(statuslineSrc, statuslineDest, { overwrite: true });
    }
    logger.updated('.claude/core/statusline.sh');
  }

  // 8. Create agent sidecars if not exist
  logger.newline();
  logger.info('Creating agent sidecars...');

  for (const agent of AGENTS) {
    const sidecarDir = join(projectRoot, `.claude/project/agents/${agent}-sidecar`);
    if (!pathExists(sidecarDir)) {
      ensureDir(sidecarDir, { dryRun });

      // Create standard sidecar files
      const sidecarFiles = ['patterns.md', 'gotchas.md', 'decisions.md'];
      for (const file of sidecarFiles) {
        const filePath = join(sidecarDir, file);
        if (!dryRun) {
          writeFileSync(filePath, `# ${agent} ${file.replace('.md', '')}\n\n`, 'utf8');
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

  const allHashes = collectFileHashes(projectRoot, managedCopies);
  const manifest = createManifest(finalName, version, allHashes);
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

  // Ensure statusLine is configured
  if (!existingSettings.statusLine && templateContent.statusLine) {
    existingSettings.statusLine = templateContent.statusLine;
    modified = true;
    logger.info('Added missing statusLine configuration');
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
