"""RED tests for 155-8: delegate epic-ref resolution to the canonical
``_get_epic_ref`` (155-4 Reviewer deferral, PR pennyfarthing#126).

Bug class (MEDIUM, latent): two call sites reimplement the epic-ref formula
``str(epic.get("jira") or epic.get("id") or "")`` instead of delegating to the
one canonical resolver ``pf.sprint.yaml_io._get_epic_ref``:

  * ``pf/sprint/story_finish.py::_resolve_epic_ref``  (the ``or`` chain at the
    line that builds ``ref`` from the containing epic)
  * ``pf/sprint/archive_epic.py::backfill_epic_refs``  (the ``or`` chain that
    builds the ``id_to_epic`` map)

The local ``or`` formula diverges from ``_get_epic_ref`` in exactly two shapes,
both of which write a WRONG epic ref that misgroups orphans / produces a
double-prefixed shard filename:

  1. **sentinel-jira epic** — ``jira`` holds a truthy placeholder that is NOT a
     real Jira key (``NO_JIRA_SENTINELS = {"", "none", "null", "x"}``; the
     truthy ones ``"none"/"null"/"x"`` are the trap). The local ``or`` returns
     the sentinel verbatim (``"none"``); ``_get_epic_ref`` rejects it (fails
     ``JIRA_PATTERN``) and falls through to the numeric id (``"94"``).
  2. **``epic-``-prefixed no-jira epic** — id ``"epic-94"`` with no real jira.
     The local ``or`` returns ``"epic-94"`` → the ADR-0022 double-prefix trap
     (``epic:'epic-94'`` → ``epic-epic-94.yaml``). ``_get_epic_ref`` strips the
     prefix and returns ``"94"``.

Latent only today: every *live* epic carries a real ``PROJ-*`` jira, so all
three resolvers currently agree. The value of this story is the regression pin
below, which fixes the pipeline (SOUL #1) by making ``_get_epic_ref`` the single
source of truth (SOUL #2, "one truth, one place").

Pinned contract (TEA, RED phase):
  AC1 — ``_resolve_epic_ref`` resolves the two divergent epic shapes IDENTICALLY
        to ``_get_epic_ref`` (delegation), and its body actually calls
        ``_get_epic_ref`` (structural / one-truth).
  AC2 — ``backfill_epic_refs`` resolves the two divergent epic shapes IDENTICALLY
        to ``_get_epic_ref``, and its body actually calls ``_get_epic_ref``.
  AC3 — Regression pin: for a sentinel-jira epic AND an ``epic-``-prefixed
        no-jira epic, all three resolvers return the SAME ref.

The behavioral tests use ``_get_epic_ref`` as the oracle, so they pass whether
Dev delegates directly OR (undesirably) re-derives the same value — but the
structural AST tests forbid a third copy of the formula, which is the whole
point of the refactor. Behavioral tests are RED today because the ``or`` chain
diverges; structural tests are RED because neither function calls the canonical
resolver yet.
"""

import ast
from pathlib import Path
from typing import Any

import pytest

import pf.sprint.archive_epic as archive_epic_mod
import pf.sprint.story_finish as story_finish_mod
from pf.sprint.archive_epic import backfill_epic_refs
from pf.sprint.story_finish import _resolve_epic_ref
from pf.sprint.yaml_io import _get_epic_ref, _write_yaml_file

ARCHIVE_NAME = "sprint-155-completed.yaml"

# (epic dict, story id living inside it, expected canonical ref) --------------
# The two shapes where the local `or` formula diverges from `_get_epic_ref`.
DIVERGENT_CASES = [
    pytest.param(
        {"id": "94", "jira": "none", "status": "in_progress",
         "stories": [{"id": "94-1", "title": "s", "points": 1}]},
        "94-1",
        "94",
        id="sentinel-jira",
    ),
    pytest.param(
        {"id": "epic-94", "status": "in_progress",
         "stories": [{"id": "95-1", "title": "s", "points": 1}]},
        "95-1",
        "94",
        id="epic-prefixed-no-jira",
    ),
]

# Shapes where all three resolvers already agree — the delegation must NOT break
# them (over-reach guards; intentionally green-on-arrival).
PRESERVED_CASES = [
    pytest.param(
        {"id": "155", "jira": "PROJ-155", "status": "in_progress",
         "stories": [{"id": "155-1", "title": "s", "points": 1}]},
        "155-1",
        "PROJ-155",
        id="real-jira",
    ),
    pytest.param(
        {"id": "156", "status": "in_progress",
         "stories": [{"id": "156-1", "title": "s", "points": 1}]},
        "156-1",
        "156",
        id="numeric-id-no-jira",
    ),
]


# --- fixtures / helpers -------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A tmp project root, isolated from any ambient orchestrator sprint so all
    resolution uses our tree (mirrors 155-4's fixture)."""
    monkeypatch.delenv("PROJECT_ROOT", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    (tmp_path / "sprint" / "archive").mkdir(parents=True)
    return tmp_path


def _make_sprint(root: Path, epic: dict[str, Any]) -> None:
    """Write ``current-sprint.yaml`` with a single inline epic."""
    index = {
        "sprint": {"name": "Sprint 155", "number": 155, "status": "active"},
        "epics": [epic],
        "stories": [],
    }
    _write_yaml_file(root / "sprint" / "current-sprint.yaml", index)


def _seed_archive(root: Path, story_id: str) -> None:
    """Seed the completed-archive with one row whose ``epic`` is empty so
    ``backfill_epic_refs`` has something to resolve. Written raw (bypassing the
    ``_write_archive_file`` empty-epic guard, which is exactly what backfill
    exists to repair)."""
    completed = {
        "sprint": {"name": "Sprint 155", "number": 155, "status": "active"},
        "completed_epics": [],
        "completed_stories": [
            {"id": story_id, "epic": "", "title": "x", "points": 1,
             "status": "done", "completed": "2026-01-01"},
        ],
    }
    _write_yaml_file(root / "sprint" / "archive" / ARCHIVE_NAME, completed)


def _backfilled_ref(root: Path, story_id: str) -> Any:
    """Run backfill and return the epic ref it resolved for ``story_id`` (the
    fix-agnostic resolution output — present in ``backfilled`` before the
    file-write guard runs)."""
    result = backfill_epic_refs(root)
    for row in result.get("backfilled") or []:
        if row.get("id") == story_id:
            return row.get("epic")
    return None


def _function_calls(module: Any, func_name: str, callee: str) -> bool:
    """True iff ``func_name`` in ``module`` contains a call to ``callee``
    (by bare name or attribute), per the module source AST."""
    tree = ast.parse(Path(module.__file__).read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == func_name:
            for sub in ast.walk(node):
                if isinstance(sub, ast.Call):
                    f = sub.func
                    if isinstance(f, ast.Name) and f.id == callee:
                        return True
                    if isinstance(f, ast.Attribute) and f.attr == callee:
                        return True
            return False
    raise AssertionError(f"{func_name} not found in {module.__file__}")


# --- AC1: story_finish._resolve_epic_ref delegates ---------------------------


@pytest.mark.parametrize("epic, story_id, expected", DIVERGENT_CASES)
def test_resolve_epic_ref_matches_canonical(
    project: Path, epic: dict[str, Any], story_id: str, expected: str
) -> None:
    """``_resolve_epic_ref`` must resolve a divergent epic identically to the
    canonical ``_get_epic_ref`` (RED today: the local ``or`` chain returns the
    sentinel / ``epic-``-prefixed value)."""
    _make_sprint(project, epic)
    oracle = _get_epic_ref(epic)
    assert oracle == expected  # oracle sanity

    got = _resolve_epic_ref(project, story_id, {"id": story_id})
    assert got == oracle, (
        f"_resolve_epic_ref returned {got!r} for epic {epic.get('id')!r}; "
        f"canonical _get_epic_ref returns {oracle!r} — the local 'or' formula "
        "diverges (must delegate to _get_epic_ref)"
    )


def test_resolve_epic_ref_delegates_to_canonical() -> None:
    """Structural / one-truth: ``_resolve_epic_ref`` must call ``_get_epic_ref``
    rather than reimplement the formula (SOUL #2)."""
    assert _function_calls(story_finish_mod, "_resolve_epic_ref", "_get_epic_ref"), (
        "_resolve_epic_ref does not call _get_epic_ref — it still reimplements "
        "the epic-ref formula instead of delegating to the canonical resolver"
    )


# --- AC2: archive_epic.backfill_epic_refs delegates --------------------------


@pytest.mark.parametrize("epic, story_id, expected", DIVERGENT_CASES)
def test_backfill_epic_ref_matches_canonical(
    project: Path, epic: dict[str, Any], story_id: str, expected: str
) -> None:
    """``backfill_epic_refs`` must resolve a divergent epic identically to
    ``_get_epic_ref`` (RED today: the ``id_to_epic`` map uses the local ``or``
    chain)."""
    _make_sprint(project, epic)
    _seed_archive(project, story_id)
    oracle = _get_epic_ref(epic)
    assert oracle == expected  # oracle sanity

    got = _backfilled_ref(project, story_id)
    assert got == oracle, (
        f"backfill_epic_refs resolved {got!r} for epic {epic.get('id')!r}; "
        f"canonical _get_epic_ref returns {oracle!r} — the id_to_epic 'or' "
        "formula diverges (must delegate to _get_epic_ref)"
    )


def test_backfill_delegates_to_canonical() -> None:
    """Structural / one-truth: ``backfill_epic_refs`` must call ``_get_epic_ref``
    when building its ``id_to_epic`` map (SOUL #2)."""
    assert _function_calls(archive_epic_mod, "backfill_epic_refs", "_get_epic_ref"), (
        "backfill_epic_refs does not call _get_epic_ref — it still reimplements "
        "the epic-ref formula instead of delegating to the canonical resolver"
    )


# --- AC3: all three resolvers agree on the divergent shapes ------------------


@pytest.mark.parametrize("epic, story_id, expected", DIVERGENT_CASES)
def test_all_three_resolvers_agree(
    project: Path, epic: dict[str, Any], story_id: str, expected: str
) -> None:
    """The regression pin: for a sentinel-jira epic and an ``epic-``-prefixed
    no-jira epic, ``_get_epic_ref`` / ``_resolve_epic_ref`` / ``backfill_epic_refs``
    must return the SAME ref (RED today — the two call sites diverge)."""
    _make_sprint(project, epic)
    _seed_archive(project, story_id)

    canonical = _get_epic_ref(epic)
    finish = _resolve_epic_ref(project, story_id, {"id": story_id})
    backfill = _backfilled_ref(project, story_id)

    assert canonical == expected  # oracle sanity
    assert finish == canonical == backfill, (
        "epic-ref resolvers disagree for "
        f"epic {epic.get('id')!r}: _get_epic_ref={canonical!r} "
        f"_resolve_epic_ref={finish!r} backfill_epic_refs={backfill!r} — "
        "all three must resolve identically (single canonical formula)"
    )


# --- Green-on-arrival guards (intentional; see Design Deviations) ------------


def test_canonical_oracle_anchor() -> None:
    """Pin the canonical resolver's output for both divergent shapes so the
    behavioral tests above rest on a known-good oracle (green today; guards a
    silent regression of ``_get_epic_ref`` itself)."""
    assert _get_epic_ref({"id": "94", "jira": "none"}) == "94", (
        "canonical _get_epic_ref must reject the truthy 'none' sentinel and "
        "fall through to the numeric id"
    )
    assert _get_epic_ref({"id": "epic-94"}) == "94", (
        "canonical _get_epic_ref must strip the 'epic-' prefix (ADR-0022)"
    )


@pytest.mark.parametrize("epic, story_id, expected", PRESERVED_CASES)
def test_preserved_cases_unchanged_across_resolvers(
    project: Path, epic: dict[str, Any], story_id: str, expected: str
) -> None:
    """Over-reach guard: shapes where the resolvers already agree (real-jira,
    numeric-id-no-jira) must STILL agree and STILL return the expected ref after
    delegation. Green-on-arrival by design — fails only if the fix over-applies
    and breaks the common path."""
    _make_sprint(project, epic)
    _seed_archive(project, story_id)

    canonical = _get_epic_ref(epic)
    finish = _resolve_epic_ref(project, story_id, {"id": story_id})
    backfill = _backfilled_ref(project, story_id)

    assert canonical == finish == backfill == expected, (
        f"delegation over-applied and broke the {epic.get('id')!r} common case: "
        f"_get_epic_ref={canonical!r} _resolve_epic_ref={finish!r} "
        f"backfill_epic_refs={backfill!r} (expected {expected!r})"
    )
