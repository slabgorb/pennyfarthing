## What Was Built
Fixed critical npm distribution bug where the `.npmignore` blanket `*.md` exclusion was removing ALL markdown files from the package. Added negation pattern `!pennyfarthing-dist/**/*.md` to preserve 115+ essential framework files.

## Key Technical Decisions
1. Pattern Order Matters: Negation patterns must come AFTER the exclusion they override
2. Surgical Fix: Single line addition rather than restructuring the ignore file
3. Verification via Dry Run: Used `npm pack --dry-run` to confirm files are included

## Files Modified
- `.npmignore` - +1 line: `!pennyfarthing-dist/**/*.md`
- `.pennyfarthing/sidecars/dev/gotchas.md` - GitHub install documentation
- `.pennyfarthing/sidecars/sm/gotchas.md` - Installation gotcha
