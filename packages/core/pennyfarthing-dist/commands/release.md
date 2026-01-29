---
description: Merge develop to main and push (optional version bump)
---

```bash
./scripts/run.sh git/release.sh "$@"
```

<purpose>
Release current develop branch to main and push to origin.
</purpose>

<usage>
```bash
# Just merge and push (no version change)
/release

# With version bump
/release --bump patch    # 1.5.0 -> 1.5.1
/release --bump minor    # 1.5.0 -> 1.6.0
/release --bump major    # 1.5.0 -> 2.0.0

# Preview what would happen
/release --dry-run
/release --bump patch --dry-run
```
</usage>

<workflow>
1. Pre-flight checks (clean working directory, branches exist)
2. Pull latest develop and main
3. Merge develop into main (fast-forward when possible)
4. Push main to origin
5. Push develop to origin
6. Push any tags

If `--bump` specified, delegates to `deploy.sh` which also:
- Bumps VERSION file
- Commits version change
- Creates annotated git tag
- Creates GitHub release from the tag (requires `gh` CLI)
</workflow>

<when-to-use>
- After completing a sprint or set of features
- When develop is stable and ready for production
- Before deploying to production environments
</when-to-use>

<prerequisites>
- Clean working directory (no uncommitted changes)
- On develop branch (or will switch to it)
- Origin remote configured
</prerequisites>

<skills>
- `/changelog` - For changelog format reference, auto-generation patterns, and version bump decisions
</skills>
