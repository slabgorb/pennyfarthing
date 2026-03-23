"""Tests for reviewer subagent diff mode discrimination (150-7).

Story: Reviewer subagents should use discriminated diff modes —
full base-branch diff for cross-file analysis specialists,
incremental diff for localized analysis specialists.

Tests are RED — the diff_mode module and integration don't exist yet.
"""

from __future__ import annotations

import pytest


class TestDiffModeRegistry:
    """Test that each reviewer subagent has a defined diff mode."""

    def test_diff_mode_module_exists(self) -> None:
        """The reviewer diff_mode module must exist."""
        from pf.reviewer.diff_mode import SUBAGENT_DIFF_MODES  # noqa: F401

    def test_all_nine_subagents_have_diff_mode(self) -> None:
        """Every reviewer subagent must have a defined diff mode."""
        from pf.reviewer.diff_mode import SUBAGENT_DIFF_MODES

        expected_subagents = {
            "reviewer-preflight",
            "reviewer-edge-hunter",
            "reviewer-silent-failure-hunter",
            "reviewer-test-analyzer",
            "reviewer-comment-analyzer",
            "reviewer-type-design",
            "reviewer-security",
            "reviewer-simplifier",
            "reviewer-rule-checker",
        }
        assert set(SUBAGENT_DIFF_MODES.keys()) == expected_subagents

    def test_diff_mode_values_are_valid(self) -> None:
        """Diff modes must be one of: full-base, incremental, none."""
        from pf.reviewer.diff_mode import SUBAGENT_DIFF_MODES

        valid_modes = {"full-base", "incremental", "none"}
        for name, mode in SUBAGENT_DIFF_MODES.items():
            assert mode in valid_modes, (
                f"{name} has invalid diff_mode '{mode}', expected one of {valid_modes}"
            )


class TestFullBaseDiffAssignment:
    """Cross-file analysis specialists MUST use full base-branch diff."""

    @pytest.mark.parametrize(
        "subagent",
        [
            "reviewer-security",
            "reviewer-edge-hunter",
            "reviewer-test-analyzer",
            "reviewer-rule-checker",
        ],
    )
    def test_cross_file_specialists_use_full_base(self, subagent: str) -> None:
        """Subagents that analyze cross-file patterns must use full-base diff."""
        from pf.reviewer.diff_mode import SUBAGENT_DIFF_MODES

        assert SUBAGENT_DIFF_MODES[subagent] == "full-base", (
            f"{subagent} must use 'full-base' diff mode for cross-file analysis"
        )


class TestIncrementalDiffAssignment:
    """Localized analysis specialists use incremental diff."""

    @pytest.mark.parametrize(
        "subagent",
        [
            "reviewer-simplifier",
            "reviewer-comment-analyzer",
            "reviewer-type-design",
            "reviewer-silent-failure-hunter",
        ],
    )
    def test_localized_specialists_use_incremental(self, subagent: str) -> None:
        """Subagents doing localized analysis use incremental diff."""
        from pf.reviewer.diff_mode import SUBAGENT_DIFF_MODES

        assert SUBAGENT_DIFF_MODES[subagent] == "incremental", (
            f"{subagent} must use 'incremental' diff mode for localized analysis"
        )


class TestPreflightNoDiff:
    """Preflight runs tools, not reads diffs — gets no diff injection."""

    def test_preflight_has_no_diff_mode(self) -> None:
        """Preflight must have diff_mode 'none' — it runs tests/lint, not diff analysis."""
        from pf.reviewer.diff_mode import SUBAGENT_DIFF_MODES

        assert SUBAGENT_DIFF_MODES["reviewer-preflight"] == "none", (
            "Preflight runs tools (tests, lint, smells), not diff analysis"
        )


class TestDiffConstruction:
    """Test that diff commands are constructed correctly per mode."""

    def test_get_diff_command_full_base(self) -> None:
        """Full-base mode uses git diff {base}...HEAD (three-dot)."""
        from pf.reviewer.diff_mode import get_diff_command

        cmd = get_diff_command("full-base", base_branch="develop")
        assert cmd == ["git", "diff", "develop...HEAD"]

    def test_get_diff_command_incremental(self) -> None:
        """Incremental mode uses git diff HEAD~1."""
        from pf.reviewer.diff_mode import get_diff_command

        cmd = get_diff_command("incremental", base_branch="develop")
        assert cmd == ["git", "diff", "HEAD~1"]

    def test_get_diff_command_none_returns_none(self) -> None:
        """None mode returns None — no diff to construct."""
        from pf.reviewer.diff_mode import get_diff_command

        cmd = get_diff_command("none", base_branch="develop")
        assert cmd is None

    def test_get_diff_command_respects_base_branch(self) -> None:
        """Full-base mode must use the provided base branch, not hardcode."""
        from pf.reviewer.diff_mode import get_diff_command

        cmd_develop = get_diff_command("full-base", base_branch="develop")
        cmd_main = get_diff_command("full-base", base_branch="main")
        assert cmd_develop == ["git", "diff", "develop...HEAD"]
        assert cmd_main == ["git", "diff", "main...HEAD"]

    def test_get_diff_command_invalid_mode_raises(self) -> None:
        """Invalid diff mode must raise ValueError."""
        from pf.reviewer.diff_mode import get_diff_command

        with pytest.raises(ValueError, match="Invalid diff mode"):
            get_diff_command("bogus", base_branch="develop")


class TestDiffForSubagent:
    """Test the convenience function that resolves subagent -> diff command."""

    def test_get_diff_for_subagent_full_base(self) -> None:
        """Security subagent gets full-base diff command."""
        from pf.reviewer.diff_mode import get_diff_for_subagent

        cmd = get_diff_for_subagent("reviewer-security", base_branch="develop")
        assert cmd == ["git", "diff", "develop...HEAD"]

    def test_get_diff_for_subagent_incremental(self) -> None:
        """Simplifier subagent gets incremental diff command."""
        from pf.reviewer.diff_mode import get_diff_for_subagent

        cmd = get_diff_for_subagent("reviewer-simplifier", base_branch="develop")
        assert cmd == ["git", "diff", "HEAD~1"]

    def test_get_diff_for_subagent_preflight_none(self) -> None:
        """Preflight subagent gets None — no diff needed."""
        from pf.reviewer.diff_mode import get_diff_for_subagent

        cmd = get_diff_for_subagent("reviewer-preflight", base_branch="develop")
        assert cmd is None

    def test_get_diff_for_subagent_unknown_raises(self) -> None:
        """Unknown subagent name must raise KeyError."""
        from pf.reviewer.diff_mode import get_diff_for_subagent

        with pytest.raises(KeyError):
            get_diff_for_subagent("reviewer-nonexistent", base_branch="develop")

    def test_get_diff_for_subagent_reads_base_from_repos(self) -> None:
        """When no base_branch provided, reads from repos.yaml."""
        from unittest.mock import patch

        from pf.reviewer.diff_mode import get_diff_for_subagent

        with patch(
            "pf.reviewer.diff_mode.get_default_branch",
            return_value="develop",
        ):
            cmd = get_diff_for_subagent("reviewer-security", repo_name="pennyfarthing")
            assert cmd == ["git", "diff", "develop...HEAD"]


class TestConsistencyWithCompletePhase:
    """Ensure diff_mode registry stays in sync with complete_phase subagent map."""

    def test_diff_mode_keys_match_complete_phase_subagents(self) -> None:
        """SUBAGENT_DIFF_MODES must cover exactly the same subagents as _SUBAGENT_SETTING_MAP."""
        from pf.handoff.complete_phase import _SUBAGENT_SETTING_MAP
        from pf.reviewer.diff_mode import SUBAGENT_DIFF_MODES

        setting_map_names = {name for name, _tag in _SUBAGENT_SETTING_MAP.values()}
        assert set(SUBAGENT_DIFF_MODES.keys()) == setting_map_names, (
            "SUBAGENT_DIFF_MODES must match _SUBAGENT_SETTING_MAP exactly. "
            f"Missing from diff_modes: {setting_map_names - set(SUBAGENT_DIFF_MODES.keys())}. "
            f"Extra in diff_modes: {set(SUBAGENT_DIFF_MODES.keys()) - setting_map_names}."
        )
