"""Tests for story 141-25: Project-Level Workflow Definitions.

Validates that workflow lookup supports a project-level directory at
.pennyfarthing/project/workflows/ that overrides or extends the
distributed workflows at .pennyfarthing/workflows/.

AC 0: get_project_workflows_dir() returns correct path
AC 1: pf workflow list shows project-level workflows alongside distributed ones
AC 2: Project workflows override distributed workflows with the same name
AC 3: pf workflow show works for project-level workflow definitions
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from pf.workflow.helpers import (
    find_workflow_file,
    get_workflows_dir,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINIMAL_WORKFLOW_YAML = textwrap.dedent("""\
    workflow:
      name: {name}
      type: phased
      description: "{desc}"
      version: "1.0"
      phases:
        - name: setup
          agent: sm
        - name: implement
          agent: dev
""")


@pytest.fixture()
def project_tree(tmp_path: Path) -> Path:
    """Create a mock project with .pennyfarthing structure.

    Layout:
        tmp_path/
            .pennyfarthing/
                workflows/          <- dist workflows
                    tdd.yaml
                    trivial.yaml
                project/
                    workflows/      <- project workflows (empty initially)
    """
    dist_dir = tmp_path / ".pennyfarthing" / "workflows"
    dist_dir.mkdir(parents=True)

    proj_dir = tmp_path / ".pennyfarthing" / "project" / "workflows"
    proj_dir.mkdir(parents=True)

    # Write dist workflows
    (dist_dir / "tdd.yaml").write_text(
        MINIMAL_WORKFLOW_YAML.format(name="tdd", desc="Dist TDD workflow")
    )
    (dist_dir / "trivial.yaml").write_text(
        MINIMAL_WORKFLOW_YAML.format(name="trivial", desc="Dist trivial workflow")
    )

    return tmp_path


@pytest.fixture()
def project_tree_no_project_dir(tmp_path: Path) -> Path:
    """Project with NO .pennyfarthing/project/workflows/ dir."""
    dist_dir = tmp_path / ".pennyfarthing" / "workflows"
    dist_dir.mkdir(parents=True)

    (dist_dir / "tdd.yaml").write_text(
        MINIMAL_WORKFLOW_YAML.format(name="tdd", desc="Dist TDD workflow")
    )

    return tmp_path


# ---------------------------------------------------------------------------
# AC 0: get_project_workflows_dir() and get_all_workflows_dirs()
# ---------------------------------------------------------------------------


class TestGetProjectWorkflowsDir:
    """AC 0: New helper returns correct project workflows path."""

    def test_returns_project_workflows_path(self, project_tree: Path) -> None:
        """get_project_workflows_dir() returns .pennyfarthing/project/workflows/."""
        from pf.workflow.helpers import get_project_workflows_dir

        result = get_project_workflows_dir(project_root=project_tree)
        expected = project_tree / ".pennyfarthing" / "project" / "workflows"
        assert result == expected

    def test_path_exists_when_dir_created(self, project_tree: Path) -> None:
        """Returned path should exist when the directory is present."""
        from pf.workflow.helpers import get_project_workflows_dir

        result = get_project_workflows_dir(project_root=project_tree)
        assert result.is_dir()

    def test_path_returned_even_when_missing(self, project_tree_no_project_dir: Path) -> None:
        """Returns path even when dir doesn't exist (caller checks is_dir)."""
        from pf.workflow.helpers import get_project_workflows_dir

        result = get_project_workflows_dir(project_root=project_tree_no_project_dir)
        expected = project_tree_no_project_dir / ".pennyfarthing" / "project" / "workflows"
        assert result == expected
        assert not result.is_dir()


class TestGetAllWorkflowsDirs:
    """AC 0: get_all_workflows_dirs() returns dirs in priority order."""

    def test_returns_project_first_dist_second(self, project_tree: Path) -> None:
        """Project dir should come before dist dir in the list."""
        from pf.workflow.helpers import get_all_workflows_dirs

        dirs = get_all_workflows_dirs(project_root=project_tree)
        assert len(dirs) == 2
        assert dirs[0] == project_tree / ".pennyfarthing" / "project" / "workflows"
        assert dirs[1] == project_tree / ".pennyfarthing" / "workflows"

    def test_omits_project_dir_when_missing(self, project_tree_no_project_dir: Path) -> None:
        """Only dist dir returned when project dir doesn't exist."""
        from pf.workflow.helpers import get_all_workflows_dirs

        dirs = get_all_workflows_dirs(project_root=project_tree_no_project_dir)
        assert len(dirs) == 1
        assert dirs[0] == project_tree_no_project_dir / ".pennyfarthing" / "workflows"

    def test_empty_when_no_dirs_exist(self, tmp_path: Path) -> None:
        """Returns empty list when neither dir exists."""
        from pf.workflow.helpers import get_all_workflows_dirs

        dirs = get_all_workflows_dirs(project_root=tmp_path)
        assert dirs == []


# ---------------------------------------------------------------------------
# AC 2: find_workflow_file() with multi-dir support (override semantics)
# ---------------------------------------------------------------------------


class TestFindWorkflowFileMultiDir:
    """AC 2: find_workflow_file() searches multiple dirs, project wins."""

    def test_finds_in_dist_only(self, project_tree: Path) -> None:
        """Finds workflow in dist when not in project dir."""
        dirs = [
            project_tree / ".pennyfarthing" / "project" / "workflows",
            project_tree / ".pennyfarthing" / "workflows",
        ]
        result = find_workflow_file(dirs, "tdd")
        assert result is not None
        assert "workflows/tdd.yaml" in str(result)

    def test_project_overrides_dist(self, project_tree: Path) -> None:
        """Project workflow wins over dist workflow with same name."""
        proj_dir = project_tree / ".pennyfarthing" / "project" / "workflows"
        proj_dir.mkdir(parents=True, exist_ok=True)
        (proj_dir / "tdd.yaml").write_text(
            MINIMAL_WORKFLOW_YAML.format(name="tdd", desc="Project TDD override")
        )

        dirs = [
            proj_dir,
            project_tree / ".pennyfarthing" / "workflows",
        ]
        result = find_workflow_file(dirs, "tdd")
        assert result is not None
        assert "project/workflows/tdd.yaml" in str(result)

    def test_project_only_workflow_found(self, project_tree: Path) -> None:
        """Workflow that exists only in project dir is found."""
        proj_dir = project_tree / ".pennyfarthing" / "project" / "workflows"
        (proj_dir / "custom.yaml").write_text(
            MINIMAL_WORKFLOW_YAML.format(name="custom", desc="Project-only workflow")
        )

        dirs = [
            proj_dir,
            project_tree / ".pennyfarthing" / "workflows",
        ]
        result = find_workflow_file(dirs, "custom")
        assert result is not None
        assert "project/workflows/custom.yaml" in str(result)

    def test_not_found_returns_none(self, project_tree: Path) -> None:
        """Returns None when workflow not in any dir."""
        dirs = [
            project_tree / ".pennyfarthing" / "project" / "workflows",
            project_tree / ".pennyfarthing" / "workflows",
        ]
        result = find_workflow_file(dirs, "nonexistent")
        assert result is None

    def test_backward_compat_single_path(self, project_tree: Path) -> None:
        """Still works when passed a single Path (backward compat)."""
        dist_dir = project_tree / ".pennyfarthing" / "workflows"
        result = find_workflow_file(dist_dir, "tdd")
        assert result is not None

    def test_nested_layout_project_override(self, project_tree: Path) -> None:
        """Project dir with nested layout (name/workflow.yaml) wins."""
        proj_dir = project_tree / ".pennyfarthing" / "project" / "workflows"
        nested = proj_dir / "tdd"
        nested.mkdir(parents=True)
        (nested / "workflow.yaml").write_text(
            MINIMAL_WORKFLOW_YAML.format(name="tdd", desc="Nested project TDD")
        )

        dirs = [
            proj_dir,
            project_tree / ".pennyfarthing" / "workflows",
        ]
        result = find_workflow_file(dirs, "tdd")
        assert result is not None
        assert "project/workflows/tdd/workflow.yaml" in str(result)


# ---------------------------------------------------------------------------
# AC 1: workflow list shows project workflows alongside dist
# ---------------------------------------------------------------------------


class TestWorkflowListProjectWorkflows:
    """AC 1: pf workflow list includes project-level workflows."""

    def test_list_includes_project_only_workflow(self, project_tree: Path) -> None:
        """A workflow only in project dir appears in the collected list."""
        from pf.workflow.helpers import get_all_workflows_dirs, get_project_workflows_dir

        proj_dir = project_tree / ".pennyfarthing" / "project" / "workflows"
        (proj_dir / "custom.yaml").write_text(
            MINIMAL_WORKFLOW_YAML.format(name="custom", desc="Project custom")
        )

        project_wf_dir = get_project_workflows_dir(project_root=project_tree)
        dirs = get_all_workflows_dirs(project_root=project_tree)
        # Collect all workflow names from all dirs
        names: dict[str, str] = {}  # name -> source
        for d in dirs:
            source = "project" if d == project_wf_dir else "dist"
            for f in sorted(d.glob("*.yaml")):
                wf_name = f.stem
                if wf_name not in names:  # first dir wins (project first)
                    names[wf_name] = source

        assert "custom" in names
        assert names["custom"] == "project"
        assert "tdd" in names
        assert names["tdd"] == "dist"

    def test_list_deduplicates_project_wins(self, project_tree: Path) -> None:
        """When both dirs have same workflow, project version shown."""
        from pf.workflow.helpers import get_all_workflows_dirs, get_project_workflows_dir

        proj_dir = project_tree / ".pennyfarthing" / "project" / "workflows"
        (proj_dir / "tdd.yaml").write_text(
            MINIMAL_WORKFLOW_YAML.format(name="tdd", desc="Project TDD override")
        )

        project_wf_dir = get_project_workflows_dir(project_root=project_tree)
        dirs = get_all_workflows_dirs(project_root=project_tree)
        names: dict[str, str] = {}
        for d in dirs:
            source = "project" if d == project_wf_dir else "dist"
            for f in sorted(d.glob("*.yaml")):
                wf_name = f.stem
                if wf_name not in names:
                    names[wf_name] = source

        assert names["tdd"] == "project"
        # Only one entry for tdd, not two
        assert list(names.keys()).count("tdd") == 1

    def test_list_shows_all_dist_when_no_project_dir(
        self, project_tree_no_project_dir: Path
    ) -> None:
        """Without project dir, list shows only dist workflows."""
        from pf.workflow.helpers import get_all_workflows_dirs, get_project_workflows_dir

        project_wf_dir = get_project_workflows_dir(project_root=project_tree_no_project_dir)
        dirs = get_all_workflows_dirs(project_root=project_tree_no_project_dir)
        names: dict[str, str] = {}
        for d in dirs:
            source = "project" if d == project_wf_dir else "dist"
            for f in sorted(d.glob("*.yaml")):
                wf_name = f.stem
                if wf_name not in names:
                    names[wf_name] = source

        assert "tdd" in names
        assert names["tdd"] == "dist"


# ---------------------------------------------------------------------------
# AC 3: pf workflow show works for project-level definitions
# ---------------------------------------------------------------------------


class TestWorkflowShowProjectWorkflow:
    """AC 3: show command finds project-level workflow definitions."""

    def test_show_finds_project_only_workflow(self, project_tree: Path) -> None:
        """A project-only workflow can be loaded and its data read."""
        from pf.workflow.helpers import load_workflow_data

        proj_dir = project_tree / ".pennyfarthing" / "project" / "workflows"
        (proj_dir / "custom.yaml").write_text(
            MINIMAL_WORKFLOW_YAML.format(name="custom", desc="Project custom workflow")
        )

        dirs = [
            proj_dir,
            project_tree / ".pennyfarthing" / "workflows",
        ]
        wf_file = find_workflow_file(dirs, "custom")
        assert wf_file is not None

        data = load_workflow_data(wf_file)
        assert data["workflow"]["name"] == "custom"
        assert data["workflow"]["description"] == "Project custom workflow"

    def test_show_loads_project_override(self, project_tree: Path) -> None:
        """When project overrides dist, show loads the project version."""
        from pf.workflow.helpers import load_workflow_data

        proj_dir = project_tree / ".pennyfarthing" / "project" / "workflows"
        (proj_dir / "tdd.yaml").write_text(
            MINIMAL_WORKFLOW_YAML.format(name="tdd", desc="Customized TDD for this project")
        )

        dirs = [
            proj_dir,
            project_tree / ".pennyfarthing" / "workflows",
        ]
        wf_file = find_workflow_file(dirs, "tdd")
        assert wf_file is not None

        data = load_workflow_data(wf_file)
        assert data["workflow"]["description"] == "Customized TDD for this project"

    def test_show_still_works_for_dist_workflow(self, project_tree: Path) -> None:
        """Dist-only workflows still load correctly with multi-dir lookup."""
        from pf.workflow.helpers import load_workflow_data

        dirs = [
            project_tree / ".pennyfarthing" / "project" / "workflows",
            project_tree / ".pennyfarthing" / "workflows",
        ]
        wf_file = find_workflow_file(dirs, "trivial")
        assert wf_file is not None

        data = load_workflow_data(wf_file)
        assert data["workflow"]["name"] == "trivial"
