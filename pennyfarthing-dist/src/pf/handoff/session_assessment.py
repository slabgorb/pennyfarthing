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
import unicodedata

# Any agent's assessment heading satisfies the precondition (`## Sm
# Assessment`, `## TEA Assessment`, ...). Mirrors the historical
# complete_phase check exactly.
# IGNORECASE: presence detection is permissive — any-case heading is
# detected so that the gate never misses an assessment that is visually
# obvious to a human (story 162-60, case-policy fix).
_ASSESSMENT_RE = re.compile(r"^##\s+.*Assessment", re.MULTILINE | re.IGNORECASE)

# Gate types whose transitions don't require an assessment.
EXEMPT_GATE_TYPES = ("skip", "manual", "-", None, "")


def normalize_session(content: str) -> str:
    """NFKC-normalize and strip invisible Unicode from session content.

    Homoglyph and near-miss characters — zero-width spaces (U+200B),
    zero-width non-joiners (U+200C), format marks, compatibility variants
    (U+2212 MINUS SIGN → hyphen-minus, ℝ → R, ﬁ → fi) — are visually
    identical to their canonical forms but break byte-level label matching.
    NFKC collapses compatibility variants; stripping Cf/Cc removes invisible
    format and control characters that survive NFKC unchanged.  Newlines,
    carriage returns, and tabs are preserved because they are structural
    (story 162-60, normalization policy).
    """
    normalized = unicodedata.normalize("NFKC", content)
    return "".join(
        ch
        for ch in normalized
        if unicodedata.category(ch) != "Cf"
        and (unicodedata.category(ch) != "Cc" or ch in "\n\r\t")
    )


def requires_assessment(gate_type: str | None) -> bool:
    """Whether a transition through ``gate_type`` needs an assessment."""
    return gate_type not in EXEMPT_GATE_TYPES


def has_assessment(content: str) -> bool:
    """Whether the session ``content`` contains an ``## … Assessment`` heading."""
    return bool(_ASSESSMENT_RE.search(normalize_session(content)))


def assessment_heading(agent: str) -> str:
    """The heading text an agent writes its assessment under.

    One formula, one place. This module already owns ``_ASSESSMENT_RE``, so it
    owns the writer/reader contract for the heading too: ``resolve_gate`` reads
    the verdict out of the section this names, and
    ``missing_assessment_error`` tells the agent to write it. If the two ever
    disagreed, the verdict parser would search for a heading agents are no
    longer told to write and every verdict would silently read as absent.
    """
    return f"{agent.replace('-', ' ').title()} Assessment"


def missing_assessment_error(agent: str) -> str:
    """Actionable error naming the heading the agent must add."""
    return (
        "No assessment found in session file. "
        f"To fix: Add a `## {assessment_heading(agent)}` heading "
        "to the session file before completing the phase."
    )
