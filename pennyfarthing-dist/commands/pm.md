---
description: Product Manager - Strategic planning and prioritization
---

```bash
d="$PWD"; while [[ ! -d "$d/.pennyfarthing" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done
export PYTHONPATH="$(dirname "$(dirname "$(cd "$d/.pennyfarthing/scripts" && pwd -P)")"):${PYTHONPATH:-}"
python3 -m pennyfarthing_scripts.cli agent start "pm"
```
