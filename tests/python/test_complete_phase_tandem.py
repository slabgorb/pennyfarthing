"""
Tests for Story 86-13: Tandem backseat not activating from CLI invocation.

Root cause: complete_phase() doesn't read the workflow YAML for tandem: blocks
and doesn't write the **Tandem:** line to the session file during phase transitions.
Without that line, agents never spawn the backseat observer.

The fix must:
1. Read workflow YAML for tandem: block on the to_phase
2. Write **Tandem:** line to session when to_phase has tandem config
3. Remove **Tandem:** line when to_phase has no tandem config
4. Preserve existing session content around the tandem line

Run with: python -m pytest tests/python/test_complete_phase_tandem.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.handoff.complete_phase import complete_phase  # noqa: E402

# =============================================================================
# Fixtures
# =============================================================================

WORKFLOW_TDD_TANDEM = {
    "workflow": {
        "name": "tdd-tandem",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {
                "name": "red",
                "agent": "tea",
                "gate": {"type": "tests_fail"},
                "tandem": {"partner": "architect", "scope": "file-watch"},
            },
            {
                "name": "green",
                "agent": "dev",
                "gate": {"type": "tests_pass"},
                "tandem": {"partner": "architect", "scope": "file-watch"},
            },
            {
                "name": "review",
                "agent": "reviewer",
                "gate": {"type": "approval"},
                "tandem": {"partner": "pm", "scope": "file-watch"},
            },
            {"name": "finish", "agent": "sm"},
        ],
    }
}

WORKFLOW_TDD_PLAIN = {
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

SESSION_TEMPLATE = """\
# Story 99-1: Test story

**Status:** in_progress
**Phase:** {phase}
**Workflow:** {workflow}
**Jira:** PROJ-99999
**Branch:** fix/test-branch
**Repos:** pennyfarthing
**Points:** 5
**Epic:** 99 — Test Epic

## Story Context

Test story context.

## Acceptance Criteria

- [ ] AC1: First acceptance criterion
- [ ] AC2: Second acceptance criterion

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-02-17T10:00:00Z | 2026-02-17T10:05:00Z | 5m |
| {phase} | 2026-02-17T10:05:00Z | - | - |

### Handoff History
| From | To | Gate | Result | Time |
|------|-----|------|--------|------|
| setup (sm) | {phase} (tea) | manual | PASSED | 2026-02-17T10:05:00Z |

## TEA Assessment

**Tests:** 3 failing (RED state confirmed)

## Assessment

(pending)
"""

SESSION_WITH_TANDEM = """\
# Story 99-1: Test story

**Status:** in_progress
**Phase:** green
**Workflow:** tdd-tandem
**Tandem:** architect (file-watch)
**Jira:** PROJ-99999
**Branch:** fix/test-branch
**Repos:** pennyfarthing
**Points:** 5
**Epic:** 99 — Test Epic

## Story Context

Test story context.

## Acceptance Criteria

- [ ] AC1: First acceptance criterion

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-02-17T10:00:00Z | 2026-02-17T10:05:00Z | 5m |
| red | 2026-02-17T10:05:00Z | 2026-02-17T10:15:00Z | 10m |
| green | 2026-02-17T10:15:00Z | - | - |

### Handoff History
| From | To | Gate | Result | Time |
|------|-----|------|--------|------|
| setup (sm) | red (tea) | manual | PASSED | 2026-02-17T10:05:00Z |
| red (tea) | green (dev) | tests_fail | PASSED | 2026-02-17T10:15:00Z |

## Dev Assessment

**Implementation complete.**

## Assessment

(pending)
"""


# The `approval` gate was hardened: leaving the review phase now also requires a
# `## Subagent Results` section and specialist tags in the Reviewer Assessment.
# Tests below that cross review -> finish append this so they exercise the tandem
# line behavior rather than tripping over unrelated gate content requirements.
APPROVAL_GATE_SECTIONS = """
## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |
| 2 | reviewer-rule-checker | Yes | clean | none | N/A |
| 3 | reviewer-security | Yes | clean | none | N/A |
| 4 | reviewer-test-analyzer | Yes | clean | none | N/A |
| 5 | reviewer-type-design | Yes | clean | none | N/A |

**All received: Yes**

## Reviewer Assessment

**Verdict:** APPROVED

- [RULE] clean
- [SEC] clean
- [TEST] clean
- [TYPE] clean
"""


def _append_approval_sections(session_path: Path) -> None:
    """Satisfy the hardened `approval` gate's content requirements."""
    with session_path.open("a") as fh:
        fh.write(APPROVAL_GATE_SECTIONS)


@pytest.fixture()
def tmp_project(tmp_path):
    """Create a temporary project with .pennyfarthing and .session dirs."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    workflows_dir = pf_dir / "workflows"
    workflows_dir.mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    return tmp_path


@pytest.fixture()
def tandem_project(tmp_project):
    """Project with tdd-tandem workflow YAML."""
    wf_path = tmp_project / ".pennyfarthing" / "workflows" / "tdd-tandem.yaml"
    wf_path.write_text(yaml.dump(WORKFLOW_TDD_TANDEM, default_flow_style=False))
    return tmp_project


@pytest.fixture()
def plain_project(tmp_project):
    """Project with plain tdd workflow YAML (no tandem blocks)."""
    wf_path = tmp_project / ".pennyfarthing" / "workflows" / "tdd.yaml"
    wf_path.write_text(yaml.dump(WORKFLOW_TDD_PLAIN, default_flow_style=False))
    return tmp_project


def _create_session(project: Path, phase: str, workflow: str) -> Path:
    """Helper to create a session file from template."""
    session_path = project / ".session" / "99-1-session.md"
    content = SESSION_TEMPLATE.format(phase=phase, workflow=workflow)
    session_path.write_text(content)
    return session_path


def _create_session_with_tandem(project: Path) -> Path:
    """Helper to create a session file that already has a Tandem line."""
    session_path = project / ".session" / "99-1-session.md"
    session_path.write_text(SESSION_WITH_TANDEM)
    return session_path


# =============================================================================
# AC1: Tandem line written when transitioning to tandem-enabled phase
# =============================================================================


class TestTandemLineWritten:
    """complete_phase writes **Tandem:** line when to_phase has tandem config."""

    def test_setup_to_red_writes_tandem_line(self, tandem_project):
        """Transitioning setup→red in tdd-tandem should add **Tandem:** line."""
        _create_session(tandem_project, "setup", "tdd-tandem")

        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="setup",
            to_phase="red",
            gate_type="manual",
            project_root=tandem_project,
        )

        assert result["status"] == "success"
        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        assert "**Tandem:** architect (file-watch)" in content, (
            "Session should contain Tandem line after transitioning to tandem-enabled phase"
        )

    def test_red_to_green_writes_tandem_line(self, tandem_project):
        """Transitioning red→green in tdd-tandem should add **Tandem:** line."""
        _create_session(tandem_project, "red", "tdd-tandem")

        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="red",
            to_phase="green",
            gate_type="tests_fail",
            project_root=tandem_project,
        )

        assert result["status"] == "success"
        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        assert "**Tandem:** architect (file-watch)" in content

    def test_green_to_review_writes_pm_tandem(self, tandem_project):
        """Transitioning green→review should write PM as tandem partner."""
        _create_session(tandem_project, "green", "tdd-tandem")

        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="green",
            to_phase="review",
            gate_type="tests_pass",
            project_root=tandem_project,
        )

        assert result["status"] == "success"
        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        assert "**Tandem:** pm (file-watch)" in content, (
            "Review phase should have PM as tandem partner"
        )

    def test_tandem_line_placed_near_metadata(self, tandem_project):
        """Tandem line should be in the metadata section (near Phase/Workflow)."""
        _create_session(tandem_project, "setup", "tdd-tandem")

        complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="setup",
            to_phase="red",
            gate_type="manual",
            project_root=tandem_project,
        )

        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        lines = content.splitlines()

        tandem_idx = None
        workflow_idx = None
        for i, line in enumerate(lines):
            if line.startswith("**Tandem:**"):
                tandem_idx = i
            if line.startswith("**Workflow:**"):
                workflow_idx = i

        assert tandem_idx is not None, "Tandem line should exist"
        assert workflow_idx is not None, "Workflow line should exist"
        # Tandem should be near the metadata block (within 5 lines of Workflow)
        assert abs(tandem_idx - workflow_idx) <= 5, (
            f"Tandem line (line {tandem_idx}) should be near Workflow line (line {workflow_idx})"
        )


# =============================================================================
# AC2: No tandem line for phases without tandem config
# =============================================================================


class TestNoTandemForPlainPhases:
    """complete_phase does NOT write Tandem line for non-tandem phases."""

    def test_plain_tdd_no_tandem_line(self, plain_project):
        """Plain tdd workflow (no tandem blocks) should not add Tandem line."""
        _create_session(plain_project, "setup", "tdd")

        result = complete_phase(
            story_id="99-1",
            workflow="tdd",
            from_phase="setup",
            to_phase="red",
            gate_type="manual",
            project_root=plain_project,
        )

        assert result["status"] == "success"
        content = (plain_project / ".session" / "99-1-session.md").read_text()
        assert "**Tandem:**" not in content, (
            "Plain tdd workflow should NOT have a Tandem line"
        )

    def test_tandem_workflow_finish_phase_no_tandem(self, tandem_project):
        """Finish phase has no tandem even in tdd-tandem workflow."""
        session_path = _create_session(tandem_project, "review", "tdd-tandem")
        _append_approval_sections(session_path)

        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=tandem_project,
        )

        assert result["status"] == "success"
        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        assert "**Tandem:**" not in content, (
            "Finish phase should NOT have a Tandem line"
        )


# =============================================================================
# AC3: Tandem line removed when transitioning to non-tandem phase
# =============================================================================


class TestTandemLineRemoved:
    """complete_phase removes stale Tandem line when entering non-tandem phase."""

    def test_removes_tandem_line_on_finish(self, tandem_project):
        """Transitioning from review (tandem) to finish should remove Tandem line."""
        _create_session_with_tandem(tandem_project)
        # Rewrite to review phase since fixture creates green
        session_path = tandem_project / ".session" / "99-1-session.md"
        content = session_path.read_text()
        content = content.replace("**Phase:** green", "**Phase:** review")
        content = content.replace("**Tandem:** architect (file-watch)",
                                  "**Tandem:** pm (file-watch)")
        session_path.write_text(content)
        _append_approval_sections(session_path)

        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=tandem_project,
        )

        assert result["status"] == "success"
        content = session_path.read_text()
        assert "**Tandem:**" not in content, (
            "Tandem line should be removed when entering non-tandem phase"
        )


# =============================================================================
# AC4: Tandem line updated when partner changes between phases
# =============================================================================


class TestTandemLineUpdated:
    """complete_phase updates Tandem line when partner changes."""

    def test_updates_tandem_partner_green_to_review(self, tandem_project):
        """Green→review should change tandem from architect to pm."""
        _create_session_with_tandem(tandem_project)

        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="green",
            to_phase="review",
            gate_type="tests_pass",
            project_root=tandem_project,
        )

        assert result["status"] == "success"
        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        assert "**Tandem:** pm (file-watch)" in content, (
            "Tandem partner should change from architect to pm for review phase"
        )
        assert "**Tandem:** architect" not in content, (
            "Old tandem partner should be replaced, not duplicated"
        )

    def test_no_duplicate_tandem_lines(self, tandem_project):
        """Repeated transitions should not create duplicate Tandem lines."""
        _create_session_with_tandem(tandem_project)

        # Transition green→review (has tandem)
        complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="green",
            to_phase="review",
            gate_type="tests_pass",
            project_root=tandem_project,
        )

        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        tandem_count = content.count("**Tandem:**")
        assert tandem_count == 1, (
            f"Should have exactly 1 Tandem line, found {tandem_count}"
        )


# =============================================================================
# Regression: existing complete_phase behavior preserved
# =============================================================================


class TestExistingBehaviorPreserved:
    """Ensure the tandem addition doesn't break existing phase transition logic."""

    def test_phase_field_updated(self, tandem_project):
        """Phase field should still be updated correctly."""
        _create_session(tandem_project, "setup", "tdd-tandem")

        complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="setup",
            to_phase="red",
            gate_type="manual",
            project_root=tandem_project,
        )

        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        assert "**Phase:** red" in content

    def test_handoff_history_still_written(self, tandem_project):
        """Handoff history row should still be appended."""
        _create_session(tandem_project, "setup", "tdd-tandem")

        complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="setup",
            to_phase="red",
            gate_type="manual",
            project_root=tandem_project,
        )

        content = (tandem_project / ".session" / "99-1-session.md").read_text()
        assert "setup (sm)" in content
        assert "red (tea)" in content

    def test_error_when_no_session(self, tandem_project):
        """Should return error when session file doesn't exist."""
        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="setup",
            to_phase="red",
            gate_type="manual",
            project_root=tandem_project,
        )
        assert result["status"] == "error"
        assert "not found" in result["error"].lower()

    def test_success_result_format_unchanged(self, tandem_project):
        """Result dict format should be unchanged."""
        _create_session(tandem_project, "setup", "tdd-tandem")

        result = complete_phase(
            story_id="99-1",
            workflow="tdd-tandem",
            from_phase="setup",
            to_phase="red",
            gate_type="manual",
            project_root=tandem_project,
        )

        assert "status" in result
        assert "session_file" in result
        assert "error" in result
