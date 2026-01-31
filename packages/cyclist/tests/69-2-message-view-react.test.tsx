/**
 * 69-2: MessageView React Component Tests
 *
 * Tests for the React-based MessageView with streaming support.
 * Story: MSSCI-12698 - MessageView Component with Streaming
 *
 * Acceptance Criteria:
 * - AC1: MessageView renders with mock messages
 * - AC2: Streaming content updates progressively
 * - AC3: Markdown renders correctly (headers, lists, code blocks)
 * - AC4: Code blocks have syntax highlighting
 * - AC5: Tool calls display in distinct blocks
 * - AC6: Subagent messages grouped in collapsible spans
 * - AC7: Auto-scroll follows new content, preserves on scroll-up
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// Components to be implemented
import MessageView from '../src/public/components/MessageView';
import MessageList from '../src/public/components/MessageList';
import Message from '../src/public/components/Message';
import StreamingContent from '../src/public/components/StreamingContent';
import ToolCallBlock from '../src/public/components/ToolCallBlock';
import SubagentSpan from '../src/public/components/SubagentSpan';
import { useMessageStream } from '../src/public/hooks/useMessageStream';

// Mock electronAPI for IPC bridge
const mockElectronAPI = {
  claude: {
    onMessage: vi.fn(),
    offMessage: vi.fn(),
  },
};

// Install mock before tests
beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
});

afterEach(() => {
  delete (window as any).electronAPI;
});

// ============================================================================
// Test Fixtures
// ============================================================================

const mockUserMessage = {
  type: 'user' as const,
  content: 'Hello, Claude!',
  timestamp: Date.now(),
};

const mockAssistantMessage = {
  type: 'assistant' as const,
  content: 'Hello! How can I help you today?',
  timestamp: Date.now(),
};

const mockStreamingMessage = {
  type: 'assistant' as const,
  content: 'This is being',
  isStreaming: true,
  timestamp: Date.now(),
};

const mockMarkdownMessage = {
  type: 'assistant' as const,
  content: `# Header 1
## Header 2

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2
- List item 3

1. Ordered item 1
2. Ordered item 2

\`\`\`typescript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

Inline \`code\` example.`,
  timestamp: Date.now(),
};

const mockToolUseMessage = {
  type: 'tool_use' as const,
  tool_name: 'Read',
  tool_id: 'toolu_123',
  input: { file_path: '/src/index.ts' },
  timestamp: Date.now(),
};

const mockToolResultMessage = {
  type: 'tool_result' as const,
  tool_id: 'toolu_123',
  content: 'File contents here...',
  timestamp: Date.now(),
};

const mockSubagentMessages = [
  {
    type: 'assistant' as const,
    content: 'Starting exploration...',
    parent_id: 'subagent_explore_abc',
    subagent_type: 'explore',
    subagent_name: 'codebase-search',
    timestamp: Date.now(),
  },
  {
    type: 'tool_use' as const,
    tool_name: 'Glob',
    tool_id: 'toolu_456',
    input: { pattern: '**/*.ts' },
    parent_id: 'subagent_explore_abc',
    timestamp: Date.now() + 100,
  },
  {
    type: 'assistant' as const,
    content: 'Found 42 files.',
    parent_id: 'subagent_explore_abc',
    timestamp: Date.now() + 200,
  },
];

const mockConversation = [
  mockUserMessage,
  mockAssistantMessage,
  { ...mockUserMessage, content: 'Can you read a file?' },
  mockToolUseMessage,
  mockToolResultMessage,
  { ...mockAssistantMessage, content: 'Here is the file content...' },
];

// ============================================================================
// AC1: MessageView renders with mock messages
// ============================================================================

describe('AC1: MessageView renders with mock messages', () => {
  it('should render MessageView component without crashing', () => {
    render(<MessageView messages={[]} />);
    expect(screen.getByTestId('message-view')).toBeInTheDocument();
  });

  it('should render empty state when no messages', () => {
    render(<MessageView messages={[]} />);
    const messageList = screen.getByTestId('message-list');
    expect(messageList.children).toHaveLength(0);
  });

  it('should render user messages with correct role styling', () => {
    render(<MessageView messages={[mockUserMessage]} />);
    const message = screen.getByTestId('message-user');
    expect(message).toBeInTheDocument();
    expect(message).toHaveClass('message-user');
  });

  it('should render assistant messages with correct role styling', () => {
    render(<MessageView messages={[mockAssistantMessage]} />);
    const message = screen.getByTestId('message-assistant');
    expect(message).toBeInTheDocument();
    expect(message).toHaveClass('message-assistant');
  });

  it('should render multiple messages in correct order', () => {
    render(<MessageView messages={mockConversation} />);
    const messages = screen.getAllByTestId(/^message-/);
    expect(messages.length).toBeGreaterThanOrEqual(4);
  });

  it('should display message content correctly', () => {
    render(<MessageView messages={[mockUserMessage]} />);
    expect(screen.getByText('Hello, Claude!')).toBeInTheDocument();
  });

  it('should pass messages to MessageList component', () => {
    render(<MessageView messages={mockConversation} />);
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
  });
});

// ============================================================================
// AC2: Streaming content updates progressively
// ============================================================================

describe('AC2: Streaming content updates progressively', () => {
  it('should render StreamingContent component for streaming messages', () => {
    render(<MessageView messages={[mockStreamingMessage]} />);
    expect(screen.getByTestId('streaming-content')).toBeInTheDocument();
  });

  it('should show streaming indicator when message is streaming', () => {
    render(<MessageView messages={[mockStreamingMessage]} />);
    expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument();
  });

  it('should update content progressively as new chunks arrive', async () => {
    const { rerender } = render(<MessageView messages={[mockStreamingMessage]} />);
    expect(screen.getByText(/This is being/)).toBeInTheDocument();

    const updatedMessage = {
      ...mockStreamingMessage,
      content: 'This is being streamed',
    };
    rerender(<MessageView messages={[updatedMessage]} />);
    expect(screen.getByText(/This is being streamed/)).toBeInTheDocument();
  });

  it('should remove streaming indicator when streaming completes', () => {
    const { rerender } = render(<MessageView messages={[mockStreamingMessage]} />);
    expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument();

    const completedMessage = {
      ...mockStreamingMessage,
      content: 'This is being streamed completely.',
      isStreaming: false,
    };
    rerender(<MessageView messages={[completedMessage]} />);
    expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument();
  });

  it('should handle rapid content updates without flickering', async () => {
    const { rerender } = render(<MessageView messages={[mockStreamingMessage]} />);

    // Simulate rapid updates
    for (let i = 0; i < 10; i++) {
      const msg = {
        ...mockStreamingMessage,
        content: mockStreamingMessage.content + ' word'.repeat(i + 1),
      };
      rerender(<MessageView messages={[msg]} />);
    }

    // Content should be present and stable
    expect(screen.getByTestId('streaming-content')).toBeInTheDocument();
  });

  it('should display cursor or typing indicator during streaming', () => {
    render(<MessageView messages={[mockStreamingMessage]} />);
    const indicator = screen.getByTestId('streaming-indicator');
    expect(indicator).toHaveClass('streaming-cursor');
  });
});

// ============================================================================
// AC3: Markdown renders correctly (headers, lists, code blocks)
// ============================================================================

describe('AC3: Markdown renders correctly', () => {
  it('should render h1 headers correctly', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Header 1');
  });

  it('should render h2 headers correctly', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Header 2');
  });

  it('should render bold text correctly', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const boldText = screen.getByText('bold');
    expect(boldText.tagName).toBe('STRONG');
  });

  it('should render italic text correctly', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const italicText = screen.getByText('italic');
    expect(italicText.tagName).toBe('EM');
  });

  it('should render unordered lists correctly', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
  });

  it('should render all list items', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    expect(screen.getByText('List item 1')).toBeInTheDocument();
    expect(screen.getByText('List item 2')).toBeInTheDocument();
    expect(screen.getByText('List item 3')).toBeInTheDocument();
  });

  it('should render ordered lists with numbers', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    expect(screen.getByText('Ordered item 1')).toBeInTheDocument();
    expect(screen.getByText('Ordered item 2')).toBeInTheDocument();
  });

  it('should render inline code correctly', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const inlineCode = screen.getByText('code');
    expect(inlineCode.tagName).toBe('CODE');
    expect(inlineCode.closest('pre')).toBeNull(); // Not inside pre block
  });

  it('should render code blocks inside pre elements', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const preBlocks = document.querySelectorAll('pre');
    expect(preBlocks.length).toBeGreaterThan(0);
  });

  it('should preserve paragraph structure', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const paragraphs = document.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// AC4: Code blocks have syntax highlighting
// ============================================================================

describe('AC4: Code blocks have syntax highlighting', () => {
  it('should apply language class to code blocks', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const codeBlock = document.querySelector('code.language-typescript');
    expect(codeBlock).toBeInTheDocument();
  });

  it('should highlight keywords in TypeScript code', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const keyword = document.querySelector('.keyword');
    expect(keyword).toBeInTheDocument();
    expect(keyword?.textContent).toBe('const');
  });

  it('should highlight strings in code blocks', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const string = document.querySelector('.string');
    expect(string).toBeInTheDocument();
  });

  it('should highlight function calls', () => {
    render(<MessageView messages={[mockMarkdownMessage]} />);
    const func = document.querySelector('.function');
    expect(func).toBeInTheDocument();
  });

  it('should handle code blocks without language specification', () => {
    const msgNoLang = {
      type: 'assistant' as const,
      content: '```\nplain code\n```',
      timestamp: Date.now(),
    };
    render(<MessageView messages={[msgNoLang]} />);
    const preBlock = document.querySelector('pre');
    expect(preBlock).toBeInTheDocument();
  });

  it('should handle multiple code blocks with different languages', () => {
    const msgMultiLang = {
      type: 'assistant' as const,
      content: `\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`python
def hello():
    pass
\`\`\``,
      timestamp: Date.now(),
    };
    render(<MessageView messages={[msgMultiLang]} />);
    expect(document.querySelector('.language-typescript')).toBeInTheDocument();
    expect(document.querySelector('.language-python')).toBeInTheDocument();
  });
});

// ============================================================================
// AC5: Tool calls display in distinct blocks
// ============================================================================

describe('AC5: Tool calls display in distinct blocks', () => {
  it('should render ToolCallBlock component for tool_use messages', () => {
    render(<MessageView messages={[mockToolUseMessage]} />);
    expect(screen.getByTestId('tool-call-block')).toBeInTheDocument();
  });

  it('should display tool name prominently', () => {
    render(<MessageView messages={[mockToolUseMessage]} />);
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('should display tool input parameters', () => {
    render(<MessageView messages={[mockToolUseMessage]} />);
    expect(screen.getByText('/src/index.ts')).toBeInTheDocument();
  });

  it('should have distinct visual styling for tool blocks', () => {
    render(<MessageView messages={[mockToolUseMessage]} />);
    const toolBlock = screen.getByTestId('tool-call-block');
    expect(toolBlock).toHaveClass('tool-call-block');
  });

  it('should show tool result when available', () => {
    render(<MessageView messages={[mockToolUseMessage, mockToolResultMessage]} />);
    expect(screen.getByText(/File contents here/)).toBeInTheDocument();
  });

  it('should match tool result with tool use by tool_id', () => {
    render(<MessageView messages={[mockToolUseMessage, mockToolResultMessage]} />);
    const toolBlock = screen.getByTestId('tool-call-block');
    expect(toolBlock).toContainElement(screen.getByText(/File contents here/));
  });

  it('should handle Bash tool with command display', () => {
    const bashTool = {
      type: 'tool_use' as const,
      tool_name: 'Bash',
      tool_id: 'toolu_bash_1',
      input: { command: 'ls -la' },
      timestamp: Date.now(),
    };
    render(<MessageView messages={[bashTool]} />);
    expect(screen.getByText('ls -la')).toBeInTheDocument();
  });

  it('should collapse/expand tool result content', async () => {
    render(<MessageView messages={[mockToolUseMessage, mockToolResultMessage]} />);
    const toggle = screen.getByTestId('tool-result-toggle');

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByTestId('tool-result-content')).toHaveClass('collapsed');
    });
  });
});

// ============================================================================
// AC6: Subagent messages grouped in collapsible spans
// ============================================================================

describe('AC6: Subagent messages grouped in collapsible spans', () => {
  it('should render SubagentSpan component for grouped subagent messages', () => {
    render(<MessageView messages={mockSubagentMessages} />);
    expect(screen.getByTestId('subagent-span')).toBeInTheDocument();
  });

  it('should display subagent type in span header', () => {
    render(<MessageView messages={mockSubagentMessages} />);
    expect(screen.getByText(/explore/i)).toBeInTheDocument();
  });

  it('should display subagent name in span header', () => {
    render(<MessageView messages={mockSubagentMessages} />);
    expect(screen.getByText('codebase-search')).toBeInTheDocument();
  });

  it('should group all messages with same parent_id', () => {
    render(<MessageView messages={mockSubagentMessages} />);
    const span = screen.getByTestId('subagent-span');
    // All 3 messages should be inside the span
    expect(span.querySelectorAll('[data-testid^="message-"]').length).toBe(3);
  });

  it('should be collapsible by default', () => {
    render(<MessageView messages={mockSubagentMessages} />);
    const span = screen.getByTestId('subagent-span');
    expect(span).toHaveAttribute('data-collapsible', 'true');
  });

  it('should toggle collapse state on click', async () => {
    render(<MessageView messages={mockSubagentMessages} />);
    const header = screen.getByTestId('subagent-span-header');

    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.getByTestId('subagent-span')).toHaveClass('collapsed');
    });

    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.getByTestId('subagent-span')).not.toHaveClass('collapsed');
    });
  });

  it('should show message count when collapsed', async () => {
    render(<MessageView messages={mockSubagentMessages} />);
    const header = screen.getByTestId('subagent-span-header');

    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.getByText('3 messages')).toBeInTheDocument();
    });
  });

  it('should nest multiple subagent spans correctly', () => {
    const nestedMessages = [
      ...mockSubagentMessages,
      {
        type: 'assistant' as const,
        content: 'Nested subagent',
        parent_id: 'subagent_nested_xyz',
        subagent_type: 'test-runner',
        subagent_name: 'unit-tests',
        timestamp: Date.now() + 300,
      },
    ];
    render(<MessageView messages={nestedMessages} />);
    const spans = screen.getAllByTestId('subagent-span');
    expect(spans.length).toBe(2);
  });

  it('should style different subagent types distinctly', () => {
    render(<MessageView messages={mockSubagentMessages} />);
    const span = screen.getByTestId('subagent-span');
    expect(span).toHaveClass('subagent-explore');
  });
});

// ============================================================================
// AC7: Auto-scroll follows new content, preserves on scroll-up
// ============================================================================

describe('AC7: Auto-scroll behavior', () => {
  it('should auto-scroll to bottom when new messages arrive', async () => {
    const { rerender } = render(<MessageView messages={[mockUserMessage]} />);
    const scrollContainer = screen.getByTestId('message-list');
    const scrollToSpy = vi.spyOn(scrollContainer, 'scrollTo');

    rerender(<MessageView messages={[mockUserMessage, mockAssistantMessage]} />);

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalled();
    });
  });

  it('should preserve scroll position when user scrolls up', async () => {
    render(<MessageView messages={mockConversation} />);
    const scrollContainer = screen.getByTestId('message-list');

    // Simulate user scrolling up
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 0 } });

    // State should indicate auto-scroll is disabled
    expect(screen.getByTestId('auto-scroll-indicator')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  it('should re-enable auto-scroll when user scrolls to bottom', async () => {
    render(<MessageView messages={mockConversation} />);
    const scrollContainer = screen.getByTestId('message-list');

    // Simulate scrolling to bottom
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000 });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 500 });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 500 });

    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(screen.getByTestId('auto-scroll-indicator')).toHaveAttribute(
        'data-active',
        'true'
      );
    });
  });

  it('should show scroll-to-bottom button when not at bottom', () => {
    render(<MessageView messages={mockConversation} />);
    const scrollContainer = screen.getByTestId('message-list');

    // Simulate scrolling up
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 0 } });

    expect(screen.getByTestId('scroll-to-bottom-button')).toBeVisible();
  });

  it('should hide scroll-to-bottom button when at bottom', () => {
    render(<MessageView messages={mockConversation} />);
    const scrollContainer = screen.getByTestId('message-list');

    // Simulate being at bottom
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000 });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 1000 });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0 });

    fireEvent.scroll(scrollContainer);

    expect(screen.queryByTestId('scroll-to-bottom-button')).not.toBeVisible();
  });

  it('should scroll to bottom when button is clicked', async () => {
    render(<MessageView messages={mockConversation} />);
    const scrollContainer = screen.getByTestId('message-list');
    const scrollToSpy = vi.spyOn(scrollContainer, 'scrollTo');

    // Simulate scrolling up first
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 0 } });

    const button = screen.getByTestId('scroll-to-bottom-button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({
        behavior: 'smooth',
      }));
    });
  });

  it('should maintain auto-scroll during streaming', async () => {
    const { rerender } = render(<MessageView messages={[mockStreamingMessage]} />);
    const scrollContainer = screen.getByTestId('message-list');
    const scrollToSpy = vi.spyOn(scrollContainer, 'scrollTo');

    // Simulate streaming updates
    for (let i = 0; i < 5; i++) {
      const msg = {
        ...mockStreamingMessage,
        content: mockStreamingMessage.content + ' more content'.repeat(i + 1),
      };
      rerender(<MessageView messages={[msg]} />);
    }

    // Should have scrolled multiple times
    expect(scrollToSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// useMessageStream Hook Tests
// ============================================================================

describe('useMessageStream Hook', () => {
  // Test component to use the hook
  const TestComponent = () => {
    const { messages, isStreaming, error } = useMessageStream();
    return (
      <div>
        <div data-testid="message-count">{messages.length}</div>
        <div data-testid="streaming-status">{isStreaming.toString()}</div>
        {error && <div data-testid="error">{error.message}</div>}
      </div>
    );
  };

  it('should register message listener on mount', () => {
    render(<TestComponent />);
    expect(mockElectronAPI.claude.onMessage).toHaveBeenCalled();
  });

  it('should unregister listener on unmount', () => {
    const { unmount } = render(<TestComponent />);
    unmount();
    expect(mockElectronAPI.claude.offMessage).toHaveBeenCalled();
  });

  it('should update messages when new message arrives', async () => {
    render(<TestComponent />);

    // Get the callback that was registered
    const callback = mockElectronAPI.claude.onMessage.mock.calls[0][0];

    // Simulate message arrival
    act(() => {
      callback({ type: 'user', content: 'test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    });
  });

  it('should set streaming state for assistant messages', async () => {
    render(<TestComponent />);
    const callback = mockElectronAPI.claude.onMessage.mock.calls[0][0];

    act(() => {
      callback({ type: 'assistant', content: 'test', isStreaming: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId('streaming-status')).toHaveTextContent('true');
    });
  });

  it('should handle connection errors gracefully', async () => {
    mockElectronAPI.claude.onMessage.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Connection failed');
    });
  });
});

// ============================================================================
// Component Isolation Tests
// ============================================================================

describe('Message Component', () => {
  it('should render user message with avatar', () => {
    render(<Message message={mockUserMessage} />);
    expect(screen.getByTestId('message-avatar')).toBeInTheDocument();
  });

  it('should render assistant message with avatar', () => {
    render(<Message message={mockAssistantMessage} />);
    expect(screen.getByTestId('message-avatar')).toBeInTheDocument();
  });

  it('should apply correct CSS class based on role', () => {
    const { container } = render(<Message message={mockUserMessage} />);
    expect(container.firstChild).toHaveClass('message-user');
  });
});

describe('StreamingContent Component', () => {
  it('should render content prop', () => {
    render(<StreamingContent content="Test content" isStreaming={true} />);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should show cursor when streaming', () => {
    render(<StreamingContent content="Test" isStreaming={true} />);
    expect(screen.getByTestId('streaming-cursor')).toBeInTheDocument();
  });

  it('should hide cursor when not streaming', () => {
    render(<StreamingContent content="Test" isStreaming={false} />);
    expect(screen.queryByTestId('streaming-cursor')).not.toBeInTheDocument();
  });
});

describe('ToolCallBlock Component', () => {
  it('should render tool name', () => {
    render(<ToolCallBlock toolUse={mockToolUseMessage} />);
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('should render tool input', () => {
    render(<ToolCallBlock toolUse={mockToolUseMessage} />);
    expect(screen.getByText('/src/index.ts')).toBeInTheDocument();
  });

  it('should show pending state without result', () => {
    render(<ToolCallBlock toolUse={mockToolUseMessage} />);
    expect(screen.getByTestId('tool-status')).toHaveTextContent('pending');
  });

  it('should show complete state with result', () => {
    render(<ToolCallBlock toolUse={mockToolUseMessage} result={mockToolResultMessage} />);
    expect(screen.getByTestId('tool-status')).toHaveTextContent('complete');
  });
});

describe('SubagentSpan Component', () => {
  it('should render header with type and name', () => {
    render(
      <SubagentSpan
        type="explore"
        name="codebase-search"
        messages={mockSubagentMessages}
      />
    );
    expect(screen.getByText(/explore/i)).toBeInTheDocument();
    expect(screen.getByText('codebase-search')).toBeInTheDocument();
  });

  it('should render children messages', () => {
    render(
      <SubagentSpan
        type="explore"
        name="codebase-search"
        messages={mockSubagentMessages}
      />
    );
    expect(screen.getByText('Starting exploration...')).toBeInTheDocument();
  });

  it('should be expandable', () => {
    render(
      <SubagentSpan
        type="explore"
        name="codebase-search"
        messages={mockSubagentMessages}
        defaultCollapsed={true}
      />
    );
    expect(screen.getByTestId('subagent-span')).toHaveClass('collapsed');
  });
});
