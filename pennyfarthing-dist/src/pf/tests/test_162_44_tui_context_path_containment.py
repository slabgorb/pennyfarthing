"""RED probe for story 162-44 round 2 — ``tui/story_detail_data.py``.

The reviewer flagged this module as carrying the same ``epic-``/``context-epic-``
ref-interpolation class the 162-44 sweep hardened everywhere else. It appeared in
NO prior inventory (162-12 / 162-44 / 164-3 never touch the ``tui/`` tree), so
this file probes it rather than assuming.

All sites here are READS, reached from normal TUI navigation
(``sprint_panel`` / ``progress_panel`` → ``story_detail_screen`` →
``fetch_story_detail``). The refs are category (b): read out of sprint YAML on
disk (``ws_push`` ships ``epic_data['id']`` / ``jira:`` straight from
``merge_epic_shards`` to the TUI), so anything that can write sprint YAML — or a
Jira sync that lands a hostile id — controls them.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml

from pf.tui.story_detail_data import _check_context_files, _find_session_file


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture
def escaping_context(tmp_path):
    """project_root with sprint/context/ containing an escape symlink.

    ``sprint/context/context-epic-link -> outside/`` so a ref of ``link/x``
    resolves outside the context dir. Returns (root, context_dir, secret).
    """
    context_dir = tmp_path / "sprint" / "context"
    context_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "x.md"
    _write(secret, "TOP SECRET EPIC CONTEXT\n")
    (context_dir / "context-epic-link").symlink_to(outside, target_is_directory=True)
    return tmp_path, context_dir, secret


def test_epic_context_path_from_story_id_stays_inside_context_dir(escaping_context):
    """Site 3: ``context-epic-{epic_num}.md`` where epic_num derives from story_id.

    ``story_id="link/x-1"`` → ``epic_num="link/x"`` → the built path resolves
    into ``outside/``. The returned path is later ``open()``ed by
    ``fetch_story_detail`` and rendered, so a contained path is the invariant.
    """
    root, context_dir, secret = escaping_context

    result = _check_context_files("link/x-1", str(root))

    if result["has_epic_context"]:
        resolved = Path(result["epic_context_path"]).resolve()
        assert resolved.is_relative_to(context_dir.resolve()), (
            f"path traversal: epic context path escapes {context_dir}: {resolved}"
        )


def test_epic_context_path_from_shard_jira_key_stays_inside_context_dir(tmp_path):
    """Site 5: ``context-epic-{jira_key}.md`` with jira_key read from shard YAML.

    The worst provenance in the file: the module opens each ``epic-*.yaml``,
    takes the raw text after ``jira:``, and interpolates it into a filename with
    no validation. A shard whose ``jira:`` is a traversal ref therefore yields a
    path outside ``sprint/context/`` that is read and rendered.
    """
    root = tmp_path
    sprint_dir = root / "sprint"
    context_dir = sprint_dir / "context"
    context_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "x.md"
    _write(secret, "TOP SECRET EPIC CONTEXT\n")
    (context_dir / "context-epic-link").symlink_to(outside, target_is_directory=True)
    # A shard whose id matches the story's epic number and whose jira: escapes.
    _write(
        sprint_dir / "epic-42.yaml",
        yaml.safe_dump({"id": "42", "jira": "link/x", "stories": []}, sort_keys=False),
    )

    result = _check_context_files("42-1", str(root))

    if result["has_epic_context"]:
        resolved = Path(result["epic_context_path"]).resolve()
        assert resolved.is_relative_to(context_dir.resolve()), (
            f"path traversal: shard jira: ref escaped {context_dir}: {resolved}"
        )


def test_epic_shard_glob_skips_escaping_shard(tmp_path):
    """Site 4: the bare ``glob('epic-*.yaml')`` must not open an escaping shard.

    A glob match is a *name* match, so ``sprint/epic-evil.yaml -> outside`` is
    followed by the two ``open(shard)`` calls. ``safe_shards`` is the project's
    sanctioned API for exactly this enumeration.
    """
    root = tmp_path
    sprint_dir = root / "sprint"
    context_dir = sprint_dir / "context"
    context_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret_shard = outside / "secret.yaml"
    _write(
        secret_shard,
        yaml.safe_dump({"id": "42", "jira": "LEAKED-1"}, sort_keys=False),
    )
    (sprint_dir / "epic-evil.yaml").symlink_to(secret_shard)
    _write(context_dir / "context-epic-LEAKED-1.md", "should not be found this way\n")

    result = _check_context_files("42-1", str(root))

    assert result["epic_context_path"] == "", (
        "path traversal: resolved epic context via an out-of-sprint shard symlink: "
        f"{result['epic_context_path']}"
    )


def test_session_file_lookup_stays_inside_session_dirs(tmp_path):
    """Sites 1/2: ``{story_id}-session.md`` / ``{jira_key}-session.md``.

    Same CWE-22 class, different filename family. The returned path is
    ``open()``ed and parsed, and the parsed fields are rendered.
    """
    root = tmp_path
    session_dir = root / ".session"
    session_dir.mkdir()
    archive_dir = root / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "pwned-session.md"
    _write(secret, "# Story pwned: LEAKED SESSION\n")
    (session_dir / "link").symlink_to(outside, target_is_directory=True)
    (archive_dir / "link").symlink_to(outside, target_is_directory=True)

    path, _archived = _find_session_file("link/pwned", str(root))

    if path is not None:
        resolved = Path(path).resolve()
        contained = resolved.is_relative_to(session_dir.resolve()) or resolved.is_relative_to(
            archive_dir.resolve()
        )
        assert contained, f"path traversal: session path escapes both dirs: {resolved}"


def test_story_context_path_stays_inside_context_dir(escaping_context):
    """Site 6: ``context-story-{story_id}.md``."""
    root, context_dir, _secret = escaping_context
    (context_dir / "context-story-link").symlink_to(root / "outside", target_is_directory=True)

    result = _check_context_files("link/x", str(root))

    if result["has_story_context"]:
        resolved = Path(result["story_context_path"]).resolve()
        assert resolved.is_relative_to(context_dir.resolve()), (
            f"path traversal: story context path escapes {context_dir}: {resolved}"
        )


def test_benign_epic_and_story_context_still_resolve(tmp_path):
    """Preservation guard: normal context files must still be discovered."""
    root = tmp_path
    context_dir = root / "sprint" / "context"
    context_dir.mkdir(parents=True)
    _write(context_dir / "context-epic-110.md", "epic ctx\n")
    _write(context_dir / "context-story-110-2.md", "story ctx\n")

    result = _check_context_files("110-2", str(root))

    assert result["has_epic_context"] is True, result
    assert os.path.basename(result["epic_context_path"]) == "context-epic-110.md", result
    assert result["has_story_context"] is True, result
    assert os.path.basename(result["story_context_path"]) == "context-story-110-2.md", result


def test_benign_jira_keyed_epic_context_still_resolves(tmp_path):
    """Preservation guard: the shard-``jira:``-keyed context lookup must still work."""
    root = tmp_path
    sprint_dir = root / "sprint"
    context_dir = sprint_dir / "context"
    context_dir.mkdir(parents=True)
    _write(
        sprint_dir / "epic-42.yaml",
        yaml.safe_dump({"id": "42", "jira": "PROJ-77", "stories": []}, sort_keys=False),
    )
    _write(context_dir / "context-epic-PROJ-77.md", "jira-keyed ctx\n")

    result = _check_context_files("42-1", str(root))

    assert result["has_epic_context"] is True, result
    assert os.path.basename(result["epic_context_path"]) == "context-epic-PROJ-77.md", result
