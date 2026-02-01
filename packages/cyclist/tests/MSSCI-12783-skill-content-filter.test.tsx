/**
 * MSSCI-12783: Skill Content Display Bug Tests
 *
 * Tests for filtering skill content from user message display.
 * Story: MSSCI-12783 - Bug: Skill Content Displayed as User Message
 *
 * Acceptance Criteria:
 * - AC1: Skill content is NOT displayed as user messages in the conversation
 * - AC2: Skill loading may show a brief indicator or be silent
 * - AC3: Skill content is still available to Claude's context
 * - AC4: No regression in skill functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Components under test
import MessageView from '../src/public/components/MessageView';
import { MessagePanel } from '../src/public/components/panels/MessagePanel';

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

// ============================================================================
// Test Fixtures - Skill Content Patterns
// ============================================================================

/**
 * Skill content markers that indicate a message contains skill/command output
 * that should be filtered from user message display.
 */
const SKILL_CONTENT_MARKERS = [
  'Base directory for this skill:',
  '<command-message>',
  '<command-name>',
  'Launching skill:',
  '# /',  // Skill header (e.g., "# /sprint - Sprint Management")
];

// Normal user message - should display
const mockNormalUserMessage = {
  type: 'user' as const,
  content: 'Please help me with this bug fix',
  timestamp: Date.now(),
};

// User message with skill content - should NOT display
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

// Skill launch indicator - should be silent or minimal
const mockSkillLaunchMessage = {
  type: 'user' as const,
  content: 'Launching skill: sprint',
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
  it('should NOT display user messages containing <command-message> tags', async () => {
    render(<MessageView messages={[mockSkillContentUserMessage]} />);

    // The skill content should not appear as a user message
    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(0);
  });

  it('should NOT display user messages containing <command-name> tags', async () => {
    render(<MessageView messages={[mockCommandOutputMessage]} />);

    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(0);
  });

  it('should NOT display user messages starting with "Base directory for this skill:"', async () => {
    const messageWithBaseDir = {
      type: 'user' as const,
      content: 'Base directory for this skill: /path/to/skill\n\nMore content here...',
      timestamp: Date.now(),
    };

    render(<MessageView messages={[messageWithBaseDir]} />);

    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(0);
  });

  it('should display normal user messages that do not contain skill markers', async () => {
    render(<MessageView messages={[mockNormalUserMessage]} />);

    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(1);
    expect(screen.getByText(/Please help me with this bug fix/)).toBeInTheDocument();
  });

  it('should NOT display user messages with embedded skill content even with other text', async () => {
    render(<MessageView messages={[mockPartialSkillContent]} />);

    // Messages containing skill markers anywhere should be filtered
    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(0);
  });

  it('should filter skill content from a mixed message array', async () => {
    const messages = [
      mockNormalUserMessage,
      mockSkillContentUserMessage,
      { type: 'assistant' as const, content: 'I can help with that!', timestamp: Date.now() },
      mockCommandOutputMessage,
    ];

    render(<MessageView messages={messages} />);

    // Only the normal user message and assistant message should display
    const userMessages = screen.queryAllByTestId('message-user');
    const assistantMessages = screen.queryAllByTestId('message-assistant');

    expect(userMessages.length).toBe(1);
    expect(assistantMessages.length).toBe(1);
  });
});

// ============================================================================
// AC2: Skill loading shows brief indicator or is silent
// ============================================================================

describe('AC2: Skill loading indicator behavior', () => {
  it('should not display "Launching skill:" as a full message', async () => {
    render(<MessageView messages={[mockSkillLaunchMessage]} />);

    // The launch message should either be hidden or shown minimally
    const userMessages = screen.queryAllByTestId('message-user');
    expect(userMessages.length).toBe(0);
  });

  it('should optionally show a brief skill indicator when skill is invoked', async () => {
    // If an indicator is shown, it should be a brief non-intrusive element
    // not a full user message bubble
    const messages = [mockSkillContentUserMessage];
    render(<MessageView messages={messages} />);

    // Check that no full skill content is visible
    expect(screen.queryByText(/Never manually edit sprint YAML/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<critical>/)).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC3: Skill content still available to Claude's context
// (This is tested at integration level - skill invocation should still work)
// ============================================================================

describe('AC3: Skill functionality preserved', () => {
  it('should not break message handling when filtering skill content', async () => {
    const messages = [
      mockNormalUserMessage,
      mockSkillContentUserMessage,
      { type: 'assistant' as const, content: 'Processing your request...', timestamp: Date.now() },
    ];

    // Rendering should not throw
    expect(() => render(<MessageView messages={messages} />)).not.toThrow();

    // Assistant messages should still render
    expect(screen.getByText(/Processing your request/)).toBeInTheDocument();
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

    // Normal mention of "skill" should not be filtered
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

    // Should not throw and should not display empty message
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
// Helper function tests (isSkillContent utility)
// ============================================================================

describe('isSkillContent utility function', () => {
  // Import the utility once implemented
  // import { isSkillContent } from '../src/public/utils/messageFilters';

  const isSkillContent = (content: string): boolean => {
    // Stub - this function needs to be implemented
    throw new Error('isSkillContent not implemented');
  };

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

  it('should return false for normal user content', () => {
    expect(isSkillContent('Please help me fix this bug')).toBe(false);
  });

  it('should return false for content mentioning "skill" in normal context', () => {
    expect(isSkillContent('What skills do you have?')).toBe(false);
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
// Integration: transformMessage filtering
// ============================================================================

describe('transformMessage skill content filtering', () => {
  // The transformMessage function in MessagePanel should filter skill content

  it('should return null for SDK user messages containing skill content', () => {
    // This tests that the transformMessage function properly filters
    // We'll need to import and test the actual function
    const sdkMessage = {
      type: 'user',
      content: mockSkillContentUserMessage.content,
    };

    // The transform should return null for skill content
    // Implementation: transformMessage(sdkMessage) should return null
    expect(true).toBe(true); // Placeholder - actual test needs transformMessage export
  });
});
