"""Tests for gate file discovery and resolution — Story 106-4.

Epic: 106 (Gate Files & First Migration)
Story: 106-4 — Gate file discovery and resolution

Tests the resolve_gate_file() function that locates gate definition files
using a priority-based discovery algorithm.

Acceptance Criteria:
- [AC1] resolve_gate_file() resolves gate names to file paths
- [AC2] Resolution order: .pennyfarthing/gates/{name}.md → pennyfarthing-dist/gates/{name}.md
- [AC3] Non-existent gate file returns error/blocked status
- [AC5] Tests cover: found in local, found in built-in, not found, symlink resolution
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.handoff.gate_file import resolve_gate_file

# ---------------------------------------------------------------------------
# Fixtures: Project structure
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create a minimal project structure with .pennyfarthing/ and gates."""
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".pennyfarthing" / "gates").mkdir()
    (tmp_path / "pennyfarthing-dist" / "gates").mkdir(parents=True)
    return tmp_path


@pytest.fixture
def project_with_builtin_gate(project: Path) -> Path:
    """Project with a gate file in pennyfarthing-dist/gates/ only."""
    gate = project / "pennyfarthing-dist" / "gates" / "tests-pass.md"
    gate.write_text(
        '<gate name="tests-pass" model="haiku">\n'
        "  <purpose>Verify tests pass</purpose>\n"
        "  <pass>Check tests</pass>\n"
        "  <fail>Report failures</fail>\n"
        "</gate>\n"
    )
    return project


@pytest.fixture
def project_with_local_gate(project: Path) -> Path:
    """Project with a gate file in .pennyfarthing/gates/ only."""
    gate = project / ".pennyfarthing" / "gates" / "custom-gate.md"
    gate.write_text(
        '<gate name="custom-gate" model="haiku">\n'
        "  <purpose>Custom project gate</purpose>\n"
        "  <pass>Custom pass</pass>\n"
        "  <fail>Custom fail</fail>\n"
        "</gate>\n"
    )
    return project


@pytest.fixture
def project_with_both_gates(project: Path) -> Path:
    """Project with same gate in both locations (local should win)."""
    # Built-in version
    builtin = project / "pennyfarthing-dist" / "gates" / "tests-pass.md"
    builtin.write_text(
        '<gate name="tests-pass" model="haiku">\n'
        "  <purpose>Built-in version</purpose>\n"
        "  <pass>Built-in pass</pass>\n"
        "  <fail>Built-in fail</fail>\n"
        "</gate>\n"
    )
    # Local override
    local = project / ".pennyfarthing" / "gates" / "tests-pass.md"
    local.write_text(
        '<gate name="tests-pass" model="haiku">\n'
        "  <purpose>Local override version</purpose>\n"
        "  <pass>Local pass</pass>\n"
        "  <fail>Local fail</fail>\n"
        "</gate>\n"
    )
    return project


@pytest.fixture
def project_with_symlinked_gates(project: Path) -> Path:
    """Project where .pennyfarthing/gates is a symlink to pennyfarthing-dist/gates."""
    import shutil

    # Remove the real .pennyfarthing/gates dir
    shutil.rmtree(project / ".pennyfarthing" / "gates")
    # Create symlink (mimics real install)
    (project / ".pennyfarthing" / "gates").symlink_to(
        project / "pennyfarthing-dist" / "gates"
    )
    # Add a gate file to the source
    gate = project / "pennyfarthing-dist" / "gates" / "tests-pass.md"
    gate.write_text(
        '<gate name="tests-pass" model="haiku">\n'
        "  <purpose>Symlinked gate</purpose>\n"
        "  <pass>Check tests</pass>\n"
        "  <fail>Report failures</fail>\n"
        "</gate>\n"
    )
    return project


# ===========================================================================
# AC1: resolve_gate_file() resolves gate names to file paths
# ===========================================================================


class TestResolveGateFileFound:
    """AC1: Function returns path when gate file exists."""

    def test_returns_found_status(
        self, project_with_builtin_gate: Path
    ) -> None:
        """AC1: Status should be 'found' when gate file exists."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        assert result["status"] == "found"

    def test_returns_absolute_path(
        self, project_with_builtin_gate: Path
    ) -> None:
        """AC1: Path should be an absolute path string."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        assert result["path"] is not None
        assert Path(result["path"]).is_absolute()

    def test_path_points_to_existing_file(
        self, project_with_builtin_gate: Path
    ) -> None:
        """AC1: Returned path should point to an actual file."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        assert Path(result["path"]).is_file()

    def test_error_is_none_when_found(
        self, project_with_builtin_gate: Path
    ) -> None:
        """AC1: Error field should be None when gate is found."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        assert result["error"] is None

    def test_strips_gates_prefix(
        self, project_with_builtin_gate: Path
    ) -> None:
        """AC1: 'gates/tests-pass' and 'tests-pass' should resolve the same."""
        result_bare = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        result_prefixed = resolve_gate_file(
            "gates/tests-pass", project_root=project_with_builtin_gate
        )
        assert result_bare["path"] == result_prefixed["path"]

    def test_result_has_required_fields(
        self, project_with_builtin_gate: Path
    ) -> None:
        """AC1: Result dict must have status, path, error keys."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        assert "status" in result
        assert "path" in result
        assert "error" in result


# ===========================================================================
# AC2: Resolution order — local first, built-in fallback
# ===========================================================================


class TestResolveGateFileOrder:
    """AC2: .pennyfarthing/gates/ takes priority over pennyfarthing-dist/gates/."""

    def test_local_gate_found(self, project_with_local_gate: Path) -> None:
        """AC2: Gate in .pennyfarthing/gates/ should be found."""
        result = resolve_gate_file(
            "custom-gate", project_root=project_with_local_gate
        )
        assert result["status"] == "found"
        assert ".pennyfarthing/gates/custom-gate.md" in result["path"]

    def test_builtin_gate_found_as_fallback(
        self, project_with_builtin_gate: Path
    ) -> None:
        """AC2: Gate in pennyfarthing-dist/gates/ found when not in local."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        assert result["status"] == "found"
        assert "pennyfarthing-dist/gates/tests-pass.md" in result["path"]

    def test_local_overrides_builtin(
        self, project_with_both_gates: Path
    ) -> None:
        """AC2: When same gate exists in both, local wins."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_both_gates
        )
        assert result["status"] == "found"
        # Path should be the .pennyfarthing/gates/ version, not pennyfarthing-dist/
        assert ".pennyfarthing/gates/tests-pass.md" in result["path"]

    def test_local_override_content_is_local_version(
        self, project_with_both_gates: Path
    ) -> None:
        """AC2: Content at resolved path should be the local version."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_both_gates
        )
        content = Path(result["path"]).read_text()
        assert "Local override version" in content


# ===========================================================================
# AC3: Non-existent gate file returns error/blocked
# ===========================================================================


class TestResolveGateFileNotFound:
    """AC3: Missing gate files return error status."""

    def test_missing_gate_returns_not_found(self, project: Path) -> None:
        """AC3: Non-existent gate → status: not_found."""
        result = resolve_gate_file("nonexistent-gate", project_root=project)
        assert result["status"] == "not_found"

    def test_missing_gate_path_is_none(self, project: Path) -> None:
        """AC3: Non-existent gate → path: None."""
        result = resolve_gate_file("nonexistent-gate", project_root=project)
        assert result["path"] is None

    def test_missing_gate_has_error_message(self, project: Path) -> None:
        """AC3: Non-existent gate → error message present."""
        result = resolve_gate_file("nonexistent-gate", project_root=project)
        assert result["error"] is not None
        assert len(result["error"]) > 0

    def test_empty_gate_name_returns_not_found(self, project: Path) -> None:
        """AC3: Empty string gate name → not_found."""
        result = resolve_gate_file("", project_root=project)
        assert result["status"] == "not_found"

    def test_missing_gates_directory_returns_not_found(
        self, tmp_path: Path
    ) -> None:
        """AC3: No gates/ directories at all → not_found (no crash)."""
        # Project with .pennyfarthing but no gates subdirectory
        # Use a name that doesn't exist in the bundled fallback either
        (tmp_path / ".pennyfarthing").mkdir()
        result = resolve_gate_file("nonexistent-gate-xyz-abc", project_root=tmp_path)
        assert result["status"] == "not_found"


# ===========================================================================
# AC5: Symlink resolution
# ===========================================================================


class TestResolveGateFileSymlink:
    """AC5: Gate files found through symlinked .pennyfarthing/gates/."""

    def test_symlinked_gate_found(
        self, project_with_symlinked_gates: Path
    ) -> None:
        """AC5: Gate found through .pennyfarthing/gates/ symlink."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_symlinked_gates
        )
        assert result["status"] == "found"

    def test_symlinked_gate_path_is_valid(
        self, project_with_symlinked_gates: Path
    ) -> None:
        """AC5: Path through symlink points to real file."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_symlinked_gates
        )
        assert result["path"] is not None
        assert Path(result["path"]).exists()

    def test_symlinked_gate_content_readable(
        self, project_with_symlinked_gates: Path
    ) -> None:
        """AC5: Content at symlinked path is the actual gate file."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_symlinked_gates
        )
        content = Path(result["path"]).read_text()
        assert "Symlinked gate" in content


# ===========================================================================
# Edge cases
# ===========================================================================


class TestResolveGateFileEdgeCases:
    """Edge cases and boundary conditions."""

    def test_gate_name_with_md_extension_still_works(
        self, project_with_builtin_gate: Path
    ) -> None:
        """Edge: 'tests-pass.md' should resolve same as 'tests-pass'."""
        result = resolve_gate_file(
            "tests-pass.md", project_root=project_with_builtin_gate
        )
        assert result["status"] == "found"

    def test_gate_name_with_nested_path_rejected(
        self, project_with_builtin_gate: Path
    ) -> None:
        """Edge: '../escape/tests-pass' should not resolve (path traversal)."""
        result = resolve_gate_file(
            "../escape/tests-pass",
            project_root=project_with_builtin_gate,
        )
        assert result["status"] == "not_found"

    def test_result_status_is_valid_enum(
        self, project_with_builtin_gate: Path
    ) -> None:
        """Edge: Status must be one of the expected values."""
        result = resolve_gate_file(
            "tests-pass", project_root=project_with_builtin_gate
        )
        assert result["status"] in ("found", "not_found")
