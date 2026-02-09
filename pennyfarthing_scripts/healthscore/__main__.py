"""Allow running as: python -m pennyfarthing_scripts.healthscore"""

import logging
import sys

from pennyfarthing_scripts.healthscore.cli import healthscore

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stderr,
    )
    healthscore()
