"""Story 153-10: XDG portrait cache refreshes on content change, not just version.

Exercises the *real* ``_install_portraits`` (previously only mocked in
``test_init_custom_agents.py``) against tmp dirs. Covers the three guard
branches the story calls out:

  1. missing / old manifest -> copies (existing behavior preserved)
  2. same version + unchanged source -> skips (idempotent, no needless copy)
  3. same version + changed source content -> re-copies

Plus: the manifest records ``source_fingerprint`` and ``--force`` re-copies
regardless of the guards.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


def _write_png(path: Path, size: int = 400) -> None:
    """Write a fake but non-LFS-pointer PNG.

    Anything over 200 bytes is treated as a real image by ``_is_lfs_pointer``,
    so the source counts as "real images" for ``_find_portraits_source``.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG" + b"\x00" * (size - 4))


@pytest.fixture
def portrait_source(tmp_path: Path) -> Path:
    """A dist_root whose personas/portraits/ holds real (non-pointer) PNGs."""
    dist_root = tmp_path / "dist"
    portraits = dist_root / "personas" / "portraits"
    _write_png(portraits / "discworld" / "dev.png")
    _write_png(portraits / "discworld" / "tea.png")
    return dist_root


@pytest.fixture
def xdg_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the XDG data dir at tmp; return the resolved portraits cache path."""
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    return tmp_path / "xdg" / "pennyfarthing" / "portraits"


# --- Guard branch 1: missing / old manifest copies -------------------------


def test_missing_manifest_copies(portrait_source: Path, xdg_cache: Path) -> None:
    """No manifest at the cache -> portraits are copied (existing behavior)."""
    from pf.init.core import _install_portraits

    result = _install_portraits(portrait_source)

    assert result["installed"] is True
    assert (xdg_cache / "discworld" / "dev.png").is_file()


def test_old_version_manifest_copies(portrait_source: Path, xdg_cache: Path) -> None:
    """A manifest pinned to an old version re-copies (existing behavior)."""
    from pf.init.core import _install_portraits

    xdg_cache.mkdir(parents=True, exist_ok=True)
    (xdg_cache / ".manifest.json").write_text(
        json.dumps({"pf_version": "0.0.0-ancient", "source_fingerprint": "stale"}) + "\n"
    )

    result = _install_portraits(portrait_source)

    assert result["installed"] is True


def test_old_manifest_without_fingerprint_recopies(
    portrait_source: Path, xdg_cache: Path
) -> None:
    """A pre-fingerprint manifest at the current version re-copies once.

    Manifests written before this story have no ``source_fingerprint``; we
    cannot prove the content matches, so we re-copy to populate it.
    """
    from pf import __version__
    from pf.init.core import _install_portraits

    xdg_cache.mkdir(parents=True, exist_ok=True)
    (xdg_cache / ".manifest.json").write_text(
        json.dumps({"pf_version": __version__, "source": "old"}) + "\n"
    )

    result = _install_portraits(portrait_source)

    assert result["installed"] is True


# --- Guard branch 2: same version + unchanged source skips ------------------


def test_unchanged_source_skips_same_version(
    portrait_source: Path, xdg_cache: Path
) -> None:
    """Second call with identical source + version is idempotent (no copy)."""
    from pf.init.core import _install_portraits

    first = _install_portraits(portrait_source)
    assert first["installed"] is True

    second = _install_portraits(portrait_source)

    assert second["installed"] is False
    assert second["source"] == "cached"


# --- Guard branch 3: same version + changed source re-copies ----------------


def test_changed_source_recopies_same_version(
    portrait_source: Path, xdg_cache: Path
) -> None:
    """Same pf version but new portrait content -> re-copy to the cache."""
    from pf.init.core import _install_portraits

    first = _install_portraits(portrait_source)
    assert first["installed"] is True

    # A new portrait lands without a version bump (the reported failure mode).
    _write_png(portrait_source / "personas" / "portraits" / "discworld" / "reviewer.png")

    second = _install_portraits(portrait_source)

    assert second["installed"] is True
    assert (xdg_cache / "discworld" / "reviewer.png").is_file()


def test_resized_portrait_recopies_same_version(
    portrait_source: Path, xdg_cache: Path
) -> None:
    """A resize (changed file size, same path) is detected as a content change."""
    from pf.init.core import _install_portraits

    first = _install_portraits(portrait_source)
    assert first["installed"] is True

    # Resize an existing portrait in place (different byte length).
    _write_png(portrait_source / "personas" / "portraits" / "discworld" / "dev.png", size=900)

    second = _install_portraits(portrait_source)

    assert second["installed"] is True


# --- Manifest records the fingerprint ---------------------------------------


def test_manifest_records_source_fingerprint(
    portrait_source: Path, xdg_cache: Path
) -> None:
    """After install the manifest carries a non-empty source_fingerprint."""
    from pf.init.core import _install_portraits

    _install_portraits(portrait_source)

    manifest = json.loads((xdg_cache / ".manifest.json").read_text())
    assert isinstance(manifest.get("source_fingerprint"), str)
    assert manifest["source_fingerprint"]


# --- Escape hatch: force re-copy --------------------------------------------


def test_force_recopies_when_unchanged(
    portrait_source: Path, xdg_cache: Path
) -> None:
    """force=True re-copies even when version + fingerprint both match."""
    from pf.init.core import _install_portraits

    first = _install_portraits(portrait_source)
    assert first["installed"] is True

    forced = _install_portraits(portrait_source, force=True)

    assert forced["installed"] is True


# --- CLI escape hatch: pf init --force-portraits ----------------------------


def test_cli_force_portraits_flag_reaches_init_project(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``pf init --force-portraits`` threads force_portraits=True to init_project."""
    from unittest.mock import patch

    from click.testing import CliRunner

    from pf.init.cli import init

    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))

    captured: dict = {}

    def fake_init_project(**kwargs: object) -> dict:
        captured.update(kwargs)
        return {"success": True, "data": {"dogfooding": True, "directories_created": 0}}

    with patch("pf.init.core.init_project", side_effect=fake_init_project):
        with patch("pf.init.core.preview_hook_changes", return_value={"has_changes": False, "is_new": True}):
            with patch("pf.common.config.get_dist_root", return_value=tmp_path):
                result = CliRunner().invoke(init, ["--force-portraits", str(tmp_path)])

    assert result.exit_code == 0, result.output
    assert captured.get("force_portraits") is True


def test_init_project_threads_force_portraits_to_installer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """init_project(force_portraits=True) calls _install_portraits with force=True."""
    from unittest.mock import patch

    from pf.init.core import init_project

    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))

    target_dir = tmp_path / "proj"
    target_dir.mkdir()
    dist_root = tmp_path / "dist"
    dist_root.mkdir()

    with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "1.0.0", "install_method": "pipx", "path": "/usr/bin/pf"}):
        with patch("pf.init.core._install_portraits", return_value={"installed": False}) as install_mock:
            with patch("pf.init.core._symlink_portraits", return_value=True):
                with patch("pf.init.setup.run_setup", return_value={"success": True, "data": {}}):
                    init_project(target_dir=target_dir, dist_root=dist_root, force_portraits=True)

    assert install_mock.called
    _, kwargs = install_mock.call_args
    assert kwargs.get("force") is True
