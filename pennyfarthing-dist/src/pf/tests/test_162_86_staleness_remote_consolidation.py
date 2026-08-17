"""RED tests for Story 162-86: finish staleness configured-remote honoring.

Two follow-up findings from the 162-71 review (``sprint/archive/162-71-session.md``):

Change A — CONSOLIDATION. ``staleness.py`` carries two parallel per-repo maps:
``_BASE_BRANCH_BY_REPO`` and ``_REMOTE_BY_REPO`` (the latter added in 162-71 as a
self-contained mirror of the base-branch pattern). The review filed a
consolidation finding: merge the two into ONE guarded lookup keyed by repo that
carries both the base branch and the remote, so a non-origin repo is honored by
updating a single entry instead of two divergent ones.

Change B — THREAD REMOTE INTO THE SUMMARY. ``check_story_staleness`` resolves the
configured ``remote`` (162-71) and threads it through ``_resolve_revision`` /
``_run_git_log``, but the value never reaches the result dict, and
``_print_human_summary`` still prints a HARDCODED ``origin/{base_branch}`` in the
drift banner. A repo whose configured remote is not ``origin`` therefore shows a
cosmetically wrong upstream in the human banner even though the drift math used
the right one. Thread ``remote`` into the result dict and render it in the banner.

Scope guard (162-27/162-71 product call): base/remote come from repos.yaml
config, NOT operator-supplied session fields — so full-ref-path / gitrevisions-DWIM
hardening is OUT OF SCOPE. This is configured-remote honoring only.

The guarded-unknown-repo and result-shape contracts are already pinned by
``tests/python/test_151_5_staleness_preflight.py`` (``TestUnknownRepoSilentFallback``,
``TestResultShapeUniformity``); this file adds a scoped regression guard so the
consolidation refactor cannot quietly drop the guard.

Epic 162 — Finish & sprint-tooling truthfulness. Workflow: tdd.
"""

from __future__ import annotations

import inspect
import os
import subprocess
from pathlib import Path

import pytest

from pf.sprint import staleness
from pf.sprint.staleness import _print_human_summary, check_story_staleness

# ---------------------------------------------------------------------------
# Fixtures — a real tmp_path git repo + a sprint YAML, mirroring the 151-5
# suite so these tests exercise actual git resolution, not a mock contract.
# ---------------------------------------------------------------------------

_GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}


def _git(cwd: Path, *args: str) -> str:
    env = {**os.environ, **_GIT_ENV}
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True, env=env
    ).stdout


def _write_yaml(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _commit(repo: Path, rel: str, body: str, msg: str, when: str) -> str:
    target = repo / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")
    _git(repo, "add", rel)
    env = {**os.environ, **_GIT_ENV, "GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when}
    subprocess.run(
        ["git", "commit", "-m", msg, "--date", when],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    return _git(repo, "rev-parse", "HEAD").strip()


@pytest.fixture
def sprint_root(tmp_path: Path) -> Path:
    """Project root with a sprint YAML and a pennyfarthing story."""
    root = tmp_path / "orchestrator"
    _write_yaml(
        root / "sprint" / "current-sprint.yaml",
        """\
sprint:
  name: TO Sprint 2632
  goal: test
  start_date: '2026-05-04'
  end_date: '2026-05-17'
  status: active
  number: 2632
epics:
  - '151'
stories: []
""",
    )
    _write_yaml(
        root / "sprint" / "epic-151.yaml",
        """\
id: '151'
type: epic
title: Test epic
status: backlog
repos: pennyfarthing
stories:
  - id: 151-5
    title: staleness preflight
    points: 3
    status: backlog
    repos: pennyfarthing
    workflow: tdd
    implementation_surface:
      - pennyfarthing-dist/src/pf/sprint/staleness.py
""",
    )
    return root


@pytest.fixture
def impl_repo(tmp_path: Path) -> Path:
    """A git repo standing in for ``pennyfarthing/`` with a develop branch."""
    repo = tmp_path / "pennyfarthing"
    repo.mkdir()
    _git(repo, "init", "-b", "develop")
    _commit(repo, "README.md", "init\n", "initial commit", "2026-04-01T00:00:00")
    return repo


def _drift_result(remote: str, base_branch: str = "develop") -> dict:
    """Build a drift-shaped result dict as ``_print_human_summary`` consumes it,
    carrying the post-162-86 ``remote`` key. Kept independent of ``_result()``'s
    signature so the banner assertion does not depend on Change A landing first.
    """
    return {
        "success": True,
        "status": "drift",
        "story_id": "162-86",
        "since": "2026-05-04",
        "base_branch": base_branch,
        "remote": remote,
        "paths_checked": ["pennyfarthing-dist/src/pf/sprint/staleness.py"],
        "commits": [
            {
                "hash": "0" * 40,
                "short_hash": "000000000",
                "date": "2026-05-05T10:00:00",
                "subject": "overtaking commit",
                "files_overlap": ["pennyfarthing-dist/src/pf/sprint/staleness.py"],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Change B — the configured remote must reach the result dict.
# ---------------------------------------------------------------------------


class TestRemoteThreadedIntoResult:
    """RED: ``check_story_staleness`` computes ``remote`` but never puts it in
    the result dict, so no consumer (banner, audit) can see which upstream the
    drift math ran against."""

    def test_clean_result_carries_configured_remote(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("status") == "clean", f"sanity: expected clean, got {result}"
        assert "remote" in result, (
            "162-86: the configured remote must be threaded into the result dict "
            f"so consumers can see which upstream was used; keys={sorted(result)}"
        )
        assert result["remote"] == "origin", (
            "pennyfarthing's configured remote is 'origin'; the result must echo "
            f"it back verbatim, got {result.get('remote')!r}"
        )

    def test_drift_result_carries_configured_remote(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        _commit(
            impl_repo,
            "pennyfarthing-dist/src/pf/sprint/staleness.py",
            "# overtaken\n",
            "feat: pre-empt work",
            "2026-05-05T10:00:00",
        )
        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("status") == "drift", f"sanity: expected drift, got {result}"
        assert result.get("remote") == "origin", (
            "the drift result must also carry the configured remote so the banner "
            f"and any audit trail render the right upstream; got {result.get('remote')!r}"
        )


# ---------------------------------------------------------------------------
# Change B — the drift banner must render the configured remote, not a
# hardcoded ``origin/``.
# ---------------------------------------------------------------------------


class TestHumanSummaryHonorsConfiguredRemote:
    def test_drift_banner_shows_configured_remote_not_hardcoded_origin(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """RED: the banner prints ``on origin/{base_branch}`` literally. A repo
        whose configured remote is ``upstream`` must show ``upstream/develop``,
        never the misleading hardcoded ``origin/develop``."""
        _print_human_summary(_drift_result(remote="upstream"))
        out = capsys.readouterr().out
        assert "upstream/develop" in out, (
            "162-86: drift banner must render the configured remote "
            f"('upstream/develop'); got output:\n{out}"
        )
        assert "origin/develop" not in out, (
            "162-86: the hardcoded 'origin/' prefix must be gone — a non-origin "
            f"repo shows a wrong upstream otherwise; got output:\n{out}"
        )

    def test_drift_banner_shows_origin_for_origin_repo(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Green-on-arrival parity guard: for the common origin repo the banner
        still reads ``origin/develop`` — but now driven by the result's ``remote``
        value, not a literal. Guards against the fix regressing the common case."""
        _print_human_summary(_drift_result(remote="origin"))
        out = capsys.readouterr().out
        assert "origin/develop" in out, (
            f"origin repo must still render 'origin/develop'; got output:\n{out}"
        )


# ---------------------------------------------------------------------------
# Change A — the two parallel repo maps must be consolidated into one guarded
# lookup carrying both base and remote.
# ---------------------------------------------------------------------------


class TestConsolidatedRepoLookup:
    def test_parallel_remote_map_is_consolidated_away(self) -> None:
        """RED: 162-71 introduced ``_REMOTE_BY_REPO`` as a second per-repo dict
        parallel to ``_BASE_BRANCH_BY_REPO``. The 162-71 review filed the
        consolidation: the two must become ONE lookup carrying both fields, so
        the standalone parallel remote map must no longer exist. This is a
        stable module-attribute invariant (survives reformatting) that fails
        precisely when the two maps stay divergent — the violation to catch.

        Dev owns the shape of the unified carrier (dict-of-dataclass, dict-of-
        tuples, renamed dict, etc.); this only forbids keeping the second
        parallel dict alongside the first.
        """
        assert not hasattr(staleness, "_REMOTE_BY_REPO"), (
            "162-86: the parallel `_REMOTE_BY_REPO` map must be folded into a "
            "single guarded per-repo lookup carrying both base and remote — a "
            "standalone second dict is the un-consolidated state this story removes"
        )

    def test_known_repo_resolves_both_base_and_remote_from_one_lookup(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """RED (via the ``remote`` key): a known repo must resolve BOTH its base
        branch and its remote from the consolidated lookup, and both must reach
        the result — proving the single source carries both fields."""
        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("base_branch") == "develop", (
            f"pennyfarthing base branch must resolve to 'develop', got "
            f"{result.get('base_branch')!r}"
        )
        assert result.get("remote") == "origin", (
            "the same consolidated lookup must carry the remote ('origin') "
            f"alongside the base branch; got remote={result.get('remote')!r}"
        )

    def test_non_origin_remote_traverses_lookup_into_result_end_to_end(
        self,
        sprint_root: Path,
        impl_repo: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """RED-for-rework (162-86 F1): the story's headline behavior — a
        NON-origin configured remote honored end-to-end — must be pinned through
        the real `check_story_staleness` pipeline, not only at the isolated
        banner. Every other pipeline test uses the sole `_REPO_CONFIG` entry
        (`pennyfarthing` → remote `origin`), so `test_known_repo_resolves_*` is
        tautological: a hardcoded `_result(remote="origin")` would pass it.

        Here we monkeypatch the `pennyfarthing` config entry to a NON-origin
        remote and assert the result echoes it — a hardcoded `origin` fails this,
        proving the value traverses `_REPO_CONFIG` lookup → `remote` var →
        `_result()`.
        """
        monkeypatch.setitem(
            staleness._REPO_CONFIG,
            "pennyfarthing",
            {"base": "develop", "remote": "upstream"},
        )
        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        # Clean run (no drift commits) — the point is the threaded remote value,
        # which must be the configured non-origin one, not a hardcoded 'origin'.
        assert result.get("success") is True, f"sanity: expected success, got {result}"
        assert result.get("remote") == "upstream", (
            "162-86 F1: a non-origin configured remote must traverse the "
            "_REPO_CONFIG lookup all the way into the result dict; a hardcoded "
            f"'origin' would fail here. got remote={result.get('remote')!r}"
        )
        assert result.get("base_branch") == "develop", (
            f"base branch must still resolve from the same entry; got "
            f"{result.get('base_branch')!r}"
        )

    def test_unknown_repo_still_guarded_after_consolidation(
        self, tmp_path: Path
    ) -> None:
        """Regression guard (green on arrival): the consolidation must not drop
        the unknown-repo guard. An unknown repo must surface success=False with
        the repo named — never a silent fallback to a default base/remote.

        Complements ``test_151_5::TestUnknownRepoSilentFallback`` by pinning the
        guard specifically against the refactor that rehomes the lookup.
        """
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2632
  start_date: '2026-05-04'
  status: active
  number: 2632
epics:
  - '151'
stories: []
""",
        )
        _write_yaml(
            root / "sprint" / "epic-151.yaml",
            """\
id: '151'
type: epic
status: backlog
repos: pennyfarthing
stories:
  - id: 151-Z
    title: story in an unknown repo
    points: 3
    status: backlog
    repos: nonexistent-repo
    workflow: tdd
    implementation_surface:
      - foo.py
""",
        )
        repo = tmp_path / "nonexistent-repo"
        repo.mkdir()
        _git(repo, "init", "-b", "develop")
        _commit(repo, "README.md", "x\n", "init", "2026-04-01T00:00:00")

        result = check_story_staleness(
            "151-Z",
            project_root=root,
            repo_path_overrides={"nonexistent-repo": repo},
        )
        assert result.get("success") is False, (
            f"unknown repo must surface success=False, not silent clean; got {result}"
        )
        assert result.get("status") != "clean", (
            f"unknown repo must never report clean; got {result.get('status')!r}"
        )
        assert "nonexistent-repo" in (result.get("error") or ""), (
            "the error must name the unknown repo so the operator can fix it; "
            f"got error={result.get('error')!r}"
        )


# ---------------------------------------------------------------------------
# Rule coverage — lang-review/python.md §3 (type annotations at boundaries).
# ---------------------------------------------------------------------------


class TestRuleCoverage:
    def test_public_check_story_staleness_annotations_intact(self) -> None:
        """§3 — the public entry point must keep complete annotations across the
        refactor: a return type and every parameter annotated."""
        sig = inspect.signature(check_story_staleness)
        assert sig.return_annotation is not inspect.Signature.empty, (
            "check_story_staleness must retain its return type annotation"
        )
        unannotated = [
            name
            for name, p in sig.parameters.items()
            if p.annotation is inspect.Parameter.empty
        ]
        assert unannotated == [], (
            f"check_story_staleness has unannotated parameters: {unannotated}"
        )
