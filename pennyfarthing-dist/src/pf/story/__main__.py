"""
Entry point for python -m pf.story
"""

import sys

from pf.story.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
