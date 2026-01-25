"""
Entry point for python -m pennyfarthing_scripts.jira
"""

import sys

from pennyfarthing_scripts.jira.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
