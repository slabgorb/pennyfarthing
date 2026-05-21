"""
Entry point for python -m pf.sprint
"""

import sys

from pf.sprint.cli import sprint

if __name__ == "__main__":
    sys.exit(sprint())
