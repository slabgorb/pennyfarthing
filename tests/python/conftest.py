"""
Pytest configuration for Python script tests.
"""

import sys
from pathlib import Path

# Add project root and src to path for imports
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "pennyfarthing-dist" / "src"))
