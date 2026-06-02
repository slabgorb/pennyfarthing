"""Tests for `pf context create {story,epic}` — Story 153-6.

Story 153-6: sm-setup does not create `sprint/context/context-story-{ID}.md`,
but the TDD workflow's `tea-context` entry gate (and the `sm-setup-exit`
gate's story-context check) call `pf validate context-story {ID}` and expect
that file to exist. The `sm-setup-exit` gate currently has an escape hatch
(accept an "SM Assessment" section in the session file instead), and the
`create_context` recovery action declared in `tdd.yaml` is *parsed* by
`pf.handoff.gate_recovery.get_recovery_actions()` but never *executed* —
there is no code anywhere that actually produces the file.

DECISION (Option A, per session file + SOUL #11 "Automatic Beats
Instructional"): provide a deterministic, non-interactive generator that
reads the story from the sprint YAML and writes a populated
`sprint/context/context-story-{ID}.md`. A Haiku sm-setup subagent following a
markdown instruction is exactly the kind of "instructional" behavior SOUL #11
says to promote to a script, so the generator must be a real command, not a
prose step. The existing interactive `/pf-context create story` *skill*
(tandem-requiring, agent-driven) cannot be called by sm-setup or the recovery
pipeline; this command is its non-interactive backing.

TEA design notes / seam choice:
- The generator is exercised through the `pf context` CLI group
  (`pf.context.cli:context`) — the same stable seam style as the 153-5 suite
  (`test_153_5_validate_context_story.py`) — so internal module/function names
  stay free for Dev to choose. Tests assert *behavior* (file created, required
  sections present, `pf validate context-story` passes), not internals.
- Story dicts in the sprint shards carry `id, title, points, priority,
  status, repos, workflow, type` and *optionally* `acceptance_criteria` /
  `description`. Real shard stories (e.g. 153-6 itself) have NO
  `acceptance_criteria` field. The generator must therefore degrade
  gracefully when ACs are absent and still produce a valid (non-empty,
  sectioned) file — this is pinned by `TestGracefulWhenAcsAbsent`.

RED state: these tests fail until `pf context create story {ID}` exists and
generates a populated, validator-passing context file. The chain test
(`TestGenerateThenValidatePasses`) is the load-bearing contract — it proves
the generated artifact satisfies the exact validator the gates run.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.context.cli import context as context_group
from pf.validate.cli import validate as validate_group

# =============================================================================
# Fixtures
# =============================================================================


def _sprint_with_story(*, with_acs: bool) -> str:
    """Return current-sprint.yaml text with one epic and story 9-9.

    Story 9-9 mirrors the field shape of a real shard story. When
    ``with_acs`` is False the story carries no ``acceptance_criteria`` key —
    the common case for real shard stories (153-6 has none).
    """
    acs_block = (
        "        acceptance_criteria:\n"
        "          - The first acceptance criterion AC-ALPHA\n"
        "          - The second acceptance criterion AC-BETA\n"
        if with_acs
        else ""
    )
    return (
        "sprint:\n"
        "  name: Test Sprint\n"
        "  number: 2610\n"
        "epics:\n"
        "  - id: epic-9\n"
        "    jira: PROJ-900\n"
        "    title: Test Epic Nine\n"
        "    description: An epic that exists to test context generation.\n"
        "    status: active\n"
        "    stories:\n"
        "      - id: 9-9\n"
        "        title: Generate context for the fixture story\n"
        "        points: 3\n"
        "        priority: p2\n"
        "        status: in_progress\n"
        "        workflow: tdd\n"
        "        repos: pennyfarthing\n"
        "        type: bug\n" + acs_block
    )


def _build_project(tmp_path: Path, *, with_acs: bool) -> Path:
    """Build a minimal project root that the sprint loader can read.

    Layout:
        <tmp>/.pennyfarthing/                 (project marker)
        <tmp>/sprint/current-sprint.yaml      (monolithic sprint, story 9-9)
        <tmp>/sprint/context/                  (empty — no context file yet)
    """
    (tmp_path / ".pennyfarthing").mkdir()
    sprint_dir = tmp_path / "sprint"
    (sprint_dir / "context").mkdir(parents=True)
    (sprint_dir / "current-sprint.yaml").write_text(
        _sprint_with_story(with_acs=with_acs), encoding="utf-8"
    )
    return tmp_path


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


@pytest.fixture
def project_with_acs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Project whose story 9-9 carries an acceptance_criteria list."""
    root = _build_project(tmp_path, with_acs=True)
    monkeypatch.setenv("PROJECT_ROOT", str(root))
    return root


@pytest.fixture
def project_without_acs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Project whose story 9-9 has NO acceptance_criteria key (real-shard shape)."""
    root = _build_project(tmp_path, with_acs=False)
    monkeypatch.setenv("PROJECT_ROOT", str(root))
    return root


def _context_path(root: Path, story_id: str = "9-9") -> Path:
    return root / "sprint" / "context" / f"context-story-{story_id}.md"


def _spawn(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PROJECT_ROOT"] = str(cwd)
    return subprocess.run(
        args, cwd=str(cwd), capture_output=True, text=True, timeout=30, env=env
    )


# =============================================================================
# AC-2 (core): a non-interactive `create` command exists on the context group
# =============================================================================


class TestCreateCommandRegistered:
    """Option A requires a non-interactive generator reachable as a command.

    Today `pf context` exposes only `validate` and `template` — there is no
    `create`. This precondition fails until Dev adds the subcommand.
    """

    def test_create_subcommand_registered(self) -> None:
        assert "create" in context_group.commands, (
            "Expected a `create` subcommand on the `pf context` group so "
            "sm-setup / the recovery pipeline can generate context files "
            "non-interactively. Found: "
            f"{sorted(context_group.commands)}"
        )


# =============================================================================
# AC-2 (a): create story → file is generated
# =============================================================================


class TestCreateStoryGeneratesFile:
    """`pf context create story 9-9` must write a non-empty context file."""

    def test_file_created_in_process(
        self, runner: CliRunner, project_with_acs: Path
    ) -> None:
        path = _context_path(project_with_acs)
        assert not path.exists(), "Precondition: context file must not pre-exist."

        result = runner.invoke(context_group, ["create", "story", "9-9"])

        assert result.exit_code == 0, (
            f"`context create story 9-9` exited {result.exit_code}. "
            f"output={(result.output or '')!r} exc={result.exception!r}"
        )
        assert path.exists(), f"Generator did not write {path}."
        assert path.read_text(encoding="utf-8").strip(), "Generated file is empty."

    def test_file_created_via_subprocess(self, project_with_acs: Path) -> None:
        """End-to-end through the real `pf` entrypoint (reliable I/O capture)."""
        path = _context_path(project_with_acs)
        result = _spawn(["pf", "context", "create", "story", "9-9"], project_with_acs)

        assert result.returncode == 0, (
            f"`pf context create story 9-9` returned {result.returncode}. "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )
        assert path.exists(), (
            f"Generator did not write {path}. "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )


# =============================================================================
# AC-2 (b/c/d): generated content has metadata, approach, and ACs
# =============================================================================


class TestGeneratedContentSections:
    """The generated file must carry the metadata + sections AC-2 enumerates."""

    @pytest.fixture
    def generated_text(self, runner: CliRunner, project_with_acs: Path) -> str:
        result = runner.invoke(context_group, ["create", "story", "9-9"])
        assert result.exit_code == 0, (
            f"create failed (exit {result.exit_code}); cannot inspect content. "
            f"output={(result.output or '')!r}"
        )
        return _context_path(project_with_acs).read_text(encoding="utf-8")

    def test_metadata_story_id_present(self, generated_text: str) -> None:
        assert "9-9" in generated_text, "Story ID missing from generated context."

    def test_metadata_title_present(self, generated_text: str) -> None:
        assert "Generate context for the fixture story" in generated_text, (
            "Story title (from sprint YAML) missing from generated context."
        )

    def test_metadata_type_points_workflow_repo_present(
        self, generated_text: str
    ) -> None:
        lower = generated_text.lower()
        # type, workflow, repo are distinctive tokens from the YAML.
        assert "bug" in lower, "Story type missing from metadata."
        assert "tdd" in lower, "Workflow missing from metadata."
        assert "pennyfarthing" in lower, "Repo missing from metadata."
        # points: require a labelled Points field carrying the value 3.
        assert "points" in lower and "3" in generated_text, (
            "Points metadata (value 3) missing from generated context."
        )

    def test_has_approach_or_problem_section(self, generated_text: str) -> None:
        """AC-2c: technical approach (problem / scope / approach)."""
        lower = generated_text.lower()
        assert any(
            kw in lower for kw in ("approach", "problem", "scope")
        ), "Generated context lacks any technical-approach section heading."

    def test_acceptance_criteria_from_yaml_included(self, generated_text: str) -> None:
        """AC-2d: ACs present in the YAML must appear in the generated file."""
        assert "AC-ALPHA" in generated_text and "AC-BETA" in generated_text, (
            "Acceptance criteria from the sprint YAML were not copied into "
            "the generated context file."
        )


class TestGracefulWhenAcsAbsent:
    """Real shard stories often have no acceptance_criteria — must not crash."""

    def test_generates_valid_file_without_acs(
        self, runner: CliRunner, project_without_acs: Path
    ) -> None:
        path = _context_path(project_without_acs)

        result = runner.invoke(context_group, ["create", "story", "9-9"])

        assert result.exit_code == 0, (
            "Generator must succeed for a story that has no acceptance_criteria "
            f"key. Got exit {result.exit_code}. exc={result.exception!r} "
            f"output={(result.output or '')!r}"
        )
        assert path.exists(), "No file produced for a story without ACs."
        assert path.read_text(encoding="utf-8").strip(), (
            "File produced without ACs is empty — must still carry metadata "
            "and section scaffolding."
        )


# =============================================================================
# AC-2 (e) + AC-4 + AC-5: the generated artifact satisfies the gate validator
# =============================================================================


class TestGenerateThenValidatePasses:
    """Load-bearing contract: generate → `pf validate context-story` exits 0.

    This is the exact validator the `tea-context` entry gate and the
    `sm-setup-exit` story-context check run. Proving it flips from exit 2
    (missing) to exit 0 (present) after generation demonstrates that
    "no workflow stalls" (AC-4) and "TEA can activate without manual
    intervention" (AC-5) are satisfied by the new command.
    """

    def test_validate_fails_before_generation(
        self, runner: CliRunner, project_with_acs: Path
    ) -> None:
        """Guard/precondition: the validator reports the file missing (exit 2)."""
        result = runner.invoke(validate_group, ["context-story", "9-9"])
        assert result.exit_code == 2, (
            "Precondition expected exit 2 (file missing) before generation; "
            f"got {result.exit_code}."
        )

    def test_validate_passes_after_generation(
        self, runner: CliRunner, project_with_acs: Path
    ) -> None:
        create = runner.invoke(context_group, ["create", "story", "9-9"])
        assert create.exit_code == 0, (
            f"create step failed (exit {create.exit_code}); cannot validate. "
            f"output={(create.output or '')!r}"
        )

        validate = runner.invoke(validate_group, ["context-story", "9-9"])
        assert validate.exit_code == 0, (
            "After `context create story 9-9`, `validate context-story 9-9` "
            f"must exit 0 (the gate passes). Got {validate.exit_code}. "
            f"output={(validate.output or '')!r}"
        )

    def test_generate_then_validate_chain_via_subprocess(
        self, project_with_acs: Path
    ) -> None:
        """End-to-end: the two real CLI calls a gate would run, in order."""
        create = _spawn(["pf", "context", "create", "story", "9-9"], project_with_acs)
        assert create.returncode == 0, (
            f"create returned {create.returncode}. "
            f"stdout={create.stdout!r} stderr={create.stderr!r}"
        )

        validate = _spawn(["pf", "validate", "context-story", "9-9"], project_with_acs)
        assert validate.returncode == 0, (
            f"validate returned {validate.returncode} after generation. "
            f"stdout={validate.stdout!r} stderr={validate.stderr!r}"
        )


# =============================================================================
# Error contract: unknown story must fail cleanly and write nothing
# =============================================================================


class TestUnknownStoryErrorContract:
    """A story id that is not in the sprint must not silently fabricate a file."""

    def test_unknown_story_exits_nonzero(
        self, runner: CliRunner, project_with_acs: Path
    ) -> None:
        result = runner.invoke(context_group, ["create", "story", "9-99"])
        assert result.exit_code != 0, (
            "Generating context for a non-existent story (9-99) must fail, "
            f"not silently succeed. Got exit {result.exit_code}."
        )

    def test_unknown_story_writes_no_file(
        self, runner: CliRunner, project_with_acs: Path
    ) -> None:
        runner.invoke(context_group, ["create", "story", "9-99"])
        assert not _context_path(project_with_acs, "9-99").exists(), (
            "A failed generation for an unknown story must not leave a "
            "context-story-9-99.md artifact behind."
        )


# =============================================================================
# Wiring: sm-setup must invoke the generator (else the file is never created)
# =============================================================================


class TestSmSetupWiresContextCreation:
    """The fix is only complete if sm-setup actually runs the generator.

    Option A's AC-2 requires sm-setup to create the file at setup time so the
    `sm-setup-exit` story-context check passes on the artifact itself rather
    than the SM-Assessment escape hatch. We pin that the sm-setup agent
    definition references context creation; accept either the CLI form
    (`pf context create story`) or the slash-command form
    (`/pf-context create story`) so Dev keeps wiring latitude.
    """

    @pytest.fixture
    def sm_setup_md(self) -> Path:
        here = Path(__file__).resolve()
        return here.parents[3] / "agents" / "sm-setup.md"

    def test_sm_setup_references_context_creation(self, sm_setup_md: Path) -> None:
        assert sm_setup_md.exists(), f"sm-setup agent file missing: {sm_setup_md}"
        text = sm_setup_md.read_text(encoding="utf-8")
        assert ("pf context create story" in text) or (
            "/pf-context create story" in text
        ), (
            "sm-setup.md does not invoke context creation. Without this wiring "
            "the generator exists but is never called during setup, so the "
            "story-context file is still missing at TEA on-activation."
        )
