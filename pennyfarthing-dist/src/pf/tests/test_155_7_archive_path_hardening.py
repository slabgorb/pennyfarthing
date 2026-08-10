"""RED tests for Story 155-7: harden ``get_archive_path`` + archive append encoding.

155-3 Reviewer deferred finding (PR pennyfarthing#119; CWE-22 / CWE-838;
lang-review python.md #5 path handling, #11 input validation):

- ``archive_epic.get_archive_path`` builds ``sprint-{id}-completed.yaml`` from raw
  sprint-YAML metadata (``name`` last token, or ``str(number)``) with **no**
  ``resolve()``/containment check and **no** ``sprint_id`` sanitization.
- ``archive.py`` appends to the resolved archive file via ``open(path, "a")`` with
  **no** ``encoding=`` — the platform default varies (Windows cp1252), CWE-838.

The fix is expected CENTRAL in ``get_archive_path`` so both the epic-archive
caller and the story-archive caller (``archive_story`` → ``get_archive_path``)
inherit the guard (SOUL #2, One Truth One Place).

These are BEHAVIOUR tests. They build a real mini-project rooted at ``tmp_path``
(via ``project_root=`` or the ``PROJECT_ROOT`` env override, the highest-priority
root source in ``get_project_root``) and assert the hardened contract regardless
of how Dev implements it:

  1. ``sprint_id`` is restricted to ``[A-Za-z0-9._-]``; any other character
     raises ``ValueError`` (never silently builds a path from it).
  2. a valid resolved archive path stays contained under ``sprint/archive/``.
  3. the archive append ``open()`` passes ``encoding="utf-8"`` explicitly.
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.archive import archive_story
from pf.sprint.archive_epic import archive_epic, get_archive_path
from pf.sprint.story_finish import _add_story_to_completed
from pf.sprint.yaml_io import _write_yaml_file

# A whitespace-free token is what survives ``str(name).split()[-1]`` in
# get_archive_path, so each of these is used verbatim as the sprint id.
TRAVERSAL_TOKENS = [
    "../evil",  # relative traversal
    "../../../tmp/pwned",  # deeper traversal
    "..",  # bare parent ref
    "a/b",  # embedded path separator
    "/etc/passwd",  # absolute-path escape
    "2618;rm-rf",  # shell metacharacter
    "a$(whoami)",  # command substitution chars
    "a|b",  # pipe
    "sprint~1",  # tilde (home expansion char)
    "a%2fb",  # percent-encoded separator
    "a..b",  # charset-valid but contains '..' — isolates the second guard branch
]


def _write_sprint(tmp_path: Path, sprint_info: dict[str, Any]) -> Path:
    """Build a minimal sprint tree at ``tmp_path`` with the given sprint metadata."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()
    index = {"sprint": sprint_info, "epics": [], "stories": []}
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    return tmp_path


def _write_project(
    tmp_path: Path,
    sprint_info: dict[str, Any],
    *,
    story_id: str = "37-15",
    story_title: str = "Test story",
    status: str = "done",
    archive_file: str | None = None,
) -> Path:
    """Build a minimal sprint tree with one story (for ``archive_story`` tests)."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()
    index = {
        "sprint": sprint_info,
        "epics": [
            {
                "id": "37",
                "title": "Test Epic",
                "stories": [
                    {
                        "id": story_id,
                        "title": story_title,
                        "points": 3,
                        "status": status,
                    }
                ],
            }
        ],
        "stories": [],
    }
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    if archive_file:
        (sprint_dir / "archive" / archive_file).write_text(
            "completed_stories:\n", encoding="utf-8"
        )
    return tmp_path


# --------------------------------------------------------------------------- #
# Layer 2 — sprint_id sanitization (AC3)                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_get_archive_path_rejects_unsafe_sprint_id(tmp_path: Path, token: str) -> None:
    """A sprint id with any char outside [A-Za-z0-9._-] must raise ValueError.

    On HEAD get_archive_path builds and RETURNS the path verbatim (no raise),
    so ``pytest.raises`` fails today (RED) and passes once the char allow-list
    lands.
    """
    root = _write_sprint(tmp_path, {"name": token, "status": "active"})

    with pytest.raises(ValueError):
        get_archive_path(project_root=root)


@pytest.mark.parametrize("token", TRAVERSAL_TOKENS)
def test_get_archive_path_never_returns_escaping_path(tmp_path: Path, token: str) -> None:
    """Defence-in-depth: if it does NOT raise, the resolved path must not escape.

    Guards against a Dev fix that sanitizes too loosely — whatever survives
    must still resolve under sprint/archive/. Belt to the raise's suspenders.
    """
    root = _write_sprint(tmp_path, {"name": token, "status": "active"})
    archive_dir = (root / "sprint" / "archive").resolve()

    try:
        path = get_archive_path(project_root=root)
    except ValueError:
        return  # rejecting is the preferred outcome

    resolved = path.resolve()
    assert archive_dir == resolved.parent or archive_dir in resolved.parents, (
        f"resolved archive path escaped {archive_dir}: {resolved}"
    )


def test_get_archive_path_rejects_traversal_via_name_prefix(tmp_path: Path) -> None:
    """The real symptom shape: a name whose last token is a traversal segment.

    ``"TO Sprint ../../etc/pwn"`` → ``split()[-1]`` == ``"../../etc/pwn"``.
    """
    root = _write_sprint(
        tmp_path, {"name": "TO Sprint ../../etc/pwn", "status": "active"}
    )

    with pytest.raises(ValueError):
        get_archive_path(project_root=root)


# --------------------------------------------------------------------------- #
# Layer 1 — containment + valid-input preservation (AC1, AC6)                  #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("sprint_info", "expected_name"),
    [
        ({"name": "TO Sprint 2610", "number": 2610, "status": "active"}, "sprint-2610-completed.yaml"),
        ({"number": 2618, "status": "active"}, "sprint-2618-completed.yaml"),
        ({"name": "TO Sprint 2610.1", "status": "active"}, "sprint-2610.1-completed.yaml"),
        ({"name": "release-candidate", "status": "active"}, "sprint-release-candidate-completed.yaml"),
    ],
)
def test_get_archive_path_accepts_valid_sprint_id(
    tmp_path: Path, sprint_info: dict[str, Any], expected_name: str
) -> None:
    """Valid ids (digits, dot, dash, word chars) still resolve — no over-broad reject.

    Also pins containment for the happy path: the resolved path stays under
    sprint/archive/ (both sides resolved, so a symlinked tmp root can't false-fail).
    """
    root = _write_sprint(tmp_path, sprint_info)

    path = get_archive_path(project_root=root)

    assert path.name == expected_name
    archive_dir = (root / "sprint" / "archive").resolve()
    assert path.resolve().parent == archive_dir


# --------------------------------------------------------------------------- #
# Central fix benefits the story-archive caller too (AC: fix centrally)        #
# --------------------------------------------------------------------------- #


def test_archive_story_rejects_unsafe_sprint_id(tmp_path: Path, monkeypatch) -> None:
    """archive_story routes through get_archive_path, so the guard must fire here too.

    dry_run=True isolates the resolver: archive_story wraps the guard's
    ValueError into ``success: False`` (SOUL #10) — a raise here is a contract
    break, not an acceptable alternative (rework round 2: the old escape hatch
    plus a ``message``-key assert made the leak check vacuous — the failure
    path only sets ``error``).
    """
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(tmp_path, {"name": "../../../tmp/pwned", "status": "active"})

    result = archive_story("37-15", "477", dry_run=True)

    assert result["success"] is False
    # The guard's actionable message must be the error. Echoing the offending
    # YAML token back to the user is fine; what must never appear is a BUILT
    # archive target ("Would archive ... to <path>") for an unsafe id.
    assert "Invalid sprint id" in result["error"]
    assert "Would archive" not in (result.get("message") or "")


# --------------------------------------------------------------------------- #
# Layer 3 — archive append encoding (AC4, CWE-838)                            #
# --------------------------------------------------------------------------- #


def test_archive_append_open_passes_utf8_encoding(tmp_path: Path, monkeypatch) -> None:
    """The append open() on the archive file must pass encoding='utf-8'.

    Platform-independent RED: on HEAD ``open(archive_file, "a")`` is called with
    no encoding kwarg, so this fails everywhere (a round-trip test would pass
    vacuously on macOS/Linux where the default is already utf-8).
    """
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(
        tmp_path,
        {"number": 7, "status": "active"},
        archive_file="sprint-7-completed.yaml",
    )

    import builtins

    real_open = builtins.open
    append_kwargs: list[dict[str, Any]] = []

    def spy_open(file, mode="r", *args, **kwargs):
        if "a" in mode:
            append_kwargs.append({"file": str(file), **kwargs})
        return real_open(file, mode, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", spy_open)

    result = archive_story("37-15", "477")

    assert result["success"] is True, result.get("error")
    archive_appends = [
        kw for kw in append_kwargs if kw["file"].endswith("sprint-7-completed.yaml")
    ]
    assert archive_appends, "expected an append open() on the archive file"
    assert all(kw.get("encoding") == "utf-8" for kw in archive_appends), (
        "archive append open() must pass encoding='utf-8' (CWE-838); "
        f"got {[kw.get('encoding') for kw in archive_appends]}"
    )


def test_archive_append_roundtrips_non_ascii(tmp_path: Path, monkeypatch) -> None:
    """Content integrity guard: a non-ASCII story title lands as UTF-8 bytes.

    Companion to the encoding-kwarg spy — asserts the written bytes decode as
    UTF-8 (preservation guard; passes on utf-8-default platforms regardless,
    the spy test above is the platform-independent RED).
    """
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(
        tmp_path,
        {"number": 7, "status": "active"},
        story_title="Café ☕ déjà vu",
        archive_file="sprint-7-completed.yaml",
    )

    result = archive_story("37-15", "477")

    assert result["success"] is True, result.get("error")
    content = (tmp_path / "sprint" / "archive" / "sprint-7-completed.yaml").read_bytes()
    assert "Café ☕ déjà vu".encode() in content


# --------------------------------------------------------------------------- #
# Rework round 2 — the guard must not crash result-object callers (SOUL #10)   #
#                                                                              #
# Reviewer [HIGH]: get_archive_path's new raises reach two callers that never  #
# wrap ValueError — archive_epic() (via ensure_archive_file) and               #
# story_finish._add_story_to_completed (whose docstring promises a result      #
# dict). An ordinary punctuated sprint name ("Sprint (Q3)" → last token        #
# "(Q3)") crashes `pf sprint epic archive` and `pf sprint story finish`        #
# mid-flow with a traceback. These pin the observable contract: return         #
# {"success": False, "error": ...}, and leave no half-done archive behind.     #
# --------------------------------------------------------------------------- #


def _write_epic_project(tmp_path: Path, sprint_info: dict[str, Any]) -> Path:
    """Minimal project with one COMPLETE epic (for ``archive_epic`` tests)."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()
    index = {
        "sprint": sprint_info,
        "epics": [
            {
                "id": "37",
                "title": "Test Epic",
                "status": "done",
                "stories": [
                    {"id": "37-15", "title": "Test story", "points": 3, "status": "done"}
                ],
            }
        ],
        "stories": [],
    }
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    return tmp_path


def test_archive_epic_returns_result_on_unsafe_sprint_id(tmp_path: Path) -> None:
    """archive_epic() surfaces the guard as a result dict — never a raw raise.

    RED: on HEAD the ensure_archive_file call inside archive_epic() has no
    try/except, so the charset guard's ValueError propagates uncaught through
    the ``pf sprint epic archive`` CLI.
    """
    root = _write_epic_project(tmp_path, {"name": "Sprint (Q3)", "status": "active"})

    try:
        result = archive_epic("37", project_root=root)
    except ValueError as exc:
        pytest.fail(
            f"archive_epic must return a result dict (SOUL #10), raised instead: {exc}"
        )

    assert result["success"] is False
    assert "Invalid sprint id" in result["error"]


def test_archive_epic_unsafe_sprint_id_leaves_no_stray_shard(tmp_path: Path) -> None:
    """A failed epic-archive must not strand a half-done archive.

    On HEAD the epic shard is written/moved to archive/ (step 1) BEFORE the
    guard fires in ensure_archive_file (step 3) — the crash leaves
    archive/epic-37.yaml behind while the sprint index still lists the epic.
    The archive-path guard must run before any filesystem mutation
    (155-12 precedent: validate before the first irreversible step).
    """
    root = _write_epic_project(tmp_path, {"name": "Sprint (Q3)", "status": "active"})

    archive_epic("37", project_root=root)

    assert not (root / "sprint" / "archive" / "epic-37.yaml").exists(), (
        "failed archive_epic left a stray shard in sprint/archive/"
    )


def test_add_story_to_completed_returns_result_on_unsafe_sprint_id(tmp_path: Path) -> None:
    """_add_story_to_completed keeps its documented result-dict promise.

    Its docstring claims SOUL #10 compliance, but on HEAD only the
    _write_archive_file step is wrapped — the ensure_archive_file call raises
    the guard's ValueError uncaught, crashing ``pf sprint story finish`` at
    step 4b, AFTER the merge step already ran.
    """
    root = _write_project(tmp_path, {"name": "Sprint (Q3)", "status": "active"})

    try:
        result = _add_story_to_completed(
            root, "37-15", {"id": "37-15", "title": "Test story", "points": 3}
        )
    except ValueError as exc:
        pytest.fail(
            f"_add_story_to_completed must return a result dict (its own "
            f"docstring promise, SOUL #10), raised instead: {exc}"
        )

    assert result["success"] is False
    assert "Invalid sprint id" in result["error"]
