"""Tests for MSSCI-14698: Version sentinel detection in prime.

Story 98-1: pf agent start (prime) compares .pennyfarthing/.installed-version
sentinel against package version. On mismatch, triggers auto-update.

Acceptance Criteria tested here:
- AC3: pf agent start (prime) compares sentinel version against package version
- AC4: On version mismatch, auto-runs pennyfarthing update --auto
- AC6: Missing sentinel file treated as version mismatch (triggers update)

(AC1, AC2, AC5 tested in TypeScript: packages/core/src/cli/commands/version-sentinel.test.ts)
"""

from pathlib import Path

# Module to be implemented
from pennyfarthing_scripts.prime.version_sentinel import (
    check_version_mismatch,
    read_sentinel_version,
)


class TestReadSentinelVersion:
    """Tests for reading the sentinel file."""

    def test_reads_version_from_sentinel_file(self, tmp_path: Path) -> None:
        """AC3: Should read version from .pennyfarthing/.installed-version."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sentinel = pf_dir / ".installed-version"
        sentinel.write_text("10.3.1\n")

        version = read_sentinel_version(tmp_path)
        assert version == "10.3.1"

    def test_returns_none_when_sentinel_missing(self, tmp_path: Path) -> None:
        """AC6: Missing sentinel file should return None."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        # No .installed-version file

        version = read_sentinel_version(tmp_path)
        assert version is None

    def test_returns_none_when_pennyfarthing_dir_missing(self, tmp_path: Path) -> None:
        """AC6: Missing .pennyfarthing/ directory should return None."""
        version = read_sentinel_version(tmp_path)
        assert version is None

    def test_trims_whitespace(self, tmp_path: Path) -> None:
        """Should handle extra whitespace in sentinel file."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sentinel = pf_dir / ".installed-version"
        sentinel.write_text("  10.3.1  \n")

        version = read_sentinel_version(tmp_path)
        assert version == "10.3.1"

    def test_returns_none_for_empty_file(self, tmp_path: Path) -> None:
        """Should return None for empty sentinel file."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sentinel = pf_dir / ".installed-version"
        sentinel.write_text("")

        version = read_sentinel_version(tmp_path)
        assert version is None


class TestCheckVersionMismatch:
    """Tests for version comparison and auto-update triggering."""

    def test_no_mismatch_when_versions_match(self, tmp_path: Path) -> None:
        """AC3: No mismatch when sentinel matches package version."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sentinel = pf_dir / ".installed-version"
        sentinel.write_text("10.3.1\n")

        result = check_version_mismatch(tmp_path, package_version="10.3.1")
        assert result.needs_update is False

    def test_mismatch_when_versions_differ(self, tmp_path: Path) -> None:
        """AC3/AC4: Mismatch when sentinel differs from package version."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sentinel = pf_dir / ".installed-version"
        sentinel.write_text("10.2.0\n")

        result = check_version_mismatch(tmp_path, package_version="10.3.1")
        assert result.needs_update is True
        assert result.installed_version == "10.2.0"
        assert result.package_version == "10.3.1"

    def test_mismatch_when_sentinel_missing(self, tmp_path: Path) -> None:
        """AC6: Missing sentinel file treated as version mismatch."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        # No sentinel file

        result = check_version_mismatch(tmp_path, package_version="10.3.1")
        assert result.needs_update is True
        assert result.installed_version is None

    def test_mismatch_when_pennyfarthing_dir_missing(self, tmp_path: Path) -> None:
        """AC6: Missing .pennyfarthing/ directory treated as mismatch."""
        result = check_version_mismatch(tmp_path, package_version="10.3.1")
        assert result.needs_update is True
        assert result.installed_version is None

    def test_result_includes_both_versions(self, tmp_path: Path) -> None:
        """Result should include both installed and package version for reporting."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sentinel = pf_dir / ".installed-version"
        sentinel.write_text("10.2.0\n")

        result = check_version_mismatch(tmp_path, package_version="10.3.1")
        assert result.installed_version == "10.2.0"
        assert result.package_version == "10.3.1"
        assert result.needs_update is True
