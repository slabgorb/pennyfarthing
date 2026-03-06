"""Judge Prompt Builder — Gold Standard Calibration.

Story 45-2: Update judge to use gold standard as calibration.

Builds judge prompts programmatically, injecting gold_standard calibration
context when available. Used by /solo and /benchmark to construct the prompt
file before piping to `claude -p`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class GoldStandard:
    response: str
    score: int
    graded_by: str
    notes: str | None = None


@dataclass
class BaselineIssue:
    id: str
    severity: str
    description: str


@dataclass
class SoloJudgeInput:
    spec: str
    character: str
    challenge: str
    response: str
    gold_standard: GoldStandard | None = None
    baseline_issues: list[BaselineIssue] | None = None


def build_solo_judge_prompt(input: SoloJudgeInput) -> str:
    """Build a solo-mode judge prompt, including gold standard calibration when available.

    Returns the full prompt string ready to be written to a file and piped to claude.
    """
    raise NotImplementedError("Story 45-2 — Dev will implement")
