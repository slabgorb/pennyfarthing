"""Tests for 150-16: Spec authority hierarchy guide.

Both Dev and TEA independently overrode story scope without escalating,
because there was no shared guide defining the spec authority hierarchy.
This story creates a shared guide and validation functions enforcing
the 4-level precedence: Story scope > Story context > Epic context >
Architecture docs / SOUL.md.

Tests verify:
- AC1: Guide file exists at pennyfarthing-dist/guides/spec-authority.md
- AC2: Guide contains all 4 levels in correct precedence order
- AC3: Guide contains deviation escalation procedure
- AC4: get_authority_levels() returns the 4 levels in order
- AC5: check_deviation_required() returns True when proposing a change
        at a lower authority level than the spec

Story: 150-16
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from pf.common.config import get_dist_root

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PENNYFARTHING_DIST = get_dist_root()
GUIDE_PATH = PENNYFARTHING_DIST / "guides" / "spec-authority.md"

AUTHORITY_LEVELS = [
    "Story scope",
    "Story context",
    "Epic context",
    "Architecture docs",
]


# ---------------------------------------------------------------------------
# AC1: Guide file exists
# ---------------------------------------------------------------------------


class TestGuideExists:
    """The spec-authority guide must exist at the expected path."""

    def test_guide_file_exists(self) -> None:
        assert GUIDE_PATH.exists(), (
            f"Guide file not found at {GUIDE_PATH}. "
            "Create pennyfarthing-dist/guides/spec-authority.md"
        )

    def test_guide_is_not_empty(self) -> None:
        if not GUIDE_PATH.exists():
            pytest.skip("Guide file does not exist yet")
        content = GUIDE_PATH.read_text()
        assert len(content.strip()) > 100, "Guide file is too short to be meaningful"


# ---------------------------------------------------------------------------
# AC2: Guide contains all 4 levels in correct precedence order
# ---------------------------------------------------------------------------


class TestGuideLevels:
    """The guide must document all 4 authority levels in precedence order."""

    @pytest.fixture()
    def guide_content(self) -> str:
        if not GUIDE_PATH.exists():
            pytest.skip("Guide file does not exist yet")
        return GUIDE_PATH.read_text()

    @pytest.mark.parametrize("level", AUTHORITY_LEVELS)
    def test_level_mentioned(self, guide_content: str, level: str) -> None:
        assert level.lower() in guide_content.lower(), (
            f"Authority level '{level}' not found in guide"
        )

    def test_levels_in_correct_order(self, guide_content: str) -> None:
        """Levels must appear in descending authority order."""
        positions = []
        for level in AUTHORITY_LEVELS:
            match = re.search(re.escape(level), guide_content, re.IGNORECASE)
            assert match is not None, f"Level '{level}' not found in guide"
            positions.append(match.start())

        for i in range(len(positions) - 1):
            assert positions[i] < positions[i + 1], (
                f"'{AUTHORITY_LEVELS[i]}' must appear before "
                f"'{AUTHORITY_LEVELS[i + 1]}' in the guide "
                f"(positions: {positions[i]} vs {positions[i + 1]})"
            )

    def test_highest_authority_labeled(self, guide_content: str) -> None:
        """Story scope must be explicitly labeled as highest authority."""
        assert re.search(
            r"(highest|level\s*1|top|first)", guide_content, re.IGNORECASE
        ), "Guide must label Story scope as the highest authority"

    def test_numbered_hierarchy(self, guide_content: str) -> None:
        """Guide should use numbered levels (1-4) for clarity."""
        for i in range(1, 5):
            pattern = rf"(level\s*{i}|{i}\s*[.)\-:])"
            assert re.search(pattern, guide_content, re.IGNORECASE), (
                f"Guide should number authority levels; level {i} not found"
            )


# ---------------------------------------------------------------------------
# AC3: Guide contains deviation escalation procedure
# ---------------------------------------------------------------------------


class TestDeviationProcedure:
    """The guide must document how to escalate when deviating from spec."""

    @pytest.fixture()
    def guide_content(self) -> str:
        if not GUIDE_PATH.exists():
            pytest.skip("Guide file does not exist yet")
        return GUIDE_PATH.read_text()

    def test_deviation_section_exists(self, guide_content: str) -> None:
        assert re.search(
            r"deviation", guide_content, re.IGNORECASE
        ), "Guide must contain a deviation procedure section"

    def test_escalation_mentioned(self, guide_content: str) -> None:
        assert re.search(
            r"escalat", guide_content, re.IGNORECASE
        ), "Guide must mention escalation"

    def test_design_deviations_log_mentioned(self, guide_content: str) -> None:
        """Must reference logging deviations in Design Deviations section."""
        assert re.search(
            r"design\s+deviation", guide_content, re.IGNORECASE
        ), "Guide must reference the Design Deviations log"

    def test_before_implementing(self, guide_content: str) -> None:
        """Must state that deviations are logged BEFORE implementing."""
        assert re.search(
            r"before\s+(implement|cod|writing|making)", guide_content, re.IGNORECASE
        ), "Guide must state deviations are logged BEFORE implementing"


# ---------------------------------------------------------------------------
# AC4: get_authority_levels() returns the 4 levels in order
# ---------------------------------------------------------------------------


class TestGetAuthorityLevels:
    """The validation function must return structured authority level data."""

    def test_import(self) -> None:
        from pf.spec.authority import get_authority_levels  # noqa: F401

    def test_returns_list(self) -> None:
        from pf.spec.authority import get_authority_levels

        result = get_authority_levels()
        assert isinstance(result, list), "get_authority_levels() must return a list"

    def test_returns_four_levels(self) -> None:
        from pf.spec.authority import get_authority_levels

        result = get_authority_levels()
        assert len(result) == 4, f"Expected 4 authority levels, got {len(result)}"

    def test_each_level_is_dict(self) -> None:
        from pf.spec.authority import get_authority_levels

        result = get_authority_levels()
        for i, level in enumerate(result):
            assert isinstance(level, dict), (
                f"Level {i} must be a dict, got {type(level)}"
            )

    def test_each_level_has_required_keys(self) -> None:
        from pf.spec.authority import get_authority_levels

        result = get_authority_levels()
        required_keys = {"level", "name", "description"}
        for item in result:
            missing = required_keys - set(item.keys())
            assert not missing, f"Level dict missing keys: {missing}"

    def test_levels_numbered_1_to_4(self) -> None:
        from pf.spec.authority import get_authority_levels

        result = get_authority_levels()
        levels = [item["level"] for item in result]
        assert levels == [1, 2, 3, 4], f"Levels must be [1,2,3,4], got {levels}"

    def test_level_names_match(self) -> None:
        from pf.spec.authority import get_authority_levels

        result = get_authority_levels()
        names = [item["name"] for item in result]
        for expected in AUTHORITY_LEVELS:
            found = any(expected.lower() in name.lower() for name in names)
            assert found, f"Authority level '{expected}' not in returned names: {names}"

    def test_level_1_is_story_scope(self) -> None:
        from pf.spec.authority import get_authority_levels

        result = get_authority_levels()
        assert "story scope" in result[0]["name"].lower(), (
            f"Level 1 must be 'Story scope', got '{result[0]['name']}'"
        )


# ---------------------------------------------------------------------------
# AC5: check_deviation_required() logic
# ---------------------------------------------------------------------------


class TestCheckDeviationRequired:
    """check_deviation_required(proposed, current) returns True when
    the proposed change operates at a lower authority level than the
    current spec — meaning you'd be overriding a higher-authority spec."""

    def test_import(self) -> None:
        from pf.spec.authority import check_deviation_required  # noqa: F401

    def test_lower_overriding_higher_requires_deviation(self) -> None:
        """Proposing at level 3 against a level 1 spec requires deviation."""
        from pf.spec.authority import check_deviation_required

        assert check_deviation_required(proposed_change_level=3, current_spec_level=1)

    def test_same_level_no_deviation(self) -> None:
        """Same authority level does not require deviation logging."""
        from pf.spec.authority import check_deviation_required

        assert not check_deviation_required(
            proposed_change_level=2, current_spec_level=2
        )

    def test_higher_overriding_lower_no_deviation(self) -> None:
        """Higher authority overriding lower does not require deviation."""
        from pf.spec.authority import check_deviation_required

        assert not check_deviation_required(
            proposed_change_level=1, current_spec_level=3
        )

    def test_level_4_overriding_level_1(self) -> None:
        """Architecture docs overriding story scope requires deviation."""
        from pf.spec.authority import check_deviation_required

        assert check_deviation_required(proposed_change_level=4, current_spec_level=1)

    def test_level_2_overriding_level_1(self) -> None:
        """Story context overriding story scope requires deviation."""
        from pf.spec.authority import check_deviation_required

        assert check_deviation_required(proposed_change_level=2, current_spec_level=1)

    def test_returns_bool(self) -> None:
        from pf.spec.authority import check_deviation_required

        result = check_deviation_required(
            proposed_change_level=1, current_spec_level=1
        )
        assert isinstance(result, bool), f"Must return bool, got {type(result)}"
