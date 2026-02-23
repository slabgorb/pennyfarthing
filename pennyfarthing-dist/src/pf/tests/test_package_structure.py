"""Tests for the fan-out CLI package structure.

Story 63-9: Reorganize pf into fan-out CLI pattern.

These tests verify:
1. Library packages exist (jira/, sprint/, story/, common/)
2. CLI modules exist (jira.py, sprint.py, story.py)
3. Library modules are importable from packages
4. CLIs delegate to library modules
5. Backwards compatibility for existing imports
"""

import os
import subprocess
import sys
from pathlib import Path

# src/ must be on PYTHONPATH for subprocess -m calls (src-layout)
# src/pf/tests -> src/pf -> src
_SRC_DIR = str(Path(__file__).resolve().parents[2])
_ENV = {**os.environ, "PYTHONPATH": _SRC_DIR + os.pathsep + os.environ.get("PYTHONPATH", "")}


def _run_module(*args: str) -> subprocess.CompletedProcess[str]:
    """Run a pf module as subprocess with correct PYTHONPATH."""
    return subprocess.run(
        [sys.executable, "-m", *args],
        capture_output=True,
        text=True,
        timeout=30,
        env=_ENV,
    )


class TestCommonPackage:
    """Tests for common/ shared utilities package."""

    def test_common_package_exists(self) -> None:
        """common/ package should exist and be importable."""
        from pf import common

        assert common is not None

    def test_output_module_in_common(self) -> None:
        """output.py should be importable from common/."""
        from pf.common import output

        assert hasattr(output, "success")
        assert hasattr(output, "info")
        assert hasattr(output, "warn")
        assert hasattr(output, "error")
        assert hasattr(output, "debug")

    def test_config_module_in_common(self) -> None:
        """config.py should be importable from common/."""
        from pf.common import config

        assert hasattr(config, "get_project_root")
        assert hasattr(config, "load_yaml_config")
        assert hasattr(config, "load_pennyfarthing_config")



class TestJiraPackage:
    """Tests for jira/ library package."""

    def test_jira_package_exists(self) -> None:
        """jira/ package should exist and be importable."""
        from pf import jira

        # Should be a package, not the old flat module
        assert hasattr(jira, "__path__")  # Packages have __path__

    def test_client_module_in_jira(self) -> None:
        """client.py should contain JiraClient and helper functions."""
        from pf.jira import client

        assert hasattr(client, "JiraClient")
        assert hasattr(client, "get_client")
        assert hasattr(client, "map_status_to_jira")
        assert hasattr(client, "map_jira_to_status")
        assert hasattr(client, "extract_jira_key")

    def test_claim_module_in_jira(self) -> None:
        """claim.py should provide story claiming functionality."""
        from pf.jira import claim

        # Main function for claiming stories
        assert hasattr(claim, "claim_story")
        assert hasattr(claim, "check_availability")

    def test_sync_module_in_jira(self) -> None:
        """sync.py should provide epic sync functionality."""
        from pf.jira import sync

        assert hasattr(sync, "sync_epic")
        assert hasattr(sync, "sync_story")
        assert hasattr(sync, "SyncResult")

    def test_bidirectional_module_in_jira(self) -> None:
        """bidirectional.py should provide bidirectional sync."""
        from pf.jira import bidirectional

        assert hasattr(bidirectional, "generate_sync_plan")
        assert hasattr(bidirectional, "execute_sync_plan")
        assert hasattr(bidirectional, "SyncPlan")
        assert hasattr(bidirectional, "SyncChange")

    def test_epic_module_in_jira(self) -> None:
        """epic.py should provide epic creation functionality."""
        from pf.jira import epic

        assert hasattr(epic, "create_epic")
        assert hasattr(epic, "create_epic_from_yaml")
        assert hasattr(epic, "build_epic_payload")

    def test_story_module_in_jira(self) -> None:
        """story.py should provide story sync functionality."""
        from pf.jira import story

        assert hasattr(story, "sync_story")
        assert hasattr(story, "get_story_from_sprint")

    def test_jira_package_reexports(self) -> None:
        """jira/__init__.py should re-export commonly used items."""
        from pf.jira import (
            JiraClient,
            extract_jira_key,
        )

        assert JiraClient is not None
        assert callable(extract_jira_key)

    def test_jira_backwards_compatibility(self) -> None:
        """Old-style imports should still work."""
        from pf.jira import STATUS_TO_JIRA, JiraClient, get_client

        assert JiraClient is not None
        assert callable(get_client)
        assert isinstance(STATUS_TO_JIRA, dict)


class TestSprintPackage:
    """Tests for sprint/ library package."""

    def test_sprint_package_exists(self) -> None:
        """sprint/ package should exist and be importable."""
        from pf import sprint

        # Should be a package, not the old flat module
        assert hasattr(sprint, "__path__")

    def test_loader_module_in_sprint(self) -> None:
        """loader.py should provide sprint YAML loading."""
        from pf.sprint import loader

        assert hasattr(loader, "load_sprint")
        assert hasattr(loader, "find_epic")
        assert hasattr(loader, "find_story")
        assert hasattr(loader, "get_all_stories")
        assert hasattr(loader, "get_story_by_id")

    def test_status_module_in_sprint(self) -> None:
        """status.py should provide sprint status operations."""
        from pf.sprint import status

        assert hasattr(status, "get_sprint_status")
        assert hasattr(status, "format_status")

    def test_work_module_in_sprint(self) -> None:
        """work.py should provide work session management."""
        from pf.sprint import work

        assert hasattr(work, "start_work")
        assert hasattr(work, "check_story")

    def test_archive_module_in_sprint(self) -> None:
        """archive.py should provide story archiving."""
        from pf.sprint import archive

        assert hasattr(archive, "archive_story")

    def test_sprint_package_reexports(self) -> None:
        """sprint/__init__.py should re-export commonly used items."""
        from pf.sprint import (
            find_epic,
            load_sprint,
        )

        assert callable(load_sprint)
        assert callable(find_epic)

    def test_sprint_backwards_compatibility(self) -> None:
        """Old-style imports should still work."""
        from pf.sprint import find_epic, load_current_sprint, load_sprint

        assert callable(load_sprint)
        assert callable(find_epic)
        assert callable(load_current_sprint)


class TestStoryPackage:
    """Tests for story/ library package."""

    def test_story_package_exists(self) -> None:
        """story/ package should exist and be importable."""
        from pf import story

        # Should be a package
        assert hasattr(story, "__path__")

    def test_size_module_in_story(self) -> None:
        """size.py should provide story sizing utilities."""
        from pf.story import size

        assert hasattr(size, "get_sizing_guidelines")
        assert hasattr(size, "format_size_info")

    def test_template_module_in_story(self) -> None:
        """template.py should provide story templates."""
        from pf.story import template

        assert hasattr(template, "get_template")
        assert hasattr(template, "get_all_templates")

    def test_create_module_in_story(self) -> None:
        """create.py should provide story creation."""
        from pf.story import create

        assert hasattr(create, "create_story")
        assert hasattr(create, "generate_story_yaml")


class TestJiraCLI:
    """Tests for jira.py CLI entry point."""

    def test_jira_cli_has_main(self) -> None:
        """jira.py should have a main() entry point."""
        # Import the CLI module (not the package)
        import pf.jira as jira_pkg

        # The package's __main__.py or main module should have main()
        assert hasattr(jira_pkg, "main") or hasattr(jira_pkg, "cli")

    def test_jira_cli_subcommands(self) -> None:
        """jira CLI should support expected subcommands."""
        from pf.jira import cli

        # CLI should define these subcommands
        assert hasattr(cli, "view") or "view" in dir(cli)
        assert hasattr(cli, "claim") or "claim" in dir(cli)
        assert hasattr(cli, "sync") or "sync" in dir(cli)
        assert hasattr(cli, "create") or "create" in dir(cli)
        assert hasattr(cli, "bidirectional") or "bidirectional" in dir(cli)

    def test_jira_cli_runnable_as_module(self) -> None:
        """python -m pf.jira should work."""
        result = _run_module("pf.jira", "--help")
        # Should exit 0 with help text
        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout


class TestSprintCLI:
    """Tests for sprint.py CLI entry point."""

    def test_sprint_cli_has_main(self) -> None:
        """sprint.py should have a main() entry point."""
        import pf.sprint as sprint_pkg

        assert hasattr(sprint_pkg, "main") or hasattr(sprint_pkg, "cli")

    def test_sprint_cli_subcommands(self) -> None:
        """sprint CLI should support expected subcommands."""
        from pf.sprint import cli

        # CLI should define these subcommands based on skill.md
        assert hasattr(cli, "status") or "status" in dir(cli)
        assert hasattr(cli, "backlog") or "backlog" in dir(cli)
        assert hasattr(cli, "work") or "work" in dir(cli)
        assert hasattr(cli, "archive") or "archive" in dir(cli)

    def test_sprint_cli_runnable_as_module(self) -> None:
        """python -m pf.sprint should work."""
        result = _run_module("pf.sprint", "--help")
        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout


class TestStoryCLI:
    """Tests for story.py CLI entry point."""

    def test_story_cli_has_main(self) -> None:
        """story.py should have a main() entry point."""
        import pf.story as story_pkg

        assert hasattr(story_pkg, "main") or hasattr(story_pkg, "cli")

    def test_story_cli_subcommands(self) -> None:
        """story CLI should support expected subcommands."""
        from pf.story import cli

        # CLI should define these subcommands based on skill.md
        assert hasattr(cli, "size") or "size" in dir(cli)
        assert hasattr(cli, "template") or "template" in dir(cli)
        assert hasattr(cli, "create") or "create" in dir(cli)

    def test_story_cli_runnable_as_module(self) -> None:
        """python -m pf.story should work."""
        result = _run_module("pf.story", "--help")
        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout


