import { existsSync, readdirSync, readlinkSync, unlinkSync, symlinkSync, writeFileSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync } = fsExtra;
import { logger } from '../utils/logger.js';
import { confirm } from '../utils/prompts.js';
import { pathExists, isSymlink, isDirectory } from '../utils/files.js';
import { manifestExists } from '../utils/manifest.js';

/**
 * Compute relative path for symlink
 */
function computeRelativeSymlink(linkPath: string, targetPath: string): string {
  return relative(dirname(linkPath), targetPath);
}

/**
 * Get skill source type based on symlink target
 */
function getSkillSource(skillsDir: string, filename: string): { type: 'built-in' | 'user' | 'local'; target?: string } {
  const linkPath = join(skillsDir, filename);

  if (!isSymlink(linkPath)) {
    return { type: 'local' };
  }

  try {
    const target = readlinkSync(linkPath);
    if (target.includes('pennyfarthing/skills/') || target.includes('pennyfarthing-dist/skills/')) {
      return { type: 'built-in', target };
    } else if (target.includes('project/skills/')) {
      return { type: 'user', target };
    }
    return { type: 'local', target };
  } catch {
    return { type: 'local' };
  }
}

/**
 * List all skills with their sources
 */
export async function listSkill(): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pennyfarthing init` first.');
    process.exit(1);
  }

  const skillsDir = join(projectRoot, '.claude/skills');

  if (!pathExists(skillsDir)) {
    logger.error('Skills directory not found. Run `pennyfarthing update` to create it.');
    process.exit(1);
  }

  // Check if it's old-style symlink
  if (isSymlink(skillsDir)) {
    logger.warning('Skills directory is using old symlink style.');
    logger.info('Run `pennyfarthing update` to migrate to new directory structure.');
    logger.info('(This enables custom skills alongside built-in ones)');
    return;
  }

  const files = readdirSync(skillsDir).filter(f => f.endsWith('.md')).sort();

  const builtIn: string[] = [];
  const user: string[] = [];
  const local: string[] = [];

  for (const file of files) {
    const name = file.replace('.md', '');
    const source = getSkillSource(skillsDir, file);

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

  logger.header('Pennyfarthing Skills');

  logger.newline();
  logger.info(`Built-in skills (${builtIn.length}):`);
  if (builtIn.length > 0) {
    // Display in columns
    const cols = 3;
    const width = 25;
    for (let i = 0; i < builtIn.length; i += cols) {
      const row = builtIn.slice(i, i + cols).map(c => `  /${c}`.padEnd(width)).join('');
      console.log(row);
    }
  } else {
    logger.info('  (none)');
  }

  logger.newline();
  logger.info(`User skills (${user.length}):`);
  if (user.length > 0) {
    for (const skill of user) {
      console.log(`  /${skill}`);
    }
  } else {
    logger.info('  (none - add with `pennyfarthing skill add <name>`)');
  }

  if (local.length > 0) {
    logger.newline();
    logger.info(`Local skills (${local.length}):`);
    for (const skill of local) {
      console.log(`  /${skill} (file in .claude/skills/)`);
    }
  }

  logger.newline();
  logger.info('Tip: Use `pennyfarthing skill add <name>` to create a custom skill');
}

/**
 * Add a new custom skill
 */
export async function addSkill(name: string, options: { template?: string; edit?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pennyfarthing init` first.');
    process.exit(1);
  }

  // Validate name
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    logger.error('Skill name must start with lowercase letter and contain only lowercase letters, numbers, and hyphens');
    process.exit(1);
  }

  const skillsDir = join(projectRoot, '.claude/skills');
  const projectSkillsDir = join(projectRoot, '.claude/project/skills');

  // Check if skills dir is old-style symlink
  if (isSymlink(skillsDir)) {
    logger.error('Skills directory is using old symlink style.');
    logger.info('Run `pennyfarthing update` first to migrate to new directory structure.');
    process.exit(1);
  }

  // Check if skill already exists
  const linkPath = join(skillsDir, `${name}.md`);
  if (pathExists(linkPath)) {
    const source = getSkillSource(skillsDir, `${name}.md`);
    if (source.type === 'built-in') {
      logger.error(`'${name}' is a built-in skill and cannot be overridden.`);
      logger.info('Choose a different name for your custom skill.');
    } else {
      logger.error(`Skill '${name}' already exists.`);
      logger.info(`Edit it at: .claude/project/skills/${name}.md`);
    }
    process.exit(1);
  }

  // Ensure project skills directory exists
  if (!pathExists(projectSkillsDir)) {
    ensureDirSync(projectSkillsDir);
    logger.created('.claude/project/skills/');
  }

  // Create the skill file
  const sourcePath = join(projectSkillsDir, `${name}.md`);

  const template = options.template || 'default';
  let content: string;

  switch (template) {
    case 'knowledge':
      content = `# ${name}

> Domain knowledge and reference information

## Overview

Describe the domain this skill covers.

## Key Concepts

### Concept 1

Explanation of the concept.

### Concept 2

Explanation of the concept.

## Common Patterns

\`\`\`
Pattern example here
\`\`\`

## Reference

- Link or reference 1
- Link or reference 2
`;
      break;

    case 'workflow':
      content = `# ${name}

> Workflow guide for a specific process

## When to Use

Use this skill when:
- Condition 1
- Condition 2

## Steps

### Step 1: First Thing

Do this first.

### Step 2: Second Thing

Then do this.

### Step 3: Final Thing

Complete with this.

## Tips

- Tip 1
- Tip 2
`;
      break;

    default:
      content = `# ${name}

> Brief description of what this skill provides

## Overview

Describe what this skill helps with.

## Usage

When to use this skill and how.

## Content

Add your skill content here.
`;
  }

  writeFileSync(sourcePath, content, 'utf8');
  logger.created(`.claude/project/skills/${name}.md`);

  // Create symlink in skills directory
  const relativeTarget = computeRelativeSymlink(linkPath, sourcePath);
  symlinkSync(relativeTarget, linkPath);
  logger.created(`.claude/skills/${name}.md -> ${relativeTarget}`);

  logger.newline();
  logger.success(`Skill '/${name}' created!`);
  logger.newline();
  logger.info('Next steps:');
  logger.info(`  1. Edit .claude/project/skills/${name}.md to customize`);
  logger.info(`  2. Use /${name} in Claude Code`);

  if (options.edit) {
    logger.newline();
    logger.info(`Opening ${sourcePath} in editor...`);
    // Could open in $EDITOR here if desired
  }
}

/**
 * Remove a custom skill
 */
export async function removeSkill(name: string, options: { force?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pennyfarthing init` first.');
    process.exit(1);
  }

  const skillsDir = join(projectRoot, '.claude/skills');
  const projectSkillsDir = join(projectRoot, '.claude/project/skills');

  const linkPath = join(skillsDir, `${name}.md`);
  const sourcePath = join(projectSkillsDir, `${name}.md`);

  if (!pathExists(linkPath)) {
    logger.error(`Skill '${name}' not found.`);
    process.exit(1);
  }

  const source = getSkillSource(skillsDir, `${name}.md`);

  if (source.type === 'built-in') {
    logger.error(`'${name}' is a built-in skill and cannot be removed.`);
    logger.info('You can only remove custom skills.');
    process.exit(1);
  }

  // Confirm removal
  if (!options.force) {
    const confirmed = await confirm(`Remove skill '/${name}'?`);
    if (!confirmed) {
      logger.info('Aborted');
      return;
    }
  }

  // Remove symlink
  if (isSymlink(linkPath)) {
    unlinkSync(linkPath);
    logger.info(`Removed symlink: .claude/skills/${name}.md`);
  }

  // Ask about source file
  if (pathExists(sourcePath)) {
    const removeSource = options.force || await confirm(`Also delete source file .claude/project/skills/${name}.md?`);
    if (removeSource) {
      unlinkSync(sourcePath);
      logger.info(`Removed source: .claude/project/skills/${name}.md`);
    } else {
      logger.info(`Kept source file: .claude/project/skills/${name}.md`);
      logger.info('(You can restore with: pennyfarthing skill link ' + name + ')');
    }
  }

  logger.newline();
  logger.success(`Skill '/${name}' removed.`);
}

/**
 * Link an existing skill file
 */
export async function linkSkill(name: string): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pennyfarthing init` first.');
    process.exit(1);
  }

  const skillsDir = join(projectRoot, '.claude/skills');
  const projectSkillsDir = join(projectRoot, '.claude/project/skills');

  const linkPath = join(skillsDir, `${name}.md`);
  const sourcePath = join(projectSkillsDir, `${name}.md`);

  // Check source exists
  if (!pathExists(sourcePath)) {
    logger.error(`Source file not found: .claude/project/skills/${name}.md`);
    logger.info('Create the skill file first, then run this command to link it.');
    process.exit(1);
  }

  // Check if already linked
  if (pathExists(linkPath)) {
    const source = getSkillSource(skillsDir, `${name}.md`);
    if (source.type === 'built-in') {
      logger.error(`'${name}' conflicts with a built-in skill.`);
      logger.info('Rename your skill to avoid the conflict.');
    } else {
      logger.info(`Skill '/${name}' is already linked.`);
    }
    process.exit(1);
  }

  // Create symlink
  const relativeTarget = computeRelativeSymlink(linkPath, sourcePath);
  symlinkSync(relativeTarget, linkPath);

  logger.success(`Linked '/${name}' -> .claude/project/skills/${name}.md`);
}

/**
 * Sync skills - rebuild symlinks from source directories
 */
export async function syncSkill(options: { dryRun?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  if (!manifestExists(projectRoot)) {
    logger.error('Pennyfarthing not initialized. Run `pennyfarthing init` first.');
    process.exit(1);
  }

  const skillsDir = join(projectRoot, '.claude/skills');
  const projectSkillsDir = join(projectRoot, '.claude/project/skills');

  // Check if skills dir is old-style symlink
  if (isSymlink(skillsDir)) {
    logger.error('Skills directory is using old symlink style.');
    logger.info('Run `pennyfarthing update` first to migrate to new directory structure.');
    process.exit(1);
  }

  if (!pathExists(projectSkillsDir)) {
    logger.info('No user skills directory found. Nothing to sync.');
    return;
  }

  logger.header('Syncing User Skills');

  if (options.dryRun) {
    logger.info('Dry run mode - no changes will be made');
  }

  // Find user skills that need linking
  const userSkills = readdirSync(projectSkillsDir).filter(f => f.endsWith('.md'));
  let linked = 0;
  let skipped = 0;

  for (const file of userSkills) {
    const name = file.replace('.md', '');
    const linkPath = join(skillsDir, file);
    const sourcePath = join(projectSkillsDir, file);

    if (pathExists(linkPath)) {
      const source = getSkillSource(skillsDir, file);
      if (source.type === 'built-in') {
        logger.warning(`  Skipping ${name} - conflicts with built-in skill`);
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
    logger.success(`Linked ${linked} skill(s)`);
  }
  if (skipped > 0) {
    logger.warning(`Skipped ${skipped} skill(s) due to conflicts`);
  }
  if (linked === 0 && skipped === 0) {
    logger.info('All user skills are already linked.');
  }
}
