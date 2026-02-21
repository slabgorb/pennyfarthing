#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { doctorCommand } from './commands/doctor.js';
import { uninstallCommand } from './commands/uninstall.js';
import { versionCommand } from './commands/version.js';
import { listCommand as themeListCommand, setCommand as themeSetCommand, showCommand as themeShowCommand, createCommand as themeCreateCommand } from './commands/theme.js';
import { listCommand as cmdListCommand, addCommand as cmdAddCommand, removeCommand as cmdRemoveCommand, linkCommand as cmdLinkCommand, syncCommand as cmdSyncCommand } from './commands/command.js';
import { listSkill as skillListCommand, addSkill as skillAddCommand, removeSkill as skillRemoveCommand, linkSkill as skillLinkCommand, syncSkill as skillSyncCommand } from './commands/skill.js';
import { cyclistCommand } from './commands/cyclist.js';
import { getPackageVersion } from './utils/version.js';

const version = getPackageVersion();

const program = new Command();

program
  .name('pennyfarthing')
  .description('Claude Code agent framework with TDD workflow and persona system')
  .version(version);

program
  .command('init')
  .description('Initialize Pennyfarthing in a project')
  .argument('[project-name]', 'Name of the project')
  .option('-f, --force', 'Skip prompts, overwrite existing files')
  .option('--skip-templates', 'Skip generating template files')
  .option('--dry-run', 'Show what would be done without doing it')
  .action(initCommand);

program
  .command('update')
  .description('Update Pennyfarthing to the latest version')
  .option('-f, --force', 'Overwrite locally modified files')
  .option('-b, --backup', 'Backup modified files before replacing')
  .option('-c, --check', 'Just check if update is available')
  .option('--dry-run', 'Show what would be updated')
  .action(updateCommand);

program
  .command('doctor')
  .description('Check installation health and diagnose issues')
  .option('--fix', 'Auto-apply recommended fixes')
  .option('--json', 'Output in JSON format')
  .option('-q, --quiet', 'Only show errors')
  .option('-c, --category <name>', 'Run only checks in this category')
  .option('--list-categories', 'List available check categories')
  .option('--dogfood', 'Run development checks (framework repo or orchestrator with inlined pennyfarthing/)')
  .action(doctorCommand);

program
  .command('uninstall')
  .description('Remove Pennyfarthing from the project')
  .option('-f, --force', 'Skip confirmation prompts')
  .option('-a, --all', 'Also remove project-specific files (.claude/project, .session)')
  .option('--dry-run', 'Show what would be removed without removing')
  .action(uninstallCommand);

program
  .command('version')
  .description('Show version information')
  .action(versionCommand);

program
  .command('cyclist')
  .description('Launch Cyclist with Pennyfarthing context')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('--no-open', "Don't open browser automatically")
  .option('--cyclist-path <path>', 'Path to cyclist installation')
  .action(async (options: { port?: string; open?: boolean; cyclistPath?: string }) => {
    await cyclistCommand({
      port: options.port ? parseInt(options.port, 10) : undefined,
      noOpen: options.open === false,
      cyclistPath: options.cyclistPath,
    });
  });

// Theme management commands
const themeCmd = program
  .command('theme')
  .description('Manage persona themes');

themeCmd
  .command('list')
  .description('List available themes')
  .action(themeListCommand);

themeCmd
  .command('set')
  .description('Set the active theme')
  .argument('<name>', 'Theme name to activate')
  .action(themeSetCommand);

themeCmd
  .command('show')
  .description('Show details of a theme')
  .argument('[name]', 'Theme name (defaults to current theme)')
  .action(themeShowCommand);

themeCmd
  .command('create')
  .description('Create a new custom theme')
  .argument('<name>', 'Name for the new theme (lowercase, hyphens allowed)')
  .option('-b, --base <theme>', 'Base theme to copy from', 'minimalist')
  .option('-u, --user', 'Create as user-level theme (available across projects)')
  .action(themeCreateCommand);

// Command management commands
const cmdCmd = program
  .command('command')
  .description('Manage custom slash commands');

cmdCmd
  .command('list')
  .description('List all available commands')
  .action(cmdListCommand);

cmdCmd
  .command('add')
  .description('Create a new custom command')
  .argument('<name>', 'Command name (lowercase, hyphens allowed)')
  .option('-t, --template <type>', 'Template type: default, agent, task', 'default')
  .option('-e, --edit', 'Open in editor after creation')
  .action(cmdAddCommand);

cmdCmd
  .command('remove')
  .description('Remove a custom command')
  .argument('<name>', 'Command name to remove')
  .option('-f, --force', 'Skip confirmation prompts')
  .action(cmdRemoveCommand);

cmdCmd
  .command('link')
  .description('Link an existing command file from project/commands/')
  .argument('<name>', 'Command name to link')
  .action(cmdLinkCommand);

cmdCmd
  .command('sync')
  .description('Sync all user commands from project/commands/')
  .option('--dry-run', 'Show what would be done without doing it')
  .action(cmdSyncCommand);

// Skill management commands
const skillCmd = program
  .command('skill')
  .description('Manage custom skills');

skillCmd
  .command('list')
  .description('List all available skills')
  .action(skillListCommand);

skillCmd
  .command('add')
  .description('Create a new custom skill')
  .argument('<name>', 'Skill name (lowercase, hyphens allowed)')
  .option('-t, --template <type>', 'Template type: default, knowledge, workflow', 'default')
  .option('-e, --edit', 'Open in editor after creation')
  .action(skillAddCommand);

skillCmd
  .command('remove')
  .description('Remove a custom skill')
  .argument('<name>', 'Skill name to remove')
  .option('-f, --force', 'Skip confirmation prompts')
  .action(skillRemoveCommand);

skillCmd
  .command('link')
  .description('Link an existing skill file from project/skills/')
  .argument('<name>', 'Skill name to link')
  .action(skillLinkCommand);

skillCmd
  .command('sync')
  .description('Sync all user skills from project/skills/')
  .option('--dry-run', 'Show what would be done without doing it')
  .action(skillSyncCommand);

program.parse();
