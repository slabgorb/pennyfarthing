"""RED tests for Story 158-3 — complete-phase setup→red must require context files.

Epic: 158 (Session/handoff/agent-start robustness)
Story: 158-3 — complete-phase setup→red passes without context files; RED then hard-blocks (gh #61)

## Root cause (for the Dev who turns these green)

The `sm-setup-exit` gate is a *markdown* file run by a haiku subagent — its
`epic-context-validated` / `story-context-validated` checks are LLM
instructions, not code. The script-first handoff flow
(`resolve-gate → complete-phase → marker`) never spawns that subagent, and
`complete_phase`'s only mechanical guard is "is there an Assessment heading?"
— which SM always writes. So context validation is *goodwill*, never
enforced: `complete_phase(..., "setup", "red", "sm_setup_exit")` advances the
story to RED even when the context files are absent. The TEA RED-phase
context gate then hard-blocks, stranding the story between SM and TEA.

The fix (SOUL #11, *Automatic Beats Instructional*): `complete_phase` must
mechanically require the epic + story context documents to exist and be
non-empty for the `sm_setup_exit` transition, returning a `status: "error"`
result (SOUL #10, *Return Results, Don't Throw*) with an actionable message
pointing at `pf context create`.

## Contract pinned by these tests

For the setup-exit transition (`gate_type == "sm_setup_exit"`):
  - BLOCK when `sprint/context/context-story-{id}.md` is missing or empty
  - BLOCK when `sprint/context/context-epic-{N}.md` is missing or empty
  - PASS (status == success) when both exist and are non-empty
  - The error message must be actionable (mention context creation)
  - The session file MUST NOT advance to `red` on a blocked transition

Scope guard (prevents over-application of the new check):
  - A non-setup transition (green→review, gate `tests_pass`) with NO context
    files present must still succeed — the guard is scoped to setup-exit.

The context guard is a presence + non-empty check, mirroring the gate file's
documented Fallback. It deliberately does NOT couple to the full context
schema validator.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.complete_phase import complete_phase

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

STORY_ID = "158-3"
EPIC_N = "158"

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

# Session in the setup phase with an SM Assessment (so the existing
# assessment guard is satisfied and we isolate the context check).
SESSION_SETUP_PHASE = textwrap.dedent("""\
    # Story 158-3: complete-phase setup→red context gate

    **Story ID:** 158-3
    **Workflow:** tdd
    **Phase:** setup
    **Phase Started:** 2026-06-04T00:00:00Z

    ## SM Assessment

    Setup complete — handing off to TEA. Technical approach documented.

    ## Workflow Tracking

    **Phase:** setup
    **Phase Started:** 2026-06-04T00:00:00Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | setup | 2026-06-04T00:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|
""")

# Session in the green phase (for the scope-guard test) — no context needed.
SESSION_GREEN_PHASE = textwrap.dedent("""\
    # Story 158-3: scope guard

    **Story ID:** 158-3
    **Workflow:** tdd
    **Phase:** green
    **Phase Started:** 2026-06-04T01:00:00Z

    ## Dev Assessment

    Implementation complete — tests green.

    ## Workflow Tracking

    **Phase:** green
    **Phase Started:** 2026-06-04T01:00:00Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | green | 2026-06-04T01:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|
""")


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Minimal project: tdd workflow YAML, .session/, sprint/context/ dirs."""
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)
    (workflows_dir / "tdd.yaml").write_text(yaml.dump(TDD_WORKFLOW, default_flow_style=False))
    (tmp_path / ".session").mkdir()
    (tmp_path / "sprint" / "context").mkdir(parents=True)
    return tmp_path


@pytest.fixture
def setup_session(project: Path) -> Path:
    session_file = project / ".session" / f"{STORY_ID}-session.md"
    session_file.write_text(SESSION_SETUP_PHASE)
    return session_file


def _write_context(project: Path, *, epic: bool = True, story: bool = True) -> None:
    """Create non-empty context docs. Pass epic/story False to omit one."""
    ctx = project / "sprint" / "context"
    if epic:
        (ctx / f"context-epic-{EPIC_N}.md").write_text(
            f"# Epic {EPIC_N} Context\n\nSession/handoff robustness.\n"
        )
    if story:
        (ctx / f"context-story-{STORY_ID}.md").write_text(
            f"# Story {STORY_ID} Context\n\nProblem, approach, ACs.\n"
        )


def _phase_in_session(session_file: Path) -> str:
    """Return the value of the first `**Phase:**` line in the session file."""
    for line in session_file.read_text().splitlines():
        if line.startswith("**Phase:**"):
            return line.split("**Phase:**", 1)[1].strip()
    return ""


# ===========================================================================
# AC4: complete-phase setup→red BLOCKS when context files are missing
# ===========================================================================


class TestSetupExitRequiresContext:
    def test_blocks_when_both_context_files_missing(
        self, project: Path, setup_session: Path
    ) -> None:
        """No epic/story context → setup→red must return error, not success."""
        result = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert result["status"] == "error", (
            "complete-phase advanced setup→red with NO context files — the "
            "exact gh #61 bug. It must block."
        )

    def test_blocks_when_story_context_missing(
        self, project: Path, setup_session: Path
    ) -> None:
        """Epic present but story context missing → block."""
        _write_context(project, epic=True, story=False)
        result = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert result["status"] == "error"

    def test_blocks_when_epic_context_missing(
        self, project: Path, setup_session: Path
    ) -> None:
        """Story present but epic context missing → block."""
        _write_context(project, epic=False, story=True)
        result = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert result["status"] == "error"

    def test_blocks_when_context_file_is_empty(
        self, project: Path, setup_session: Path
    ) -> None:
        """A zero-byte context file is not valid setup output → block."""
        _write_context(project, epic=True, story=True)
        (project / "sprint" / "context" / f"context-story-{STORY_ID}.md").write_text("")
        result = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert result["status"] == "error"

    def test_block_does_not_advance_phase(
        self, project: Path, setup_session: Path
    ) -> None:
        """A blocked transition must leave the session in `setup`, not `red`."""
        complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert _phase_in_session(setup_session) == "setup", (
            "Session advanced to a new phase despite the context gate blocking — "
            "the half-mutated session is the corruption the story is about."
        )

    def test_error_message_is_actionable(
        self, project: Path, setup_session: Path
    ) -> None:
        """The error must point the operator at context creation."""
        result = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        msg = (result.get("error") or "").lower()
        assert "context" in msg, f"Error not actionable about context: {result.get('error')!r}"
        assert "create" in msg, (
            f"Error should tell the operator to create context: {result.get('error')!r}"
        )


# ===========================================================================
# AC4 complement: PASSES when both context files exist (regression guard)
# ===========================================================================


class TestSetupExitPassesWithContext:
    def test_succeeds_when_both_context_present(
        self, project: Path, setup_session: Path
    ) -> None:
        _write_context(project, epic=True, story=True)
        result = complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert result["status"] == "success", (
            f"Valid setup with context present was wrongly blocked: {result.get('error')!r}"
        )

    def test_advances_to_red_when_context_present(
        self, project: Path, setup_session: Path
    ) -> None:
        _write_context(project, epic=True, story=True)
        complete_phase(STORY_ID, "tdd", "setup", "red", "sm_setup_exit", project)
        assert _phase_in_session(setup_session) == "red"


# ===========================================================================
# Scope guard: the new check must NOT apply to non-setup transitions
# ===========================================================================


class TestContextGuardIsScoped:
    def test_green_to_review_still_passes_without_context(self, project: Path) -> None:
        """green→review (tests_pass) must not newly require context files.

        Context files persist for the life of a story, so a real green→review
        would have them — but the guard must be keyed to the setup-exit
        transition, not blindly required on every phase. This pins that scope.
        """
        session_file = project / ".session" / f"{STORY_ID}-session.md"
        session_file.write_text(SESSION_GREEN_PHASE)
        # Deliberately no context files written.
        result = complete_phase(STORY_ID, "tdd", "green", "review", "tests_pass", project)
        assert result["status"] == "success", (
            "green→review was blocked by the context guard — the guard is "
            "over-applied; scope it to the sm_setup_exit transition."
        )
