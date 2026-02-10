"""Tests for the fan-out CLI package structure.

Story 63-9: Reorganize pennyfarthing_scripts into fan-out CLI pattern.

These tests verify:
1. Library packages exist (jira/, sprint/, story/, common/)
2. CLI modules exist (jira.py, sprint.py, story.py)
3. Library modules are importable from packages
4. CLIs delegate to library modules
5. Backwards compatibility for existing imports
"""

import sys


class TestCommonPackage:
    """Tests for common/ shared utilities package."""

    def test_common_package_exists(self) -> None:
        """common/ package should exist and be importable."""
        from pennyfarthing_scripts import common

        assert common is not None

    def test_output_module_in_common(self) -> None:
        """output.py should be importable from common/."""
        from pennyfarthing_scripts.common import output

        assert hasattr(output, "success")
        assert hasattr(output, "info")
        assert hasattr(output, "warn")
        assert hasattr(output, "error")
        assert hasattr(output, "debug")

    def test_config_module_in_common(self) -> None:
        """config.py should be importable from common/."""
        from pennyfarthing_scripts.common import config

        assert hasattr(config, "get_project_root")
        assert hasattr(config, "load_yaml_config")
        assert hasattr(config, "load_pennyfarthing_config")

    def test_output_backwards_compatibility(self) -> None:
        """Old import path should still work for backwards compatibility."""
        from pennyfarthing_scripts import output

        # Should re-export from common.output
        assert hasattr(output, "success")
        assert hasattr(output, "error")

    def test_config_backwards_compatibility(self) -> None:
        """Old import path should still work for backwards compatibility."""
        from pennyfarthing_scripts import config

        # Should re-export from common.config
        assert hasattr(config, "get_project_root")


class TestJiraPackage:
    """Tests for jira/ library package."""

    def test_jira_package_exists(self) -> None:
        """jira/ package should exist and be importable."""
        from pennyfarthing_scripts import jira

        # Should be a package, not the old flat module
        assert hasattr(jira, "__path__")  # Packages have __path__

    def test_client_module_in_jira(self) -> None:
        """client.py should contain JiraClient and helper functions."""
        from pennyfarthing_scripts.jira import client

        assert hasattr(client, "JiraClient")
        assert hasattr(client, "get_issue")
        assert hasattr(client, "map_status_to_jira")
        assert hasattr(client, "map_jira_to_status")
        assert hasattr(client, "extract_jira_key")

    def test_claim_module_in_jira(self) -> None:
        """claim.py should provide story claiming functionality."""
        from pennyfarthing_scripts.jira import claim

        # Main function for claiming stories
        assert hasattr(claim, "claim_story")
        assert hasattr(claim, "check_availability")

    def test_sync_module_in_jira(self) -> None:
        """sync.py should provide epic sync functionality."""
        from pennyfarthing_scripts.jira import sync

        assert hasattr(sync, "sync_epic")
        assert hasattr(sync, "sync_story")
        assert hasattr(sync, "SyncResult")

    def test_bidirectional_module_in_jira(self) -> None:
        """bidirectional.py should provide bidirectional sync."""
        from pennyfarthing_scripts.jira import bidirectional

        assert hasattr(bidirectional, "generate_sync_plan")
        assert hasattr(bidirectional, "execute_sync_plan")
        assert hasattr(bidirectional, "SyncPlan")
        assert hasattr(bidirectional, "SyncChange")

    def test_epic_module_in_jira(self) -> None:
        """epic.py should provide epic creation functionality."""
        from pennyfarthing_scripts.jira import epic

        assert hasattr(epic, "create_epic")
        assert hasattr(epic, "create_epic_from_yaml")
        assert hasattr(epic, "build_epic_payload")

    def test_story_module_in_jira(self) -> None:
        """story.py should provide story sync functionality."""
        from pennyfarthing_scripts.jira import story

        assert hasattr(story, "sync_story")
        assert hasattr(story, "get_story_from_sprint")

    def test_jira_package_reexports(self) -> None:
        """jira/__init__.py should re-export commonly used items."""
        from pennyfarthing_scripts.jira import (
            JiraClient,
            extract_jira_key,
        )

        assert JiraClient is not None
        assert callable(extract_jira_key)

    def test_jira_backwards_compatibility(self) -> None:
        """Old-style imports should still work."""
        # These imports should work for backwards compatibility
        from pennyfarthing_scripts.jira import STATUS_TO_JIRA, JiraClient, get_issue

        assert JiraClient is not None
        assert callable(get_issue)
        assert isinstance(STATUS_TO_JIRA, dict)


class TestSprintPackage:
    """Tests for sprint/ library package."""

    def test_sprint_package_exists(self) -> None:
        """sprint/ package should exist and be importable."""
        from pennyfarthing_scripts import sprint

        # Should be a package, not the old flat module
        assert hasattr(sprint, "__path__")

    def test_loader_module_in_sprint(self) -> None:
        """loader.py should provide sprint YAML loading."""
        from pennyfarthing_scripts.sprint import loader

        assert hasattr(loader, "load_sprint")
        assert hasattr(loader, "find_epic")
        assert hasattr(loader, "find_story")
        assert hasattr(loader, "get_all_stories")
        assert hasattr(loader, "get_story_by_id")

    def test_status_module_in_sprint(self) -> None:
        """status.py should provide sprint status operations."""
        from pennyfarthing_scripts.sprint import status

        assert hasattr(status, "get_sprint_status")
        assert hasattr(status, "format_status")

    def test_work_module_in_sprint(self) -> None:
        """work.py should provide work session management."""
        from pennyfarthing_scripts.sprint import work

        assert hasattr(work, "start_work")
        assert hasattr(work, "check_story")

    def test_archive_module_in_sprint(self) -> None:
        """archive.py should provide story archiving."""
        from pennyfarthing_scripts.sprint import archive

        assert hasattr(archive, "archive_story")

    def test_sprint_package_reexports(self) -> None:
        """sprint/__init__.py should re-export commonly used items."""
        from pennyfarthing_scripts.sprint import (
            find_epic,
            load_sprint,
        )

        assert callable(load_sprint)
        assert callable(find_epic)

    def test_sprint_backwards_compatibility(self) -> None:
        """Old-style imports should still work."""
        from pennyfarthing_scripts.sprint import find_epic, load_current_sprint, load_sprint

        assert callable(load_sprint)
        assert callable(find_epic)
        assert callable(load_current_sprint)


class TestStoryPackage:
    """Tests for story/ library package."""

    def test_story_package_exists(self) -> None:
        """story/ package should exist and be importable."""
        from pennyfarthing_scripts import story

        # Should be a package
        assert hasattr(story, "__path__")

    def test_size_module_in_story(self) -> None:
        """size.py should provide story sizing utilities."""
        from pennyfarthing_scripts.story import size

        assert hasattr(size, "get_sizing_guidelines")
        assert hasattr(size, "format_size_info")

    def test_template_module_in_story(self) -> None:
        """template.py should provide story templates."""
        from pennyfarthing_scripts.story import template

        assert hasattr(template, "get_template")
        assert hasattr(template, "get_all_templates")

    def test_create_module_in_story(self) -> None:
        """create.py should provide story creation."""
        from pennyfarthing_scripts.story import create

        assert hasattr(create, "create_story")
        assert hasattr(create, "generate_story_yaml")


class TestJiraCLI:
    """Tests for jira.py CLI entry point."""

    def test_jira_cli_has_main(self) -> None:
        """jira.py should have a main() entry point."""
        # Import the CLI module (not the package)
        import pennyfarthing_scripts.jira as jira_pkg

        # The package's __main__.py or main module should have main()
        assert hasattr(jira_pkg, "main") or hasattr(jira_pkg, "cli")

    def test_jira_cli_subcommands(self) -> None:
        """jira CLI should support expected subcommands."""
        from pennyfarthing_scripts.jira import cli

        # CLI should define these subcommands
        assert hasattr(cli, "view") or "view" in dir(cli)
        assert hasattr(cli, "claim") or "claim" in dir(cli)
        assert hasattr(cli, "sync") or "sync" in dir(cli)
        assert hasattr(cli, "create") or "create" in dir(cli)
        assert hasattr(cli, "bidirectional") or "bidirectional" in dir(cli)

    def test_jira_cli_runnable_as_module(self) -> None:
        """python -m pennyfarthing_scripts.jira should work."""
        import subprocess

        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.jira", "--help"],
            capture_output=True,
            text=True,
        )
        # Should exit 0 with help text
        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout


class TestSprintCLI:
    """Tests for sprint.py CLI entry point."""

    def test_sprint_cli_has_main(self) -> None:
        """sprint.py should have a main() entry point."""
        import pennyfarthing_scripts.sprint as sprint_pkg

        assert hasattr(sprint_pkg, "main") or hasattr(sprint_pkg, "cli")

    def test_sprint_cli_subcommands(self) -> None:
        """sprint CLI should support expected subcommands."""
        from pennyfarthing_scripts.sprint import cli

        # CLI should define these subcommands based on skill.md
        assert hasattr(cli, "status") or "status" in dir(cli)
        assert hasattr(cli, "backlog") or "backlog" in dir(cli)
        assert hasattr(cli, "work") or "work" in dir(cli)
        assert hasattr(cli, "archive") or "archive" in dir(cli)

    def test_sprint_cli_runnable_as_module(self) -> None:
        """python -m pennyfarthing_scripts.sprint should work."""
        import subprocess

        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.sprint", "--help"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout


class TestStoryCLI:
    """Tests for story.py CLI entry point."""

    def test_story_cli_has_main(self) -> None:
        """story.py should have a main() entry point."""
        import pennyfarthing_scripts.story as story_pkg

        assert hasattr(story_pkg, "main") or hasattr(story_pkg, "cli")

    def test_story_cli_subcommands(self) -> None:
        """story CLI should support expected subcommands."""
        from pennyfarthing_scripts.story import cli

        # CLI should define these subcommands based on skill.md
        assert hasattr(cli, "size") or "size" in dir(cli)
        assert hasattr(cli, "template") or "template" in dir(cli)
        assert hasattr(cli, "create") or "create" in dir(cli)

    def test_story_cli_runnable_as_module(self) -> None:
        """python -m pennyfarthing_scripts.story should work."""
        import subprocess

        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.story", "--help"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout


class TestOldModuleCompatibility:
    """Tests ensuring old flat modules still work."""

    def test_jira_sync_module_works(self) -> None:
        """jira_sync.py should still be importable and functional."""
        from pennyfarthing_scripts import jira_sync

        assert hasattr(jira_sync, "sync_epic")
        assert hasattr(jira_sync, "sync_story")
        assert hasattr(jira_sync, "main")

    def test_jira_bidirectional_sync_module_works(self) -> None:
        """jira_bidirectional_sync.py should still be importable."""
        from pennyfarthing_scripts import jira_bidirectional_sync

        assert hasattr(jira_bidirectional_sync, "generate_sync_plan")
        assert hasattr(jira_bidirectional_sync, "main")

    def test_jira_epic_creation_module_works(self) -> None:
        """jira_epic_creation.py should still be importable."""
        from pennyfarthing_scripts import jira_epic_creation

        assert hasattr(jira_epic_creation, "create_epic")
        assert hasattr(jira_epic_creation, "main")

    def test_jira_sync_story_module_works(self) -> None:
        """jira_sync_story.py should still be importable."""
        from pennyfarthing_scripts import jira_sync_story

        assert hasattr(jira_sync_story, "sync_story")
        assert hasattr(jira_sync_story, "main")
