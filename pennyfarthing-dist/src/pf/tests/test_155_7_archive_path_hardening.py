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
from pf.sprint.archive_epic import get_archive_path
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

    dry_run=True isolates the resolver: on HEAD archive_story returns
    ``success: True`` with a "Would archive ... to <escaping path>" message
    (RED); after the central fix get_archive_path raises ValueError which
    archive_story surfaces as ``success: False`` (SOUL #10).
    """
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(tmp_path, {"name": "../../../tmp/pwned", "status": "active"})

    try:
        result = archive_story("37-15", "477", dry_run=True)
    except ValueError:
        return  # fail-loud via exception is an acceptable outcome

    assert result["success"] is False
    # And it must never leak an out-of-tree target into the message.
    assert "/tmp/pwned" not in (result.get("message") or "")


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
    assert "Café ☕ déjà vu".encode("utf-8") in content
