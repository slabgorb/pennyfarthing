"""Rework routing must reach every approval gate, and must not fire twice for
one verdict.

Story 162-47, Cluster A item 7 and Cluster B item 3.
Epic: 162 (Finish & sprint-tooling truthfulness)

- [AC-A7] 162-21's fix is keyed on the PRESENCE of a ``rework`` recovery block,
          so the 162-2 defect survives verbatim in every workflow that declares
          an approval gate without one — ``bdd``, ``bdd-team``, ``tdd-team``,
          ``2party-tdd``, ``trivial``, ``agent-docs`` (6 of the 9 workflows
          declaring ``type: approval``; ``kitchen-sink`` makes a seventh that the
          source review did not count). A REJECTED review in those still resolves
          to the linear next phase. Probed options: "either add the recovery block
          to each or make an approval gate's verdict authoritative regardless of
          recovery." Both layers are checked here — the routing behaviour in
          Python and the declaration in the YAML.

          The tell the 162-2 investigation used is the invariant pinned below:
          APPROVED and REJECTED must not produce the byte-identical result. The
          ``_rework`` suffix on the resolved ``gate_type`` is load-bearing —
          ``complete_phase`` keys round-trip tracking, and therefore the
          ``max_attempts`` ceiling, off ``"rework" in gate_type``.

- [AC-B3] **Live incident, 162-49.** ``resolve-gate`` re-read the STALE round-1
          REJECTED verdict after the rework round had already been dispatched and
          returned ``approval_rework`` / ``dev`` / ``green`` while the session sat
          at ``review`` with rework pushed — nearly a double phase-advance. The
          gate must recognize a COMPLETED rework round.

          Pinned here as the OBSERVABLE invariant, with mechanism latitude for
          Dev (round-trip counter vs verdict staleness vs requiring the cycle-2
          verdict): **a reviewer verdict that has already been routed to rework
          must never be handed a second rework round.** Every rework round needs
          its own reviewer verdict. Approvals are deliberately out of scope —
          staleness on the approve path is ``_check_rework_freshness``'s subject,
          and widening this guard to approvals would block a reviewer who
          corrected its own section in place.
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from pf.handoff.complete_phase import complete_phase
from pf.handoff.resolve_gate import resolve_gate
from pf.handoff.session_assessment import assessment_heading
from pf.tests.test_162_21_resolve_gate_rejected_verdict import (
    STORY_ID,
    _load_real_tdd,
    _make_session,
    _resolve_review,
    _reviewer_assessment,
    _setup_project,
)
from pf.tests.test_162_47_gate_parity import _NONE_ENABLED

WORKFLOWS_DIR = Path(__file__).parents[3] / "workflows"


@pytest.fixture
def no_subagents_required():
    """Every specialist disabled — the routing invariant is what is under test.

    AC-A8 makes ``complete_phase`` enforce the specialist subgates on the rework
    path too; with the toggles off, the end-to-end cases below measure the
    double-advance and nothing else.
    """
    with patch("pf.settings.settings.get_setting", return_value=_NONE_ENABLED):
        yield


# ===========================================================================
# Discovery — every approval-gated `review` phase in every shipped workflow
# ===========================================================================


def _workflow_files() -> list[Path]:
    if not WORKFLOWS_DIR.is_dir():  # pragma: no cover - packaging guard
        return []
    return sorted(WORKFLOWS_DIR.glob("*.yaml")) + sorted(WORKFLOWS_DIR.glob("*/workflow.yaml"))


def _workflow_name(path: Path) -> str:
    return path.parent.name if path.name == "workflow.yaml" else path.stem


def _approval_review_gates() -> list:
    """Approval-gated ``review`` phases — the code-review checkpoint.

    Scoped to the phase NAMED ``review`` on purpose. ``2party-tdd`` also puts
    ``type: approval`` on six SM/Dev phases that are human sign-off checkpoints
    with no agent verdict to read; requiring a rework recovery there would be
    meaningless. Discovery rather than a hardcoded list, so a workflow added
    later cannot reintroduce the defect unnoticed.
    """
    params = []
    for path in _workflow_files():
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:  # pragma: no cover - validated elsewhere
            continue
        phases = (data.get("workflow") or {}).get("phases") or []
        for phase in phases:
            gate = phase.get("gate") or {}
            if gate.get("type") == "approval" and phase.get("name") == "review":
                params.append(
                    pytest.param(
                        path,
                        phase.get("agent", "reviewer"),
                        id=f"{_workflow_name(path)}:review",
                    )
                )
    return params


APPROVAL_REVIEW_GATES = _approval_review_gates()

if not APPROVAL_REVIEW_GATES:  # pragma: no cover - packaging guard
    pytest.skip("no shipped workflows found", allow_module_level=True)


_SESSION = textwrap.dedent("""\
    ---
    story_id: "{story_id}"
    workflow: "{workflow}"
    ---
    # Story {story_id}: approval-gate rework recovery

    ## Workflow Tracking
    **Workflow:** {workflow}
    **Phase:** review
    **Phase Started:** 2026-08-07T13:00:00Z
    {rt_line}
    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | review | 2026-08-07T13:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Result | Timestamp |
    |------|----|------|--------|-----------|

    ## Subagent Results

    | # | Specialist | Received | Status |
    |---|------------|----------|--------|
    | 1 | reviewer-preflight | Yes | clean |

    All received: Yes

    ## {heading}

    **Verdict:** {verdict}

    - [EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE]
    """)


def _resolve(
    tmp_path: Path,
    wf_path: Path,
    agent: str,
    verdict: str,
    round_trip_count: int | None = None,
) -> dict:
    name = _workflow_name(wf_path)
    session = _SESSION.format(
        story_id=STORY_ID,
        workflow=name,
        heading=assessment_heading(agent),
        verdict=verdict,
        rt_line=(
            f"**Round-Trip Count:** {round_trip_count}\n" if round_trip_count is not None else ""
        ),
    )
    project = tmp_path / "project"
    (project / ".pennyfarthing" / "workflows").mkdir(parents=True, exist_ok=True)
    (project / ".pennyfarthing" / "workflows" / f"{name}.yaml").write_text(
        wf_path.read_text(encoding="utf-8"), encoding="utf-8"
    )
    (project / ".session").mkdir(exist_ok=True)
    (project / ".session" / f"{STORY_ID}-session.md").write_text(session, encoding="utf-8")
    return resolve_gate(STORY_ID, name, "review", project_root=project)


# ===========================================================================
# AC-A7: every approval-gated review honours its verdict — Python layer
# ===========================================================================


class TestEveryApprovalGateHonoursTheVerdict:
    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_a_rejected_verdict_resolves_as_rework(self, tmp_path, wf_path, agent) -> None:
        result = _resolve(tmp_path, wf_path, agent, "REJECTED — 2 blocking findings")

        assert result["status"] == "ready", (
            f"a REJECTED review did not resolve to a rework round in "
            f"{_workflow_name(wf_path)} — {result}"
        )
        assert "rework" in (result["gate_type"] or ""), (
            "the resolved gate_type is not marked as rework, so complete_phase "
            "will neither increment the Round-Trip Count nor apply the "
            f"max_attempts ceiling — {result}"
        )
        assert result["next_phase"], result
        assert result["next_agent"], result

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_a_rejection_and_an_approval_do_not_resolve_identically(
        self, tmp_path, wf_path, agent
    ) -> None:
        """The tell the 162-2 investigation used.

        The defect's signature was that both verdicts returned byte-identical
        routing; on approval the gate was right only by accident.
        """
        rejected = _resolve(tmp_path / "r", wf_path, agent, "REJECTED")
        approved = _resolve(tmp_path / "a", wf_path, agent, "APPROVED")

        assert (rejected["gate_type"], rejected["next_phase"], rejected["next_agent"]) != (
            approved["gate_type"],
            approved["next_phase"],
            approved["next_agent"],
        ), (
            f"{_workflow_name(wf_path)} emits identical routing for APPROVED and "
            f"REJECTED — the 162-2 defect verbatim: {rejected}"
        )

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_an_approved_verdict_still_advances(self, tmp_path, wf_path, agent) -> None:
        """Control: adding recovery must not divert an approval into rework."""
        result = _resolve(tmp_path, wf_path, agent, "APPROVED")

        assert result["status"] == "ready", result
        assert "rework" not in (result["gate_type"] or ""), (
            f"an APPROVED review was routed as rework in {_workflow_name(wf_path)} — {result}"
        )

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_the_rework_loop_has_a_ceiling(self, tmp_path, wf_path, agent) -> None:
        """A rework loop with no ceiling is an infinite one — 99 must exhaust it."""
        result = _resolve(tmp_path, wf_path, agent, "REJECTED", round_trip_count=99)

        assert result["status"] == "blocked", (
            f"{_workflow_name(wf_path)} handed out a 100th rework round — {result}"
        )
        assert result["next_phase"] != "finish", result

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_an_unreadable_verdict_never_advances(self, tmp_path, wf_path, agent) -> None:
        """Fail closed: prose is not a verdict, in every workflow."""
        result = _resolve(tmp_path, wf_path, agent, "looks good to me")

        assert result["status"] == "blocked", (
            f"{_workflow_name(wf_path)} advanced on a verdict it could not classify — {result}"
        )


# ===========================================================================
# AC-A7: the YAML layer — declarations must be valid, not merely present
# ===========================================================================


class TestApprovalGateRecoveryDeclarations:
    """A recovery block that names a phase the workflow does not have is worse
    than none: ``resolve_gate`` returns ``error`` on the rework path, which
    wedges the review rather than routing it.
    """

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_the_gate_declares_a_rework_recovery(self, wf_path, agent) -> None:
        gate = _review_gate(wf_path)
        recovery = gate.get("recovery") or {}

        rework = [
            entry
            for entry in recovery.values()
            if isinstance(entry, dict) and entry.get("action") == "rework"
        ]
        assert rework, (
            f"{_workflow_name(wf_path)}'s approval gate declares no rework "
            "recovery, so a REJECTED review resolves to the linear next phase "
            "(the 162-2 defect)"
        )

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_the_rework_target_is_an_earlier_phase_of_the_same_workflow(
        self, wf_path, agent
    ) -> None:
        data = yaml.safe_load(wf_path.read_text(encoding="utf-8"))
        names = [p["name"] for p in data["workflow"]["phases"]]
        recovery = (_review_gate(wf_path).get("recovery") or {}).values()

        for entry in recovery:
            if not isinstance(entry, dict) or entry.get("action") != "rework":
                continue
            target = entry.get("target_phase")
            assert target in names, (
                f"{_workflow_name(wf_path)} declares target_phase {target!r}, "
                f"which is not a phase of the workflow: {names}"
            )
            assert names.index(target) < names.index("review"), (
                f"{_workflow_name(wf_path)}'s rework target {target!r} is not "
                "earlier than 'review', so the loop cannot send work back"
            )

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_the_rework_loop_declares_a_positive_attempt_limit(self, wf_path, agent) -> None:
        recovery = (_review_gate(wf_path).get("recovery") or {}).values()

        for entry in recovery:
            if not isinstance(entry, dict) or entry.get("action") != "rework":
                continue
            limit = entry.get("max_attempts")
            assert isinstance(limit, int) and not isinstance(limit, bool), (
                f"{_workflow_name(wf_path)} declares max_attempts {limit!r}, "
                "which is not an integer"
            )
            assert limit >= 1, f"{_workflow_name(wf_path)} declares max_attempts {limit}"


def _review_gate(wf_path: Path) -> dict:
    data = yaml.safe_load(wf_path.read_text(encoding="utf-8"))
    for phase in data["workflow"]["phases"]:
        if phase["name"] == "review":
            return phase.get("gate") or {}
    raise AssertionError(f"no review phase in {wf_path}")  # pragma: no cover


# ===========================================================================
# AC-B3: a completed rework round never re-routes to rework
# ===========================================================================


class TestACompletedReworkRoundNeverReRoutesToRework:
    """The 162-49 near-miss: one rejection, two rework rounds.

    ``resolve_gate`` reads the LAST ``## Reviewer Assessment`` section. After
    rework is dispatched the reviewer has not written a new one yet, so the same
    round-1 REJECTED section is still the last — and still resolves to
    ``approval_rework`` / ``dev`` / ``green``. Re-running the exit protocol at
    ``review`` therefore advances the phase a second time on a verdict that has
    already been acted on.
    """

    def test_a_verdict_already_routed_does_not_earn_a_second_rework(self, tmp_path) -> None:
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=1)

        assert result["status"] == "blocked", (
            "the round-1 rejection was handed a second rework round — the double "
            f"phase-advance observed live in 162-49: {result}"
        )
        assert result["next_phase"] != "green", result

    def test_the_block_is_actionable(self, tmp_path) -> None:
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=1)

        error = (result.get("error") or "").lower()
        assert "reviewer assessment" in error, (
            f"the block does not name the section the reviewer must add — {result.get('error')!r}"
        )
        assert "cycle" in error or "round" in error, result.get("error")

    def test_a_fresh_verdict_for_the_current_round_does_route_to_rework(self, tmp_path) -> None:
        """Control: the guard must not wedge a genuine second rejection.

        Two exact ``## Reviewer Assessment`` sections and one recorded round-trip
        — the reviewer has ruled on the reworked code.
        """
        result = _resolve_review(
            tmp_path,
            verdict="REJECTED",
            round_trip_count=1,
            extra_assessments=_reviewer_assessment("REJECTED — still not fixed"),
        )

        assert result["status"] == "ready", f"a genuine cycle-2 rejection was blocked — {result}"
        assert result["next_phase"] == "green", result
        assert result["gate_type"] == "approval_rework", result

    def test_the_first_rejection_still_routes(self, tmp_path) -> None:
        """Control: no counter yet means no round has been dispatched."""
        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["status"] == "ready", result
        assert result["next_phase"] == "green", result

    def test_a_third_round_needs_a_third_verdict(self, tmp_path) -> None:
        """Two sections against two recorded round-trips is stale again."""
        result = _resolve_review(
            tmp_path,
            verdict="REJECTED",
            round_trip_count=2,
            extra_assessments=_reviewer_assessment("REJECTED — cycle 2"),
        )

        assert result["status"] == "blocked", (
            f"the cycle-2 rejection was reused for a third round — {result}"
        )

    def test_an_approval_is_not_treated_as_stale(self, tmp_path) -> None:
        """Scope control: approvals are ``_check_rework_freshness``'s subject.

        A reviewer that corrected its own section in place from REJECTED to
        APPROVED must not be wedged by this guard; the freshness tag in
        ``complete_phase`` is what holds it to a re-verified table.
        """
        result = _resolve_review(tmp_path, verdict="APPROVED", round_trip_count=1)

        assert result["status"] == "ready", result
        assert result["next_phase"] == "finish", result

    def test_the_max_attempts_ceiling_still_wins(self, tmp_path) -> None:
        """Control: a fresh verdict at the ceiling blocks on the ceiling."""
        result = _resolve_review(
            tmp_path,
            verdict="REJECTED",
            round_trip_count=3,
            extra_assessments=(
                _reviewer_assessment("REJECTED — cycle 2")
                + _reviewer_assessment("REJECTED — cycle 3")
                + _reviewer_assessment("REJECTED — cycle 4")
            ),
        )

        error = (result.get("error") or "").lower()
        assert result["status"] == "blocked", result
        assert "max" in error and "attempt" in error, result.get("error")

    def test_no_double_phase_advance_end_to_end(self, tmp_path, no_subagents_required) -> None:
        """The live incident, reproduced through the real exit protocol.

        Round 1 resolves and completes. Re-running ``resolve-gate`` for ``review``
        — which is what happened in 162-49 when the gate was re-resolved mid-rework
        — must not sanction a second ``review → green`` transition.
        """
        project = _setup_project(tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED"))

        first = resolve_gate(STORY_ID, "tdd", "review", project_root=project)
        assert first["status"] == "ready" and first["next_phase"] == "green", first

        completed = complete_phase(
            STORY_ID, "tdd", "review", "green", first["gate_type"], project_root=project
        )
        assert completed["status"] == "success", completed

        second = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert second["status"] == "blocked", (
            "the same reviewer rejection sanctioned a second review→green "
            f"transition — a double phase-advance: {second}"
        )
        assert second["next_phase"] != "green", second

    def test_the_round_trip_count_only_advanced_once(self, tmp_path, no_subagents_required) -> None:
        """The measurable consequence: one rejection, one recorded round-trip."""
        project = _setup_project(tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED"))
        session_file = project / ".session" / f"{STORY_ID}-session.md"

        first = resolve_gate(STORY_ID, "tdd", "review", project_root=project)
        complete_phase(STORY_ID, "tdd", "review", "green", first["gate_type"], project_root=project)
        second = resolve_gate(STORY_ID, "tdd", "review", project_root=project)
        if second["status"] == "ready":
            complete_phase(
                STORY_ID, "tdd", "review", "green", second["gate_type"], project_root=project
            )

        text = session_file.read_text(encoding="utf-8")
        assert "**Round-Trip Count:** 1" in text, (
            f"the counter advanced past one round on a single rejection — {text}"
        )
