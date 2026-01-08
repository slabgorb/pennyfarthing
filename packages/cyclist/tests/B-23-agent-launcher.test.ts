/**
 * B-23: Agent & Workflow Launcher Menu Tests
 *
 * These tests verify the Electron menu for launching Pennyfarthing agents
 * and workflows via menu items instead of typing slash commands.
 *
 * Acceptance Criteria:
 * - AC1: Menu provides access to all tactical agents (SM, TEA, Dev, Reviewer)
 * - AC2: Menu provides access to strategic agents (Architect, PM, Orchestrator)
 * - AC3: Workflows accessible (new-work, benchmarking)
 * - AC4: Launching inserts slash command into Editor
 * - AC5: Optional auto-submit after insertion
 * - AC6: Keyboard shortcuts for common agents (configurable)
 * - AC7: Menu state reflects current agent if active (deferred)
 */

import { describe, it, expect } from 'vitest';

describe('B-23: Agent & Workflow Launcher Menu', () => {

  describe('AC1: Tactical Agents in Menu', () => {

    it('should export AGENT_DEFINITIONS from main.ts', async () => {
      const main = await import('../src/main.js');
      expect(main.AGENT_DEFINITIONS).toBeDefined();
    });

    it('should include SM agent definition', async () => {
      const main = await import('../src/main.js');
      const sm = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'sm');
      expect(sm).toBeDefined();
      expect(sm.command).toBe('/sm');
      expect(sm.label).toContain('SM');
    });

    it('should include TEA agent definition', async () => {
      const main = await import('../src/main.js');
      const tea = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'tea');
      expect(tea).toBeDefined();
      expect(tea.command).toBe('/tea');
      expect(tea.label).toContain('TEA');
    });

    it('should include Dev agent definition', async () => {
      const main = await import('../src/main.js');
      const dev = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'dev');
      expect(dev).toBeDefined();
      expect(dev.command).toBe('/dev');
      expect(dev.label).toContain('Dev');
    });

    it('should include Reviewer agent definition', async () => {
      const main = await import('../src/main.js');
      const reviewer = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'reviewer');
      expect(reviewer).toBeDefined();
      expect(reviewer.command).toBe('/reviewer');
      expect(reviewer.label).toContain('Reviewer');
    });

    it('should categorize tactical agents correctly', async () => {
      const main = await import('../src/main.js');
      const tacticalAgents = main.AGENT_DEFINITIONS?.filter(
        (a: { category: string }) => a.category === 'tactical'
      );
      expect(tacticalAgents?.length).toBe(4);
    });

  });

  describe('AC2: Strategic Agents in Menu', () => {

    it('should include Architect agent definition', async () => {
      const main = await import('../src/main.js');
      const architect = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'architect');
      expect(architect).toBeDefined();
      expect(architect.command).toBe('/architect');
      expect(architect.label).toContain('Architect');
    });

    it('should include PM agent definition', async () => {
      const main = await import('../src/main.js');
      const pm = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'pm');
      expect(pm).toBeDefined();
      expect(pm.command).toBe('/pm');
      expect(pm.label).toContain('PM');
    });

    it('should include Orchestrator agent definition', async () => {
      const main = await import('../src/main.js');
      const orchestrator = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'orchestrator');
      expect(orchestrator).toBeDefined();
      expect(orchestrator.command).toBe('/orchestrator');
      expect(orchestrator.label).toContain('Orchestrator');
    });

    it('should categorize strategic agents correctly', async () => {
      const main = await import('../src/main.js');
      const strategicAgents = main.AGENT_DEFINITIONS?.filter(
        (a: { category: string }) => a.category === 'strategic'
      );
      expect(strategicAgents?.length).toBe(3);
    });

  });

  describe('AC3: Workflows in Menu', () => {

    it('should export WORKFLOW_DEFINITIONS from main.ts', async () => {
      const main = await import('../src/main.js');
      expect(main.WORKFLOW_DEFINITIONS).toBeDefined();
    });

    it('should include new-work workflow', async () => {
      const main = await import('../src/main.js');
      const newWork = main.WORKFLOW_DEFINITIONS?.find((w: { id: string }) => w.id === 'new-work');
      expect(newWork).toBeDefined();
      expect(newWork.command).toBe('/new-work');
    });

    it('should include work (resume) workflow', async () => {
      const main = await import('../src/main.js');
      const work = main.WORKFLOW_DEFINITIONS?.find((w: { id: string }) => w.id === 'work');
      expect(work).toBeDefined();
      expect(work.command).toBe('/work');
    });

    it('should include benchmark workflow', async () => {
      const main = await import('../src/main.js');
      const benchmark = main.WORKFLOW_DEFINITIONS?.find((w: { id: string }) => w.id === 'benchmark');
      expect(benchmark).toBeDefined();
      expect(benchmark.command).toBe('/benchmark');
    });

  });

  describe('AC4/AC5: IPC Channel for Agent Launch', () => {

    it('should export IPC_AGENT_CHANNELS from main.ts', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_AGENT_CHANNELS).toBeDefined();
    });

    it('should define agent:launch channel', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_AGENT_CHANNELS.AGENT_LAUNCH).toBe('agent:launch');
    });

    it('should expose agent API on electronAPI', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;
      expect(api.agent).toBeDefined();
    });

    it('should provide agent.onLaunch method for subscriptions', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;
      expect(typeof api.agent.onLaunch).toBe('function');
    });

  });

  describe('AC6: Keyboard Shortcuts', () => {

    it('should define accelerator for SM agent', async () => {
      const main = await import('../src/main.js');
      const sm = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'sm');
      expect(sm?.accelerator).toBeDefined();
      expect(sm?.accelerator).toMatch(/CmdOrCtrl\+Shift\+\w/);
    });

    it('should define accelerator for TEA agent', async () => {
      const main = await import('../src/main.js');
      const tea = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'tea');
      expect(tea?.accelerator).toBeDefined();
    });

    it('should define accelerator for Dev agent', async () => {
      const main = await import('../src/main.js');
      const dev = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'dev');
      expect(dev?.accelerator).toBeDefined();
    });

    it('should define accelerator for Reviewer agent', async () => {
      const main = await import('../src/main.js');
      const reviewer = main.AGENT_DEFINITIONS?.find((a: { id: string }) => a.id === 'reviewer');
      expect(reviewer?.accelerator).toBeDefined();
    });

    it('should define accelerator for new-work workflow', async () => {
      const main = await import('../src/main.js');
      const newWork = main.WORKFLOW_DEFINITIONS?.find((w: { id: string }) => w.id === 'new-work');
      expect(newWork?.accelerator).toBeDefined();
    });

    it('should define accelerator for work workflow', async () => {
      const main = await import('../src/main.js');
      const work = main.WORKFLOW_DEFINITIONS?.find((w: { id: string }) => w.id === 'work');
      expect(work?.accelerator).toBeDefined();
    });

    it('should have unique accelerators (no conflicts)', async () => {
      const main = await import('../src/main.js');
      const allDefinitions = [
        ...(main.AGENT_DEFINITIONS || []),
        ...(main.WORKFLOW_DEFINITIONS || []),
      ];
      const accelerators = allDefinitions
        .map((d: { accelerator?: string }) => d.accelerator)
        .filter(Boolean);
      const uniqueAccelerators = new Set(accelerators);
      expect(accelerators.length).toBe(uniqueAccelerators.size);
    });

  });

  describe('Integration: Menu Building', () => {

    it('should export buildAgentMenu function', async () => {
      const main = await import('../src/main.js');
      expect(main.buildAgentMenu).toBeDefined();
      expect(typeof main.buildAgentMenu).toBe('function');
    });

    it('should export buildWorkflowMenu function', async () => {
      const main = await import('../src/main.js');
      expect(main.buildWorkflowMenu).toBeDefined();
      expect(typeof main.buildWorkflowMenu).toBe('function');
    });

    it('buildAgentMenu should return menu with Agents label', async () => {
      const main = await import('../src/main.js');
      const menu = main.buildAgentMenu?.();
      expect(menu?.label).toBe('Agents');
    });

    it('buildAgentMenu should have submenu with tactical and strategic sections', async () => {
      const main = await import('../src/main.js');
      const menu = main.buildAgentMenu?.();
      expect(menu?.submenu).toBeDefined();
      expect(Array.isArray(menu?.submenu)).toBe(true);
      // Should have tactical agents, separator, strategic agents
      expect(menu?.submenu?.length).toBeGreaterThanOrEqual(8); // 4 tactical + sep + 3 strategic
    });

    it('buildWorkflowMenu should return menu with Workflows label', async () => {
      const main = await import('../src/main.js');
      const menu = main.buildWorkflowMenu?.();
      expect(menu?.label).toBe('Workflows');
    });

    it('buildWorkflowMenu should have submenu with workflow items', async () => {
      const main = await import('../src/main.js');
      const menu = main.buildWorkflowMenu?.();
      expect(menu?.submenu).toBeDefined();
      expect(Array.isArray(menu?.submenu)).toBe(true);
      expect(menu?.submenu?.length).toBeGreaterThanOrEqual(3); // new-work, work, benchmark
    });

  });

  describe('Integration: Agent Definition Structure', () => {

    it('each agent should have required fields', async () => {
      const main = await import('../src/main.js');
      const agents = main.AGENT_DEFINITIONS || [];

      for (const agent of agents) {
        expect(agent.id).toBeDefined();
        expect(typeof agent.id).toBe('string');
        expect(agent.label).toBeDefined();
        expect(typeof agent.label).toBe('string');
        expect(agent.command).toBeDefined();
        expect(agent.command).toMatch(/^\//); // starts with /
        expect(agent.category).toMatch(/^(tactical|strategic)$/);
      }
    });

    it('each workflow should have required fields', async () => {
      const main = await import('../src/main.js');
      const workflows = main.WORKFLOW_DEFINITIONS || [];

      for (const workflow of workflows) {
        expect(workflow.id).toBeDefined();
        expect(typeof workflow.id).toBe('string');
        expect(workflow.label).toBeDefined();
        expect(typeof workflow.label).toBe('string');
        expect(workflow.command).toBeDefined();
        expect(workflow.command).toMatch(/^\//); // starts with /
      }
    });

  });

});
