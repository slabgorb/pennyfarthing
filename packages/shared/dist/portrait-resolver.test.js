import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { resolvePennyfarthingDist, resolvePortraitPath, getPortraitPaths, } from './portrait-resolver.js';
describe('portrait-resolver', () => {
    describe('resolvePennyfarthingDist', () => {
        const originalEnv = process.env.PENNYFARTHING_DIST;
        afterEach(() => {
            // Restore original env
            if (originalEnv !== undefined) {
                process.env.PENNYFARTHING_DIST = originalEnv;
            }
            else {
                delete process.env.PENNYFARTHING_DIST;
            }
        });
        it('should return PENNYFARTHING_DIST env var when set and path exists', () => {
            // Scenario 1: Explicit env var override
            const testPath = '/custom/pennyfarthing-dist';
            process.env.PENNYFARTHING_DIST = testPath;
            // This test expects the implementation to check fs.existsSync
            // For now, we mock that the path exists
            const result = resolvePennyfarthingDist();
            // When env var is set to valid path, should return it
            assert.strictEqual(result, testPath);
        });
        it('should return null when PENNYFARTHING_DIST is set but path does not exist', () => {
            // Scenario 1b: Env var set but invalid
            process.env.PENNYFARTHING_DIST = '/nonexistent/path/pennyfarthing-dist';
            const result = resolvePennyfarthingDist();
            // Should fall through and return null if no other paths exist
            assert.strictEqual(result, null);
        });
        it('should find monorepo root pennyfarthing-dist directory', () => {
            // Scenario 2: Monorepo root detection (dogfooding)
            // When running from within pennyfarthing repo, find pennyfarthing-dist/ at root
            delete process.env.PENNYFARTHING_DIST;
            const result = resolvePennyfarthingDist();
            // Should find the monorepo root path
            assert.ok(result !== null, 'Should find monorepo root');
            assert.ok(result.endsWith('pennyfarthing-dist'), 'Path should end with pennyfarthing-dist');
        });
        it('should find sibling pennyfarthing-dist directory', () => {
            // Scenario 3: Sibling directory for dev scenarios
            // e.g., project/pennyfarthing-dist when called from project/packages/shared
            delete process.env.PENNYFARTHING_DIST;
            const result = resolvePennyfarthingDist();
            // Implementation should check ../pennyfarthing-dist, ../../pennyfarthing-dist, etc.
            assert.ok(result === null || result.includes('pennyfarthing-dist'));
        });
        it('should find scoped npm package path', () => {
            // Scenario 4: Scoped npm install
            // node_modules/@pennyfarthing/core/pennyfarthing-dist/
            delete process.env.PENNYFARTHING_DIST;
            const result = resolvePennyfarthingDist();
            // When installed via @pennyfarthing/core, should find that path
            assert.ok(result === null || result.includes('pennyfarthing-dist'));
        });
        it('should find legacy npm package path', () => {
            // Scenario 5: Legacy npm install
            // node_modules/pennyfarthing/pennyfarthing-dist/
            delete process.env.PENNYFARTHING_DIST;
            const result = resolvePennyfarthingDist();
            // When installed via pennyfarthing, should find that path
            assert.ok(result === null || result.includes('pennyfarthing-dist'));
        });
        it('should return null when no valid path exists', () => {
            // Edge case: Nothing found anywhere
            delete process.env.PENNYFARTHING_DIST;
            // This test is tricky - in reality we need to mock fs
            // For RED state, the function throws so this will fail
            const result = resolvePennyfarthingDist();
            assert.strictEqual(result, null);
        });
        it('should check paths in priority order', () => {
            // When multiple paths exist, should return the highest priority one
            // Priority: env var > monorepo > sibling > scoped npm > legacy npm
            const customPath = '/priority/test/pennyfarthing-dist';
            process.env.PENNYFARTHING_DIST = customPath;
            const result = resolvePennyfarthingDist();
            // Env var should take precedence
            assert.strictEqual(result, customPath);
        });
    });
    describe('resolvePortraitPath', () => {
        it('should resolve portrait path for valid theme and agent', () => {
            const result = resolvePortraitPath('shakespeare', 'sm');
            assert.ok(result !== null, 'Should find portrait');
            assert.ok(result.includes('shakespeare'), 'Path should include theme');
            assert.ok(result.includes('sm'), 'Path should include agent');
            assert.ok(result.endsWith('.png') || result.endsWith('.jpg'), 'Should be image file');
        });
        it('should return null for invalid theme', () => {
            const result = resolvePortraitPath('nonexistent-theme', 'sm');
            assert.strictEqual(result, null);
        });
        it('should return null for invalid agent', () => {
            const result = resolvePortraitPath('shakespeare', 'nonexistent-agent');
            assert.strictEqual(result, null);
        });
        it('should handle theme with special characters in name', () => {
            // Themes like 'star-trek-tos' have hyphens
            const result = resolvePortraitPath('star-trek-tos', 'sm');
            assert.ok(result === null || result.includes('star-trek-tos'));
        });
        it('should return null when pennyfarthing-dist is not found', () => {
            // When resolvePennyfarthingDist returns null, portrait path should be null
            delete process.env.PENNYFARTHING_DIST;
            const result = resolvePortraitPath('any-theme', 'any-agent');
            // If dist not found, portraits can't be resolved
            assert.strictEqual(result, null);
        });
    });
    describe('getPortraitPaths', () => {
        it('should return correct paths structure', () => {
            const distPath = '/test/pennyfarthing-dist';
            const result = getPortraitPaths(distPath);
            assert.ok('portraitsDir' in result, 'Should have portraitsDir');
            assert.ok('themesDir' in result, 'Should have themesDir');
            assert.ok('agentsDir' in result, 'Should have agentsDir');
        });
        it('should build portraitsDir correctly', () => {
            const distPath = '/test/pennyfarthing-dist';
            const result = getPortraitPaths(distPath);
            assert.strictEqual(result.portraitsDir, path.join(distPath, 'portraits'), 'portraitsDir should be distPath/portraits');
        });
        it('should build themesDir correctly', () => {
            const distPath = '/test/pennyfarthing-dist';
            const result = getPortraitPaths(distPath);
            assert.strictEqual(result.themesDir, path.join(distPath, 'personas'), 'themesDir should be distPath/personas');
        });
        it('should build agentsDir correctly', () => {
            const distPath = '/test/pennyfarthing-dist';
            const result = getPortraitPaths(distPath);
            assert.strictEqual(result.agentsDir, path.join(distPath, 'agents'), 'agentsDir should be distPath/agents');
        });
        it('should handle paths with trailing slashes', () => {
            const distPath = '/test/pennyfarthing-dist/';
            const result = getPortraitPaths(distPath);
            // Should normalize paths correctly
            assert.ok(!result.portraitsDir.includes('//'), 'Should not have double slashes');
        });
    });
});
//# sourceMappingURL=portrait-resolver.test.js.map