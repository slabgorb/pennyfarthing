"""
Entry point for python -m pennyfarthing_scripts.migration
"""

import sys

from pennyfarthing_scripts.migration.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
