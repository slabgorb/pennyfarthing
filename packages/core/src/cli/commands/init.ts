import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, relative, basename } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync, removeSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { prompts } from '../utils/prompts.js';
import {
  manifestExists,
  readManifest,
  writeManifest,
  createManifest
} from '../utils/manifest.js';
import {
  pathExists,
  isDirectory,
  ensureDir
} from '../utils/files.js';
import { getPackageVersion, getAssetsPath } from '../utils/version.js';
import {
  createDirectorySymlink,
  copyCommandsDirectory,
  copySkillsDirectory,
  removeSymlinkOrDirectory
} from '../utils/symlinks.js';
import { findNodeModulesPath } from '../utils/node-modules.js';
import { CORE_AGENTS, DIRECTORY_SYMLINKS } from '../utils/constants.js';
import { mergeSettingsLocalJson, ensureSettingsSymlink } from '../utils/settings.js';
import { migrateTemplateFiles } from './update.js';
import { getPfVersion, installPfCli } from '../utils/python.js';
import { writeVersionSentinel } from '../utils/version-sentinel.js';

interface InitOptions {
  force?: boolean;
  skipTemplates?: boolean;
  dryRun?: boolean;
}

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
    '.pennyfarthing',
    '.pennyfarthing/project/commands',
    '.pennyfarthing/project/skills',
    '.pennyfarthing/project/docs',
    '.pennyfarthing/project/hooks',
    'sprint',
    '.pennyfarthing/sidecars',
    '.session'
  ];

  for (const dir of directories) {
    const fullPath = join(projectRoot, dir);
    if (!pathExists(fullPath)) {
      ensureDir(fullPath, { dryRun });
      logger.created(dir);
    }
  }

  // 7. Find node_modules installation (required - copy mode removed in v4.0.4)
  const nodeModulesPath = findNodeModulesPath(projectRoot);

  if (!nodeModulesPath) {
    logger.error('@pennyfarthing/core (or pennyfarthing) not found');
    logger.error('');
    logger.error('Pennyfarthing requires npm installation:');
    logger.error('  npm install pennyfarthing');
    logger.error('  npx pennyfarthing init');
    logger.error('');
    logger.error('For framework development (orchestrator pattern), use install-git-hooks.sh instead.');
    process.exit(1);
  }

  // Compute relative path from project root to node_modules pennyfarthing-dist
  const nodeModulesRelPath = relative(projectRoot, nodeModulesPath);

  logger.newline();
  logger.info('Linking Pennyfarthing content to .pennyfarthing/...');
  logger.info(`  Source: ${nodeModulesRelPath}`);

  // Remove legacy .claude/pennyfarthing/ if it exists (migration from old copy mode)
  const legacyPennyfarthingDir = join(projectRoot, '.claude/pennyfarthing');
  if (pathExists(legacyPennyfarthingDir) && isDirectory(legacyPennyfarthingDir)) {
    if (!dryRun) {
      removeSync(legacyPennyfarthingDir);
    }
    logger.info('Removed legacy .claude/pennyfarthing/');
  }

  // Remove legacy symlinks from .claude/ (now in .pennyfarthing/)
  const legacyClaudeSymlinks = ['agents', 'guides', 'personas', 'scripts'];
  for (const name of legacyClaudeSymlinks) {
    const legacyPath = join(projectRoot, '.claude', name);
    if (pathExists(legacyPath)) {
      removeSymlinkOrDirectory(legacyPath, dryRun);
      logger.info(`Removed legacy .claude/${name}`);
    }
  }

  // Symlink directories from node_modules to .pennyfarthing/
  // Symlinks are required for prime.sh to find pennyfarthing_scripts via path resolution
  for (const { name, link } of DIRECTORY_SYMLINKS) {
    const sourcePath = join(nodeModulesPath, name);
    const destPath = join(projectRoot, link);

    if (createDirectorySymlink(sourcePath, destPath, dryRun)) {
      logger.created(`${link}/ (symlinked to package)`);
    } else {
      logger.warning(`Could not symlink ${name} to ${link}`);
    }
  }

  // Copy commands directory (allows user commands alongside built-in)
  const builtInCommandsPath = join(nodeModulesPath, 'commands');
  const projectCommandsPath = join(projectRoot, '.pennyfarthing/project/commands');
  copyCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsPath, dryRun || false);

  // Copy skills directory (allows user skills alongside built-in)
  const builtInSkillsPath = join(nodeModulesPath, 'skills');
  const projectSkillsPath = join(projectRoot, '.pennyfarthing/project/skills');
  copySkillsDirectory(projectRoot, builtInSkillsPath, projectSkillsPath, dryRun || false);

  // 8. Create agent sidecars if not exist
  logger.newline();
  logger.info('Creating agent sidecars...');

  const sidecarTemplatesPath = join(assetsPath, 'templates/sidecar');

  for (const agent of CORE_AGENTS) {
    const sidecarDir = join(projectRoot, `.pennyfarthing/sidecars/${agent}`);
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
      logger.created(`.pennyfarthing/sidecars/${agent}/`);
    }
  }

  // 9. Install git hooks
  await installGitHooks(projectRoot, nodeModulesPath, { dryRun });

  // 9b. Install Python scripts package (pennyfarthing_scripts → `pf` CLI)
  await installPythonScripts(nodeModulesPath, { dryRun });

  // 9c. Migrate template files from old .claude/ locations to .pennyfarthing/
  migrateTemplateFiles(projectRoot, { dryRun });

  // 10. Generate template files (if not exist and not skipped)
  if (!options.skipTemplates) {
    logger.newline();
    logger.info('Generating configuration files...');

    await generateTemplateFiles(projectRoot, finalName, assetsPath, { dryRun });
  }

  // 10. Write manifest
  logger.newline();
  logger.info('Writing manifest...');

  const manifest = createManifest(finalName, version, {
    nodeModulesPath: nodeModulesRelPath
  });
  writeManifest(projectRoot, manifest, { dryRun });
  logger.created('.pennyfarthing/manifest.json');

  // 10b. Write version sentinel
  writeVersionSentinel(projectRoot, version, { dryRun });

  // 11. Update .gitignore
  await updateGitignore(projectRoot, { dryRun });

  // 12. Success message
  logger.newline();
  logger.success(`Pennyfarthing v${version} initialized in ${finalName}`);
  logger.newline();
  logger.info('Next steps:');
  logger.info('  1. Run /setup to complete project configuration');
  logger.info('     - Discover repos and tech stack');
  logger.info('     - Generate repos.yaml and CLAUDE.md');
  logger.info('     - Configure theme and optional Cyclist');
  logger.newline();
  logger.info('  Or configure manually:');
  logger.info('  - Edit .claude/project/docs/shared-context.md with your project info');
  logger.info('  - Configure .pennyfarthing/persona-config.yaml for your preferred theme');
  logger.info('  - Run `pennyfarthing doctor` to verify installation');
}

/**
 * Generate a dispatcher script for a given hook name by substituting
 * __HOOK_NAME__ in the shared template.
 */
function generateDispatcher(hookName: string, template: string): string {
  return template.replace(/__HOOK_NAME__/g, hookName);
}

/**
 * Install git hooks using .d/ dispatcher pattern.
 * Creates a dispatcher script at .git/hooks/{hook} that runs all
 * executable scripts in .git/hooks/{hook}.d/ in sorted order.
 * Pennyfarthing hooks are placed in the .d/ directory with numeric prefixes.
 * Existing hooks are migrated into .d/ to preserve user customizations.
 *
 * Installs: pre-commit, pre-push, post-merge
 */
export async function installGitHooks(
  projectRoot: string,
  nodeModulesPath: string,
  options: { dryRun?: boolean }
): Promise<void> {
  const gitHooksDir = join(projectRoot, '.git/hooks');

  // Check if .git directory exists (is a git repo)
  if (!pathExists(join(projectRoot, '.git'))) {
    logger.info('Not a git repository, skipping git hook installation');
    return;
  }

  logger.newline();
  logger.info('Installing git hooks...');

  // Ensure hooks directory exists
  if (!pathExists(gitHooksDir) && !options.dryRun) {
    ensureDir(gitHooksDir, { dryRun: options.dryRun });
  }

  const DISPATCHER_MARKER = 'pennyfarthing-dispatcher';
  const PF_MARKER = 'pennyfarthing';
  const PF_PREFIX = '10';
  const MIGRATED_PREFIX = '50';

  // Load shared dispatcher template
  const dispatcherTemplatePath = join(nodeModulesPath, 'scripts/hooks/dispatcher-template.sh');
  const dispatcherTemplate = readFileSync(dispatcherTemplatePath, 'utf8');

  // Define hooks to install
  const hooks = [
    { source: 'pre-commit.sh', dest: 'pre-commit' },
    { source: 'pre-push.sh', dest: 'pre-push' },
    { source: 'post-merge.sh', dest: 'post-merge' },
  ];

  for (const hook of hooks) {
    const sourcePath = join(nodeModulesPath, 'scripts/hooks', hook.source);
    const destPath = join(gitHooksDir, hook.dest);
    const dDir = join(gitHooksDir, `${hook.dest}.d`);
    const pfHookName = `${PF_PREFIX}-pennyfarthing-${hook.dest}.sh`;
    const pfHookPath = join(dDir, pfHookName);

    if (!pathExists(sourcePath)) {
      logger.warning(`${hook.source} not found, skipping`);
      continue;
    }

    const sourceContent = readFileSync(sourcePath, 'utf8');

    if (options.dryRun) {
      logger.info(`Would install .git/hooks/${hook.dest} dispatcher + .d/`);
      continue;
    }

    // Create .d/ directory
    if (!pathExists(dDir)) {
      mkdirSync(dDir, { recursive: true });
    }

    // Migrate existing hook if present
    if (pathExists(destPath)) {
      const existingContent = readFileSync(destPath, 'utf8');

      if (existingContent.includes(DISPATCHER_MARKER)) {
        // Already a dispatcher — update it if content changed
        const newDispatcher = generateDispatcher(hook.dest, dispatcherTemplate);
        if (existingContent !== newDispatcher) {
          writeFileSync(destPath, newDispatcher, { mode: 0o755 });
          logger.updated(`.git/hooks/${hook.dest} dispatcher`);
        } else {
          logger.skipped(`.git/hooks/${hook.dest} dispatcher`, 'already installed');
        }
      } else if (existingContent.includes(PF_MARKER)) {
        // Old-style single-file pennyfarthing hook — replace with dispatcher
        writeFileSync(destPath, generateDispatcher(hook.dest, dispatcherTemplate), { mode: 0o755 });
        logger.updated(`.git/hooks/${hook.dest} → dispatcher`);
      } else {
        // Non-pennyfarthing hook — migrate into .d/ then install dispatcher
        const migratedName = `${MIGRATED_PREFIX}-migrated-${hook.dest}.sh`;
        const migratedPath = join(dDir, migratedName);
        if (!pathExists(migratedPath)) {
          writeFileSync(migratedPath, existingContent, { mode: 0o755 });
          logger.info(`Migrated existing ${hook.dest} hook to ${hook.dest}.d/${migratedName}`);
        }
        writeFileSync(destPath, generateDispatcher(hook.dest, dispatcherTemplate), { mode: 0o755 });
        logger.created(`.git/hooks/${hook.dest} dispatcher`);
      }
    } else {
      // No existing hook — install fresh dispatcher
      writeFileSync(destPath, generateDispatcher(hook.dest, dispatcherTemplate), { mode: 0o755 });
      logger.created(`.git/hooks/${hook.dest} dispatcher`);
    }

    // Install/update pennyfarthing hook in .d/
    if (pathExists(pfHookPath)) {
      const existingPf = readFileSync(pfHookPath, 'utf8');
      if (existingPf === sourceContent) {
        logger.skipped(`.git/hooks/${hook.dest}.d/${pfHookName}`, 'already installed');
      } else {
        writeFileSync(pfHookPath, sourceContent, { mode: 0o755 });
        logger.updated(`.git/hooks/${hook.dest}.d/${pfHookName}`);
      }
    } else {
      writeFileSync(pfHookPath, sourceContent, { mode: 0o755 });
      logger.created(`.git/hooks/${hook.dest}.d/${pfHookName}`);
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
  logger.info('Installing Python scripts (pf CLI)...');

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
    logger.warning('Could not install pf CLI automatically');
    logger.warning('Install manually: uv tool install pennyfarthing-scripts');
  }
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
    { template: 'persona-config.yaml.template', dest: '.pennyfarthing/persona-config.yaml' },
    { template: 'preferences.yaml.template', dest: '.pennyfarthing/preferences.yaml' },
    { template: 'shared-context.md.template', dest: '.claude/project/docs/shared-context.md' },
    { template: 'agent-scopes.yaml.template', dest: '.pennyfarthing/project/docs/agent-scopes.yaml' },
    { template: 'pennyfarthing-settings.yaml.template', dest: '.pennyfarthing/project/pennyfarthing-settings.yaml' },
    { template: 'setup-env.sh.template', dest: '.pennyfarthing/project/hooks/setup-env.sh' },
    { template: 'auto-load-sm.sh.template', dest: '.pennyfarthing/project/hooks/auto-load-sm.sh' }
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
        // Shell scripts need executable permission
        const isShellScript = template.endsWith('.sh.template');
        if (isShellScript) {
          writeFileSync(destPath, content, { mode: 0o755 });
        } else {
          writeFileSync(destPath, content, 'utf8');
        }
      }
      logger.created(dest);
    }
  }

  // Handle settings.local.json specially - merge required hooks
  await mergeSettingsLocalJson(projectRoot, assetsPath, { ...options, registerSkills: true });

  // Create symlink at .claude/settings.local.json → .pennyfarthing/settings.local.json
  if (!options.dryRun) {
    ensureSettingsSymlink(projectRoot);
  }
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
    '.claude/settings.local.json',
    '.pennyfarthing/config.local.yaml',
    '',
    '# Runtime state files (Cyclist, bells, etc)',
    '*.pid',
    '*-pid',
    '*-port',
    '.pennyfarthing/*.json',
    '.cyclist-*'
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
