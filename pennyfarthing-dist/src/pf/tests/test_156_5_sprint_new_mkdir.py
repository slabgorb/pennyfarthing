"""Tests for story 156-5 (gh #52): sprint writes must self-heal a missing parent dir.

Bug: `_write_yaml_file` (sprint/yaml_io.py) writes to `path.with_suffix(".yaml.tmp")`
without ensuring `path.parent` exists. On a freshly `pf init`'d project there is no
top-level `sprint/` dir, so the first `pf sprint new` crashes with FileNotFoundError.
`--dry-run` falsely reports success (it never exercises the write path).

Approved fix (Dev, GREEN phase): add `path.parent.mkdir(parents=True, exist_ok=True)`
before the atomic temp-write in `_write_yaml_file`. This self-heals every sprint write
path (new, update, add, move, archive, ...), not just `sprint new`.

TDD RED phase: AC1 and AC2 FAIL today with FileNotFoundError. AC3/AC4 are guards that
must stay GREEN after the fix (and may also pass today where they exercise existing dirs).

Call chain for `pf sprint new` (for Dev):
  new_sprint (sprint/cli.py)
    -> get_project_root()              # honors PROJECT_ROOT env override
    -> sprint_file = root/"sprint"/"current-sprint.yaml"
    -> write_sprint(sprint_file, data) # sprint/yaml_io.py
    -> _write_yaml_file(path, data)    # <-- open(tmp) raises FileNotFoundError here
"""

from pathlib import Path

import pytest

from pf.sprint.yaml_io import _write_yaml_file, write_sprint

# Minimal valid sprint mapping (matches the shape new_sprint builds).
MINIMAL_SPRINT_DATA = {
    "sprint": {
        "name": "TO Sprint 2607",
        "number": 2607,
        "jira_sprint_id": 278,
        "jira_sprint_name": "TO Sprint 2607",
        "goal": "Test goal",
        "start_date": "2026-02-16",
        "end_date": "2026-03-01",
        "status": "active",
    },
    "epics": [],
}


# =============================================================================
# AC1 (RED): _write_yaml_file into a missing parent dir self-heals.
# =============================================================================


def test_ac1_write_yaml_file_creates_missing_parent(tmp_path: Path):
    """AC1: `_write_yaml_file` succeeds when the parent dir does NOT exist yet.

    RED today: raises FileNotFoundError because `sprint/` is never created before
    opening `sprint/current-sprint.yaml.tmp`.
    """
    target = tmp_path / "sprint" / "current-sprint.yaml"
    assert not target.parent.exists(), "precondition: sprint/ must not exist yet"

    _write_yaml_file(target, MINIMAL_SPRINT_DATA)

    assert target.exists(), "current-sprint.yaml should have been written"
    content = target.read_text()
    assert "TO Sprint 2607" in content
    assert "status: active" in content


# =============================================================================
# AC2 (RED, end-to-end): `pf sprint new` into a project with no sprint/ dir.
# =============================================================================


def test_ac2_sprint_new_creates_sprint_dir_end_to_end(tmp_path: Path, monkeypatch):
    """AC2: driving `pf sprint new` into a fresh project (no sprint/) creates
    sprint/current-sprint.yaml without FileNotFoundError.

    Uses the Click command via CliRunner, pinning the project root with the
    PROJECT_ROOT env override (honored by get_project_root). Simulates a freshly
    `pf init`'d project: .pennyfarthing/ exists, but top-level sprint/ does NOT.

    RED today: write_sprint -> _write_yaml_file raises FileNotFoundError on the
    missing sprint/ parent (this happens before the archive-dir mkdir).
    """
    from click.testing import CliRunner

    from pf.sprint.cli import new_sprint

    # Fresh project marker, but deliberately NO sprint/ dir.
    (tmp_path / ".pennyfarthing").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))

    sprint_file = tmp_path / "sprint" / "current-sprint.yaml"
    assert not sprint_file.parent.exists(), "precondition: sprint/ must not exist yet"

    runner = CliRunner()
    result = runner.invoke(
        new_sprint,
        ["2607", "278", "2026-02-16", "2026-03-01", "Test goal"],
        catch_exceptions=True,
    )

    # The bug surfaces as an uncaught FileNotFoundError captured by CliRunner.
    assert not isinstance(result.exception, FileNotFoundError), (
        f"pf sprint new crashed with FileNotFoundError on missing sprint/ dir:\n"
        f"{result.exception!r}\noutput:\n{result.output}"
    )
    assert result.exit_code == 0, f"exit_code={result.exit_code}, output:\n{result.output}"
    assert sprint_file.exists(), "sprint/current-sprint.yaml should have been created"
    assert "TO Sprint 2607" in sprint_file.read_text()


# =============================================================================
# AC3 (guard): existing parent dir still writes correctly; atomicity preserved.
# =============================================================================


def test_ac3_existing_parent_dir_writes_and_no_tmp_leftover(tmp_path: Path):
    """AC3: when the parent dir already exists, the write still succeeds, content
    is correct, and no `.tmp` file remains after a successful atomic write.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    target = sprint_dir / "current-sprint.yaml"

    _write_yaml_file(target, MINIMAL_SPRINT_DATA)

    assert target.exists()
    assert "TO Sprint 2607" in target.read_text()
    # Atomic contract: temp file is consumed by os.replace, none left behind.
    leftover = list(sprint_dir.glob("*.tmp"))
    assert leftover == [], f"unexpected leftover temp files: {leftover}"


def test_ac3_tmp_cleaned_on_write_failure(tmp_path: Path, monkeypatch):
    """AC3 (atomicity): if the replace step fails, the temp file is cleaned up
    and the error propagates (existing contract must not regress).
    """
    import pf.sprint.yaml_io as yaml_io

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    target = sprint_dir / "current-sprint.yaml"

    def boom(src, dst):
        raise OSError("simulated replace failure")

    monkeypatch.setattr(yaml_io.os, "replace", boom)

    with pytest.raises(OSError, match="simulated replace failure"):
        _write_yaml_file(target, MINIMAL_SPRINT_DATA)

    leftover = list(sprint_dir.glob("*.tmp"))
    assert leftover == [], f"temp file not cleaned up after failure: {leftover}"


# =============================================================================
# AC4 (guard): idempotent — writing twice (dir exists 2nd time) doesn't error.
# =============================================================================


def test_ac4_idempotent_double_write(tmp_path: Path):
    """AC4: writing twice into the same (initially missing) parent dir must not
    error on the second write (exist_ok semantics).
    """
    target = tmp_path / "sprint" / "current-sprint.yaml"

    _write_yaml_file(target, MINIMAL_SPRINT_DATA)
    # Second write: parent now exists; must not raise FileExistsError.
    _write_yaml_file(target, MINIMAL_SPRINT_DATA)

    assert target.exists()
    assert "TO Sprint 2607" in target.read_text()


def test_ac4_write_sprint_into_missing_dir(tmp_path: Path):
    """AC4 / AC2 (function-level): the public `write_sprint` API also self-heals a
    missing parent dir for the non-sharded (fresh) case.
    """
    target = tmp_path / "sprint" / "current-sprint.yaml"
    assert not target.parent.exists()

    write_sprint(target, MINIMAL_SPRINT_DATA)

    assert target.exists()
    assert "TO Sprint 2607" in target.read_text()
