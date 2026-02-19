"""
Entry point for python -m pf.preflight
"""

import sys

from pf.preflight.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
