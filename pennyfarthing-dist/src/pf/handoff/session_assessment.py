"""Shared assessment precondition for the handoff exit protocol.

``resolve_gate`` and ``complete_phase`` MUST agree on what "assessment
present" means — one regex, one exemption list, one place (SOUL #2,
One Truth One Place). gh #49 documented the round-trip caused when
resolve-gate reported ``assessment_found: true`` while complete-phase
hard-failed on the same session file.

Story: 158-4
"""

from __future__ import annotations

import re

# Any agent's assessment heading satisfies the precondition (`## Sm
# Assessment`, `## TEA Assessment`, ...). Mirrors the historical
# complete_phase check exactly.
_ASSESSMENT_RE = re.compile(r"^##\s+.*Assessment", re.MULTILINE)

# Gate types whose transitions don't require an assessment.
EXEMPT_GATE_TYPES = ("skip", "manual", "-", None, "")


def requires_assessment(gate_type: str | None) -> bool:
    """Whether a transition through ``gate_type`` needs an assessment."""
    return gate_type not in EXEMPT_GATE_TYPES


def has_assessment(content: str) -> bool:
    """Whether the session ``content`` contains an ``## … Assessment`` heading."""
    return bool(_ASSESSMENT_RE.search(content))


def missing_assessment_error(agent: str) -> str:
    """Actionable error naming the heading the agent must add."""
    agent_name = agent.replace("-", " ").title()
    return (
        "No assessment found in session file. "
        f"To fix: Add a `## {agent_name} Assessment` heading "
        "to the session file before completing the phase."
    )
