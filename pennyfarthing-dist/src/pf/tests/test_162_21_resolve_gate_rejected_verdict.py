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
    | 2 | reviewer-edge-hunter | Yes | clean |
    | 3 | reviewer-silent-failure-hunter | Yes | clean |
    | 4 | reviewer-test-analyzer | Yes | clean |
    | 5 | reviewer-comment-analyzer | Yes | clean |
    | 6 | reviewer-type-design | Yes | clean |
    | 7 | reviewer-security | Yes | clean |
    | 8 | reviewer-simplifier | Yes | clean |
    | 9 | reviewer-rule-checker | Yes | clean |

    All received: Yes
    """)
# Every required specialist has a row, whatever the local toggles say. Story
# 162-47 (AC-A8) made the approval subgates run on the REWORK path too, so a
# rework transition through this fixture is now judged against the table — and a
# one-row table would fail the completion check for reasons no test here is
# about. A complete table is also the honest shape: this is what a real reviewer
# handoff carries.


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


def _session_header(phase: str = "review", round_trip_count: int | None = None) -> str:
    """Session file up to (not including) any assessment section."""
    return _SESSION_TEMPLATE.format(
        story_id=STORY_ID,
        phase=phase,
        rt_line=(
            f"**Round-Trip Count:** {round_trip_count}\n" if round_trip_count is not None else ""
        ),
    )


def _resolve_with_reviewer_body(tmp_path: Path, body: str, **header_kwargs) -> dict:
    """Resolve the review gate against a hand-built reviewer section.

    For the fence/heading-shadowing cases, where the exact byte layout of the
    section is the thing under test and the templated helpers are too tidy.
    """
    session = _session_header(**header_kwargs) + "\n## Reviewer Assessment\n\n" + body
    project = _setup_project(tmp_path, _load_real_tdd(), session)
    return resolve_gate(STORY_ID, "tdd", "review", project_root=project)


# A fenced block is spelled via a variable so this file's own fences cannot be
# confused with the fixture content it builds.
FENCE = "```"


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
            f"resolve_gate handed a REJECTED review to SM for archival — full result: {result}"
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
            # `BLOCKED` is in _REJECTION_WORDS and in the verdict table of
            # guides/handoff-cli.md. Documented vocabulary with no test is how
            # get_rework_recovery shipped unwired in 143-10.
            "BLOCKED",
            "BLOCKED — cannot approve until the migration lands",
        ],
    )
    def test_non_approved_verdict_shapes_all_rework(self, tmp_path, verdict):
        """Verdict detection cannot hinge on one exact uppercase spelling."""
        result = _resolve_review(tmp_path, verdict=verdict)

        assert result["next_phase"] == "green", (
            f"verdict {verdict!r} was treated as approval — result: {result}"
        )

    @pytest.mark.parametrize(
        "verdict",
        [
            "⛔ REJECT — return to Dev",
            "REJECT",
            "REQUEST-CHANGES",
            "CHANGES-REQUESTED",
        ],
    )
    def test_real_world_rejection_spellings_rework(self, tmp_path, verdict):
        """Rejection spellings that actually occur must route, not block.

        Ground truth from this repo's verdict history (same grep as the
        approval corpus). `REJECT` and `REQUEST-CHANGES` are non-APPROVED
        verdicts, so AC1 applies: they belong in the rework loop. Blocking
        them is fail-safe but leaves the story's own defect unfixed for a
        spelling reviewers demonstrably use.
        """
        result = _resolve_review(tmp_path, verdict=verdict)

        assert result["next_phase"] == "green", (
            f"verdict {verdict!r} neither reworked nor was recognized — result: {result}"
        )

    def test_rejection_prose_does_not_match_the_word_rejection(self, tmp_path):
        """`REJECT` must not match inside `rejection` — an approval says it often."""
        result = _resolve_review(
            tmp_path, verdict="APPROVED (2nd review — initial rejection resolved)"
        )

        assert result["next_phase"] == "finish"

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
        """A rejection is a known route, not an error: the exit protocol proceeds.

        The routing values are pinned here too. Asserting only ``status ==
        "ready"`` and ``error is None`` is byte-identical to the ORIGINAL bug's
        output (see the recorded pre-fix result in the TEA assessment) — such a
        test passes on the code it was written to condemn.
        """
        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["status"] == "ready"
        assert result["error"] is None
        assert result["next_phase"] == "green"
        assert result["next_agent"] == "dev"
        assert result["gate_type"] == "approval_rework"

    def test_end_to_end_exit_protocol_lands_on_green(self, tmp_path):
        """Mirror the CLI: resolve-gate's outputs feed complete-phase verbatim.

        This is the exact sequence that mis-advanced story 162-2 to finish.
        """
        project = _setup_project(tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED"))
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
        project = _setup_project(tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED"))
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
        project = _setup_project(tmp_path, _load_real_tdd(), _make_session(verdict="REJECTED"))
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

    @pytest.mark.parametrize(
        "verdict",
        [
            "APPROVED (round-trip 1 — Round 1 REJECTED, rework verified closed in Round 2)",
            "APPROVED (rework cycle 1 — initial verdict REJECTED, all 8 confirmed findings"
            " fixed in `919733546` and verified by fresh subagent dispatch)",
            "APPROVED (re-review r2; supersedes the round-1 REJECTED verdict above)",
            "APPROVED (2nd review — initial rejection resolved)",
        ],
    )
    def test_approval_citing_the_superseded_rejection_still_finishes(self, tmp_path, verdict):
        """An approval that names the round it supersedes is still an approval.

        Ground truth, not invented fixtures: the first three strings are real
        verdict lines from this repo's own session/archive history
        (``grep '^\\*\\*Verdict:\\*\\* APPROVED' .session/ sprint/ docs/``).
        Citing the prior rejection is the NORMAL way to write a post-rework
        approval — and it happens precisely inside the rework loop, where the
        Round-Trip Count is already ≥ 1. A parser that searches the whole line
        for rejection words converts this story's false-advance bug into a
        false-block bug: the approval routes back to Dev until max_attempts
        blocks, wedging a correctly-approved story.
        """
        result = _resolve_review(tmp_path, verdict=verdict)

        assert result["next_phase"] == "finish", (
            f"an APPROVED verdict citing the superseded rejection was sent back "
            f"to Dev — verdict {verdict!r}, result: {result}"
        )
        assert result["next_agent"] == "sm"
        assert "rework" not in (result.get("gate_type") or "")

    def test_approval_citing_a_rejection_finishes_even_mid_rework_loop(self, tmp_path):
        """The full wedge scenario: the misclassification fires at count ≥ 1.

        cycle 1 REJECTED (count→1), Dev fixes, reviewer approves while naming
        round 1. If that reads as rework the count climbs to max_attempts and
        the story blocks with "Max_attempts reached" despite being approved.
        """
        result = _resolve_review(
            tmp_path,
            verdict="APPROVED (round 1 REJECTED, now fixed)",
            round_trip_count=2,
        )

        assert result["status"] == "ready", (
            f"an approval was blocked by the rework ceiling — result: {result}"
        )
        assert result["next_phase"] == "finish"

    @pytest.mark.parametrize(
        "verdict",
        [
            "REJECTED (supersedes the round-1 APPROVED verdict above)",
            "NOT APPROVED — the earlier APPROVED no longer stands",
        ],
    )
    def test_rejection_citing_an_earlier_approval_still_reworks(self, tmp_path, verdict):
        """The mirror case must not regress while fixing the leading-token bug."""
        result = _resolve_review(tmp_path, verdict=verdict)

        assert result["next_phase"] == "green", (
            f"verdict {verdict!r} was treated as approval — result: {result}"
        )


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
        """Exhausting rework attempts must not fall through to archival.

        Story 162-47 replaced the compound negation
        ``not (status == "ready" and next_phase == "finish")`` with positive
        assertions. The old form was weaker than the adjacent
        ``test_at_max_attempts_rework_is_blocked``: it passed for any result
        that was merely not-both, including ``status: ready`` with
        ``next_phase: green`` — i.e. the 4th rework this class exists to refuse.
        """
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=3)

        assert result["status"] == "blocked", result
        assert result["next_phase"] is None, (
            f"an exhausted rework loop still nominated a next phase — {result}"
        )
        assert result["next_agent"] is None, result

    def test_max_attempts_block_error_is_actionable(self, tmp_path):
        result = _resolve_review(tmp_path, verdict="REJECTED", round_trip_count=3)

        error = (result.get("error") or "").lower()
        assert "max" in error and "attempt" in error, (
            f"block reason does not name the exhausted attempt limit: {result.get('error')!r}"
        )

    def test_one_below_max_attempts_still_reworks(self, tmp_path):
        """Story 162-47 (AC-B3) added the fresh-verdict requirement, so a session
        at round-trip 2 needs three reviewer rulings to be at round 3 legitimately
        — one per dispatched round. The subject is unchanged: 2 < max_attempts 3,
        so the ceiling must not block. Leaving the fixture at one ruling would
        have tested the staleness guard instead.
        """
        result = _resolve_review(
            tmp_path,
            verdict="REJECTED",
            round_trip_count=2,
            extra_assessments=(
                _reviewer_assessment("REJECTED — cycle 2")
                + _reviewer_assessment("REJECTED — cycle 3")
            ),
        )

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

    def test_unparseable_round_trip_count_does_not_buy_a_rework_round(self, tmp_path):
        """A corrupted count must degrade CLOSED, not raise and not advance.

        De-vacuumed by story 162-59. This test accepted ``status in ("ready",
        "blocked")`` — which sanctioned the exact fail-open it was standing
        over: a corrupt counter reads as 0 round-trips, so ``max_attempts`` and
        the AC-B3 freshness guard both see a session that has never reworked and
        hand out another round. ``next_phase != "finish"`` was satisfied by
        ``green``, so the assertion pair could not tell the defect from the fix.
        The corruption forms and the diagnostic contract are exercised in
        ``test_162_59_unreadable_counter_tristate``; this keeps the no-crash
        guarantee that was the original subject.
        """
        session = _make_session(verdict="REJECTED").replace(
            "**Phase Started:** 2026-08-06T13:00:00Z",
            "**Phase Started:** 2026-08-06T13:00:00Z\n**Round-Trip Count:** many",
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] != "ready", (
            f"an unreadable counter advanced the gate — 'I cannot read the "
            f"counter' is not 'there was no rework' (story 162-28): {result}"
        )
        assert result["next_phase"] is None, (
            f"the gate routed forward on a counter no reader can read: {result}"
        )


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
        """`looks good` is exactly what the approval gate forbids.

        AC5 is fail-*closed*: `!= "finish"` alone would also be satisfied by
        prose wrongly triggering a rework, which is a different bug.
        """
        result = _resolve_review(tmp_path, verdict="looks good to me")

        assert result["status"] == "blocked", (
            f"a prose non-verdict did not block — result: {result}"
        )
        assert result["next_phase"] != "finish"

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
# AC5/AC6: illustrative Markdown must not be mistaken for the verdict
# ===========================================================================


class TestFencedContentIsNotTheVerdict:
    """A verdict- or heading-shaped line inside a code fence is an EXAMPLE.

    Reviewers quote the verdict format when explaining it. Reading a fenced
    example as the operative verdict is fail-OPEN — it archives a rejected
    story, which is the precise defect 162-21 exists to close. This was
    reproduced for real: a reviewer's own assessment contained a fenced
    `**Verdict:** APPROVED` illustration above a real `**Verdict:** REJECTED`,
    and the parser read the approval.

    Requiring an agent to know "never let a verdict-shaped line appear in your
    prose" to avoid a fail-open gate is what SOUL #6 (Gates Over Goodwill)
    forbids.
    """

    def test_fenced_approval_above_the_real_rejection_is_ignored(self, tmp_path):
        """The exact reproduction: fenced APPROVED example, real REJECTED below."""
        body = (
            "The verdict line format is:\n\n"
            f"{FENCE}\n"
            "**Verdict:** APPROVED\n"
            f"{FENCE}\n\n"
            "**Verdict:** REJECTED — 3 blocking findings\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["next_phase"] == "green", (
            f"the gate read an APPROVED verdict out of a code fence and would "
            f"have archived a rejected story — result: {result}"
        )
        assert result["next_agent"] == "dev"

    def test_fenced_heading_does_not_shift_the_section_boundary(self, tmp_path):
        """The heading scan is fence-blind too — proven by the same repro.

        A fenced `## Reviewer Assessment` becomes ``matches[-1]`` and wins the
        "last section" contest, so the operative section is chosen from inside
        an example block.
        """
        body = (
            "**Verdict:** REJECTED — 3 blocking findings\n\n"
            "For reference, an approving assessment looks like:\n\n"
            f"{FENCE}\n"
            "## Reviewer Assessment\n\n"
            "**Verdict:** APPROVED\n"
            f"{FENCE}\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["next_phase"] == "green", (
            f"a fenced `## Reviewer Assessment` example redefined the current "
            f"section — result: {result}"
        )

    def test_tilde_fences_are_honored_too(self, tmp_path):
        """Markdown allows ~~~ fences; the parser must not only know backticks."""
        body = (
            "Example:\n\n~~~\n**Verdict:** APPROVED\n~~~\n\n**Verdict:** REJECTED — see findings\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["next_phase"] == "green", f"~~~ fence not honored — {result}"

    def test_indented_code_block_verdict_is_ignored(self, tmp_path):
        """A 4-space-indented example is also a code block, not the verdict."""
        body = "Example of the format:\n\n    **Verdict:** APPROVED\n\n**Verdict:** REJECTED\n"

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["next_phase"] == "green", (
            f"an indented example verdict was read as the operative one — {result}"
        )

    def test_two_visible_verdicts_block_as_ambiguous(self, tmp_path):
        """Two operative verdicts is ambiguity, and ambiguity must not be resolved.

        Picking a winner has a mirror failure whichever end you pick: first-wins
        lets a leading example govern, last-wins lets a trailing citation govern.
        Both were reproduced in review. The only rule with no fail-open mirror is
        to refuse.
        """
        body = (
            "**Verdict:** APPROVED\n\nOn reflection, correcting myself:\n\n**Verdict:** REJECTED\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["status"] == "blocked", (
            f"two operative verdicts were silently resolved — {result}"
        )
        assert result["next_phase"] != "finish"

    def test_quoted_prior_verdict_after_the_real_one_blocks(self, tmp_path):
        """The last-wins mirror bug, verbatim from review.

        A reviewer reversing an earlier approval naturally quotes it, and a prose
        citation is neither fenced nor indented. Under last-wins the citation
        became operative and archived a rejected story.
        """
        body = (
            "**Verdict:** REJECTED — 3 blocking findings\n\n"
            "Cycle 1 verdict for reference:\n\n"
            "**Verdict:** APPROVED (cycle 1, subsequently reversed)\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["status"] == "blocked", (
            f"a quoted prior approval became the operative verdict — {result}"
        )
        assert result["next_phase"] != "finish"

    def test_ambiguity_error_tells_the_agent_what_to_do(self, tmp_path):
        body = "**Verdict:** REJECTED\n\n**Verdict:** APPROVED\n"

        result = _resolve_with_reviewer_body(tmp_path, body)

        error = (result.get("error") or "").lower()
        assert "verdict" in error
        assert "one" in error or "single" in error or "ambiguous" in error, (
            f"block reason does not explain the ambiguity: {result.get('error')!r}"
        )

    def test_one_verdict_plus_fenced_examples_still_resolves(self, tmp_path):
        """Masking must still leave exactly one verdict — examples do not count."""
        body = (
            f"Format:\n\n{FENCE}\n**Verdict:** APPROVED\n{FENCE}\n\n"
            "**Verdict:** REJECTED — real\n\n"
            f"Counter-example:\n\n{FENCE}\n**Verdict:** APPROVED\n{FENCE}\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["status"] == "ready", result
        assert result["next_phase"] == "green"

    def test_mixed_fence_delimiters_do_not_unmask_an_example(self, tmp_path):
        """A ``` line must not close a ~~~ fence (CommonMark: types differ).

        Toggling one boolean on either delimiter closes the block early and
        exposes the example verdict inside it.
        """
        body = (
            "Explanation:\n\n"
            "~~~\n"
            "some sample output\n"
            f"{FENCE}\n"
            "**Verdict:** APPROVED\n"
            "~~~\n\n"
            "**Verdict:** REJECTED — real verdict\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["next_phase"] == "green", (
            f"a ``` line closed a ~~~ fence and exposed an example verdict — {result}"
        )
        assert result["status"] == "ready"

    def test_backtick_fence_not_closed_by_tilde_line(self, tmp_path):
        """The mirror delimiter case.

        Story 162-47 added the ``status`` pin its mirror
        (``test_mixed_fence_delimiters_do_not_unmask_an_example``) already had:
        ``next_phase == "green"`` alone is satisfied by a *blocked* result that
        happens to carry the recovery target, so the routing was unverified.
        """
        body = (
            f"Explanation:\n\n{FENCE}\nsample\n~~~\n**Verdict:** APPROVED\n{FENCE}\n\n"
            "**Verdict:** REJECTED — real verdict\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["next_phase"] == "green", result
        assert result["status"] == "ready", result
        assert result["gate_type"] == "approval_rework", result

    def test_fenced_verdict_with_no_real_verdict_blocks(self, tmp_path):
        """Only an example and no operative verdict is silence — fail closed."""
        body = f"The format is:\n\n{FENCE}\n**Verdict:** APPROVED\n{FENCE}\n\nI forgot to decide.\n"

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["status"] == "blocked", result
        assert result["next_phase"] != "finish"

    def test_unterminated_fence_masks_the_rest_and_leaves_one_verdict(self, tmp_path):
        """An unclosed fence masks everything after it — pinned, not just "not finish".

        The previous version of this test put the real verdict BEFORE the unclosed
        fence, so first-wins and last-wins both read it: it passed against the
        pre-fix baseline and discriminated nothing. Here the masked region is what
        makes the outcome unambiguous, and the assertions pin the outcome.
        """
        body = f"**Verdict:** REJECTED — real\n\n{FENCE}\n**Verdict:** APPROVED\n"

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["status"] == "ready", result
        assert result["next_phase"] == "green"
        assert result["next_agent"] == "dev"
        assert result["gate_type"] == "approval_rework"

    def test_unterminated_fence_before_the_real_verdict_blocks(self, tmp_path):
        """The discriminating direction: the real verdict is swallowed by the mask.

        Fail-closed — an unreadable verdict blocks rather than resolving to
        anything. This is the case the old fixture could not detect.
        """
        body = f"Example:\n\n{FENCE}\n**Verdict:** APPROVED\n\n**Verdict:** REJECTED — real\n"

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["status"] == "blocked", result
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

    @pytest.mark.parametrize(
        "suffix",
        [
            " (Cycle 2)",
            " — Cycle 2",
            " (re-review)",
            ": Cycle 2",
            " - round 2",
            " [Supplementary Notes]",
            " (Summary)",
            " — Rollup",
            " of Remaining Concerns",
        ],
    )
    def test_a_suffixed_heading_never_governs_the_verdict(self, tmp_path, suffix):
        """No heading suffix is accepted as a verdict section — it blocks instead.

        Cycle 2 accepted annotation suffixes so a suffixed CURRENT section would
        not be skipped. Review then showed that any accepted suffix is equally
        usable as a *supplementary* section title, and via last-section-wins it
        shadows the real verdict: `(Summary)` and `— Rollup` are indistinguishable
        from sanctioned cycle markers. No character class can tell a cycle marker
        from a section title, so the parser stops trying.

        Section identity comes from the EXACT heading; a near-miss after the last
        exact one is ambiguous — the newer section may be the real one — so the
        gate blocks and names the problem rather than silently reading either.
        """
        session = _make_session(verdict="REJECTED") + _reviewer_assessment("APPROVED").replace(
            "## Reviewer Assessment", f"## Reviewer Assessment{suffix}"
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["next_phase"] != "finish", (
            f"heading suffix {suffix!r} let a supplementary section override the "
            f"real rejection — result: {result}"
        )
        assert result["status"] == "blocked", (
            f"suffix {suffix!r} was silently resolved instead of blocked — {result}"
        )
        assert "heading" in (result.get("error") or "").lower()

    def test_near_miss_heading_blocks_instead_of_reading_a_stale_verdict(self, tmp_path):
        """The reachable ordering, and why a stale read is not good enough.

        Reviewers demonstrably DO write `## Reviewer Assessment (Cycle 3)` — this
        story's own session file has three such headings and one exact one. Under
        exact-match-only selection the newer sections are invisible, so the FIRST
        cycle's verdict governs forever: a later approval can never be seen and
        the story becomes unapprovable, hard-blocking at max_attempts. Blocking
        with an actionable message is the only outcome that is neither fail-open
        nor a wedge.
        """
        session = _make_session(verdict="APPROVED") + _reviewer_assessment("REJECTED").replace(
            "## Reviewer Assessment", "## Reviewer Assessment (Cycle 2)"
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "blocked", (
            f"a suffixed current-cycle section was ignored and a stale verdict "
            f"read instead — result: {result}"
        )
        assert result["next_phase"] != "finish"

    def test_exact_heading_repeated_per_cycle_selects_the_last(self, tmp_path):
        """The supported multi-cycle shape: repeat the EXACT heading.

        Position distinguishes cycles, not suffix prose.
        """
        session = _make_session(verdict="APPROVED") + _reviewer_assessment("REJECTED")
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "ready", result
        assert result["next_phase"] == "green"

    def test_near_miss_heading_before_the_last_exact_one_is_harmless(self, tmp_path):
        """A stale suffixed section followed by an exact current one is fine.

        Only a near-miss AFTER the last exact heading is ambiguous.
        """
        session = _make_session(verdict="APPROVED").replace(
            "## Reviewer Assessment", "## Reviewer Assessment (Cycle 1)"
        ) + _reviewer_assessment("REJECTED")
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "ready", result
        assert result["next_phase"] == "green"

    @pytest.mark.parametrize("extended", ["## Reviewer Assessments", "## Reviewer Assessmentz"])
    def test_an_extended_word_heading_after_the_last_exact_one_blocks(self, tmp_path, extended):
        """A prefix match is a straggler whatever follows it (story 162-47, AC-A2).

        This test previously asserted the opposite — that a plural or extended
        word is simply a different heading, because the near-miss pattern
        required a `\\b` after the phrase. That boundary requirement left a hole
        precisely where the suffix starts with a word character: `## Reviewer
        Assessment2` matched neither the exact pattern nor the near-miss one, so
        a NEWER cycle's section became invisible and the OLDER verdict governed
        silently. The 162-21 cycle-5 review probed dropping the `\\b`, and no
        character class can separate `Assessment2` (a plausible cycle marker)
        from `Assessmentz` (a different word) — so both are reported.

        The cost is a blocked gate with an actionable message on a heading that
        was merely oddly named; the cost of the hole was a stale verdict read as
        current, which is fail-open.
        """
        session = _make_session(verdict="APPROVED") + _reviewer_assessment("REJECTED").replace(
            "## Reviewer Assessment", extended
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "blocked", (
            f"{extended!r} follows the last exact heading and may be the current "
            f"cycle, so it must be reported rather than skipped — result: {result}"
        )
        assert result["next_phase"] != "finish", result
        assert "heading" in (result.get("error") or "").lower(), result.get("error")

    @pytest.mark.parametrize(
        "unrelated_heading",
        [
            "## Dev Assessment",
            "## Reviewer Summary",
            "## Assessments",
        ],
    )
    def test_a_genuinely_different_heading_is_simply_not_a_candidate(
        self, tmp_path, unrelated_heading
    ):
        """Headings that do not START with the phrase are neither section nor
        near-miss.

        These must not block — they are unrelated sections, so the last exact
        reviewer section still governs cleanly. The discriminator is a prefix
        match, so extended-word forms belong to
        ``test_an_extended_word_heading_after_the_last_exact_one_blocks``.
        """
        session = _make_session(verdict="REJECTED") + _reviewer_assessment("APPROVED").replace(
            "## Reviewer Assessment", unrelated_heading
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "ready", (
            f"{unrelated_heading!r} was treated as a reviewer assessment — {result}"
        )
        assert result["next_phase"] == "green"

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

        assert result["status"] == "error", (
            f"a malformed recovery block must be an error, not a fabricated rework route — {result}"
        )
        assert result["next_phase"] != "finish", (
            f"malformed recovery config fell through to archival — {result}"
        )

    def test_recovery_target_phase_must_exist_in_the_workflow(self, tmp_path):
        """A target_phase naming a nonexistent phase is an error, not a silent skip.

        TEA left this as ``in ("blocked", "error")`` while the choice was open.
        It is settled — a bad `target_phase` is a workflow-YAML defect no agent
        can fix from the session — so the test pins `error`.
        """
        workflow = _load_real_tdd()
        for phase in workflow["workflow"]["phases"]:
            if phase["name"] == "review":
                phase["gate"]["recovery"]["reviewer-verdict"]["target_phase"] = "nope"
        project = _setup_project(tmp_path, workflow, _make_session(verdict="REJECTED"))

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "error", result
        assert result["next_phase"] != "finish"
        assert "nope" in (result.get("error") or "")
