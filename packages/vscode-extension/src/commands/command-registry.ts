/**
 * Command Registry
 *
 * Registers VS Code commands dynamically from parsed skills.
 * MSSCI-12050: Command palette integration
 */

import * as vscode from 'vscode';
import {
  parseSkillRegistry,
  skillsToQuickPickItems,
  groupSkillsByCategory,
  type SkillMetadata,
} from './skill-parser';

/**
 * QuickPick item with separator support
 */
interface SkillPickItem extends vscode.QuickPickItem {
  skill?: SkillMetadata;
}

/**
 * Register the main runSkill command that shows a QuickPick of all skills
 */
export function registerSkillCommands(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Main command: pennyfarthing.runSkill
  const runSkillCommand = vscode.commands.registerCommand(
    'pennyfarthing.runSkill',
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage(
          'Pennyfarthing: No workspace folder open'
        );
        return;
      }

      outputChannel.appendLine('[CommandRegistry] Loading skills...');

      // Parse skills from registry
      const skills = parseSkillRegistry(workspaceFolder.uri.fsPath);

      if (skills.length === 0) {
        vscode.window.showWarningMessage(
          'Pennyfarthing: No skills found in skill-registry.yaml'
        );
        return;
      }

      outputChannel.appendLine(
        `[CommandRegistry] Found ${skills.length} skills`
      );

      // Create QuickPick with category grouping
      const items = createGroupedQuickPickItems(skills);

      const quickPick = vscode.window.createQuickPick<SkillPickItem>();
      quickPick.items = items;
      quickPick.placeholder =
        'Search skills by name, category, or keyword...';
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected && selected.skill) {
          executeSkillInTerminal(selected.skill, outputChannel);
        }
        quickPick.hide();
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    }
  );

  disposables.push(runSkillCommand);

  // Also register pennyfarthing.skills as an alias
  const skillsAliasCommand = vscode.commands.registerCommand(
    'pennyfarthing.skills',
    () => vscode.commands.executeCommand('pennyfarthing.runSkill')
  );

  disposables.push(skillsAliasCommand);

  outputChannel.appendLine('[CommandRegistry] Skill commands registered');

  return disposables;
}

/**
 * Create QuickPick items grouped by category with separators
 */
function createGroupedQuickPickItems(
  skills: SkillMetadata[]
): SkillPickItem[] {
  const items: SkillPickItem[] = [];
  const grouped = groupSkillsByCategory(skills);

  // Sort categories for consistent display
  const sortedCategories = Array.from(grouped.keys()).sort();

  // Format category names for display
  const formatCategory = (cat: string): string => {
    return cat
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  for (const category of sortedCategories) {
    const categorySkills = grouped.get(category)!;

    // Add category separator
    items.push({
      label: formatCategory(category),
      kind: vscode.QuickPickItemKind.Separator,
    });

    // Add skills in this category
    const quickPickItems = skillsToQuickPickItems(categorySkills);
    for (const item of quickPickItems) {
      items.push({
        label: item.label,
        description: item.description,
        detail: item.detail,
        skill: item.skill,
      });
    }
  }

  return items;
}

/**
 * Execute a skill by sending its command to the active terminal
 */
function executeSkillInTerminal(
  skill: SkillMetadata,
  outputChannel: vscode.OutputChannel
): void {
  const command = `/${skill.name}`;

  // Find or create terminal
  let terminal = vscode.window.activeTerminal;

  // Look for Pennyfarthing Claude terminal first
  const pennyfarthingTerminal = vscode.window.terminals.find(
    (t) =>
      t.name === 'Pennyfarthing Claude' || t.name.includes('claude')
  );

  if (pennyfarthingTerminal) {
    terminal = pennyfarthingTerminal;
  }

  if (terminal) {
    terminal.show();
    terminal.sendText(command);
    outputChannel.appendLine(
      `[CommandRegistry] Sent "${command}" to terminal "${terminal.name}"`
    );
  } else {
    // No terminal available, show message with command
    vscode.window
      .showInformationMessage(
        `Run \`${command}\` in your Claude terminal`,
        'Copy Command'
      )
      .then((selection) => {
        if (selection === 'Copy Command') {
          vscode.env.clipboard.writeText(command);
          vscode.window.showInformationMessage('Command copied to clipboard');
        }
      });
    outputChannel.appendLine(
      `[CommandRegistry] No terminal available for "${command}"`
    );
  }
}

/**
 * Register individual skill commands for direct access
 * These can be bound to keybindings or used programmatically
 */
export function registerIndividualSkillCommands(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return disposables;
  }

  const skills = parseSkillRegistry(workspaceFolder.uri.fsPath);

  for (const skill of skills) {
    const commandId = `pennyfarthing.skill.${skill.name}`;
    const command = vscode.commands.registerCommand(commandId, () => {
      executeSkillInTerminal(skill, outputChannel);
    });
    disposables.push(command);
  }

  outputChannel.appendLine(
    `[CommandRegistry] Registered ${skills.length} individual skill commands`
  );

  return disposables;
}
