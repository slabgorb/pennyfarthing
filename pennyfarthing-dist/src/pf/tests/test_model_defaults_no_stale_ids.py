"""No stale pinned model IDs in benchmark/demo/peloton defaults."""

import re
from pathlib import Path

SWEPT = [
    "src/pf/benchmark/pipeline_replay.py",
    "src/pf/benchmark/cli.py",
    "src/pf/peloton/result_aggregator.py",
    "src/pf/demo/generator.py",
]

# Pinned generation-4 IDs that must not survive the sweep
STALE = re.compile(r"claude-(opus|sonnet|haiku)-4[-\d]")


def test_no_stale_pinned_model_ids() -> None:
    root = Path(__file__).resolve().parents[2]  # pennyfarthing-dist/src
    offenders = []
    for rel in SWEPT:
        text = (root.parent / rel).read_text()
        for i, line in enumerate(text.splitlines(), 1):
            if STALE.search(line):
                offenders.append(f"{rel}:{i}: {line.strip()}")
    assert offenders == [], "\n".join(offenders)
