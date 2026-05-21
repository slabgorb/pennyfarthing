"""Tests for archive filename resolution.

Story 151-1: Resolve archive filename from sprint.number when name is absent;
fail loud when neither name nor number is set (no silent writes to
`sprint-unknown-completed.yaml`).
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.archive_epic import get_archive_path
from pf.sprint.yaml_io import _write_yaml_file


def _write_sprint(tmp_path: Path, sprint_info: dict[str, Any]) -> Path:
    """Build a minimal sprint tree at tmp_path with the given sprint metadata."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()
    index = {"sprint": sprint_info, "epics": [], "stories": []}
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    return tmp_path


def test_uses_name_token_when_name_present(tmp_path: Path) -> None:
    """When `name` is present, last whitespace-separated token is the sprint id."""
    root = _write_sprint(
        tmp_path,
        {"name": "TO Sprint 2610", "number": 2610, "status": "active"},
    )

    path = get_archive_path(project_root=root)

    assert path == root / "sprint" / "archive" / "sprint-2610-completed.yaml"


def test_falls_back_to_number_when_name_absent(tmp_path: Path) -> None:
    """When `name` and `jira_sprint_name` are absent, fall back to `number`."""
    root = _write_sprint(tmp_path, {"number": 2610, "status": "active"})

    path = get_archive_path(project_root=root)

    assert path == root / "sprint" / "archive" / "sprint-2610-completed.yaml"


def test_raises_when_name_and_number_missing(tmp_path: Path) -> None:
    """No name, no number → raise ValueError; never write sprint-unknown-*.yaml."""
    root = _write_sprint(tmp_path, {"status": "active"})

    with pytest.raises(ValueError, match="neither 'name' nor 'number'"):
        get_archive_path(project_root=root)
