"""
Entry point for python -m pennyfarthing_scripts.story
"""

import sys

from pennyfarthing_scripts.story.cli import cli

if __name__ == "__main__":
    sys.exit(cli())
