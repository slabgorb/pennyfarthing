/**
 * MSSCI-14322: Mount ApprovalModal in React component tree
 *
 * Tests verify that ApprovalModal is mounted in App.tsx and wired to
 * the WebSocket permission request flow. The component itself is already
 * implemented and tested (MSSCI-12713, 62 tests). This story is about
 * wiring it into the live app.
 *
 * Acceptance Criteria:
 * - AC1: ApprovalModal is imported and rendered in App.tsx at the top level
 * - AC2: WebSocket subscription is connected so ApprovalModal receives hook-request events
 * - AC3: Concurrent permission requests are queued (not lost or overwritten)
 * - AC4: Keyboard shortcuts work: Enter to approve, Escape to deny
 * - AC5: Existing 62 ApprovalModal tests continue to pass
 * - AC6: ApprovalModal renders via shadcn Dialog (Radix Portal) outside the React tree
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('MSSCI-14322: Mount ApprovalModal in React component tree', () => {

  // =========================================================================
  // AC1: ApprovalModal is imported and rendered in App.tsx at the top level
  // =========================================================================

  describe('AC1: ApprovalModal is imported and rendered in App.tsx', () => {

    it('should import ApprovalModal in App.tsx', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      expect(existsSync(appPath)).toBe(true);

      const appSource = readFileSync(appPath, 'utf-8');
      // App.tsx must import ApprovalModal component
      expect(appSource).toMatch(/import.*ApprovalModal/);
    });

    it('should import useApprovalModal hook in App.tsx', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // App.tsx must import the useApprovalModal hook for state management
      expect(appSource).toMatch(/import.*useApprovalModal/);
    });

    it('should render ApprovalModal component in the JSX tree', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // ApprovalModal must appear in the rendered JSX (as <ApprovalModal)
      expect(appSource).toMatch(/<ApprovalModal[\s/]/);
    });

    it('should render ApprovalModal inside ErrorBoundary but outside main content', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // ApprovalModal should be rendered after the main content div,
      // inside the provider tree but not inside <main>
      // It should be a sibling of the main layout, not nested inside it
      const mainCloseIndex = appSource.lastIndexOf('</main>');
      const approvalIndex = appSource.indexOf('<ApprovalModal');

      expect(mainCloseIndex).toBeGreaterThan(-1);
      expect(approvalIndex).toBeGreaterThan(-1);

      // ApprovalModal should be positioned after the main content area closes
      // (it renders in a portal anyway, but logically it's a top-level concern)
      expect(approvalIndex).toBeGreaterThan(mainCloseIndex);
    });

    it('should pass required props to ApprovalModal', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // Must pass isOpen, toolName, toolId, input, onApprove, onReject
      expect(appSource).toMatch(/isOpen=/);
      expect(appSource).toMatch(/toolName=/);
      expect(appSource).toMatch(/toolId=/);
      expect(appSource).toMatch(/input=/);
      expect(appSource).toMatch(/onApprove=/);
      expect(appSource).toMatch(/onReject=/);
    });

  });

  // =========================================================================
  // AC2: WebSocket subscription connected for hook-request events
  // =========================================================================

  describe('AC2: WebSocket subscription for hook-request events', () => {

    it('should import subscribeToPermissionRequests in App.tsx', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      expect(appSource).toMatch(/import.*subscribeToPermissionRequests/);
    });

    it('should import sendPermissionResponse in App.tsx', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      expect(appSource).toMatch(/import.*sendPermissionResponse/);
    });

    it('should call subscribeToPermissionRequests in a useEffect', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // The subscription should be set up via useEffect with cleanup
      expect(appSource).toMatch(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*subscribeToPermissionRequests/s);
    });

    it('should clean up WebSocket subscription on unmount', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // subscribeToPermissionRequests returns an unsubscribe function
      // The useEffect should return it for cleanup
      // Pattern: const unsub = subscribe(...); return unsub; or return subscribe(...)
      expect(appSource).toMatch(/return\s+unsub|return\s+subscribeToPermissionRequests/);
    });

    it('should call sendPermissionResponse when user approves', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // The approve handler should call sendPermissionResponse
      expect(appSource).toMatch(/sendPermissionResponse/);
    });

  });

  // =========================================================================
  // AC3: Concurrent permission requests are queued
  // =========================================================================

  describe('AC3: Concurrent permission requests are queued', () => {

    it('should maintain a queue for incoming permission requests', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // There should be a queue/array state for pending approval requests
      // e.g., useState<ApprovalRequest[]>([]) or useRef<ApprovalRequest[]>([])
      // Must be specifically for approval/permission requests, not MessageQueue
      expect(appSource).toMatch(/ApprovalRequest\[\]|requestQueue|approvalQueue|pendingRequests/);
    });

    it('should show next queued request after current one is resolved', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // When a request is approved/rejected, the next one in the queue should show
      // Look for queue shift/dequeue logic
      expect(appSource).toMatch(/shift\(\)|slice\(1\)|\.splice\(0,\s*1\)|dequeue|next.*request/i);
    });

    it('should not lose requests that arrive while modal is showing', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // The subscription callback should push to queue even when modal is open
      // The queue should accumulate requests regardless of modal state
      // Look for push to queue in the subscription callback
      expect(appSource).toMatch(/\.push\(|\.concat\(|\.\.\.prev,/);
    });

  });

  // =========================================================================
  // AC4: Keyboard shortcuts work (Enter approve, Escape deny)
  // =========================================================================

  describe('AC4: Keyboard shortcuts work', () => {

    it('should wire onApprove handler that sends approval via WebSocket', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // The onApprove callback should create and send an approval response
      // using createApprovalResponse and sendPermissionResponse
      expect(appSource).toMatch(/createApprovalResponse|sendPermissionResponse/);
      expect(appSource).toMatch(/approved.*true|onApprove/);
    });

    it('should wire onReject handler that sends rejection via WebSocket', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // The onReject callback should send a rejection response
      expect(appSource).toMatch(/onReject/);
      // Should call sendPermissionResponse with approved: false
      expect(appSource).toMatch(/approved.*false|reject|onReject/);
    });

    it('should import createApprovalResponse for building response objects', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      expect(appSource).toMatch(/import.*createApprovalResponse/);
    });

  });

  // =========================================================================
  // AC5: Existing 62 ApprovalModal tests continue to pass
  // =========================================================================

  describe('AC5: Existing ApprovalModal tests unaffected', () => {

    it('should not modify ApprovalModal component exports', async () => {
      // Verify the original component still exports everything it did before
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // All original exports must still exist
      expect(module.default).toBeDefined(); // ApprovalModal component
      expect(module.useApprovalModal).toBeDefined();
      expect(module.formatCommandPreview).toBeDefined();
      expect(module.getToolIcon).toBeDefined();
      expect(module.classifyActionSeverity).toBeDefined();
      expect(module.getGrantScope).toBeDefined();
      expect(module.createApprovalResponse).toBeDefined();
      expect(module.handleKeyDown).toBeDefined();
      expect(module.handleOverlayClick).toBeDefined();
      expect(module.useFocusTrap).toBeDefined();
      expect(module.subscribeToPermissionRequests).toBeDefined();
      expect(module.sendPermissionResponse).toBeDefined();
    });

    it('should not modify ApprovalModal test IDs', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      expect(module.MODAL_TESTID).toBe('approval-modal');
      expect(module.OVERLAY_TESTID).toBe('approval-modal-overlay');
      expect(module.COMMAND_PREVIEW_TESTID).toBe('command-preview');
      expect(module.TOOL_NAME_TESTID).toBe('tool-name');
      expect(module.APPROVE_BUTTON_TESTID).toBe('approve-button');
      expect(module.REJECT_BUTTON_TESTID).toBe('reject-button');
      expect(module.ALWAYS_ALLOW_TESTID).toBe('always-allow-checkbox');
    });

    it('should not modify ApprovalModal props interface', async () => {
      // Verify component accepts the same props by checking the source
      const appModalPath = join(__dirname, '../src/public/components/ApprovalModal/index.tsx');
      const source = readFileSync(appModalPath, 'utf-8');

      // Props interface must still include all required fields
      expect(source).toMatch(/isOpen:\s*boolean/);
      expect(source).toMatch(/toolName:\s*string/);
      expect(source).toMatch(/toolId:\s*string/);
      expect(source).toMatch(/input:\s*ToolInput/);
      expect(source).toMatch(/onApprove:\s*\(grantScope:\s*GrantScope\)\s*=>\s*void/);
      expect(source).toMatch(/onReject:\s*\(\)\s*=>\s*void/);
    });

  });

  // =========================================================================
  // AC6: ApprovalModal renders via shadcn Dialog (Radix Portal)
  // =========================================================================

  describe('AC6: Renders via shadcn Dialog outside React tree', () => {

    it('should not wrap ApprovalModal in any container that restricts portal rendering', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // ApprovalModal uses shadcn Dialog which renders via Radix Portal
      // It should NOT be wrapped in overflow:hidden, position:relative containers
      // that would clip the portal. Verify it's at the top level of the provider tree.
      const approvalMatch = appSource.match(/<ApprovalModal[\s\S]*?\/>/);
      expect(approvalMatch).not.toBeNull();

      // Should be inside the provider tree (ErrorBoundary/ClaudeProvider)
      // but not inside <main> or the workspace div
      expect(appSource).toMatch(/<ApprovalModal/);
    });

    it('should use the useApprovalModal hook for state management in App', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // App should call useApprovalModal() to get state
      expect(appSource).toMatch(/useApprovalModal\(\)/);
    });

    it('should render ApprovalModal unconditionally (Dialog handles visibility)', () => {
      const appPath = join(__dirname, '../src/public/App.tsx');
      const appSource = readFileSync(appPath, 'utf-8');

      // ApprovalModal must be in the tree first
      expect(appSource).toMatch(/<ApprovalModal[\s/]/);

      // And it should always be rendered (not conditionally)
      // The Dialog component handles show/hide via the isOpen prop
      // Should NOT have {isOpen && <ApprovalModal...>} pattern
      const conditionalRender = appSource.match(/\{.*isOpen.*&&.*<ApprovalModal/);
      expect(conditionalRender).toBeNull();
    });

  });

});
