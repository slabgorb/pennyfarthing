"""Tests for consumer gate extensions.

Tests resolve_gate_extensions() from gate_file.py and
merge_gate_results() from gate_runner.py.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.handoff.gate_file import resolve_gate_extensions
from pf.handoff.gate_runner import merge_gate_results
from pf.handoff.resolve_gate import resolve_gate


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Minimal project with .pennyfarthing/ and gates."""
    (tmp_path / ".pennyfarthing" / "gates").mkdir(parents=True)
    (tmp_path / "pennyfarthing-dist" / "gates").mkdir(parents=True)
    return tmp_path


def _write_gate(path: Path, name: str) -> None:
    path.write_text(
        f'<gate name="{name}" model="haiku">\n'
        f"  <purpose>Test gate {name}</purpose>\n"
        f"  <pass>Pass</pass>\n"
        f"  <fail>Fail</fail>\n"
        f"</gate>\n"
    )


def _write_config(project: Path, config: dict) -> None:
    config_path = project / ".pennyfarthing" / "config.local.yaml"
    config_path.write_text(yaml.dump(config))


# ===========================================================================
# resolve_gate_extensions
# ===========================================================================


class TestResolveGateExtensionsNoConfig:
    """Returns empty list when no extensions configured."""

    def test_no_config_file(self, project: Path) -> None:
        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is True
        assert result["data"] == []
        assert result["error"] is None

    def test_empty_gates_section(self, project: Path) -> None:
        _write_config(project, {"gates": {}})
        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is True
        assert result["data"] == []

    def test_no_extensions_for_gate(self, project: Path) -> None:
        _write_config(project, {"gates": {"extensions": {"other-gate": ["foo"]}}})
        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is True
        assert result["data"] == []


class TestResolveGateExtensionsFound:
    """Returns resolved refs when extensions exist."""

    def test_single_extension(self, project: Path) -> None:
        _write_gate(project / ".pennyfarthing" / "gates" / "rustfmt-check.md", "rustfmt-check")
        _write_config(project, {"gates": {"extensions": {"dev-exit": ["rustfmt-check"]}}})

        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is True
        assert result["data"] == ["gates/rustfmt-check"]

    def test_multiple_extensions(self, project: Path) -> None:
        _write_gate(project / ".pennyfarthing" / "gates" / "rustfmt-check.md", "rustfmt-check")
        _write_gate(project / ".pennyfarthing" / "gates" / "license-check.md", "license-check")
        _write_config(project, {
            "gates": {"extensions": {"dev-exit": ["rustfmt-check", "license-check"]}}
        })

        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is True
        assert result["data"] == ["gates/rustfmt-check", "gates/license-check"]

    def test_extension_in_dist(self, project: Path) -> None:
        """Extension gate found in pennyfarthing-dist/gates/ fallback."""
        _write_gate(project / "pennyfarthing-dist" / "gates" / "shared-check.md", "shared-check")
        _write_config(project, {"gates": {"extensions": {"dev-exit": ["shared-check"]}}})

        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is True
        assert result["data"] == ["gates/shared-check"]


class TestResolveGateExtensionsNotFound:
    """Fails fast when extension file is missing."""

    def test_missing_extension_file(self, project: Path) -> None:
        _write_config(project, {"gates": {"extensions": {"dev-exit": ["nonexistent"]}}})

        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is False
        assert "nonexistent" in result["error"]
        assert result["data"] == []

    def test_partial_missing_fails_fast(self, project: Path) -> None:
        """First valid, second missing — should fail on second."""
        _write_gate(project / ".pennyfarthing" / "gates" / "good-check.md", "good-check")
        _write_config(project, {
            "gates": {"extensions": {"dev-exit": ["good-check", "missing-check"]}}
        })

        result = resolve_gate_extensions("dev-exit", project_root=project)
        assert result["success"] is False
        assert "missing-check" in result["error"]


# ===========================================================================
# merge_gate_results
# ===========================================================================


class TestMergeGateResults:
    """AND semantics: both must pass for combined pass."""

    def test_both_pass(self) -> None:
        primary = {"status": "pass", "message": "Tests pass", "checks": [
            {"name": "tests", "status": "pass", "detail": "ok"}
        ]}
        extension = {"status": "pass", "message": "Fmt ok", "checks": [
            {"name": "rustfmt", "status": "pass", "detail": "clean"}
        ]}
        result = merge_gate_results(primary, extension)
        assert result["status"] == "pass"
        assert len(result["checks"]) == 2
        assert "Tests pass" in result["message"]
        assert "Fmt ok" in result["message"]

    def test_primary_fail(self) -> None:
        primary = {"status": "fail", "message": "Tests fail", "checks": []}
        extension = {"status": "pass", "message": "Fmt ok", "checks": []}
        result = merge_gate_results(primary, extension)
        assert result["status"] == "fail"

    def test_extension_fail(self) -> None:
        primary = {"status": "pass", "message": "Tests pass", "checks": []}
        extension = {"status": "fail", "message": "Fmt fail", "checks": []}
        result = merge_gate_results(primary, extension)
        assert result["status"] == "fail"

    def test_both_fail(self) -> None:
        primary = {"status": "fail", "message": "A", "checks": []}
        extension = {"status": "fail", "message": "B", "checks": []}
        result = merge_gate_results(primary, extension)
        assert result["status"] == "fail"

    def test_checks_concatenated(self) -> None:
        primary = {"status": "pass", "message": "A", "checks": [
            {"name": "a", "status": "pass", "detail": "1"},
            {"name": "b", "status": "pass", "detail": "2"},
        ]}
        extension = {"status": "pass", "message": "B", "checks": [
            {"name": "c", "status": "pass", "detail": "3"},
        ]}
        result = merge_gate_results(primary, extension)
        assert len(result["checks"]) == 3
        assert [c["name"] for c in result["checks"]] == ["a", "b", "c"]

    def test_recovery_merged(self) -> None:
        primary = {"status": "fail", "message": "A", "checks": [],
                    "recovery": ["fix A"]}
        extension = {"status": "fail", "message": "B", "checks": [],
                     "recovery": ["fix B"]}
        result = merge_gate_results(primary, extension)
        assert result["recovery"] == ["fix A", "fix B"]

    def test_no_recovery_when_passing(self) -> None:
        primary = {"status": "pass", "message": "A", "checks": []}
        extension = {"status": "pass", "message": "B", "checks": []}
        result = merge_gate_results(primary, extension)
        assert "recovery" not in result

    def test_empty_checks(self) -> None:
        primary = {"status": "pass", "message": "A", "checks": []}
        extension = {"status": "pass", "message": "B", "checks": []}
        result = merge_gate_results(primary, extension)
        assert result["checks"] == []


# ===========================================================================
# resolve_gate integration — gate_extensions in RESOLVE_RESULT
# ===========================================================================


class TestResolveGateWithExtensions:
    """resolve_gate() includes gate_extensions when configured."""

    def _make_workflow(self, project: Path) -> None:
        wf_dir = project / ".pennyfarthing" / "workflows"
        wf_dir.mkdir(parents=True, exist_ok=True)
        wf = {
            "workflow": {
                "name": "test-wf",
                "phases": [
                    {"name": "implement", "agent": "dev", "gate": {
                        "file": "gates/dev-exit", "type": "dev_exit",
                    }},
                    {"name": "review", "agent": "reviewer"},
                ],
            }
        }
        (wf_dir / "test-wf.yaml").write_text(yaml.dump(wf))

    def test_no_extensions_returns_none(self, project: Path) -> None:
        self._make_workflow(project)
        _write_gate(project / ".pennyfarthing" / "gates" / "dev-exit.md", "dev-exit")

        result = resolve_gate("test-1", "test-wf", "implement", project_root=project)
        assert result["status"] == "ready"
        assert result["gate_extensions"] is None

    def test_with_extensions(self, project: Path) -> None:
        self._make_workflow(project)
        _write_gate(project / ".pennyfarthing" / "gates" / "dev-exit.md", "dev-exit")
        _write_gate(project / ".pennyfarthing" / "gates" / "rustfmt-check.md", "rustfmt-check")
        _write_config(project, {"gates": {"extensions": {"dev-exit": ["rustfmt-check"]}}})

        result = resolve_gate("test-1", "test-wf", "implement", project_root=project)
        assert result["status"] == "ready"
        assert result["gate_extensions"] == ["gates/rustfmt-check"]

    def test_missing_extension_returns_error(self, project: Path) -> None:
        self._make_workflow(project)
        _write_gate(project / ".pennyfarthing" / "gates" / "dev-exit.md", "dev-exit")
        _write_config(project, {"gates": {"extensions": {"dev-exit": ["nonexistent"]}}})

        result = resolve_gate("test-1", "test-wf", "implement", project_root=project)
        assert result["status"] == "error"
        assert "nonexistent" in result["error"]
