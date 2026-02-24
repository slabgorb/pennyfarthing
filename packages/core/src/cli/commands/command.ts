import { readdirSync, readlinkSync, unlinkSync, symlinkSync, writeFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompts.js';
import { pathExists, isSymlink } from '../utils/files.js';
import { manifestExists } from '../utils/manifest.js';

/**
 * Compute relative path for symlink
 */
function computeRelativeSymlink(linkPath: string, targetPath: string): string {
  return relative(dirname(linkPath), targetPath);
}

/**
 * Get command source type based on symlink target
 */
function getCommandSource(commandsDir: string, filename: string): { type: 'built-in' | 'user' | 'local'; target?: string } {
  const linkPath = join(commandsDir, filename);

  if (!isSymlink(linkPath)) {
    return { type: 'local' };
  }

  try {
    const target = readlinkSync(linkPath);
    if (target.includes('pennyfarthing/commands/') || target.includes('pennyfarthing-dist/commands/')) {
      return { type: 'built-in', target };
    } else if (target.includes('project/commands/')) {
      return { type: 'user', target };
    }
    return { type: 'local', target };
  } catch {
    return { type: 'local' };
  }
}

/**
 * List all commands with their sources
 */
export async function listCommand(): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pf setup` first.');
    process.exit(1);
  }

  const commandsDir = join(projectRoot, '.claude/commands');

  if (!pathExists(commandsDir)) {
    logger.error('Commands directory not found. Run `pf setup` to create it.');
    process.exit(1);
  }

  // Check if it's old-style symlink
  if (isSymlink(commandsDir)) {
    logger.warning('Commands directory is using old symlink style.');
    logger.info('Run `pf setup` to migrate to new directory structure.');
    logger.info('(This enables custom commands alongside built-in ones)');
    return;
  }

  const files = readdirSync(commandsDir).filter(f => f.endsWith('.md')).sort();

  const builtIn: string[] = [];
  const user: string[] = [];
  const local: string[] = [];

  for (const file of files) {
    const name = file.replace('.md', '');
    const source = getCommandSource(commandsDir, file);

    switch (source.type) {
      case 'built-in':
        builtIn.push(name);
        break;
      case 'user':
        user.push(name);
        break;
      case 'local':
        local.push(name);
        break;
    }
  }

  logger.header('Pennyfarthing Commands');

  logger.newline();
  logger.info(`Built-in commands (${builtIn.length}):`);
  if (builtIn.length > 0) {
    // Display in columns
    const cols = 4;
    const width = 20;
    for (let i = 0; i < builtIn.length; i += cols) {
      const row = builtIn.slice(i, i + cols).map(c => `  /${c}`.padEnd(width)).join('');
      console.log(row);
    }
  } else {
    logger.info('  (none)');
  }

  logger.newline();
  logger.info(`User commands (${user.length}):`);
  if (user.length > 0) {
    for (const cmd of user) {
      console.log(`  /${cmd}`);
    }
  } else {
    logger.info('  (none - add with `pennyfarthing command add <name>`)');
  }

  if (local.length > 0) {
    logger.newline();
    logger.info(`Local commands (${local.length}):`);
    for (const cmd of local) {
      console.log(`  /${cmd} (file in .claude/commands/)`);
    }
  }

  logger.newline();
  logger.info('Tip: Use `pennyfarthing command add <name>` to create a custom command');
}

/**
 * Add a new custom command
 */
export async function addCommand(name: string, options: { template?: string; edit?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pf setup` first.');
    process.exit(1);
  }

  // Validate name
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    logger.error('Command name must start with lowercase letter and contain only lowercase letters, numbers, and hyphens');
    process.exit(1);
  }

  const commandsDir = join(projectRoot, '.claude/commands');
  const projectCommandsDir = join(projectRoot, '.claude/project/commands');

  // Check if commands dir is old-style symlink
  if (isSymlink(commandsDir)) {
    logger.error('Commands directory is using old symlink style.');
    logger.info('Run `pf setup` first to migrate to new directory structure.');
    process.exit(1);
  }

  // Check if command already exists
  const linkPath = join(commandsDir, `${name}.md`);
  if (pathExists(linkPath)) {
    const source = getCommandSource(commandsDir, `${name}.md`);
    if (source.type === 'built-in') {
      logger.error(`'${name}' is a built-in command and cannot be overridden.`);
      logger.info('Choose a different name for your custom command.');
    } else {
      logger.error(`Command '${name}' already exists.`);
      logger.info(`Edit it at: .claude/project/commands/${name}.md`);
    }
    process.exit(1);
  }

  // Ensure project commands directory exists
  if (!pathExists(projectCommandsDir)) {
    ensureDirSync(projectCommandsDir);
    logger.created('.claude/project/commands/');
  }

  // Create the command file
  const sourcePath = join(projectCommandsDir, `${name}.md`);

  const template = options.template || 'default';
  let content: string;

  switch (template) {
    case 'agent':
      content = `# /${name}

Activates a custom agent mode.

<agent-activation>
**FIRST:** Load your context and persona.

Then:
1. Read relevant files for context
2. Follow the workflow below
</agent-activation>

<purpose>
Describe what this agent does.
</purpose>

<workflow>
1. Step one
2. Step two
3. Step three
</workflow>

<reference>
- **Related files:** List relevant files
- **Skills:** List relevant skills
</reference>
`;
      break;

    case 'task':
      content = `# /${name}

Performs a specific task.

## What This Does

Describe the task this command performs.

## Steps

1. First, do this
2. Then, do that
3. Finally, complete with this

## Example Usage

\`\`\`
/${name}
\`\`\`
`;
      break;

    default:
      content = `# /${name}

Description of what this command does.

## Usage

\`\`\`
/${name} [arguments]
\`\`\`

## What It Does

1. Step one
2. Step two
3. Step three

## Notes

Add any additional notes here.
`;
  }

  writeFileSync(sourcePath, content, 'utf8');
  logger.created(`.claude/project/commands/${name}.md`);

  // Create symlink in commands directory
  const relativeTarget = computeRelativeSymlink(linkPath, sourcePath);
  symlinkSync(relativeTarget, linkPath);
  logger.created(`.claude/commands/${name}.md -> ${relativeTarget}`);

  logger.newline();
  logger.success(`Command '/${name}' created!`);
  logger.newline();
  logger.info('Next steps:');
  logger.info(`  1. Edit .claude/project/commands/${name}.md to customize`);
  logger.info(`  2. Use /${name} in Claude Code`);

  if (options.edit) {
    logger.newline();
    logger.info(`Opening ${sourcePath} in editor...`);
    // Could open in $EDITOR here if desired
  }
}

/**
 * Remove a custom command
 */
export async function removeCommand(name: string, options: { force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pf setup` first.');
    process.exit(1);
  }

  const commandsDir = join(projectRoot, '.claude/commands');
  const projectCommandsDir = join(projectRoot, '.claude/project/commands');

  const linkPath = join(commandsDir, `${name}.md`);
  const sourcePath = join(projectCommandsDir, `${name}.md`);

  if (!pathExists(linkPath)) {
    logger.error(`Command '${name}' not found.`);
    process.exit(1);
  }

  const source = getCommandSource(commandsDir, `${name}.md`);

  if (source.type === 'built-in') {
    logger.error(`'${name}' is a built-in command and cannot be removed.`);
    logger.info('You can only remove custom commands.');
    process.exit(1);
  }

  // Confirm removal
  if (!options.force) {
    const confirmed = await confirm(`Remove command '/${name}'?`);
    if (!confirmed) {
      logger.info('Aborted');
      return;
    }
  }

  // Remove symlink
  if (isSymlink(linkPath)) {
    unlinkSync(linkPath);
    logger.info(`Removed symlink: .claude/commands/${name}.md`);
  }

  // Ask about source file
  if (pathExists(sourcePath)) {
    const removeSource = options.force || await confirm(`Also delete source file .claude/project/commands/${name}.md?`);
    if (removeSource) {
      unlinkSync(sourcePath);
      logger.info(`Removed source: .claude/project/commands/${name}.md`);
    } else {
      logger.info(`Kept source file: .claude/project/commands/${name}.md`);
      logger.info('(You can restore with: pennyfarthing command link ' + name + ')');
    }
  }

  logger.newline();
  logger.success(`Command '/${name}' removed.`);
}

/**
 * Link an existing command file
 */
export async function linkCommand(name: string): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pf setup` first.');
    process.exit(1);
  }

  const commandsDir = join(projectRoot, '.claude/commands');
  const projectCommandsDir = join(projectRoot, '.claude/project/commands');

  const linkPath = join(commandsDir, `${name}.md`);
  const sourcePath = join(projectCommandsDir, `${name}.md`);

  // Check source exists
  if (!pathExists(sourcePath)) {
    logger.error(`Source file not found: .claude/project/commands/${name}.md`);
    logger.info('Create the command file first, then run this command to link it.');
    process.exit(1);
  }

  // Check if already linked
  if (pathExists(linkPath)) {
    const source = getCommandSource(commandsDir, `${name}.md`);
    if (source.type === 'built-in') {
      logger.error(`'${name}' conflicts with a built-in command.`);
      logger.info('Rename your command to avoid the conflict.');
    } else {
      logger.info(`Command '/${name}' is already linked.`);
    }
    process.exit(1);
  }

  // Create symlink
  const relativeTarget = computeRelativeSymlink(linkPath, sourcePath);
  symlinkSync(relativeTarget, linkPath);

  logger.success(`Linked '/${name}' -> .claude/project/commands/${name}.md`);
}

/**
 * Sync commands - rebuild symlinks from source directories
 */
export async function syncCommand(options: { dryRun?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pf setup` first.');
    process.exit(1);
  }

  const commandsDir = join(projectRoot, '.claude/commands');
  const projectCommandsDir = join(projectRoot, '.claude/project/commands');

  // Check if commands dir is old-style symlink
  if (isSymlink(commandsDir)) {
    logger.error('Commands directory is using old symlink style.');
    logger.info('Run `pf setup` first to migrate to new directory structure.');
    process.exit(1);
  }

  if (!pathExists(projectCommandsDir)) {
    logger.info('No user commands directory found. Nothing to sync.');
    return;
  }

  logger.header('Syncing User Commands');

  if (options.dryRun) {
    logger.info('Dry run mode - no changes will be made');
  }

  // Find user commands that need linking
  const userCommands = readdirSync(projectCommandsDir).filter(f => f.endsWith('.md'));
  let linked = 0;
  let skipped = 0;

  for (const file of userCommands) {
    const name = file.replace('.md', '');
    const linkPath = join(commandsDir, file);
    const sourcePath = join(projectCommandsDir, file);

    if (pathExists(linkPath)) {
      const source = getCommandSource(commandsDir, file);
      if (source.type === 'built-in') {
        logger.warning(`  Skipping ${name} - conflicts with built-in command`);
        skipped++;
      } else {
        logger.info(`  ✓ ${name} (already linked)`);
      }
      continue;
    }

    // Create symlink
    const relativeTarget = computeRelativeSymlink(linkPath, sourcePath);
    if (!options.dryRun) {
      symlinkSync(relativeTarget, linkPath);
    }
    logger.created(`  ${name} -> ${relativeTarget}`);
    linked++;
  }

  logger.newline();
  if (linked > 0) {
    logger.success(`Linked ${linked} command(s)`);
  }
  if (skipped > 0) {
    logger.warning(`Skipped ${skipped} command(s) due to conflicts`);
  }
  if (linked === 0 && skipped === 0) {
    logger.info('All user commands are already linked.');
  }
}
