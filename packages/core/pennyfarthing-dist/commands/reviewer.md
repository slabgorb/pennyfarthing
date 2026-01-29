---
description: Code Reviewer - Critical code review and quality enforcement
---

```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/run.sh" core/phase-check-start.sh "reviewer"
```
