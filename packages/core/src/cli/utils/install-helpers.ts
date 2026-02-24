import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
import { pathExists } from './files.js';

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
    mkdirSync(gitHooksDir, { recursive: true });
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
 * Generate .pennyfarthing/pyproject.toml for consumer projects.
 * This enables `uv run --project` to resolve pf for hooks.
 *
 * Skips generation if:
 * - .pennyfarthing/pyproject.toml already exists (user-customized)
 * - $PROJECT_ROOT/pyproject.toml already references pennyfarthing-scripts
 * - $PROJECT_ROOT/pennyfarthing/pyproject.toml exists (dogfooding)
 */
export function generatePyprojectToml(
  projectRoot: string,
  nodeModulesPath: string,
  options: { dryRun?: boolean }
): void {
  const destPath = join(projectRoot, '.pennyfarthing/pyproject.toml');

  // Skip if already exists
  if (pathExists(destPath)) {
    logger.skipped('.pennyfarthing/pyproject.toml', 'already exists');
    return;
  }

  // Skip if dogfooding (inlined repo)
  if (pathExists(join(projectRoot, 'pennyfarthing/pennyfarthing-dist/pyproject.toml'))) {
    return;
  }

  // Skip if project root already has a pyproject.toml with pennyfarthing-scripts
  const projectPyproject = join(projectRoot, 'pyproject.toml');
  if (pathExists(projectPyproject)) {
    try {
      const content = readFileSync(projectPyproject, 'utf8');
      if (content.includes('pennyfarthing-scripts') || content.includes('pf')) {
        return;
      }
    } catch { /* ignore read errors */ }
  }

  // Copy template from pennyfarthing-dist/templates/
  const templatePath = join(nodeModulesPath, 'templates/pyproject.toml');
  if (!pathExists(templatePath)) {
    logger.warning('pyproject.toml template not found in package');
    return;
  }

  if (!options.dryRun) {
    const content = readFileSync(templatePath, 'utf8');
    writeFileSync(destPath, content, 'utf8');
  }
  logger.created('.pennyfarthing/pyproject.toml');
}

/**
 * Generate a dispatcher script for a given hook name by substituting
 * __HOOK_NAME__ in the shared template.
 */
function generateDispatcher(hookName: string, template: string): string {
  return template.replace(/__HOOK_NAME__/g, hookName);
}
