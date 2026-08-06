"""resolve-gate must honor a non-APPROVED reviewer verdict (Story 162-21).

Epic: 162 (Finish & sprint-tooling truthfulness)

Observed live in the 162-2 review: `pf handoff resolve-gate` returned
``next_agent=sm`` / ``next_phase=finish`` on a REJECTED reviewer verdict, and
`complete-phase` duly advanced the session to ``finish`` — even though the
review gate's own ``recovery`` block declares
``reviewer-verdict: {action: rework, target_phase: green, max_attempts: 3}``.
The identical result came back on round 2 with an APPROVED verdict, which is
the tell: the gate emits the same routing regardless of verdict. On approval it
is right only by accident.

Story 143-10 wired the *config* through (``recovery_config`` is returned) and
added ``pf.handoff.gate_recovery.get_rework_recovery`` to interpret it — but
nothing in the production path ever reads the verdict or calls that helper.
The plumbing is connected at both ends and severed in the middle.

Acceptance criteria under test:
- [AC1] A non-APPROVED verdict (REJECTED / CHANGES_REQUESTED, any case) routes
        to the recovery ``target_phase`` and that phase's agent — green/dev —
        not to the linear next phase.
- [AC2] The resolved routing marks the transition as rework so `complete_phase`
        increments the Round-Trip Count and skips the approval subgates.
- [AC3] An APPROVED verdict still routes to finish/sm (right on purpose now).
- [AC4] Rework past ``max_attempts`` blocks loudly instead of advancing.
- [AC5] Fail closed: an absent/unparseable verdict never silently advances to
        finish.
- [AC6] Scope: rework routing only fires for gates that declare it, and only
        reads the verdict of the CURRENT rework cycle.
"""

from __future__ import annotations

import copy
import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.complete_phase import complete_phase
from pf.handoff.resolve_gate import resolve_gate

STORY_ID = "162-21"

# The real workflow definition — these tests must track production, not a
# hand-copied fixture that can drift away from it.
REAL_TDD_YAML = Path(__file__).parents[3] / "workflows" / "tdd.yaml"


def _load_real_tdd() -> dict:
    if not REAL_TDD_YAML.exists():  # pragma: no cover - packaging guard
        pytest.skip(f"tdd.yaml not found at {REAL_TDD_YAML}")
    return yaml.safe_load(REAL_TDD_YAML.read_text(encoding="utf-8"))


def _strip_review_recovery(workflow: dict) -> dict:
    """Same workflow with the review gate's recovery block removed."""
    data = copy.deepcopy(workflow)
    for phase in data["workflow"]["phases"]:
        if phase["name"] == "review":
            phase["gate"].pop("recovery", None)
    return data


_REVIEWER_ASSESSMENT_TEMPLATE = textwrap.dedent("""\

    ## Reviewer Assessment

    {cycle_note}{verdict_line}**Findings:** 2 blocking, 0 minor

    - [EDGE] Unchecked index into the phases list
    - [SEC] Path built from unvalidated session content
    - [SILENT] No concerns
    - [TEST] No concerns
    - [DOC] No concerns
    - [TYPE] No concerns
    - [SIMPLE] No concerns
    - [RULE] No concerns
    """)

_SESSION_TEMPLATE = textwrap.dedent("""\
    ---
    story_id: "{story_id}"
    jira_key: ""
    epic: ""
    workflow: "tdd"
    ---
    # Story {story_id}: resolve-gate ignores REJECTED reviewer verdict

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** {phase}
    **Phase Started:** 2026-08-06T13:00:00Z
    {rt_line}
    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | setup | 2026-08-06T12:00:00Z | 2026-08-06T12:05:00Z | 5m |
    | red | 2026-08-06T12:05:00Z | 2026-08-06T12:20:00Z | 15m |
    | green | 2026-08-06T12:20:00Z | 2026-08-06T13:00:00Z | 40m |
    | {phase} | 2026-08-06T13:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Result | Timestamp |
    |------|----|------|--------|-----------|
    | setup (sm) | red (tea) | sm_setup_exit | PASSED | 2026-08-06T12:05:00Z |
    | red (tea) | green (dev) | tests_fail | PASSED | 2026-08-06T12:20:00Z |
    | green (dev) | review (reviewer) | dev_exit | PASSED | 2026-08-06T13:00:00Z |

    ## Subagent Results

    | # | Specialist | Received | Status |
    |---|------------|----------|--------|
    | 1 | reviewer-preflight | Yes | clean |

    All received: Yes
    """)


def _reviewer_assessment(verdict: str | None, cycle_note: str = "") -> str:
    """A reviewer assessment block, optionally without any verdict line."""
    return _REVIEWER_ASSESSMENT_TEMPLATE.format(
        cycle_note=cycle_note,
        verdict_line=f"**Verdict:** {verdict}\n" if verdict is not None else "",
    )


def _make_session(
    verdict: str | None = "REJECTED",
    phase: str = "review",
    round_trip_count: int | None = None,
    extra_assessments: str = "",
) -> str:
    """Session file at ``phase`` carrying a reviewer verdict."""
    return (
        _SESSION_TEMPLATE.format(
            story_id=STORY_ID,
            phase=phase,
            rt_line=(
                f"**Round-Trip Count:** {round_trip_count}\n"
                if round_trip_count is not None
                else ""
            ),
        )
        + _reviewer_assessment(verdict)
        + extra_assessments
    )


def _setup_project(tmp_path: Path, workflow: dict, session: str) -> Path:
    project = tmp_path / "project"
    (project / ".pennyfarthing" / "workflows").mkdir(parents=True)
    (project / ".pennyfarthing" / "workflows" / "tdd.yaml").write_text(
        yaml.dump(workflow, default_flow_style=False), encoding="utf-8"
    )
    (project / ".session").mkdir()
    (project / ".session" / f"{STORY_ID}-session.md").write_text(session, encoding="utf-8")
    return project


def _resolve_review(tmp_path: Path, **session_kwargs) -> dict:
    project = _setup_project(tmp_path, _load_real_tdd(), _make_session(**session_kwargs))
    return resolve_gate(STORY_ID, "tdd", "review", project_root=project)


# ===========================================================================
# AC1: a non-APPROVED verdict routes to the recovery target phase
# ===========================================================================


class TestRejectedVerdictRoutesToRework:
    def test_rejected_verdict_does_not_route_to_finish(self, tmp_path):
        """The bug, stated directly: REJECTED must never yield next_phase=finish."""
        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["next_phase"] != "finish", (
            "resolve_gate advanced a REJECTED review straight to the finish "
            f"phase — full result: {result}"
        )
        assert result["next_agent"] != "sm", (
            "resolve_gate handed a REJECTED review to SM for archival — "
            f"full result: {result}"
        )

    def test_rejected_verdict_routes_to_recovery_target_phase(self, tmp_path):
        """Routing must come from recovery_config.target_phase (green)."""
        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["next_phase"] == "green"

    def test_rejected_verdict_routes_to_target_phase_agent(self, tmp_path):
        """next_agent must be the target phase's agent per the workflow YAML."""
        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["next_agent"] == "dev"

    def test_changes_requested_verdict_also_reworks(self, tmp_path):
        """The reviewer template offers CHANGES_REQUESTED — it is not approval."""
        result = _resolve_review(tmp_path, verdict="CHANGES_REQUESTED")

        assert result["next_phase"] == "green"
        assert result["next_agent"] == "dev"

    @pytest.mark.parametrize(
        "verdict",
        [
            "rejected",
            "Rejected",
            "REJECTED — two blocking findings must be fixed",
            "**REJECTED**",
            "  REJECTED  ",
            "changes_requested",
            "CHANGES REQUESTED",
            "NOT APPROVED",
        ],
    )
    def test_non_approved_verdict_shapes_all_rework(self, tmp_path, verdict):
        """Verdict detection cannot hinge on one exact uppercase spelling."""
        result = _resolve_review(tmp_path, verdict=verdict)

        assert result["next_phase"] == "green", (
            f"verdict {verdict!r} was treated as approval — result: {result}"
        )

    def test_approved_substring_inside_not_approved_is_not_approval(self, tmp_path):
        """`NOT APPROVED` contains `APPROVED` — a naive substring check passes it."""
        result = _resolve_review(tmp_path, verdict="NOT APPROVED")

        assert result["next_phase"] == "green"
        assert result["next_agent"] == "dev"


# ===========================================================================
# AC2: the rework routing is usable by complete_phase
# ===========================================================================


class TestReworkRoutingIsActionable:
    def test_resolved_gate_type_marks_rework(self, tmp_path):
        """complete_phase keys round-trip tracking off `"rework" in gate_type`.

        If resolve_gate hands back the bare ``approval`` gate type on a
        rejection, complete_phase runs the approval subgates and never
        increments the Round-Trip Count — so max_attempts can never trip.
        """
        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert "rework" in (result.get("gate_type") or ""), (
            "resolved gate_type must mark the transition as rework so "
            f"complete_phase tracks round-trips — got {result.get('gate_type')!r}"
        )

    def test_status_is_ready_for_a_rework_transition(self, tmp_path):
        """A rejection is a known route, not an error: the exit protocol proceeds."""
        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["status"] == "ready"
        assert result["error"] is None

    def test_end_to_end_exit_protocol_lands_on_green(self, tmp_path):
        """Mirror the CLI: resolve-gate's outputs feed complete-phase verbatim.

        This is the exact sequence that mis-advanced story 162-2 to finish.
        """
        project = _setup_project(
            tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED")
        )
        session = project / ".session" / f"{STORY_ID}-session.md"

        resolved = resolve_gate(STORY_ID, "tdd", "review", project_root=project)
        assert resolved["status"] == "ready", resolved

        completed = complete_phase(
            STORY_ID,
            "tdd",
            "review",
            resolved["next_phase"],
            resolved["gate_type"],
            project_root=project,
        )

        assert completed["status"] == "success", completed
        content = session.read_text(encoding="utf-8")
        assert "**Phase:** green" in content
        assert "**Phase:** finish" not in content

    def test_end_to_end_rework_increments_round_trip_count(self, tmp_path):
        """Without a round-trip count the max_attempts ceiling is unenforceable."""
        project = _setup_project(
            tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED")
        )
        session = project / ".session" / f"{STORY_ID}-session.md"

        resolved = resolve_gate(STORY_ID, "tdd", "review", project_root=project)
        complete_phase(
            STORY_ID,
            "tdd",
            "review",
            resolved["next_phase"],
            resolved["gate_type"],
            project_root=project,
        )

        assert "**Round-Trip Count:** 1" in session.read_text(encoding="utf-8")

    def test_rework_preserves_reviewer_findings_for_dev(self, tmp_path):
        """Dev needs the findings it is being sent back to fix."""
        project = _setup_project(
            tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED")
        )
        session = project / ".session" / f"{STORY_ID}-session.md"

        resolved = resolve_gate(STORY_ID, "tdd", "review", project_root=project)
        complete_phase(
            STORY_ID,
            "tdd",
            "review",
            resolved["next_phase"],
            resolved["gate_type"],
            project_root=project,
        )

        content = session.read_text(encoding="utf-8")
        assert "**Phase:** green" in content, "rework did not reach Dev at all"
        assert "## Reviewer Assessment" in content
        assert "[EDGE] Unchecked index" in content


# ===========================================================================
# AC3: approval still routes forward — and now on purpose
# ===========================================================================


class TestApprovedVerdictStillFinishes:
    def test_approved_routes_to_finish(self, tmp_path):
        result = _resolve_review(tmp_path, verdict="APPROVED")

        assert result["status"] == "ready"
        assert result["next_phase"] == "finish"
        assert result["next_agent"] == "sm"

    def test_approved_gate_type_is_not_rework(self, tmp_path):
        """An approval must not be recorded as a rework round-trip."""
        result = _resolve_review(tmp_path, verdict="APPROVED")

        assert "rework" not in (result.get("gate_type") or "")

    @pytest.mark.parametrize("verdict", ["APPROVED", "approved", "**APPROVED**", "APPROVED ✅"])
    def test_approval_verdict_shapes_all_finish(self, tmp_path, verdict):
        result = _resolve_review(tmp_path, verdict=verdict)

        assert result["next_phase"] == "finish", f"verdict {verdict!r} — result: {result}"


# ===========================================================================
# AC4: max_attempts blocks loudly
# ===========================================================================


class TestMaxAttemptsCeiling:
    def test_at_max_attempts_rework_is_blocked(self, tmp_path):
        """tdd.yaml sets max_attempts: 3 — a 4th rework must not be handed out."""
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=3)

        assert result["status"] == "blocked", (
            f"4th rework attempt was allowed instead of blocked — result: {result}"
        )

    def test_at_max_attempts_does_not_advance_to_finish(self, tmp_path):
        """Exhausting rework attempts must not fall through to archival."""
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=3)

        assert not (result["status"] == "ready" and result["next_phase"] == "finish"), (
            f"exhausted rework silently approved the story — result: {result}"
        )

    def test_max_attempts_block_error_is_actionable(self, tmp_path):
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=3)

        error = (result.get("error") or "").lower()
        assert "max" in error and "attempt" in error, (
            f"block reason does not name the exhausted attempt limit: {result.get('error')!r}"
        )

    def test_one_below_max_attempts_still_reworks(self, tmp_path):
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=2)

        assert result["status"] == "ready"
        assert result["next_phase"] == "green"

    def test_beyond_max_attempts_is_also_blocked(self, tmp_path):
        """A count already past the ceiling must not wrap around into rework."""
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=9)

        assert result["status"] == "blocked"

    def test_max_attempts_does_not_block_an_approval(self, tmp_path):
        """The ceiling gates rework, not approval — a fixed story must finish."""
        result = _resolve_review(tmp_path, verdict="APPROVED", round_trip_count=3)

        assert result["status"] == "ready"
        assert result["next_phase"] == "finish"

    def test_unparseable_round_trip_count_does_not_crash(self, tmp_path):
        """A corrupted count must degrade, not raise."""
        session = _make_session(verdict="REJECTED").replace(
            "**Phase Started:** 2026-08-06T13:00:00Z",
            "**Phase Started:** 2026-08-06T13:00:00Z\n**Round-Trip Count:** many",
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] in ("ready", "blocked")
        assert result["next_phase"] != "finish"


# ===========================================================================
# AC5: fail closed on a missing or ambiguous verdict
# ===========================================================================


class TestFailsClosedWithoutAVerdict:
    def test_missing_verdict_line_does_not_advance_to_finish(self, tmp_path):
        """No verdict means the review is not done — never archive on silence."""
        result = _resolve_review(tmp_path, verdict=None)

        assert not (result["status"] == "ready" and result["next_phase"] == "finish"), (
            f"a reviewer assessment with no verdict advanced to finish — {result}"
        )

    def test_missing_verdict_line_blocks_with_reason(self, tmp_path):
        result = _resolve_review(tmp_path, verdict=None)

        assert result["status"] == "blocked"
        assert "verdict" in (result.get("error") or "").lower()

    def test_empty_verdict_value_blocks(self, tmp_path):
        result = _resolve_review(tmp_path, verdict="")

        assert result["status"] == "blocked"

    def test_unrecognized_verdict_word_does_not_count_as_approval(self, tmp_path):
        """`looks good` is exactly what the approval gate forbids."""
        result = _resolve_review(tmp_path, verdict="looks good to me")

        assert result["next_phase"] != "finish", (
            f"a prose non-verdict was treated as approval — result: {result}"
        )

    def test_no_reviewer_assessment_section_at_all_blocks(self, tmp_path):
        """Session carries some other assessment but no reviewer verdict."""
        session = _make_session(verdict="REJECTED")
        session = session[: session.index("## Reviewer Assessment")]
        session += "## Dev Assessment\n\nImplementation complete.\n"
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "blocked"
        assert result["next_phase"] != "finish"


# ===========================================================================
# AC6: scope — only where declared, and only the current cycle's verdict
# ===========================================================================


class TestReworkScope:
    def test_review_gate_without_recovery_does_not_invent_a_target(self, tmp_path):
        """No recovery config → no rework target may be fabricated."""
        project = _setup_project(
            tmp_path,
            _strip_review_recovery(_load_real_tdd()),
            _make_session(verdict="REJECTED"),
        )

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result.get("recovery_config") is None
        assert result["next_phase"] != "green"

    def test_earlier_phases_are_unaffected_by_a_stale_verdict(self, tmp_path):
        """A REJECTED string left in the session must not reroute the red gate."""
        project = _setup_project(
            tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED", phase="red")
        )

        result = resolve_gate(STORY_ID, "tdd", "red", project_root=project)

        assert result["status"] == "ready"
        assert result["next_phase"] == "green"
        assert "rework" not in (result.get("gate_type") or "")

    def test_current_cycle_rejection_wins_over_earlier_approval(self, tmp_path):
        """Rework sessions accumulate assessments — the LAST one is current.

        The dangerous direction: cycle 1 approved, cycle 2 rejected. A parser
        that matches the FIRST `## Reviewer Assessment` reads the stale
        approval and archives a rejected story (the 162-5 defect class).
        """
        session = _make_session(verdict="APPROVED") + _reviewer_assessment(
            "REJECTED", cycle_note="**Cycle:** 2\n"
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["next_phase"] == "green", (
            f"a stale earlier APPROVED verdict overrode the current rejection — {result}"
        )

    def test_current_cycle_approval_wins_over_earlier_rejection(self, tmp_path):
        """The benign direction: rejected then fixed then approved → finish."""
        session = _make_session(verdict="REJECTED") + _reviewer_assessment(
            "APPROVED", cycle_note="**Cycle:** 2\n"
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["next_phase"] == "finish"

    def test_recovery_config_is_still_returned_on_rework(self, tmp_path):
        """Story 143-10's contract must not regress while fixing the routing."""
        result = _resolve_review(tmp_path, verdict="REJECTED")

        recovery = result.get("recovery_config") or {}
        assert recovery.get("reviewer-verdict", {}).get("target_phase") == "green"

    def test_missing_target_phase_in_recovery_blocks_rather_than_finishing(self, tmp_path):
        """A malformed recovery block must not degrade into "advance to finish"."""
        workflow = _load_real_tdd()
        for phase in workflow["workflow"]["phases"]:
            if phase["name"] == "review":
                phase["gate"]["recovery"]["reviewer-verdict"].pop("target_phase")
        project = _setup_project(tmp_path, workflow, _make_session(verdict="REJECTED"))

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["next_phase"] != "finish", (
            f"malformed recovery config fell through to archival — {result}"
        )

    def test_recovery_target_phase_must_exist_in_the_workflow(self, tmp_path):
        """A target_phase naming a nonexistent phase is an error, not a silent skip."""
        workflow = _load_real_tdd()
        for phase in workflow["workflow"]["phases"]:
            if phase["name"] == "review":
                phase["gate"]["recovery"]["reviewer-verdict"]["target_phase"] = "nope"
        project = _setup_project(tmp_path, workflow, _make_session(verdict="REJECTED"))

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] in ("blocked", "error")
        assert result["next_phase"] != "finish"
