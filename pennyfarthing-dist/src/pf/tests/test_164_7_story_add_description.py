"""Tests for story 164-7: --description/--body option on pf sprint story add.

Story: 164-7 — Add --description/body option to pf sprint story add so minted
follow-ups carry provenance in the story body.

TDD RED phase: All tests FAIL until implementation because:
- add_story() has no `description` keyword argument → TypeError
- story_add_command has no --description / --body option → "no such option" error

Acceptance Criteria:
1. --description TEXT (CLI) + description= (programmatic) write value to the
   new story's `description` field in the YAML shard (round-trip asserted).
2. --body TEXT is a CLI alias that sets the same description field identically.
3. Omitting --description preserves current behaviour: description absent,
   nothing else changes (backward compatibility).
4. Multi-line text and YAML-special chars (colons, quotes, leading dashes, #)
   round-trip without corrupting the shard or adjacent stories.
"""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.sprint.story_add import add_initiative_story, add_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Shared YAML fixture
# =============================================================================

MINIMAL_SPRINT_YAML = """\
sprint:
  name: "TO Sprint 164"
  jira_sprint_id: 300
  jira_sprint_name: "TO Sprint 164"
  goal: Test sprint
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 300
epics:
  - id: epic-164
    type: epic
    title: "Epic: Description Option"
    priority: P1
    status: in_progress
    jira: PROJ-16400
    stories:
      - id: 164-1
        title: First existing story
        points: 2
        priority: P1
        status: backlog
        workflow: tdd
      - id: 164-2
        title: Second existing story
        points: 3
        priority: P1
        status: backlog
        workflow: tdd
"""

SHARD_YAML = """\
id: "164"
type: epic
title: "Epic: Description Option"
priority: P1
status: in_progress
repos: pennyfarthing
stories:
  - id: 164-1
    title: First existing story
    points: 2
    priority: P1
    status: backlog
    workflow: tdd
"""


@pytest.fixture
def sprint_file(tmp_path: Path) -> Path:
    p = tmp_path / "current-sprint.yaml"
    p.write_text(MINIMAL_SPRINT_YAML, encoding="utf-8")
    return p


@pytest.fixture
def shard_path(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    p = sprint_dir / "epic-164.yaml"
    p.write_text(SHARD_YAML, encoding="utf-8")
    return p


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# AC1: Programmatic round-trip — add_story(description=...) persists field
# =============================================================================


class TestDescriptionProgrammatic:
    """add_story() accepts description= and persists it to the YAML shard."""

    def test_description_written_to_story_field(self, sprint_file: Path) -> None:
        """add_story with description= stores value in the new story's description field."""
        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Story with description",
            points=2,
            description="This story exists because of review 155-13.",
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["description"] == "This story exists because of review 155-13."

    def test_description_round_trips_exactly(self, sprint_file: Path) -> None:
        """Description value read back from YAML must be byte-for-byte identical to what was written."""
        text = "Review 155-13 surfaced this gap: follow-ups lacked provenance."
        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Provenance story",
            points=1,
            description=text,
        )

        data = read_sprint(sprint_file)
        stored = data["epics"][0]["stories"][-1]["description"]

        assert stored == text

    def test_description_field_on_shard_file(self, shard_path: Path) -> None:
        """Round-trip works when sprint_path points directly at an epic shard."""
        add_story(
            sprint_path=shard_path,
            epic_id="164",
            title="Shard story with description",
            points=2,
            description="Shard provenance text.",
        )

        data = read_sprint(shard_path)
        new_story = data["stories"][-1]

        assert new_story["description"] == "Shard provenance text."

    def test_description_appears_in_result_dict(self, sprint_file: Path) -> None:
        """add_story with description= persists value — verified by reading back from YAML."""
        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Story with description",
            points=2,
            description="some text",
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["description"] == "some text"


# =============================================================================
# AC1 (CLI path): --description sets the field via CliRunner
# =============================================================================


class TestDescriptionCLI:
    """--description TEXT on the CLI persists description to the YAML shard."""

    def test_cli_description_option_accepted(self, runner: CliRunner, sprint_file: Path) -> None:
        """--description TEXT must not produce 'no such option' error."""
        from pf.sprint.story_add import story_add_command

        result = runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sprint_file),
                "164",
                "CLI description story",
                "2",
                "--description",
                "Provenance from CLI.",
            ],
        )

        assert result.exit_code == 0, (
            f"Expected exit_code 0, got {result.exit_code}. Output: {result.output!r}"
        )

    def test_cli_description_written_to_yaml(self, runner: CliRunner, sprint_file: Path) -> None:
        """After --description, the story's description field is persisted."""
        from pf.sprint.story_add import story_add_command

        runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sprint_file),
                "164",
                "CLI description story",
                "2",
                "--description",
                "Added via CLI flag.",
            ],
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["description"] == "Added via CLI flag."

    def test_cli_description_output_includes_story_id(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """Successful add with --description still prints the new story ID."""
        from pf.sprint.story_add import story_add_command

        result = runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sprint_file),
                "164",
                "CLI description story",
                "2",
                "--description",
                "Some text.",
            ],
        )

        assert result.exit_code == 0
        assert "164-3" in result.output


# =============================================================================
# AC2: --body alias sets the same description field
# =============================================================================


class TestBodyAlias:
    """--body TEXT is an alias for --description and sets the same field."""

    def test_body_alias_accepted(self, runner: CliRunner, sprint_file: Path) -> None:
        """--body TEXT must not produce 'no such option' error."""
        from pf.sprint.story_add import story_add_command

        result = runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sprint_file),
                "164",
                "Body alias story",
                "2",
                "--body",
                "Body alias text.",
            ],
        )

        assert result.exit_code == 0, (
            f"Expected exit_code 0, got {result.exit_code}. Output: {result.output!r}"
        )

    def test_body_alias_writes_description_field(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """--body TEXT writes to `description`, not a separate `body` field."""
        from pf.sprint.story_add import story_add_command

        runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sprint_file),
                "164",
                "Body alias story",
                "2",
                "--body",
                "Body alias text.",
            ],
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert new_story["description"] == "Body alias text."
        assert "body" not in new_story  # must NOT create a separate `body` key

    def test_body_and_description_are_interchangeable(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """--body and --description produce identical YAML output."""
        from pf.sprint.story_add import story_add_command

        TEXT = "Identical provenance text."

        runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sprint_file),
                "164",
                "Description story",
                "2",
                "--description",
                TEXT,
            ],
        )
        desc_story = read_sprint(sprint_file)["epics"][0]["stories"][-1]

        runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sprint_file),
                "164",
                "Body story",
                "2",
                "--body",
                TEXT,
            ],
        )
        body_story = read_sprint(sprint_file)["epics"][0]["stories"][-1]

        assert desc_story["description"] == body_story["description"]


# =============================================================================
# AC3: Omitting --description preserves current behaviour
# =============================================================================


class TestOmitDescription:
    """Without --description, description is absent; existing tests still hold."""

    def test_description_absent_when_not_provided_programmatic(self, sprint_file: Path) -> None:
        """add_story() without description= must not put a description key in the story."""
        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="No description story",
            points=2,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert "description" not in new_story

    def test_description_absent_when_not_provided_cli(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """CLI invocation without --description must not put a description key in the story."""
        from pf.sprint.story_add import story_add_command

        runner.invoke(
            story_add_command,
            ["--sprint-file", str(sprint_file), "164", "No description story", "2"],
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        assert "description" not in new_story

    def test_existing_stories_not_affected(self, sprint_file: Path) -> None:
        """Pre-existing stories without description must not gain a description key."""
        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Another story",
            points=1,
        )

        data = read_sprint(sprint_file)
        # The two original stories must not have description added
        for story in data["epics"][0]["stories"][:-1]:
            assert "description" not in story

    def test_exit_code_zero_without_description(self, runner: CliRunner, sprint_file: Path) -> None:
        """Plain add without --description must still exit 0 (backward compat)."""
        from pf.sprint.story_add import story_add_command

        result = runner.invoke(
            story_add_command,
            ["--sprint-file", str(sprint_file), "164", "Plain story", "2"],
        )

        assert result.exit_code == 0

    def test_none_description_not_stored(self, sprint_file: Path) -> None:
        """Explicitly passing description=None must not store a None value in YAML."""
        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Explicit None description",
            points=2,
            description=None,
        )

        data = read_sprint(sprint_file)
        new_story = data["epics"][0]["stories"][-1]

        # description must be absent when None is explicitly passed
        assert "description" not in new_story


# =============================================================================
# AC4: Special-content safety — multi-line and YAML-special chars
# =============================================================================


class TestDescriptionSpecialContent:
    """Multi-line text and YAML-special chars round-trip without YAML corruption."""

    def test_multiline_description_round_trips(self, sprint_file: Path) -> None:
        """Multi-line description survives write→read without collapsing to a single line."""
        text = dedent("""\
            This story stems from review 155-13.
            The follow-up minting flow must carry provenance text.
            See pf sprint story add --help for usage.
        """).strip()

        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Multi-line description story",
            points=2,
            description=text,
        )

        data = read_sprint(sprint_file)
        stored = data["epics"][0]["stories"][-1]["description"]

        assert stored == text
        assert "\n" in stored  # must still be multi-line after round-trip

    def test_description_with_colons_round_trips(self, sprint_file: Path) -> None:
        """Description containing colons must not corrupt YAML structure."""
        text = "Key: value pair in description: this is not a mapping."

        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Colon description story",
            points=2,
            description=text,
        )

        data = read_sprint(sprint_file)
        stored = data["epics"][0]["stories"][-1]["description"]

        assert stored == text

    def test_description_with_quotes_round_trips(self, sprint_file: Path) -> None:
        """Description with single and double quotes survives round-trip."""
        text = """He said "hello" and she replied 'hi' — it's fine."""

        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Quotes description story",
            points=2,
            description=text,
        )

        data = read_sprint(sprint_file)
        stored = data["epics"][0]["stories"][-1]["description"]

        assert stored == text

    def test_description_with_leading_dash_round_trips(self, sprint_file: Path) -> None:
        """Description whose first line starts with a dash must not be parsed as a list."""
        text = "- First bullet point\n- Second bullet point"

        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Dash description story",
            points=2,
            description=text,
        )

        data = read_sprint(sprint_file)
        stored = data["epics"][0]["stories"][-1]["description"]

        # Must be a string, not a list
        assert isinstance(stored, str)
        assert stored == text

    def test_description_with_hash_round_trips(self, sprint_file: Path) -> None:
        """Description with '#' comment-like characters must round-trip intact."""
        text = "Relates to #141 and #32 in GitHub."

        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Hash description story",
            points=2,
            description=text,
        )

        data = read_sprint(sprint_file)
        stored = data["epics"][0]["stories"][-1]["description"]

        assert stored == text

    def test_adjacent_stories_unaffected_by_special_description(self, sprint_file: Path) -> None:
        """Storing a complex description must not corrupt adjacent stories in the YAML."""
        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="Complex description story",
            points=2,
            description='Key: value\n- bullet\n# comment\n"quote"',
        )

        data = read_sprint(sprint_file)
        stories = data["epics"][0]["stories"]

        # Original two stories must be intact
        assert stories[0]["id"] == "164-1"
        assert stories[0]["title"] == "First existing story"
        assert stories[1]["id"] == "164-2"
        assert stories[1]["title"] == "Second existing story"

    def test_shard_not_corrupted_by_special_description(self, shard_path: Path) -> None:
        """Writing a complex description to a shard must leave the shard re-readable with adjacent stories intact."""
        add_story(
            sprint_path=shard_path,
            epic_id="164",
            title="Complex shard story",
            points=2,
            description="Key: value\n- bullet\n# comment",
        )

        # Must be re-parseable without error
        data = read_sprint(shard_path)
        assert data is not None
        assert len(data["stories"]) == 2

        # Pre-existing story fields must be completely intact
        original = data["stories"][0]
        assert original["id"] == "164-1"
        assert original["title"] == "First existing story"
        assert original["points"] == 2
        assert original["priority"] == "P1"
        assert original["status"] == "backlog"
        assert original["workflow"] == "tdd"
        assert "description" not in original

        # New story carries the complex description unchanged
        new_story = data["stories"][1]
        assert new_story["description"] == "Key: value\n- bullet\n# comment"

    def test_all_special_chars_in_one_description(self, sprint_file: Path) -> None:
        """A description combining colons, quotes, dashes, hashes, and newlines round-trips."""
        text = (
            "Review: 155-13\n"
            "- Impact: follow-up minting lacked provenance\n"
            "- Fix: add --description flag\n"
            "# See also: pf sprint story add --help\n"
            'Status: "resolved"'
        )

        add_story(
            sprint_path=sprint_file,
            epic_id="164",
            title="All specials story",
            points=3,
            description=text,
        )

        data = read_sprint(sprint_file)
        stored = data["epics"][0]["stories"][-1]["description"]

        assert stored == text


# =============================================================================
# AC1 (initiative path): --description round-trips for initiative stories
# =============================================================================

INITIATIVE_YAML = """\
slug: test-slug
title: Test Initiative
total_points: 5
standalone_stories:
  - id: ts-1
    title: Existing initiative story
    points: 5
    priority: P1
    status: backlog
    repos: pennyfarthing
    workflow: tdd
"""


@pytest.fixture
def initiative_root(tmp_path: Path) -> Path:
    """Return a tmp root with sprint/initiative-test-slug.yaml set up."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "initiative-test-slug.yaml").write_text(INITIATIVE_YAML, encoding="utf-8")
    return tmp_path


class TestInitiativeDescription:
    """--description round-trips for initiative (standalone) stories."""

    def test_initiative_description_round_trips(self, initiative_root: Path) -> None:
        """add_initiative_story(description=...) writes description to the initiative YAML."""
        with patch("pf.common.config.get_project_root", return_value=initiative_root):
            result = add_initiative_story(
                initiative_slug="test-slug",
                title="Initiative story with provenance",
                points=2,
                description="Minted from review 155-13.",
            )

        assert result["success"] is True

        # Read back directly — ruamel.yaml round-trip
        from ruamel.yaml import YAML as RuamelYAML

        ryml = RuamelYAML()
        init_file = initiative_root / "sprint" / "initiative-test-slug.yaml"
        with open(init_file, encoding="utf-8") as f:
            data = ryml.load(f)

        new_story = data["standalone_stories"][-1]
        assert new_story["description"] == "Minted from review 155-13."

    def test_initiative_description_absent_when_omitted(self, initiative_root: Path) -> None:
        """add_initiative_story() without description= must not add a description field."""
        with patch("pf.common.config.get_project_root", return_value=initiative_root):
            add_initiative_story(
                initiative_slug="test-slug",
                title="No description initiative story",
                points=1,
            )

        from ruamel.yaml import YAML as RuamelYAML

        ryml = RuamelYAML()
        init_file = initiative_root / "sprint" / "initiative-test-slug.yaml"
        with open(init_file, encoding="utf-8") as f:
            data = ryml.load(f)

        new_story = data["standalone_stories"][-1]
        assert "description" not in new_story
