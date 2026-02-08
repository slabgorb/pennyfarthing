/**
 * MSSCI-12783: Skill Content Display Bug Tests
 *
 * Tests for filtering skill content from user message display.
 * Story: MSSCI-12783 - Bug: Skill Content Displayed as User Message
 *
 * Acceptance Criteria:
 * - AC1: Skill content is NOT displayed as user messages in the conversation
 * - AC2: First skill message is replaced with a brief human-readable label
 * - AC3: Skill content is still available to Claude's context
 * - AC4: No regression in skill functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Components under test
import MessageView from '../src/public/components/MessageView';
import { MessagePanel } from '../src/public/components/panels/MessagePanel';
import { ClaudeProvider } from '../src/public/contexts/ClaudeContext';
import { isSkillContent, extractSkillLabel } from '../src/public/utils/messageFilters';

// Mock electronAPI
const mockElectronAPI = {
  claude: {
    onMessage: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    offMessage: vi.fn(),
    send: vi.fn(),
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
});

afterEach(() => {
  delete (window as any).electronAPI;
});

// Wrapper for tests that trigger QuickActions (needs ClaudeProvider)
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <ClaudeProvider>{children}</ClaudeProvider>
);

// ============================================================================
// Test Fixtures - Skill Content Patterns
// ============================================================================

// Normal user message - should display
const mockNormalUserMessage = {
  type: 'user' as const,
  content: 'Please help me with this bug fix',
  timestamp: Date.now(),
};

// User message with skill content - should be replaced with label
const mockSkillContentUserMessage = {
  type: 'user' as const,
  content: `<command-message>sprint</command-message>
<command-name>/sprint</command-name>Base directory for this skill: /path/to/skill

# /sprint - Sprint Management

<critical>
Never manually edit sprint YAML files.
</critical>

## Commands

### \`/sprint status\`
Show current sprint status with story counts and points.`,
  timestamp: Date.now(),
};

// Another skill content pattern - command output
const mockCommandOutputMessage = {
  type: 'user' as const,
  content: `<command-message>sm</command-message>
<command-name>/sm</command-name>\`\`\`bash
d="$PWD"; while [[ ! -d "$d/.pennyfarthing" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done
export PYTHONPATH="$(dirname "$(dirname "$(cd "$d/.pennyfarthing/scripts" && pwd -P)")"):$PYTHONPATH"
python3 -m pennyfarthing_scripts.cli agent start "sm"
\`\`\``,
  timestamp: Date.now(),
};

// Skill launch indicator - should be filtered
const mockSkillLaunchMessage = {
  type: 'user' as const,
  content: 'Launching skill: sprint',
  timestamp: Date.now(),
};

// pf agent start command leaked as user message
const mockPfAgentStartMessage = {
  type: 'user' as const,
  content: 'pf agent start "reviewer"',
  timestamp: Date.now(),
};

// pf agent start in bash code block
const mockPfAgentStartBashBlock = {
  type: 'user' as const,
  content: '```bash\npf agent start "dev"\n```',
  timestamp: Date.now(),
};

// Skill body with <purpose> tag
const mockSkillBodyPurpose = {
  type: 'user' as const,
  content: `<purpose>
Quickly load essential context files to reduce agent cold-start overhead.
Automatically invoked on agent activation via pf agent start.
</purpose>

<when-to-use>
- Automatically on agent activation
</when-to-use>`,
  timestamp: Date.now(),
};

// Message with partial skill marker embedded
const mockPartialSkillContent = {
  type: 'user' as const,
  content: `Can you check the sprint status? Here's what I see:

Base directory for this skill: /Users/dev/project/.claude/skills/sprint

# /sprint - Sprint Management...`,
  timestamp: Date.now(),
};

// ============================================================================
// AC1: Skill content is NOT displayed as user messages
// ============================================================================

describe('AC1: Skill content filtering from user messages', () => {
  it('should NOT display full skill content for <command-message> messages', async () => {
    render(<MessageView messages={[mockSkillContentUserMessage]} />);

    // The raw skill body should not appear
    expect(screen.queryByText(/Never manually edit sprint YAML/)).not.toBeInTheDocument();
  });

  it('should NOT display full skill content for <command-name> messages', async () => {
    render(<MessageView messages={[mockCommandOutputMessage]} />);

    expect(screen.queryByText(/pennyfarthing_scripts/)).not.toBeInTheDocument();
  });

  it('should NOT display pf agent start as a user message', async () => {
    render(<MessageView messages={[mockPfAgentStartMessage]} />);

    expect(screen.queryByText(/pf agent start/)).not.toBeInTheDocument();
  });

  it('should NOT display pf agent start in bash code block', async () => {
    render(<MessageView messages={[mockPfAgentStartBashBlock]} />);

    expect(screen.queryByText(/pf agent start/)).not.toBeInTheDocument();
  });

  it('should NOT display skill body with <purpose> tags', async () => {
    render(<MessageView messages={[mockSkillBodyPurpose]} />);

    expect(screen.queryByText(/cold-start overhead/)).not.toBeInTheDocument();
  });

  it('should display normal user messages that do not contain skill markers', async () => {
    render(<MessageView messages={[mockNormalUserMessage]} />);

    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(1);
    expect(screen.getByText(/Please help me with this bug fix/)).toBeInTheDocument();
  });

  it('should NOT display user messages with embedded skill content even with other text', async () => {
    render(<MessageView messages={[mockPartialSkillContent]} />);

    expect(screen.queryByText(/sprint status/)).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC2: First skill message replaced with brief label
// ============================================================================

describe('AC2: Skill label replacement', () => {
  it('should replace <command-message>sm with label "Scrum Master"', async () => {
    render(<MessageView messages={[mockCommandOutputMessage]} />);

    expect(screen.getByText('Scrum Master')).toBeInTheDocument();
  });

  it('should replace <command-name>/sprint with label "sprint"', async () => {
    render(<MessageView messages={[mockSkillContentUserMessage]} />);

    expect(screen.getByText('sprint')).toBeInTheDocument();
  });

  it('should show label for first skill message and drop follow-up skill body', async () => {
    const messages = [
      mockCommandOutputMessage,     // /sm invocation → label "Scrum Master"
      mockPfAgentStartMessage,      // pf agent start "reviewer" → dropped (follow-up)
      mockSkillBodyPurpose,         // <purpose>... → dropped (follow-up)
    ];

    render(<MessageView messages={messages} />);

    expect(screen.getByText('Scrum Master')).toBeInTheDocument();
    expect(screen.queryByText(/pf agent start/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cold-start overhead/)).not.toBeInTheDocument();
  });

  it('should not display "Launching skill:" as a full message', async () => {
    render(<MessageView messages={[mockSkillLaunchMessage]} />);

    expect(screen.queryByText(/Launching skill:/)).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC3: Skill content still available to Claude's context
// (This is tested at integration level - skill invocation should still work)
// ============================================================================

describe('AC3: Skill functionality preserved', () => {
  it('should render assistant messages alongside filtered skill content', async () => {
    const messages = [
      mockNormalUserMessage,
      mockSkillContentUserMessage,
      { type: 'agent' as const, content: 'Processing your request...', timestamp: Date.now() },
    ];

    render(<MessageView messages={messages} />, { wrapper: Wrapper });

    // Normal user message and assistant message should render
    expect(screen.getByText(/Please help me with this bug fix/)).toBeInTheDocument();
    expect(screen.getByText(/Processing your request/)).toBeInTheDocument();
    // Skill body should not leak through
    expect(screen.queryByText(/Never manually edit sprint YAML/)).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC4: No regression in normal message display
// ============================================================================

describe('AC4: Normal message display regression tests', () => {
  it('should display user messages that mention "skill" in normal context', async () => {
    const normalSkillMention = {
      type: 'user' as const,
      content: 'What skills are available? I want to learn a new skill.',
      timestamp: Date.now(),
    };

    render(<MessageView messages={[normalSkillMention]} />);

    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(1);
  });

  it('should display user messages with code blocks that are not skill content', async () => {
    const codeBlockMessage = {
      type: 'user' as const,
      content: 'Here is my code:\n\n```typescript\nconst x = 1;\n```',
      timestamp: Date.now(),
    };

    render(<MessageView messages={[codeBlockMessage]} />);

    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(1);
  });

  it('should display user messages with markdown headers that are not skill headers', async () => {
    const markdownMessage = {
      type: 'user' as const,
      content: '# My Question\n\nHow do I do this?',
      timestamp: Date.now(),
    };

    render(<MessageView messages={[markdownMessage]} />);

    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(1);
  });

  it('should handle empty messages gracefully', async () => {
    const emptyMessage = {
      type: 'user' as const,
      content: '',
      timestamp: Date.now(),
    };

    expect(() => render(<MessageView messages={[emptyMessage]} />)).not.toThrow();
  });

  it('should handle messages with only whitespace', async () => {
    const whitespaceMessage = {
      type: 'user' as const,
      content: '   \n\n   ',
      timestamp: Date.now(),
    };

    expect(() => render(<MessageView messages={[whitespaceMessage]} />)).not.toThrow();
  });
});

// ============================================================================
// isSkillContent utility function tests
// ============================================================================

describe('isSkillContent utility function', () => {
  it('should return true for content with <command-message> tag', () => {
    expect(isSkillContent('<command-message>sprint</command-message>')).toBe(true);
  });

  it('should return true for content with <command-name> tag', () => {
    expect(isSkillContent('<command-name>/sprint</command-name>')).toBe(true);
  });

  it('should return true for content starting with skill header pattern', () => {
    expect(isSkillContent('Base directory for this skill: /path')).toBe(true);
  });

  it('should return true for content with "Launching skill:" prefix', () => {
    expect(isSkillContent('Launching skill: sprint')).toBe(true);
  });

  it('should return true for pf agent start command', () => {
    expect(isSkillContent('pf agent start "reviewer"')).toBe(true);
  });

  it('should return true for pf agent start in bash code block', () => {
    expect(isSkillContent('```bash\npf agent start "dev"\n```')).toBe(true);
  });

  it('should return true for <purpose> skill body tag', () => {
    expect(isSkillContent('<purpose>\nLoad context\n</purpose>')).toBe(true);
  });

  it('should return true for <when-to-use> skill body tag', () => {
    expect(isSkillContent('<when-to-use>\n- On activation\n</when-to-use>')).toBe(true);
  });

  it('should return true for <execution> skill body tag', () => {
    expect(isSkillContent('<execution>\nRun the command\n</execution>')).toBe(true);
  });

  it('should return false for normal user content', () => {
    expect(isSkillContent('Please help me fix this bug')).toBe(false);
  });

  it('should return false for content mentioning "skill" in normal context', () => {
    expect(isSkillContent('What skills do you have?')).toBe(false);
  });

  it('should return false for <critical> in mid-sentence (not at start)', () => {
    expect(isSkillContent('This is important <critical> stuff')).toBe(false);
  });

  it('should handle empty string', () => {
    expect(isSkillContent('')).toBe(false);
  });

  it('should handle null/undefined gracefully', () => {
    expect(isSkillContent(null as any)).toBe(false);
    expect(isSkillContent(undefined as any)).toBe(false);
  });
});

// ============================================================================
// extractSkillLabel utility function tests
// ============================================================================

describe('extractSkillLabel utility function', () => {
  it('should extract agent name from <command-name>', () => {
    expect(extractSkillLabel('<command-name>/sm</command-name>')).toBe('Scrum Master');
  });

  it('should extract agent name from <command-message>', () => {
    expect(extractSkillLabel('<command-message>reviewer</command-message>')).toBe('Reviewer');
  });

  it('should extract from pf agent start', () => {
    expect(extractSkillLabel('pf agent start "dev"')).toBe('Developer');
  });

  it('should extract from Launching skill:', () => {
    expect(extractSkillLabel('Launching skill: sprint')).toBe('sprint');
  });

  it('should return raw name for unknown agents', () => {
    expect(extractSkillLabel('<command-name>/my-custom-skill</command-name>')).toBe('my-custom-skill');
  });

  it('should return null for non-skill content', () => {
    expect(extractSkillLabel('Just a regular message')).toBeNull();
  });

  it('should return null for null/undefined', () => {
    expect(extractSkillLabel(null)).toBeNull();
    expect(extractSkillLabel(undefined)).toBeNull();
  });

  it('should prefer <command-name> over <command-message>', () => {
    const content = '<command-message>sm</command-message>\n<command-name>/sprint</command-name>';
    // <command-name> is checked first
    expect(extractSkillLabel(content)).toBe('sprint');
  });
});
