import inquirer from 'inquirer';
/**
 * Prompt for a single selection from a list
 */
export async function select(message, choices, options) {
    // In non-interactive mode, return default or first choice
    if (!process.stdin.isTTY) {
        return options?.default ?? choices[0].value;
    }
    const { answer } = await inquirer.prompt([
        {
            type: 'list',
            name: 'answer',
            message,
            choices,
            default: options?.default
        }
    ]);
    return answer;
}
/**
 * Prompt for confirmation
 */
export async function confirm(message, options) {
    // In non-interactive mode, return default or true
    if (!process.stdin.isTTY) {
        return options?.default ?? true;
    }
    const { answer } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'answer',
            message,
            default: options?.default ?? true
        }
    ]);
    return answer;
}
/**
 * Prompt for text input
 */
export async function input(message, options) {
    // In non-interactive mode, return default or empty string
    if (!process.stdin.isTTY) {
        return options?.default ?? '';
    }
    const { answer } = await inquirer.prompt([
        {
            type: 'input',
            name: 'answer',
            message,
            default: options?.default,
            validate: options?.validate
        }
    ]);
    return answer;
}
/**
 * Common prompts for installation scenarios
 */
export const prompts = {
    async existingSetup() {
        return select('Existing .claude/ found. How to proceed?', [
            { name: 'Merge (keep user files, update core)', value: 'merge' },
            { name: 'Overwrite (replace everything)', value: 'overwrite' },
            { name: 'Abort', value: 'abort' }
        ]);
    },
    async alreadyInstalled(version) {
        return select(`Pennyfarthing already installed (v${version}). What to do?`, [
            { name: 'Update to latest', value: 'update' },
            { name: 'Reinstall (fresh)', value: 'reinstall' },
            { name: 'Abort', value: 'abort' }
        ]);
    },
    async modifiedFiles(files) {
        console.log('\nLocally modified files detected:');
        files.forEach(f => console.log(`  - ${f}`));
        console.log();
        return select('How to handle these files?', [
            { name: 'Overwrite (lose local changes)', value: 'overwrite' },
            { name: 'Skip (keep local changes)', value: 'skip' },
            { name: 'Backup and replace', value: 'backup' }
        ]);
    },
    async projectName(suggested) {
        return input('Project name:', {
            default: suggested,
            validate: (input) => input.length > 0 || 'Project name is required'
        });
    }
};
//# sourceMappingURL=prompts.js.map