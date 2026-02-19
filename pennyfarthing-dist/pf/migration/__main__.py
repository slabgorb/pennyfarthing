"""
Entry point for python -m pf.migration
"""

import sys

from pf.migration.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
