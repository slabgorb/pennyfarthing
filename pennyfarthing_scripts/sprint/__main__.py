"""
Entry point for python -m pennyfarthing_scripts.sprint
"""

import sys

from pennyfarthing_scripts.sprint.cli import sprint

if __name__ == "__main__":
    sys.exit(sprint())
