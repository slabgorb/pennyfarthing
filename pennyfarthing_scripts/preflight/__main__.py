"""
Entry point for python -m pennyfarthing_scripts.preflight
"""

import sys

from pennyfarthing_scripts.preflight.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
