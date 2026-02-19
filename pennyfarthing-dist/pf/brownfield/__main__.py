"""Entry point for python -m pf.brownfield."""

import sys

from pf.brownfield.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
