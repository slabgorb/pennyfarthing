"""Tests for gate strictness profiles.

Story 150-18: Gate strictness profiles — workflow.strictness setting
for strict/standard/minimal enforcement levels.

Acceptance Criteria:
1. workflow.strictness accepts strict/standard/minimal values
2. Each gate declares a strictness_level (critical/standard/advisory)
3. Phase progression varies by profile (block/warn/info)
4. config.local.yaml has workflow.strictness entry (default: standard)
5. TUI integration (settings panel) — deferred to UI layer
6. Gate YAML schema validates strictness_level field
7. Backward compat — gates without strictness_level default to standard
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    """Create a minimal project with config directory."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    return tmp_path


@pytest.fixture()
def gate_file_critical(tmp_path: Path) -> Path:
    """Gate file with strictness_level='critical'."""
    gates_dir = tmp_path / ".pennyfarthing" / "gates"
    gates_dir.mkdir(parents=True)
    gate = gates_dir / "spec-check.md"
    gate.write_text(
        '<gate name="spec-check" model="haiku" strictness_level="critical">\n'
        "<purpose>Validate spec alignment</purpose>\n"
        "<pass>GATE_RESULT:\n  status: pass\n  message: Spec aligned</pass>\n"
        "<fail>GATE_RESULT:\n  status: fail\n  message: Spec drift</fail>\n"
        "</gate>\n"
    )
    return gate


@pytest.fixture()
def gate_file_standard(tmp_path: Path) -> Path:
    """Gate file with strictness_level='standard'."""
    gates_dir = tmp_path / ".pennyfarthing" / "gates"
    gates_dir.mkdir(parents=True, exist_ok=True)
    gate = gates_dir / "dev-exit.md"
    gate.write_text(
        '<gate name="dev-exit" model="haiku" strictness_level="standard">\n'
        "<purpose>Dev exit checks</purpose>\n"
        "<pass>GATE_RESULT:\n  status: pass\n  message: Dev checks passed</pass>\n"
        "<fail>GATE_RESULT:\n  status: fail\n  message: Dev checks failed</fail>\n"
        "</gate>\n"
    )
    return gate


@pytest.fixture()
def gate_file_advisory(tmp_path: Path) -> Path:
    """Gate file with strictness_level='advisory'."""
    gates_dir = tmp_path / ".pennyfarthing" / "gates"
    gates_dir.mkdir(parents=True, exist_ok=True)
    gate = gates_dir / "quality-pass.md"
    gate.write_text(
        '<gate name="quality-pass" model="haiku" strictness_level="advisory">\n'
        "<purpose>Quality checks</purpose>\n"
        "<pass>GATE_RESULT:\n  status: pass\n  message: Quality good</pass>\n"
        "<fail>GATE_RESULT:\n  status: fail\n  message: Quality issues</fail>\n"
        "</gate>\n"
    )
    return gate


@pytest.fixture()
def gate_file_no_strictness(tmp_path: Path) -> Path:
    """Gate file WITHOUT strictness_level (backward compat)."""
    gates_dir = tmp_path / ".pennyfarthing" / "gates"
    gates_dir.mkdir(parents=True, exist_ok=True)
    gate = gates_dir / "tests-pass.md"
    gate.write_text(
        '<gate name="tests-pass" model="haiku">\n'
        "<purpose>Verify tests pass</purpose>\n"
        "<pass>GATE_RESULT:\n  status: pass\n  message: Tests green</pass>\n"
        "<fail>GATE_RESULT:\n  status: fail\n  message: Tests red</fail>\n"
        "</gate>\n"
    )
    return gate


# ---------------------------------------------------------------------------
# AC1: workflow.strictness accepts strict/standard/minimal
# ---------------------------------------------------------------------------


class TestStrictnessConfig:
    """AC1: workflow.strictness field in settings."""

    def test_strictness_in_defaults(self) -> None:
        """DEFAULTS dict must include workflow.strictness with default 'standard'."""
        from pf.settings.settings import DEFAULTS

        workflow = DEFAULTS.get("workflow", {})
        assert "strictness" in workflow, (
            "workflow.strictness must be in DEFAULTS"
        )
        assert workflow["strictness"] == "standard"

    def test_get_strictness_returns_default(self, project_root: Path) -> None:
        """When not configured, get_setting should return 'standard'."""
        from pf.settings.settings import get_setting

        with patch("pf.settings.settings.get_project_root", return_value=project_root):
            result = get_setting("workflow.strictness")
        assert result == "standard"

    def test_set_strictness_strict(self, project_root: Path) -> None:
        """Setting workflow.strictness to 'strict' should succeed."""
        from pf.settings.settings import set_setting

        with patch("pf.settings.settings.get_project_root", return_value=project_root):
            result = set_setting("workflow.strictness", "strict")
        assert result.get("success") is True or result is None  # set_setting may return None on success

    def test_set_strictness_minimal(self, project_root: Path) -> None:
        """Setting workflow.strictness to 'minimal' should succeed."""
        from pf.settings.settings import set_setting

        with patch("pf.settings.settings.get_project_root", return_value=project_root):
            result = set_setting("workflow.strictness", "minimal")
        assert result.get("success") is True or result is None

    def test_reject_invalid_strictness(self, project_root: Path) -> None:
        """Setting workflow.strictness to an invalid value should fail validation."""
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.strictness", "extreme")
        assert result.valid is False, (
            "workflow.strictness should reject values outside strict/standard/minimal"
        )


# ---------------------------------------------------------------------------
# AC2: Gate compliance mapping — strictness_level attribute
# ---------------------------------------------------------------------------


class TestGateStrictnessLevel:
    """AC2: Each gate declares a strictness_level."""

    def test_parse_gate_extracts_strictness_level(
        self, gate_file_critical: Path
    ) -> None:
        """parse_gate_file must extract strictness_level from <gate> tag."""
        from pf.handoff.gate_runner import parse_gate_file

        result = parse_gate_file(gate_file_critical)
        assert result["status"] == "ok"
        assert result.get("strictness_level") == "critical"

    def test_parse_gate_standard_level(self, gate_file_standard: Path) -> None:
        """Gate with strictness_level='standard' is extracted correctly."""
        from pf.handoff.gate_runner import parse_gate_file

        result = parse_gate_file(gate_file_standard)
        assert result["status"] == "ok"
        assert result.get("strictness_level") == "standard"

    def test_parse_gate_advisory_level(self, gate_file_advisory: Path) -> None:
        """Gate with strictness_level='advisory' is extracted correctly."""
        from pf.handoff.gate_runner import parse_gate_file

        result = parse_gate_file(gate_file_advisory)
        assert result["status"] == "ok"
        assert result.get("strictness_level") == "advisory"


# ---------------------------------------------------------------------------
# AC3: Phase progression under different profiles
# ---------------------------------------------------------------------------


class TestStrictnessEnforcement:
    """AC3: Strictness profile determines block/warn/info behavior."""

    def test_critical_gate_blocks_in_strict(self) -> None:
        """Critical gate failure MUST block in strict profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Spec drift", "checks": []}
        enforced = apply_strictness_profile(gate_result, "critical", "strict")
        assert enforced["enforcement"] == "block"

    def test_critical_gate_blocks_in_standard(self) -> None:
        """Critical gate failure MUST block in standard profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Spec drift", "checks": []}
        enforced = apply_strictness_profile(gate_result, "critical", "standard")
        assert enforced["enforcement"] == "block"

    def test_critical_gate_blocks_in_minimal(self) -> None:
        """Critical gate failure MUST block even in minimal profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Spec drift", "checks": []}
        enforced = apply_strictness_profile(gate_result, "critical", "minimal")
        assert enforced["enforcement"] == "block"

    def test_standard_gate_blocks_in_strict(self) -> None:
        """Standard gate failure blocks in strict profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Dev checks failed", "checks": []}
        enforced = apply_strictness_profile(gate_result, "standard", "strict")
        assert enforced["enforcement"] == "block"

    def test_standard_gate_blocks_in_standard(self) -> None:
        """Standard gate failure blocks in standard profile (per AC2)."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Dev checks failed", "checks": []}
        enforced = apply_strictness_profile(gate_result, "standard", "standard")
        assert enforced["enforcement"] == "block"

    def test_standard_gate_warns_in_minimal(self) -> None:
        """Standard gate failure only warns in minimal profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Dev checks failed", "checks": []}
        enforced = apply_strictness_profile(gate_result, "standard", "minimal")
        assert enforced["enforcement"] == "warn"

    def test_advisory_gate_warns_in_strict(self) -> None:
        """Advisory gate failure warns (not blocks) even in strict profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Quality issues", "checks": []}
        enforced = apply_strictness_profile(gate_result, "advisory", "strict")
        assert enforced["enforcement"] == "warn"

    def test_advisory_gate_warns_in_standard(self) -> None:
        """Advisory gate failure warns in standard profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Quality issues", "checks": []}
        enforced = apply_strictness_profile(gate_result, "advisory", "standard")
        assert enforced["enforcement"] == "warn"

    def test_advisory_gate_info_in_minimal(self) -> None:
        """Advisory gate failure is info-only in minimal profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Quality issues", "checks": []}
        enforced = apply_strictness_profile(gate_result, "advisory", "minimal")
        assert enforced["enforcement"] == "info"

    def test_passing_gate_always_passes(self) -> None:
        """A passing gate should not be downgraded regardless of profile."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "pass", "message": "All good", "checks": []}
        for profile in ("strict", "standard", "minimal"):
            enforced = apply_strictness_profile(gate_result, "standard", profile)
            assert enforced["enforcement"] == "pass", (
                f"Passing gate should remain pass in {profile} profile"
            )

    def test_result_preserves_original_fields(self) -> None:
        """apply_strictness_profile must preserve original gate_result fields."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {
            "status": "fail",
            "message": "Something failed",
            "checks": [{"name": "check1", "status": "fail", "detail": "bad"}],
        }
        enforced = apply_strictness_profile(gate_result, "standard", "minimal")
        assert enforced["status"] == "fail"
        assert enforced["message"] == "Something failed"
        assert len(enforced["checks"]) == 1


# ---------------------------------------------------------------------------
# AC4: Configuration interface — config.local.yaml
# ---------------------------------------------------------------------------


class TestConfigInterface:
    """AC4: workflow.strictness in config.local.yaml."""

    def test_strictness_readable_via_get_setting(self, project_root: Path) -> None:
        """workflow.strictness must be readable via pf settings get."""
        from pf.settings.settings import get_setting

        with patch("pf.settings.settings.get_project_root", return_value=project_root):
            value = get_setting("workflow.strictness")
        assert value in ("strict", "standard", "minimal")

    def test_strictness_writable_and_persisted(self, project_root: Path) -> None:
        """Writing workflow.strictness should persist to config file."""
        import yaml

        from pf.settings.settings import get_setting, set_setting

        config_file = project_root / ".pennyfarthing" / "config.local.yaml"

        with patch("pf.settings.settings.get_project_root", return_value=project_root):
            set_setting("workflow.strictness", "strict")
            value = get_setting("workflow.strictness")

        assert value == "strict"

        # Verify it's actually in the YAML file
        if config_file.exists():
            data = yaml.safe_load(config_file.read_text()) or {}
            assert data.get("workflow", {}).get("strictness") == "strict"


# ---------------------------------------------------------------------------
# AC6: Gate YAML schema — strictness_level validated
# ---------------------------------------------------------------------------


class TestGateSchemaValidation:
    """AC6: Gate file strictness_level is validated."""

    def test_valid_strictness_levels_accepted(self, tmp_path: Path) -> None:
        """critical, standard, and advisory are valid strictness_level values."""
        from pf.handoff.gate_runner import parse_gate_file

        gates_dir = tmp_path / ".pennyfarthing" / "gates"
        gates_dir.mkdir(parents=True)

        for level in ("critical", "standard", "advisory"):
            gate = gates_dir / f"test-{level}.md"
            gate.write_text(
                f'<gate name="test-{level}" strictness_level="{level}">\n'
                f"<purpose>Test</purpose>\n"
                f"</gate>\n"
            )
            result = parse_gate_file(gate)
            assert result["status"] == "ok"
            assert result.get("strictness_level") == level

    def test_invalid_strictness_level_reported(self, tmp_path: Path) -> None:
        """An invalid strictness_level should be reported as an error or default."""
        from pf.handoff.gate_runner import parse_gate_file

        gates_dir = tmp_path / ".pennyfarthing" / "gates"
        gates_dir.mkdir(parents=True)
        gate = gates_dir / "bad-level.md"
        gate.write_text(
            '<gate name="bad-level" strictness_level="extreme">\n'
            "<purpose>Test</purpose>\n"
            "</gate>\n"
        )
        result = parse_gate_file(gate)
        # Either error status or defaults to standard — implementation decides
        assert (
            result.get("strictness_level") in ("standard", None)
            or result["status"] == "error"
        ), "Invalid strictness_level should default to standard or report error"


# ---------------------------------------------------------------------------
# AC7: Backward compatibility — default to standard
# ---------------------------------------------------------------------------


class TestBackwardCompatibility:
    """AC7: Gates without strictness_level default to standard."""

    def test_gate_without_strictness_defaults_to_standard(
        self, gate_file_no_strictness: Path
    ) -> None:
        """parse_gate_file must return strictness_level='standard' when not declared."""
        from pf.handoff.gate_runner import parse_gate_file

        result = parse_gate_file(gate_file_no_strictness)
        assert result["status"] == "ok"
        assert result.get("strictness_level") == "standard", (
            "Gates without strictness_level must default to 'standard'"
        )

    def test_existing_gate_result_format_unchanged(self) -> None:
        """extract_gate_result must still parse existing GATE_RESULT format."""
        from pf.handoff.gate_runner import extract_gate_result

        # Existing format without strictness — must still work
        raw = (
            "GATE_RESULT:\n"
            "  status: pass\n"
            "  message: All checks passed\n"
        )
        result = extract_gate_result(raw)
        assert result["status"] == "pass"
        assert result["message"] == "All checks passed"

    def test_apply_strictness_with_default_level(self) -> None:
        """apply_strictness_profile with standard level + standard profile = block."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Failed", "checks": []}
        enforced = apply_strictness_profile(gate_result, "standard", "standard")
        assert enforced["enforcement"] == "block"

    def test_merge_gate_results_still_works(self) -> None:
        """merge_gate_results must continue to work (no breaking changes)."""
        from pf.handoff.gate_runner import merge_gate_results

        primary = {"status": "pass", "message": "Primary OK", "checks": []}
        extension = {"status": "fail", "message": "Extension failed", "checks": []}
        merged = merge_gate_results(primary, extension)
        assert merged["status"] == "fail"
        assert "Extension failed" in merged["message"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_apply_strictness_with_unknown_level_defaults(self) -> None:
        """Unknown gate strictness_level should be treated as standard."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Failed", "checks": []}
        enforced = apply_strictness_profile(gate_result, "unknown", "strict")
        # Unknown level treated as standard → blocks in strict
        assert enforced["enforcement"] == "block"

    def test_apply_strictness_with_unknown_profile_defaults(self) -> None:
        """Unknown profile should be treated as standard."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Failed", "checks": []}
        enforced = apply_strictness_profile(gate_result, "critical", "unknown")
        # Unknown profile treated as standard → critical always blocks
        assert enforced["enforcement"] == "block"

    def test_strictness_case_sensitive(self) -> None:
        """Strictness values should be lowercase."""
        from pf.settings.validators import validate_setting

        result = validate_setting("workflow.strictness", "Strict")
        assert result.valid is False, "Strictness values must be lowercase"


# ---------------------------------------------------------------------------
# Rule enforcement
# ---------------------------------------------------------------------------


class TestRuleEnforcement:
    """Tests derived from SOUL.md and project rules."""

    def test_apply_strictness_returns_result_dict(self) -> None:
        """SOUL #10: apply_strictness_profile returns dict, never throws."""
        from pf.handoff.gate_runner import apply_strictness_profile

        gate_result = {"status": "fail", "message": "Test", "checks": []}
        result = apply_strictness_profile(gate_result, "critical", "strict")
        assert isinstance(result, dict)
        assert "enforcement" in result
        assert "status" in result

    def test_apply_strictness_has_type_annotations(self) -> None:
        """Public functions must have type annotations."""
        import inspect

        from pf.handoff.gate_runner import apply_strictness_profile

        sig = inspect.signature(apply_strictness_profile)
        assert sig.return_annotation is not inspect.Parameter.empty

    def test_parse_gate_file_still_returns_existing_fields(
        self, gate_file_critical: Path
    ) -> None:
        """Adding strictness_level must not break existing return fields."""
        from pf.handoff.gate_runner import parse_gate_file

        result = parse_gate_file(gate_file_critical)
        # All existing fields must still be present
        assert "status" in result
        assert "name" in result
        assert "model" in result
        assert "content" in result
        assert "error" in result
