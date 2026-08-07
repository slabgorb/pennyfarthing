"""Project workflow overrides must be reachable (Story 162-29).

Epic: 162 (Finish & sprint-tooling truthfulness)
Story: 162-29 — B2: project workflow overrides unreachable

## The defect

``pf.prime.workflow`` resolves workflow YAML by asking ``get_dist_root()``
FIRST and only falls back to ``{project_root}/.pennyfarthing/workflows/`` when
the dist copy is missing. But ``get_dist_root()`` has a final fallback to the
bundled ``pf._dist`` package, which always ships every stock workflow — so the
dist branch effectively never misses, and a project's own
``.pennyfarthing/workflows/tdd.yaml`` is unreachable.

Meanwhile the *writers* read the project path only:

  * ``pf.handoff.complete_phase._load_workflow_phases`` / ``_get_phase_agent``
    / ``_get_phase_tandem`` → ``{root}/.pennyfarthing/workflows/`` only
  * ``pf.handoff.resolve_gate._find_workflow_yaml`` → project only
  * ``pf.subagent.chain`` / ``pf.subagent.gate`` → project only
  * ``pf.workflow.helpers.get_all_workflows_dirs`` → project overrides
    (``.pennyfarthing/project/workflows/``) first, then
    ``.pennyfarthing/workflows/``; used by ``pf workflow`` CLI and peloton

So phases are *written* from the project YAML while owners/redirects are
*read* from the packaged one — the two-readers disagreement that
``complete_phase`` explicitly forbids ("Shared with resolve_gate so the two
steps can never disagree").

## What these tests pin

1. Project-local workflow YAML wins over the packaged dist for owner,
   redirect, tandem, team, skills, gate-recovery and stepped-step lookups.
2. Both readers (``prime.workflow`` and ``handoff.complete_phase``) agree on
   the same source for every phase.
3. The dist fallback still works when the project ships no override.
4. A broken/incomplete project override does NOT silently fall through to the
   packaged answer — silence beats a wrong owner.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# Fixture workflows
# ---------------------------------------------------------------------------

# Deliberately DISAGREES with the packaged tdd.yaml on every axis:
#   - packaged: setup/sm, red/tea, green/dev, review/reviewer, finish/sm
#   - override: red is owned by `dev` (not tea), green by `tea` (not dev),
#     and there is an extra `verify` phase owned by `tea`.
# Any assertion below that matches the packaged answer proves the override
# was not consulted.
OVERRIDE_TDD = {
    "workflow": {
        "name": "tdd",
        "description": "Project-local TDD override",
        "version": "9.9.9",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {
                "name": "red",
                "agent": "dev",
                "gate": {"type": "tests_fail", "file": "gates/tests-fail"},
                "tandem": {"partner": "reviewer", "mode": "backseat"},
                "team": {"teammates": ["tea", "dev"]},
                "skills": {"required": ["superpowers:test-driven-development"]},
            },
            {
                "name": "green",
                "agent": "tea",
                "gate": {"type": "dev_exit", "file": "gates/dev-exit", "recovery": {"max": 2}},
            },
            {
                "name": "verify",
                "agent": "tea",
                "gate": {"type": "quality_pass", "file": "gates/quality-pass"},
            },
            {"name": "review", "agent": "reviewer"},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

# Second-tier override (.pennyfarthing/project/workflows/) — must beat the
# first-tier one, matching the priority order get_all_workflows_dirs() already
# establishes for the `pf workflow` CLI and peloton.
PROJECT_TIER_TDD = {
    "workflow": {
        "name": "tdd",
        "description": "Highest-priority project override",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "red", "agent": "reviewer"},
            {"name": "verify", "agent": "devops"},
        ],
    }
}

# A stepped workflow override, for the _get_step_config_block path which today
# has no project fallback at all.
OVERRIDE_STEPPED = {
    "workflow": {
        "name": "arch-override",
        "type": "stepped",
        "steps": {
            "path": "./steps",
            "config": {
                1: {
                    "tandem": {"partner": "reviewer", "model": "sonnet"},
                    "team": {"teammates": ["architect", "tea"]},
                }
            },
        },
    }
}

SESSION_AT_VERIFY = textwrap.dedent("""\
    # Story ovr-1: Override resolution

    ## Story Details
    - **ID:** ovr-1
    - **Workflow:** tdd

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** verify
    **Phase Started:** 2026-08-07T10:00:00Z
""")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.dump(data, default_flow_style=False))


@pytest.fixture
def bare_project(tmp_path: Path) -> Path:
    """Consumer project with .pennyfarthing/ but NO workflows dir at all.

    This is the npm/pip-installed shape — resolution must fall back to dist.
    """
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text("theme: mash\n")
    return tmp_path


@pytest.fixture
def override_project(bare_project: Path) -> Path:
    """Project shipping its own .pennyfarthing/workflows/tdd.yaml."""
    _write_yaml(bare_project / ".pennyfarthing" / "workflows" / "tdd.yaml", OVERRIDE_TDD)
    return bare_project


@pytest.fixture
def nested_override_project(bare_project: Path) -> Path:
    """Project shipping the nested layout: workflows/tdd/workflow.yaml."""
    _write_yaml(
        bare_project / ".pennyfarthing" / "workflows" / "tdd" / "workflow.yaml", OVERRIDE_TDD
    )
    return bare_project


@pytest.fixture
def two_tier_project(override_project: Path) -> Path:
    """Both .pennyfarthing/project/workflows/ and .pennyfarthing/workflows/."""
    _write_yaml(
        override_project / ".pennyfarthing" / "project" / "workflows" / "tdd.yaml",
        PROJECT_TIER_TDD,
    )
    return override_project


# ---------------------------------------------------------------------------
# AC1 — project-local YAML wins for owner resolution
# ---------------------------------------------------------------------------


class TestOwnerResolutionPrefersProject:
    def test_override_owner_wins_over_packaged(self, override_project: Path) -> None:
        """`red` is owned by `dev` in the override, `tea` in the packaged dist."""
        from pf.prime.workflow import get_phase_owner

        owner = get_phase_owner("tdd", "red", override_project)
        assert owner == "dev", (
            f"get_phase_owner returned {owner!r} for tdd/red. The project's "
            ".pennyfarthing/workflows/tdd.yaml says 'dev'; the packaged dist "
            "says 'tea'. Getting 'tea' (or None) means the project override "
            "was never consulted."
        )

    def test_override_owner_wins_on_second_phase_too(self, override_project: Path) -> None:
        """Not a one-off: `green` is `tea` in the override, `dev` in packaged."""
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "green", override_project) == "tea"

    def test_phase_only_in_override_resolves(self, override_project: Path) -> None:
        """`verify` exists ONLY in the override — packaged tdd.yaml has no verify."""
        from pf.prime.workflow import get_phase_owner

        owner = get_phase_owner("tdd", "verify", override_project)
        assert owner == "tea", (
            f"get_phase_owner returned {owner!r} for tdd/verify. The packaged "
            "tdd.yaml has no `verify` phase, so a non-'tea' answer proves the "
            "packaged file was read instead of the project override."
        )

    def test_nested_layout_override_resolves(self, nested_override_project: Path) -> None:
        """workflows/tdd/workflow.yaml must resolve like the flat layout.

        complete_phase and find_workflow_file both accept the nested layout;
        prime.workflow must not be the only reader that doesn't.
        """
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "verify", nested_override_project) == "tea"

    def test_project_tier_beats_pennyfarthing_workflows(self, two_tier_project: Path) -> None:
        """.pennyfarthing/project/workflows/ outranks .pennyfarthing/workflows/.

        This is the order get_all_workflows_dirs() already uses; a fix that
        only reorders dist-vs-project would re-create the disagreement here.
        """
        from pf.prime.workflow import get_phase_owner

        owner = get_phase_owner("tdd", "red", two_tier_project)
        assert owner == "reviewer", (
            f"get_phase_owner returned {owner!r}. Priority order must be "
            ".pennyfarthing/project/workflows ('reviewer') > "
            ".pennyfarthing/workflows ('dev') > packaged dist ('tea')."
        )

    def test_project_tier_beats_for_override_only_phase(self, two_tier_project: Path) -> None:
        """`verify` differs between the two project tiers — highest wins."""
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "verify", two_tier_project) == "devops"


# ---------------------------------------------------------------------------
# AC2 — the two readers must agree
# ---------------------------------------------------------------------------


class TestReadersAgree:
    @pytest.mark.parametrize(
        "phase", ["setup", "red", "green", "verify", "review", "finish"]
    )
    def test_prime_and_complete_phase_agree(self, override_project: Path, phase: str) -> None:
        """prime.get_phase_owner == complete_phase._get_phase_agent, per phase.

        complete_phase is the writer — it stamps the session's `**Phase:**`
        line from the project YAML. If prime disagrees, phases are written
        from one file and owners resolved from another.
        """
        from pf.handoff.complete_phase import _get_phase_agent
        from pf.prime.workflow import get_phase_owner

        prime_answer = get_phase_owner("tdd", phase, override_project)
        writer_answer = _get_phase_agent(override_project, "tdd", phase)

        assert prime_answer == writer_answer, (
            f"Two-readers disagreement on tdd/{phase}: "
            f"prime.get_phase_owner={prime_answer!r} but "
            f"complete_phase._get_phase_agent={writer_answer!r}."
        )

    def test_readers_agree_on_nested_layout(self, nested_override_project: Path) -> None:
        from pf.handoff.complete_phase import _get_phase_agent
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "verify", nested_override_project) == _get_phase_agent(
            nested_override_project, "tdd", "verify"
        )

    def test_resolve_gate_and_prime_agree_on_source(self, override_project: Path) -> None:
        """resolve_gate resolves the `red` gate from the same file prime reads.

        The override's red gate is `tests_fail`; it also renames the owner to
        `dev`. Both facts come from one file — if resolve_gate finds the gate
        but prime reports 'tea', they read different files.
        """
        from pf.handoff.resolve_gate import _find_workflow_yaml
        from pf.prime.workflow import get_phase_owner

        gate_source = _find_workflow_yaml(override_project, "tdd")
        assert gate_source is not None, "resolve_gate could not find the project workflow"
        assert get_phase_owner("tdd", "red", override_project) == "dev"
        # The file resolve_gate reads must live under the project, not the dist.
        assert override_project in gate_source.parents or gate_source.is_relative_to(
            override_project
        ), f"resolve_gate read {gate_source} — outside the project root"


# ---------------------------------------------------------------------------
# AC3 — dist fallback preserved
# ---------------------------------------------------------------------------


class TestDistFallbackPreserved:
    def test_no_project_workflows_dir_falls_back_to_dist(self, bare_project: Path) -> None:
        """pip/npm consumer with no .pennyfarthing/workflows/ still resolves."""
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "red", bare_project) == "tea"
        assert get_phase_owner("tdd", "green", bare_project) == "dev"
        assert get_phase_owner("tdd", "setup", bare_project) == "sm"

    def test_project_dir_present_but_workflow_absent_falls_back(
        self, override_project: Path
    ) -> None:
        """Override dir exists but has no bdd.yaml — dist must still answer.

        A fix that stops at "project dir exists" would return None here.
        """
        from pf.prime.workflow import get_phase_owner

        owner = get_phase_owner("bdd", "red", override_project)
        assert owner is not None, (
            "get_phase_owner returned None for bdd/red. The project ships no "
            "bdd override, so the packaged bdd.yaml must still be consulted."
        )

    def test_unknown_workflow_still_returns_none(self, override_project: Path) -> None:
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("no-such-workflow-xyz", "red", override_project) is None

    def test_unknown_phase_in_override_returns_none(self, override_project: Path) -> None:
        """A phase absent from the override must NOT be answered by the dist."""
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "no-such-phase", override_project) is None


# ---------------------------------------------------------------------------
# AC4 — a broken override must not silently yield the packaged answer
# ---------------------------------------------------------------------------


class TestBrokenOverrideDoesNotLeak:
    def test_malformed_override_yaml_does_not_fall_back(self, bare_project: Path) -> None:
        """Unparseable project YAML → None, not the packaged owner.

        Falling back would silently answer from a file the writer
        (complete_phase, which returns [] here) never sees.
        """
        from pf.prime.workflow import get_phase_owner

        wf = bare_project / ".pennyfarthing" / "workflows" / "tdd.yaml"
        wf.parent.mkdir(parents=True, exist_ok=True)
        wf.write_text("workflow: [this is: not: valid: yaml\n  - broken\n")

        owner = get_phase_owner("tdd", "red", bare_project)
        assert owner is None, (
            f"get_phase_owner returned {owner!r} from a malformed project "
            "override. It must not silently answer from the packaged dist — "
            "complete_phase._load_workflow_phases returns [] for this file, "
            "so any non-None answer is a fresh two-readers disagreement."
        )

    def test_empty_override_yaml_does_not_fall_back(self, bare_project: Path) -> None:
        from pf.prime.workflow import get_phase_owner

        wf = bare_project / ".pennyfarthing" / "workflows" / "tdd.yaml"
        wf.parent.mkdir(parents=True, exist_ok=True)
        wf.write_text("")

        assert get_phase_owner("tdd", "red", bare_project) is None

    def test_phase_without_agent_key_returns_none(self, bare_project: Path) -> None:
        """Phase found in the override but carrying no `agent` → None."""
        from pf.prime.workflow import get_phase_owner

        _write_yaml(
            bare_project / ".pennyfarthing" / "workflows" / "tdd.yaml",
            {"workflow": {"name": "tdd", "phases": [{"name": "red"}]}},
        )
        assert get_phase_owner("tdd", "red", bare_project) is None


# ---------------------------------------------------------------------------
# AC5 — sibling readers in prime.workflow share the same resolution order
# ---------------------------------------------------------------------------


class TestSiblingReadersHonorOverride:
    def test_tandem_config_from_override(self, override_project: Path) -> None:
        """Packaged tdd.yaml has no tandem on `red`; the override does."""
        from pf.prime.workflow import get_phase_tandem_config

        cfg = get_phase_tandem_config("tdd", "red", override_project)
        assert cfg == {"partner": "reviewer", "mode": "backseat"}, (
            f"get_phase_tandem_config returned {cfg!r} — expected the "
            "project override's tandem block."
        )

    def test_tandem_readers_agree(self, override_project: Path) -> None:
        """prime and complete_phase must read tandem from the same file."""
        from pf.handoff.complete_phase import _get_phase_tandem
        from pf.prime.workflow import get_phase_tandem_config

        assert get_phase_tandem_config("tdd", "red", override_project) == _get_phase_tandem(
            override_project, "tdd", "red"
        )

    def test_team_config_from_override(self, override_project: Path) -> None:
        from pf.prime.workflow import get_phase_team_config

        assert get_phase_team_config("tdd", "red", override_project) == {
            "teammates": ["tea", "dev"]
        }

    def test_skills_from_override(self, override_project: Path) -> None:
        from pf.prime.workflow import get_phase_skills

        assert get_phase_skills("tdd", "red", override_project) == [
            "superpowers:test-driven-development"
        ]

    def test_gate_recovery_from_override(self, override_project: Path) -> None:
        """Override puts `recovery:` on green's gate; packaged tdd.yaml differs."""
        from pf.prime.workflow import get_phase_gate_recovery

        assert get_phase_gate_recovery("tdd", "green", override_project) is True

    def test_gate_recovery_false_when_override_lacks_it(self, override_project: Path) -> None:
        """`red`'s override gate has no recovery block — must report False.

        If this reads the packaged tdd.yaml instead and that file grows a
        recovery block on red, the answer flips without the project changing.
        """
        from pf.prime.workflow import get_phase_gate_recovery

        assert get_phase_gate_recovery("tdd", "red", override_project) is False

    def test_stepped_step_config_from_override(self, bare_project: Path) -> None:
        """_get_step_config_block has no project fallback at all today."""
        from pf.prime.workflow import get_step_tandem_config, get_step_team_config

        _write_yaml(
            bare_project / ".pennyfarthing" / "workflows" / "arch-override.yaml",
            OVERRIDE_STEPPED,
        )

        assert get_step_tandem_config("arch-override", 1, bare_project) == {
            "partner": "reviewer",
            "model": "sonnet",
        }
        assert get_step_team_config("arch-override", 1, bare_project) == {
            "teammates": ["architect", "tea"]
        }


# ---------------------------------------------------------------------------
# AC6 — end-to-end: redirect computation uses the override
# ---------------------------------------------------------------------------


class TestRedirectEndToEnd:
    @pytest.fixture
    def session_at_verify(self, override_project: Path) -> Path:
        session_dir = override_project / ".session"
        session_dir.mkdir(parents=True, exist_ok=True)
        path = session_dir / "ovr-1-session.md"
        path.write_text(SESSION_AT_VERIFY)
        return path

    def test_detect_workflow_state_resolves_override_owner(
        self, override_project: Path, session_at_verify: Path
    ) -> None:
        """A phase that exists only in the override still gets an owner."""
        from pf.prime.workflow import detect_workflow_state

        status = detect_workflow_state(override_project)
        assert status.phase == "verify"
        assert status.phase_owner == "tea", (
            f"phase_owner is {status.phase_owner!r}. With no owner, "
            "check_redirect computes no redirect and any agent can hijack the "
            "phase — this is the actual production impact of the defect."
        )

    def test_wrong_agent_is_redirected(
        self, override_project: Path, session_at_verify: Path
    ) -> None:
        from pf.handoff.phase_check import phase_check_start

        result = phase_check_start("dev", project_root=override_project)
        assert result["action"] == "redirect"
        assert result["agent"] == "tea"

    def test_owning_agent_is_allowed(
        self, override_project: Path, session_at_verify: Path
    ) -> None:
        from pf.handoff.phase_check import phase_check_start

        result = phase_check_start("tea", project_root=override_project)
        assert result["action"] == "start"
        # `start` must come from TEA *owning* verify, not from the owner
        # resolving to None so that no redirect could be computed. phase_check
        # echoes the requested agent back as phase_owner in the start branch,
        # so assert against the resolver instead — otherwise this test passes
        # on the broken code for the wrong reason.
        from pf.prime.workflow import detect_workflow_state

        assert detect_workflow_state(override_project).phase_owner == "tea"

    def test_override_reassigned_owner_redirects(
        self, override_project: Path, session_at_verify: Path
    ) -> None:
        """The override reassigns `red` to dev — tea must be redirected there.

        Guards against a fix that special-cases only override-only phases.
        """
        from pf.handoff.phase_check import phase_check_start

        session_at_verify.write_text(SESSION_AT_VERIFY.replace("verify", "red"))
        result = phase_check_start("tea", project_root=override_project)
        assert result["action"] == "redirect"
        assert result["agent"] == "dev"
