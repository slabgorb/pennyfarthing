# Test Scripts

Scripts for test infrastructure and benchmarking.

## Test-result caching

Caching moved into the Python package (SOUL #9, #11). The `testing-runner`
subagent writes each run's summary to an isolated, RUN_ID-keyed file — never
the live workflow session file (gh #53):

```bash
# pf.* modules live in the pf CLI's OWN venv (uv-tool install), NOT the project
# .venv - derive the interpreter from the launcher shebang.
PF_PY="$(sed -n '1s/^#!//p' "$(command -v pf)")"
printf '%s\n' "$RESULT_SUMMARY" | "${PF_PY:?PF_PY not set - could not resolve the pf launcher interpreter}" -m pf.session.test_cache "$RUN_ID"
# → .session/test-runs/${RUN_ID}.md
```

See `pf.session.test_cache` (`test_run_cache_path`, `is_live_session_file`,
`write_test_run_cache`).

> **Note:** the legacy bash helpers (`test-setup.sh`, `test-cache.sh`) and the
> judge scripts that this directory once documented are no longer shipped here.
> Test execution is `pf check` / `scripts/workflow/check.py`.

## Ownership

- **Primary users:** TEA agent, testing-runner subagent
- **Maintained by:** Core Pennyfarthing team
