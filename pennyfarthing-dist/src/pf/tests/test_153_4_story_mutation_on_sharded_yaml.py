"""Tests for story 153-4: sprint story remove/update/finish on sharded YAML.

Story: 153-4 — `pf sprint story remove/update/finish` all fail to locate
stories in epic shard files (BLOCKING: breaks SM finish ceremony).

Three CLI surfaces are involved:

1. ``pf sprint story remove`` (``story_remove.remove_story``)
2. ``pf sprint story update`` (``story_update.update_story``)
3. ``pf sprint story finish`` (``story_finish.finish_story`` →
   ``story_transition.transition_story``)

Coverage gaps these tests close:

* ``remove_story`` has no existing test coverage at all — neither against a
  sharded sprint nor as a CLI command. Tests pin the shard-aware contract
  (locate via merged ``read_sprint`` view, write back via shard-aware
  ``write_sprint``).
* Jira-key lookup. Every mutation path splits ``story_id`` on ``"-"`` and
  uses ``parts[0]`` as the epic discriminator. For a Jira-keyed story id
  like ``PROJ-99999``, ``parts[0]`` is ``"PROJ"`` which never matches a
  real epic id. The shard-stored story is never located even though
  ``read_sprint`` merged it into ``data``. Story 151-3 fixed update_story
  for *local* IDs but did not address Jira-key lookups on shard stories.
* End-to-end repro from the bug description (``epic add`` → ``story add``
  → ``story remove`` → re-add → ``story update``).

These tests are written RED first. Some pass already on HEAD (151-3 work
fixed the local-ID update path); the Jira-key cases and the missing
``remove_story`` coverage are the actual RED cases for 153-4.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from pf.sprint.loader import find_epic, find_story
from pf.sprint.story_finish import finish_story
from pf.sprint.story_remove import remove_story, story_remove_command
from pf.sprint.story_transition import transition_story
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — sharded sprint with mixed-id epics
# =============================================================================

# Index file: epics as string refs (sharded). No top-level "stories" list to
# prevent a fallback lookup from accidentally hiding shard-lookup failures.
SHARDED_INDEX_YAML = """\
sprint:
  name: "Sharded153-4"
  goal: shard mutation coverage
  start_date: 2026-05-01
  end_date: 2026-05-14
  status: active
  number: 1
epics:
  - PROJ-17079
  - "152"
  - E
"""

# Epic shard with a Jira key — file name == epic-PROJ-17079.yaml
SHARD_JIRA_YAML = """\
id: "151"
type: epic
title: "Sprint YAML write correctness"
priority: p0
status: in_progress
jira: PROJ-17079
stories:
  - id: 151-3
    jira: PROJ-17082
    title: shard story with jira key
    points: 3
    priority: p0
    status: in_progress
    workflow: tdd
  - id: 151-4
    jira: PROJ-17083
    title: sibling shard story
    points: 2
    priority: p1
    status: backlog
    workflow: tdd
"""

# Epic shard without a Jira key — file name == epic-152.yaml
SHARD_NOJIRA_YAML = """\
id: "152"
type: epic
title: "Numeric-only Epic"
priority: p1
status: in_progress
stories:
  - id: 152-1
    title: numeric-id story (no jira)
    points: 2
    priority: p1
    status: in_progress
    workflow: trivial
  - id: 152-2
    title: sibling numeric story
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
"""

# Epic shard with single-letter id — exercise the bug repro's "E" epic
SHARD_LETTER_YAML = """\
id: E
type: epic
title: Test epic
priority: p1
status: backlog
repos: pennyfarthing
stories:
  - id: E-1
    title: Story one
    points: 1
    priority: p1
    status: backlog
    repos: pennyfarthing
    workflow: tdd
"""

SHARD_SESSION = """\
---
story_id: "151-3"
jira_key: "PROJ-17082"
epic: "PROJ-17079"
workflow: "tdd"
---

# Story 151-3: shard story used to drive finish_story tests

## Story Details
- **ID:** 151-3
- **Jira:** PROJ-17082
- **Workflow:** tdd
- **Branch:** none
"""
# Branch is the none-sentinel (155-34 pre-adjustment): these worlds pin shard
# mutation during finish, not branch verification — the sentinel stays on the
# accepted no-PR arm before and after the 155-34 unmerged-branch guard.


@pytest.fixture
def sharded_sprint_dir(tmp_path: Path) -> Path:
    """Sharded sprint dir with three epic shards (jira-keyed, numeric, letter)."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SHARDED_INDEX_YAML)
    (sprint_dir / "epic-PROJ-17079.yaml").write_text(SHARD_JIRA_YAML)
    (sprint_dir / "epic-152.yaml").write_text(SHARD_NOJIRA_YAML)
    (sprint_dir / "epic-E.yaml").write_text(SHARD_LETTER_YAML)
    (sprint_dir / "archive").mkdir()
    return sprint_dir


@pytest.fixture
def sharded_project(tmp_path: Path) -> Path:
    """Full project layout (sprint/ + .session/) so finish_story can run."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SHARDED_INDEX_YAML)
    (sprint_dir / "epic-PROJ-17079.yaml").write_text(SHARD_JIRA_YAML)
    (sprint_dir / "epic-152.yaml").write_text(SHARD_NOJIRA_YAML)
    (sprint_dir / "epic-E.yaml").write_text(SHARD_LETTER_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "151-3-session.md").write_text(SHARD_SESSION)
    return tmp_path


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# Helpers
# =============================================================================


def _read_shard_stories(sprint_dir: Path, shard_filename: str) -> list[dict]:
    """Read the raw stories list from a shard file (no index merging)."""
    shard = read_sprint(sprint_dir / shard_filename)
    return list(shard.get("stories", []))


def _read_shard_story(sprint_dir: Path, shard_filename: str, story_id: str) -> dict:
    """Read a single story by id directly from the shard file."""
    for story in _read_shard_stories(sprint_dir, shard_filename):
        if story.get("id") == story_id:
            return story
    raise AssertionError(
        f"Story {story_id} not in shard {shard_filename}; "
        f"available ids: {[s.get('id') for s in _read_shard_stories(sprint_dir, shard_filename)]}"
    )


# =============================================================================
# AC1 — remove_story() API on sharded YAML (no prior coverage)
# =============================================================================


class TestRemoveStoryOnShardedYaml:
    """`remove_story` must locate, remove, and persist deletion to the shard
    file for stories that live inside an epic shard. The 151-3 work covered
    update_story but did not add equivalent tests for remove_story.
    """

    def test_remove_persists_to_jira_keyed_shard(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Removing a shard story must delete it from the shard file."""
        result = remove_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
        )
        assert result["success"] is True, result

        remaining_ids = [
            s.get("id")
            for s in _read_shard_stories(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        ]
        assert "151-3" not in remaining_ids, (
            f"151-3 should be gone from shard; got: {remaining_ids}"
        )

    def test_remove_persists_to_numeric_only_shard(
        self, sharded_sprint_dir: Path
    ) -> None:
        """A shard whose epic has no Jira key must also be writable."""
        result = remove_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="152-1",
        )
        assert result["success"] is True, result

        remaining_ids = [
            s.get("id")
            for s in _read_shard_stories(sharded_sprint_dir, "epic-152.yaml")
        ]
        assert "152-1" not in remaining_ids

    def test_remove_does_not_disturb_sibling_shard_stories(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Removing one story must not touch siblings in the same shard."""
        result = remove_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
        )
        assert result["success"] is True, result
        sibling = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-4"
        )
        # 151-4 untouched
        assert sibling["status"] == "backlog"
        assert sibling["points"] == 2
        assert sibling["jira"] == "PROJ-17083"

    def test_remove_returns_failure_for_unknown_story(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Unknown story must return success: False, not raise."""
        result = remove_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="999-1",
        )
        assert result["success"] is False
        assert "error" in result and "999-1" in result["error"]

    def test_remove_dry_run_does_not_mutate_shard(
        self, sharded_sprint_dir: Path
    ) -> None:
        """`dry_run=True` must report the planned removal without writing."""
        result = remove_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            dry_run=True,
        )
        assert result["success"] is True
        assert result.get("dry_run") is True

        # Story still present
        ids = [
            s.get("id")
            for s in _read_shard_stories(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        ]
        assert "151-3" in ids, "dry_run must not mutate the shard"


# =============================================================================
# AC1b — `pf sprint story remove` CLI on sharded YAML
# =============================================================================


class TestStoryRemoveCommandOnShardedYaml:
    """End-to-end CLI runner coverage for `pf sprint story remove` against
    a sharded sprint. Locks in the shard-aware contract at the CLI surface.
    """

    def test_cli_remove_persists_to_shard(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        result = runner.invoke(
            story_remove_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "151-3",
            ],
        )
        assert result.exit_code == 0, result.output

        ids = [
            s.get("id")
            for s in _read_shard_stories(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        ]
        assert "151-3" not in ids

    def test_cli_remove_unknown_id_exits_nonzero(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        result = runner.invoke(
            story_remove_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "999-1",
            ],
        )
        assert result.exit_code != 0
        assert "999-1" in result.output


# =============================================================================
# AC2/AC3/AC5 — Jira-key lookup on shard-stored stories (BUG)
# =============================================================================


class TestJiraKeyLookupOnShardedStory:
    """When a story has a Jira key (e.g. PROJ-17082) and lives inside an
    epic shard, mutation commands must locate it by *either* its local id
    or its Jira key.

    All three commands today split the story_id on ``-`` and use
    ``parts[0]`` as the epic discriminator. For ``PROJ-17082`` that yields
    ``"PROJ"``, which never matches the real epic id (``151`` or
    ``PROJ-17079``). The shard story is therefore unreachable by Jira key.

    These are the still-RED cases that 153-4 must fix.
    """

    def test_update_by_jira_key_finds_shard_story(
        self, sharded_sprint_dir: Path
    ) -> None:
        """`update_story(story_id=PROJ-17082)` must mutate the matching shard story."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="PROJ-17082",
            status="in_review",
        )
        assert result["success"] is True, (
            f"update_story should locate shard story via Jira key, got: {result}"
        )

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["status"] == "in_review"

    def test_remove_by_jira_key_finds_shard_story(
        self, sharded_sprint_dir: Path
    ) -> None:
        """`remove_story(story_id=PROJ-17082)` must delete the matching shard story."""
        result = remove_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="PROJ-17082",
        )
        assert result["success"] is True, (
            f"remove_story should locate shard story via Jira key, got: {result}"
        )

        ids = [
            s.get("id")
            for s in _read_shard_stories(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        ]
        assert "151-3" not in ids

    def test_transition_by_jira_key_finds_shard_story(
        self, sharded_project: Path
    ) -> None:
        """`transition_story(story_id=PROJ-17082)` must locate shard story.

        finish_story drives the ceremony via transition_story; if this
        fails, finish fails the same way the original bug describes.
        """
        result = transition_story(
            sharded_project, "PROJ-17082", "in_review"
        )
        assert result["success"] is True, (
            f"transition_story should locate shard story via Jira key, got: {result}"
        )

        # Verify the status flip actually persisted to the shard file
        story = _read_shard_story(
            sharded_project / "sprint", "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["status"] == "in_review"

    def test_cli_update_by_jira_key_persists_to_shard(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """End-to-end CLI: `pf sprint story update <jira_key> --status X`."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "PROJ-17082",
                "--status",
                "in_review",
            ],
        )
        assert result.exit_code == 0, result.output

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["status"] == "in_review"

    def test_cli_remove_by_jira_key_persists_to_shard(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """End-to-end CLI: `pf sprint story remove <jira_key>`."""
        result = runner.invoke(
            story_remove_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "PROJ-17082",
            ],
        )
        assert result.exit_code == 0, result.output

        ids = [
            s.get("id")
            for s in _read_shard_stories(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        ]
        assert "151-3" not in ids


# =============================================================================
# AC4 — Bug repro end-to-end
# =============================================================================


class TestBugReproEndToEnd:
    """The exact repro from the 153-4 bug description must run clean.

    Uses the `pf sprint epic add` + `pf sprint story add` + `pf sprint
    story remove` + `pf sprint story update` chain via the Click runner.
    This exercises the empty-`epics:` starting state from the repro and
    proves the shared loader path is wired end-to-end.
    """

    def test_full_repro_succeeds(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """epic add → story add → story remove → story add → story update.

        All four steps must exit 0; no `not found` errors anywhere.
        """
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        index = sprint_dir / "current-sprint.yaml"
        index.write_text(
            "sprint:\n"
            "  name: test\n"
            "  goal: test\n"
            "  start_date: '2026-01-01'\n"
            "  end_date: '2026-01-14'\n"
            "  status: active\n"
            "  number: 1\n"
            "epics: []\n"
        )

        from pf.sprint.epic_add import epic_add_command
        from pf.sprint.story_add import story_add_command

        # Step 1: epic add
        r1 = runner.invoke(
            epic_add_command,
            ["--sprint-file", str(index), "E", "Test epic", "--priority", "p1"],
        )
        assert r1.exit_code == 0, f"epic add failed: {r1.output}"

        # Step 2: story add
        r2 = runner.invoke(
            story_add_command,
            ["--sprint-file", str(index), "E", "Story one", "1"],
        )
        assert r2.exit_code == 0, f"story add failed: {r2.output}"

        # Step 3: story remove
        r3 = runner.invoke(
            story_remove_command,
            ["--sprint-file", str(index), "E-1"],
        )
        assert r3.exit_code == 0, f"story remove failed: {r3.output}"

        # Step 4: re-add a story so update has something to operate on
        r4 = runner.invoke(
            story_add_command,
            ["--sprint-file", str(index), "E", "Story one", "1"],
        )
        assert r4.exit_code == 0, f"second story add failed: {r4.output}"

        # Step 5: story update
        r5 = runner.invoke(
            story_update_command,
            ["--sprint-file", str(index), "E-1", "--status", "in_review"],
        )
        assert r5.exit_code == 0, f"story update failed: {r5.output}"

        # Final state: confirm the update persisted to the shard file
        story = _read_shard_story(sprint_dir, "epic-E.yaml", "E-1")
        assert story["status"] == "in_review", (
            f"Update reported exit 0 but shard status is {story.get('status')!r}"
        )


# =============================================================================
# AC6 — Shared loader contract (anti-regression)
# =============================================================================


class TestSharedLoaderContract:
    """Mutation modules must use ``read_sprint`` / ``write_sprint`` (which
    merge & write shards) and not the raw ``_read_yaml_file`` /
    ``_write_yaml_file`` helpers directly. If a future refactor reaches for
    the raw helpers in these modules, the bug returns silently — pin the
    contract here.
    """

    def test_story_remove_uses_shard_aware_io(self) -> None:
        from pf.sprint import story_remove

        src = Path(story_remove.__file__).read_text()
        assert "read_sprint" in src, "story_remove must use read_sprint"
        assert "write_sprint" in src, "story_remove must use write_sprint"
        assert "_read_yaml_file" not in src, (
            "story_remove must not bypass shard merging via _read_yaml_file"
        )
        assert "_write_yaml_file" not in src, (
            "story_remove must not bypass shard writes via _write_yaml_file"
        )

    def test_story_update_uses_shard_aware_io(self) -> None:
        from pf.sprint import story_update

        src = Path(story_update.__file__).read_text()
        assert "read_sprint" in src
        assert "write_sprint" in src
        assert "_read_yaml_file" not in src
        assert "_write_yaml_file" not in src

    def test_story_transition_uses_shard_aware_io(self) -> None:
        from pf.sprint import story_transition

        src = Path(story_transition.__file__).read_text()
        assert "read_sprint" in src
        assert "write_sprint" in src
        assert "_read_yaml_file" not in src
        assert "_write_yaml_file" not in src


# =============================================================================
# AC3 — finish_story full success path on sharded YAML
# =============================================================================


class TestFinishStorySuccessOnShardedYaml:
    """151-3 only covered the *failure* path of finish_story on sharded
    YAML. The success path also needs coverage so a regression that breaks
    shard lookup during finish does not slip through.
    """

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_marks_shard_story_done(
        self,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        sharded_project: Path,
    ) -> None:
        """When the ceremony succeeds, the shard story status flips to done."""
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(sharded_project, "151-3")

        assert result["success"] is True, result

        # Verify the shard file got updated, not just an in-memory dict
        story = _read_shard_story(
            sharded_project / "sprint", "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["status"] == "done"
        assert "completed" in story

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_by_jira_key_from_backlog_completes_ceremony(
        self,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        sharded_project: Path,
    ) -> None:
        """Regression for the Reviewer-found bug: finish_story was reaching into
        the old `find_epic(data, parts[0])` pattern at line ~241 to read the
        current status before deciding which bridge transitions to fire. For a
        Jira-keyed story_id (e.g. PROJ-*), parts[0] is "PROJ" and never matches
        any epic id, so current_status silently defaulted to "in_progress" —
        skipping the backlog→in_progress bridge for stories actually still at
        backlog. The subsequent in_progress→in_review transition then failed
        from-state validation, and the final →done failed too.

        After migrating that lookup to `find_story_in_data`, finishing a
        backlog-status shard story by Jira key must complete the ceremony and
        land the story at `done`.
        """
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        # 151-4 is at status=backlog in the shard fixture and has jira=PROJ-17083
        # finish_story looks for the session at .session/{story_id}-session.md,
        # so when invoked with a Jira key the session must be at that name
        session_dir = sharded_project / ".session"
        (session_dir / "PROJ-17083-session.md").write_text(
            "---\n"
            'story_id: "151-4"\n'
            'jira_key: "PROJ-17083"\n'
            'epic: "PROJ-17079"\n'
            'workflow: "tdd"\n'
            "---\n\n# Story 151-4\n\n"
            # Sentinel branch (155-34 pre-adjustment): this test pins the
            # Jira-key backlog bridge; a fieldless session would now trip the
            # 155-34 unresolvable-world abort.
            "## Story Details\n- **Branch:** none\n"
        )

        result = finish_story(sharded_project, "PROJ-17083")

        assert result["success"] is True, (
            f"finish_story by Jira key starting from backlog must complete: {result}"
        )

        # Verify the shard story ended up at done
        story = _read_shard_story(
            sharded_project / "sprint", "epic-PROJ-17079.yaml", "151-4"
        )
        assert story["status"] == "done"
        assert "completed" in story

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_does_not_disturb_sibling_shard_story(
        self,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        sharded_project: Path,
    ) -> None:
        """Finishing 151-3 must not change 151-4 in the same shard."""
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        finish_story(sharded_project, "151-3")

        sibling = _read_shard_story(
            sharded_project / "sprint", "epic-PROJ-17079.yaml", "151-4"
        )
        assert sibling["status"] == "backlog"
        assert "completed" not in sibling


# =============================================================================
# Loader sanity — confirms read_sprint already merges (regression guard)
# =============================================================================


class TestReadSprintMergesShards:
    """Pin the precondition the bug description relied on: ``read_sprint``
    already returns merged data. The bug is in the *callers* using that
    data, not in the loader.
    """

    def test_read_sprint_returns_merged_shard_stories(
        self, sharded_sprint_dir: Path
    ) -> None:
        data = read_sprint(sharded_sprint_dir / "current-sprint.yaml")

        epic_ids = {str(e.get("id", "")) for e in data["epics"]}
        # All three shard epics should be merged in
        assert {"151", "152", "E"}.issubset(epic_ids), (
            f"read_sprint should merge all shards; got: {epic_ids}"
        )

        # And the stories within them should be reachable via find_story
        epic_151 = find_epic(data, "151")
        assert epic_151 is not None
        assert find_story(epic_151, "151-3") is not None
