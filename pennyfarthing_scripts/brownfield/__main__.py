"""Entry point for python -m pennyfarthing_scripts.brownfield."""

import sys

from pennyfarthing_scripts.brownfield.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
