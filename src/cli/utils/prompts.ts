import inquirer from 'inquirer';

export interface Choice<T = string> {
  name: string;
  value: T;
  short?: string;
}

/**
 * Prompt for a single selection from a list
 */
export async function select<T = string>(
  message: string,
  choices: Choice<T>[],
  options?: { default?: T }
): Promise<T> {
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
export async function confirm(
  message: string,
  options?: { default?: boolean }
): Promise<boolean> {
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
export async function input(
  message: string,
  options?: { default?: string; validate?: (input: string) => boolean | string }
): Promise<string> {
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
  async existingSetup(): Promise<'merge' | 'overwrite' | 'abort'> {
    return select('Existing .claude/ found. How to proceed?', [
      { name: 'Merge (keep user files, update core)', value: 'merge' as const },
      { name: 'Overwrite (replace everything)', value: 'overwrite' as const },
      { name: 'Abort', value: 'abort' as const }
    ]);
  },

  async submoduleDetected(): Promise<'migrate' | 'abort'> {
    return select('Git submodule installation detected. How to proceed?', [
      { name: 'Migrate to npm (recommended)', value: 'migrate' as const },
      { name: 'Abort', value: 'abort' as const }
    ]);
  },

  async alreadyInstalled(version: string): Promise<'update' | 'reinstall' | 'abort'> {
    return select(`Pennyfarthing already installed (v${version}). What to do?`, [
      { name: 'Update to latest', value: 'update' as const },
      { name: 'Reinstall (fresh)', value: 'reinstall' as const },
      { name: 'Abort', value: 'abort' as const }
    ]);
  },

  async modifiedFiles(files: string[]): Promise<'overwrite' | 'skip' | 'backup'> {
    console.log('\nLocally modified files detected:');
    files.forEach(f => console.log(`  - ${f}`));
    console.log();

    return select('How to handle these files?', [
      { name: 'Overwrite (lose local changes)', value: 'overwrite' as const },
      { name: 'Skip (keep local changes)', value: 'skip' as const },
      { name: 'Backup and replace', value: 'backup' as const }
    ]);
  },

  async projectName(suggested?: string): Promise<string> {
    return input('Project name:', {
      default: suggested,
      validate: (input: string) => input.length > 0 || 'Project name is required'
    });
  }
};
