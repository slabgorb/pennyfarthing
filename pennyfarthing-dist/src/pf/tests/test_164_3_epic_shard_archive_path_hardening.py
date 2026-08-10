"""RED tests for Story 164-3: Harden epic-shard archive paths.

CWE-22 path-traversal follow-up to 155-7: three unguarded surfaces that accept
user-controlled or metadata-sourced strings as parts of file paths, plus a shared-
validator extraction requirement (SOUL #2, One Truth One Place).

Criterion 1 — ``_get_epic_ref()`` charset + containment
    A malicious epic id/jira key (traversal, slash, null byte, etc.) is rejected
    with ``ValueError`` *before* any ``epic-{ref}.yaml`` path is built, written,
    moved, or deleted. A valid ref still works (regression guard).

Criterion 2 — ``pf sprint new`` guard bypass
    Line 2217 in ``sprint/cli.py`` builds ``sprint-{sprint_yyww}-completed.yaml``
    directly from the CLI argument without invoking ``get_archive_path``.  A
    traversal-shaped sprint id must be rejected via the same validator, not silently
    materialise an escaped archive path.

Criterion 3 — ``archive_epic()`` dry-run validation order
    The ``ensure_archive_file()`` guard is invoked AFTER the dry-run early-return
    (line 553 before 575).  An unsafe sprint id must NOT preview success in dry-run
    mode — validation must be hoisted above the early return.

Criterion 4 — Shared validator (SOUL #2)
    Both the sprint-filename family and the epic-shard-filename family must route
    through one ``validate_shard_filename`` / ``validate_sprint_id`` function in
    ``pf.sprint.path_validation``.  Tests verify:
      (a) the module and functions exist,
      (b) they raise ValueError on traversal inputs and return the ref on valid inputs,
      (c) ``_get_epic_ref`` and ``get_archive_path`` exhibit identical rejection
          behaviour (behaviour-parity test — same inputs, same outcomes).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.archive_epic import archive_epic, get_archive_path
from pf.sprint.yaml_io import _get_epic_ref, _write_yaml_file, write_sprint

# ---------------------------------------------------------------------------
# Shared traversal corpus
# ---------------------------------------------------------------------------

#: Traversal strings used as both epic ids and sprint ids.
TRAVERSAL_TOKENS: list[str] = [
    "../../etc/passwd",
    "../evil",
    "..",
    "epic-../foo",
    "a/b",
    "a\\b",
    "/abs/path",
    "a\x00b",  # null byte
    "a;rm-rf",
    "a|b",
]

#: Safe refs that the guard must accept (regression guard).
SAFE_REFS: list[tuple[str, str]] = [
    ("164", "164"),
    ("OP-42", "OP-42"),
    ("release-1.0", "release-1.0"),
    ("2607", "2607"),
    ("2610.1", "2610.1"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_sprint_dir(
    tmp_path: Path,
    sprint_info: dict[str, Any],
    *,
    epics: list[dict[str, Any]] | None = None,
) -> Path:
    """Build a minimal sprint tree at *tmp_path* with the given sprint metadata."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir(parents=True, exist_ok=True)
    (sprint_dir / "archive").mkdir(exist_ok=True)
    _write_yaml_file(
        sprint_dir / "current-sprint.yaml",
        {"sprint": sprint_info, "epics": epics or [], "stories": []},
    )
    return tmp_path


def _write_epic_project(
    tmp_path: Path,
    sprint_info: dict[str, Any],
    epic_id: str = "164",
    *,
    all_done: bool = True,
) -> Path:
    """Minimal project with one epic (all stories done when *all_done* is True)."""
    stories = [
        {
            "id": f"{epic_id}-1",
            "title": "Test story",
            "points": 3,
            "status": "done" if all_done else "in-progress",
        }
    ]
    epics = [
        {
            "id": epic_id,
            "title": "Test Epic",
            "status": "done" if all_done else "active",
            "stories": stories,
        }
    ]
    return _write_sprint_dir(tmp_path, sprint_info, epics=epics)


# ===========================================================================
# Criterion 1 — _get_epic_ref() charset + containment
# ===========================================================================


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_get_epic_ref_rejects_traversal_id(token: str) -> None:
    """``_get_epic_ref`` must raise ``ValueError`` when the epic id is a traversal token.

    RED: on HEAD ``_get_epic_ref`` performs only a ``while stripped.startswith("epic-")``
    strip and returns the raw id (or the jira key) with no charset check. The call
    returns silently, producing a path component like ``../../etc/passwd``.
    """
    epic: dict[str, Any] = {"id": token, "title": "Evil epic"}
    with pytest.raises(ValueError, match=r"[Ii]nvalid|[Ii]llegal|[Uu]nsafe|[Tt]raversal"):
        _get_epic_ref(epic)


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_get_epic_ref_rejects_traversal_jira_key(token: str) -> None:
    """``_get_epic_ref`` must also reject malicious jira keys.

    Jira keys take priority in the current logic — the guard must apply to that
    branch too, not just the numeric-id branch.
    """
    epic: dict[str, Any] = {"id": "safe-164", "jira": token, "title": "Evil epic"}
    with pytest.raises(ValueError, match=r"[Ii]nvalid|[Ii]llegal|[Uu]nsafe|[Tt]raversal"):
        _get_epic_ref(epic)


@pytest.mark.parametrize(("input_id", "expected_ref"), SAFE_REFS)
def test_get_epic_ref_accepts_safe_id(input_id: str, expected_ref: str) -> None:
    """Safe refs must still resolve — no over-broad reject (regression guard).

    Epic ids that contain only [A-Za-z0-9._-] and do not embed '..' must return
    without raising. The exact returned value is pinned to catch accidental
    double-prefix stripping side effects.
    """
    epic: dict[str, Any] = {"id": input_id, "title": "Safe epic"}
    ref = _get_epic_ref(epic)
    assert ref == expected_ref


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_write_sprint_shard_rejects_traversal_epic_id(
    tmp_path: Path, token: str
) -> None:
    """``write_sprint`` must not write a shard to an escaped path.

    ``write_sprint`` calls ``_get_epic_ref`` for each epic when writing in sharded
    mode. The guard in ``_get_epic_ref`` must prevent ``epic-{traversal}.yaml``
    from being materialised outside the sprint directory.

    RED: on HEAD the shard is written (or attempted) without validation.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    index_path = sprint_dir / "current-sprint.yaml"

    # Seed the on-disk index as sharded so write_sprint takes the sharded branch.
    _write_yaml_file(index_path, {"sprint": {"number": 1}, "epics": ["164"], "stories": []})
    (sprint_dir / "epic-164.yaml").write_text(
        "id: '164'\ntitle: placeholder\n", encoding="utf-8"
    )

    data = {
        "sprint": {"number": 1},
        "epics": [{"id": token, "title": "Evil"}],
        "stories": [],
    }
    with pytest.raises(ValueError):
        write_sprint(index_path, data)


def test_get_epic_ref_containment_guard(tmp_path: Path) -> None:
    """Defence-in-depth: even if charset passes, the resolved path must stay inside sprint/.

    This test pins the containment branch — a ref like ``a..b`` passes the
    charset check but must still fail the containment resolve() check.

    RED: containment is not checked at all on HEAD inside ``_get_epic_ref``.
    """
    # "a..b" passes [A-Za-z0-9._-]+ fullmatch but contains ".."
    epic: dict[str, Any] = {"id": "a..b", "title": "Dotdot epic"}
    with pytest.raises(ValueError):
        _get_epic_ref(epic)


# ===========================================================================
# Criterion 2 — pf sprint new guard bypass (cli.py line 2217)
# ===========================================================================


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_sprint_new_rejects_traversal_sprint_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, token: str
) -> None:
    """``pf sprint new`` must reject a traversal-shaped sprint id before building any path.

    RED: on HEAD line 2217 constructs the archive path directly:
        ``archive_file = root / "sprint" / "archive" / f"sprint-{sprint_yyww}-completed.yaml"``
    with no validation of ``sprint_yyww``, so a traversal token like ``../../etc``
    would silently produce an escaped path.

    The command must exit non-zero *or* the output must contain an error message
    rather than "Created" / "[DRY-RUN] Would initialize".
    """
    from click.testing import CliRunner

    from pf.sprint.cli import new_sprint

    (tmp_path / ".pennyfarthing").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    (tmp_path / "sprint" / "archive").mkdir(parents=True)

    runner = CliRunner()
    result = runner.invoke(
        new_sprint,
        [token, "278", "2026-02-16", "2026-03-01", "Test goal"],
        catch_exceptions=False,
    )

    # Validation must fire before any "Created …" confirmation.
    assert result.exit_code != 0 or (
        "Created" not in result.output and "[DRY-RUN] Would initialize" not in result.output
    ), (
        f"pf sprint new silently accepted traversal id {token!r}.\n"
        f"exit_code={result.exit_code}\noutput:\n{result.output}"
    )


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_sprint_new_dry_run_rejects_traversal_sprint_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, token: str
) -> None:
    """Dry-run must also reject traversal ids — guard fires before any preview.

    This pins criterion 2 in dry-run mode separately so it can be independently
    tracked from the real-write path.
    """
    from click.testing import CliRunner

    from pf.sprint.cli import new_sprint

    (tmp_path / ".pennyfarthing").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    (tmp_path / "sprint" / "archive").mkdir(parents=True)

    runner = CliRunner()
    result = runner.invoke(
        new_sprint,
        [token, "278", "2026-02-16", "2026-03-01", "Test goal", "--dry-run"],
        catch_exceptions=False,
    )

    assert result.exit_code != 0 or "[DRY-RUN] Would initialize" not in result.output, (
        f"pf sprint new --dry-run silently previewed success for traversal id {token!r}.\n"
        f"exit_code={result.exit_code}\noutput:\n{result.output}"
    )


def test_sprint_new_accepts_valid_sprint_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression guard: a well-formed sprint id must still succeed after hardening.

    RED: This may pass today (no validation means no rejection), but must continue
    to pass after the guard lands.
    """
    from click.testing import CliRunner

    from pf.sprint.cli import new_sprint

    (tmp_path / ".pennyfarthing").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))

    runner = CliRunner()
    result = runner.invoke(
        new_sprint,
        ["2607", "278", "2026-02-16", "2026-03-01", "Test goal"],
        catch_exceptions=True,
    )

    assert result.exit_code == 0, (
        f"pf sprint new rejected a valid sprint id '2607'.\n"
        f"exit_code={result.exit_code}\noutput:\n{result.output}"
    )
    assert "Created" in result.output or "TO Sprint 2607" in result.output


# ===========================================================================
# Criterion 3 — archive_epic() dry-run validation order
# ===========================================================================


@pytest.mark.parametrize("token", ["../../evil", "..", "a/b", "a;rm"])
def test_archive_epic_dry_run_rejects_unsafe_sprint_id(
    tmp_path: Path, token: str
) -> None:
    """``archive_epic(dry_run=True)`` must NOT preview success when the sprint id is unsafe.

    RED: on HEAD the dry-run early return at line 553 precedes the
    ``ensure_archive_file()`` guard call at line 575.  An unsafe sprint id
    causes ``archive_epic(dry_run=True)`` to return
    ``{"success": True, "dry_run": True, ...}`` without ever hitting validation.

    After the fix, validation must be hoisted above the early return so that
    both modes exercise the same guard.
    """
    root = _write_epic_project(tmp_path, {"name": token, "status": "active"})

    result = archive_epic("164", project_root=root, dry_run=True)

    assert result["success"] is False, (
        f"archive_epic(dry_run=True) previewed success for unsafe sprint id {token!r}: "
        f"{result}"
    )
    assert "error" in result, (
        f"Expected an 'error' key in the result, got: {result}"
    )


def test_archive_epic_dry_run_safe_sprint_id_still_previews_success(
    tmp_path: Path,
) -> None:
    """Regression guard: dry_run=True with a valid sprint id must still return success.

    Pins that hoisting the guard does not break the happy-path dry-run preview.
    """
    root = _write_epic_project(tmp_path, {"number": 2607, "status": "active"})

    result = archive_epic("164", project_root=root, dry_run=True)

    assert result.get("success") is True, (
        f"archive_epic(dry_run=True) failed on a valid sprint id: {result}"
    )
    assert result.get("dry_run") is True


def test_archive_epic_dry_run_validation_fires_before_filesystem_mutation(
    tmp_path: Path,
) -> None:
    """No shard file must be created in dry-run with an unsafe sprint id.

    Belt-and-suspenders: even if success=False is set, confirm no file was written.
    """
    root = _write_epic_project(tmp_path, {"name": "../../evil", "status": "active"})
    archive_dir = root / "sprint" / "archive"

    archive_epic("164", project_root=root, dry_run=True)

    # No shard should have been created in the archive directory.
    created = list(archive_dir.glob("epic-*.yaml"))
    assert created == [], (
        f"archive_epic(dry_run=True) with unsafe sprint id wrote shard files: {created}"
    )


# ===========================================================================
# Criterion 4 — Shared validator (SOUL #2, One Truth One Place)
# ===========================================================================


def _import_path_validation():
    """Import ``pf.sprint.path_validation``; skip with a clear message if absent.

    Tests that call this helper fail cleanly (``ModuleNotFoundError``) on HEAD —
    which is the correct RED signal.  Once Dev extracts the validator the import
    succeeds and the test runs.
    """
    import importlib

    return importlib.import_module("pf.sprint.path_validation")


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_shared_validator_validate_shard_filename_rejects_traversal(token: str) -> None:
    """``validate_shard_filename`` must raise ``ValueError`` for each traversal token.

    RED: module does not exist on HEAD → ``ModuleNotFoundError`` (expected failure).
    """
    pv = _import_path_validation()
    with pytest.raises(ValueError):
        pv.validate_shard_filename(token)


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_shared_validator_validate_sprint_id_rejects_traversal(token: str) -> None:
    """``validate_sprint_id`` must raise ``ValueError`` for each traversal token.

    RED: module does not exist on HEAD → ``ModuleNotFoundError`` (expected failure).
    """
    pv = _import_path_validation()
    with pytest.raises(ValueError):
        pv.validate_sprint_id(token)


@pytest.mark.parametrize(
    ("ref", "fn_name"),
    [
        ("164", "validate_shard_filename"),
        ("OP-42", "validate_shard_filename"),
        ("2607", "validate_sprint_id"),
        ("release-1.0", "validate_sprint_id"),
        ("2610.1", "validate_sprint_id"),
    ],
)
def test_shared_validator_accepts_safe_refs(ref: str, fn_name: str) -> None:
    """Both validator functions return the ref unchanged for safe inputs.

    RED: module does not exist on HEAD → ``ModuleNotFoundError`` (expected failure).
    """
    pv = _import_path_validation()
    fn = getattr(pv, fn_name)
    result = fn(ref)
    assert result == ref, (
        f"{fn_name}({ref!r}) must return the ref unchanged; got {result!r}"
    )


def test_shared_validator_validate_shard_filename_rejects_dotdot_charset_pass(
) -> None:
    """``validate_shard_filename`` rejects 'a..b' — charset passes but '..' is forbidden.

    RED: module does not exist on HEAD → ``ModuleNotFoundError`` (expected failure).
    """
    pv = _import_path_validation()
    with pytest.raises(ValueError):
        pv.validate_shard_filename("a..b")


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS[:4])  # a representive sample
def test_behaviour_parity_get_epic_ref_vs_validate_shard_filename(token: str) -> None:
    """``_get_epic_ref`` and ``validate_shard_filename`` must agree on every traversal token.

    If one raises and the other doesn't the shared-validator extraction has a gap.

    RED: both sides fail today — ``_get_epic_ref`` doesn't raise (no guard),
    and ``validate_shard_filename`` doesn't exist.  After Dev's fix both must
    raise ``ValueError`` for the same inputs.
    """
    pv = _import_path_validation()

    epic: dict[str, Any] = {"id": token, "title": "Evil"}

    ref_raised: bool = False
    validator_raised: bool = False

    try:
        _get_epic_ref(epic)
    except ValueError:
        ref_raised = True

    try:
        pv.validate_shard_filename(token)
    except ValueError:
        validator_raised = True

    assert ref_raised == validator_raised, (
        f"Behaviour parity failure for {token!r}: "
        f"_get_epic_ref raised={ref_raised}, "
        f"validate_shard_filename raised={validator_raised}. "
        "Both must agree — they must route through the same logic."
    )


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS[:4])
def test_behaviour_parity_get_archive_path_vs_validate_sprint_id(
    tmp_path: Path, token: str
) -> None:
    """``get_archive_path`` and ``validate_sprint_id`` must agree on every traversal token.

    RED: ``validate_sprint_id`` doesn't exist on HEAD.  After the fix both must
    raise ``ValueError`` for the same inputs, confirming they share a code path.
    """
    pv = _import_path_validation()

    root = _write_sprint_dir(tmp_path, {"name": token, "status": "active"})

    gap_raised: bool = False
    validator_raised: bool = False

    try:
        get_archive_path(project_root=root)
    except ValueError:
        gap_raised = True

    try:
        pv.validate_sprint_id(token)
    except ValueError:
        validator_raised = True

    assert gap_raised == validator_raised, (
        f"Behaviour parity failure for {token!r}: "
        f"get_archive_path raised={gap_raised}, "
        f"validate_sprint_id raised={validator_raised}. "
        "Both must agree — they must route through the same validator."
    )
