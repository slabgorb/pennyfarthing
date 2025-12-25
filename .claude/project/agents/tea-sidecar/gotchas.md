# TEA Agent Gotchas

> Pennyfarthing-specific testing pitfalls

## Handoff Gotchas

### Tests Not Actually Failing
**Problem:** Claiming RED state but tests pass (or don't run)
**Verification:**
```bash
go test ./... 2>&1 | grep -q "FAIL"
npm test 2>&1 | grep -q "failed"
```

### Tests Fail for Wrong Reason
**Problem:** Tests fail due to syntax errors, not missing implementation
**Solution:** Verify tests compile and fail on assertions

## Container Issues

### Container Not Running
**Problem:** Integration tests fail because test DB not started
```bash
docker ps | grep -q "$TEST_CONTAINER" || just test-api-setup
```

## Symlink Gotchas

### Git Add Beyond Symlink
**Problem:** `git add scripts/utils/file.sh` fails with "pathspec beyond symbolic link"
**Cause:** `.claude/` and `scripts/` directories contain symlinks to `pennyfarthing-dist/`
**Solution:** Add files from the actual source directory:
```bash
# Wrong - fails
git add scripts/utils/validate-subagent-frontmatter.sh

# Right - works
git add pennyfarthing-dist/scripts/utils/validate-subagent-frontmatter.sh
```
**Rule:** Always commit to `pennyfarthing-dist/` - symlinks in project root are for convenience only.

---

*Add testing gotchas discovered during test development below*
