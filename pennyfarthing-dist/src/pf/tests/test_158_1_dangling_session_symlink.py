"""Tests for register_session on a dangling .session symlink — Story 158-1 (gh #63).

RED phase: reproduce the crash and pin the expected post-fix behavior.

Story context (P1 framework reliability):
  `pf agent start <agent>` hard-crashes when `.session` is a symlink whose
  target directory does not exist (a dangling symlink). A fresh clone/worktree
  carries the `.session -> sprint/.session` symlink but not the target dir.

  Root cause: `register_session` in `pf/prime/session.py` calls
    agents_dir.mkdir(parents=True, exist_ok=True)
  on `.session/agents`. Because `.session` is a broken symlink (not a real
  dir), `mkdir(parents=True)` tries to create the parent `.session`, which
  "exists" as a dangling link. `exist_ok=True` re-raises because the dangling
  link is not a directory -> FileExistsError [Errno 17], surfaced as a raw
  Python traceback instead of an actionable result.

Expected behavior (Dev implements GREEN):
  register_session resolves the symlink target before creating the directory
  (or otherwise handles the dangling link), so the call succeeds, the agents
  dir is created at the *resolved* target (sprint/.session/agents), and the
  `.session` symlink is left intact (not shadowed by a real directory).

These tests assert the post-fix contract. The dangling-symlink tests FAIL
today (FileExistsError); the happy-path / existing-target tests are regression
guards that already pass and must keep passing (AC4).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.prime.session import register_session

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_dangling_session_symlink(root: Path) -> Path:
    """Create `.session -> sprint/.session` where the target dir is missing.

    Mirrors a fresh checkout/worktree: the symlink is committed but its target
    directory `sprint/.session/` does not exist yet -> dangling symlink.
    """
    (root / "sprint").mkdir()
    link = root / ".session"
    # Relative target, exactly like the repo's committed symlink.
    link.symlink_to(Path("sprint") / ".session")
    # Sanity: it is a symlink, and it is dangling (target does not resolve).
    assert link.is_symlink(), "fixture must create a symlink"
    assert not link.exists(), "fixture target must be missing (dangling link)"
    return link


# ---------------------------------------------------------------------------
# AC1 / AC3: dangling symlink must not crash with a traceback
# ---------------------------------------------------------------------------


def test_register_session_dangling_symlink_does_not_raise(tmp_path: Path) -> None:
    """AC1/AC3: register_session succeeds on a dangling `.session` symlink.

    Today this raises FileExistsError [Errno 17] from the mkdir on line ~73.
    """
    _make_dangling_session_symlink(tmp_path)

    result = register_session("dev", session_id="abc-123", project_root=tmp_path)

    assert result.session_id == "abc-123"
    assert result.agent_name == "dev"


def test_register_session_dangling_symlink_no_file_exists_error(tmp_path: Path) -> None:
    """AC3: the specific FileExistsError regression must not resurface.

    A targeted negative assertion so a future refactor that reintroduces the
    bare `mkdir(parents=True, exist_ok=True)` on the dangling parent is caught.
    """
    _make_dangling_session_symlink(tmp_path)

    try:
        register_session("tea", session_id="no-crash", project_root=tmp_path)
    except FileExistsError as exc:  # pragma: no cover - this is the bug we forbid
        pytest.fail(f"register_session raised FileExistsError on dangling symlink: {exc}")


# ---------------------------------------------------------------------------
# AC2: directory is created at the resolved target, symlink left intact
# ---------------------------------------------------------------------------


def test_register_session_dangling_symlink_creates_resolved_target(tmp_path: Path) -> None:
    """AC2: agents dir lands at sprint/.session/agents, reachable via the link."""
    _make_dangling_session_symlink(tmp_path)

    register_session("dev", session_id="s1", project_root=tmp_path)

    # The real directory must exist at the symlink's resolved target.
    target_agents = tmp_path / "sprint" / ".session" / "agents"
    assert target_agents.is_dir(), "agents dir must be created at the resolved target"

    # And the session file must be readable through the symlink path.
    via_link = tmp_path / ".session" / "agents" / "s1"
    assert via_link.exists()
    assert via_link.read_text() == "dev"


def test_register_session_dangling_symlink_not_shadowed(tmp_path: Path) -> None:
    """AC2: `.session` must stay a symlink, not be replaced by a real directory.

    The fix must create the *target*, never a literal `.session/agents` that
    shadows the link (which would diverge from `sprint/.session`).
    """
    link = _make_dangling_session_symlink(tmp_path)

    register_session("dev", session_id="s2", project_root=tmp_path)

    assert link.is_symlink(), ".session must remain a symlink after register_session"
    # The link must now resolve (target was created), not stay dangling.
    assert link.exists(), ".session symlink target should exist after the fix"


# ---------------------------------------------------------------------------
# AC4: existing behavior is unchanged (regression guards — already green)
# ---------------------------------------------------------------------------


def test_register_session_real_session_dir_unchanged(tmp_path: Path) -> None:
    """AC4: with no symlink, a real `.session` dir is created on demand."""
    result = register_session("dev", session_id="real-1", project_root=tmp_path)

    assert result.agent_name == "dev"
    session_file = tmp_path / ".session" / "agents" / "real-1"
    assert session_file.exists()
    assert session_file.read_text() == "dev"
    # No symlink involved: this is a real directory.
    assert not (tmp_path / ".session").is_symlink()


def test_register_session_symlink_to_existing_target_unchanged(tmp_path: Path) -> None:
    """AC4: a `.session` symlink to an *existing* dir keeps working.

    Guards against the fix accidentally breaking the already-bootstrapped case.
    """
    (tmp_path / "sprint" / ".session").mkdir(parents=True)
    link = tmp_path / ".session"
    link.symlink_to(Path("sprint") / ".session")
    assert link.exists(), "fixture target must exist (non-dangling link)"

    register_session("tea", session_id="ok-1", project_root=tmp_path)

    assert link.is_symlink()
    target_file = tmp_path / "sprint" / ".session" / "agents" / "ok-1"
    assert target_file.read_text() == "tea"
