/**
 * MSSCI-12713: ApprovalModal Component Tests
 *
 * Tests verify the ApprovalModal React component for tool permission approval.
 * Part of Epic 71: Codebase Awareness
 *
 * Acceptance Criteria (derived from description):
 * - AC1: Modal displays tool permission request with command preview
 * - AC2: Keyboard-first interaction (Enter approve, Escape reject)
 * - AC3: Red accent styling for destructive actions
 * - AC4: "Always allow" checkbox for persistent permissions
 * - AC5: Non-blocking overlay (click outside to dismiss)
 * - AC6: Styled consistently with other Cyclist components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('MSSCI-12713: ApprovalModal Component', () => {

  describe('Module Structure', () => {

    it('should export ApprovalModal component as default', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.default).toBeDefined();
      expect(typeof module.default).toBe('function');
    });

    it('should export ApprovalModalProps type', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // TypeScript types exist at compile time; verify props shape via component
      expect(module.default).toBeDefined();
    });

    it('should export useApprovalModal hook', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.useApprovalModal).toBeDefined();
      expect(typeof module.useApprovalModal).toBe('function');
    });

    it('should export modal visibility constants', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.MODAL_TESTID).toBe('approval-modal');
      expect(module.OVERLAY_TESTID).toBe('approval-modal-overlay');
    });

  });

  describe('AC1: Modal displays tool permission request with command preview', () => {

    it('should export formatCommandPreview function', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.formatCommandPreview).toBeDefined();
      expect(typeof module.formatCommandPreview).toBe('function');
    });

    it('should format Bash command for preview', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { formatCommandPreview } = module;

      const preview = formatCommandPreview('Bash', { command: 'npm install lodash' });
      expect(preview).toContain('npm install lodash');
    });

    it('should format Edit tool for preview showing file path', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { formatCommandPreview } = module;

      const preview = formatCommandPreview('Edit', {
        file_path: '/src/index.ts',
        old_string: 'const x = 1',
        new_string: 'const x = 2',
      });
      expect(preview).toContain('/src/index.ts');
    });

    it('should format Write tool for preview showing file path', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { formatCommandPreview } = module;

      const preview = formatCommandPreview('Write', {
        file_path: '/src/new-file.ts',
        content: 'export const x = 1;',
      });
      expect(preview).toContain('/src/new-file.ts');
    });

    it('should format WebFetch tool for preview showing URL', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { formatCommandPreview } = module;

      const preview = formatCommandPreview('WebFetch', {
        url: 'https://api.github.com/repos',
        prompt: 'Get repo info',
      });
      expect(preview).toContain('https://api.github.com/repos');
    });

    it('should have data-testid="command-preview" on preview element', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.COMMAND_PREVIEW_TESTID).toBe('command-preview');
    });

    it('should have data-testid="tool-name" on tool name display', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.TOOL_NAME_TESTID).toBe('tool-name');
    });

    it('should export getToolIcon function for tool-specific icons', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.getToolIcon).toBeDefined();
      expect(typeof module.getToolIcon).toBe('function');
    });

    it('should return appropriate icon for each tool type', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { getToolIcon } = module;

      expect(getToolIcon('Bash')).toBeDefined();
      expect(getToolIcon('Edit')).toBeDefined();
      expect(getToolIcon('Write')).toBeDefined();
      expect(getToolIcon('WebFetch')).toBeDefined();
    });

  });

  describe('AC2: Keyboard-first interaction (Enter approve, Escape reject)', () => {

    it('should export KEYBOARD_SHORTCUTS constant', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.KEYBOARD_SHORTCUTS).toBeDefined();
      expect(module.KEYBOARD_SHORTCUTS.APPROVE).toBe('Enter');
      expect(module.KEYBOARD_SHORTCUTS.REJECT).toBe('Escape');
    });

    it('should export handleKeyDown function', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.handleKeyDown).toBeDefined();
      expect(typeof module.handleKeyDown).toBe('function');
    });

    it('should approve on Enter key press', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { handleKeyDown } = module;

      const onApprove = vi.fn();
      const onReject = vi.fn();

      const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;
      handleKeyDown(event, onApprove, onReject);

      expect(onApprove).toHaveBeenCalledTimes(1);
      expect(onReject).not.toHaveBeenCalled();
    });

    it('should reject on Escape key press', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { handleKeyDown } = module;

      const onApprove = vi.fn();
      const onReject = vi.fn();

      const event = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent;
      handleKeyDown(event, onApprove, onReject);

      expect(onReject).toHaveBeenCalledTimes(1);
      expect(onApprove).not.toHaveBeenCalled();
    });

    it('should not trigger on other keys', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { handleKeyDown } = module;

      const onApprove = vi.fn();
      const onReject = vi.fn();

      const event = { key: 'a', preventDefault: vi.fn() } as unknown as KeyboardEvent;
      handleKeyDown(event, onApprove, onReject);

      expect(onApprove).not.toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();
    });

    it('should have data-testid="approve-button" on approve button', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.APPROVE_BUTTON_TESTID).toBe('approve-button');
    });

    it('should have data-testid="reject-button" on reject button', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.REJECT_BUTTON_TESTID).toBe('reject-button');
    });

    it('should focus approve button when modal opens', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.INITIAL_FOCUS_ELEMENT).toBe('approve-button');
    });

    it('should trap focus within modal when open', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.useFocusTrap).toBeDefined();
      expect(typeof module.useFocusTrap).toBe('function');
    });

  });

  describe('AC3: Red accent styling for destructive actions', () => {

    it('should export classifyActionSeverity function', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.classifyActionSeverity).toBeDefined();
      expect(typeof module.classifyActionSeverity).toBe('function');
    });

    it('should classify "rm -rf" as destructive', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { classifyActionSeverity } = module;

      expect(classifyActionSeverity('Bash', { command: 'rm -rf /' })).toBe('destructive');
      expect(classifyActionSeverity('Bash', { command: 'rm -rf /tmp/*' })).toBe('destructive');
    });

    it('should classify file deletion as destructive', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { classifyActionSeverity } = module;

      expect(classifyActionSeverity('Bash', { command: 'rm important-file.txt' })).toBe('destructive');
    });

    it('should classify git reset --hard as destructive', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { classifyActionSeverity } = module;

      expect(classifyActionSeverity('Bash', { command: 'git reset --hard' })).toBe('destructive');
      expect(classifyActionSeverity('Bash', { command: 'git push --force' })).toBe('destructive');
    });

    it('should classify npm install as normal', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { classifyActionSeverity } = module;

      expect(classifyActionSeverity('Bash', { command: 'npm install lodash' })).toBe('normal');
    });

    it('should classify ls as safe', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { classifyActionSeverity } = module;

      expect(classifyActionSeverity('Bash', { command: 'ls -la' })).toBe('safe');
    });

    it('should export SEVERITY_CLASSNAMES constant', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.SEVERITY_CLASSNAMES).toBeDefined();
      expect(module.SEVERITY_CLASSNAMES.destructive).toBe('severity-destructive');
      expect(module.SEVERITY_CLASSNAMES.normal).toBe('severity-normal');
      expect(module.SEVERITY_CLASSNAMES.safe).toBe('severity-safe');
    });

    it('should have CSS file with destructive styling using red accent', async () => {
      const { existsSync, readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ApprovalModal/ApprovalModal.css');

      expect(existsSync(cssPath)).toBe(true);

      const css = readFileSync(cssPath, 'utf-8');
      // Should have red color for destructive severity
      expect(css).toMatch(/\.severity-destructive[^}]*(color|background|border)/);
      expect(css).toMatch(/red|#[cdef][0-9a-f]{5}|rgb\([^)]*[12]\d{2}/i);
    });

  });

  describe('AC4: "Always allow" checkbox for persistent permissions', () => {

    it('should have data-testid="always-allow-checkbox" on checkbox', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.ALWAYS_ALLOW_TESTID).toBe('always-allow-checkbox');
    });

    it('should export AlwaysAllowCheckbox component or element', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // Either as named export or part of main component
      expect(module.default).toBeDefined();
    });

    it('should export grant scope constants', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.GRANT_SCOPES).toBeDefined();
      expect(module.GRANT_SCOPES.ONCE).toBe('once');
      expect(module.GRANT_SCOPES.SESSION).toBe('session');
      expect(module.GRANT_SCOPES.ALWAYS).toBe('always');
    });

    it('should export getGrantScope function', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.getGrantScope).toBeDefined();
      expect(typeof module.getGrantScope).toBe('function');
    });

    it('should return "once" when checkbox unchecked', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { getGrantScope } = module;

      expect(getGrantScope(false)).toBe('once');
    });

    it('should return "always" when checkbox checked', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { getGrantScope } = module;

      expect(getGrantScope(true)).toBe('always');
    });

    it('should export checkbox label text constant', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.ALWAYS_ALLOW_LABEL).toBeDefined();
      expect(typeof module.ALWAYS_ALLOW_LABEL).toBe('string');
      expect(module.ALWAYS_ALLOW_LABEL.toLowerCase()).toContain('always');
    });

    it('should have accessible label for checkbox', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.ALWAYS_ALLOW_ARIA_LABEL).toBeDefined();
      expect(typeof module.ALWAYS_ALLOW_ARIA_LABEL).toBe('string');
    });

  });

  describe('AC5: Non-blocking overlay (click outside to dismiss)', () => {

    it('should export handleOverlayClick function', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.handleOverlayClick).toBeDefined();
      expect(typeof module.handleOverlayClick).toBe('function');
    });

    it('should call onDismiss when clicking overlay', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { handleOverlayClick } = module;

      const onDismiss = vi.fn();
      // Same object reference for both target and currentTarget (simulates clicking overlay directly)
      const overlayElement = { dataset: { testid: 'approval-modal-overlay' } };
      const event = {
        target: overlayElement,
        currentTarget: overlayElement,
      } as unknown as React.MouseEvent;

      handleOverlayClick(event, onDismiss);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should not dismiss when clicking modal content', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { handleOverlayClick } = module;

      const onDismiss = vi.fn();
      // Simulating click on inner content where target !== currentTarget
      const modalContent = { dataset: { testid: 'approval-modal' } };
      const overlay = { dataset: { testid: 'approval-modal-overlay' } };
      const event = {
        target: modalContent,
        currentTarget: overlay,
      } as unknown as React.MouseEvent;

      handleOverlayClick(event, onDismiss);

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should have semi-transparent overlay background', async () => {
      const { existsSync, readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ApprovalModal/ApprovalModal.css');

      if (!existsSync(cssPath)) {
        throw new Error('CSS file does not exist');
      }

      const css = readFileSync(cssPath, 'utf-8');
      // Should have rgba or opacity for overlay
      expect(css).toMatch(/\.approval-modal-overlay[^}]*(rgba|opacity)/);
    });

    it('should export isNonBlocking constant as true', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.IS_NON_BLOCKING).toBe(true);
    });

  });

  describe('AC6: Styled consistently with other Cyclist components', () => {

    it('should export COMPONENT_CLASSNAME constant', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.COMPONENT_CLASSNAME).toBe('approval-modal');
    });

    it('should have CSS file for component styles', async () => {
      const { existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ApprovalModal/ApprovalModal.css');

      expect(existsSync(cssPath)).toBe(true);
    });

    it('should use CSS custom properties for theming', async () => {
      const { readFileSync, existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ApprovalModal/ApprovalModal.css');

      if (!existsSync(cssPath)) {
        throw new Error('CSS file does not exist');
      }

      const css = readFileSync(cssPath, 'utf-8');
      expect(css).toMatch(/var\(--|--.*:/);
    });

    it('should have consistent border-radius with other components', async () => {
      const { readFileSync, existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ApprovalModal/ApprovalModal.css');

      if (!existsSync(cssPath)) {
        throw new Error('CSS file does not exist');
      }

      const css = readFileSync(cssPath, 'utf-8');
      expect(css).toMatch(/border-radius/);
    });

    it('should have smooth transitions for state changes', async () => {
      const { readFileSync, existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ApprovalModal/ApprovalModal.css');

      if (!existsSync(cssPath)) {
        throw new Error('CSS file does not exist');
      }

      const css = readFileSync(cssPath, 'utf-8');
      expect(css).toMatch(/transition/);
    });

  });

  describe('Component Integration', () => {

    it('should export ApprovalRequest interface type', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // TypeScript interface - component should handle this shape
      expect(module.default).toBeDefined();
    });

    it('should export ApprovalResponse interface type', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.createApprovalResponse).toBeDefined();
      expect(typeof module.createApprovalResponse).toBe('function');
    });

    it('should create approval response with correct structure', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { createApprovalResponse } = module;

      const response = createApprovalResponse('tool-123', true, 'always');

      expect(response.toolId).toBe('tool-123');
      expect(response.approved).toBe(true);
      expect(response.grantScope).toBe('always');
    });

    it('should create rejection response', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');
      const { createApprovalResponse } = module;

      const response = createApprovalResponse('tool-123', false);

      expect(response.toolId).toBe('tool-123');
      expect(response.approved).toBe(false);
      expect(response.grantScope).toBeUndefined();
    });

  });

  describe('Accessibility', () => {

    it('should have role="dialog" on modal element', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.MODAL_ROLE).toBe('dialog');
    });

    it('should have aria-modal="true"', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.ARIA_MODAL).toBe(true);
    });

    it('should have aria-labelledby pointing to title', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.TITLE_ID).toBe('approval-modal-title');
    });

    it('should have aria-describedby pointing to description', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.DESCRIPTION_ID).toBe('approval-modal-description');
    });

    it('should export modal title constant', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.MODAL_TITLE).toBeDefined();
      expect(typeof module.MODAL_TITLE).toBe('string');
      expect(module.MODAL_TITLE.length).toBeGreaterThan(0);
    });

  });

  describe('IPC Integration', () => {

    it('should export subscribeToPermissionRequests function', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.subscribeToPermissionRequests).toBeDefined();
      expect(typeof module.subscribeToPermissionRequests).toBe('function');
    });

    it('should export sendPermissionResponse function', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.sendPermissionResponse).toBeDefined();
      expect(typeof module.sendPermissionResponse).toBe('function');
    });

  });

});
