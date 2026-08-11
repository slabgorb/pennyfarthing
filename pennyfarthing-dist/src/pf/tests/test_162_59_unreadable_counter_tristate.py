"""A corrupt round-trip counter must never buy a rework round (Story 162-59).

Epic: 162 (Finish & sprint-tooling truthfulness)

``read_round_trip_count`` distinguishes ``unreadable`` from ``absent`` on a
stated principle: *"I cannot read the counter" is not "there was no rework"*
(story 162-28). ``parse_round_trip_count`` returns only ``["count"]``, which is
``0`` for ``unreadable`` — so the one production consumer of the flat shape,
``resolve_gate``, reads a corrupt counter as "no rework has happened yet".

RE-MEASURED first-hand at 4b8035d2d before these tests were written, against the
real ``workflows/tdd.yaml`` (``max_attempts: 3``), one completed rework round,
one exact ``## Reviewer Assessment`` section, verdict REJECTED::

    counter '1'      read=found/1       -> blocked   (AC-B3 freshness guard)
    counter '3'      read=found/3       -> blocked   (max_attempts ceiling)
    counter 'one'    read=unreadable/0  -> ready  approval_rework  dev/green
    counter 'three'  read=unreadable/0  -> ready  approval_rework  dev/green
    counter '3.'     read=unreadable/0  -> ready  approval_rework  dev/green
    counter '-3'     read=unreadable/0  -> ready  approval_rework  dev/green
    <!-- hidden -->  read=unreadable/0  -> ready  approval_rework  dev/green

One unparseable byte disarms BOTH independent controls at once, and every
HIDING form 162-28 was written to defeat works again through this door. This is
a fail-OPEN in the machinery that decides whether rejected work may advance.

Acceptance criteria under test:

- [AC1] **The observable invariant.** When the operative counter line is present
        but UNREADABLE — unparseable value or hidden in a fence, HTML comment,
        backticks or an indented block — a rework verdict must not be handed a
        rework round: not ``status: ready``, no ``_rework`` on the resolved
        ``gate_type`` (``complete_phase`` keys the counter increment and the
        ceiling off that suffix), and no forward routing in either direction.
        Mechanism is Dev's choice; this is the behaviour.

- [AC2] **Both controls stay armed.** The corruption must not be able to reach
        past either the AC-B3 freshness guard (a verdict already routed to
        rework) or the ``max_attempts`` ceiling. Each is pinned with a control
        case proving that control — and only that control — was the operative
        blocker before the counter was corrupted.

- [AC3] **The block diagnoses, it does not wedge.** A genuinely corrupt counter
        is recoverable by a human: the error names the field, the session file
        and a remedy, and restoring a plain integer resolves the gate normally.

- [AC4] **One truth, one place.** No production module may consume the
        flattened count. Swept at 4b8035d2d: ``parse_round_trip_count`` has
        exactly ONE production call site (``resolve_gate``, the one that must
        not flatten) and ``complete_phase._parse_rework_cycle`` has none — the
        tri-state-aware ``_read_rework_cycle`` is what the freshness guard uses.
        The lossy accessors' only remaining job in production is to commit this
        defect. Dev may delete them or keep them test-only; production must
        consult ``status``.

- [AC5] **Controls that must survive.** A genuinely absent counter is still an
        initial review; a readable counter still routes rework; and an APPROVED
        verdict with a corrupt counter is still stopped by the approval gate's
        freshness subcheck.

Boundary — deliberately NOT tested here: 162-50 (the counter WRITER's tri-state
— measured: an unreadable operative line makes the writer INSERT a fresh
``**Round-Trip Count:** 1`` beside it), 162-63 (AC-B3 counting headings rather
than rulings), 162-60 (heading case-sensitivity, including
``_PREAMBLE_END_RE``).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

from pf.handoff.complete_phase import _check_approval_requirements
from pf.handoff.gate_recovery import read_round_trip_count
from pf.handoff.resolve_gate import resolve_gate
from pf.handoff.session_assessment import assessment_heading
from pf.tests.test_162_21_resolve_gate_rejected_verdict import (
    FENCE,
    STORY_ID,
    _load_real_tdd,
    _make_session,
    _reviewer_assessment,
    _setup_project,
)
from pf.tests.test_162_47_rework_routing import (
    _SESSION,
    APPROVAL_REVIEW_GATES,
    _workflow_name,
)

# The line `_SESSION_TEMPLATE` puts the counter under, and the anchor this file
# splices a RAW counter block onto — the templated helpers only accept an int,
# and an unparseable value is the whole subject here.
_ANCHOR = "**Phase Started:** 2026-08-06T13:00:00Z"

PF_SRC = Path(__file__).parents[1]


# Every shape that makes the operative counter unreadable. The value forms are
# the ones `ROUND_TRIP_COUNT_RE` deliberately refuses (its docstring names `2.0`
# and `1_000` as the reason it is anchored and digits-only) — the refusal is
# exactly what opens the bypass. The hiding forms are 162-28's original attack
# vectors, reachable again through this consumer.
CORRUPTIONS = [
    pytest.param("**Round-Trip Count:** one", id="spelled-out-word"),
    pytest.param("**Round-Trip Count:** 1 (after rework)", id="trailing-annotation"),
    pytest.param("**Round-Trip Count:** 1_000", id="underscored-digits"),
    pytest.param("**Round-Trip Count:** 3.", id="trailing-decimal-point"),
    pytest.param("**Round-Trip Count:** -3", id="negative-value"),
    pytest.param("**Round-Trip Count:**", id="empty-value"),
    pytest.param("<!-- **Round-Trip Count:** 2 -->", id="hidden-in-html-comment"),
    pytest.param("`**Round-Trip Count:** 2`", id="hidden-in-backticks"),
    pytest.param(f"{FENCE}\n**Round-Trip Count:** 2\n{FENCE}", id="hidden-in-fence"),
    pytest.param("    **Round-Trip Count:** 3", id="indented-out-of-column-0"),
]


def _session_with_counter_block(
    counter_block: str,
    *,
    verdict: str | None = "REJECTED",
    rulings: int = 1,
) -> str:
    """A review-phase session whose counter line is ``counter_block`` verbatim.

    ``rulings`` is how many exact ``## Reviewer Assessment`` sections the session
    carries — what AC-B3 compares against the counter.
    """
    extra = "".join(_reviewer_assessment(verdict) for _ in range(rulings - 1))
    session = _make_session(verdict=verdict, extra_assessments=extra)
    return session.replace(_ANCHOR, f"{_ANCHOR}\n{counter_block}", 1)


def _resolve_with_counter_block(
    tmp_path: Path,
    counter_block: str,
    *,
    verdict: str | None = "REJECTED",
    rulings: int = 1,
) -> dict:
    session = _session_with_counter_block(counter_block, verdict=verdict, rulings=rulings)
    project = _setup_project(tmp_path, _load_real_tdd(), session)
    return resolve_gate(STORY_ID, "tdd", "review", project_root=project)


def _assert_no_rework_round(result: dict, context: str) -> None:
    """The AC1 invariant, in one place: no rework round was dispatched.

    Deliberately silent about WHICH non-advancing status Dev chooses — blocked
    and error both satisfy the invariant. What it refuses is any outcome that
    moves the story: `_rework` on the gate_type is what makes `complete_phase`
    increment the counter and apply the ceiling, so it is checked separately
    from the routing fields.
    """
    assert result["status"] != "ready", (
        f"{context}: an unreadable round-trip counter bought a rework round — "
        f"'I cannot read the counter' was treated as 'there was no rework' "
        f"(story 162-28's principle, inverted). Full result: {result}"
    )
    assert "rework" not in (result["gate_type"] or ""), (
        f"{context}: the resolved gate_type is marked as rework, so complete_phase "
        f"will increment the Round-Trip Count and re-arm the loop off a counter no "
        f"reader can read. Full result: {result}"
    )
    assert result["next_phase"] is None and result["next_agent"] is None, (
        f"{context}: the gate still routed forward on an unreadable counter. Full result: {result}"
    )
    assert result["next_phase"] != "finish", (
        f"{context}: a REJECTED review with a corrupt counter was routed to "
        f"archival. Full result: {result}"
    )


# ===========================================================================
# AC1: an unreadable counter must not buy a rework round
# ===========================================================================


class TestAnUnreadableCounterCannotBuyAReworkRound:
    @pytest.mark.parametrize("counter_block", CORRUPTIONS)
    def test_the_fixture_really_is_unreadable_and_not_absent(self, counter_block) -> None:
        """Guard against this file rotting into a suite that tests nothing.

        If a corruption form ever reads as ``absent`` instead of ``unreadable``,
        the case below would pass for the wrong reason — an absent counter is
        legitimately allowed to route rework.
        """
        session = _session_with_counter_block(counter_block)
        reading = read_round_trip_count(session)

        assert reading["status"] == "unreadable", (
            f"fixture {counter_block!r} reads as {reading['status']!r}, not "
            f"'unreadable' — the case it is meant to exercise no longer exists"
        )
        assert reading["count"] == 0, (
            f"an unreadable reading carries a non-zero count {reading['count']}, "
            "which would make the flattening harmless and this suite moot"
        )
        assert reading["detail"], (
            "an unreadable reading carries no detail, so no caller can tell the "
            "human WHY the counter could not be read"
        )

    @pytest.mark.parametrize("counter_block", CORRUPTIONS)
    def test_an_unreadable_counter_does_not_resolve_to_a_rework_round(
        self, tmp_path, counter_block
    ) -> None:
        """The defect, stated directly, in every form that reaches it."""
        result = _resolve_with_counter_block(tmp_path, counter_block)

        _assert_no_rework_round(result, f"counter block {counter_block!r}")

    @pytest.mark.parametrize(("wf_path", "agent"), APPROVAL_REVIEW_GATES)
    def test_no_shipped_workflow_lets_a_corrupt_counter_through(
        self, tmp_path, wf_path, agent
    ) -> None:
        """Discovery, not a hardcoded list — the 162-47 AC-A7 lesson.

        A guard added to one workflow's path is a guard a workflow added later
        can walk around.
        """
        name = _workflow_name(wf_path)
        session = _SESSION.format(
            story_id=STORY_ID,
            workflow=name,
            heading=assessment_heading(agent),
            verdict="REJECTED — 2 blocking findings",
            rt_line="**Round-Trip Count:** one\n",
        )
        project = tmp_path / "project"
        (project / ".pennyfarthing" / "workflows").mkdir(parents=True, exist_ok=True)
        (project / ".pennyfarthing" / "workflows" / f"{name}.yaml").write_text(
            wf_path.read_text(encoding="utf-8"), encoding="utf-8"
        )
        (project / ".session").mkdir(exist_ok=True)
        (project / ".session" / f"{STORY_ID}-session.md").write_text(session, encoding="utf-8")

        result = resolve_gate(STORY_ID, name, "review", project_root=project)

        _assert_no_rework_round(result, f"workflow {name}")


# ===========================================================================
# AC2: both controls the corruption defeats must stay armed
# ===========================================================================


class TestBothControlsStayArmed:
    """Each control is pinned with the case proving IT was the blocker.

    Without the control case a passing guard test cannot tell "the corruption
    was caught" from "this session was going to block anyway".
    """

    def test_control_the_freshness_guard_is_the_blocker_at_one_ruling(self, tmp_path) -> None:
        result = _resolve_with_counter_block(tmp_path, "**Round-Trip Count:** 1", rulings=1)

        assert result["status"] == "blocked", (
            f"the AC-B3 freshness guard no longer blocks a verdict already routed "
            f"to rework, so the corruption case below proves nothing: {result}"
        )
        assert "already been routed" in (result["error"] or ""), (
            f"blocked for some reason other than AC-B3 freshness: {result}"
        )

    def test_the_freshness_guard_survives_a_corrupt_counter(self, tmp_path) -> None:
        """One completed rework round, one ruling — the 162-49 live incident.

        With the counter readable this blocks. Corrupt it and the counter reads
        0, so ``rulings (1) > round_trips (0)`` and the stale verdict is handed a
        second rework round: 162-47's AC-B3 guard, disarmed from the side.
        """
        result = _resolve_with_counter_block(tmp_path, "**Round-Trip Count:** one", rulings=1)

        _assert_no_rework_round(result, "AC-B3 freshness guard with a corrupt counter")

    def test_control_the_ceiling_is_the_blocker_at_the_max(self, tmp_path) -> None:
        """Four rulings clears AC-B3, so ``max_attempts`` is what stops this."""
        result = _resolve_with_counter_block(tmp_path, "**Round-Trip Count:** 3", rulings=4)

        assert result["status"] == "blocked", (
            f"the max_attempts ceiling no longer blocks at 3 round-trips, so the "
            f"corruption case below proves nothing: {result}"
        )
        assert "ax_attempts" in (result["error"] or ""), (
            f"blocked for some reason other than the ceiling: {result}"
        )

    def test_the_max_attempts_ceiling_survives_a_corrupt_counter(self, tmp_path) -> None:
        """The same session, one byte changed — an unlimited rework loop."""
        result = _resolve_with_counter_block(tmp_path, "**Round-Trip Count:** three", rulings=4)

        _assert_no_rework_round(result, "max_attempts ceiling with a corrupt counter")


# ===========================================================================
# AC3: the block diagnoses and does not wedge
# ===========================================================================


class TestTheBlockDiagnosesRatherThanWedges:
    """A guard that blocks forever with no diagnosis is a different failure.

    A genuinely corrupt counter — hand-editing this line is live practice — must
    leave a human a way out.
    """

    @pytest.mark.parametrize("counter_block", CORRUPTIONS)
    def test_the_error_names_the_field_the_file_and_a_remedy(self, tmp_path, counter_block) -> None:
        result = _resolve_with_counter_block(tmp_path, counter_block)
        error = result["error"] or ""

        assert "Round-Trip Count" in error, (
            f"the block does not name the field the human has to repair, so the "
            f"only way to find it is to read the source: {error!r}"
        )
        assert f"{STORY_ID}-session.md" in error, (
            f"the block does not name the file carrying the bad line: {error!r}"
        )
        assert "To fix:" in error, (
            f"the block carries no remedy — the house convention every other "
            f"resolve_gate stop follows: {error!r}"
        )
        assert re.search(r"own line|plain integer|outside", error), (
            f"the remedy does not say what a readable counter looks like, so a "
            f"human cannot tell a fix from another rejected edit: {error!r}"
        )

    def test_repairing_the_counter_resolves_the_gate(self, tmp_path) -> None:
        """The anti-wedge measurement: the same session, counter repaired.

        Two rulings against one recorded round-trip is a genuinely fresh
        cycle-2 verdict under the ceiling, so once the counter is readable the
        gate must route rework as it always did. If this fails, the guard is a
        trap rather than a check.
        """
        blocked = _resolve_with_counter_block(
            tmp_path / "corrupt", "**Round-Trip Count:** one", rulings=2
        )
        _assert_no_rework_round(blocked, "before repair")

        repaired = _resolve_with_counter_block(
            tmp_path / "fixed", "**Round-Trip Count:** 1", rulings=2
        )

        assert repaired["status"] == "ready", (
            f"repairing the counter did not clear the block — the session is "
            f"wedged with no way out: {repaired}"
        )
        assert "rework" in (repaired["gate_type"] or ""), repaired
        assert (repaired["next_agent"], repaired["next_phase"]) == ("dev", "green"), repaired


# ===========================================================================
# AC4: one truth, one place — nothing in production reads the flat count
# ===========================================================================


def _flattening_call_sites() -> list[str]:
    """Every production call to a counter reader that drops the tri-state.

    AST rather than grep so the definitions, the docstrings that name them, and
    the tests that legitimately exercise them are not mistaken for consumers.
    """
    lossy = {"parse_round_trip_count", "_parse_rework_cycle"}
    hits: list[str] = []
    for path in sorted(PF_SRC.rglob("*.py")):
        if "tests" in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):  # pragma: no cover - packaging guard
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = (
                func.attr
                if isinstance(func, ast.Attribute)
                else func.id
                if isinstance(func, ast.Name)
                else None
            )
            if name in lossy:
                hits.append(f"{path.relative_to(PF_SRC)}:{node.lineno} -> {name}()")
    return hits


class TestOneTruthOnePlace:
    def test_no_production_module_consumes_the_flattened_count(self) -> None:
        """The producer's shape is the defect, not just the one caller.

        Swept at 4b8035d2d: the flat readers have exactly one production call
        site between them, and it is the one that must not flatten. A reader
        that answers "how many round-trips" with an int cannot answer "and can
        you actually read it" — leaving it callable is leaving the next consumer
        to rediscover this story. Dev may delete the accessors or keep them
        test-only; production must branch on ``status``.
        """
        hits = _flattening_call_sites()

        assert hits == [], (
            "production code still reads the round-trip counter through an "
            "accessor that flattens 'unreadable' to 0:\n  "
            + "\n  ".join(hits)
            + "\nUse read_round_trip_count()/_read_rework_cycle() and branch on "
            "['status'] — a corrupt counter must not read as 'no rework'."
        )


# ===========================================================================
# AC5: controls that must survive the fix
# ===========================================================================


class TestTheFixMustNotOverBlock:
    def test_a_genuinely_absent_counter_is_still_an_initial_review(self, tmp_path) -> None:
        """The tri-state's whole point: absent is not unreadable.

        A first review has no counter at all and must still be able to reject.
        A guard that blocks here would wedge every rejection in the pipeline.
        """
        project = _setup_project(tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED"))
        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "ready", (
            f"a first-cycle rejection with no counter was blocked — the fix "
            f"conflated 'absent' with 'unreadable': {result}"
        )
        assert (result["next_agent"], result["next_phase"]) == ("dev", "green"), result

    def test_a_readable_counter_still_routes_rework(self, tmp_path) -> None:
        result = _resolve_with_counter_block(tmp_path, "**Round-Trip Count:** 1", rulings=2)

        assert result["status"] == "ready", result
        assert "rework" in (result["gate_type"] or ""), result

    def test_an_approved_verdict_with_a_corrupt_counter_is_still_stopped(self) -> None:
        """The approve path's defence, pinned so the fix cannot cost it.

        ``resolve_gate`` never reads the counter on the approve path; the
        approval gate's ``_check_rework_freshness`` subcheck does, and it is
        scoped to the BARE ``approval`` gate_type. That scoping is why the
        rework path — resolved as ``approval_rework`` — has no tri-state
        defence anywhere today.
        """
        session = _session_with_counter_block("**Round-Trip Count:** one", verdict="APPROVED")

        problems = _check_approval_requirements(session, "approval")

        assert any("rework cycle" in p for p in problems), (
            "an APPROVED verdict over an unreadable counter raised no freshness "
            f"problem, so a corrupt counter can archive a story: {problems}"
        )
