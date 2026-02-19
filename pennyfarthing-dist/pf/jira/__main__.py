"""
Entry point for python -m pf.jira
"""

import sys

from pf.jira.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
