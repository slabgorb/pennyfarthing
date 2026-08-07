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
    @pytest.mark.parametrize("phase", ["setup", "red", "green", "verify", "review", "finish"])
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
        # Pin the concrete value, not just equality: `None == None` would let a
        # resolver that finds nothing at all pass this as "agreement".
        from pf.handoff.complete_phase import _get_phase_agent
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "verify", nested_override_project) == "tea"
        assert _get_phase_agent(nested_override_project, "tdd", "verify") == "tea"

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
        assert owner == "tea", (
            f"get_phase_owner returned {owner!r} for bdd/red. The project ships "
            "no bdd override, so the packaged bdd.yaml ('tea') must still be "
            "consulted. Pinning the value rather than `is not None` so a "
            "resolver answering from the wrong file is still caught."
        )
        # `design` exists only in bdd, confirming it is bdd.yaml being read.
        assert get_phase_owner("bdd", "design", override_project) == "ux-designer"

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

    def test_owning_agent_is_allowed(self, override_project: Path, session_at_verify: Path) -> None:
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


# ---------------------------------------------------------------------------
# AC7 (rework round 1) — the WRITERS must share the readers' precedence,
# dist tier included. Project tiers still outrank dist; dist is the floor for
# both sides. Reviewer HIGH-1: in a dist-only consumer layout the readers
# resolved `tdd` while every writer resolved nothing, so
# `_validate_phase_names` stopped correcting agent names and stamped
# `**Phase:** dev` — the bug its own docstring exists to prevent.
# ---------------------------------------------------------------------------


@pytest.fixture
def npm_workflows_project(tmp_path: Path) -> Path:
    """The canonical npm/pip consumer shape: workflows live only in dist.

    `.pennyfarthing/` holds config but NO workflows dir, mirroring
    test_dist_root.py::npm_layout. Both readers and writers must resolve the
    packaged workflow here — neither may report "no such workflow".
    """
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "config.local.yaml").write_text("theme: mash\n")
    dist = tmp_path / "node_modules" / "@pennyfarthing" / "core" / "pennyfarthing-dist"
    (dist / "workflows").mkdir(parents=True)
    return tmp_path


class TestWritersSeeDistTier:
    def test_writer_phase_agent_agrees_with_reader_in_dist_only_layout(
        self, npm_workflows_project: Path
    ) -> None:
        """_get_phase_agent must return 'tea', not the phase name 'red'."""
        from pf.handoff.complete_phase import _get_phase_agent
        from pf.prime.workflow import get_phase_owner

        reader = get_phase_owner("tdd", "red", npm_workflows_project)
        writer = _get_phase_agent(npm_workflows_project, "tdd", "red")
        assert reader == "tea", "reader precondition: dist must answer in this layout"
        assert writer == reader, (
            f"Writer/reader disagreement in the dist-only consumer layout: "
            f"reader={reader!r} but _get_phase_agent={writer!r}. The writer's "
            "'return phase' fallback stamps '| red (red) |' into the Handoff "
            "History instead of '| red (tea) |'."
        )

    def test_writer_load_phases_sees_dist_workflow(self, npm_workflows_project: Path) -> None:
        """complete_phase._load_workflow_phases must not return []."""
        from pf.handoff.complete_phase import _load_workflow_phases

        phases = _load_workflow_phases(npm_workflows_project, "tdd")
        assert [p.get("name") for p in phases] == ["setup", "red", "green", "review", "finish"], (
            "complete_phase._load_workflow_phases returned "
            f"{[p.get('name') for p in phases]!r}; the packaged tdd.yaml must be "
            "reachable when the project ships no override."
        )

    def test_validate_phase_names_still_corrects_agent_names(
        self, npm_workflows_project: Path
    ) -> None:
        """The concrete harm: an agent name must not reach the Phase line.

        `_validate_phase_names` cannot distinguish "workflow has no phases"
        from "file not found", so a writer blind to dist passes `dev` through
        verbatim and it is written to the session `**Phase:**` line.
        """
        from pf.handoff.complete_phase import _validate_phase_names

        from_phase, to_phase = _validate_phase_names(npm_workflows_project, "tdd", "red", "dev")
        assert (from_phase, to_phase) == ("red", "green"), (
            f"_validate_phase_names returned {(from_phase, to_phase)!r}. The "
            "agent name 'dev' must be resolved to its phase 'green'; getting "
            "'dev' back reinstates the '**Phase:** <agent>' bug."
        )

    def test_resolve_gate_finds_dist_workflow(self, npm_workflows_project: Path) -> None:
        from pf.handoff.resolve_gate import _find_workflow_yaml

        assert _find_workflow_yaml(npm_workflows_project, "tdd") is not None, (
            "resolve_gate._find_workflow_yaml returned None in the dist-only "
            "layout — gate resolution silently does nothing."
        )

    def test_chain_load_phases_sees_dist_workflow(self, npm_workflows_project: Path) -> None:
        from pf.subagent.chain import _load_workflow_phases

        phases = _load_workflow_phases("tdd", npm_workflows_project)
        assert phases is not None, "subagent chaining resolves nothing and does nothing"
        assert [p.get("name") for p in phases][:2] == ["setup", "red"]

    def test_gate_load_phases_sees_dist_workflow(self, npm_workflows_project: Path) -> None:
        from pf.subagent.gate import _load_workflow_phases

        phases = _load_workflow_phases("tdd", npm_workflows_project)
        assert phases is not None, "subagent gate loading resolves nothing"
        assert [p.get("name") for p in phases][:2] == ["setup", "red"]

    @pytest.mark.parametrize("phase", ["setup", "red", "green", "review", "finish"])
    def test_all_writers_agree_with_reader_in_dist_only_layout(
        self, npm_workflows_project: Path, phase: str
    ) -> None:
        """Reader and writer must agree on every packaged phase."""
        from pf.handoff.complete_phase import _get_phase_agent
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", phase, npm_workflows_project) == _get_phase_agent(
            npm_workflows_project, "tdd", phase
        )

    def test_dist_tier_does_not_outrank_project_override_for_writers(
        self, override_project: Path
    ) -> None:
        """Adding the dist floor must not let dist beat a project override."""
        from pf.handoff.complete_phase import _get_phase_agent

        assert _get_phase_agent(override_project, "tdd", "red") == "dev"

    def test_highest_project_tier_still_wins_for_writers(self, two_tier_project: Path) -> None:
        from pf.handoff.complete_phase import _get_phase_agent

        assert _get_phase_agent(two_tier_project, "tdd", "red") == "reviewer"

    def test_writers_do_not_leak_dist_answer_for_broken_override(self, bare_project: Path) -> None:
        """A malformed override must not fall through to dist for writers either."""
        from pf.handoff.complete_phase import _load_workflow_phases

        wf = bare_project / ".pennyfarthing" / "workflows" / "tdd.yaml"
        wf.parent.mkdir(parents=True, exist_ok=True)
        wf.write_text("workflow: [this is: not: valid: yaml\n  - broken\n")

        assert _load_workflow_phases(bare_project, "tdd") == []


# ---------------------------------------------------------------------------
# AC8 (rework round 1) — Rule 6: resolvers degrade, they do not throw.
# Reviewer MEDIUM-1: chain/gate raised where every sibling returns None, and
# routing them through the project tier widened the trigger surface.
# ---------------------------------------------------------------------------


class TestWorkflowPhaseLoadersDegrade:
    @pytest.mark.parametrize("module", ["pf.subagent.chain", "pf.subagent.gate"])
    @pytest.mark.parametrize(
        ("label", "body"),
        [
            ("malformed", "workflow: [this is: not: valid: yaml\n  - broken\n"),
            ("empty", ""),
            ("scalar", "just-a-string\n"),
        ],
    )
    def test_load_phases_returns_none_instead_of_raising(
        self, bare_project: Path, module: str, label: str, body: str
    ) -> None:
        """Malformed/empty/scalar YAML must yield None, not an exception."""
        import importlib

        wf = bare_project / ".pennyfarthing" / "workflows" / "tdd.yaml"
        wf.parent.mkdir(parents=True, exist_ok=True)
        wf.write_text(body)

        loader = importlib.import_module(module)._load_workflow_phases
        try:
            result = loader("tdd", bare_project)
        except Exception as exc:  # noqa: BLE001 - the point of the test
            raise AssertionError(
                f"{module}._load_workflow_phases raised {type(exc).__name__} on "
                f"{label} workflow YAML. Project rule 6: return a result, do not "
                "throw — every sibling loader degrades to None/[]."
            ) from exc
        assert result is None


# ---------------------------------------------------------------------------
# AC9 (rework round 1) — CWE-22: the workflow name comes from the session
# `**Workflow:**` line and is joined into a path unsanitized.
# Reviewer MEDIUM-2, guard precedent: epic-162 commit 26cb554.
# ---------------------------------------------------------------------------

EVIL_WORKFLOW = {
    "workflow": {
        "name": "evil",
        "phases": [{"name": "red", "agent": "PWNED"}],
    }
}


class TestWorkflowNameContainment:
    @pytest.fixture
    def outside_payload(self, override_project: Path) -> str:
        """Write a workflow YAML fully OUTSIDE the project root.

        Uses `override_project` because the traversal is only *reachable* when
        a project workflows tier exists to traverse out of — with no tier dir
        the relative name is joined onto the packaged dist instead and the
        payload is never found, so the test would pass vacuously.

        The tier dir is `{root}/.pennyfarthing/workflows`, so three `..`
        segments are needed to clear the project root itself. (Two would only
        reach the root, and the escape would be a no-op.)
        """
        outside = override_project.parent / "outside-evil"
        _write_yaml(outside / "evil.yaml", EVIL_WORKFLOW)
        assert (override_project / ".pennyfarthing" / "workflows").is_dir()
        assert outside.resolve().parent == override_project.resolve().parent
        return f"../../../{outside.name}/evil"

    @pytest.fixture
    def in_root_payload(self, override_project: Path) -> str:
        """Payload inside the project root but outside the workflows tier.

        This is the reviewer's exact demonstration shape; containment is
        measured against the tier dir, not merely against the project root.
        """
        _write_yaml(override_project / "sneaky" / "evil.yaml", EVIL_WORKFLOW)
        return "../../sneaky/evil"

    def test_traversal_name_does_not_resolve(
        self, bare_project: Path, outside_payload: str
    ) -> None:
        from pf.prime.workflow import get_phase_owner

        owner = get_phase_owner(outside_payload, "red", bare_project)
        assert owner is None, (
            f"get_phase_owner returned {owner!r} for a traversal workflow name. "
            "A crafted session '**Workflow:**' line must not make arbitrary "
            "readable YAML the phase-ownership authority."
        )

    def test_traversal_escaping_only_the_tier_does_not_resolve(
        self, bare_project: Path, in_root_payload: str
    ) -> None:
        from pf.prime.workflow import get_phase_owner

        owner = get_phase_owner(in_root_payload, "red", bare_project)
        assert owner is None, (
            f"get_phase_owner returned {owner!r}. Containment must be enforced "
            "against the workflows tier dir; staying inside the project root is "
            "not sufficient."
        )

    def test_traversal_name_does_not_resolve_for_writers(
        self, bare_project: Path, outside_payload: str
    ) -> None:
        from pf.handoff.complete_phase import _load_workflow_phases

        assert _load_workflow_phases(bare_project, outside_payload) == []

    def test_traversal_name_does_not_resolve_for_chain(
        self, bare_project: Path, outside_payload: str
    ) -> None:
        from pf.subagent.chain import _load_workflow_phases

        assert _load_workflow_phases(outside_payload, bare_project) is None

    def test_absolute_name_does_not_resolve(self, bare_project: Path) -> None:
        from pf.prime.workflow import get_phase_owner

        outside = bare_project.parent / "abs"
        _write_yaml(outside / "evil.yaml", EVIL_WORKFLOW)
        absolute = str(outside / "evil")

        assert get_phase_owner(absolute, "red", bare_project) is None, (
            "An absolute workflow name escapes the workflows dir entirely: "
            "Path.__truediv__ discards the left operand."
        )

    def test_symlinked_file_escaping_the_tier_is_rejected(self, bare_project: Path) -> None:
        """resolve() is required — a lexical `..` check would miss this."""
        from pf.prime.workflow import get_phase_owner

        outside = bare_project.parent / "linked"
        _write_yaml(outside / "evil.yaml", EVIL_WORKFLOW)

        workflows = bare_project / ".pennyfarthing" / "workflows"
        workflows.mkdir(parents=True, exist_ok=True)
        (workflows / "sneaky.yaml").symlink_to(outside / "evil.yaml")

        assert get_phase_owner("sneaky", "red", bare_project) is None

    def test_legitimate_names_still_resolve(self, override_project: Path) -> None:
        """The guard must not break ordinary lookups, including hyphens/dots."""
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "red", override_project) == "dev"
        assert get_phase_owner("bdd", "red", override_project) == "tea"


# ---------------------------------------------------------------------------
# AC10 (rework round 1) — resolver edge cases the reviewer found untested.
# ---------------------------------------------------------------------------


class TestResolverEdgeCases:
    def test_flat_beats_nested_within_one_tier(self, bare_project: Path) -> None:
        """Both layouts present in the SAME dir — flat wins, deterministically."""
        from pf.prime.workflow import get_phase_owner

        workflows = bare_project / ".pennyfarthing" / "workflows"
        _write_yaml(workflows / "tdd.yaml", OVERRIDE_TDD)
        _write_yaml(
            workflows / "tdd" / "workflow.yaml",
            {"workflow": {"name": "tdd", "phases": [{"name": "red", "agent": "nested"}]}},
        )

        assert get_phase_owner("tdd", "red", bare_project) == "dev"

    def test_empty_nested_dir_at_top_tier_falls_through(self, two_tier_project: Path) -> None:
        """A present-but-unusable entry is NOT authoritative — documents reality.

        `{name}/` with no `workflow.yaml` fails Path.exists(), so resolution
        continues to the next tier. The resolver docstring must not claim
        otherwise.
        """
        from pf.prime.workflow import get_phase_owner

        (two_tier_project / ".pennyfarthing" / "project" / "workflows" / "bdd").mkdir(
            parents=True, exist_ok=True
        )
        assert get_phase_owner("bdd", "red", two_tier_project) == "tea"


# ---------------------------------------------------------------------------
# AC11 (rework round 1) — recurrence guard.
#
# This epic keeps re-finding the same defect: two readers of one fact resolving
# it from different files. The durable fix is not just correcting today's call
# sites but making a regression detectable. Every module in the phase-ownership
# path must resolve workflow YAML through the one shared resolver.
# ---------------------------------------------------------------------------

# Modules that answer "who owns this phase / what is this phase's gate".
# Both readers and writers of that fact live here, so they must agree.
PHASE_OWNERSHIP_MODULES = [
    "prime/workflow.py",
    "handoff/complete_phase.py",
    "handoff/resolve_gate.py",
    "handoff/cli.py",
    "subagent/chain.py",
    "subagent/gate.py",
]


def _pf_source_dir() -> Path:
    import pf

    return Path(pf.__file__).parent


class TestResolverIsTheSinglePrecedenceDefinition:
    @pytest.mark.parametrize("rel", PHASE_OWNERSHIP_MODULES)
    def test_no_hand_rolled_workflows_path(self, rel: str) -> None:
        """No module may rebuild the workflows path from string literals."""
        source = (_pf_source_dir() / rel).read_text()
        assert '"workflows"' not in source, (
            f"{rel} builds a workflows path from literals. Resolution must go "
            "through pf.workflow.helpers.resolve_workflow_file so that a "
            "reader and a writer of the same fact cannot disagree."
        )

    @pytest.mark.parametrize("rel", PHASE_OWNERSHIP_MODULES)
    def test_no_two_tier_resolution(self, rel: str) -> None:
        """`find_workflow_file(get_all_workflows_dirs(...))` omits the dist floor.

        That shape is what left the writers blind to dist while the readers
        resolved successfully, silently disabling `_validate_phase_names`.
        """
        source = (_pf_source_dir() / rel).read_text()
        collapsed = " ".join(source.split())
        assert "find_workflow_file(get_all_workflows_dirs" not in collapsed, (
            f"{rel} resolves a workflow without the dist tier. Use "
            "resolve_workflow_file(), which includes it as the floor."
        )

    def test_resolver_precedence_is_project_then_dist(self, two_tier_project: Path) -> None:
        """Pin the shared resolver's order directly, not just via its callers."""
        from pf.workflow.helpers import get_all_workflows_dirs, resolve_workflow_file

        dirs = get_all_workflows_dirs(two_tier_project, include_dist=True)
        assert len(dirs) == 3, f"expected 3 tiers, got {[str(d) for d in dirs]}"
        assert dirs[0].parts[-3:] == (".pennyfarthing", "project", "workflows")
        assert dirs[1].parts[-2:] == (".pennyfarthing", "workflows")

        resolved = resolve_workflow_file("tdd", two_tier_project)
        assert resolved is not None
        assert resolved.parent == dirs[0]

    def test_dist_tier_is_off_by_default_for_enumeration(self, bare_project: Path) -> None:
        """`pf workflow list` must not start enumerating packaged workflows."""
        from pf.workflow.helpers import get_all_workflows_dirs

        assert get_all_workflows_dirs(bare_project) == []
        assert get_all_workflows_dirs(bare_project, include_dist=True) != []

    def test_dist_tier_is_not_duplicated_when_symlinked(self, tmp_path: Path) -> None:
        """In the dogfood layout `.pennyfarthing/workflows` IS the dist dir.

        It must appear once, not twice, or precedence reasoning gets murky.
        """
        from pf.workflow.helpers import get_all_workflows_dirs

        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text("theme: mash\n")
        real_dist = tmp_path / "pennyfarthing-dist" / "workflows"
        real_dist.mkdir(parents=True)
        (tmp_path / ".pennyfarthing" / "workflows").symlink_to(real_dist)

        dirs = get_all_workflows_dirs(tmp_path, include_dist=True)
        resolved = [d.resolve() for d in dirs]
        assert len(resolved) == len(set(resolved)), f"duplicate tiers: {dirs}"
