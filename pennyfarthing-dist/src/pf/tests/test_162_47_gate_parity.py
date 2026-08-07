"""``complete_phase`` must reach parity with ``resolve_gate``, and the approval
subgates must enforce diligence on the REJECT path too.

Story 162-47, Cluster A items 5 and 8 plus Cluster B items 1 and 2.
Epic: 162 (Finish & sprint-tooling truthfulness)

- [AC-A5] ``complete_phase`` still hardcodes the ``"Reviewer Assessment"``
          heading instead of calling ``assessment_heading("reviewer")`` — the
          last SOUL #2 duplicate of the heading contract in this package, filed
          for a third cycle — and its ``read_text`` / ``write_text`` calls omit
          ``encoding=`` (python.md rule #5), unlike ``resolve_gate``'s reads of
          the same file.
- [AC-A8] **The inverted check.** The approval subgates run only when
          ``gate_type == "approval"``. A REJECTED verdict resolves to
          ``approval_rework``, so reviewer diligence is enforced only on the path
          where the reviewer AGREES with the code and unenforced on the path
          where it sends work back. Verified live in the 162-21 review: a
          REJECTED handoff with no ``## Subagent Results`` section was accepted;
          the byte-identical APPROVED handoff was refused. A reviewer under
          context pressure can reject its way past the check up to
          ``max_attempts``, and each unverified rejection costs a full Dev cycle.
          **Probed fix (carried verbatim):** run the subagent-completion and
          specialist-tag checks on any transition out of a phase whose gate is
          ``approval``-family, keying off the gate FAMILY rather than the exact
          string ``"approval"`` — ``_check_rework_freshness`` can stay
          approval-only, since its subject is the staleness of results being
          used to APPROVE.
- [AC-B1] the gate reports format requirements ONE per attempt. The 162-49 run
          took five sequential failures to discover the full set. All unmet
          requirements must be reported together.
- [AC-B2] the Cycle-N tag error says to add the tag "after re-running all
          enabled subagents", but targeted re-probes of already-characterized
          findings are STRONGER evidence than a fresh generalist sweep. As
          written the instruction invites a reviewer under context pressure to
          add the tag without re-running anything — a false attestation the gate
          then certifies. The requirement must name targeted re-verification as
          an accepted route and ask which was done.
"""

from __future__ import annotations

import ast
import os
import subprocess
import sys
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

import pf.handoff.complete_phase as cp
import pf.handoff.gate_recovery as gr
import pf.handoff.session_assessment as sa
from pf.handoff.complete_phase import REQUIRED_SUBAGENTS, _check_rework_freshness, complete_phase
from pf.handoff.resolve_gate import resolve_gate
from pf.tests.test_162_21_resolve_gate_rejected_verdict import (
    STORY_ID,
    _load_real_tdd,
    _setup_project,
)

HANDOFF_DIR = Path(cp.__file__).parent

_SUBAGENT_KEYS = (
    "preflight",
    "edge_hunter",
    "silent_failure_hunter",
    "test_analyzer",
    "comment_analyzer",
    "type_design",
    "security",
    "simplifier",
    "rule_checker",
)
_ALL_ENABLED = dict.fromkeys(_SUBAGENT_KEYS, True)
_NONE_ENABLED = dict.fromkeys(_SUBAGENT_KEYS, False)

ALL_TAGS = "[EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE]"
SOME_TAGS = "[EDGE] [TEST] [DOC] [TYPE] [RULE]"  # missing [SILENT] [SEC] [SIMPLE]

FULL_TABLE = "\n".join(
    [
        "| # | Specialist | Received | Status | Findings | Decision |",
        "|---|------------|----------|--------|----------|----------|",
        *(
            f"| {i} | {name} | Yes | clean | none | N/A |"
            for i, name in enumerate(sorted(REQUIRED_SUBAGENTS), start=1)
        ),
        "",
        "All received: Yes",
    ]
)
TABLE_NOT_ALL_RECEIVED = FULL_TABLE.replace("All received: Yes", "All received: not yet")


@pytest.fixture
def all_subagents_enabled():
    """Project settings vary; these gates must be tested with every toggle on."""
    with patch("pf.settings.settings.get_setting", return_value=_ALL_ENABLED):
        yield


@pytest.fixture
def no_subagents_required():
    """Every specialist disabled — isolates the non-subagent behaviour under test."""
    with patch("pf.settings.settings.get_setting", return_value=_NONE_ENABLED):
        yield


def _session(
    *,
    results: str | None = FULL_TABLE,
    tags: str = ALL_TAGS,
    counter: int | None = None,
    cycle_tag: int | None = None,
    verdict: str = "REJECTED",
    heading: str = "Reviewer Assessment",
    straggler: str | None = None,
) -> str:
    """A review-phase session with each approval requirement independently set."""
    lines = [
        "---",
        f'story_id: "{STORY_ID}"',
        'workflow: "tdd"',
        "---",
        f"# Story {STORY_ID}: approval subgate parity",
        "",
        "## Workflow Tracking",
        "**Workflow:** tdd",
        "**Phase:** review",
        "**Phase Started:** 2026-08-07T13:00:00Z",
    ]
    if counter is not None:
        lines.append(f"**Round-Trip Count:** {counter}")
    lines += [
        "",
        "### Phase History",
        "| Phase | Started | Ended | Duration |",
        "|-------|---------|-------|----------|",
        "| green | 2026-08-07T12:00:00Z | 2026-08-07T13:00:00Z | 1h |",
        "| review | 2026-08-07T13:00:00Z | - | - |",
        "",
        "### Handoff History",
        "| From | To | Gate | Result | Timestamp |",
        "|------|----|------|--------|-----------|",
        "| green (dev) | review (reviewer) | dev_exit | PASSED | 2026-08-07T13:00:00Z |",
        "",
    ]
    if results is not None:
        lines += ["## Subagent Results", ""]
        if cycle_tag is not None:
            lines += [f"**Cycle: {cycle_tag}**", ""]
        lines += [results, ""]
    lines += [f"## {heading}", "", f"**Verdict:** {verdict}", ""]
    if tags:
        lines += [f"- {tags}", ""]
    if straggler is not None:
        lines += [
            f"## {heading}{straggler}",
            "",
            f"**Verdict:** {verdict}",
            "",
            f"- {tags}",
            "",
        ]
    return "\n".join(lines) + "\n"


def _complete(tmp_path: Path, session: str, gate_type: str = "approval_rework") -> dict:
    to_phase = "green" if "rework" in gate_type else "finish"
    project = _setup_project(tmp_path, _load_real_tdd(), session)
    return complete_phase(STORY_ID, "tdd", "review", to_phase, gate_type, project_root=project)


def _error(result: dict) -> str:
    return result.get("error") or ""


# ===========================================================================
# AC-A8: rejections get the same specialist enforcement as approvals
# ===========================================================================


class TestRejectionsAreEnforcedLikeApprovals:
    """Keyed off the approval FAMILY, not the exact string ``"approval"``."""

    def test_a_rework_transition_requires_the_subagent_results_section(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(results=None))

        assert result["status"] == "error", (
            "a REJECTED handoff with no Subagent Results section was accepted — "
            f"the exact inversion found live in the 162-21 review: {result}"
        )
        assert "Subagent Results" in _error(result), _error(result)

    def test_a_rework_transition_requires_a_complete_results_table(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(results=TABLE_NOT_ALL_RECEIVED))

        assert result["status"] == "error", (
            f"an incomplete results table certified a rejection — {result}"
        )
        assert "All received" in _error(result), _error(result)

    def test_a_rework_transition_requires_every_row(self, tmp_path, all_subagents_enabled) -> None:
        thin = (
            "| # | Specialist | Received |\n| 1 | reviewer-preflight | Yes |\n\nAll received: Yes"
        )

        result = _complete(tmp_path, _session(results=thin))

        assert result["status"] == "error", result
        assert "reviewer-security" in _error(result), _error(result)

    def test_a_rework_transition_requires_the_specialist_tags(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(tags=SOME_TAGS))

        assert result["status"] == "error", (
            f"a rejection with no security/silent/simplifier findings was accepted — {result}"
        )
        error = _error(result)
        assert "[SEC]" in error and "[SILENT]" in error and "[SIMPLE]" in error, error

    def test_a_rework_transition_blocks_an_ambiguous_reviewer_heading(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(straggler=" (Cycle 2)"))

        assert result["status"] == "error", (
            f"a rejection was judged against an unidentifiable assessment — {result}"
        )
        assert "Reviewer Assessment" in _error(result), _error(result)

    def test_a_compliant_rework_transition_still_succeeds(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        """Control: enforcement must not wedge a legitimate rejection."""
        result = _complete(tmp_path, _session())

        assert result["status"] == "success", result

    def test_the_freshness_guard_stays_approval_only(self, tmp_path, all_subagents_enabled) -> None:
        """The one subcheck the probed fix deliberately leaves out.

        Its subject is the staleness of results being used to APPROVE. Demanding
        a ``**Cycle: N**`` tag on the way OUT to rework would require the
        reviewer to attest freshness for a cycle it is currently rejecting.
        """
        result = _complete(tmp_path, _session(counter=1, cycle_tag=None))

        assert result["status"] == "success", (
            "the freshness guard was widened to the rework path, which the probed "
            f"fix scopes out — {result}"
        )

    def test_the_approval_path_still_enforces_freshness(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        """Control: the approval path keeps all four subchecks."""
        result = _complete(
            tmp_path, _session(counter=1, cycle_tag=None, verdict="APPROVED"), "approval"
        )

        assert result["status"] == "error", result
        assert "cycle" in _error(result).lower(), _error(result)

    def test_the_approval_path_still_enforces_the_tags(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(tags=SOME_TAGS, verdict="APPROVED"), "approval")

        assert result["status"] == "error", result
        assert "[SEC]" in _error(result), _error(result)

    def test_a_non_approval_family_gate_is_unaffected(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        """Scope: the dev-exit transition has no reviewer assessment to judge.

        Keying off the family must not mean keying off "any gate" — TEA's and
        Dev's transitions must not start demanding a Subagent Results table.
        """
        session = _session(results=None, tags="", verdict="GREEN", heading="Dev Assessment")
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = complete_phase(
            STORY_ID, "tdd", "green", "review", "dev_exit", project_root=project
        )

        assert result["status"] == "success", result


# ===========================================================================
# AC-B1: every unmet approval requirement is reported at once
# ===========================================================================


class TestApprovalRequirementsAreReportedTogether:
    """Five sequential failures to discover one contract is a discovery cost the
    gate charges the reviewer for its own undocumented shape (162-49 cycle 2).
    """

    def test_a_missing_table_and_missing_tags_are_reported_together(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(results=None, tags=SOME_TAGS), "approval_rework")

        error = _error(result)
        assert result["status"] == "error", result
        assert "Subagent Results" in error, error
        assert "[SEC]" in error, (
            "only the first failing requirement was reported; the missing "
            f"specialist tags were withheld until the next attempt — {error!r}"
        )

    def test_an_incomplete_table_and_missing_tags_are_reported_together(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(results=TABLE_NOT_ALL_RECEIVED, tags=SOME_TAGS))

        error = _error(result)
        assert "All received" in error, error
        assert "[SEC]" in error, error

    def test_an_ambiguous_heading_is_reported_with_the_table_problems(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(tmp_path, _session(results=None, straggler=" (Cycle 2)"))

        error = _error(result)
        assert "Reviewer Assessment" in error, error
        assert "Subagent Results" in error, error

    def test_a_stale_cycle_tag_is_reported_with_missing_tags(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(
            tmp_path,
            _session(counter=2, cycle_tag=1, tags=SOME_TAGS, verdict="APPROVED"),
            "approval",
        )

        error = _error(result)
        assert "[SEC]" in error, error
        assert "cycle" in error.lower(), error

    def test_all_four_requirements_can_be_reported_in_one_error(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        result = _complete(
            tmp_path,
            _session(results=None, tags=SOME_TAGS, counter=2, straggler=" (Cycle 2)"),
            "approval",
        )

        error = _error(result)
        for expected in ("Reviewer Assessment", "Subagent Results", "[SEC]", "cycle"):
            assert expected.lower() in error.lower(), (
                f"{expected!r} missing from the aggregated error — {error!r}"
            )

    def test_a_single_unmet_requirement_does_not_invent_the_others(
        self, tmp_path, all_subagents_enabled
    ) -> None:
        """Control: aggregation must not report requirements that ARE met.

        Runs on the ``approval`` path so it is a genuine green control today,
        independent of AC-A8.
        """
        result = _complete(tmp_path, _session(tags=SOME_TAGS, verdict="APPROVED"), "approval")

        error = _error(result)
        assert "[SEC]" in error, error
        assert "All received" not in error, (
            f"a satisfied requirement was reported as unmet — {error!r}"
        )
        assert "Missing '## Subagent Results'" not in error, error


# ===========================================================================
# AC-B2: the freshness requirement does not invite a false attestation
# ===========================================================================


_FALSE_ATTESTATION_WORDING = "after re-running all enabled subagents"


class TestTheFreshnessRequirementDoesNotInviteFalseAttestation:
    """Targeted re-probes of already-characterized findings are STRONGER
    evidence than a fresh generalist sweep. An instruction that names only the
    sweep tells a reviewer under context pressure that the honest answer is
    unaffordable — so it adds the tag instead.
    """

    def _message(self, **kwargs) -> str:
        return _check_rework_freshness(_session(**kwargs))["message"]

    def test_the_missing_tag_message_names_targeted_verification(self) -> None:
        message = self._message(counter=2, cycle_tag=None)

        assert "targeted" in message.lower(), (
            f"the requirement names only a full generalist re-run — {message!r}"
        )

    def test_the_missing_tag_message_does_not_demand_a_sweep_as_the_only_route(self) -> None:
        message = self._message(counter=2, cycle_tag=None)

        assert _FALSE_ATTESTATION_WORDING not in message.lower(), (
            f"the wording that invited silent false attestation is unchanged — {message!r}"
        )

    def test_the_missing_tag_message_asks_which_method_was_used(self) -> None:
        message = self._message(counter=2, cycle_tag=None)

        assert any(
            word in message.lower()
            for word in ("state which", "say which", "record which", "disclose")
        ), (
            "the reviewer is not asked to disclose whether it re-ran the sweep or "
            f"re-verified specific findings — {message!r}"
        )

    def test_the_stale_tag_message_names_targeted_verification(self) -> None:
        message = self._message(counter=2, cycle_tag=1)

        assert "targeted" in message.lower(), message

    def test_the_absent_section_message_names_targeted_verification(self) -> None:
        message = self._message(counter=2, results=None)

        assert "targeted" in message.lower(), message

    def test_the_messages_still_name_the_tag_the_gate_wants(self) -> None:
        """Control: rewording must not lose the actionable instruction."""
        message = self._message(counter=2, cycle_tag=None)

        assert "**Cycle: 2**" in message, message
        assert "column 0" in message, message

    def test_a_genuine_tag_still_passes(self) -> None:
        """Control: the guard's verdict on compliant input is unchanged."""
        assert _check_rework_freshness(_session(counter=2, cycle_tag=2))["pass"] is True

    def test_an_initial_review_is_still_exempt(self) -> None:
        assert _check_rework_freshness(_session())["pass"] is True


# ===========================================================================
# AC-A5: complete_phase reaches parity — one heading formula, explicit encoding
# ===========================================================================


def _patch_heading_formula(monkeypatch, fn) -> None:
    """Redirect the heading contract wherever a caller may have bound it.

    ``gate_recovery`` binds ``assessment_heading`` at import time and
    ``resolve_gate`` imports it inside the function, so a single patch point is
    not enough. ``complete_phase`` has no binding yet — that is the defect.
    """
    monkeypatch.setattr(sa, "assessment_heading", fn)
    monkeypatch.setattr(gr, "assessment_heading", fn)
    monkeypatch.setattr(cp, "assessment_heading", fn, raising=False)


class TestCompletePhaseUsesTheSharedHeadingFormula:
    """One formula, one place (SOUL #2). Filed for three cycles running.

    If the reader and the writer of the heading contract ever disagreed, the
    verdict parser would search for a heading agents are no longer told to
    write, and every verdict would silently read as absent.
    """

    def test_the_module_holds_no_hardcoded_assessment_heading(self) -> None:
        literals = {
            node.value
            for node in ast.walk(ast.parse(Path(cp.__file__).read_text(encoding="utf-8")))
            if isinstance(node, ast.Constant) and isinstance(node.value, str)
        }

        offenders = {text for text in literals if "Reviewer Assessment" == text.strip()}
        assert not offenders, (
            "complete_phase still hardcodes the reviewer assessment heading "
            f"instead of calling assessment_heading('reviewer'): {offenders}"
        )

    def test_the_subgates_follow_the_shared_formula(
        self, tmp_path, monkeypatch, all_subagents_enabled
    ) -> None:
        """Behavioural pin: change the formula, both halves must follow.

        The substitute still ends in "Assessment" so the shared
        ``has_assessment`` precondition is unaffected — this isolates the
        heading FORMULA from the presence check.
        """
        _patch_heading_formula(monkeypatch, lambda agent: "Peer Assessment")
        session = _session(heading="Peer Assessment")
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        resolved = resolve_gate(STORY_ID, "tdd", "review", project_root=project)
        assert resolved["status"] == "ready", (
            f"resolve_gate did not follow the shared heading formula — {resolved}"
        )

        completed = complete_phase(
            STORY_ID, "tdd", "review", "green", resolved["gate_type"], project_root=project
        )

        assert completed["status"] == "success", (
            "complete_phase looked for a heading the shared formula no longer "
            f"produces — {completed}"
        )

    def test_the_subgates_reject_the_old_heading_once_the_formula_changes(
        self, tmp_path, monkeypatch, all_subagents_enabled
    ) -> None:
        """The discriminating direction: the hardcoded literal must stop working."""
        _patch_heading_formula(monkeypatch, lambda agent: "Peer Assessment")
        session = _session(heading="Reviewer Assessment")
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        completed = complete_phase(
            STORY_ID, "tdd", "review", "green", "approval_rework", project_root=project
        )

        assert completed["status"] == "error", (
            "the tag check still found its tags under a heading the formula no "
            f"longer names — the literal is still authoritative: {completed}"
        )


class TestHandoffFileIoDeclaresItsEncoding:
    """python.md rule #5. ``resolve_gate`` passes ``encoding=`` on reads of the
    same session file; ``complete_phase`` does not, so the two disagree about
    how to decode a file with an em dash in it under a non-UTF-8 locale.
    """

    def test_no_read_or_write_text_call_omits_encoding(self) -> None:
        offenders: list[str] = []
        for path in sorted(HANDOFF_DIR.glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr in ("read_text", "write_text")
                    and not any(kw.arg == "encoding" for kw in node.keywords)
                ):
                    offenders.append(f"{path.name}:{node.lineno} .{node.func.attr}()")

        assert not offenders, (
            f"text file I/O in pf/handoff/ relies on the platform default encoding: {offenders}"
        )

    def test_a_session_with_non_ascii_survives_a_non_utf8_default(self, tmp_path) -> None:
        """The behaviour the missing keyword costs, measured rather than asserted.

        Session files routinely contain em dashes and ✅ — every assessment in
        this repo does. Run in a subprocess because the default encoding is
        interpreter-wide; skipped when the platform cannot be forced off UTF-8.
        """
        env = {
            **os.environ,
            "PYTHONUTF8": "0",
            "PYTHONCOERCECLOCALE": "0",
            "LC_ALL": "C",
            "LANG": "C",
        }
        probe = subprocess.run(
            [sys.executable, "-c", "import locale;print(locale.getpreferredencoding(False))"],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if "utf" in probe.stdout.strip().lower():
            pytest.skip(f"cannot force a non-UTF-8 default here ({probe.stdout.strip()!r})")

        project = _setup_project(
            tmp_path,
            _load_real_tdd(),
            _session(verdict="REJECTED — two blocking findings ✅ pinned"),
        )
        script = textwrap.dedent(
            f"""
            from pathlib import Path
            from pf.handoff.complete_phase import complete_phase
            result = complete_phase(
                {STORY_ID!r}, "tdd", "review", "green", "approval_rework",
                project_root=Path({str(project)!r}),
            )
            assert result["status"] == "success", result
            text = Path({str(project)!r}).joinpath(
                ".session", "{STORY_ID}-session.md"
            ).read_text(encoding="utf-8")
            assert "✅ pinned" in text, "non-ASCII content did not survive the rewrite"
            print("OK")
            """
        )
        run = subprocess.run(
            [sys.executable, "-c", script],
            env={**env, "PYTHONPATH": str(HANDOFF_DIR.parents[1])},
            capture_output=True,
            text=True,
            check=False,
        )

        assert run.returncode == 0, (
            "complete_phase could not read or write a session file containing "
            f"non-ASCII text under a {probe.stdout.strip()} default encoding.\n"
            f"stdout: {run.stdout}\nstderr: {run.stderr}"
        )
