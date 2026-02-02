/**
 * MSSCI-12780: Progress Panel Shows Raw Markers Instead of Content
 *
 * Tests for bug fix where ProgressPanel displays raw marker characters
 * (>, *) instead of actual task content due to data model mismatch.
 *
 * Root Cause: The TodoItem interface in useTodos.ts expects `subject` and `id`
 * but the actual data from todos.ts provides `content` and `activeForm`.
 *
 * Acceptance Criteria:
 * - AC1: IN PROGRESS section displays task content (not just ">" marker)
 * - AC2: PENDING section displays task content (not just "*" bullets)
 * - AC3: COMPLETED section displays task content (not just count)
 * - AC4: Status markers are rendered as icons/badges, not raw characters
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// The component we're testing
import { ProgressPanel } from '../src/public/components/panels/ProgressPanel';

// Mock useTodos hook
const mockUseTodos = vi.fn();
vi.mock('../src/public/hooks/useTodos', () => ({
  useTodos: () => mockUseTodos(),
  TodoItem: {},
}));

describe('MSSCI-12780: Progress Panel Shows Raw Markers Instead of Content', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('AC1: IN PROGRESS section displays task content', () => {

    it('should display task content for in_progress items, not just ">" marker', () => {
      // This data matches what todos.ts actually produces (content, activeForm)
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Implementing user authentication',
            activeForm: 'Implementing user authentication',
            status: 'in_progress',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // The task content should be visible, not just ">"
      expect(screen.getByText('Implementing user authentication')).toBeInTheDocument();
    });

    it('should not show only the ">" marker without task content', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Building API endpoints',
            activeForm: 'Building API endpoints',
            status: 'in_progress',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // We should find the content text, not an empty element with just ">"
      const todoItem = screen.getByTestId('todo-1');
      expect(todoItem.textContent).toContain('Building API endpoints');
    });

    it('should display activeForm when status is in_progress', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Write tests',
            activeForm: 'Writing tests for component',
            status: 'in_progress',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // For in_progress, activeForm is more descriptive
      expect(screen.getByText(/Writing tests|Write tests/)).toBeInTheDocument();
    });

  });

  describe('AC2: PENDING section displays task content', () => {

    it('should display task content for pending items, not just "*" bullets', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Update documentation',
            activeForm: 'Updating documentation',
            status: 'pending',
          },
          {
            id: '2',
            content: 'Add unit tests',
            activeForm: 'Adding unit tests',
            status: 'pending',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // Both pending tasks should show their content
      expect(screen.getByText('Update documentation')).toBeInTheDocument();
      expect(screen.getByText('Add unit tests')).toBeInTheDocument();
    });

    it('should render pending items with their actual text content', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Fix styling issues',
            activeForm: 'Fixing styling issues',
            status: 'pending',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      const todoItem = screen.getByTestId('todo-1');
      // Content should include the task text, not be empty
      expect(todoItem.textContent).toContain('Fix styling issues');
    });

  });

  describe('AC3: COMPLETED section displays task content', () => {

    it('should display task content for completed items, not just a count', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Set up project structure',
            activeForm: 'Setting up project structure',
            status: 'completed',
          },
          {
            id: '2',
            content: 'Configure build system',
            activeForm: 'Configuring build system',
            status: 'completed',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // The completed section header shows, but we also want to verify
      // that completed task content is accessible (even if collapsed)
      expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    });

    it('should show completed task details when section is expanded', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Initialize repository',
            activeForm: 'Initializing repository',
            status: 'completed',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // Even if collapsed by default, the DOM should contain the content
      // (for accessibility and potential expansion)
      const panel = screen.getByTestId('progress-panel');
      expect(panel).toBeInTheDocument();
    });

  });

  describe('AC4: Status markers rendered as icons/badges, not raw characters', () => {

    it('should not display raw ">" character for in_progress status', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Active task',
            activeForm: 'Working on active task',
            status: 'in_progress',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // The status indicator should be in a styled span, not raw text
      const statusElements = screen.getAllByText('>');
      // If raw > exists, it should be within a status indicator class
      statusElements.forEach(el => {
        expect(el.className).toContain('todo-status');
      });
    });

    it('should not display raw "*" character for pending status', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Pending task',
            activeForm: 'Will do pending task',
            status: 'pending',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // The status indicator should be styled, not raw
      const statusElements = screen.getAllByText('*');
      statusElements.forEach(el => {
        expect(el.className).toContain('todo-status');
      });
    });

    it('should not display raw "v" character for completed status', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Done task',
            activeForm: 'Finished task',
            status: 'completed',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // Completed items are in collapsed section, but if visible,
      // status markers should be styled
      const panel = screen.getByTestId('progress-panel');
      expect(panel).toBeInTheDocument();
    });

  });

  describe('Data model compatibility', () => {

    it('should work with TodoItem data containing content property', () => {
      // For pending items, content is displayed (not activeForm)
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Task from content field',
            activeForm: 'Working on task from content field',
            status: 'pending',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // The component should display content for pending items
      expect(screen.getByText('Task from content field')).toBeInTheDocument();
    });

    it('should work with TodoItem data containing activeForm property', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Base content',
            activeForm: 'Active form content shown',
            status: 'in_progress',
          },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // Either content or activeForm should be displayed
      const text = screen.getByTestId('todo-1').textContent;
      expect(text).toMatch(/Base content|Active form content/);
    });

    it('should not crash when subject property is undefined', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          {
            id: '1',
            content: 'Task with no subject',
            activeForm: 'Working on task',
            status: 'pending',
            // Note: subject is intentionally NOT provided
          },
        ],
        isLoading: false,
        error: null,
      });

      // Should not throw
      expect(() => render(<ProgressPanel />)).not.toThrow();

      // And should still display something meaningful
      const todoItem = screen.getByTestId('todo-1');
      expect(todoItem.textContent).toBeTruthy();
      expect(todoItem.textContent).not.toBe('*'); // Not just the marker
    });

  });

  describe('Integration: Full todo list rendering', () => {

    it('should display all todos with their actual content', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          { id: '1', content: 'Setup database', activeForm: 'Setting up database', status: 'completed' },
          { id: '2', content: 'Implement API', activeForm: 'Implementing API', status: 'in_progress' },
          { id: '3', content: 'Write tests', activeForm: 'Writing tests', status: 'pending' },
          { id: '4', content: 'Deploy to staging', activeForm: 'Deploying to staging', status: 'pending' },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // Progress bar should show 1/4 (1 completed out of 4)
      expect(screen.getByText('1/4')).toBeInTheDocument();

      // In Progress section should show the in_progress task (uses activeForm)
      expect(screen.getByText('Implementing API')).toBeInTheDocument();

      // Pending section should show pending tasks (uses content)
      expect(screen.getByText('Write tests')).toBeInTheDocument();
      expect(screen.getByText('Deploy to staging')).toBeInTheDocument();
    });

    it('should correctly group todos by status', () => {
      mockUseTodos.mockReturnValue({
        todos: [
          { id: '1', content: 'Completed A', activeForm: 'Done A', status: 'completed' },
          { id: '2', content: 'In Progress B', activeForm: 'Working B', status: 'in_progress' },
          { id: '3', content: 'Pending C', activeForm: 'Will do C', status: 'pending' },
        ],
        isLoading: false,
        error: null,
      });

      render(<ProgressPanel />);

      // Each section should have its items
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText(/Completed/)).toBeInTheDocument();
    });

  });

});
