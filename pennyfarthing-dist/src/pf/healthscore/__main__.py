"""Allow running as: python -m pf.healthscore"""

import logging
import sys

from pf.healthscore.cli import healthscore

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stderr,
    )
    healthscore()
