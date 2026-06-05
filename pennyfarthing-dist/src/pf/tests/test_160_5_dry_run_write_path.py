"""Tests for story 160-5: `pf sprint new` / `pf sprint story update` --dry-run
must exercise (or assert) the write path so failures are not masked.

Provenance
----------
160-5 is the direct follow-up to a TEA finding on 156-5 (gh #52). 156-5 fixed a
`FileNotFoundError` in `write_sprint -> _write_yaml_file` on a missing `sprint/`
parent dir. TEA noted that the bug was *masked* because:

    `--dry-run` path (cli.py:2222-2227) never exercises the write, so it reports
    success even on the broken state — a false-positive.

The same class of gap exists for `pf sprint story update`: `update_story`
validates the mutated document but `return`s on `dry_run` *before* calling
`write_sprint` (story_update.py:175 vs 182), so a serialization / IO failure in
the write path (exactly the 156-5 failure mode) is never surfaced by a dry-run.

The defect, precisely
----------------------
* `new_sprint` (sprint/cli.py:2222): `if dry_run: echo(...); return` short-circuits
  BEFORE the `sprint_data` dict is built, BEFORE any validation, and BEFORE
  `write_sprint`. Nothing about the would-be write is checked.
* `update_story` (sprint/story_update.py:175): validates schema, then
  `if dry_run: return {success: True}` — but `write_sprint` (serialization,
  shard-splitting, atomic replace, the 156-5 mkdir self-heal) is never run.

Acceptance criteria (from session 160-5)
----------------------------------------
AC1  Dry-run exercises / validates the SAME write path the real write uses
     (same validation / serialization code).
AC2  A payload that would fail the real write also fails dry-run, with the same
     failure surfaced (error parity).
AC3  Dry-run still does NOT persist changes to disk.
AC4  Both `pf sprint new --dry-run` and `pf sprint story update --dry-run` are
     covered.

Test strategy
-------------
The faithful, hermetic way to express "a payload that would fail the real write"
without depending on a specific serialization bug is to force the documented
write function (`write_sprint`) to fail — the same monkeypatch-the-write pattern
156-5's own suite used (`test_ac3_tmp_cleaned_on_write_failure` patched
`os.replace`). Each parity test first asserts the REAL run fails under the forced
failure (control — proves the test is not vacuous), then asserts the dry-run run
surfaces the failure too. RED today: dry-run returns success before reaching the
write.

Guidance for Dev (GREEN phase)
------------------------------
Make `--dry-run` route through the SAME write/serialization path the real run
uses (e.g. call `write_sprint` into a throwaway location, or factor a shared
`prepare_write`/validate step that both call), so a real write failure surfaces
in dry-run too — while still NOT persisting to the live sprint file (AC3). Do not
"fix" this by making dry-run merely re-validate the schema: `new`'s failure mode
is in serialization/IO, which schema validation alone does not catch.
"""

from pathlib import Path

import pytest
from click.testing import CliRunner

import pf.sprint.story_update as story_update_mod
import pf.sprint.yaml_io as yaml_io
from pf.sprint.cli import new_sprint
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# Args for `pf sprint new SPRINT_YYWW JIRA_ID START END GOAL`.
NEW_ARGS = ["2607", "278", "2026-02-16", "2026-03-01", "Test goal"]

MINIMAL_SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-76
    type: epic
    title: "Epic: Sprint Data Management"
    priority: P1
    status: in_progress
    jira: PROJ-14253
    stories:
      - id: 76-3
        title: Sprint story add command
        points: 3
        priority: P0
        status: backlog
        workflow: tdd
"""


def _explode(*_args, **_kwargs):
    """Stand-in for a write path that fails (e.g. the 156-5 IO failure)."""
    raise RuntimeError("simulated write-path failure")


@pytest.fixture
def fresh_project(tmp_path: Path, monkeypatch):
    """A project root with a `.pennyfarthing/` marker and an existing `sprint/`
    dir, pinned via PROJECT_ROOT (honored by get_project_root). `sprint/` exists
    so that — absent the forced failure — a real write would otherwise succeed,
    isolating the failure under test to the write path itself."""
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / "sprint").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    return tmp_path


@pytest.fixture
def sprint_file(tmp_path: Path) -> Path:
    """A standalone sprint YAML on disk for function-level update tests."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(MINIMAL_SPRINT_YAML)
    return p


# =============================================================================
# AC1 + AC2 (RED): `pf sprint new --dry-run` must surface a write-path failure
# the same way the real run does.
# =============================================================================


def test_new_dry_run_surfaces_write_failure_like_real_run(fresh_project, monkeypatch):
    """RED: with the write path forced to fail, the real `pf sprint new` run fails
    (control) — but `--dry-run` reports success, masking the failure.

    Today dry-run returns at cli.py:2227 before `write_sprint` is even imported,
    so it exits 0. After the fix, dry-run must reach the write and exit non-zero.
    """
    monkeypatch.setattr(yaml_io, "write_sprint", _explode)
    runner = CliRunner()

    # Control: the REAL run genuinely fails under the forced write failure.
    real = runner.invoke(new_sprint, NEW_ARGS, catch_exceptions=True)
    assert real.exit_code != 0, (
        "precondition: real `pf sprint new` must fail when the write path fails; "
        f"got exit_code=0, output:\n{real.output}"
    )

    # The bug: dry-run does NOT surface the failure that the real run hits.
    dry = runner.invoke(new_sprint, [*NEW_ARGS, "--dry-run"], catch_exceptions=True)
    assert dry.exit_code != 0, (
        "dry-run falsely reported success while the real write path fails — "
        "it never exercised the write (cli.py:2222-2227). "
        f"exit_code={dry.exit_code}, output:\n{dry.output}"
    )


# =============================================================================
# AC3 (guard): `pf sprint new --dry-run` must NOT persist. Green today; must stay
# green after the fix so reaching the write does not start writing for real.
# =============================================================================


def test_new_dry_run_does_not_persist(fresh_project):
    """AC3: a successful dry-run writes nothing to disk."""
    sprint_file = fresh_project / "sprint" / "current-sprint.yaml"
    archive_file = (
        fresh_project / "sprint" / "archive" / "sprint-2607-completed.yaml"
    )
    assert not sprint_file.exists(), "precondition: no sprint file yet"

    runner = CliRunner()
    result = runner.invoke(new_sprint, [*NEW_ARGS, "--dry-run"], catch_exceptions=True)

    assert result.exit_code == 0, f"dry-run should succeed; output:\n{result.output}"
    assert "[DRY-RUN]" in result.output
    assert not sprint_file.exists(), "dry-run must not create current-sprint.yaml"
    assert not archive_file.exists(), "dry-run must not create the archive file"


# =============================================================================
# AC1 + AC2 (RED): `story update --dry-run` must surface a write-path failure.
# Function-level (update_story returns a result dict).
# =============================================================================


def test_update_dry_run_surfaces_write_failure_like_real_run(sprint_file, monkeypatch):
    """RED: with `write_sprint` forced to fail, the real update fails (control),
    but `dry_run=True` returns success — `update_story` returns at
    story_update.py:175 before reaching `write_sprint` (line 182)."""
    monkeypatch.setattr(story_update_mod, "write_sprint", _explode)

    # Control: the real update genuinely fails under the forced write failure.
    real_failed = False
    real_result = None
    try:
        real_result = update_story(
            sprint_path=sprint_file, story_id="76-3", status="ready", dry_run=False
        )
    except RuntimeError:
        real_failed = True
    real_failed = real_failed or (
        isinstance(real_result, dict) and real_result.get("success") is not True
    )
    assert real_failed, (
        "precondition: real update must fail when the write path fails; "
        f"got result={real_result!r}"
    )

    # The bug: dry-run reports success even though the real write would fail.
    dry_failed = False
    dry_result = None
    try:
        dry_result = update_story(
            sprint_path=sprint_file, story_id="76-3", status="ready", dry_run=True
        )
    except RuntimeError:
        dry_failed = True
    dry_failed = dry_failed or (
        isinstance(dry_result, dict) and dry_result.get("success") is not True
    )
    assert dry_failed, (
        "dry-run falsely reported success while the real write path fails — "
        f"it never exercised the write (story_update.py:175). got result={dry_result!r}"
    )


def test_update_dry_run_via_cli_surfaces_write_failure(sprint_file, monkeypatch):
    """RED (public CLI surface): `pf sprint story update --dry-run` must exit
    non-zero when the write path is broken, mirroring the real run."""
    monkeypatch.setattr(story_update_mod, "write_sprint", _explode)
    runner = CliRunner()
    common = ["76-3", "--status", "ready", "--sprint-file", str(sprint_file)]

    real = runner.invoke(story_update_command, common, catch_exceptions=True)
    assert real.exit_code != 0, (
        "precondition: real `story update` must fail when the write path fails; "
        f"got exit_code=0, output:\n{real.output}"
    )

    dry = runner.invoke(
        story_update_command, [*common, "--dry-run"], catch_exceptions=True
    )
    assert dry.exit_code != 0, (
        "dry-run falsely reported success while the real write path fails. "
        f"exit_code={dry.exit_code}, output:\n{dry.output}"
    )


# =============================================================================
# AC3 (guard): `story update --dry-run` must NOT persist. Green today; must stay
# green after the fix.
# =============================================================================


def test_update_dry_run_does_not_persist(sprint_file):
    """AC3: dry-run reports a would-be change but leaves the file byte-identical."""
    original = sprint_file.read_text()

    result = update_story(
        sprint_path=sprint_file, story_id="76-3", status="done", dry_run=True
    )

    assert result["success"] is True
    assert result.get("dry_run") is True
    # On disk the story is untouched: still backlog, no completed date written.
    assert sprint_file.read_text() == original
    data = read_sprint(sprint_file)
    story = data["epics"][0]["stories"][0]
    assert story["status"] == "backlog", "dry-run must not persist the status change"
    assert "completed" not in story, "dry-run must not persist the auto-completed date"
