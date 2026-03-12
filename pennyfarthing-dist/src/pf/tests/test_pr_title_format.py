"""Tests for PR title format from repos.yaml."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.git.repos import format_pr_title, get_pr_title_format


@pytest.fixture
def project(tmp_path: Path) -> Path:
    (tmp_path / ".pennyfarthing").mkdir()
    return tmp_path


def _write_repos_yaml(project: Path, extra: dict | None = None) -> None:
    data = {"repos": {"main": {"path": ".", "type": "app", "default_branch": "main"}}}
    if extra:
        data.update(extra)
    (project / ".pennyfarthing" / "repos.yaml").write_text(yaml.dump(data))


class TestGetPrTitleFormat:
    def test_default_when_no_file(self, project: Path) -> None:
        fmt = get_pr_title_format(project)
        assert "{jira_key}" in fmt
        assert "{title}" in fmt

    def test_default_when_no_setting(self, project: Path) -> None:
        _write_repos_yaml(project)
        fmt = get_pr_title_format(project)
        assert "{jira_key}" in fmt

    def test_custom_format(self, project: Path) -> None:
        _write_repos_yaml(project, {"pr_title_format": "{jira_key}: {title}"})
        fmt = get_pr_title_format(project)
        assert fmt == "{jira_key}: {title}"


class TestFormatPrTitle:
    def test_default_format_with_scope(self, project: Path) -> None:
        _write_repos_yaml(project)
        result = format_pr_title(
            jira_key="MSSCI-16204",
            title="add gate extensions",
            scope="gates",
            project_root=project,
        )
        assert result == "MSSCI-16204 - feat(gates): add gate extensions"

    def test_default_format_no_scope(self, project: Path) -> None:
        _write_repos_yaml(project)
        result = format_pr_title(
            jira_key="MSSCI-100",
            title="fix bug",
            project_root=project,
        )
        assert result == "MSSCI-100 - feat: fix bug"

    def test_custom_type(self, project: Path) -> None:
        _write_repos_yaml(project)
        result = format_pr_title(
            jira_key="MSSCI-100",
            title="fix bug",
            pr_type="fix",
            project_root=project,
        )
        assert result == "MSSCI-100 - fix: fix bug"

    def test_custom_format(self, project: Path) -> None:
        _write_repos_yaml(project, {"pr_title_format": "[{jira_key}] {title}"})
        result = format_pr_title(
            jira_key="PROJ-1",
            title="hello",
            project_root=project,
        )
        assert result == "[PROJ-1] hello"

    def test_fallback_story_id(self, project: Path) -> None:
        """jira_key can be a story ID when no Jira key is available."""
        _write_repos_yaml(project)
        result = format_pr_title(
            jira_key="31-10",
            title="do stuff",
            scope="ui",
            project_root=project,
        )
        assert result == "31-10 - feat(ui): do stuff"
