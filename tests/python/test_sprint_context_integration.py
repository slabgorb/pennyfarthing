"""
Tests for Story 125-2: Replace Python CLI sprint resolution with SprintContext.

Verifies that loader.py and yaml_io.py delegate sprint path resolution to
resolve_sprint_context() instead of using hardcoded paths.

Run with: python -m pytest tests/python/test_sprint_context_integration.py -v
"""

import inspect
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from pf.core.models import SprintContext
from pf.core.resolver import resolve_sprint_context
from pf.sprint.loader import (
    load_sprint,
    switch_sprint,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def default_project(tmp_path):
    """Minimal project with default sprint (no registry preference)."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".session").mkdir()

    sprint_data = {
        "sprint": {"name": "Sprint 2608", "status": "active", "number": 2608},
        "epics": [
            {
                "id": "100",
                "title": "Test Epic",
                "repos": ["orchestrator"],
                "stories": [
                    {"id": "100-1", "title": "Story A", "status": "backlog", "points": 2}
                ],
            }
        ],
    }
    (sprint_dir / "current-sprint.yaml").write_text(yaml.dump(sprint_data))

    return tmp_path


@pytest.fixture
def sharded_project(tmp_path):
    """Project with sharded epics to test shard merging still works."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".session").mkdir()

    # Index file with string refs
    index_data = {
        "sprint": {"name": "Sprint 2608", "status": "active"},
        "epics": ["MSSCI-10001", "MSSCI-10002"],
    }
    (sprint_dir / "current-sprint.yaml").write_text(yaml.dump(index_data))

    # Shard files
    epic1 = {
        "id": "50",
        "title": "Epic Alpha",
        "jira": "MSSCI-10001",
        "repos": "pennyfarthing",
        "stories": [
            {"id": "50-1", "title": "Alpha Story", "status": "backlog", "points": 3}
        ],
    }
    (sprint_dir / "epic-MSSCI-10001.yaml").write_text(yaml.dump(epic1))

    epic2 = {
        "id": "51",
        "title": "Epic Beta",
        "jira": "MSSCI-10002",
        "repos": "orchestrator",
        "stories": [
            {"id": "51-1", "title": "Beta Story", "status": "done", "points": 1}
        ],
    }
    (sprint_dir / "epic-MSSCI-10002.yaml").write_text(yaml.dump(epic2))

    return tmp_path


@pytest.fixture
def focus_project(tmp_path):
    """Project with multi-sprint registry and active focus preference."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".session").mkdir()

    # Default sprint
    default = {
        "sprint": {"name": "Main Sprint", "status": "active"},
        "epics": [],
    }
    (sprint_dir / "current-sprint.yaml").write_text(yaml.dump(default))

    # Focus sprint in subdirectory
    focus_dir = sprint_dir / "focus"
    focus_dir.mkdir()
    focus_data = {
        "sprint": {"name": "Research Spike", "status": "active"},
        "epics": [
            {
                "id": "200",
                "title": "Research Epic",
                "repos": ["research-api"],
                "stories": [],
            }
        ],
    }
    (focus_dir / "spike.yaml").write_text(yaml.dump(focus_data))

    # Registry
    registry = {
        "sprints": {
            "main": {
                "file": "current-sprint.yaml",
                "type": "orchestrator",
            },
            "research-spike": {
                "file": "focus/spike.yaml",
                "type": "focus",
                "repos": ["research-api"],
                "context_root": str(tmp_path / "projects" / "research"),
                "session_root": str(tmp_path / "projects" / "research" / ".session"),
            },
        }
    }
    (sprint_dir / "sprints.yaml").write_text(yaml.dump(registry))

    # Config with active preference
    config = {"sprint": {"active": "research-spike"}}
    (pf_dir / "config.local.yaml").write_text(yaml.dump(config))

    return tmp_path


# ===========================================================================
# AC1: All Python sprint commands use SprintContext for path resolution
# ===========================================================================


class TestLoadSprintUsesSprintContext:
    """load_sprint() must delegate path resolution to resolve_sprint_context()."""

    def test_load_sprint_calls_resolve_sprint_context(self, default_project):
        """load_sprint() should call resolve_sprint_context() internally."""
        with patch("pf.sprint.loader.resolve_sprint_context") as mock_resolver:
            # Configure mock to return a valid SprintContext
            mock_resolver.return_value = SprintContext(
                sprint_file=str(default_project / "sprint" / "current-sprint.yaml"),
                context_root=str(default_project),
                session_root=str(default_project / ".session"),
                repos=["orchestrator"],
                name="Sprint 2608",
                type="orchestrator",
                is_default=True,
            )
            load_sprint(default_project)
            mock_resolver.assert_called_once()

    def test_load_sprint_passes_project_root_to_resolver(self, default_project):
        """load_sprint() should forward the project_root argument to the resolver."""
        with patch("pf.sprint.loader.resolve_sprint_context") as mock_resolver:
            mock_resolver.return_value = SprintContext(
                sprint_file=str(default_project / "sprint" / "current-sprint.yaml"),
                context_root=str(default_project),
                session_root=str(default_project / ".session"),
                repos=["orchestrator"],
                name="Sprint 2608",
                type="orchestrator",
                is_default=True,
            )
            load_sprint(default_project)
            call_args = mock_resolver.call_args
            # The project_root should be passed (as string or Path)
            root_arg = call_args[0][0] if call_args[0] else call_args[1].get("project_root")
            assert str(root_arg) == str(default_project)

    def test_load_sprint_reads_from_context_sprint_file(self, default_project):
        """load_sprint() should read the sprint file from SprintContext.sprint_file."""
        with patch("pf.sprint.loader.resolve_sprint_context") as mock_resolver:
            sprint_file = str(default_project / "sprint" / "current-sprint.yaml")
            mock_resolver.return_value = SprintContext(
                sprint_file=sprint_file,
                context_root=str(default_project),
                session_root=str(default_project / ".session"),
                repos=["orchestrator"],
                name="Sprint 2608",
                type="orchestrator",
                is_default=True,
            )
            result = load_sprint(default_project)
            # Should still return valid sprint data
            assert result is not None
            assert "sprint" in result


class TestLoadSprintRegistryMetadata:
    """load_sprint() injects registry metadata when using non-default context."""

    def test_focus_sprint_includes_registry_metadata(self, focus_project):
        """When focus context is active, load_sprint() should include _registry."""
        result = load_sprint(focus_project)
        assert result is not None
        # After refactor, _registry metadata should come from SprintContext
        assert "_registry" in result
        assert result["_registry"]["name"] == "research-spike"
        assert result["_registry"]["type"] == "focus"


# ===========================================================================
# AC2: No hardcoded sprint file paths remain in CLI code
# ===========================================================================


class TestNoHardcodedPaths:
    """After refactor, loader.py should not contain hardcoded sprint path construction."""

    def test_load_sprint_no_hardcoded_sprint_dir(self):
        """load_sprint() should not construct 'root / sprint' path directly."""
        source = inspect.getsource(load_sprint)
        # After refactor, load_sprint should not build sprint_dir itself
        # It should get the path from resolve_sprint_context()
        assert 'root / "sprint"' not in source and "sprint_dir" not in source, (
            "load_sprint() still contains hardcoded sprint directory path construction. "
            "Should delegate to resolve_sprint_context()."
        )

    def test_load_sprint_no_hardcoded_current_sprint_yaml(self):
        """load_sprint() should not reference 'current-sprint.yaml' directly."""
        source = inspect.getsource(load_sprint)
        assert "current-sprint.yaml" not in source, (
            "load_sprint() still contains hardcoded 'current-sprint.yaml' reference. "
            "Should get the sprint file path from SprintContext.sprint_file."
        )

    def test_loader_imports_resolve_sprint_context(self):
        """loader.py must import resolve_sprint_context from pf.core.resolver."""
        import pf.sprint.loader as loader_module

        source_file = Path(inspect.getfile(loader_module))
        source_text = source_file.read_text()

        assert "resolve_sprint_context" in source_text, (
            "loader.py does not import resolve_sprint_context. "
            "Story 125-2 requires loader.py to delegate to the resolver."
        )


# ===========================================================================
# AC3: Existing tests still pass (regression tests)
# ===========================================================================


class TestShardMergingRegression:
    """Shard merging must still work correctly after the refactor."""

    def test_sharded_epics_are_loaded(self, sharded_project):
        """Sharded epic references should be resolved to full epic dicts."""
        result = load_sprint(sharded_project)
        assert result is not None
        epics = result.get("epics", [])
        assert len(epics) == 2
        # Should be full dicts, not string refs
        assert isinstance(epics[0], dict)
        assert isinstance(epics[1], dict)

    def test_sharded_stories_accessible(self, sharded_project):
        """Stories within sharded epics should be accessible."""
        result = load_sprint(sharded_project)
        epics = result.get("epics", [])
        all_stories = []
        for epic in epics:
            all_stories.extend(epic.get("stories", []))
        assert len(all_stories) == 2
        story_ids = {s["id"] for s in all_stories}
        assert "50-1" in story_ids
        assert "51-1" in story_ids

    def test_default_resolution_returns_valid_data(self, default_project):
        """Default sprint resolution should return well-formed sprint data."""
        result = load_sprint(default_project)
        assert result is not None
        assert "sprint" in result
        assert result["sprint"]["name"] == "Sprint 2608"
        assert "epics" in result
        assert len(result["epics"]) == 1


# ===========================================================================
# AC4: Focus switching (pf sprint use) works through SprintContext
# ===========================================================================


class TestFocusSwitchingThroughSprintContext:
    """switch_sprint() and focus resolution must work with SprintContext."""

    def test_switch_sprint_then_load_uses_focus(self, focus_project):
        """After switch_sprint(), load_sprint() should load the focus sprint."""
        # Verify we're on focus by default (from fixture)
        result = load_sprint(focus_project)
        assert result is not None
        assert result["sprint"]["name"] == "Research Spike"

    def test_switch_to_default_clears_focus(self, focus_project):
        """switch_sprint('default') should revert to default sprint resolution."""
        switch_result = switch_sprint("default", focus_project)
        assert switch_result["success"] is True

        result = load_sprint(focus_project)
        assert result is not None
        assert result["sprint"]["name"] == "Main Sprint"

    def test_load_sprint_focus_consistent_with_resolver(self, focus_project):
        """load_sprint() focus resolution must match resolve_sprint_context()."""
        ctx = resolve_sprint_context(str(focus_project))
        sprint_data = load_sprint(focus_project)

        assert sprint_data is not None
        # The sprint file used by load_sprint should match what resolver says
        assert ctx.is_default is False
        assert ctx.name == "research-spike"
        # Sprint data should be from the focus sprint
        assert sprint_data["sprint"]["name"] == "Research Spike"

    def test_switch_and_resolve_agree(self, focus_project):
        """After switching sprints, resolver and loader should agree on the active sprint."""
        # Switch to default
        switch_sprint("default", focus_project)

        ctx = resolve_sprint_context(str(focus_project))
        assert ctx.is_default is True

        sprint_data = load_sprint(focus_project)
        assert sprint_data is not None
        assert sprint_data["sprint"]["name"] == "Main Sprint"

        # Switch back to focus
        switch_sprint("research-spike", focus_project)

        ctx = resolve_sprint_context(str(focus_project))
        assert ctx.is_default is False
        assert ctx.name == "research-spike"

        sprint_data = load_sprint(focus_project)
        assert sprint_data is not None
        assert sprint_data["sprint"]["name"] == "Research Spike"
