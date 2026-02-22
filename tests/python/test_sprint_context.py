"""
Tests for SprintContext dataclass and resolve_sprint_context() function.

Story: MSSCI-15422 - Define SprintContext dataclass and resolve_sprint_context()
Epic: 125 - Sprint State Engine Consolidation

Run with: python -m pytest tests/python/test_sprint_context.py -v
"""

import dataclasses
import os
import textwrap
from pathlib import Path
from typing import get_type_hints

import pytest
import yaml

from pf.core.models import SprintContext
from pf.core.resolver import resolve_sprint_context


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_root(tmp_path):
    """Create a minimal project structure for default sprint resolution."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()

    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    session_dir = tmp_path / ".session"
    session_dir.mkdir()

    # Default sprint file
    sprint_data = {
        "sprint": {
            "name": "Sprint 2608",
            "status": "active",
        },
        "epics": [
            {
                "id": "100",
                "title": "Test Epic",
                "repos": ["orchestrator", "pennyfarthing"],
                "stories": [],
            }
        ],
    }
    sprint_file = sprint_dir / "current-sprint.yaml"
    sprint_file.write_text(yaml.dump(sprint_data))

    return tmp_path


@pytest.fixture
def focus_project_root(tmp_path):
    """Create a project structure with multi-sprint registry and preference."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()

    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    session_dir = tmp_path / ".session"
    session_dir.mkdir()

    # Default sprint
    default_sprint = {
        "sprint": {
            "name": "Sprint 2608",
            "status": "active",
        },
        "epics": [],
    }
    (sprint_dir / "current-sprint.yaml").write_text(yaml.dump(default_sprint))

    # Focus sprint in a subdirectory
    focus_dir = sprint_dir / "focus"
    focus_dir.mkdir()
    focus_sprint = {
        "sprint": {
            "name": "OCSF Research Spike 1",
            "status": "active",
        },
        "epics": [
            {
                "id": "200",
                "title": "OCSF Epic",
                "repos": ["ocsf-api"],
                "stories": [],
            }
        ],
    }
    (focus_dir / "ocsf-rs1.yaml").write_text(yaml.dump(focus_sprint))

    # Sprint registry
    registry = {
        "sprints": {
            "main": {
                "file": "current-sprint.yaml",
                "type": "orchestrator",
                "context_root": str(tmp_path),
                "session_root": str(session_dir),
            },
            "ocsf-rs1": {
                "file": "focus/ocsf-rs1.yaml",
                "type": "focus",
                "context_root": str(tmp_path / "projects" / "ocsf"),
                "session_root": str(tmp_path / "projects" / "ocsf" / ".session"),
                "repos": ["ocsf-api"],
            },
        }
    }
    (sprint_dir / "sprints.yaml").write_text(yaml.dump(registry))

    # Config with active sprint preference
    config = {"sprint": {"active": "ocsf-rs1"}}
    (pf_dir / "config.local.yaml").write_text(yaml.dump(config))

    return tmp_path


# ===========================================================================
# AC1: SprintContext dataclass defined with all fields
# ===========================================================================


class TestSprintContextDataclass:
    """AC1: SprintContext dataclass is properly defined with all required fields."""

    def test_has_all_required_fields(self):
        """SprintContext must have all 7 specified fields."""
        fields = {f.name for f in dataclasses.fields(SprintContext)}
        expected = {
            "sprint_file",
            "context_root",
            "session_root",
            "repos",
            "name",
            "type",
            "is_default",
        }
        assert expected == fields, f"Missing fields: {expected - fields}"

    def test_is_frozen_immutable(self):
        """SprintContext must be immutable (frozen=True)."""
        ctx = SprintContext(
            sprint_file="/tmp/sprint.yaml",
            context_root="/tmp",
            session_root="/tmp/.session",
            repos=["orchestrator"],
            name="Test Sprint",
            type="orchestrator",
            is_default=True,
        )
        with pytest.raises(dataclasses.FrozenInstanceError):
            ctx.name = "Mutated"

    def test_field_types_annotated(self):
        """SprintContext fields must have proper type annotations."""
        hints = get_type_hints(SprintContext)
        assert hints["sprint_file"] is str
        assert hints["context_root"] is str
        assert hints["session_root"] is str
        assert hints["name"] is str
        assert hints["type"] is str
        assert hints["is_default"] is bool
        # repos should be list[str]
        assert hasattr(hints["repos"], "__origin__") or hints["repos"] is list

    def test_can_construct_with_all_fields(self):
        """SprintContext can be constructed with all fields."""
        ctx = SprintContext(
            sprint_file="/path/to/sprint.yaml",
            context_root="/project",
            session_root="/project/.session",
            repos=["orchestrator", "pennyfarthing"],
            name="Sprint 2608",
            type="orchestrator",
            is_default=True,
        )
        assert ctx.sprint_file == "/path/to/sprint.yaml"
        assert ctx.context_root == "/project"
        assert ctx.session_root == "/project/.session"
        assert ctx.repos == ["orchestrator", "pennyfarthing"]
        assert ctx.name == "Sprint 2608"
        assert ctx.type == "orchestrator"
        assert ctx.is_default is True


# ===========================================================================
# AC2: resolve_sprint_context() — default case (no preference set)
# ===========================================================================


class TestResolveDefaultCase:
    """AC2: resolve_sprint_context() returns correct context for default case."""

    def test_resolves_to_default_sprint_file(self, project_root):
        """Default case resolves to sprint/current-sprint.yaml."""
        ctx = resolve_sprint_context(str(project_root))
        expected_path = str((project_root / "sprint" / "current-sprint.yaml").resolve())
        assert ctx.sprint_file == expected_path

    def test_default_returns_complete_context(self, project_root):
        """Default case returns SprintContext with all fields populated."""
        ctx = resolve_sprint_context(str(project_root))

        assert isinstance(ctx, SprintContext)
        assert ctx.sprint_file  # non-empty
        assert ctx.context_root  # non-empty
        assert ctx.session_root  # non-empty
        assert isinstance(ctx.repos, list)
        assert ctx.name  # non-empty
        assert ctx.type  # non-empty

    def test_default_case_sets_is_default_true(self, project_root):
        """Default case must set is_default=True."""
        ctx = resolve_sprint_context(str(project_root))
        assert ctx.is_default is True


# ===========================================================================
# AC3: resolve_sprint_context() — focus case (preference set, registry lookup)
# ===========================================================================


class TestResolveFocusCase:
    """AC3: resolve_sprint_context() returns correct context for focus case."""

    def test_reads_preference_from_config(self, focus_project_root):
        """Focus case reads sprint.active from config.local.yaml."""
        ctx = resolve_sprint_context(str(focus_project_root))
        # Should NOT be the default sprint
        assert ctx.is_default is False

    def test_resolves_via_registry_lookup(self, focus_project_root):
        """Focus case resolves the sprint file via sprints.yaml registry."""
        ctx = resolve_sprint_context(str(focus_project_root))
        expected_path = str(
            (focus_project_root / "sprint" / "focus" / "ocsf-rs1.yaml").resolve()
        )
        assert ctx.sprint_file == expected_path

    def test_focus_returns_complete_context(self, focus_project_root):
        """Focus case returns SprintContext with registry metadata."""
        ctx = resolve_sprint_context(str(focus_project_root))

        assert isinstance(ctx, SprintContext)
        assert ctx.name == "ocsf-rs1"
        assert ctx.type == "focus"
        assert ctx.is_default is False
        assert isinstance(ctx.repos, list)


# ===========================================================================
# AC4: Edge cases
# ===========================================================================


class TestEdgeCases:
    """AC4: Edge cases are handled gracefully."""

    def test_missing_registry_falls_back_to_default(self, tmp_path):
        """Missing sprints.yaml with preference set should fall back to default."""
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".session").mkdir()

        # Sprint file exists
        sprint_data = {
            "sprint": {"name": "Fallback Sprint", "status": "active"},
            "epics": [],
        }
        (sprint_dir / "current-sprint.yaml").write_text(yaml.dump(sprint_data))

        # Config has preference but NO sprints.yaml registry
        config = {"sprint": {"active": "nonexistent"}}
        (pf_dir / "config.local.yaml").write_text(yaml.dump(config))

        # Should gracefully fall back to default
        ctx = resolve_sprint_context(str(tmp_path))
        assert ctx.is_default is True

    def test_invalid_preference_falls_back_to_default(self, tmp_path):
        """Preference pointing to unknown sprint name falls back to default."""
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".session").mkdir()

        sprint_data = {
            "sprint": {"name": "Default Sprint", "status": "active"},
            "epics": [],
        }
        (sprint_dir / "current-sprint.yaml").write_text(yaml.dump(sprint_data))

        # Registry exists but doesn't contain the preferred sprint
        registry = {
            "sprints": {
                "main": {
                    "file": "current-sprint.yaml",
                    "type": "orchestrator",
                }
            }
        }
        (sprint_dir / "sprints.yaml").write_text(yaml.dump(registry))

        # Preference points to non-existent entry
        config = {"sprint": {"active": "does-not-exist"}}
        (pf_dir / "config.local.yaml").write_text(yaml.dump(config))

        ctx = resolve_sprint_context(str(tmp_path))
        assert ctx.is_default is True

    def test_malformed_sprint_yaml_raises_value_error(self, tmp_path):
        """Malformed YAML in sprint file should raise ValueError."""
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".session").mkdir()

        # Write invalid YAML
        (sprint_dir / "current-sprint.yaml").write_text(
            textwrap.dedent("""\
                sprint:
                  name: "Broken
                  status: [unclosed
                this: is: not: valid: yaml: {{{{
            """)
        )

        with pytest.raises((ValueError, yaml.YAMLError)):
            resolve_sprint_context(str(tmp_path))

    def test_missing_sprint_file_raises_file_not_found(self, tmp_path):
        """Missing sprint file with no registry should raise FileNotFoundError."""
        # Empty project — no sprint/ directory at all
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".session").mkdir()

        with pytest.raises(FileNotFoundError):
            resolve_sprint_context(str(tmp_path))
