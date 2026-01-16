#!/usr/bin/env node
/**
 * generic-handoff-cli.js - CLI wrapper for generic-handoff.ts functions
 *
 * Story 31-10: Provides CLI interface for workflow handoff operations
 *
 * Commands:
 *   check-gate     Check if gate conditions are satisfied
 *   next-phase     Determine next phase (supports rejection)
 *   format-transition  Format session file update markdown
 *
 * Usage:
 *   node generic-handoff-cli.js check-gate --workflow tdd --phase green --tests-green
 *   node generic-handoff-cli.js next-phase --workflow tdd --phase review --verdict rejected
 *   node generic-handoff-cli.js format-transition --workflow tdd --from red --to green
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Import from compiled packages/core
const __dirname = dirname(fileURLToPath(import.meta.url));
const coreDistPath = join(__dirname, '..', 'packages', 'core', 'dist', 'workflow');

const { findCurrentPhase, getNextPhase, checkGate, formatPhaseTransition, calculateDuration } =
  await import(join(coreDistPath, 'generic-handoff.js'));

// Load workflow from YAML using yq (already installed system-wide)
function loadWorkflow(workflowName) {
  const workflowPaths = [
    join(__dirname, '..', 'pennyfarthing-dist', 'workflows', `${workflowName}.yaml`),
    join(__dirname, '..', '.claude', 'workflows', `${workflowName}.yaml`)
  ];

  for (const path of workflowPaths) {
    if (existsSync(path)) {
      try {
        // Use yq to parse entire workflow object as JSON
        const json = execSync(`yq -o json '.workflow // .' "${path}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return JSON.parse(json);
      } catch (e) {
        console.error(`Failed to parse ${path}: ${e.message}`);
        process.exit(1);
      }
    }
  }

  console.error(`Workflow not found: ${workflowName}`);
  process.exit(1);
}

// Parse command line arguments
function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

// Commands
const commands = {
  'check-gate': (opts) => {
    const workflow = loadWorkflow(opts.workflow);
    const context = {
      testsRed: opts.testsRed === true || opts.testsRed === 'true',
      testsGreen: opts.testsGreen === true || opts.testsGreen === 'true',
      testPassCount: opts.testPassCount ? parseInt(opts.testPassCount) : undefined,
      testFailCount: opts.testFailCount ? parseInt(opts.testFailCount) : undefined,
      verdict: opts.verdict
    };

    const result = checkGate(workflow, opts.phase, context);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  },

  'next-phase': (opts) => {
    const workflow = loadWorkflow(opts.workflow);
    const options = opts.verdict ? { verdict: opts.verdict } : undefined;

    const nextPhase = getNextPhase(workflow, opts.phase, options);
    if (nextPhase) {
      console.log(JSON.stringify({
        name: nextPhase.name,
        agent: nextPhase.agent,
        gate: nextPhase.gate?.type || null
      }, null, 2));
    } else {
      console.log(JSON.stringify({ name: null, agent: null, gate: null }));
    }
  },

  'format-transition': (opts) => {
    const params = {
      workflowName: opts.workflow,
      fromPhase: opts.from,
      toPhase: opts.to,
      startedAt: opts.startedAt || new Date().toISOString(),
      endedAt: opts.endedAt || new Date().toISOString(),
      isRejection: opts.rejection === true || opts.rejection === 'true'
    };

    const markdown = formatPhaseTransition(params);
    console.log(markdown);
  },

  'find-phase': (opts) => {
    const workflow = loadWorkflow(opts.workflow);
    const phase = findCurrentPhase(workflow, opts.phase);
    if (phase) {
      console.log(JSON.stringify({
        name: phase.name,
        agent: phase.agent,
        gate: phase.gate?.type || null,
        input: phase.input || [],
        output: phase.output || []
      }, null, 2));
    } else {
      console.log(JSON.stringify(null));
      process.exit(1);
    }
  },

  'calculate-duration': (opts) => {
    const duration = calculateDuration(opts.startedAt, opts.endedAt);
    console.log(duration);
  }
};

// Main
const args = process.argv.slice(2);
const command = args[0];
const opts = parseArgs(args.slice(1));

if (!command || !commands[command]) {
  console.error(`Usage: generic-handoff-cli.js <command> [options]

Commands:
  check-gate         Check if gate conditions are satisfied
    --workflow       Workflow name (e.g., tdd, trivial)
    --phase          Current phase name
    --tests-red      Tests are failing (for tests_fail gate)
    --tests-green    Tests are passing (for tests_pass gate)
    --verdict        Verdict (approved/rejected, for approval gate)

  next-phase         Determine next phase
    --workflow       Workflow name
    --phase          Current phase name
    --verdict        For rejection: "rejected" to find loop-back phase

  find-phase         Find phase details
    --workflow       Workflow name
    --phase          Phase name to find

  format-transition  Format session file update
    --workflow       Workflow name
    --from           From phase name
    --to             To phase name
    --started-at     ISO timestamp when phase started
    --ended-at       ISO timestamp when phase ended
    --rejection      Is this a rejection loop-back

  calculate-duration Calculate duration between timestamps
    --started-at     Start timestamp
    --ended-at       End timestamp
`);
  process.exit(1);
}

commands[command](opts);
