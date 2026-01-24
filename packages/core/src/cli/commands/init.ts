import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
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
  copyDirectory,
  copyCommandsDirectory,
  copySkillsDirectory,
  removeSymlinkOrDirectory
} from '../utils/symlinks.js';
import { findNodeModulesPath } from '../utils/node-modules.js';
import { CORE_AGENTS, DIRECTORY_SYMLINKS } from '../utils/constants.js';

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
    '.claude/project/commands',
    '.claude/project/skills',
    '.claude/project/docs',
    '.claude/project/hooks',
    '.pennyfarthing',
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
    logger.error('For dogfooding (pennyfarthing repo itself), ensure .claude/scripts symlink exists.');
    process.exit(1);
  }

  // Compute relative path from project root to node_modules pennyfarthing-dist
  const nodeModulesRelPath = relative(projectRoot, nodeModulesPath);

  logger.newline();
  logger.info('Copying Pennyfarthing content to .pennyfarthing/...');
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

  // Copy directories from node_modules to .pennyfarthing/ (self-contained install)
  for (const { name, link } of DIRECTORY_SYMLINKS) {
    const sourcePath = join(nodeModulesPath, name);
    const destPath = join(projectRoot, link);

    if (copyDirectory(sourcePath, destPath, dryRun)) {
      logger.created(`${link}/ (copied from package)`);
    } else {
      logger.warning(`Could not copy ${name} to ${link}`);
    }
  }

  // Copy commands directory (allows user commands alongside built-in)
  const builtInCommandsPath = join(nodeModulesPath, 'commands');
  const projectCommandsPath = join(projectRoot, '.claude/project/commands');
  copyCommandsDirectory(projectRoot, builtInCommandsPath, projectCommandsPath, dryRun || false);

  // Copy skills directory (allows user skills alongside built-in)
  const builtInSkillsPath = join(nodeModulesPath, 'skills');
  const projectSkillsPath = join(projectRoot, '.claude/project/skills');
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

/**
 * Install git hooks from pennyfarthing-dist to .git/hooks
 * Installs: pre-commit, pre-push, post-merge
 */
async function installGitHooks(
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

  // Define hooks to install
  const hooks = [
    { source: 'pre-commit.sh', dest: 'pre-commit', marker: 'pennyfarthing' },
    { source: 'pre-push.sh', dest: 'pre-push', marker: 'pennyfarthing' },
    { source: 'post-merge.sh', dest: 'post-merge', marker: 'pennyfarthing' },
  ];

  for (const hook of hooks) {
    const sourcePath = join(nodeModulesPath, 'scripts/hooks', hook.source);
    const destPath = join(gitHooksDir, hook.dest);

    if (!pathExists(sourcePath)) {
      logger.warning(`${hook.source} not found, skipping`);
      continue;
    }

    // Check if hook already exists
    if (pathExists(destPath)) {
      // Check if it's already our hook (contains pennyfarthing marker)
      const existingContent = readFileSync(destPath, 'utf8');
      if (existingContent.includes(hook.marker)) {
        logger.skipped(`.git/hooks/${hook.dest}`, 'already installed');
        continue;
      }

      // Existing non-pennyfarthing hook - backup and replace
      if (!options.dryRun) {
        const backupPath = `${destPath}.backup`;
        writeFileSync(backupPath, existingContent, 'utf8');
        logger.info(`Backed up existing hook to ${backupPath}`);
      }
    }

    // Copy the hook
    if (!options.dryRun) {
      const hookContent = readFileSync(sourcePath, 'utf8');
      writeFileSync(destPath, hookContent, { mode: 0o755 });
    }
    logger.created(`.git/hooks/${hook.dest}`);
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
    { template: 'persona-config.yaml.template', dest: '.claude/persona-config.yaml' },
    { template: 'preferences.yaml.template', dest: '.claude/preferences.yaml' },
    { template: 'shared-context.md.template', dest: '.claude/project/docs/shared-context.md' },
    { template: 'agent-scopes.yaml.template', dest: '.claude/project/docs/agent-scopes.yaml' },
    { template: 'pennyfarthing-settings.yaml.template', dest: '.claude/project/pennyfarthing-settings.yaml' },
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
 * Get list of installed skill names from the skills directory
 */
function getInstalledSkillNames(projectRoot: string): string[] {
  const skillsDir = join(projectRoot, '.claude/skills');
  if (!pathExists(skillsDir)) {
    return [];
  }

  try {
    const entries = readdirSync(skillsDir);
    return entries.filter((entry: string) => {
      if (entry.startsWith('.')) return false;
      const entryPath = join(skillsDir, entry);
      // Check if it's a directory or symlink to directory
      try {
        const stats = statSync(entryPath);
        return stats.isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Merge required hooks into existing settings.local.json
 * This ensures critical hooks like SessionStart are always configured
 * Also registers installed skills in permissions.allow
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

  // Get installed skills to register in permissions
  const installedSkills = getInstalledSkillNames(projectRoot);

  // If no existing settings, create from template with all installed skills
  if (!pathExists(settingsPath)) {
    // Add all installed skills to permissions
    if (installedSkills.length > 0) {
      const permissions = templateContent.permissions?.allow || [];
      for (const skill of installedSkills) {
        const skillPermission = `Skill(${skill})`;
        if (!permissions.includes(skillPermission)) {
          permissions.push(skillPermission);
        }
      }
      templateContent.permissions = { ...templateContent.permissions, allow: permissions };
    }

    if (!options.dryRun) {
      ensureDirSync(join(projectRoot, '.claude'));
      writeFileSync(settingsPath, JSON.stringify(templateContent, null, 2), 'utf8');
    }
    logger.created('.claude/settings.local.json');
    if (installedSkills.length > 0) {
      logger.info(`  Registered ${installedSkills.length} skills in permissions`);
    }
    return;
  }

  // Read existing settings
  let existingSettings: Record<string, unknown>;
  try {
    existingSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
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
    // Migrate from any legacy path to new path (.pennyfarthing/scripts/misc/statusline.sh)
    const legacyPaths = [
      '.claude/core/statusline.sh',
      '.claude/statusline.sh',
      '.claude/pennyfarthing/statusline.sh',  // Old copy-mode path (v4.0.0-4.0.3)
      '.claude/pennyfarthing/scripts/statusline.sh',  // Bug in template (fixed in v4.0.5)
      '.claude/scripts/statusline.sh',  // Previous location (pre-v6.6)
      '.pennyfarthing/scripts/statusline.sh'  // Missing misc/ subdirectory (fixed in v7.0.3)
    ];
    for (const legacyPath of legacyPaths) {
      if (statusLine.command.includes(legacyPath)) {
        statusLine.command = statusLine.command.replace(
          legacyPath,
          '.pennyfarthing/scripts/misc/statusline.sh'
        );
        modified = true;
        logger.info(`Updated statusLine path from ${legacyPath} to new location`);
        break;
      }
    }
  }

  // Migrate hook paths from legacy locations to .pennyfarthing/scripts/
  const migrateHookPaths = (hookArray: unknown[]): boolean => {
    let migrated = false;
    const legacyScriptPaths = [
      '.claude/pennyfarthing/scripts/',
      '.claude/scripts/'
    ];
    for (const entry of hookArray) {
      if (typeof entry === 'object' && entry !== null) {
        const hookEntry = entry as { hooks?: Array<{ command?: string }> };
        if (hookEntry.hooks) {
          for (const h of hookEntry.hooks) {
            if (h.command) {
              for (const legacyPath of legacyScriptPaths) {
                if (h.command.includes(legacyPath)) {
                  h.command = h.command.replace(legacyPath, '.pennyfarthing/scripts/');
                  migrated = true;
                  break;
                }
              }
            }
          }
        }
      }
    }
    return migrated;
  };

  for (const hookType of ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse']) {
    if (Array.isArray(hooks[hookType])) {
      if (migrateHookPaths(hooks[hookType] as unknown[])) {
        modified = true;
        logger.info(`Migrated ${hookType} hook paths to new location`);
      }
    }
  }

  // Merge skill permissions - ensure all installed skills are registered
  if (installedSkills.length > 0) {
    if (!existingSettings.permissions) {
      existingSettings.permissions = { allow: [] };
      modified = true;
    }
    const permissions = existingSettings.permissions as Record<string, unknown>;
    if (!permissions.allow) {
      permissions.allow = [];
      modified = true;
    }
    const allowList = permissions.allow as string[];

    let skillsAdded = 0;
    for (const skill of installedSkills) {
      const skillPermission = `Skill(${skill})`;
      if (!allowList.includes(skillPermission)) {
        allowList.push(skillPermission);
        skillsAdded++;
        modified = true;
      }
    }
    if (skillsAdded > 0) {
      logger.info(`Registered ${skillsAdded} missing skills in permissions`);
    }
  }

  if (modified && !options.dryRun) {
    writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');
    logger.updated('.claude/settings.local.json');
  } else if (!modified) {
    logger.skipped('.claude/settings.local.json', 'already configured');
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
    '.claude/persona-config.local.yaml',
    '.pennyfarthing/config.local.yaml'
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
