"""RED tests for Story 158-4 — SM handoff exit protocol friction (gh #49).

Epic: 158 (Session/handoff/agent-start robustness)
Story: 158-4 — undocumented required args + missing Sm Assessment precondition

## Root cause (for the Dev who turns these green)

Two friction points bite EVERY phased handoff, especially after a context
clear when the agent reconstructs state from the session file alone:

**Problem 1 — bare invocations fail.** The agent-behavior guide (line 6, the
only handoff doc loaded into every agent's prime context) presents the exit
protocol as bare commands::

    pf handoff resolve-gate → pf handoff complete-phase → pf handoff marker

but all three require positional args (STORY_ID WORKFLOW PHASE / ... FROM TO
GATE_TYPE / NEXT_AGENT) documented only in guides/handoff-cli.md, which no
agent loads. Every piece of information those args carry is already on disk:
`.session/{id}-session.md` has story_id/workflow/phase, and the workflow YAML
has to_phase/gate_type/next agent — `pf handoff status` (cli.py) and
`pf.prime.workflow.{find_active_session,parse_session_header}` already
implement the lookups. The fix (SOUL #3, Detect State Don't Demand Commands):
make the positional args OPTIONAL and infer them from the active session, so
the documented bare protocol is literally executable. Explicit args keep
working.

**Problem 2 — resolve-gate lies about the assessment.** `resolve_gate`
hardcodes `assessment_found=True` (resolve_gate.py:183) without ever reading
the session file, then `complete_phase` hard-fails on the missing
`## {Agent} Assessment` heading — the two steps disagree about what
"assessment" means and the agent pays a failed-command round-trip. The fix
(SOUL #6, Gates Over Goodwill): resolve-gate must perform the SAME assessment
check complete-phase performs (`^##\\s+.*Assessment`, gated transitions only)
and return `status: "blocked"` with an actionable error when it is missing.

Deliberately NOT pinned: pre-seeding `## Sm Assessment` into the sm-setup
session template (the gh-#49 alternative). An empty pre-seeded heading would
satisfy complete_phase's regex forever and turn the mechanical assessment
guard into a vacuous check — see Design Deviations in the session file.

## Contract pinned by these tests

resolve_gate (function):
  - `assessment_found` reflects reality (False when no heading) — never
    hardcoded True
  - gated phase + missing heading → `status: "blocked"`, actionable error
  - gated phase + heading present → `status: "ready"`, assessment_found True
  - missing session file + gated phase → blocked (never raises)
  - no-gate and manual-gate phases → `skip`, regardless of assessment
  - agreement: resolve_gate blocked ⟺ complete_phase assessment-errors

CLI (bare invocation inference, active session in project root):
  - `pf handoff resolve-gate` → exit 0, full RESOLVE_RESULT
  - `pf handoff complete-phase` → infers from=session phase, to=next phase
    and gate_type from workflow YAML; advances the session
  - `pf handoff marker` → emits AGENT_COMMAND for the CURRENT phase owner
    (the post-complete-phase call site: session already shows the new phase)
  - bare + no active session → exit != 0 with an actionable error that
    mentions the session (not a bare Click "Missing argument")
  - explicit args keep working exactly as before (regression pins)
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
import yaml
from click.testing import CliRunner

from pf.cli import cli
from pf.handoff.complete_phase import complete_phase
from pf.handoff.resolve_gate import resolve_gate

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

STORY_ID = "158-4"
EPIC_N = "158"

# Mirrors the real tdd.yaml shape: setup carries the sm_setup_exit gate.
# No `file:` keys — keeps resolve_gate clear of gate-extension resolution,
# which is not under test here.
TDD_WORKFLOW = {
    "workflow": {
        "name": "tdd",
        "phases": [
            {"name": "setup", "agent": "sm", "gate": {"type": "sm_setup_exit"}},
            {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
            {"name": "green", "agent": "dev", "gate": {"type": "tests_pass"}},
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

# Manual-gate workflow for the scope guard.
PATCH_WORKFLOW = {
    "workflow": {
        "name": "patch",
        "phases": [
            {"name": "fix", "agent": "dev", "gate": {"type": "manual"}},
        ],
    }
}


def _session(phase: str, assessment: str | None) -> str:
    """Build a session file body in ``phase``, optionally with an assessment.

    The assessment block is inserted AFTER dedenting: interpolating a
    multi-line column-0 block into the f-string would defeat
    ``textwrap.dedent`` (no common prefix) and produce an indented,
    unrealistic session file.
    """
    assessment_block = (
        f"\n## {assessment}\n\nWork complete — handing off.\n" if assessment else ""
    )
    return textwrap.dedent(f"""\
        # Story {STORY_ID}: SM handoff exit protocol friction

        **Story ID:** {STORY_ID}
        **Workflow:** tdd
        **Phase:** {phase}
        **Phase Started:** 2026-06-05T00:00:00Z
        @ASSESSMENT@
        ## Workflow Tracking

        **Workflow:** tdd
        **Phase:** {phase}
        **Phase Started:** 2026-06-05T00:00:00Z

        ### Phase History
        | Phase | Started | Ended | Duration |
        |-------|---------|-------|----------|
        | {phase} | 2026-06-05T00:00:00Z | - | - |

        ### Handoff History
        | From | To | Gate | Status | Timestamp |
        |------|-----|------|--------|-----------|
    """).replace("@ASSESSMENT@\n", assessment_block)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Minimal project: workflow YAMLs, .session/, populated sprint/context/."""
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)
    (workflows_dir / "tdd.yaml").write_text(yaml.dump(TDD_WORKFLOW, default_flow_style=False))
    (workflows_dir / "patch.yaml").write_text(yaml.dump(PATCH_WORKFLOW, default_flow_style=False))
    (tmp_path / ".session").mkdir()
    ctx = tmp_path / "sprint" / "context"
    ctx.mkdir(parents=True)
    # Context docs present so the 158-3 sm_setup_exit context guard passes —
    # these tests isolate the assessment/inference behavior.
    (ctx / f"context-epic-{EPIC_N}.md").write_text("# Epic context\n\nRobustness.\n")
    (ctx / f"context-story-{STORY_ID}.md").write_text("# Story context\n\nACs.\n")
    return tmp_path


def _write_session(project: Path, phase: str = "setup", assessment: str | None = "Sm Assessment") -> Path:
    session_file = project / ".session" / f"{STORY_ID}-session.md"
    session_file.write_text(_session(phase, assessment))
    return session_file


def _phase_in_session(session_file: Path) -> str:
    for line in session_file.read_text().splitlines():
        if line.startswith("**Phase:**"):
            return line.split("**Phase:**", 1)[1].strip()
    return ""


@pytest.fixture
def in_project(project: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """chdir into the sandbox AND pin PROJECT_ROOT so every root-detection
    layer (env override, cwd walk-up) resolves to it."""
    monkeypatch.chdir(project)
    monkeypatch.setenv("PROJECT_ROOT", str(project))
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    return project


# ===========================================================================
# Problem 2 — resolve-gate must tell the truth about the assessment
# ===========================================================================


class TestResolveGateAssessmentTruth:
    def test_assessment_found_false_when_heading_missing(self, project: Path) -> None:
        """assessment_found must reflect the session file, not be hardcoded."""
        _write_session(project, assessment=None)
        result = resolve_gate(STORY_ID, "tdd", "setup", project)
        assert result["assessment_found"] is False, (
            "resolve_gate reported assessment_found=True for a session with "
            "no Assessment heading — the hardcoded lie from gh #49."
        )

    def test_blocked_when_assessment_missing_on_gated_phase(self, project: Path) -> None:
        """Gated transition without the heading complete-phase requires → blocked."""
        _write_session(project, assessment=None)
        result = resolve_gate(STORY_ID, "tdd", "setup", project)
        assert result["status"] == "blocked", (
            "resolve-gate returned status "
            f"{result['status']!r} for a missing assessment; complete-phase "
            "will hard-fail one step later — the two must agree."
        )

    def test_blocked_error_mentions_assessment_heading(self, project: Path) -> None:
        """The blocked error must be actionable: name the heading to add."""
        _write_session(project, assessment=None)
        result = resolve_gate(STORY_ID, "tdd", "setup", project)
        msg = (result.get("error") or "").lower()
        assert "assessment" in msg, f"Error not actionable: {result.get('error')!r}"
        assert "heading" in msg or "##" in (result.get("error") or ""), (
            f"Error should name the markdown heading to add: {result.get('error')!r}"
        )

    def test_ready_with_assessment_found_true_when_present(self, project: Path) -> None:
        _write_session(project, assessment="Sm Assessment")
        result = resolve_gate(STORY_ID, "tdd", "setup", project)
        assert result["status"] == "ready", (
            f"Valid session with assessment wrongly blocked: {result.get('error')!r}"
        )
        assert result["assessment_found"] is True

    def test_any_agent_assessment_heading_satisfies(self, project: Path) -> None:
        """complete_phase accepts any `## … Assessment` heading; resolve-gate
        must use the same definition, not an SM-specific one."""
        _write_session(project, phase="red", assessment="TEA Assessment")
        result = resolve_gate(STORY_ID, "tdd", "red", project)
        assert result["status"] == "ready", (
            f"TEA Assessment heading not accepted: {result.get('error')!r}"
        )
        assert result["assessment_found"] is True

    def test_missing_session_file_blocks_not_crashes(self, project: Path) -> None:
        """No session at all → an assessment cannot exist → blocked, never raises."""
        result = resolve_gate(STORY_ID, "tdd", "setup", project)
        assert result["status"] == "blocked", (
            "resolve-gate said the gate was satisfiable with NO session file; "
            "complete-phase errors immediately on the same state."
        )
        assert result["assessment_found"] is False


class TestResolveGateScopeGuards:
    """The assessment requirement applies exactly where complete-phase applies
    it: gated transitions. Skip/manual phases stay exempt."""

    def test_no_gate_phase_skips_without_assessment(self, project: Path) -> None:
        _write_session(project, phase="finish", assessment=None)
        result = resolve_gate(STORY_ID, "tdd", "finish", project)
        assert result["status"] == "skip", (
            "finish has no gate — it must skip even with no assessment, "
            "mirroring complete_phase's skip/manual exemption."
        )

    def test_manual_gate_skips_without_assessment(self, project: Path) -> None:
        _write_session(project, phase="fix", assessment=None)
        # patch workflow session needs its own workflow name in the body, but
        # resolve_gate only reads the workflow YAML + session existence; the
        # assessment exemption is what's under test.
        result = resolve_gate(STORY_ID, "patch", "fix", project)
        assert result["status"] == "skip"


class TestResolveCompleteAgreement:
    """The gh #49 disagreement, pinned as a property: the two steps must give
    the same verdict on the same session state."""

    def test_blocked_resolve_means_complete_phase_errors(self, project: Path) -> None:
        session_file = _write_session(project, assessment=None)
        resolved = resolve_gate(STORY_ID, "tdd", "setup", project)
        completed = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert resolved["status"] == "blocked"
        assert completed["status"] == "error"
        assert _phase_in_session(session_file) == "setup", (
            "Session advanced despite both steps failing."
        )

    def test_ready_resolve_means_complete_phase_succeeds(self, project: Path) -> None:
        session_file = _write_session(project, assessment="Sm Assessment")
        resolved = resolve_gate(STORY_ID, "tdd", "setup", project)
        completed = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert resolved["status"] == "ready"
        assert completed["status"] == "success", (
            f"resolve-gate said ready but complete-phase errored: {completed.get('error')!r} "
            "— the exact disagreement gh #49 describes, inverted."
        )
        assert _phase_in_session(session_file) == "red"


# ===========================================================================
# Problem 1 — bare CLI invocations infer args from the active session
# ===========================================================================


class TestCliBareResolveGate:
    def test_bare_invocation_infers_from_active_session(self, in_project: Path) -> None:
        """`pf handoff resolve-gate` with an active session must work bare —
        the protocol exactly as the agent-behavior guide writes it."""
        _write_session(in_project, assessment="Sm Assessment")
        result = CliRunner().invoke(cli, ["handoff", "resolve-gate"])
        assert result.exit_code == 0, (
            f"Bare resolve-gate failed (exit {result.exit_code}):\n{result.output}"
        )
        assert "RESOLVE_RESULT" in result.output
        assert "next_phase: red" in result.output
        assert "next_agent: tea" in result.output

    def test_bare_invocation_without_session_is_actionable(self, in_project: Path) -> None:
        """No session → the error must say so, not dump a Click usage error."""
        result = CliRunner().invoke(cli, ["handoff", "resolve-gate"])
        assert result.exit_code != 0
        assert "session" in result.output.lower(), (
            "Error must tell the agent the active session is missing / to pass "
            f"explicit args, got:\n{result.output}"
        )

    def test_explicit_args_still_work(self, in_project: Path) -> None:
        _write_session(in_project, assessment="Sm Assessment")
        result = CliRunner().invoke(cli, ["handoff", "resolve-gate", STORY_ID, "tdd", "setup"])
        assert result.exit_code == 0, result.output
        assert "next_agent: tea" in result.output


class TestCliBareCompletePhase:
    def test_bare_invocation_infers_and_advances(self, in_project: Path) -> None:
        """Bare complete-phase: from=session phase, to=next phase + gate_type
        from the workflow YAML. The session must actually advance."""
        session_file = _write_session(in_project, assessment="Sm Assessment")
        result = CliRunner().invoke(cli, ["handoff", "complete-phase"])
        assert result.exit_code == 0, (
            f"Bare complete-phase failed (exit {result.exit_code}):\n{result.output}"
        )
        assert _phase_in_session(session_file) == "red", (
            "Bare complete-phase did not advance the session setup→red."
        )

    def test_bare_invocation_still_requires_assessment(self, in_project: Path) -> None:
        """Inference must not bypass the assessment guard."""
        session_file = _write_session(in_project, assessment=None)
        result = CliRunner().invoke(cli, ["handoff", "complete-phase"])
        assert result.exit_code != 0, (
            "Bare complete-phase succeeded with no assessment — inference "
            "bypassed the mechanical guard."
        )
        assert "assessment" in result.output.lower()
        assert _phase_in_session(session_file) == "setup", (
            "Session advanced despite the assessment guard failing."
        )

    def test_bare_invocation_without_session_is_actionable(self, in_project: Path) -> None:
        result = CliRunner().invoke(cli, ["handoff", "complete-phase"])
        assert result.exit_code != 0
        assert "session" in result.output.lower(), (
            f"Error must mention the missing session, got:\n{result.output}"
        )

    def test_explicit_args_still_work(self, in_project: Path) -> None:
        session_file = _write_session(in_project, assessment="Sm Assessment")
        result = CliRunner().invoke(
            cli,
            ["handoff", "complete-phase", STORY_ID, "tdd", "setup", "red", "sm_setup_exit"],
        )
        assert result.exit_code == 0, result.output
        assert _phase_in_session(session_file) == "red"


class TestCliBareMarker:
    def test_bare_invocation_targets_current_phase_owner(self, in_project: Path) -> None:
        """marker runs AFTER complete-phase: the session already shows the new
        phase, so the marker target is the CURRENT phase's agent (red → tea),
        NOT `handoff status`'s next_agent (which would wrongly say dev)."""
        _write_session(in_project, phase="red", assessment="Sm Assessment")
        result = CliRunner().invoke(cli, ["handoff", "marker"])
        assert result.exit_code == 0, (
            f"Bare marker failed (exit {result.exit_code}):\n{result.output}"
        )
        assert "AGENT_COMMAND" in result.output
        assert "tea" in result.output, (
            f"Marker must target the red-phase owner (tea), got:\n{result.output}"
        )
        assert "dev" not in result.output, (
            "Marker targeted the phase AFTER current — wrong inference source; "
            "the post-complete-phase call site needs the current phase owner."
        )

    def test_bare_invocation_without_session_errors(self, in_project: Path) -> None:
        result = CliRunner().invoke(cli, ["handoff", "marker"])
        assert result.exit_code != 0
        assert "session" in result.output.lower() or "NEXT_AGENT" in result.output, (
            f"Error must be actionable about the missing session/agent, got:\n{result.output}"
        )

    def test_explicit_agent_still_works(self, in_project: Path) -> None:
        result = CliRunner().invoke(cli, ["handoff", "marker", "dev"])
        assert result.exit_code == 0, result.output
        assert "AGENT_COMMAND" in result.output


# ===========================================================================
# Rework cycle 1 — Reviewer findings (review verdict: REJECTED)
#
# Each test pins one confirmed finding from the 158-4 code review:
#   RW1 [SEC]    inferred workflow name must be validated as an identifier
#   RW2 [SILENT] config errors must not be masked as "no active session"
#   RW3 [SILENT] unreadable session ≠ missing assessment (wrong remediation)
#   RW4 [EDGE]   OSError at the inference boundary returns a result, not a
#                traceback (SOUL #10)
#   RW5 [EDGE]   resolve-gate CLI exits non-zero on status: "error"
#   RW6 [SEC]    read_text in resolve_gate carries encoding= (CWE-838, static)
#   RW7 [EDGE]   bare marker must not emit a phase name as an agent target
# ===========================================================================


class TestReworkWorkflowNameValidation:
    def test_traversal_workflow_value_rejected_as_invalid(self, in_project: Path) -> None:
        """RW1: `**Workflow:** ../../evil` in session content must be rejected
        by inference as an invalid identifier — NOT interpolated into a YAML
        path (CWE-22). The message must say the value is invalid, proving
        validation fired rather than a failed path lookup."""
        session_file = in_project / ".session" / f"{STORY_ID}-session.md"
        session_file.write_text(
            _session("setup", "Sm Assessment").replace(
                "**Workflow:** tdd", "**Workflow:** ../../evil"
            )
        )
        result = CliRunner().invoke(cli, ["handoff", "resolve-gate"])
        assert result.exit_code != 0, (
            f"Traversal workflow value accepted (exit 0):\n{result.output}"
        )
        assert "invalid" in result.output.lower(), (
            "Error must say the inferred workflow NAME is invalid (validation), "
            f"not merely that a file wasn't found (lookup):\n{result.output}"
        )


class TestReworkConfigErrorVisibility:
    def test_config_error_not_masked_as_no_session(
        self, in_project: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """RW2: a real config error from get_project_root must surface, not be
        swallowed into a cwd fallback that silently 'works' (or a misleading
        no-session message). Only FileNotFoundError (no root) may fall back."""
        import pf.common.config as config_mod

        def _boom(*a, **k):
            raise RuntimeError("config exploded: bad config.local.yaml")

        monkeypatch.setattr(config_mod, "get_project_root", _boom)
        _write_session(in_project, assessment="Sm Assessment")
        result = CliRunner().invoke(cli, ["handoff", "resolve-gate"])
        assert result.exit_code != 0, (
            "A config error was masked by the cwd fallback and the command "
            f"succeeded:\n{result.output}"
        )
        assert "config exploded" in result.output, (
            f"The original config error must be visible, got:\n{result.output}"
        )


class TestReworkUnreadableSession:
    @pytest.fixture
    def unreadable_session(self, project: Path, request: pytest.FixtureRequest) -> Path:
        session_file = _write_session(project, assessment="Sm Assessment")
        session_file.chmod(0o000)
        request.addfinalizer(lambda: session_file.chmod(0o644))
        return session_file

    def test_unreadable_session_is_error_not_missing_heading(
        self, project: Path, unreadable_session: Path
    ) -> None:
        """RW3: a present-but-unreadable session must yield status 'error'
        with the OS problem — NOT 'blocked' telling the agent to add a
        heading that is already there (an agent following that instruction
        literally would corrupt the session)."""
        result = resolve_gate(STORY_ID, "tdd", "setup", project)
        assert result["status"] == "error", (
            f"Unreadable session produced status {result['status']!r} — "
            "must be a distinct 'error', not 'blocked'."
        )
        msg = result.get("error") or ""
        assert "Add a `##" not in msg, (
            f"Misleading remediation for a permissions problem: {msg!r}"
        )

    def test_bare_cli_handles_unreadable_session_without_traceback(
        self, in_project: Path, unreadable_session: Path
    ) -> None:
        """RW4: the inference boundary must return a clean error result —
        an escaping OSError (CliRunner records it as result.exception)
        violates SOUL #10 at a CLI boundary."""
        result = CliRunner().invoke(cli, ["handoff", "resolve-gate"])
        assert result.exception is None or isinstance(result.exception, SystemExit), (
            f"Unhandled exception escaped the CLI: {result.exception!r}"
        )
        assert result.exit_code != 0


class TestReworkErrorExitCode:
    def test_resolve_gate_exits_nonzero_on_error_status(self, in_project: Path) -> None:
        """RW5: status 'error' (workflow not found) must exit non-zero —
        relay automation treats exit 0 as success and marches on (fail-loud,
        gh #50)."""
        _write_session(in_project, assessment="Sm Assessment")
        result = CliRunner().invoke(
            cli, ["handoff", "resolve-gate", STORY_ID, "no-such-workflow", "setup"]
        )
        assert result.exit_code != 0, (
            f"resolve-gate exited 0 on a genuine error:\n{result.output}"
        )


class TestReworkEncodingStaticGuard:
    def test_resolve_gate_read_text_specifies_encoding(self) -> None:
        """RW6 (static guard): rule #5 / CWE-838 — every read_text in
        resolve_gate.py must pin encoding so a LANG=C environment cannot
        turn a session read into a UnicodeDecodeError."""
        import inspect

        import pf.handoff.resolve_gate as rg

        source = inspect.getsource(rg)
        bare_reads = [
            line.strip()
            for line in source.splitlines()
            if ".read_text()" in line
        ]
        assert not bare_reads, (
            f"read_text() without encoding= in resolve_gate.py: {bare_reads}"
        )


class TestReworkMarkerUnknownPhase:
    def test_bare_marker_does_not_emit_phase_name_as_agent(self, in_project: Path) -> None:
        """RW7: when the session phase has no entry in the workflow YAML, the
        phase-name fallback must not be emitted as a handoff target
        (/pf-mystery is not an agent). Fail loud instead."""
        session_file = in_project / ".session" / f"{STORY_ID}-session.md"
        session_file.write_text(
            _session("mystery", "Sm Assessment")
        )
        result = CliRunner().invoke(cli, ["handoff", "marker"])
        assert "/pf-mystery" not in result.output, (
            f"Marker emitted the raw phase name as an agent target:\n{result.output}"
        )
        assert result.exit_code != 0, (
            "Failed owner inference must exit non-zero, got exit "
            f"{result.exit_code}:\n{result.output}"
        )
