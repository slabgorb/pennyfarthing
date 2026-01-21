/**
 * MSSCI-12048: VS Code Sidebar Agent Status Provider
 *
 * TreeDataProvider implementation for the Pennyfarthing activity bar sidebar.
 * Displays agent persona, sprint status, active story, and quick actions.
 */

import * as vscode from 'vscode';
import type { WebSocketManager, StatsData } from '../server/websocket-manager';

// Role display names for accessibility
const ROLE_NAMES: Record<string, string> = {
  dev: 'Developer',
  sm: 'Scrum Master',
  tea: 'Test Engineer',
  reviewer: 'Code Reviewer',
  architect: 'Architect',
  pm: 'Product Manager',
  'tech-writer': 'Technical Writer',
  'ux-designer': 'UX Designer',
  devops: 'DevOps Engineer',
  orchestrator: 'Orchestrator',
};

// Data types for sidebar state
interface PersonaData {
  character: string;
  theme: string;
  role: string;
}

interface ContextData {
  usablePercent: number;
}

interface SprintData {
  totalPoints: number;
  completedPoints: number;
  inProgressCount: number;
}

interface StoryData {
  id: string;
  title: string;
  phase: string;
  branch: string;
  points: number;
}

// Tree item types for getChildren routing
type TreeItemType =
  | 'root'
  | 'agent'
  | 'sprint'
  | 'story'
  | 'actions'
  | 'empty';

interface SidebarTreeItem extends vscode.TreeItem {
  itemType?: TreeItemType;
}

/**
 * AgentStatusTreeDataProvider - VS Code TreeDataProvider for Pennyfarthing sidebar
 */
export class AgentStatusTreeDataProvider
  implements vscode.TreeDataProvider<SidebarTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    SidebarTreeItem | undefined | null | void
  > = new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SidebarTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  // State
  private persona: PersonaData | null = null;
  private context: ContextData | null = null;
  private sprint: SprintData | null = null;
  private story: StoryData | null = null;
  private isConnecting = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private statsUnsubscribe: (() => void) | null = null;

  constructor() {
    // Initial state is empty
  }

  /**
   * Get current persona data (for refresh command).
   */
  getPersona(): PersonaData | null {
    return this.persona;
  }

  // =========================================================================
  // TreeDataProvider implementation
  // =========================================================================

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SidebarTreeItem): Promise<SidebarTreeItem[]> {
    // Root level - return main sections
    if (!element) {
      return this.getRootChildren();
    }

    // Child items based on parent type
    switch (element.itemType) {
      case 'agent':
        return this.getAgentChildren();
      case 'sprint':
        return this.getSprintChildren();
      case 'story':
        return this.getStoryChildren();
      case 'actions':
        return this.getActionsChildren();
      default:
        return [];
    }
  }

  // =========================================================================
  // Root level items
  // =========================================================================

  private getRootChildren(): SidebarTreeItem[] {
    const items: SidebarTreeItem[] = [];

    // Connecting state
    if (this.isConnecting) {
      const connectingItem = new vscode.TreeItem(
        'Connecting to WheelHub...',
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      connectingItem.itemType = 'empty';
      items.push(connectingItem);
      return items;
    }

    // Agent section (or empty state)
    if (this.persona) {
      items.push(this.createAgentItem());
    } else {
      const emptyAgent = new vscode.TreeItem(
        'No agent active. Run /dev or /sm to start.',
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      emptyAgent.itemType = 'empty';
      items.push(emptyAgent);
    }

    // Sprint section
    if (this.sprint) {
      items.push(this.createSprintItem());
    }

    // Story section (or empty state)
    if (this.story) {
      items.push(this.createStoryItem());
    } else if (!this.isConnecting) {
      // Show empty story state message
      const emptyStory = new vscode.TreeItem(
        'No active story. Use /work to start.',
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      emptyStory.itemType = 'empty';
      items.push(emptyStory);
    }

    // Quick Actions section (always shown if agent is active or no agent)
    if (!this.isConnecting) {
      items.push(this.createActionsItem());
    }

    return items;
  }

  // =========================================================================
  // Agent section
  // =========================================================================

  private createAgentItem(): SidebarTreeItem {
    const item = new vscode.TreeItem(
      `Agent: ${this.persona!.character}`,
      vscode.TreeItemCollapsibleState.Expanded
    ) as SidebarTreeItem;

    item.description = this.persona!.role.toUpperCase();
    item.contextValue = 'agent';
    item.itemType = 'agent';
    item.iconPath = new vscode.ThemeIcon('account');

    // Accessibility label
    const roleName = ROLE_NAMES[this.persona!.role] || this.persona!.role;
    const contextPercent = this.context?.usablePercent ?? 0;
    item.accessibilityInformation = {
      label: `Agent ${this.persona!.character}, role ${roleName}, context ${contextPercent} percent`,
    };

    return item;
  }

  private getAgentChildren(): SidebarTreeItem[] {
    const children: SidebarTreeItem[] = [];

    // Theme child
    if (this.persona) {
      const themeItem = new vscode.TreeItem(
        `Theme: ${this.humanize(this.persona.theme)}`,
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      themeItem.iconPath = new vscode.ThemeIcon('color-mode');
      children.push(themeItem);
    }

    // Context child
    if (this.context) {
      const contextItem = new vscode.TreeItem(
        `Context: ${this.context.usablePercent}%`,
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      contextItem.iconPath = this.getContextIcon(this.context.usablePercent);
      children.push(contextItem);
    }

    return children;
  }

  private getContextIcon(percent: number): vscode.ThemeIcon {
    // Use circle icons with semantic coloring based on context usage level
    if (percent < 50) {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    }
    if (percent < 70) {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'));
    }
    if (percent < 85) {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.orange'));
    }
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'));
  }

  // =========================================================================
  // Sprint section
  // =========================================================================

  private createSprintItem(): SidebarTreeItem {
    const remaining = this.sprint!.totalPoints - this.sprint!.completedPoints;
    const item = new vscode.TreeItem(
      'Sprint',
      vscode.TreeItemCollapsibleState.Collapsed
    ) as SidebarTreeItem;

    item.description = `${remaining}/${this.sprint!.totalPoints} pts`;
    item.contextValue = 'sprint';
    item.itemType = 'sprint';
    item.iconPath = new vscode.ThemeIcon('tasklist');

    // Accessibility label
    item.accessibilityInformation = {
      label: `Sprint status, ${remaining} of ${this.sprint!.totalPoints} points remaining, ${this.sprint!.inProgressCount} stories in progress`,
    };

    return item;
  }

  private getSprintChildren(): SidebarTreeItem[] {
    const children: SidebarTreeItem[] = [];

    if (this.sprint) {
      // In Progress count
      const inProgressItem = new vscode.TreeItem(
        `In Progress: ${this.sprint.inProgressCount} stories`,
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      inProgressItem.iconPath = new vscode.ThemeIcon('sync~spin');
      children.push(inProgressItem);

      // Completed points
      const completedItem = new vscode.TreeItem(
        `Completed: ${this.sprint.completedPoints} pts`,
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      completedItem.iconPath = new vscode.ThemeIcon('check');
      children.push(completedItem);
    } else {
      const emptyItem = new vscode.TreeItem(
        'No active sprint',
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      children.push(emptyItem);
    }

    return children;
  }

  // =========================================================================
  // Story section
  // =========================================================================

  private createStoryItem(): SidebarTreeItem {
    const item = new vscode.TreeItem(
      this.story!.id,
      vscode.TreeItemCollapsibleState.Expanded
    ) as SidebarTreeItem;

    item.description = `${this.story!.phase} • ${this.story!.points} pts`;
    item.tooltip = this.story!.title;
    item.contextValue = 'story';
    item.itemType = 'story';
    item.iconPath = this.getPhaseIcon(this.story!.phase);
    item.command = {
      command: 'pennyfarthing.openJira',
      arguments: [this.story!.id],
      title: 'Open in Jira',
    };

    // Accessibility label
    item.accessibilityInformation = {
      label: `Story ${this.story!.id}, ${this.story!.title}, phase ${this.story!.phase.toUpperCase()}, ${this.story!.points} points`,
    };

    return item;
  }

  private getStoryChildren(): SidebarTreeItem[] {
    const children: SidebarTreeItem[] = [];

    if (this.story) {
      // Title
      const titleItem = new vscode.TreeItem(
        this.story.title.length > 40
          ? this.story.title.substring(0, 37) + '...'
          : this.story.title,
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      titleItem.iconPath = new vscode.ThemeIcon('note');
      children.push(titleItem);

      // Branch
      const branchItem = new vscode.TreeItem(
        `Branch: ${this.story.branch}`,
        vscode.TreeItemCollapsibleState.None
      ) as SidebarTreeItem;
      branchItem.iconPath = new vscode.ThemeIcon('git-branch');
      children.push(branchItem);
    }

    return children;
  }

  private getPhaseIcon(phase: string): vscode.ThemeIcon {
    switch (phase) {
      case 'setup':
        return new vscode.ThemeIcon('clipboard');
      case 'bdd':
      case 'red':
        return new vscode.ThemeIcon('beaker');
      case 'impl':
      case 'green':
        return new vscode.ThemeIcon('code');
      case 'review':
        return new vscode.ThemeIcon('eye');
      case 'finish':
        return new vscode.ThemeIcon('check-all');
      default:
        return new vscode.ThemeIcon('book');
    }
  }

  // =========================================================================
  // Quick Actions section
  // =========================================================================

  private createActionsItem(): SidebarTreeItem {
    const item = new vscode.TreeItem(
      'Quick Actions',
      vscode.TreeItemCollapsibleState.Expanded
    ) as SidebarTreeItem;

    item.itemType = 'actions';
    item.iconPath = new vscode.ThemeIcon('zap');

    return item;
  }

  private getActionsChildren(): SidebarTreeItem[] {
    return [
      this.createActionItem('Switch Agent', 'pennyfarthing.switchAgent', 'sync'),
      this.createActionItem(
        'View Backlog',
        'pennyfarthing.viewBacklog',
        'list-unordered'
      ),
      this.createActionItem('Start Work', 'pennyfarthing.startWork', 'play'),
      this.createActionItem('Refresh', 'pennyfarthing.refresh', 'refresh'),
    ];
  }

  private createActionItem(
    label: string,
    command: string,
    icon: string
  ): SidebarTreeItem {
    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.None
    ) as SidebarTreeItem;

    item.command = {
      command,
      title: label,
    };
    item.iconPath = new vscode.ThemeIcon(icon);

    return item;
  }

  // =========================================================================
  // Update methods (called by WheelHub WebSocket handlers)
  // =========================================================================

  updatePersona(data: PersonaData): void {
    this.persona = data;
    this._onDidChangeTreeData.fire();
  }

  updateContext(data: ContextData): void {
    this.context = data;
    this._onDidChangeTreeData.fire();
  }

  updateSprint(data: SprintData): void {
    this.sprint = data;
    this._onDidChangeTreeData.fire();
  }

  updateStory(data: StoryData): void {
    this.story = data;
    this._onDidChangeTreeData.fire();
  }

  // =========================================================================
  // WebSocket connection methods
  // =========================================================================

  /**
   * Connect to WheelHub WebSocket manager for stats updates.
   * Called from extension.ts after WheelHub server starts.
   */
  connectToWheelHub(wsManager: WebSocketManager): void {
    // Unsubscribe from any existing connection
    if (this.statsUnsubscribe) {
      this.statsUnsubscribe();
    }

    this.isConnecting = true;
    this._onDidChangeTreeData.fire();

    // Subscribe to stats updates from WebSocketManager
    this.statsUnsubscribe = wsManager.onStats((data: StatsData) => {
      this.handleStatsUpdate(data);
    });

    // Mark as connected
    this.isConnecting = false;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Handle incoming stats update from WheelHub.
   */
  private handleStatsUpdate(data: StatsData): void {
    let changed = false;

    if (data.persona) {
      this.persona = data.persona;
      changed = true;
    }

    if (data.context) {
      this.context = data.context;
      changed = true;
    }

    if (data.sprint) {
      this.sprint = data.sprint;
      changed = true;
    }

    if (data.story) {
      this.story = data.story;
      changed = true;
    }

    if (changed) {
      this._onDidChangeTreeData.fire();
    }
  }

  handleDisconnect(): void {
    this.isConnecting = true;
    this._onDidChangeTreeData.fire();
    this.attemptReconnect();
  }

  attemptReconnect(): void {
    // Clear any existing timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Attempt reconnection after delay
    this.reconnectTimeout = setTimeout(() => {
      // Would attempt to reconnect here
      this.isConnecting = false;
      this._onDidChangeTreeData.fire();
    }, 3000);
  }

  // =========================================================================
  // Utility methods
  // =========================================================================

  private humanize(slug: string): string {
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  dispose(): void {
    // Clean up reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Unsubscribe from stats updates
    if (this.statsUnsubscribe) {
      this.statsUnsubscribe();
      this.statsUnsubscribe = null;
    }

    // Dispose event emitter
    this._onDidChangeTreeData.dispose();
  }
}
