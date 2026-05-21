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


_CALIBRATION_INSTRUCTION = (
    "Use this expert response as a calibration reference point. "
    "A response of similar quality should score similarly. "
    "Responses that miss key insights from the gold standard should score lower. "
    "Do not penalize different but equally valid approaches — "
    "the gold standard is an anchor, not the only correct answer."
)


def _build_gold_standard_section(gs: GoldStandard) -> str:
    """Build the Gold Standard calibration section for the judge prompt."""
    lines = [
        "## Gold Standard Calibration",
        "",
        f"An expert-level response for this scenario scored **{gs.score}/100**.",
        "",
        "### Expert Response",
        gs.response,
    ]
    if gs.notes:
        lines += ["", f"**Notes:** {gs.notes}"]
    lines += [
        "",
        "### Calibration Instruction",
        _CALIBRATION_INSTRUCTION,
    ]
    return "\n".join(lines)


def _build_rubric_section() -> str:
    """Build the standard 4-dimension rubric section."""
    return """Score 1-10 on each dimension:

### Correctness (25%) - Technical accuracy
### Depth (25%) - Thoroughness
### Quality (25%) - Clarity and actionability
### Persona (25%) - Character embodiment

Formula: (correctness × 2.5) + (depth × 2.5) + (quality × 2.5) + (persona × 2.5) = WEIGHTED_TOTAL

**IMPORTANT: Output your evaluation as JSON only. No markdown, no extra text.**

```json
{
  "scores": {
    "correctness": { "value": 8, "reasoning": "..." },
    "depth": { "value": 7, "reasoning": "..." },
    "quality": { "value": 9, "reasoning": "..." },
    "persona": { "value": 8, "reasoning": "..." }
  },
  "weighted_total": 80.0,
  "assessment": "2-3 sentence overall assessment"
}
```"""


def _build_checklist_section(issues: list[BaselineIssue]) -> str:
    """Build the checklist section for baseline issues."""
    lines = ["## Expected Findings", ""]
    for issue in issues:
        lines.append(f"- **{issue.id}** ({issue.severity}): {issue.description}")
    return "\n".join(lines)


def build_solo_judge_prompt(input: SoloJudgeInput) -> str:
    """Build a solo-mode judge prompt, including gold standard calibration when available.

    Returns the full prompt string ready to be written to a file and piped to claude.
    """
    parts = [
        "You are an impartial judge evaluating an AI agent's response.",
        "",
        "## Contestant",
        f"- **{input.spec}** ({input.character})",
        "",
        "## Challenge",
        input.challenge,
        "",
        "## Response",
        input.response,
    ]

    if input.gold_standard:
        parts += ["", _build_gold_standard_section(input.gold_standard)]

    if input.baseline_issues:
        parts += ["", _build_checklist_section(input.baseline_issues)]

    parts += ["", "## Evaluation", "", _build_rubric_section()]

    return "\n".join(parts)
