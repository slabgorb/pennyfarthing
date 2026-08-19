"""Workflow-dir resolution sweep (Story 162-74).

Epic: 162 (Finish & sprint-tooling truthfulness)
Story: 162-74 — absorbs 162-51 and 162-52, both from the 162-29 review.

## Why this story exists

162-29 fixed the *phase-ownership* readers/writers so a reader and a writer of
"who owns this phase" can never resolve it from different files (see
``test_162_29_workflow_override_resolution.py``). It also planted a recurrence
guard so the defect could not silently return. This story finishes the sweep:

* **162-51** — the ``pf workflow`` CLI still resolves through the *single-tier*
  ``get_workflows_dir()`` at eight call sites, so a project override
  (``.pennyfarthing/project/workflows/``) and, in an npm/pip layout, the dist
  floor are both invisible to those commands. ``workflow route``'s trigger-tag
  enumeration (cli.py ``get_all_workflows_dirs(root)``) omits the dist floor, so
  it matches nothing in a dist-only consumer. And ``helpers._resolve_path`` hands
  back an absolute steps path verbatim — an absolute-path sink (CWE-22).
* **162-52** — the recurrence guard only rejects the *double-quoted* literal
  ``"workflows"`` and the exact two-tier shape, so a single-quoted literal or a
  single-tier ``get_workflows_dir()`` call slips past it; and it does not cover
  ``peloton/live.py``, ``workflow/cli.py`` or ``prime/loader.py``. ``load_step_content``
  hand-rolls the same ``"workflows"`` path with an *unsanitized* workflow name.
  ``_get_phase_agent`` disagrees with the canonical reader on a phase carrying no
  ``agent:`` key. ``_get_phase_tandem`` has no dist-only regression. And
  ``peloton/live.py`` trips ruff E402 (an import below module-level code).

## RED honesty note

Several pins here are *green-on-arrival* regression sentinels — 162-29 already
made the phase-ownership writers route through the shared resolver, so the
tandem dist-only pin (AC8) and the loader-nullability pins (AC6) pass on arrival
by design. They are marked in each test's docstring. The true-RED drivers are
AC2 (route dist enumeration), AC3 (absolute sink), AC4 (hardened+extended
guard — cli.py's 8 single-tier calls and loader.py's literals), AC5 (step-path
containment), AC7 (``_get_phase_agent`` no-agent divergence) and AC9 (E402).
"""

from __future__ import annotations

import ast
import importlib
import inspect
import textwrap
from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# Shared helpers / fixtures
# ---------------------------------------------------------------------------


def _pf_source_dir() -> Path:
    import pf

    return Path(pf.__file__).parent


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.dump(data, default_flow_style=False))


# A dist workflow that carries a tandem block — the packaged tdd.yaml has none,
# so a dist-only tandem pin needs its own fixture to avoid a vacuous None==None.
DIST_TANDEM_WORKFLOW = {
    "workflow": {
        "name": "tandemflow",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {
                "name": "red",
                "agent": "tea",
                "tandem": {"partner": "reviewer", "mode": "backseat"},
            },
        ],
    }
}


@pytest.fixture
def dist_floor_project(tmp_path: Path) -> Path:
    """A consumer whose only workflow tier is the dist floor.

    ``get_dist_root()`` resolves ``{root}/pennyfarthing-dist/`` (its option 1),
    so a ``tandemflow.yaml`` shipped there is reachable ONLY via the dist floor —
    there is no ``.pennyfarthing/workflows`` project tier. That is what makes
    "resolved from dist" non-ambiguous.
    """
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "config.local.yaml").write_text("theme: mash\n")
    dist_workflows = tmp_path / "pennyfarthing-dist" / "workflows"
    dist_workflows.mkdir(parents=True)
    _write_yaml(dist_workflows / "tandemflow.yaml", DIST_TANDEM_WORKFLOW)
    return tmp_path


# ---------------------------------------------------------------------------
# AC9 (162-52) — peloton/live.py must not trip ruff E402.
# True-RED: `logger = logging.getLogger(__name__)` sits above
# `from pf.workflow.helpers import ...`, a module-level import below code.
# Detected structurally with ast so the pin does not depend on ruff being
# installed and names the exact defect (import-after-code), not a lint code.
# ---------------------------------------------------------------------------


class TestPelotonLiveImportOrder:
    def test_no_module_level_import_after_code(self) -> None:
        live = _pf_source_dir() / "peloton" / "live.py"
        tree = ast.parse(live.read_text(encoding="utf-8"))

        code_started_at: int | None = None
        offending: list[int] = []
        for node in tree.body:
            is_docstring = (
                isinstance(node, ast.Expr)
                and isinstance(node.value, ast.Constant)
                and isinstance(node.value.value, str)
            )
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                if code_started_at is not None:
                    offending.append(node.lineno)
            elif is_docstring:
                continue
            elif code_started_at is None:
                code_started_at = node.lineno

        assert not offending, (
            f"peloton/live.py has module-level import(s) at line(s) {offending} "
            f"AFTER the first module-level code statement (line {code_started_at}) "
            "— ruff E402. Move every import to the top of the module (above the "
            "`logger = logging.getLogger(__name__)` assignment)."
        )


# ---------------------------------------------------------------------------
# AC4 (162-52) — the recurrence guard, hardened and extended.
#
# The 162-29 guard rejected only the double-quoted ``"workflows"`` literal and
# the exact ``find_workflow_file(get_all_workflows_dirs(...))`` shape, over six
# modules. It is evadable by a single-quoted literal or a single-tier
# ``get_workflows_dir()`` call, and blind to the three modules 162-51/52 touch.
# This is the durable sentinel going forward: it is a strict superset of the
# 162-29 guard.
# ---------------------------------------------------------------------------

# Original 162-29 phase-ownership modules PLUS the three the sweep touches.
EXTENDED_OWNERSHIP_MODULES = [
    "prime/workflow.py",
    "handoff/complete_phase.py",
    "handoff/resolve_gate.py",
    "handoff/cli.py",
    "subagent/chain.py",
    "subagent/gate.py",
    # Added by 162-52:
    "peloton/live.py",
    "workflow/cli.py",
    "prime/loader.py",
]


class TestRecurrenceGuardHardened:
    @pytest.mark.parametrize("rel", EXTENDED_OWNERSHIP_MODULES)
    def test_no_hand_rolled_workflows_literal_either_quote_style(self, rel: str) -> None:
        """No module may rebuild the workflows path from a string literal.

        Hardened over 162-29: rejects the single-quoted ``'workflows'`` too, so
        a refactor that flips quote style cannot silently re-open the hole.
        ``prime/loader.py`` fails today — ``load_step_content`` joins
        ``"workflows"`` directly.
        """
        source = (_pf_source_dir() / rel).read_text(encoding="utf-8")
        assert '"workflows"' not in source and "'workflows'" not in source, (
            f"{rel} builds a workflows path from a string literal. Resolution "
            "must go through pf.workflow.helpers (resolve_workflow_file / "
            "get_all_workflows_dirs) so a reader and a writer of the same fact "
            "cannot disagree — and so a project override / dist floor is never "
            "skipped."
        )

    @pytest.mark.parametrize("rel", EXTENDED_OWNERSHIP_MODULES)
    def test_no_single_tier_get_workflows_dir(self, rel: str) -> None:
        """``get_workflows_dir()`` resolves ONE tier (.pennyfarthing/workflows).

        That is exactly the miss 162-51 is about: it skips the project-override
        tier and the dist floor. Ownership/resolution modules must call the
        multi-tier ``resolve_workflow_file`` / ``get_all_workflows_dirs`` instead.
        ``workflow/cli.py`` fails today at eight sites.

        The needle is the exact call ``get_workflows_dir(`` — it does NOT match
        the allowed ``get_all_workflows_dirs(`` / ``get_dist_workflows_dir(`` /
        ``get_project_workflows_dir(`` (different tokens).
        """
        source = (_pf_source_dir() / rel).read_text(encoding="utf-8")
        assert "get_workflows_dir(" not in source, (
            f"{rel} calls the single-tier get_workflows_dir(). Use "
            "resolve_workflow_file() (dist floor included) for resolution, or "
            "get_all_workflows_dirs() for project-scoped enumeration."
        )

    @pytest.mark.parametrize("rel", EXTENDED_OWNERSHIP_MODULES)
    def test_no_two_tier_resolution_shape(self, rel: str) -> None:
        """``find_workflow_file(get_all_workflows_dirs(...))`` omits the dist floor.

        Carried from 162-29 — the writers-blind-to-dist shape. Kept so the
        hardened guard is a strict superset of the one it replaces.
        """
        collapsed = " ".join((_pf_source_dir() / rel).read_text(encoding="utf-8").split())
        assert "find_workflow_file(get_all_workflows_dirs" not in collapsed, (
            f"{rel} resolves a workflow without the dist tier. Use "
            "resolve_workflow_file(), which includes it as the floor."
        )

    def test_guard_is_superset_of_162_29(self) -> None:
        """The extended list must still cover every module 162-29 guarded.

        A refactor that trims the list back to the sweep's three modules would
        silently drop the six the original guard protected.
        """
        original = {
            "prime/workflow.py",
            "handoff/complete_phase.py",
            "handoff/resolve_gate.py",
            "handoff/cli.py",
            "subagent/chain.py",
            "subagent/gate.py",
        }
        assert original.issubset(set(EXTENDED_OWNERSHIP_MODULES))


# ---------------------------------------------------------------------------
# AC2 (162-51) — `pf workflow route` trigger-tag enumeration must see the dist
# floor. In a dist-only consumer, ``get_all_workflows_dirs(root)`` (no dist)
# returns [], so no story can ever match a workflow by trigger tag.
#
# Pinned at source level (the same idiom the recurrence guard uses): a behavioral
# pin would need a full sharded-sprint fixture, but the defect is precisely the
# missing dist floor in this one enumeration. `pf workflow list` deliberately
# stays project-only (162-29 fixed enumeration OFF by default) — resolution
# includes dist, pure listing does not.
# ---------------------------------------------------------------------------


class TestRouteEnumerationSeesDist:
    def test_route_enumerates_with_dist_floor(self) -> None:
        from pf.workflow.cli import workflow_route_cmd

        source = textwrap.dedent(inspect.getsource(workflow_route_cmd.callback))
        collapsed = " ".join(source.split())

        assert "get_all_workflows_dirs" in collapsed, (
            "workflow route no longer enumerates workflow definitions for "
            "trigger-tag matching."
        )
        assert "include_dist=True" in collapsed, (
            "workflow route enumerates with get_all_workflows_dirs(root) but "
            "omits include_dist=True, so in an npm/pip consumer (workflows only "
            "in dist) the candidate list is empty and no story matches a "
            "workflow by trigger tag. Pass include_dist=True — resolution must "
            "see the dist floor."
        )


# ---------------------------------------------------------------------------
# AC3 (162-51) — helpers._resolve_path is an absolute-path sink.
# An absolute steps path from workflow YAML is returned verbatim, so step
# enumeration (count_steps / find_step_file) can be pointed anywhere (CWE-22).
# ---------------------------------------------------------------------------


class TestResolvePathAbsoluteSink:
    def test_absolute_path_escaping_root_is_contained(self, tmp_path: Path) -> None:
        from pf.workflow.helpers import _resolve_path

        project_root = tmp_path / "proj"
        project_root.mkdir()
        workflow_dir = project_root / ".pennyfarthing" / "workflows" / "wf"
        workflow_dir.mkdir(parents=True)

        outside = tmp_path / "outside"
        outside.mkdir()

        resolved = _resolve_path(str(outside), workflow_dir, project_root).resolve()
        assert resolved.is_relative_to(project_root.resolve()), (
            f"_resolve_path returned {resolved} for an absolute steps path that "
            "escapes the project root. An absolute path from workflow YAML must "
            "be contained to the project (or the workflow dir), not handed back "
            "verbatim — otherwise count_steps/find_step_file can enumerate an "
            "arbitrary directory (CWE-22)."
        )

    def test_relative_traversal_escaping_root_is_contained(self, tmp_path: Path) -> None:
        """A relative ``..`` path (not just absolute) must not escape the root.

        The classic traversal vector: `project_root / "../../../evil"` escapes on
        OS normalization. The absolute-path guard alone left this open.
        """
        from pf.workflow.helpers import _resolve_path

        project_root = tmp_path / "proj"
        project_root.mkdir()
        workflow_dir = project_root / ".pennyfarthing" / "workflows" / "wf"
        workflow_dir.mkdir(parents=True)

        resolved = _resolve_path("../../../evil", workflow_dir, project_root).resolve()
        assert resolved.is_relative_to(project_root.resolve()), (
            f"_resolve_path returned {resolved} for a relative traversal path — "
            "it escapes the project root. Containment must cover the relative "
            "(`..`) branch, not just absolute paths (CWE-22)."
        )

    def test_absolute_path_inside_root_is_identity(self, tmp_path: Path) -> None:
        """A legitimate in-tree absolute path resolves to itself (not re-rooted).

        Pins identity, not mere containment: a guard that re-homed a valid path
        to a *different* in-tree location would still be inside the root and pass
        a containment-only check, silently pointing steps at the wrong dir.
        """
        from pf.workflow.helpers import _resolve_path

        project_root = tmp_path / "proj"
        project_root.mkdir()
        workflow_dir = project_root / ".pennyfarthing" / "workflows" / "wf"
        workflow_dir.mkdir(parents=True)
        inside = project_root / "steps"

        assert _resolve_path(str(inside), workflow_dir, project_root) == inside.resolve()

    def test_relative_paths_unaffected(self, tmp_path: Path) -> None:
        """``./x`` resolves against workflow_dir; bare ``x`` against project_root.

        _resolve_path returns the resolved (symlink/`..`-collapsed) path, so
        compare against the resolved forms.
        """
        from pf.workflow.helpers import _resolve_path

        project_root = tmp_path / "proj"
        project_root.mkdir()
        workflow_dir = project_root / ".pennyfarthing" / "workflows" / "wf"
        workflow_dir.mkdir(parents=True)

        assert (
            _resolve_path("./steps", workflow_dir, project_root)
            == (workflow_dir / "steps").resolve()
        )
        assert (
            _resolve_path("steps", workflow_dir, project_root)
            == (project_root / "steps").resolve()
        )


# ---------------------------------------------------------------------------
# AC5 (162-52) — prime.loader.load_step_content joins an UNSANITIZED workflow
# name into ``.pennyfarthing/workflows/{name}/steps``. The name arrives from the
# session ``**Workflow:**`` line, so a traversal or absolute name reads step
# files from outside the workflows tier (CWE-22). Guard precedent:
# helpers.is_contained_path / epic-162 commit 26cb554.
# ---------------------------------------------------------------------------

STEP_BODY = "---\ntitle: Step\n---\n# Legit step 1\n"


class TestStepContentContainment:
    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        # A workflows tier must exist for the traversal to be *reachable*: with
        # no tier dir the relative name is joined onto dist and the payload is
        # never found, so the test would pass vacuously.
        (tmp_path / ".pennyfarthing" / "workflows").mkdir(parents=True)
        return tmp_path

    def test_legitimate_name_resolves(self, project: Path) -> None:
        from pf.prime.loader import load_step_content

        step = project / ".pennyfarthing" / "workflows" / "myflow" / "steps" / "step-01-plan.md"
        step.parent.mkdir(parents=True)
        step.write_text(STEP_BODY)

        assert load_step_content("myflow", 1, project) == STEP_BODY

    def test_traversal_name_does_not_read_outside_the_tier(self, project: Path) -> None:
        from pf.prime.loader import load_step_content

        # Plant an "attacker" step OUTSIDE the workflows tier. Three `..` clear
        # `.pennyfarthing/workflows` back to the project parent.
        evil = project.parent / "evil" / "steps" / "step-01-pwn.md"
        evil.parent.mkdir(parents=True)
        evil.write_text("PWNED")

        result = load_step_content("../../../evil", 1, project)
        assert result != "PWNED", (
            "load_step_content read a step file from OUTSIDE the workflows tier "
            "via a traversal workflow name. The name comes from the session "
            "'**Workflow:**' line and must be containment-checked (CWE-22)."
        )
        assert result is None

    def test_absolute_name_does_not_read_outside_the_tier(self, project: Path) -> None:
        from pf.prime.loader import load_step_content

        evil = project.parent / "abs" / "steps" / "step-01-pwn.md"
        evil.parent.mkdir(parents=True)
        evil.write_text("PWNED")
        absolute = str(project.parent / "abs")

        result = load_step_content(absolute, 1, project)
        assert result != "PWNED", (
            "An absolute workflow name escapes the workflows dir entirely — "
            "Path.__truediv__ discards the left operand."
        )
        assert result is None

    def test_dist_fallback_still_resolves(self, tmp_path: Path) -> None:
        """A consumer with steps only on the dist floor must still resolve them.

        ``get_dist_root()`` resolves ``{root}/pennyfarthing-dist/`` and there is
        no ``.pennyfarthing/workflows`` tier, so this exercises the dist branch
        of load_step_content — the containment fix must not break it.
        """
        from pf.prime.loader import load_step_content

        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text("theme: mash\n")
        dist_step = (
            tmp_path / "pennyfarthing-dist" / "workflows" / "myflow" / "steps" / "step-01-plan.md"
        )
        dist_step.parent.mkdir(parents=True)
        dist_step.write_text(STEP_BODY)

        assert load_step_content("myflow", 1, tmp_path) == STEP_BODY


# ---------------------------------------------------------------------------
# AC7 (162-52) — `_get_phase_agent` must not diverge from the canonical reader.
# For a phase with no ``agent:`` key, prime.get_phase_owner returns None
# ("silence beats a wrong owner"), but complete_phase._get_phase_agent returns
# ``p.get("agent", phase)`` — the phase NAME. That is a fresh reader/writer
# disagreement, the exact class 162-29 forbids. True-RED.
# ---------------------------------------------------------------------------


class TestGetPhaseAgentProxyConsistency:
    @pytest.fixture
    def phase_without_agent(self, tmp_path: Path) -> Path:
        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text("theme: mash\n")
        _write_yaml(
            tmp_path / ".pennyfarthing" / "workflows" / "tdd.yaml",
            {"workflow": {"name": "tdd", "phases": [{"name": "red"}]}},
        )
        return tmp_path

    def test_reader_precondition_returns_none(self, phase_without_agent: Path) -> None:
        from pf.prime.workflow import get_phase_owner

        assert get_phase_owner("tdd", "red", phase_without_agent) is None

    def test_writer_agrees_with_reader_on_missing_agent(self, phase_without_agent: Path) -> None:
        from pf.handoff.complete_phase import _get_phase_agent
        from pf.prime.workflow import get_phase_owner

        reader = get_phase_owner("tdd", "red", phase_without_agent)
        writer = _get_phase_agent(phase_without_agent, "tdd", "red")
        # Pin the concrete value (None), not just equality — writer == reader
        # alone would pass spuriously if both later returned the phase name.
        assert writer == reader is None, (
            f"Reader/writer disagreement on a phase with no agent: reader="
            f"{reader!r} (None) but _get_phase_agent={writer!r} (the phase name). "
            "The writer must not invent 'red' as the owner — it stamps that agent "
            "name into the session and disables _validate_phase_names' correction. "
            "Unify _get_phase_agent with the reader's contract (None when no agent)."
        )


# ---------------------------------------------------------------------------
# AC6 (162-52) — `_load_workflow_phases` nullability unified.
# subagent/chain.py and subagent/gate.py carry byte-identical copies; they must
# behave identically and never drift, and every loader must resolve the same
# phase sequence from the same source for valid input. GREEN-ON-ARRIVAL:
# 162-29 already routed all three through resolve_workflow_file; these are
# regression sentinels that lock the unified contract in place.
# ---------------------------------------------------------------------------


class TestLoaderNullabilityUnified:
    @pytest.fixture
    def bare_project(self, tmp_path: Path) -> Path:
        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text("theme: mash\n")
        return tmp_path

    @pytest.mark.parametrize(
        ("label", "body"),
        [
            ("malformed", "workflow: [this is: not: valid: yaml\n  - broken\n"),
            ("empty", ""),
            ("scalar", "just-a-string\n"),
        ],
    )
    def test_chain_and_gate_loaders_behave_identically(
        self, bare_project: Path, label: str, body: str
    ) -> None:
        """Two identical copies must not be allowed to drift apart."""
        wf = bare_project / ".pennyfarthing" / "workflows" / "tdd.yaml"
        wf.parent.mkdir(parents=True, exist_ok=True)
        wf.write_text(body)

        chain = importlib.import_module("pf.subagent.chain")._load_workflow_phases
        gate = importlib.import_module("pf.subagent.gate")._load_workflow_phases

        assert chain("tdd", bare_project) == gate("tdd", bare_project) is None, (
            f"chain and gate _load_workflow_phases disagree on {label} YAML — "
            "they are duplicate implementations of one contract and must not "
            "drift (both degrade to None, project rule 6)."
        )

    def test_all_loaders_share_the_same_source_for_valid_input(self, tmp_path: Path) -> None:
        """chain, gate and complete_phase resolve the SAME phase sequence.

        Non-vacuous: pins the concrete packaged tdd phase names, so a loader
        answering from a different file (or nothing) is caught. With no project
        workflows tier, tdd.yaml resolves from the bundled ``pf._dist`` package
        (get_dist_root's final fallback) — no fixture workflows dir is needed.
        """
        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".pennyfarthing" / "config.local.yaml").write_text("theme: mash\n")

        from pf.handoff.complete_phase import _load_workflow_phases as cp_phases
        from pf.subagent.chain import _load_workflow_phases as chain_phases
        from pf.subagent.gate import _load_workflow_phases as gate_phases

        expected = ["setup", "red", "green", "review", "finish"]
        assert [p.get("name") for p in (chain_phases("tdd", tmp_path) or [])] == expected
        assert [p.get("name") for p in (gate_phases("tdd", tmp_path) or [])] == expected
        assert [p.get("name") for p in cp_phases(tmp_path, "tdd")] == expected


# ---------------------------------------------------------------------------
# AC8 (162-52) — dist-only regression for `_get_phase_tandem`.
# The packaged tdd.yaml carries no tandem, so this uses a dist-only fixture that
# ships a workflow WITH one, proving _get_phase_tandem reaches the dist floor and
# agrees with the reader there. GREEN-ON-ARRIVAL: _get_phase_tandem already uses
# resolve_workflow_file (dist-included); this locks it against regression.
# ---------------------------------------------------------------------------


class TestTandemDistOnlyRegression:
    def test_writer_resolves_tandem_from_dist(self, dist_floor_project: Path) -> None:
        from pf.handoff.complete_phase import _get_phase_tandem

        tandem = _get_phase_tandem(dist_floor_project, "tandemflow", "red")
        assert tandem == {"partner": "reviewer", "mode": "backseat"}, (
            f"_get_phase_tandem returned {tandem!r} in a dist-only layout. The "
            "tandem block lives only in the packaged workflow; a None answer "
            "means the writer never reached the dist floor."
        )

    def test_reader_and_writer_agree_on_dist_tandem(self, dist_floor_project: Path) -> None:
        from pf.handoff.complete_phase import _get_phase_tandem
        from pf.prime.workflow import get_phase_tandem_config

        reader = get_phase_tandem_config("tandemflow", "red", dist_floor_project)
        writer = _get_phase_tandem(dist_floor_project, "tandemflow", "red")
        # Pin the concrete value, not just equality — None == None would let a
        # pair that both resolve nothing pass as spurious "agreement".
        assert reader == writer == {"partner": "reviewer", "mode": "backseat"}
