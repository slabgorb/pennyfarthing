"""Tests for removing handoff subagents and inline fallback — Story 108-2.

Epic: 108 (Full Migration & Cleanup)
Story: 108-2 — Remove handoff subagents and inline fallback

Tests the removal of deprecated handoff subagents and the gate.type
fallback code path, leaving only gate.file-based resolution.

Acceptance Criteria:
- [AC1] pennyfarthing-dist/agents/handoff.md deleted
- [AC2] pennyfarthing-dist/agents/sm-handoff.md deleted
- [AC3] gate.type fallback removed from resolve-gate — file-only gates resolved
- [AC4] checkGate() in Cyclist updated or removed (see TS test)
- [AC5] No remaining references to handoff/sm-handoff subagents in agent files
- [AC6] All existing tests pass
- [AC7] Single code path: all gated phases in phased workflows have gate.file
"""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.resolve_gate import resolve_gate

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# src/pf/tests -> src/pf -> src -> pennyfarthing-dist
DIST_DIR = Path(__file__).resolve().parents[3]
AGENTS_DIR = DIST_DIR / "agents"
WORKFLOWS_DIR = DIST_DIR / "workflows"
GATES_DIR = DIST_DIR / "gates"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SESSION_WITH_ASSESSMENT = textwrap.dedent("""\
    # Story 108-2: Remove handoff subagents and inline fallback

    **Story ID:** 108-2
    **Workflow:** tdd
    **Phase:** green
    **Phase Started:** 2026-02-15T10:00:00Z

    ## TEA Assessment

    **Tests Written:** 5 tests
    **Status:** RED confirmed
""")

SESSION_WITHOUT_ASSESSMENT = textwrap.dedent("""\
    # Story 108-2: Remove handoff subagents and inline fallback

    **Story ID:** 108-2
    **Workflow:** tdd
    **Phase:** green
    **Phase Started:** 2026-02-15T10:00:00Z
""")

WORKFLOW_FILE_ONLY_GATE = {
    "workflow": {
        "name": "file-only-test",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {
                "name": "green",
                "agent": "dev",
                "gate": {
                    "file": "gates/tests-pass",
                    "condition": "All tests passing",
                },
            },
            {"name": "finish", "agent": "sm"},
        ],
    }
}


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create a minimal project with workflow YAMLs and session."""
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)
    (tmp_path / ".session").mkdir()

    # Write the file-only-gate workflow
    (workflows_dir / "file-only-test.yaml").write_text(
        yaml.dump(WORKFLOW_FILE_ONLY_GATE, default_flow_style=False)
    )

    # Copy real tdd.yaml for integration tests
    tdd_src = WORKFLOWS_DIR / "tdd.yaml"
    if tdd_src.exists():
        (workflows_dir / "tdd.yaml").write_text(tdd_src.read_text())

    return tmp_path


# ===========================================================================
# AC1: pennyfarthing-dist/agents/handoff.md deleted
# ===========================================================================


class TestHandoffMdDeleted:
    """AC1: handoff.md must not exist in pennyfarthing-dist/agents/."""

    def test_handoff_md_does_not_exist(self) -> None:
        """AC1: handoff.md should be deleted from agents directory."""
        assert not (AGENTS_DIR / "handoff.md").exists(), (
            "handoff.md still exists — should be deleted in 108-2"
        )


# ===========================================================================
# AC2: pennyfarthing-dist/agents/sm-handoff.md deleted
# ===========================================================================


class TestSmHandoffMdDeleted:
    """AC2: sm-handoff.md must not exist in pennyfarthing-dist/agents/."""

    def test_sm_handoff_md_does_not_exist(self) -> None:
        """AC2: sm-handoff.md should be deleted from agents directory."""
        assert not (AGENTS_DIR / "sm-handoff.md").exists(), (
            "sm-handoff.md still exists — should be deleted in 108-2"
        )


# ===========================================================================
# AC3: gate.type fallback removed — file-only gates resolve properly
# ===========================================================================


class TestGateTypeFallbackRemoved:
    """AC3: gate with file but no type should resolve via assessment, not skip."""

    def test_no_gate_at_all_still_returns_skip(self, project: Path) -> None:
        """AC3: Phase with no gate (finish) should still return 'skip'."""
        session = project / ".session" / "108-2-session.md"
        session.write_text(SESSION_WITH_ASSESSMENT)

        result = resolve_gate("108-2", "tdd", "finish", project_root=project)
        assert result["status"] == "skip", f"No-gate phase should skip, got: {result['status']}"

    def test_gate_file_only_returns_ready_with_assessment(self, project: Path) -> None:
        """AC3: gate with file but no type + assessment → 'ready' (not 'skip').

        Before 108-2: gate_type is None → skip (fallback).
        After 108-2: gate.file present → check assessment → ready.
        """
        session = project / ".session" / "108-2-session.md"
        session.write_text(SESSION_WITH_ASSESSMENT)

        result = resolve_gate("108-2", "file-only-test", "green", project_root=project)
        assert result["status"] == "ready", (
            f"File-only gate with assessment should be 'ready', got: "
            f"'{result['status']}' — gate.type fallback still active?"
        )

    def test_gate_file_only_returns_ready_without_assessment(self, project: Path) -> None:
        """AC3: gate with file but no type + NO assessment → 'ready'.

        Assessment checking is not done by resolve_gate (moved to complete_phase).
        resolve_gate returns 'ready' for any phase with a gate present.
        """
        session = project / ".session" / "108-2-session.md"
        session.write_text(SESSION_WITHOUT_ASSESSMENT)

        result = resolve_gate("108-2", "file-only-test", "green", project_root=project)
        assert result["status"] == "ready", (
            f"File-only gate should be 'ready' (assessment checked in complete_phase), got: "
            f"'{result['status']}'"
        )

    def test_gate_file_only_populates_gate_file_field(self, project: Path) -> None:
        """AC3: gate_file field should be populated for file-only gates."""
        session = project / ".session" / "108-2-session.md"
        session.write_text(SESSION_WITH_ASSESSMENT)

        result = resolve_gate("108-2", "file-only-test", "green", project_root=project)
        assert result["gate_file"] == "gates/tests-pass", (
            f"Expected gate_file='gates/tests-pass', got: {result['gate_file']}"
        )

    def test_gate_with_both_file_and_type_still_ready(self, project: Path) -> None:
        """AC3: gate with both file and type should still return 'ready'."""
        session = project / ".session" / "108-2-session.md"
        session.write_text(SESSION_WITH_ASSESSMENT)

        result = resolve_gate("108-2", "tdd", "green", project_root=project)
        assert result["status"] == "ready"
        assert result["gate_file"] == "gates/dev-exit"
        assert result["gate_type"] == "dev_exit"


# ===========================================================================
# AC5: No remaining references to handoff/sm-handoff subagents
# ===========================================================================


class TestNoSubagentReferences:
    """AC5: No agent files should reference the deleted subagents."""

    def _scan_agent_files(self, pattern: str) -> list[tuple[str, str]]:
        """Scan all agent .md files for a regex pattern. Returns (file, line) pairs."""
        hits = []
        for md_file in AGENTS_DIR.glob("*.md"):
            # Skip the files being deleted (they'll be gone)
            if md_file.name in ("handoff.md", "sm-handoff.md"):
                continue
            content = md_file.read_text()
            for line in content.splitlines():
                if re.search(pattern, line, re.IGNORECASE):
                    hits.append((md_file.name, line.strip()))
        return hits

    def test_no_agent_references_handoff_subagent(self) -> None:
        """AC5: No agent .md files should spawn or reference 'handoff' subagent.

        Matches patterns like:
        - subagent_type: handoff
        - spawn handoff
        - sm-handoff subagent
        But NOT: 'pf handoff' (the CLI) or 'handoff.ts' (the module)
        """
        # Look for subagent spawn references to the deprecated handoff subagent
        hits = self._scan_agent_files(
            r'(?:subagent.*handoff\.md|sm-handoff\.md|"sm-handoff"|"handoff"'
            r"|handoff subagent|sm-handoff subagent)"
        )
        assert len(hits) == 0, (
            f"Found {len(hits)} references to deprecated handoff subagents:\n"
            + "\n".join(f"  {f}: {line}" for f, line in hits)
        )

    def test_agents_readme_no_deprecated_entries(self) -> None:
        """AC5: README.md should not list handoff.md or sm-handoff.md."""
        readme = AGENTS_DIR / "README.md"
        if not readme.exists():
            pytest.skip("No agents README.md")

        content = readme.read_text()
        # Should not have the deprecated entries
        assert "handoff.md" not in content, "README.md still references handoff.md"
        assert "sm-handoff.md" not in content, "README.md still references sm-handoff.md"


# ===========================================================================
# AC7: Single code path — all gated phases have gate.file
# ===========================================================================

# Phased workflows that should have gate.file on every gated phase
PHASED_WORKFLOWS = [
    "tdd",
    "trivial",
    "bdd",
    "bdd-tandem",
    "tdd-tandem",
    "2party-tdd",
    "agent-docs",
    "patch",
]


class TestAllGatedPhasesHaveGateFile:
    """AC7: Every gated phase in phased workflows must have gate.file."""

    def _load_workflow(self, name: str) -> dict | None:
        """Load a workflow YAML, return None if not found."""
        path = WORKFLOWS_DIR / f"{name}.yaml"
        if not path.exists():
            return None
        return yaml.safe_load(path.read_text())

    def _gated_phases_missing_file(self, workflow_data: dict) -> list[tuple[str, str]]:
        """Find phases that have a gate but no gate.file.

        Returns list of (phase_name, gate_type) tuples.
        Manual gates are excluded — they skip resolution entirely.
        """
        missing = []
        for phase in workflow_data["workflow"]["phases"]:
            gate = phase.get("gate")
            if not gate:
                continue  # No gate at all — fine (setup, finish)
            gate_type = gate.get("type")
            if gate_type == "manual":
                continue  # Manual gates always skip
            if not gate.get("file"):
                missing.append((phase["name"], gate_type or "(no type)"))
        return missing

    @pytest.mark.parametrize("workflow_name", PHASED_WORKFLOWS)
    def test_workflow_gated_phases_have_gate_file(self, workflow_name: str) -> None:
        """AC7: Every non-manual gated phase must have gate.file defined.

        This ensures the single code path — resolve-gate only needs
        gate.file, not gate.type, for resolution.
        """
        wf = self._load_workflow(workflow_name)
        if wf is None:
            pytest.skip(f"Workflow {workflow_name} not found")

        missing = self._gated_phases_missing_file(wf)
        assert len(missing) == 0, (
            f"Workflow '{workflow_name}' has gated phases without gate.file:\n"
            + "\n".join(f"  - {name} (type={gtype})" for name, gtype in missing)
            + "\nAll gated phases must have gate.file for single code path."
        )
