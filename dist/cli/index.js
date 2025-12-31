#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { doctorCommand } from './commands/doctor.js';
import { uninstallCommand } from './commands/uninstall.js';
import { versionCommand } from './commands/version.js';
import { listCommand as themeListCommand, setCommand as themeSetCommand, showCommand as themeShowCommand, createCommand as themeCreateCommand } from './commands/theme.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Read version from VERSION file
const versionFile = join(__dirname, '../../VERSION');
let version = '2.0.0';
try {
    version = readFileSync(versionFile, 'utf8').trim();
}
catch {
    // Fallback to package.json version
    try {
        const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
        version = pkg.version;
    }
    catch {
        // Use default
    }
}
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
program.parse();
//# sourceMappingURL=index.js.map