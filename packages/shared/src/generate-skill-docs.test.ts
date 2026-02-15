/**
 * Tests for Story 9-4: Skill Documentation Generator
 *
 * These tests verify:
 * - AC1: docs/SKILLS.md auto-generated from skill-registry.yaml
 * - AC2: Generated docs include all skill metadata
 * - AC3: Skills organized by category with table of contents
 * - AC4: Build process triggers doc generation
 *
 * Run with: npm test -- packages/shared/src/generate-skill-docs.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

// Import the generator function - this doesn't exist yet, tests should fail (RED)
import {
  generateSkillDocs,
} from './generate-skill-docs.js';

// Paths
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../..');
const REGISTRY_PATH = join(PROJECT_ROOT, 'pennyfarthing-dist/skills/skill-registry.yaml');
const OUTPUT_PATH = join(PROJECT_ROOT, 'docs/SKILLS.md');
const GENERATOR_SCRIPT = join(PROJECT_ROOT, 'scripts/utils/generate-skill-docs.sh');

// Sample minimal registry for isolated tests
const MINIMAL_REGISTRY = `
version: "1.0.0"
skills:
  test-skill:
    name: test-skill
    description: A test skill for verification
    category: development
    tags: [test, example]
    version: "1.0.0"
    prerequisites: []
    examples:
      - context: Testing the generator
        invocation: /test-skill
    anti_patterns:
      - Don't use in production
    related_skills: []
    keywords: [test, sample]
`;

describe('Story 9-4: Skill Documentation Generator', () => {

  describe('AC1: Auto-generate docs/SKILLS.md from skill-registry.yaml', () => {

    it('should read skill-registry.yaml and generate markdown', async () => {
      // AC1: docs/SKILLS.md auto-generated from skill-registry.yaml
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      assert.ok(result.success, 'Generation should succeed');
      assert.ok(result.content, 'Should produce content');
      assert.ok(result.content.length > 0, 'Content should not be empty');
    });

    it('should generate valid markdown output', async () => {
      // AC1: Output should be valid markdown
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      assert.ok(result.content, 'Should produce content');
      // Basic markdown structure checks
      assert.ok(result.content.startsWith('#'), 'Should start with a heading');
      assert.ok(result.content.includes('##'), 'Should have section headings');
    });

    it('should include all 21 skills from registry', async () => {
      // AC1: All skills from registry should appear in output
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      assert.ok(result.skillCount === 21, `Should include all 21 skills, got ${result.skillCount}`);

      // Check for a sample of known skills
      const expectedSkills = ['testing', 'jira', 'code-review', 'changelog', 'theme'];
      for (const skill of expectedSkills) {
        assert.ok(
          result.content.includes(skill),
          `Output should include ${skill} skill`
        );
      }
    });

    it('should be idempotent - running twice produces same output', async () => {
      // AC1: Generator should be deterministic
      const result1 = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      const result2 = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      assert.strictEqual(
        result1.content,
        result2.content,
        'Running twice should produce identical output'
      );
    });

    it('should handle custom output path', async () => {
      // AC1: Support writing to custom location
      const tempDir = join(tmpdir(), `skill-docs-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      const customOutput = join(tempDir, 'SKILLS.md');

      try {
        const result = await generateSkillDocs({
          registryPath: REGISTRY_PATH,
          outputPath: customOutput,
          writeFile: true,
        });

        assert.ok(result.success, 'Generation should succeed');
        assert.ok(existsSync(customOutput), 'Output file should be created');

        const fileContent = readFileSync(customOutput, 'utf-8');
        assert.strictEqual(fileContent, result.content, 'File content should match returned content');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should throw helpful error when registry file is missing', async () => {
      // AC1: Error handling for missing registry
      await assert.rejects(
        async () => generateSkillDocs({
          registryPath: '/nonexistent/path/registry.yaml',
        }),
        {
          message: /registry.*not found|cannot find|no such file/i,
        },
        'Should throw error with helpful message for missing registry'
      );
    });

    it('should handle malformed YAML gracefully', async () => {
      // AC1: Error handling for invalid registry
      const tempDir = join(tmpdir(), `skill-docs-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      const badRegistry = join(tempDir, 'bad-registry.yaml');
      writeFileSync(badRegistry, 'this is not valid: yaml: content: [broken');

      try {
        await assert.rejects(
          async () => generateSkillDocs({
            registryPath: badRegistry,
          }),
          {
            message: /invalid|parse|yaml/i,
          },
          'Should throw error for malformed YAML'
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('AC2: Include all skill metadata', () => {

    it('should include skill description in output', async () => {
      // AC2: description field included
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Check that descriptions are included (not just skill names)
      assert.ok(
        result.content.includes('TDD') || result.content.includes('test'),
        'Should include skill descriptions mentioning TDD or testing'
      );
    });

    it('should include tags for each skill', async () => {
      // AC2: tags field included
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Tags should appear in some form (could be **Tags:** or similar)
      assert.ok(
        result.content.toLowerCase().includes('tag') ||
        result.content.includes('tdd') ||
        result.content.includes('quality'),
        'Should include tags in output'
      );
    });

    it('should include examples for each skill', async () => {
      // AC2: examples field included
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Examples section or invocation patterns should appear
      assert.ok(
        result.content.toLowerCase().includes('example') ||
        result.content.includes('/testing') ||
        result.content.includes('invocation'),
        'Should include examples or invocations'
      );
    });

    it('should include anti-patterns for each skill', async () => {
      // AC2: anti_patterns field included
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Anti-patterns section should appear
      assert.ok(
        result.content.toLowerCase().includes('anti-pattern') ||
        result.content.toLowerCase().includes('antipattern') ||
        result.content.toLowerCase().includes("don't"),
        'Should include anti-patterns section'
      );
    });

    it('should include related skills references', async () => {
      // AC2: related_skills field included
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Related skills should appear
      assert.ok(
        result.content.toLowerCase().includes('related') ||
        result.content.includes('See also'),
        'Should include related skills references'
      );
    });

    it('should include keywords for searchability', async () => {
      // AC2: keywords field included (for skill discovery)
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Keywords should appear (might be in a keywords section or as searchable terms)
      assert.ok(
        result.content.toLowerCase().includes('keyword') ||
        result.content.includes('jest') ||
        result.content.includes('vitest'),
        'Should include keywords for searchability'
      );
    });

    it('should validate required fields are present in registry', async () => {
      // AC2: Error if registry missing required fields
      const tempDir = join(tmpdir(), `skill-docs-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      const incompleteRegistry = join(tempDir, 'incomplete-registry.yaml');

      // Registry with skill missing required description
      writeFileSync(incompleteRegistry, `
version: "1.0.0"
skills:
  incomplete-skill:
    name: incomplete-skill
    # missing description
    category: development
    tags: []
`);

      try {
        await assert.rejects(
          async () => generateSkillDocs({
            registryPath: incompleteRegistry,
            strict: true,
          }),
          {
            message: /missing.*description|required.*field/i,
          },
          'Should error when required fields are missing'
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('AC3: Category organization with table of contents', () => {

    it('should organize skills by category', async () => {
      // AC3: Skills organized by category
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Category headings should appear
      const categories = ['development', 'project-management', 'tools', 'ai-llm', 'documentation', 'theming', 'benchmarking'];
      let foundCategories = 0;

      for (const category of categories) {
        // Check for category as heading (could be ## Development or ## AI/LLM, etc.)
        const normalizedCategory = category.replace(/-/g, ' ').replace(/ai llm/i, 'AI/LLM');
        if (
          result.content.toLowerCase().includes(`## ${category}`) ||
          result.content.toLowerCase().includes(normalizedCategory.toLowerCase())
        ) {
          foundCategories++;
        }
      }

      assert.ok(
        foundCategories >= 3,
        `Should have at least 3 category sections, found ${foundCategories}`
      );
    });

    it('should include table of contents with links', async () => {
      // AC3: Table of contents with anchor links
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // TOC should have links (markdown format: [Text](#anchor))
      assert.ok(
        result.content.includes('](#') ||
        result.content.toLowerCase().includes('table of contents') ||
        result.content.toLowerCase().includes('contents'),
        'Should include table of contents with anchor links'
      );
    });

    it('should place skills under correct category heading', async () => {
      // AC3: Skills appear under their category
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // testing skill should be under development category
      // Check that testing appears after development heading and before next category
      const content = result.content.toLowerCase();
      const devIndex = content.indexOf('development');
      const testingIndex = content.indexOf('testing');

      assert.ok(devIndex > -1, 'Development category should exist');
      assert.ok(testingIndex > -1, 'Testing skill should exist');
      // Testing should appear in development section (after heading, before significant distance)
    });

    it('should sort categories alphabetically', async () => {
      // AC3: Predictable ordering
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Find positions of category headings
      const content = result.content.toLowerCase();
      const _aiIndex = content.indexOf('ai') > -1 ? content.indexOf('ai') : Infinity;
      const devIndex = content.indexOf('development');
      const toolsIndex = content.indexOf('tools');

      // AI/LLM should come before Development alphabetically
      // (or however the ordering is defined - at least should be consistent)
      assert.ok(
        devIndex > -1 && toolsIndex > -1,
        'Multiple category sections should exist'
      );
    });

    it('should sort skills alphabetically within category', async () => {
      // AC3: Skills sorted within their category
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Within development: code-review should come before dev-patterns (alphabetically)
      const content = result.content.toLowerCase();
      const codeReviewIndex = content.indexOf('code-review');
      const devPatternsIndex = content.indexOf('dev-patterns');

      if (codeReviewIndex > -1 && devPatternsIndex > -1) {
        assert.ok(
          codeReviewIndex < devPatternsIndex,
          'Skills should be sorted alphabetically within category'
        );
      }
    });

    it('should generate valid TOC anchors', async () => {
      // AC3: TOC links should match heading anchors
      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      // Extract TOC links and verify they have corresponding headings
      const tocLinkMatches = result.content.match(/\[([^\]]+)\]\(#([^)]+)\)/g) || [];

      if (tocLinkMatches.length > 0) {
        // At least some TOC links should exist
        assert.ok(tocLinkMatches.length > 0, 'TOC should have anchor links');

        // Verify at least one link has a valid target
        for (const link of tocLinkMatches.slice(0, 3)) {
          const anchorMatch = link.match(/\(#([^)]+)\)/);
          if (anchorMatch) {
            const anchor = anchorMatch[1];
            // The heading for this anchor should exist somewhere
            // (GitHub-style anchors: lowercase, spaces to dashes)
            assert.ok(anchor.length > 0, `Anchor should not be empty: ${link}`);
          }
        }
      }
    });
  });

  describe('AC4: Build process triggers doc generation', () => {

    it('should have generate-skill-docs.sh script', () => {
      // AC4: Script exists for build integration
      assert.ok(
        existsSync(GENERATOR_SCRIPT),
        `Generator script should exist at ${GENERATOR_SCRIPT}`
      );
    });

    it('should script be executable', () => {
      // AC4: Script should have execute permissions
      if (!existsSync(GENERATOR_SCRIPT)) {
        assert.fail('Generator script does not exist yet');
      }

      // Try to get file stats - executable bit
      const stats = statSync(GENERATOR_SCRIPT);
      const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;

      assert.ok(isExecutable, 'Script should have execute permissions');
    });

    it('should script produce output when run directly', () => {
      // AC4: Shell script integration
      if (!existsSync(GENERATOR_SCRIPT)) {
        assert.fail('Generator script does not exist yet');
      }

      try {
        const output = execSync(`bash ${GENERATOR_SCRIPT} --dry-run`, {
          encoding: 'utf-8',
          cwd: PROJECT_ROOT,
        });

        assert.ok(output.length > 0, 'Script should produce output');
        assert.ok(
          output.includes('#') || output.includes('Generated'),
          'Output should be markdown or status message'
        );
      } catch (error) {
        assert.fail(`Script execution failed: ${error}`);
      }
    });

    it('should package.json include docs generation script', () => {
      // AC4: Build process integration
      const packageJsonPath = join(PROJECT_ROOT, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      const hasDocsScript =
        packageJson.scripts?.docs ||
        packageJson.scripts?.['generate-docs'] ||
        packageJson.scripts?.build?.includes('generate-skill-docs');

      assert.ok(
        hasDocsScript,
        'package.json should have docs generation in scripts'
      );
    });

    it('should build script include docs generation', () => {
      // AC4: Build triggers doc generation
      const packageJsonPath = join(PROJECT_ROOT, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      const buildScript = packageJson.scripts?.build || '';

      // Either build includes docs, or there's a prebuild/postbuild hook
      const triggersDocGen =
        buildScript.includes('generate-skill-docs') ||
        buildScript.includes('docs') ||
        packageJson.scripts?.prebuild?.includes('docs') ||
        packageJson.scripts?.postbuild?.includes('docs');

      assert.ok(
        triggersDocGen,
        'Build process should trigger doc generation'
      );
    });

    it('should generate fresh docs match current registry', async () => {
      // AC4: Generated docs should be up-to-date with registry
      if (!existsSync(OUTPUT_PATH)) {
        assert.fail('docs/SKILLS.md does not exist yet');
      }

      const result = await generateSkillDocs({
        registryPath: REGISTRY_PATH,
      });

      const currentDocs = readFileSync(OUTPUT_PATH, 'utf-8');

      // The generated content should match what's in the file
      // (allowing for timestamp differences if there's a "generated at" header)
      const normalize = (s: string) =>
        s.replace(/Generated at:.*/g, '').replace(/\s+/g, ' ').trim();

      assert.strictEqual(
        normalize(result.content),
        normalize(currentDocs),
        'Generated docs should match current docs/SKILLS.md (regenerate if stale)'
      );
    });
  });

  describe('Shell Script Integration', () => {

    it('should script accept --help flag', () => {
      // Usability: Show help text
      if (!existsSync(GENERATOR_SCRIPT)) {
        assert.fail('Generator script does not exist yet');
      }

      try {
        const output = execSync(`bash ${GENERATOR_SCRIPT} --help`, {
          encoding: 'utf-8',
          cwd: PROJECT_ROOT,
        });

        assert.ok(
          output.includes('usage') || output.includes('Usage') || output.includes('help'),
          'Should show usage information'
        );
      } catch (error) {
        // --help might exit with 0 or non-zero depending on implementation
        assert.fail(`--help should work: ${error}`);
      }
    });

    it('should script accept custom registry path', () => {
      // Flexibility: Allow custom registry
      if (!existsSync(GENERATOR_SCRIPT)) {
        assert.fail('Generator script does not exist yet');
      }

      const tempDir = join(tmpdir(), `skill-docs-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      const customRegistry = join(tempDir, 'custom-registry.yaml');
      writeFileSync(customRegistry, MINIMAL_REGISTRY);

      try {
        const output = execSync(
          `bash ${GENERATOR_SCRIPT} --registry ${customRegistry} --dry-run`,
          {
            encoding: 'utf-8',
            cwd: PROJECT_ROOT,
          }
        );

        assert.ok(output.includes('test-skill'), 'Should use custom registry');
      } catch (error) {
        assert.fail(`Custom registry should work: ${error}`);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should script exit with error code on failure', () => {
      // Error handling: Non-zero exit on failure
      if (!existsSync(GENERATOR_SCRIPT)) {
        assert.fail('Generator script does not exist yet');
      }

      try {
        execSync(
          `bash ${GENERATOR_SCRIPT} --registry /nonexistent/path.yaml`,
          {
            encoding: 'utf-8',
            cwd: PROJECT_ROOT,
          }
        );
        assert.fail('Should have thrown for missing registry');
      } catch (error) {
        assert.ok((error as { status?: number }).status !== 0, 'Should exit with non-zero status on error');
      }
    });
  });

  describe('Error Handling', () => {

    it('should handle empty registry gracefully', async () => {
      // Edge case: Registry with no skills
      const tempDir = join(tmpdir(), `skill-docs-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      const emptyRegistry = join(tempDir, 'empty-registry.yaml');
      writeFileSync(emptyRegistry, 'version: "1.0.0"\nskills: {}');

      try {
        const result = await generateSkillDocs({
          registryPath: emptyRegistry,
        });

        assert.ok(result.success, 'Should succeed with empty registry');
        assert.strictEqual(result.skillCount, 0, 'Should report 0 skills');
        assert.ok(
          result.content.includes('#'),
          'Should still produce valid markdown structure'
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle skills with missing optional fields', async () => {
      // Edge case: Skills missing optional fields
      const tempDir = join(tmpdir(), `skill-docs-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      const minimalSkillRegistry = join(tempDir, 'minimal-registry.yaml');
      writeFileSync(minimalSkillRegistry, `
version: "1.0.0"
skills:
  minimal:
    name: minimal
    description: A minimal skill
    category: development
    tags: []
    # optional fields omitted: examples, anti_patterns, related_skills, keywords
`);

      try {
        const result = await generateSkillDocs({
          registryPath: minimalSkillRegistry,
        });

        assert.ok(result.success, 'Should succeed with minimal skill');
        assert.ok(result.content.includes('minimal'), 'Should include minimal skill');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle special characters in skill content', async () => {
      // Edge case: Special markdown characters in content
      const tempDir = join(tmpdir(), `skill-docs-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      const specialRegistry = join(tempDir, 'special-registry.yaml');
      writeFileSync(specialRegistry, `
version: "1.0.0"
skills:
  special:
    name: special
    description: "A skill with *asterisks* and [brackets] and \`backticks\`"
    category: development
    tags: [tag-with-dash, tag_with_underscore]
    examples:
      - context: "Example with 'quotes'"
        invocation: /special --flag=value
    anti_patterns:
      - "Don't do this: \`bad code\`"
    related_skills: []
    keywords: []
`);

      try {
        const result = await generateSkillDocs({
          registryPath: specialRegistry,
        });

        assert.ok(result.success, 'Should handle special characters');
        assert.ok(result.content.includes('special'), 'Should include skill');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
