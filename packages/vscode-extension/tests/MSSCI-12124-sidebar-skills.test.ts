/**
 * MSSCI-12124: Skills/commands discovery in sidebar
 *
 * BDD-style tests for sidebar Skills and Commands sections.
 * Tests are written to FAIL until Dev implements the feature.
 *
 * Acceptance Criteria:
 * - AC1: Collapsible "Skills" section listing all available skills
 * - AC2: Collapsible "Commands" section with slash commands
 * - AC3: Click to invoke skill/command in chat
 * - AC4: Show skill descriptions on hover (tooltips)
 * - AC5: Search/filter functionality (VS Code native tree filter - Phase 2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock skill-parser module BEFORE vscode to ensure import order
const mockSkills = [
  {
    name: 'agentic-patterns',
    description: 'Core reasoning patterns for building effective LLM agents',
    category: 'ai-llm',
    tags: ['reasoning', 'patterns'],
    keywords: ['react', 'reflection'],
    examples: [
      { context: 'Designing agent behavior', invocation: '/agentic-patterns' },
    ],
  },
  {
    name: 'context-engineering',
    description: 'Strategies for managing context windows in long-running agent sessions',
    category: 'ai-llm',
    tags: ['context', 'optimization'],
    keywords: ['context-window', 'tokens'],
    examples: [
      { context: 'Approaching context limits', invocation: '/context-engineering' },
    ],
  },
  {
    name: 'code-review',
    description: 'Code review checklists and patterns for quality assurance',
    category: 'development',
    tags: ['review', 'quality'],
    keywords: ['pr', 'pull-request'],
    examples: [
      { context: 'Self-review before commit', invocation: '/code-review' },
    ],
  },
  {
    name: 'testing',
    description: 'Test commands and TDD workflow patterns',
    category: 'development',
    tags: ['tdd', 'testing'],
    keywords: ['jest', 'vitest', 'unit-test'],
    examples: [
      { context: 'Running project tests', invocation: '/testing' },
    ],
  },
];

const mockSkillsByCategory = new Map([
  ['ai-llm', mockSkills.filter((s) => s.category === 'ai-llm')],
  ['development', mockSkills.filter((s) => s.category === 'development')],
]);

vi.mock('../src/commands/skill-parser', () => ({
  parseSkillRegistry: vi.fn(() => mockSkills),
  groupSkillsByCategory: vi.fn(() => mockSkillsByCategory),
}));

// Mock context for extension activation
const mockContext = {
  subscriptions: [] as { dispose: () => void }[],
  workspaceState: { get: vi.fn(), update: vi.fn() },
  globalState: { get: vi.fn().mockReturnValue(true), update: vi.fn() },
  extensionPath: '/mock/extension/path',
  extensionUri: { fsPath: '/mock/extension/path' },
};

// Mock VS Code EventEmitter class
class MockEventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  fire = vi.fn((data?: T) => {
    this.listeners.forEach((listener) => listener(data as T));
  });
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  dispose = vi.fn();
}

// TreeItemCollapsibleState enum mock
const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

class MockTreeItem {
  label: string;
  description?: string;
  tooltip?: string | { value: string; isTrusted?: boolean };
  contextValue?: string;
  collapsibleState?: number;
  command?: { command: string; arguments?: unknown[]; title: string };
  iconPath?: { id: string; color?: { id: string } };
  accessibilityInformation?: { label: string };

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

const mockVscode = {
  window: {
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn(), show: vi.fn() })),
    activeTerminal: { sendText: vi.fn(), show: vi.fn() },
    terminals: [{ sendText: vi.fn(), show: vi.fn() }],
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalProfileProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerTerminalLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({
      dispose: vi.fn(),
      reveal: vi.fn(),
    })),
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: vi.fn(() => ({ dispose: vi.fn() })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock-workspace', index: 0 }],
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
  },
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState,
  EventEmitter: MockEventEmitter,
  ThemeIcon: class {
    constructor(public id: string, public color?: { id: string }) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  env: {
    openExternal: vi.fn(),
  },
};

vi.mock('vscode', () => mockVscode);

describe('MSSCI-12124: Skills/commands discovery in sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Collapsible "Skills" section listing all available skills
  // ========================================================================
  describe('AC1: Skills section in sidebar', () => {
    it('should include Skills section in root children', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );

      expect(skillsItem).toBeDefined();
    });

    it('should have Skills section collapsed by default', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );

      expect(skillsItem?.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
    });

    it('should set itemType to "skills" for routing', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );

      expect((skillsItem as any).itemType).toBe('skills');
    });

    it('should use lightbulb icon for Skills section', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );

      expect(skillsItem?.iconPath?.id).toBe('lightbulb');
    });

    it('should show skill count in description', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );

      // Should show count like "21 skills" or similar
      expect(skillsItem?.description).toMatch(/\d+ skills?/);
    });

    it('should return skill categories as children of Skills section', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );

      const skillsChildren = await provider.getChildren(skillsItem);

      // Should have category items (ai-llm, development, documentation, tools, etc.)
      expect(skillsChildren.length).toBeGreaterThan(0);
      const categoryNames = skillsChildren.map((item: MockTreeItem) => item.label);
      expect(categoryNames).toContain('AI & LLM');
    });

    it('should return skills as children of category items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);

      // Find AI & LLM category
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );
      expect(aiCategory).toBeDefined();

      const categorySkills = await provider.getChildren(aiCategory);
      expect(categorySkills.length).toBeGreaterThan(0);

      // Should include agentic-patterns skill
      const agenticPatterns = categorySkills.find(
        (item: MockTreeItem) => item.label === '/agentic-patterns'
      );
      expect(agenticPatterns).toBeDefined();
    });

    it('should set contextValue to "skill-category" for category items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);

      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );

      expect((aiCategory as any).itemType).toBe('skill-category');
    });

    it('should use folder icon for category items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);

      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );

      expect(aiCategory?.iconPath?.id).toBe('folder');
    });
  });

  // ========================================================================
  // AC2: Collapsible "Commands" section with slash commands
  // ========================================================================
  describe('AC2: Commands section in sidebar', () => {
    it('should include Commands section in root children', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      expect(commandsItem).toBeDefined();
    });

    it('should have Commands section collapsed by default', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      expect(commandsItem?.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
    });

    it('should set itemType to "commands" for routing', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      expect((commandsItem as any).itemType).toBe('commands');
    });

    it('should use terminal icon for Commands section', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      expect(commandsItem?.iconPath?.id).toBe('terminal');
    });

    it('should return agent commands as children', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      const commandsChildren = await provider.getChildren(commandsItem);
      expect(commandsChildren.length).toBeGreaterThan(0);

      // Should include agent commands like /sm, /tea, /dev, /reviewer
      const smCommand = commandsChildren.find(
        (item: MockTreeItem) => item.label === '/sm'
      );
      expect(smCommand).toBeDefined();
    });

    it('should include workflow commands', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      const commandsChildren = await provider.getChildren(commandsItem);

      // Should include workflow commands like /work, /sprint
      const workCommand = commandsChildren.find(
        (item: MockTreeItem) => item.label === '/work'
      );
      expect(workCommand).toBeDefined();
    });

    it('should show command description inline', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      const commandsChildren = await provider.getChildren(commandsItem);
      const smCommand = commandsChildren.find(
        (item: MockTreeItem) => item.label === '/sm'
      );

      // Description should show the command purpose
      expect(smCommand?.description).toBeTruthy();
    });
  });

  // ========================================================================
  // AC3: Click to invoke skill/command in chat
  // ========================================================================
  describe('AC3: Click-to-invoke behavior', () => {
    it('should have command property on skill items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );
      const categorySkills = await provider.getChildren(aiCategory);

      const agenticPatterns = categorySkills.find(
        (item: MockTreeItem) => item.label === '/agentic-patterns'
      );

      expect(agenticPatterns?.command).toBeDefined();
      expect(agenticPatterns?.command?.command).toBe('pennyfarthing.invokeSkill');
    });

    it('should pass skill name as argument to invoke command', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );
      const categorySkills = await provider.getChildren(aiCategory);

      const agenticPatterns = categorySkills.find(
        (item: MockTreeItem) => item.label === '/agentic-patterns'
      );

      expect(agenticPatterns?.command?.arguments).toContain('agentic-patterns');
    });

    it('should have command property on slash command items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );
      const commandsChildren = await provider.getChildren(commandsItem);

      const smCommand = commandsChildren.find(
        (item: MockTreeItem) => item.label === '/sm'
      );

      expect(smCommand?.command).toBeDefined();
      expect(smCommand?.command?.command).toBe('pennyfarthing.invokeCommand');
    });

    it('should pass command name as argument to invoke command', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );
      const commandsChildren = await provider.getChildren(commandsItem);

      const smCommand = commandsChildren.find(
        (item: MockTreeItem) => item.label === '/sm'
      );

      expect(smCommand?.command?.arguments).toContain('sm');
    });

    it('should register pennyfarthing.invokeSkill command', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'pennyfarthing.invokeSkill',
        expect.any(Function)
      );
    });

    it('should register pennyfarthing.invokeCommand command', async () => {
      const { activate } = await import('../src/extension');
      await activate(mockContext as any);

      expect(mockVscode.commands.registerCommand).toHaveBeenCalledWith(
        'pennyfarthing.invokeCommand',
        expect.any(Function)
      );
    });
  });

  // ========================================================================
  // AC4: Show skill descriptions on hover (tooltips)
  // ========================================================================
  describe('AC4: Tooltips and hover descriptions', () => {
    it('should set tooltip on skill items to skill description', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );
      const categorySkills = await provider.getChildren(aiCategory);

      const agenticPatterns = categorySkills.find(
        (item: MockTreeItem) => item.label === '/agentic-patterns'
      );

      // Tooltip should contain the skill description
      expect(agenticPatterns?.tooltip).toContain(
        'Core reasoning patterns for building effective LLM agents'
      );
    });

    it('should include usage examples in skill tooltip', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );
      const categorySkills = await provider.getChildren(aiCategory);

      const agenticPatterns = categorySkills.find(
        (item: MockTreeItem) => item.label === '/agentic-patterns'
      );

      // Tooltip should include example invocations
      const tooltip = agenticPatterns?.tooltip;
      if (typeof tooltip === 'object') {
        expect(tooltip.value).toContain('/agentic-patterns');
      } else {
        expect(tooltip).toContain('/agentic-patterns');
      }
    });

    it('should set tooltip on command items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );
      const commandsChildren = await provider.getChildren(commandsItem);

      const smCommand = commandsChildren.find(
        (item: MockTreeItem) => item.label === '/sm'
      );

      expect(smCommand?.tooltip).toBeTruthy();
    });

    it('should provide accessible label for skill items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );
      const categorySkills = await provider.getChildren(aiCategory);

      const agenticPatterns = categorySkills.find(
        (item: MockTreeItem) => item.label === '/agentic-patterns'
      );

      expect(agenticPatterns?.accessibilityInformation?.label).toContain(
        'agentic-patterns'
      );
      expect(agenticPatterns?.accessibilityInformation?.label).toContain(
        'skill'
      );
    });

    it('should provide accessible label for command items', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );
      const commandsChildren = await provider.getChildren(commandsItem);

      const smCommand = commandsChildren.find(
        (item: MockTreeItem) => item.label === '/sm'
      );

      expect(smCommand?.accessibilityInformation?.label).toContain('sm');
      expect(smCommand?.accessibilityInformation?.label).toContain('command');
    });
  });

  // ========================================================================
  // AC5: Search/filter functionality (Phase 2 - native VS Code tree filter)
  // ========================================================================
  describe('AC5: Search/filter functionality', () => {
    // VS Code tree views natively support Ctrl+F filtering when focused.
    // For MVP, we rely on this built-in functionality.
    // These tests verify the structure supports filtering.

    it('should have consistent label format for filtering (skills)', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );
      const categorySkills = await provider.getChildren(aiCategory);

      // All skill labels should start with /
      categorySkills.forEach((skill: MockTreeItem) => {
        expect(skill.label).toMatch(/^\//);
      });
    });

    it('should have consistent label format for filtering (commands)', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );
      const commandsChildren = await provider.getChildren(commandsItem);

      // All command labels should start with /
      commandsChildren.forEach((cmd: MockTreeItem) => {
        expect(cmd.label).toMatch(/^\//);
      });
    });

    it('should include keywords in searchable content (description)', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const devCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'Development'
      );
      const categorySkills = await provider.getChildren(devCategory);

      const testingSkill = categorySkills.find(
        (item: MockTreeItem) => item.label === '/testing'
      );

      // Description should include keywords for filtering
      expect(testingSkill?.description).toBeTruthy();
    });
  });

  // ========================================================================
  // Integration tests - TreeDataProvider routing
  // ========================================================================
  describe('TreeDataProvider routing for new item types', () => {
    it('should route skills itemType to getSkillsChildren', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );

      // Should return skill categories
      const skillsChildren = await provider.getChildren(skillsItem);
      expect(skillsChildren.length).toBeGreaterThan(0);
    });

    it('should route commands itemType to getCommandsChildren', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const commandsItem = children.find(
        (item: MockTreeItem) => item.label === 'Commands'
      );

      // Should return slash commands
      const commandsChildren = await provider.getChildren(commandsItem);
      expect(commandsChildren.length).toBeGreaterThan(0);
    });

    it('should route skill-category itemType to getSkillCategoryChildren', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const skillsItem = children.find(
        (item: MockTreeItem) => item.label === 'Skills'
      );
      const skillsChildren = await provider.getChildren(skillsItem);
      const aiCategory = skillsChildren.find(
        (item: MockTreeItem) => item.label === 'AI & LLM'
      );

      // Should return skills in the category
      const categorySkills = await provider.getChildren(aiCategory);
      expect(categorySkills.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Sidebar ordering tests
  // ========================================================================
  describe('Section ordering in sidebar', () => {
    it('should show Skills and Commands after Quick Actions', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      // Set up some data so we have all sections
      provider.updatePersona({ character: 'Test', role: 'dev', theme: 'test' });

      const children = await provider.getChildren();
      const labels = children.map((item: MockTreeItem) => item.label);

      // Find positions
      const actionsIndex = labels.findIndex((l: string) => l === 'Quick Actions');
      const skillsIndex = labels.findIndex((l: string) => l === 'Skills');
      const commandsIndex = labels.findIndex((l: string) => l === 'Commands');

      // Skills and Commands should come after Quick Actions
      expect(skillsIndex).toBeGreaterThan(actionsIndex);
      expect(commandsIndex).toBeGreaterThan(actionsIndex);
    });

    it('should show Skills before Commands', async () => {
      const sidebarModule = await import('../src/providers/sidebar');
      const provider = new sidebarModule.AgentStatusTreeDataProvider();

      const children = await provider.getChildren();
      const labels = children.map((item: MockTreeItem) => item.label);

      const skillsIndex = labels.findIndex((l: string) => l === 'Skills');
      const commandsIndex = labels.findIndex((l: string) => l === 'Commands');

      expect(skillsIndex).toBeLessThan(commandsIndex);
    });
  });
});
