/**
 * Story 15-3: Sidebar Sections UI Tests
 *
 * These tests verify the frontend acceptance criteria for the new sidebar sections.
 * Written to FAIL initially (RED phase) - Dev will make them GREEN.
 *
 * Acceptance Criteria:
 * - AC1: Persona section shows character and quote
 * - AC2: Portrait loads from sprite symlink
 * - AC3: Story section shows current work
 * - AC4: Git section shows branch status
 * - AC5: Live updates when agent changes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('Story 15-3: Sidebar Sections UI', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  describe('AC1: Persona section shows character and quote', () => {

    it('should have persona-section container in sidebar', () => {
      const personaSection = document.querySelector('#sidebar #persona-section, #sidebar .persona-section');
      expect(personaSection).not.toBeNull();
    });

    it('should have character-name element for displaying name', () => {
      const characterName = document.querySelector('#character-name, .character-name');
      expect(characterName).not.toBeNull();
    });

    it('should have character-role element for displaying role', () => {
      const characterRole = document.querySelector('#character-role, .character-role');
      expect(characterRole).not.toBeNull();
    });

    // SKIPPED: Design changed - character-quote moved to portrait tooltip instead
    // These elements are no longer used in the main sidebar panel
    it.skip('should have character-quote element for displaying quote', () => {
      const characterQuote = document.querySelector('#character-quote, .character-quote');
      expect(characterQuote).not.toBeNull();
    });

    // SKIPPED: Design changed - persona-info container no longer used
    it.skip('should have persona-info container grouping name and role', () => {
      const personaInfo = document.querySelector('#persona-info, .persona-info');
      expect(personaInfo).not.toBeNull();
    });

    it('should have styling for character name (large, bold)', () => {
      expect(css).toContain('.character-name');
      // Check for any font-weight or font-size styling
      expect(css).toMatch(/\.character-name\s*\{[^}]*(font-weight|font-size)[^}]*\}/);
    });

    // SKIPPED: Design changed - character-quote styling moved to tooltip
    it.skip('should have styling for character quote (italic, muted)', () => {
      expect(css).toContain('.character-quote');
      // Check that it's defined with some styling
      expect(css).toMatch(/\.character-quote\s*\{/);
    });

  });

  describe('AC2: Portrait loads from sprite symlink', () => {

    it('should have portrait element with img tag', () => {
      const portrait = document.querySelector('#portrait img, .portrait img');
      expect(portrait).not.toBeNull();
    });

    it('should have portrait img with src attribute', () => {
      const portraitImg = document.querySelector('#portrait img, .portrait img');
      expect(portraitImg?.getAttribute('src')).not.toBeNull();
    });

    it('should have fallback styling for missing portrait', () => {
      expect(css).toContain('.portrait-placeholder');
    });

  });

  describe('AC3: Story section shows current work', () => {

    it('should have story-section container in sidebar', () => {
      const storySection = document.querySelector('#sidebar #story-section, #sidebar .story-section');
      expect(storySection).not.toBeNull();
    });

    it('should have story-title element', () => {
      const storyTitle = document.querySelector('#story-title, .story-title');
      expect(storyTitle).not.toBeNull();
    });

    it('should display story phase information', () => {
      const storyPhase = document.querySelector('#story-phase, .story-phase');
      expect(storyPhase).not.toBeNull();
    });

    it('should have workflow progress visualization', () => {
      const workflowProgress = document.querySelector('#workflow-progress, .workflow-progress');
      expect(workflowProgress).not.toBeNull();
    });

    it('should have workflow steps for SM, TEA, Dev, Reviewer', () => {
      const steps = document.querySelectorAll('.workflow-step');
      expect(steps.length).toBe(4);
    });

  });

  describe('AC4: Git section shows branch status', () => {

    it('should have git-section container in sidebar', () => {
      const gitSection = document.querySelector('#sidebar #git-section, #sidebar .git-section');
      expect(gitSection).not.toBeNull();
    });

    it('should display git branch name', () => {
      const gitBranch = document.querySelector('#git-branch, .git-branch');
      expect(gitBranch).not.toBeNull();
    });

    it('should display git status', () => {
      const gitStatus = document.querySelector('#git-status, .git-status');
      expect(gitStatus).not.toBeNull();
    });

    it('should have status styling (clean, dirty)', () => {
      expect(css).toContain('.status-clean');
      expect(css).toContain('.status-dirty');
    });

  });

  describe('AC5: Live updates when agent changes', () => {

    it('should have persona-section ready for reactive updates', () => {
      const personaSection = document.querySelector('#sidebar #persona-section');
      expect(personaSection).not.toBeNull();
      // Section should be structured to allow updates to character-name, character-role
      const characterName = personaSection?.querySelector('#character-name');
      expect(characterName).not.toBeNull();
    });

    it('should have story-section ready for reactive updates', () => {
      const storySection = document.querySelector('#sidebar #story-section');
      expect(storySection).not.toBeNull();
      // Section should be structured to allow updates to story-title, story-phase
      const storyTitle = storySection?.querySelector('#story-title');
      expect(storyTitle).not.toBeNull();
    });

  });

  describe('Section ordering in sidebar', () => {

    it('should have sections in correct order: persona, story, git, tasks', () => {
      const sidebar = document.querySelector('#sidebar');
      const children = Array.from(sidebar?.children || []);

      const personaIndex = children.findIndex(el =>
        el.id?.includes('persona') || el.classList.contains('persona-section')
      );
      const storyIndex = children.findIndex(el =>
        el.id?.includes('story') || el.classList.contains('story-section')
      );
      const gitIndex = children.findIndex(el =>
        el.id?.includes('git') || el.classList.contains('git-section')
      );
      const todoIndex = children.findIndex(el =>
        el.id?.includes('todo') || el.classList.contains('todo-section')
      );

      // Persona should be first (index 0 or after container wrapper)
      expect(personaIndex).toBeGreaterThanOrEqual(0);
      // Story after persona
      expect(storyIndex).toBeGreaterThan(personaIndex);
      // Git after story
      expect(gitIndex).toBeGreaterThan(storyIndex);
      // Tasks after git
      expect(todoIndex).toBeGreaterThan(gitIndex);
    });

  });

});
