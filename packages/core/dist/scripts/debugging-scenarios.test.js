/**
 * Tests for Story 14-4: Create Debugging Challenge Scenarios
 *
 * These tests verify:
 * AC1: 10 scenarios in scenarios/debugging/
 * AC2: Each scenario has 4-8 baseline_issues with error_type tags
 * AC3: Mix of single-type and mixed-type scenarios
 * AC4: Difficulty calibrated (easy/medium/hard distribution)
 * AC5: All pass schema validation
 *
 * Run with: npm test
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
// Path to debugging scenarios directory
const SCENARIOS_DIR = resolve(import.meta.dirname, '../../scenarios/debugging');
// Valid error types from TRAIL taxonomy
const VALID_ERROR_TYPES = ['reasoning', 'planning', 'execution'];
// Valid difficulty levels
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme'];
// Expected difficulty distribution: 3 easy, 4 medium, 3 hard
const EXPECTED_DISTRIBUTION = {
    easy: 3,
    medium: 4,
    hard: 3,
};
let scenarios = new Map();
let scenarioFiles = [];
// ============================================================================
// Setup: Load all scenario files
// ============================================================================
before(async () => {
    try {
        const files = await readdir(SCENARIOS_DIR);
        scenarioFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
        for (const file of scenarioFiles) {
            const content = await readFile(join(SCENARIOS_DIR, file), 'utf-8');
            const scenario = parseYaml(content);
            scenarios.set(file, scenario);
        }
    }
    catch {
        // Directory doesn't exist yet - tests will fail appropriately
        scenarioFiles = [];
    }
});
// ============================================================================
// AC1: 10 scenarios in scenarios/debugging/
// ============================================================================
describe('AC1: 10 scenarios in scenarios/debugging/', () => {
    it('should have scenarios/debugging/ directory', async () => {
        const { stat } = await import('node:fs/promises');
        try {
            const stats = await stat(SCENARIOS_DIR);
            assert.ok(stats.isDirectory(), 'scenarios/debugging/ should be a directory');
        }
        catch {
            assert.fail('scenarios/debugging/ directory does not exist');
        }
    });
    it('should contain exactly 10 scenario files', () => {
        assert.strictEqual(scenarioFiles.length, 10, `Expected 10 scenario files, found ${scenarioFiles.length}: [${scenarioFiles.join(', ')}]`);
    });
    it('should have unique scenario IDs', () => {
        const ids = new Set();
        for (const [file, scenario] of scenarios) {
            assert.ok(scenario.id, `Scenario ${file} missing id field`);
            assert.ok(!ids.has(scenario.id), `Duplicate scenario ID: ${scenario.id}`);
            ids.add(scenario.id);
        }
    });
    it('should have unique scenario names', () => {
        const names = new Set();
        for (const [file, scenario] of scenarios) {
            assert.ok(scenario.name, `Scenario ${file} missing name field`);
            assert.ok(!names.has(scenario.name), `Duplicate scenario name: ${scenario.name}`);
            names.add(scenario.name);
        }
    });
});
// ============================================================================
// AC2: Each scenario has 4-8 baseline_issues with error_type tags
// ============================================================================
describe('AC2: Each scenario has 4-8 baseline_issues with error_type tags', () => {
    it('should have baseline_issues in each scenario', () => {
        for (const [file, scenario] of scenarios) {
            assert.ok(scenario.baseline_issues, `Scenario ${file} missing baseline_issues`);
        }
    });
    it('should have 4-8 total baseline_issues per scenario', () => {
        for (const [file, scenario] of scenarios) {
            const issues = scenario.baseline_issues || {};
            const totalIssues = (issues.critical?.length || 0) +
                (issues.high?.length || 0) +
                (issues.medium?.length || 0) +
                (issues.low?.length || 0);
            assert.ok(totalIssues >= 4 && totalIssues <= 8, `Scenario ${file} has ${totalIssues} issues, expected 4-8`);
        }
    });
    it('should have error_type on every baseline_issue', () => {
        for (const [file, scenario] of scenarios) {
            const issues = scenario.baseline_issues || {};
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || []),
            ];
            for (const issue of allIssues) {
                assert.ok(issue.error_type, `Issue ${issue.id} in ${file} missing error_type`);
                assert.ok(VALID_ERROR_TYPES.includes(issue.error_type), `Issue ${issue.id} in ${file} has invalid error_type: ${issue.error_type}`);
            }
        }
    });
    it('should have valid error_type enum values only', () => {
        for (const [file, scenario] of scenarios) {
            const issues = scenario.baseline_issues || {};
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || []),
            ];
            for (const issue of allIssues) {
                if (issue.error_type) {
                    assert.ok(VALID_ERROR_TYPES.includes(issue.error_type), `Invalid error_type "${issue.error_type}" in ${file}. Must be: ${VALID_ERROR_TYPES.join(', ')}`);
                }
            }
        }
    });
});
// ============================================================================
// AC3: Mix of single-type and mixed-type scenarios
// ============================================================================
describe('AC3: Mix of single-type and mixed-type scenarios', () => {
    it('should have at least 3 single-type scenarios (all issues same error_type)', () => {
        let singleTypeCount = 0;
        for (const [file, scenario] of scenarios) {
            const issues = scenario.baseline_issues || {};
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || []),
            ];
            const errorTypes = new Set(allIssues.map((i) => i.error_type).filter(Boolean));
            if (errorTypes.size === 1) {
                singleTypeCount++;
            }
        }
        assert.ok(singleTypeCount >= 3, `Expected at least 3 single-type scenarios, found ${singleTypeCount}`);
    });
    it('should have at least 3 mixed-type scenarios (multiple error_types)', () => {
        let mixedTypeCount = 0;
        for (const [file, scenario] of scenarios) {
            const issues = scenario.baseline_issues || {};
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || []),
            ];
            const errorTypes = new Set(allIssues.map((i) => i.error_type).filter(Boolean));
            if (errorTypes.size > 1) {
                mixedTypeCount++;
            }
        }
        assert.ok(mixedTypeCount >= 3, `Expected at least 3 mixed-type scenarios, found ${mixedTypeCount}`);
    });
    it('should cover all three error types across the scenario set', () => {
        const allErrorTypes = new Set();
        for (const [, scenario] of scenarios) {
            const issues = scenario.baseline_issues || {};
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || []),
            ];
            for (const issue of allIssues) {
                if (issue.error_type) {
                    allErrorTypes.add(issue.error_type);
                }
            }
        }
        for (const type of VALID_ERROR_TYPES) {
            assert.ok(allErrorTypes.has(type), `Error type "${type}" not represented in any scenario`);
        }
    });
});
// ============================================================================
// AC4: Difficulty calibrated (easy/medium/hard distribution)
// ============================================================================
describe('AC4: Difficulty calibrated (easy/medium/hard distribution)', () => {
    it('should have valid difficulty level on each scenario', () => {
        for (const [file, scenario] of scenarios) {
            assert.ok(scenario.difficulty, `Scenario ${file} missing difficulty field`);
            assert.ok(VALID_DIFFICULTIES.includes(scenario.difficulty), `Scenario ${file} has invalid difficulty: ${scenario.difficulty}`);
        }
    });
    it('should have 3 easy scenarios', () => {
        const easyCount = [...scenarios.values()].filter((s) => s.difficulty === 'easy').length;
        assert.strictEqual(easyCount, EXPECTED_DISTRIBUTION.easy, `Expected ${EXPECTED_DISTRIBUTION.easy} easy scenarios, found ${easyCount}`);
    });
    it('should have 4 medium scenarios', () => {
        const mediumCount = [...scenarios.values()].filter((s) => s.difficulty === 'medium').length;
        assert.strictEqual(mediumCount, EXPECTED_DISTRIBUTION.medium, `Expected ${EXPECTED_DISTRIBUTION.medium} medium scenarios, found ${mediumCount}`);
    });
    it('should have 3 hard scenarios', () => {
        const hardCount = [...scenarios.values()].filter((s) => s.difficulty === 'hard').length;
        assert.strictEqual(hardCount, EXPECTED_DISTRIBUTION.hard, `Expected ${EXPECTED_DISTRIBUTION.hard} hard scenarios, found ${hardCount}`);
    });
});
// ============================================================================
// AC5: All pass schema validation
// ============================================================================
describe('AC5: All pass schema validation', () => {
    it('should have required fields: name, title, category, difficulty, prompt', () => {
        const requiredFields = ['name', 'title', 'category', 'difficulty', 'prompt'];
        for (const [file, scenario] of scenarios) {
            for (const field of requiredFields) {
                assert.ok(scenario[field], `Scenario ${file} missing required field: ${field}`);
            }
        }
    });
    it('should have category set to "debugging"', () => {
        for (const [file, scenario] of scenarios) {
            assert.strictEqual(scenario.category, 'debugging', `Scenario ${file} should have category "debugging", got "${scenario.category}"`);
        }
    });
    it('should have code block with language, filename, and content', () => {
        for (const [file, scenario] of scenarios) {
            assert.ok(scenario.code, `Scenario ${file} missing code block`);
            assert.ok(scenario.code.language, `Scenario ${file} code missing language`);
            assert.ok(scenario.code.filename, `Scenario ${file} code missing filename`);
            assert.ok(scenario.code.content, `Scenario ${file} code missing content`);
        }
    });
    it('should have name in kebab-case format', () => {
        const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
        for (const [file, scenario] of scenarios) {
            assert.ok(kebabCaseRegex.test(scenario.name), `Scenario ${file} name "${scenario.name}" is not kebab-case`);
        }
    });
    it('should have baseline_issues with proper structure', () => {
        for (const [file, scenario] of scenarios) {
            const issues = scenario.baseline_issues || {};
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || []),
            ];
            for (const issue of allIssues) {
                assert.ok(issue.id, `Issue in ${file} missing id`);
                assert.ok(issue.location, `Issue ${issue.id} in ${file} missing location`);
                assert.ok(issue.description, `Issue ${issue.id} in ${file} missing description`);
            }
        }
    });
    it('should have scoring section', () => {
        for (const [file, scenario] of scenarios) {
            assert.ok(scenario.scoring, `Scenario ${file} missing scoring section`);
        }
    });
});
// ============================================================================
// Summary Statistics (informational)
// ============================================================================
describe('Summary Statistics', () => {
    it('should report scenario distribution', () => {
        if (scenarios.size === 0) {
            console.log('No scenarios loaded - directory may not exist yet');
            return;
        }
        const difficultyCount = { easy: 0, medium: 0, hard: 0, extreme: 0 };
        const errorTypeCount = { reasoning: 0, planning: 0, execution: 0 };
        let singleType = 0;
        let mixedType = 0;
        for (const [, scenario] of scenarios) {
            difficultyCount[scenario.difficulty]++;
            const issues = scenario.baseline_issues || {};
            const allIssues = [
                ...(issues.critical || []),
                ...(issues.high || []),
                ...(issues.medium || []),
                ...(issues.low || []),
            ];
            const types = new Set();
            for (const issue of allIssues) {
                if (issue.error_type) {
                    errorTypeCount[issue.error_type]++;
                    types.add(issue.error_type);
                }
            }
            if (types.size === 1)
                singleType++;
            else if (types.size > 1)
                mixedType++;
        }
        console.log('\n=== Scenario Distribution ===');
        console.log(`Total scenarios: ${scenarios.size}`);
        console.log(`Difficulty: easy=${difficultyCount.easy}, medium=${difficultyCount.medium}, hard=${difficultyCount.hard}`);
        console.log(`Error types: reasoning=${errorTypeCount.reasoning}, planning=${errorTypeCount.planning}, execution=${errorTypeCount.execution}`);
        console.log(`Single-type: ${singleType}, Mixed-type: ${mixedType}`);
        // This test always passes - it's informational
        assert.ok(true);
    });
});
//# sourceMappingURL=debugging-scenarios.test.js.map