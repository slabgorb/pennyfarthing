<gate name="tests-fail" model="haiku">

<purpose>
Verify tests are RED — failing tests exist that cover the acceptance
criteria. TEA has written tests but implementation hasn't started.
This gate runs after the TEA agent's red phase to confirm the codebase
has proper test coverage before Dev begins implementation.
</purpose>

<pass>
Run these checks and report results:

1. **Failing tests exist:** Run the project test suite for the repos listed in the session file.
   - For `pennyfarthing` repo: `cd pennyfarthing && python3 -m pytest` or `pnpm test`
   - Record: total tests, passed, failed, skipped
   - At least one test MUST be failing (RED state)

2. **Tests cover acceptance criteria:** Read the session file's Acceptance Criteria section.
   - Cross-reference test names/descriptions against each AC
   - Each AC should have at least one corresponding test

3. **Tests are committed:** Run `git status --porcelain` to check for uncommitted test files.
   - All test files should be committed to the branch
   - No uncommitted test files should exist

If ALL checks pass, return:

```yaml
GATE_RESULT:
  status: pass
  gate: tests-fail
  message: "{N} failing tests covering {M} acceptance criteria. Tests committed."
  checks:
    - name: failing-tests
      status: pass
      detail: "{failed}/{total} tests failing (RED state confirmed)"
    - name: ac-coverage
      status: pass
      detail: "All {M} acceptance criteria have test coverage"
    - name: tests-committed
      status: pass
      detail: "All test files committed to branch"
```
</pass>

<fail>
If ANY check fails, diagnose and report:

1. **No failing tests found:** TEA didn't write tests or tests are already passing.
   - This means implementation may have leaked into the red phase
   - Or tests are not properly asserting against unimplemented code

2. **Tests don't cover ACs:** Some acceptance criteria lack test coverage.
   - List which ACs are missing tests
   - TEA needs to add additional test cases

3. **Tests aren't committed:** Uncommitted test files exist.
   - List uncommitted test files
   - TEA needs to commit before handoff

Return with actionable recovery guidance:

```yaml
GATE_RESULT:
  status: fail
  gate: tests-fail
  message: "Gate failed: {summary of what's missing}"
  checks:
    - name: failing-tests
      status: pass | fail
      detail: "{description of test state}"
    - name: ac-coverage
      status: pass | fail
      detail: "{list of uncovered ACs}"
    - name: tests-committed
      status: pass | fail
      detail: "{list of uncommitted files}"
  recovery:
    - "Write failing tests for: {uncovered ACs}"
    - "Commit test files: git add {files} && git commit"
```
</fail>

</gate>
