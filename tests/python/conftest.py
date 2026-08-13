"""
Pytest configuration for Python script tests.
"""

import os
import sys
from pathlib import Path

# Add project root and src to path for imports
PROJECT_ROOT = Path(__file__).parent.parent.parent
SRC_ROOT = PROJECT_ROOT / "pennyfarthing-dist" / "src"
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(SRC_ROOT))

# 162-30: many tests in this tree shell out to `python -m pf.cli ...`. Since the
# src-layout migration (5d92bf792) `pf` lives under pennyfarthing-dist/src, which is
# not on a subprocess's default sys.path, so every such call died with
# "No module named 'pf'". Export PYTHONPATH so inherited-env subprocesses resolve it.
_existing = os.environ.get("PYTHONPATH")
if str(SRC_ROOT) not in (_existing or "").split(os.pathsep):
    os.environ["PYTHONPATH"] = (
        f"{SRC_ROOT}{os.pathsep}{_existing}" if _existing else str(SRC_ROOT)
    )
