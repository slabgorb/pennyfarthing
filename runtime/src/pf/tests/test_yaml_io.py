"""Tests for sprint/yaml_io.py module.

Story: PROJ-14254 - Core yaml_io module with deterministic serialization

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. Same input produces byte-identical output
2. Round-trip integrity (read -> write -> read = identical)
3. Atomic writes prevent partial file corruption
4. Key ordering matches sprint-template.yaml
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.yaml_io import (
    EPIC_KEY_ORDER,
    SPRINT_KEY_ORDER,
    STORY_KEY_ORDER,
    canonical_dump,
    read_sprint,
    write_sprint,
)

# =============================================================================
# Test Fixtures
# =============================================================================


MINIMAL_SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
epics: []
"""

FULL_SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
epics:
  - id: epic-63
    type: epic
    title: "Epic: Test Epic"
    description: |
      This is a test epic with a multiline description.
      It has multiple lines.
    priority: P1
    status: in_progress
    repos: pennyfarthing
    jira: PROJ-12000
    points: 8
    stories:
      - id: 63-1
        jira: PROJ-12001
        title: First Story
        description: |
          A story with a multiline description.
        points: 3
        priority: P0
        status: backlog
        repos: pennyfarthing
        workflow: tdd
        acceptance_criteria:
          - First criterion
          - Second criterion
      - id: 63-2
        jira: PROJ-12002
        title: Second Story
        points: 5
        priority: P1
        status: in_progress
        assigned_to: keithavery
        started: "2026-01-21T10:00:00Z"
        repos: pennyfarthing
        workflow: trivial
"""


@pytest.fixture
def minimal_sprint_file(tmp_path: Path) -> Path:
    """Create a minimal valid sprint YAML file."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(MINIMAL_SPRINT_YAML)
    return p


@pytest.fixture
def full_sprint_file(tmp_path: Path) -> Path:
    """Create a full sprint YAML file with epics and stories."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(FULL_SPRINT_YAML)
    return p


@pytest.fixture
def sprint_data_dict() -> dict[str, Any]:
    """Sprint data as a plain dict (unordered)."""
    return {
        "sprint": {
            "status": "active",
            "name": "TO Sprint 2604",
            "end_date": "2026-02-02",
            "goal": "Complete the sprint",
            "jira_sprint_id": 276,
            "start_date": "2026-01-20",
            "jira_sprint_name": "TO Sprint 2604",
        },
        "epics": [],
    }


@pytest.fixture
def scrambled_keys_file(tmp_path: Path) -> Path:
    """Sprint YAML with keys in wrong order."""
    content = """\
sprint:
  status: active
  name: "TO Sprint 2604"
  end_date: 2026-02-02
  goal: Complete the sprint
  jira_sprint_id: 276
  start_date: 2026-01-20
  jira_sprint_name: "TO Sprint 2604"
epics:
  - stories: []
    id: epic-63
    status: in_progress
    title: "Epic: Test"
    priority: P1
"""
    p = tmp_path / "scrambled.yaml"
    p.write_text(content)
    return p


# =============================================================================
# AC1: Same input produces byte-identical output
# =============================================================================


class TestDeterministicOutput:
    """canonical_dump must produce byte-identical output for the same input."""

    def test_same_input_same_output(self, full_sprint_file: Path) -> None:
        """Calling canonical_dump twice on the same data produces identical bytes."""
        data = read_sprint(full_sprint_file)

        output1 = canonical_dump(data)
        output2 = canonical_dump(data)

        assert output1 == output2
        assert isinstance(output1, str)

    def test_deterministic_across_reads(self, full_sprint_file: Path) -> None:
        """Reading the same file twice and dumping produces identical output."""
        data1 = read_sprint(full_sprint_file)
        data2 = read_sprint(full_sprint_file)

        assert canonical_dump(data1) == canonical_dump(data2)

    def test_no_trailing_whitespace(self, full_sprint_file: Path) -> None:
        """Output should have no trailing whitespace on any line."""
        data = read_sprint(full_sprint_file)
        output = canonical_dump(data)

        for i, line in enumerate(output.split("\n"), 1):
            assert line == line.rstrip(), f"Line {i} has trailing whitespace: {line!r}"

    def test_ends_with_single_newline(self, full_sprint_file: Path) -> None:
        """Output should end with exactly one newline."""
        data = read_sprint(full_sprint_file)
        output = canonical_dump(data)

        assert output.endswith("\n")
        assert not output.endswith("\n\n")

    def test_two_space_indentation(self, full_sprint_file: Path) -> None:
        """Indentation should use 2 spaces, never tabs."""
        data = read_sprint(full_sprint_file)
        output = canonical_dump(data)

        assert "\t" not in output
        # Check that indented lines use multiples of 2 spaces
        for line in output.split("\n"):
            if line and line[0] == " ":
                leading = len(line) - len(line.lstrip())
                assert leading % 2 == 0, f"Non-2-space indent ({leading}): {line!r}"

    def test_multiline_uses_block_scalars(self, full_sprint_file: Path) -> None:
        """Multiline string fields (description) should use block scalar style (|)."""
        data = read_sprint(full_sprint_file)
        output = canonical_dump(data)

        # The description field has multiple lines, should use block scalar
        assert "description: |" in output or "description: |\n" in output

    def test_empty_epics_list(self, minimal_sprint_file: Path) -> None:
        """Empty epics list should serialize deterministically."""
        data = read_sprint(minimal_sprint_file)

        output1 = canonical_dump(data)
        output2 = canonical_dump(data)

        assert output1 == output2
        assert "epics:" in output1


# =============================================================================
# AC2: Round-trip integrity (read -> write -> read = identical)
# =============================================================================


class TestRoundTripIntegrity:
    """read_sprint -> write_sprint -> read_sprint must produce identical data."""

    def test_minimal_round_trip(self, tmp_path: Path, minimal_sprint_file: Path) -> None:
        """Minimal sprint YAML survives a read-write-read cycle."""
        data1 = read_sprint(minimal_sprint_file)

        out_path = tmp_path / "output.yaml"
        write_sprint(out_path, data1)
        data2 = read_sprint(out_path)

        # Data must be structurally identical
        assert canonical_dump(data1) == canonical_dump(data2)

    def test_full_round_trip(self, tmp_path: Path, full_sprint_file: Path) -> None:
        """Full sprint YAML with epics/stories survives a read-write-read cycle."""
        data1 = read_sprint(full_sprint_file)

        out_path = tmp_path / "output.yaml"
        write_sprint(out_path, data1)
        data2 = read_sprint(out_path)

        assert canonical_dump(data1) == canonical_dump(data2)

    def test_round_trip_preserves_multiline_strings(
        self, tmp_path: Path, full_sprint_file: Path
    ) -> None:
        """Multiline description fields survive round-trip intact."""
        data1 = read_sprint(full_sprint_file)
        epic = data1["epics"][0]
        original_desc = str(epic["description"])

        out_path = tmp_path / "output.yaml"
        write_sprint(out_path, data1)
        data2 = read_sprint(out_path)

        assert str(data2["epics"][0]["description"]) == original_desc

    def test_round_trip_preserves_list_fields(self, tmp_path: Path, full_sprint_file: Path) -> None:
        """acceptance_criteria lists survive round-trip."""
        data1 = read_sprint(full_sprint_file)
        story = data1["epics"][0]["stories"][0]
        original_ac = list(story["acceptance_criteria"])

        out_path = tmp_path / "output.yaml"
        write_sprint(out_path, data1)
        data2 = read_sprint(out_path)

        assert list(data2["epics"][0]["stories"][0]["acceptance_criteria"]) == original_ac

    def test_round_trip_preserves_integer_fields(
        self, tmp_path: Path, full_sprint_file: Path
    ) -> None:
        """Integer fields (points, jira_sprint_id) stay as integers."""
        data1 = read_sprint(full_sprint_file)

        out_path = tmp_path / "output.yaml"
        write_sprint(out_path, data1)
        data2 = read_sprint(out_path)

        assert data2["sprint"]["jira_sprint_id"] == 276
        assert isinstance(data2["sprint"]["jira_sprint_id"], int)
        assert data2["epics"][0]["stories"][0]["points"] == 3
        assert isinstance(data2["epics"][0]["stories"][0]["points"], int)

    def test_round_trip_preserves_date_strings(
        self, tmp_path: Path, full_sprint_file: Path
    ) -> None:
        """Date fields stay as strings, not datetime objects."""
        data1 = read_sprint(full_sprint_file)

        out_path = tmp_path / "output.yaml"
        write_sprint(out_path, data1)
        data2 = read_sprint(out_path)

        # Dates should be strings, not datetime objects
        start = data2["sprint"]["start_date"]
        assert isinstance(start, str) or hasattr(start, "__str__")
        assert str(start) == "2026-01-20"

    def test_double_round_trip_stable(self, tmp_path: Path, full_sprint_file: Path) -> None:
        """Two consecutive round-trips produce byte-identical output."""
        data1 = read_sprint(full_sprint_file)

        path_a = tmp_path / "a.yaml"
        write_sprint(path_a, data1)

        data2 = read_sprint(path_a)
        path_b = tmp_path / "b.yaml"
        write_sprint(path_b, data2)

        assert path_a.read_text() == path_b.read_text()

    def test_round_trip_with_real_sprint_file(self, tmp_path: Path) -> None:
        """Round-trip the actual current-sprint.yaml if available."""
        project_root = Path(__file__).parent.parent.parent
        real_file = project_root / "sprint" / "current-sprint.yaml"

        if not real_file.exists():
            pytest.skip("No current-sprint.yaml available")

        data1 = read_sprint(real_file)

        out_path = tmp_path / "round-trip.yaml"
        write_sprint(out_path, data1)
        data2 = read_sprint(out_path)

        assert canonical_dump(data1) == canonical_dump(data2)


# =============================================================================
# AC3: Atomic writes prevent partial file corruption
# =============================================================================


class TestAtomicWrites:
    """write_sprint must use atomic write (temp file + os.replace)."""

    def test_write_creates_file(self, tmp_path: Path, minimal_sprint_file: Path) -> None:
        """write_sprint should create the output file."""
        data = read_sprint(minimal_sprint_file)
        out_path = tmp_path / "output.yaml"

        write_sprint(out_path, data)

        assert out_path.exists()
        assert out_path.stat().st_size > 0

    def test_write_overwrites_existing(self, tmp_path: Path, minimal_sprint_file: Path) -> None:
        """write_sprint should overwrite an existing file."""
        out_path = tmp_path / "output.yaml"
        out_path.write_text("old content")

        data = read_sprint(minimal_sprint_file)
        write_sprint(out_path, data)

        content = out_path.read_text()
        assert "old content" not in content
        assert "sprint:" in content

    def test_no_temp_file_left_on_success(self, tmp_path: Path, minimal_sprint_file: Path) -> None:
        """No .yaml.tmp file should remain after successful write."""
        data = read_sprint(minimal_sprint_file)
        out_path = tmp_path / "output.yaml"

        write_sprint(out_path, data)

        tmp_file = out_path.with_suffix(".yaml.tmp")
        assert not tmp_file.exists()

    def test_original_preserved_on_dump_failure(
        self, tmp_path: Path, minimal_sprint_file: Path
    ) -> None:
        """If serialization fails, the original file must be untouched."""
        out_path = tmp_path / "output.yaml"
        original_content = "original: content\n"
        out_path.write_text(original_content)

        # Pass something that can't be serialized
        with pytest.raises((TypeError, ValueError, Exception)):
            write_sprint(out_path, object())

        assert out_path.read_text() == original_content

    def test_write_to_nonexistent_directory_fails(self) -> None:
        """Writing to a non-existent directory should raise an error."""
        bad_path = Path("/nonexistent/dir/sprint.yaml")

        with pytest.raises((OSError, FileNotFoundError)):
            write_sprint(bad_path, {"sprint": {}, "epics": []})

    def test_write_uses_same_directory_for_temp(
        self, tmp_path: Path, minimal_sprint_file: Path
    ) -> None:
        """Temp file should be in the same directory as target (for atomic rename)."""
        data = read_sprint(minimal_sprint_file)
        out_path = tmp_path / "subdir" / "sprint.yaml"
        out_path.parent.mkdir(parents=True)

        write_sprint(out_path, data)

        # If temp was in a different filesystem, os.replace would fail
        # Success here means temp was in same directory
        assert out_path.exists()

    def test_write_file_is_valid_yaml(self, tmp_path: Path, full_sprint_file: Path) -> None:
        """Written file must be parseable as valid YAML."""
        import yaml

        data = read_sprint(full_sprint_file)
        out_path = tmp_path / "output.yaml"

        write_sprint(out_path, data)

        # Should be parseable by standard PyYAML
        with open(out_path) as f:
            parsed = yaml.safe_load(f)

        assert isinstance(parsed, dict)
        assert "sprint" in parsed
        assert "epics" in parsed


# =============================================================================
# AC4: Key ordering matches sprint-template.yaml
# =============================================================================


class TestKeyOrdering:
    """Keys in output must follow sprint-template.yaml ordering."""

    def test_sprint_key_order_constant_defined(self) -> None:
        """SPRINT_KEY_ORDER constant should list expected sprint keys."""
        assert "name" in SPRINT_KEY_ORDER
        assert "jira_sprint_id" in SPRINT_KEY_ORDER
        assert "goal" in SPRINT_KEY_ORDER
        assert "status" in SPRINT_KEY_ORDER
        # name should come before status
        assert SPRINT_KEY_ORDER.index("name") < SPRINT_KEY_ORDER.index("status")

    def test_epic_key_order_constant_defined(self) -> None:
        """EPIC_KEY_ORDER constant should list expected epic keys."""
        assert "id" in EPIC_KEY_ORDER
        assert "title" in EPIC_KEY_ORDER
        assert "stories" in EPIC_KEY_ORDER
        # id should come first, stories last
        assert EPIC_KEY_ORDER.index("id") == 0
        assert EPIC_KEY_ORDER.index("stories") == len(EPIC_KEY_ORDER) - 1

    def test_story_key_order_constant_defined(self) -> None:
        """STORY_KEY_ORDER constant should list expected story keys."""
        assert "id" in STORY_KEY_ORDER
        assert "title" in STORY_KEY_ORDER
        assert "points" in STORY_KEY_ORDER
        assert "acceptance_criteria" in STORY_KEY_ORDER
        # id should come first
        assert STORY_KEY_ORDER.index("id") == 0
        # acceptance_criteria after status
        assert STORY_KEY_ORDER.index("acceptance_criteria") > STORY_KEY_ORDER.index("status")

    def test_sprint_keys_in_canonical_order(self, full_sprint_file: Path) -> None:
        """Sprint section keys should follow SPRINT_KEY_ORDER."""
        data = read_sprint(full_sprint_file)
        output = canonical_dump(data)

        # Extract sprint section key positions
        lines = output.split("\n")
        sprint_keys = []
        in_sprint = False
        for line in lines:
            if line.startswith("sprint:"):
                in_sprint = True
                continue
            if in_sprint and line and not line.startswith(" "):
                break
            if in_sprint and line.startswith("  ") and ":" in line:
                key = line.strip().split(":")[0]
                sprint_keys.append(key)

        # Verify ordering matches SPRINT_KEY_ORDER (for keys that are present)
        expected_order = [k for k in SPRINT_KEY_ORDER if k in sprint_keys]
        assert sprint_keys == expected_order

    def test_epic_keys_in_canonical_order(self, full_sprint_file: Path) -> None:
        """Epic section keys should follow EPIC_KEY_ORDER."""
        data = read_sprint(full_sprint_file)
        output = canonical_dump(data)

        # Parse to find epic keys in order
        lines = output.split("\n")
        epic_keys = []
        in_epic = False
        indent_level = None
        for line in lines:
            stripped = line.lstrip()
            current_indent = len(line) - len(stripped)

            if stripped.startswith("- id:") and "epic" in str(line):
                in_epic = True
                indent_level = current_indent + 2  # keys are 2 spaces after "- "
                epic_keys.append("id")
                continue

            if in_epic:
                if stripped and current_indent < indent_level and not stripped.startswith("- "):
                    break
                if current_indent == indent_level and ":" in stripped:
                    key = stripped.split(":")[0]
                    if key != "-":
                        epic_keys.append(key)
                # Stop at stories section content
                if stripped.startswith("stories:"):
                    break

        expected_order = [k for k in EPIC_KEY_ORDER if k in epic_keys]
        assert epic_keys == expected_order

    def test_story_keys_in_canonical_order(self, full_sprint_file: Path) -> None:
        """Story keys should follow STORY_KEY_ORDER."""
        data = read_sprint(full_sprint_file)
        output = canonical_dump(data)

        # Find first story's keys
        lines = output.split("\n")
        story_keys = []
        in_stories = False
        in_story = False
        story_indent = None
        for line in lines:
            stripped = line.lstrip()
            current_indent = len(line) - len(stripped)

            if "stories:" in line:
                in_stories = True
                continue

            if in_stories and stripped.startswith("- id:"):
                if in_story:
                    break  # We only want the first story
                in_story = True
                story_indent = current_indent + 2
                story_keys.append("id")
                continue

            if in_story:
                if stripped and current_indent < story_indent and not stripped.startswith("- "):
                    break
                if current_indent == story_indent and ":" in stripped:
                    key = stripped.split(":")[0]
                    if key != "-":
                        story_keys.append(key)

        expected_order = [k for k in STORY_KEY_ORDER if k in story_keys]
        assert story_keys == expected_order

    def test_scrambled_keys_reordered(self, tmp_path: Path, scrambled_keys_file: Path) -> None:
        """Reading scrambled keys and dumping should produce canonical order."""
        data = read_sprint(scrambled_keys_file)
        output = canonical_dump(data)

        # Sprint keys should be reordered
        lines = output.split("\n")
        sprint_keys = []
        in_sprint = False
        for line in lines:
            if line.startswith("sprint:"):
                in_sprint = True
                continue
            if in_sprint and line and not line.startswith(" "):
                break
            if in_sprint and line.startswith("  ") and ":" in line:
                key = line.strip().split(":")[0]
                sprint_keys.append(key)

        # "name" should come before "status" (template order)
        assert sprint_keys.index("name") < sprint_keys.index("status")
        # "jira_sprint_id" should come before "goal"
        assert sprint_keys.index("jira_sprint_id") < sprint_keys.index("goal")

    def test_unknown_keys_preserved_at_end(self, tmp_path: Path) -> None:
        """Keys not in the template should be preserved, appended after known keys."""
        content = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Test
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  custom_field: extra value
epics: []
"""
        p = tmp_path / "custom.yaml"
        p.write_text(content)

        data = read_sprint(p)
        output = canonical_dump(data)

        # custom_field should still be present
        assert "custom_field" in output
        # And should come after all known keys
        lines = output.split("\n")
        sprint_keys = []
        in_sprint = False
        for line in lines:
            if line.startswith("sprint:"):
                in_sprint = True
                continue
            if in_sprint and line and not line.startswith(" "):
                break
            if in_sprint and line.startswith("  ") and ":" in line:
                key = line.strip().split(":")[0]
                sprint_keys.append(key)

        assert sprint_keys[-1] == "custom_field"


# =============================================================================
# read_sprint error handling
# =============================================================================


class TestReadSprint:
    """Tests for read_sprint function."""

    def test_read_valid_file(self, minimal_sprint_file: Path) -> None:
        """Should successfully read a valid sprint YAML file."""
        data = read_sprint(minimal_sprint_file)

        assert data is not None
        assert "sprint" in data
        assert "epics" in data
        assert data["sprint"]["name"] == "TO Sprint 2604"

    def test_read_nonexistent_file(self) -> None:
        """Should raise FileNotFoundError for missing file."""
        with pytest.raises(FileNotFoundError):
            read_sprint(Path("/nonexistent/file.yaml"))

    def test_read_malformed_yaml(self, tmp_path: Path) -> None:
        """Should raise ValueError for malformed YAML."""
        bad = tmp_path / "bad.yaml"
        bad.write_text("this: is: not: [valid yaml")

        with pytest.raises((ValueError, Exception)):
            read_sprint(bad)

    def test_read_empty_file(self, tmp_path: Path) -> None:
        """Should handle empty file gracefully."""
        empty = tmp_path / "empty.yaml"
        empty.write_text("")

        with pytest.raises((ValueError, Exception)):
            read_sprint(empty)

    def test_read_preserves_key_order(self, full_sprint_file: Path) -> None:
        """Reading should preserve the key ordering from the file."""
        data = read_sprint(full_sprint_file)

        # The returned type should maintain insertion order
        sprint_keys = list(data["sprint"].keys())
        assert sprint_keys[0] == "name"

    def test_read_preserves_types(self, full_sprint_file: Path) -> None:
        """Reading should preserve correct Python types."""
        data = read_sprint(full_sprint_file)

        assert isinstance(data["sprint"]["jira_sprint_id"], int)
        assert isinstance(data["sprint"]["name"], str)
        assert isinstance(data["epics"], list)
        assert isinstance(data["epics"][0]["stories"], list)
        assert isinstance(data["epics"][0]["stories"][0]["points"], int)


# =============================================================================
# Sharded format support
# =============================================================================


SHARDED_INDEX_YAML = """\
sprint:
  name: "TO Sprint 2606"
  jira_sprint_id: 309
  jira_sprint_name: "TO Sprint 2606"
  goal: Test sharding
  start_date: 2026-02-02
  end_date: 2026-02-15
  status: active
epics:
  - PROJ-14298
  - "40"
stories: []
"""

SHARD_JIRA_YAML = """\
id: PROJ-14298
type: epic
title: "Epic: Stepped Workflow"
priority: P1
status: in_progress
jira: PROJ-14298
stories:
  - id: PROJ-14299
    title: Wire up stepped workflow
    points: 5
    priority: P0
    status: done
"""

SHARD_INTERNAL_YAML = """\
id: 40
type: epic
title: "Epic: Scale Adaptation"
priority: P2
status: backlog
stories:
  - id: 40-1
    title: First story
    points: 3
    priority: P1
    status: backlog
"""


@pytest.fixture
def sharded_sprint_dir(tmp_path: Path) -> Path:
    """Create a sharded sprint directory structure."""
    (tmp_path / "current-sprint.yaml").write_text(SHARDED_INDEX_YAML)
    (tmp_path / "epic-PROJ-14298.yaml").write_text(SHARD_JIRA_YAML)
    (tmp_path / "epic-40.yaml").write_text(SHARD_INTERNAL_YAML)
    return tmp_path


class TestShardedReadWrite:
    """Tests for sharded epic format in yaml_io."""

    def test_read_merges_shards(self, sharded_sprint_dir: Path) -> None:
        """read_sprint should merge shard files into full epics."""
        data = read_sprint(sharded_sprint_dir / "current-sprint.yaml")

        assert len(data["epics"]) == 2
        assert data["epics"][0]["id"] == "PROJ-14298"
        assert data["epics"][1]["id"] == 40
        assert len(data["epics"][0]["stories"]) == 1
        assert len(data["epics"][1]["stories"]) == 1

    def test_write_preserves_sharded_format(self, sharded_sprint_dir: Path) -> None:
        """write_sprint should write back to shard files when format is sharded."""
        index_path = sharded_sprint_dir / "current-sprint.yaml"
        data = read_sprint(index_path)

        # Mutate a story
        data["epics"][1]["stories"][0]["status"] = "in_progress"

        write_sprint(index_path, data)

        # Index should still have string refs
        import yaml

        with open(index_path) as f:
            raw_index = yaml.safe_load(f)
        assert isinstance(raw_index["epics"][0], str)
        assert raw_index["epics"][0] == "PROJ-14298"

        # Shard file should have the updated story
        shard = read_sprint(sharded_sprint_dir / "epic-40.yaml")
        assert shard["stories"][0]["status"] == "in_progress"

    def test_sharded_round_trip(self, sharded_sprint_dir: Path) -> None:
        """Read-write-read on sharded format should be stable."""
        index_path = sharded_sprint_dir / "current-sprint.yaml"

        data1 = read_sprint(index_path)
        write_sprint(index_path, data1)
        data2 = read_sprint(index_path)

        assert canonical_dump(data1) == canonical_dump(data2)

    def test_promote_preserves_existing_shards(self, sharded_sprint_dir: Path) -> None:
        """Adding an inline epic dict must not delete existing shard files.

        Regression test: epic_promote reads the raw index (string refs) and
        appends a new epic as a dict.  write_sprint must not treat the
        existing string-ref shards as stale.
        """
        import yaml

        index_path = sharded_sprint_dir / "current-sprint.yaml"

        # Simulate what epic_promote does: read raw index, append inline dict
        with open(index_path) as f:
            raw_data = yaml.safe_load(f)

        # raw_data["epics"] is ['PROJ-14298', '40'] (string refs)
        new_epic = {
            "id": "99",
            "type": "epic",
            "title": "Epic: Promoted Epic",
            "status": "backlog",
            "stories": [
                {"id": "99-1", "title": "First story", "points": 2, "status": "backlog"},
            ],
        }
        raw_data["epics"].append(new_epic)

        write_sprint(index_path, raw_data)

        # Existing shard files must still exist
        assert (sharded_sprint_dir / "epic-PROJ-14298.yaml").exists(), (
            "Existing shard epic-PROJ-14298.yaml was deleted"
        )
        assert (sharded_sprint_dir / "epic-40.yaml").exists(), (
            "Existing shard epic-40.yaml was deleted"
        )

        # New shard must be created
        assert (sharded_sprint_dir / "epic-99.yaml").exists(), (
            "New shard epic-99.yaml was not created"
        )

        # Index should have all three as string refs
        with open(index_path) as f:
            updated_index = yaml.safe_load(f)
        assert len(updated_index["epics"]) == 3
        assert all(isinstance(e, str) for e in updated_index["epics"])

    def test_non_sharded_write_unchanged(self, tmp_path: Path, full_sprint_file: Path) -> None:
        """write_sprint on non-sharded data should write a single file."""
        data = read_sprint(full_sprint_file)
        out_path = tmp_path / "output.yaml"

        write_sprint(out_path, data)

        # Should be a single file, no shard files created
        import yaml

        with open(out_path) as f:
            raw = yaml.safe_load(f)
        assert isinstance(raw["epics"][0], dict)  # Full dicts, not refs
