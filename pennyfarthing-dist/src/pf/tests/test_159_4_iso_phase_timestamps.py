"""RED tests for Story 159-4 — tolerant phase-timestamp parsing + ISO-8601 producer (gh #74).

Epic: 159 (Smaller standalone fixes)
Story: 159-4 — sm-setup writes non-ISO 'Phase Started' timestamp → crashes
        `pf handoff complete-phase` (gh #74)

## Root cause (for the Dev who turns these green)

`_calc_duration` in `pf/handoff/complete_phase.py` normalizes only a trailing
`Z`:

    started = datetime.fromisoformat(started_str.replace("Z", "+00:00"))

The `sm-setup` subagent — a *model* filling the `{NOW}` placeholder in
`agents/sm-setup.md` — sometimes stamps `**Phase Started:**` / the Phase
History `Started` cell as a human-readable `YYYY-MM-DD HH:MM UTC`
(e.g. `2026-06-03 22:00 UTC`). `datetime.fromisoformat` cannot parse the
trailing ` UTC`, so `_calc_duration` raises `ValueError` and EVERY
`complete-phase` handoff hard-crashes with a click/internal traceback that
never names the offending session file. A human has to hand-edit the session
to recover.

## Contract pinned by these tests

AC1 — Tolerant consumer (no crash, correct durations):
  - `_calc_duration` accepts `YYYY-MM-DD HH:MM UTC`, trailing `Z`, and
    ISO-8601-with-offset, computing the SAME (correct) duration for the same
    instant regardless of which surface form is used.
  - The full `complete_phase` path survives a session whose Phase History
    `Started` cell is the ` UTC` shape — `status: success`, no raised
    ValueError (this is the literal gh #74 crash path).

AC2 — Graceful degradation on a genuinely unparseable timestamp:
  - `_calc_duration` must NOT raise a raw ValueError on garbage; it degrades
    to a visible sentinel (NOT a misleading "0s" — lang-review #1: a swallowed
    error must not masquerade as a real value).
  - `complete_phase` over a session with a garbage `Started` cell must NOT
    propagate a raw ValueError. Either it succeeds with a degraded duration,
    or it returns `status: "error"` (SOUL #10) whose message names BOTH the
    session file and the offending string (the traceback's failure today is
    that it names neither).

AC3 — ISO-8601 producer:
  - `agents/sm-setup.md` must instruct the producer to emit ISO-8601 for the
    `Phase Started` / Phase History timestamp — the `{NOW}` placeholder alone
    lets the model invent `YYYY-MM-DD HH:MM UTC`. A static assertion on the
    agent text pins the instruction (the producer is markdown, not code).

AC4 — Existing handoff tests still pass: covered by the wider suite; the AC1
  `complete_phase` success/advance assertions also act as a regression guard.

These are RED on HEAD: `_calc_duration` raises on the ` UTC` and garbage
forms, and `sm-setup.md` carries no ISO-8601 instruction.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.complete_phase import _calc_duration, complete_phase

# ---------------------------------------------------------------------------
# Fixtures / constants
# ---------------------------------------------------------------------------

STORY_ID = "159-4"
EPIC_N = "159"

TDD_WORKFLOW = {
    "workflow": {
        "name": "tdd",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
            {"name": "green", "agent": "dev", "gate": {"type": "tests_pass"}},
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

# The repo root for the static AC3 assertion — find pennyfarthing-dist from here.
# tests live at .../pennyfarthing-dist/src/pf/tests/, so the dist root
# (which holds agents/) is 4 parents up: tests→pf→src→pennyfarthing-dist.
_DIST_ROOT = Path(__file__).resolve().parents[3]
SM_SETUP_AGENT = _DIST_ROOT / "agents" / "sm-setup.md"


def _green_session(started_cell: str, phase_started: str | None = None) -> str:
    """A green-phase session whose Phase History `green` row carries the given
    Started cell. Drives `complete_phase(green→review)` straight into
    `_calc_duration(started_cell, now)`.
    """
    ps = phase_started if phase_started is not None else started_cell
    return textwrap.dedent(f"""\
        # Story {STORY_ID}: iso phase timestamps

        **Story ID:** {STORY_ID}
        **Workflow:** tdd
        **Phase:** green
        **Phase Started:** {ps}

        ## Dev Assessment

        Implementation complete — tests green.

        ## Workflow Tracking

        **Phase:** green
        **Phase Started:** {ps}

        ### Phase History
        | Phase | Started | Ended | Duration |
        |-------|---------|-------|----------|
        | green | {started_cell} | - | - |

        ### Handoff History
        | From | To | Gate | Status | Timestamp |
        |------|-----|------|--------|-----------|
    """)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Minimal project: tdd workflow YAML + .session/ dir."""
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)
    (workflows_dir / "tdd.yaml").write_text(yaml.dump(TDD_WORKFLOW, default_flow_style=False))
    (tmp_path / ".session").mkdir()
    return tmp_path


def _write_session(project: Path, content: str) -> Path:
    session_file = project / ".session" / f"{STORY_ID}-session.md"
    session_file.write_text(content)
    return session_file


def _green_row_duration(session_file: Path) -> str:
    """Return the Duration cell of the closed-out `green` Phase History row."""
    for line in session_file.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith("| green |"):
            cols = [c.strip() for c in line.split("|") if c.strip()]
            # | green | <started> | <ended> | <duration> |
            if len(cols) >= 4 and cols[2] != "-":
                return cols[3]
    return ""


# ===========================================================================
# AC1 — tolerant consumer: parse all three surface forms, correct durations
# ===========================================================================


class TestCalcDurationAcceptsSurfaceForms:
    # 2026-06-03 22:00 → 2026-06-03 23:30 == 1h 30m, expressed three ways.
    ENDED_ISO_Z = "2026-06-03T23:30:00Z"

    def test_accepts_space_utc_form(self) -> None:
        """The exact gh #74 shape `YYYY-MM-DD HH:MM UTC` must not crash."""
        # RED today: fromisoformat('2026-06-03 22:00 UTC') raises ValueError.
        result = _calc_duration("2026-06-03 22:00 UTC", self.ENDED_ISO_Z)
        assert result == "1h 30m", (
            f"`YYYY-MM-DD HH:MM UTC` started → wrong/failed duration: {result!r}"
        )

    def test_accepts_trailing_z_form(self) -> None:
        result = _calc_duration("2026-06-03T22:00:00Z", self.ENDED_ISO_Z)
        assert result == "1h 30m", f"ISO+Z started → wrong duration: {result!r}"

    def test_accepts_iso_offset_form(self) -> None:
        result = _calc_duration("2026-06-03T22:00:00+00:00", self.ENDED_ISO_Z)
        assert result == "1h 30m", f"ISO+offset started → wrong duration: {result!r}"

    def test_all_three_forms_agree(self) -> None:
        """Same instant in three surface forms must yield the SAME duration."""
        space_utc = _calc_duration("2026-06-03 22:00 UTC", self.ENDED_ISO_Z)
        z_form = _calc_duration("2026-06-03T22:00:00Z", self.ENDED_ISO_Z)
        offset = _calc_duration("2026-06-03T22:00:00+00:00", self.ENDED_ISO_Z)
        assert space_utc == z_form == offset, (
            f"surface forms disagree: space_utc={space_utc!r} z={z_form!r} offset={offset!r}"
        )

    def test_space_utc_with_seconds(self) -> None:
        """`YYYY-MM-DD HH:MM:SS UTC` (seconds present) parses too — sub-minute."""
        result = _calc_duration("2026-06-03 22:00:00 UTC", "2026-06-03 22:00:45 UTC")
        assert result == "45s", f"space-UTC with seconds → wrong duration: {result!r}"


class TestCompletePhaseSurvivesSpaceUtcSession:
    """The literal gh #74 path: a session stamped `... UTC` must not crash
    `complete_phase` and must close out the row with a real duration."""

    def test_complete_phase_does_not_raise_on_space_utc(self, project: Path) -> None:
        session = _write_session(project, _green_session("2026-06-03 22:00 UTC"))
        # RED today: _calc_duration raises ValueError → propagates out of
        # complete_phase as an unhandled traceback.
        result = complete_phase(STORY_ID, "tdd", "green", "review", "tests_pass", project)
        assert result["status"] == "success", (
            f"complete_phase failed on a `... UTC` session (gh #74): {result.get('error')!r}"
        )
        # And the green row must be closed with a computed (non-placeholder) duration.
        dur = _green_row_duration(session)
        assert dur not in ("", "-"), f"green row not closed with a real duration: {dur!r}"


# ===========================================================================
# AC2 — graceful degradation / actionable error on unparseable timestamp
# ===========================================================================

GARBAGE_TS = "yesterday-ish, around tea time"


class TestCalcDurationDegradesGracefully:
    def test_does_not_raise_on_garbage(self) -> None:
        """A genuinely unparseable started string must NOT raise a raw ValueError."""
        try:
            result = _calc_duration(GARBAGE_TS, "2026-06-03T23:30:00Z")
        except ValueError as exc:  # noqa: PT017 - asserting absence of raise is the point
            pytest.fail(f"_calc_duration raised a raw ValueError on garbage: {exc}")
        # Degradation must be VISIBLE, not a misleading real-looking value.
        # lang-review #1: a swallowed parse error must not masquerade as "0s".
        assert result != "0s", (
            "garbage timestamp degraded to a misleading '0s' — degradation must be "
            "a visible sentinel (e.g. '-' / 'unknown'), not a fake real duration"
        )
        assert result, "degraded duration must still be a non-empty sentinel"


class TestCompletePhaseHandlesGarbageTimestamp:
    def test_no_raw_valueerror_and_actionable(self, project: Path) -> None:
        """Garbage Started cell: complete_phase must not propagate ValueError.

        Acceptable outcomes (AC2):
          (a) success with a degraded duration, OR
          (b) status='error' whose message names BOTH the session file and the
              offending string.
        Today it raises a raw ValueError naming neither.
        """
        _write_session(project, _green_session(GARBAGE_TS))
        try:
            result = complete_phase(STORY_ID, "tdd", "green", "review", "tests_pass", project)
        except ValueError as exc:  # noqa: PT017
            pytest.fail(
                f"complete_phase propagated a raw ValueError on a garbage timestamp "
                f"(gh #74 AC2): {exc}"
            )
        if result["status"] == "error":
            msg = result.get("error") or ""
            assert f"{STORY_ID}-session.md" in msg, (
                f"error must name the offending session file: {msg!r}"
            )
            assert GARBAGE_TS in msg, (
                f"error must name the offending timestamp string: {msg!r}"
            )
        else:
            assert result["status"] == "success", (
                f"unexpected status on garbage timestamp: {result!r}"
            )


# ===========================================================================
# AC3 — producer emits / is instructed to emit ISO-8601
# ===========================================================================


class TestSmSetupInstructsIso8601:
    def test_agent_file_exists(self) -> None:
        assert SM_SETUP_AGENT.exists(), f"sm-setup agent not found at {SM_SETUP_AGENT}"

    def test_instructs_iso_8601_for_phase_started(self) -> None:
        """The sm-setup template's `{NOW}` is filled by a model; without an
        explicit ISO-8601 instruction it invents `YYYY-MM-DD HH:MM UTC`.

        Pin that the agent text names the ISO-8601 requirement near the
        timestamp it stamps.
        """
        text = SM_SETUP_AGENT.read_text()
        lowered = text.lower()
        mentions_iso = "iso-8601" in lowered or "iso 8601" in lowered or "iso8601" in lowered
        assert mentions_iso, (
            "sm-setup.md does not instruct ISO-8601 for the Phase Started / "
            "Phase History timestamp — the `{NOW}` placeholder lets the model "
            "emit `YYYY-MM-DD HH:MM UTC`, the gh #74 producer bug."
        )
