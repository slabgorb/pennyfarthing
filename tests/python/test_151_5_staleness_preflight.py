"""
Tests for Story 151-5: SM-setup base-branch staleness preflight.

The preflight detects stories whose implementation surface has been touched on
``origin/<base-branch>`` since ``sprint.start_date``. Without it, the same
story can be implemented twice (the 151-3 incident: PR #33 merged the same
scope on develop while our SM/TEA/Dev pipeline worked on a re-rebased branch
from before the merge).

Coverage:
    AC1 — clean case (no overlapping commits → status: clean)
    AC2 — drift case (structured commit list with hashes, dates, subjects,
          overlapping paths)
    AC3 — drift causes non-zero exit unless explicitly acknowledged
    AC4 — start_date sourced from sprint.start_date (NOT git history); clear
          error if missing
    AC5 — implementation surface from explicit YAML field; heuristic fallback
          from title/context; skipped-with-warning if no surface inferable

    Rule §1 (silent exception swallowing) — git invocation failures surface as
    ``success: False``, not silently swallowed under bare-except
    Rule §3 (type annotations) — public function signatures annotated
    Rule §6 (test quality) — every assert checks a specific value, not truthy
    Rule §11 (input validation) — git command does not interpolate untrusted
    story_id into a shell string

Run with::

    cd pennyfarthing && uv run python -m pytest \\
        tests/python/test_151_5_staleness_preflight.py -v
"""

from __future__ import annotations

import inspect
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

# Imports are deferred to test bodies so each fixture-built tmp_path is on
# sys.path / cwd before the module touches it. Keeps tests independent of any
# global module-level state that would persist across the suite.


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _write_yaml(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _git(cwd: Path, *args: str) -> str:
    """Run a git command in cwd. Returns stdout. Raises on non-zero."""
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        env={
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "test@example.com",
            "PATH": "/usr/bin:/bin:/usr/local/bin",
        },
    )
    return result.stdout


def _commit(repo: Path, files: dict[str, str], msg: str, when: str) -> str:
    """Write files, stage, commit with a fixed author date. Returns commit hash."""
    for rel, body in files.items():
        target = repo / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
    _git(repo, "add", *files.keys())
    subprocess.run(
        ["git", "commit", "-m", msg, "--date", when],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        env={
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "test@example.com",
            "GIT_AUTHOR_DATE": when,
            "GIT_COMMITTER_DATE": when,
            "PATH": "/usr/bin:/bin:/usr/local/bin",
        },
    )
    return _git(repo, "rev-parse", "HEAD").strip()


@pytest.fixture
def sprint_root(tmp_path: Path) -> Path:
    """A project root containing a sprint YAML with a known start_date."""
    root = tmp_path / "orchestrator"
    _write_yaml(
        root / "sprint" / "current-sprint.yaml",
        """\
sprint:
  name: TO Sprint 2618
  jira_sprint_id: 311
  jira_sprint_name: TO Sprint 2618
  goal: test
  start_date: '2026-05-04'
  end_date: '2026-05-17'
  status: active
  number: 2618
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
    title: SM-setup base-branch staleness preflight
    points: 3
    status: backlog
    repos: pennyfarthing
    workflow: tdd
    type: chore
    implementation_surface:
      - pennyfarthing-dist/src/pf/sprint/work.py
      - pennyfarthing-dist/src/pf/sprint/staleness.py
""",
    )
    return root


@pytest.fixture
def impl_repo(tmp_path: Path) -> Path:
    """A bare-bones git repo standing in for ``pennyfarthing/`` with a develop branch."""
    repo = tmp_path / "pennyfarthing"
    repo.mkdir()
    _git(repo, "init", "-b", "develop")
    _commit(
        repo,
        {"README.md": "init\n"},
        "initial commit",
        "2026-04-01T00:00:00",
    )
    return repo


@pytest.fixture
def impl_repo_feature_checkout(tmp_path: Path) -> Path:
    """A git repo where HEAD ≠ base branch.

    Sets up the production scenario: an agent has just created a feature branch
    off ``develop`` and is about to run the staleness preflight before red phase.
    HEAD points at ``feature/151-5``; ``develop`` exists alongside.

    The previous fixture (``impl_repo``) leaves HEAD == develop, which masks
    bugs that depend on the distinction (the [CRITICAL] reviewer finding that
    drove this red-rework).
    """
    repo = tmp_path / "pennyfarthing"
    repo.mkdir()
    _git(repo, "init", "-b", "develop")
    _commit(
        repo,
        {"README.md": "init\n"},
        "initial commit",
        "2026-04-01T00:00:00",
    )
    _git(repo, "checkout", "-b", "feature/151-5")
    return repo


# ---------------------------------------------------------------------------
# AC1: Clean case
# ---------------------------------------------------------------------------


class TestCleanCase:
    def test_no_overlapping_commits_returns_clean(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC1 — story with no develop activity since sprint_start: status=clean."""
        # Commit something *before* sprint start_date and on an *unrelated* path
        _commit(
            impl_repo,
            {"docs/unrelated.md": "x\n"},
            "docs change before sprint",
            "2026-04-15T00:00:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )

        assert result.get("success") is True, (
            f"clean case must return success=True, got {result}"
        )
        assert result.get("status") == "clean", (
            f"no overlapping commits → status must be 'clean', got {result.get('status')}"
        )
        assert result.get("commits") == [], (
            f"clean case → commits list must be empty, got {result.get('commits')}"
        )

    def test_clean_case_includes_paths_checked(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """The clean result echoes back the implementation surface that was checked,
        so the caller can audit what was inspected."""
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )

        paths = result.get("paths_checked")
        assert paths is not None, "paths_checked must be populated"
        assert "pennyfarthing-dist/src/pf/sprint/work.py" in paths, (
            f"paths_checked missing explicit surface entry, got {paths}"
        )
        assert "pennyfarthing-dist/src/pf/sprint/staleness.py" in paths, (
            f"paths_checked missing explicit surface entry, got {paths}"
        )


# ---------------------------------------------------------------------------
# AC2: Drift detection with structured commit list
# ---------------------------------------------------------------------------


class TestDriftDetection:
    def test_commit_touching_surface_after_start_date_is_flagged(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC2 — a commit touching the surface AFTER sprint_start surfaces as drift."""
        drift_hash = _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# overtaken by upstream\n"},
            "feat(sprint): pre-empt 151-5 work",
            "2026-05-05T10:00:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )

        assert result.get("status") == "drift", (
            f"overlapping commit after start_date → status must be 'drift', got {result.get('status')}"
        )
        commits = result.get("commits") or []
        assert len(commits) == 1, f"expected exactly 1 drift commit, got {len(commits)}"
        commit = commits[0]
        assert commit.get("hash") == drift_hash, (
            f"drift commit hash must equal the actual commit hash exactly, "
            f"got {commit.get('hash')!r} expected {drift_hash!r}"
        )
        short_hash = commit.get("short_hash")
        assert isinstance(short_hash, str) and len(short_hash) >= 7, (
            f"drift commit must include a non-empty short_hash field "
            f"(at least 7 chars for git's default abbreviation), got {short_hash!r}"
        )
        assert drift_hash.startswith(short_hash), (
            f"short_hash must be a prefix of the full hash, "
            f"got short={short_hash!r} full={drift_hash!r}"
        )
        assert commit.get("subject") == "feat(sprint): pre-empt 151-5 work", (
            f"drift commit subject must be the actual commit subject, got {commit.get('subject')!r}"
        )
        assert commit.get("date", "").startswith("2026-05-05"), (
            f"drift commit date must reflect the commit's authored date, got {commit.get('date')!r}"
        )
        assert "pennyfarthing-dist/src/pf/sprint/work.py" in (
            commit.get("files_overlap") or []
        ), (
            f"files_overlap must list the matching path, got {commit.get('files_overlap')!r}"
        )

    def test_commit_before_start_date_is_not_flagged(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC2/AC4 boundary — commits authored *before* sprint_start are clean."""
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# old change\n"},
            "feat(sprint): old change",
            "2026-04-30T23:59:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )

        assert result.get("status") == "clean", (
            "commit dated before sprint_start must not count as drift; "
            f"status was {result.get('status')!r}"
        )
        assert result.get("commits") == [], (
            f"pre-sprint commit must not appear in commits list, got {result.get('commits')}"
        )

    def test_commit_on_unrelated_path_is_not_flagged(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """A commit touching a file outside the surface must not trigger drift."""
        _commit(
            impl_repo,
            {"docs/some-doc.md": "doc edit\n"},
            "docs: unrelated edit",
            "2026-05-05T10:00:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )

        assert result.get("status") == "clean", (
            f"commit on unrelated path must not flag drift; got {result.get('status')!r}"
        )

    def test_multiple_drift_commits_listed_in_chronological_order(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# c1\n"},
            "first overtaking commit",
            "2026-05-05T10:00:00",
        )
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# c2\n"},
            "second overtaking commit",
            "2026-05-06T10:00:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )

        commits = result.get("commits") or []
        assert len(commits) == 2, f"expected 2 drift commits, got {len(commits)}"
        subjects = [c.get("subject") for c in commits]
        assert subjects == [
            "first overtaking commit",
            "second overtaking commit",
        ], f"commits must be ordered oldest→newest, got {subjects}"


# ---------------------------------------------------------------------------
# AC3: Acknowledgment / non-zero exit on drift
# ---------------------------------------------------------------------------


class TestAcknowledgmentBehavior:
    def test_drift_without_ack_yields_non_zero_cli_exit(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC3 — `pf sprint check-staleness` exits non-zero on drift unless --ack."""
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# overtaken\n"},
            "overtaken",
            "2026-05-05T10:00:00",
        )
        from pf.sprint.staleness import staleness_cli

        exit_code = staleness_cli(
            ["151-5"],
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert exit_code == 1, (
            f"drift without --ack must produce exit code 1 specifically — "
            f"distinct from 0 (clean/skipped/acked) and 2 (hard error). "
            f"got {exit_code}"
        )

    def test_drift_with_ack_yields_zero_cli_exit(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC3 — explicit --ack lets work proceed even when drift exists."""
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# overtaken\n"},
            "overtaken",
            "2026-05-05T10:00:00",
        )
        from pf.sprint.staleness import staleness_cli

        exit_code = staleness_cli(
            ["151-5", "--ack"],
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert exit_code == 0, (
            f"drift with --ack must produce zero exit, got {exit_code}"
        )

    def test_clean_case_yields_zero_cli_exit(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        from pf.sprint.staleness import staleness_cli

        exit_code = staleness_cli(
            ["151-5"],
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert exit_code == 0, (
            f"clean case must produce zero exit even without --ack, got {exit_code}"
        )

    def test_ack_records_acknowledgment_in_result(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC3 — the result must record ``acknowledged=True`` so the auto-mode bypass
        leaves an audit trail."""
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# overtaken\n"},
            "overtaken",
            "2026-05-05T10:00:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
            ack=True,
        )
        assert result.get("status") == "drift", (
            "ack does not change the detected status — drift is still drift"
        )
        assert result.get("acknowledged") is True, (
            f"ack must be recorded as acknowledged=True, got {result.get('acknowledged')!r}"
        )


# ---------------------------------------------------------------------------
# AC4: start_date resolution
# ---------------------------------------------------------------------------


class TestStartDateResolution:
    def test_uses_sprint_start_date_not_git_history(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC4 — the cutoff comes from sprint.start_date, not from any git heuristic.

        We commit *one* file before start_date and *one* after — only the post-start
        one counts. If the implementation used `--since=<branch creation>` or similar,
        it would also flag the pre-start commit.
        """
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# old\n"},
            "old change",
            "2026-04-30T00:00:00",
        )
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# new\n"},
            "new change",
            "2026-05-05T00:00:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        commits = result.get("commits") or []
        subjects = [c.get("subject") for c in commits]
        assert subjects == ["new change"], (
            "only commits authored on/after sprint.start_date must be flagged, "
            f"got {subjects}"
        )
        assert result.get("since") == "2026-05-04", (
            f"result must echo back the start_date used as cutoff, got {result.get('since')!r}"
        )

    def test_missing_start_date_returns_clear_error(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """AC4 — sprint without start_date: success=False with a clear error message,
        NOT silent fallback to ``date.today()`` or similar."""
        broken_root = tmp_path / "broken"
        _write_yaml(
            broken_root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint X
  status: active
epics:
  - '151'
stories: []
""",
        )
        _write_yaml(
            broken_root / "sprint" / "epic-151.yaml",
            """\
id: '151'
type: epic
status: backlog
repos: pennyfarthing
stories:
  - id: 151-5
    title: x
    points: 3
    status: backlog
    repos: pennyfarthing
    workflow: tdd
    implementation_surface:
      - pennyfarthing-dist/src/pf/sprint/work.py
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=broken_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("success") is False, (
            f"missing start_date must return success=False, got {result}"
        )
        error = result.get("error") or ""
        assert "start_date" in error, (
            f"error message must reference 'start_date' so the operator knows what to fix, "
            f"got {error!r}"
        )


# ---------------------------------------------------------------------------
# AC5: Implementation surface inference & skip fallback
# ---------------------------------------------------------------------------


class TestImplementationSurfaceInference:
    def test_explicit_surface_in_yaml_is_used(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """AC5 — when ``implementation_surface`` is in the YAML, it is used verbatim."""
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        paths = result.get("paths_checked") or []
        assert sorted(paths) == sorted(
            [
                "pennyfarthing-dist/src/pf/sprint/work.py",
                "pennyfarthing-dist/src/pf/sprint/staleness.py",
            ]
        ), f"paths_checked must equal the YAML's implementation_surface, got {paths}"

    def test_heuristic_extracts_paths_from_title(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """AC5 — when no explicit surface, infer paths mentioned literally in title/description."""
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2618
  start_date: '2026-05-04'
  status: active
  number: 2618
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
  - id: 151-X
    title: narrow story_finish.py read_sprint exception handler
    points: 1
    status: backlog
    repos: pennyfarthing
    workflow: trivial
    type: chore
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-X",
            project_root=root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        paths = result.get("paths_checked") or []
        assert any("story_finish.py" in p for p in paths), (
            "heuristic must pick up the file name mentioned in the title; "
            f"got {paths}"
        )

    def test_no_inferable_surface_yields_skipped_with_warning(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """AC5 — when neither explicit surface nor a heuristic match exists, the
        check is *skipped* (not silently passed) and a warning is emitted."""
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2618
  start_date: '2026-05-04'
  status: active
  number: 2618
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
  - id: 151-Y
    title: improve developer experience generally
    points: 3
    status: backlog
    repos: pennyfarthing
    workflow: tdd
    type: chore
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-Y",
            project_root=root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("status") == "skipped", (
            f"no inferable surface → status must be 'skipped', got {result.get('status')!r}"
        )
        warning = result.get("warning") or ""
        assert "surface" in warning.lower() or "infer" in warning.lower(), (
            f"skipped result must emit a warning explaining no surface was inferred, "
            f"got {warning!r}"
        )

    def test_skipped_status_is_not_drift(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """A skipped check must not be confusable with a clean check by the caller —
        it has its own distinct status so the SM gate can choose to treat it as a soft
        warning vs hard block depending on configuration."""
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2618
  start_date: '2026-05-04'
  status: active
  number: 2618
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
  - id: 151-Y
    title: improve developer experience generally
    points: 3
    status: backlog
    repos: pennyfarthing
    workflow: tdd
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-Y",
            project_root=root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("status") == "skipped", (
            "no-inferable-surface case must have its own distinct 'skipped' status — "
            "not 'clean' (would mask the lack of check) and not 'drift' (would block "
            "work that has no actual overlap). "
            f"got {result.get('status')!r}"
        )


# ---------------------------------------------------------------------------
# Rule §1: silent exception swallowing
# ---------------------------------------------------------------------------


class TestRuleSilentExceptions:
    def test_git_invocation_failure_surfaces_as_failure_not_silent_clean(
        self, sprint_root: Path, tmp_path: Path
    ) -> None:
        """Rule §1 — if `git log` fails (e.g., wrong branch, bad repo), the result
        must be ``success=False`` with an error, not a silent ``status=clean``."""
        not_a_repo = tmp_path / "definitely-not-a-git-repo"
        not_a_repo.mkdir()
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": not_a_repo},
        )
        assert result.get("success") is False, (
            "git failure must surface as success=False, "
            f"got {result}"
        )
        assert result.get("status") != "clean", (
            "git failure must NOT be silently reported as clean — that would mask the "
            "very kind of bug this story exists to prevent"
        )

    def test_module_source_has_no_bare_except_swallowing_results(self) -> None:
        """Rule §1 (static check) — the staleness module must not contain a bare
        ``except Exception: pass`` or equivalent silent swallow that would hide
        git/file errors from the caller."""
        import pf.sprint.staleness as staleness_module

        source = inspect.getsource(staleness_module)
        # Common silent-swallow patterns — each match is a hard fail.
        forbidden = [
            "except:",
            "except Exception: pass",
            "except Exception:\n        pass",
            "except Exception:\n            pass",
        ]
        for pattern in forbidden:
            assert pattern not in source, (
                f"staleness.py must not contain {pattern!r} — "
                "silent swallowing is exactly what this story exists to prevent"
            )


# ---------------------------------------------------------------------------
# Rule §3: type annotations on public surface
# ---------------------------------------------------------------------------


class TestRuleTypeAnnotations:
    def test_check_story_staleness_has_complete_annotations(self) -> None:
        """Rule §3 — the public function must have a return annotation and all
        parameters annotated. Internal helpers are exempt."""
        from pf.sprint.staleness import check_story_staleness

        sig = inspect.signature(check_story_staleness)
        assert sig.return_annotation is not inspect.Signature.empty, (
            "check_story_staleness must have a return type annotation"
        )
        unannotated = [
            name
            for name, param in sig.parameters.items()
            if param.annotation is inspect.Parameter.empty
        ]
        assert unannotated == [], (
            f"check_story_staleness has unannotated parameters: {unannotated}"
        )


# ---------------------------------------------------------------------------
# Rule §11: input validation — no shell injection via story_id
# ---------------------------------------------------------------------------


class TestRuleInputValidation:
    def test_story_id_is_not_interpolated_into_shell_command(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """Rule §11 — story_id is operator-controlled but git arguments must be
        passed as a list (subprocess argv), never interpolated into a shell string.

        We patch subprocess.run and assert ``shell=True`` is never used and the
        story_id never appears as a substring of any single argv element that also
        contains shell metacharacters.
        """
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# anything\n"},
            "any",
            "2026-05-05T00:00:00",
        )
        captured: list[dict[str, Any]] = []

        real_run = subprocess.run

        def spy(*args: Any, **kwargs: Any) -> Any:
            captured.append({"args": args, "kwargs": kwargs})
            return real_run(*args, **kwargs)

        from pf.sprint import staleness as staleness_module

        with patch.object(staleness_module.subprocess, "run", side_effect=spy):
            staleness_module.check_story_staleness(
                "151-5; rm -rf /",  # malicious story_id
                project_root=sprint_root,
                repo_path_overrides={"pennyfarthing": impl_repo},
            )

        adversarial_payload = "151-5; rm -rf /"
        # If the impl rejects the adversarial story_id at the boundary (e.g.,
        # `_find_story` returns None and we early-exit), `captured` will be
        # empty — that's the BEST defense, since the bad input never reaches
        # subprocess at all. We only assert the substring/shell properties
        # IF subprocess was invoked.
        for call in captured:
            args = call["args"]
            kwargs = call["kwargs"]
            assert kwargs.get("shell", False) is False, (
                "subprocess.run must never be called with shell=True — "
                "story_id is operator input and may contain shell metacharacters"
            )
            # shell=False is necessary but not sufficient. The argv form must
            # also keep the operator-controlled payload out of every individual
            # argv element — a defensive check against accidental interpolation
            # into a `--format=...` or similar element.
            argv = args[0] if args else kwargs.get("args", [])
            argv_list = list(argv) if isinstance(argv, (list, tuple)) else []
            for element in argv_list:
                if not isinstance(element, str):
                    continue
                assert adversarial_payload not in element, (
                    f"adversarial story_id payload {adversarial_payload!r} appeared "
                    f"as a substring of argv element {element!r} — "
                    "story_id must never be interpolated into any individual argv string"
                )


# ---------------------------------------------------------------------------
# Round-2 RED: tests added after Reviewer rejection of round-1 GREEN.
#
# The first round of tests passed because every fixture left HEAD coincidentally
# equal to the base branch and asserted weakly enough that a half-broken impl
# could satisfy them. This block hardens the suite against the recurring
# "silent-clean" anti-pattern the story exists to prevent.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# AC2 + [CRITICAL]: drift on base_branch detected when HEAD is a feature branch
# ---------------------------------------------------------------------------


class TestDriftDetectionAcrossBranches:
    """The implementation must inspect ``origin/<base-branch>`` (or the local
    base ref), not the current HEAD. In production sm-setup runs after the
    feature branch is created — HEAD is the feature branch, not develop."""

    def test_drift_detected_when_head_is_feature_branch(
        self, sprint_root: Path, impl_repo_feature_checkout: Path
    ) -> None:
        """[CRITICAL] HEAD ≠ base_branch + drift on base → must still detect drift.

        Without this fixture variant the previous test suite was a tautology:
        every fixture used ``git init -b develop`` and never changed branches,
        so HEAD == develop trivially and an implementation that logs HEAD instead
        of the base branch would pass anyway.
        """
        repo = impl_repo_feature_checkout

        # Land a drift commit on develop (NOT on the current HEAD).
        _git(repo, "checkout", "develop")
        _commit(
            repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# overtaken upstream\n"},
            "feat(sprint): pre-empt 151-5 work on develop",
            "2026-05-05T10:00:00",
        )
        # Mirror the local develop tip to refs/remotes/origin/develop so the
        # implementation can use either ``develop`` or ``origin/develop`` as the
        # ref form — both are acceptable per the reviewer's CRITICAL finding.
        develop_sha = _git(repo, "rev-parse", "develop").strip()
        _git(repo, "update-ref", "refs/remotes/origin/develop", develop_sha)

        # Switch back to the feature branch — HEAD ≠ develop now.
        _git(repo, "checkout", "feature/151-5")

        # Fixture invariant — guard against future fixture drift accidentally
        # restoring the broken-test condition.
        head_sha = _git(repo, "rev-parse", "HEAD").strip()
        develop_sha_now = _git(repo, "rev-parse", "develop").strip()
        assert head_sha != develop_sha_now, (
            "fixture invariant violated: HEAD == develop, so this test would "
            "be a tautology. The fixture must keep HEAD on feature/151-5."
        )

        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": repo},
        )

        assert result.get("status") == "drift", (
            f"drift on develop must be detected even when HEAD is a feature "
            f"branch — the implementation must include the base branch in the "
            f"git log command, not rely on HEAD. "
            f"got status={result.get('status')!r}, commits={result.get('commits')!r}"
        )
        commits = result.get("commits") or []
        assert len(commits) == 1, (
            f"expected exactly 1 drift commit (the one landed on develop), got {len(commits)}"
        )
        assert commits[0].get("subject") == "feat(sprint): pre-empt 151-5 work on develop", (
            f"the detected drift commit must be the one on develop, not anything "
            f"on HEAD. got subject={commits[0].get('subject')!r}"
        )


# ---------------------------------------------------------------------------
# AC2 + [HIGH]: commits whose subject contains the parser delimiter must be detected
# ---------------------------------------------------------------------------


class TestDelimiterCollision:
    def test_commit_subject_with_literal_delimiter_is_still_detected(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """[HIGH] If a commit subject literally contains the parser's commit
        delimiter, ``_parse_git_log`` must not silently drop the chunk. Either
        the impl uses NUL-delimited git log, or it surfaces a warning. Either
        way drift must still register.

        This is exactly the silent-drop pattern the story exists to prevent."""
        delimiter_in_subject = "trick: <<<COMMIT-DELIMITER-7f8a3b>>> in subject"
        _commit(
            impl_repo,
            {"pennyfarthing-dist/src/pf/sprint/work.py": "# overtaken\n"},
            delimiter_in_subject,
            "2026-05-05T10:00:00",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("status") == "drift", (
            "a commit whose subject contains the parser's delimiter must NOT be "
            "silently dropped — drift must still be detected. "
            f"got status={result.get('status')!r}, commits={result.get('commits')!r}"
        )
        commits = result.get("commits") or []
        assert len(commits) >= 1, (
            f"expected at least 1 drift commit despite delimiter collision, got {len(commits)}"
        )


# ---------------------------------------------------------------------------
# [HIGH]: empty surface_path must not match every absolute commit path
# ---------------------------------------------------------------------------


class TestPathMatchingHelper:
    def test_empty_surface_path_does_not_match_every_file(self) -> None:
        """[HIGH] ``_path_matches(commit_file, "")`` must return False, not match
        any non-empty path. The bug shape: ``"".rstrip("/") + "/"`` evaluates
        to ``"/"``, and ``commit_file.startswith("/")`` is True for any absolute
        path — so an empty entry in the surface list would cause every commit
        to register as drift."""
        from pf.sprint.staleness import _path_matches

        # If the bug were present, all of these would return True.
        assert _path_matches("/etc/passwd", "") is False, (
            "empty surface_path must not match absolute commit paths — "
            "would cause every commit to register as drift"
        )
        assert _path_matches("foo/bar.py", "") is False, (
            "empty surface_path must not match relative commit paths"
        )
        assert _path_matches("/", "") is False, (
            "empty surface_path must not match the root path"
        )


# ---------------------------------------------------------------------------
# [HIGH]: unknown repo must not silently fall back to base_branch=develop
# ---------------------------------------------------------------------------


class TestUnknownRepoSilentFallback:
    def test_unknown_repo_does_not_silently_use_develop(
        self, tmp_path: Path, impl_repo_feature_checkout: Path
    ) -> None:
        """[HIGH] When ``story.repos`` names a repo not in the known mapping
        (and no operator override pins a base branch), the implementation must
        not silently default to ``develop``. Either return ``success=False`` with
        an error, or populate ``warning`` so the operator sees the ambiguity.

        We use ``impl_repo_feature_checkout`` so that even if the impl falls
        through silently to ``develop``, the result is still detectable as
        non-clean (the fixture has no commits on develop after start_date — so
        a silent fallback would yield a misleading 'clean' status).
        """
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2618
  start_date: '2026-05-04'
  status: active
  number: 2618
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
    title: a story in an unknown repo
    points: 3
    status: backlog
    repos: nonexistent-repo
    workflow: tdd
    implementation_surface:
      - foo.py
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-Z",
            project_root=root,
            repo_path_overrides={"nonexistent-repo": impl_repo_feature_checkout},
        )
        # Acceptable outcomes: success=False with error, or warning surfaced.
        # FORBIDDEN: silent status=clean with no warning.
        surfaced_non_silently = (
            result.get("success") is False
            or bool(result.get("warning"))
        )
        assert surfaced_non_silently, (
            "unknown repo must not silently fall back to base_branch=develop — "
            "result must surface either success=False with a clear error or a "
            "populated warning explaining the ambiguity. "
            f"got {result}"
        )


# ---------------------------------------------------------------------------
# [MEDIUM]: result shape — `since` and `base_branch` are unconditional per docstring
# ---------------------------------------------------------------------------


class TestResultShapeUniformity:
    def test_error_results_include_since_key(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """[MEDIUM] The function's docstring lists ``since`` as a result key.
        The current ``_result()`` helper conditionally omits it on the
        sprint-load-failure path — callers indexing ``result["since"]`` will
        KeyError. Either make the key unconditional, or document it as optional.
        Test asserts the unconditional contract (matches docstring as written)."""
        broken_root = tmp_path / "broken"
        # Sprint file missing entirely → triggers the earliest error path.
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=broken_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("success") is False, (
            f"missing sprint file → success=False, got {result}"
        )
        assert "since" in result, (
            f"per docstring contract every result includes 'since' — "
            f"error paths must populate it (default ''), got keys={sorted(result.keys())}"
        )
        assert "base_branch" in result, (
            f"per docstring contract every result includes 'base_branch' — "
            f"error paths must populate it (default ''), got keys={sorted(result.keys())}"
        )

    def test_error_results_include_paths_checked_and_commits_keys(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """The remaining contract keys (``paths_checked``, ``commits``) are
        already always present per ``_result()``. Lock that in to prevent
        regression when future error paths are added."""
        broken_root = tmp_path / "broken"
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-5",
            project_root=broken_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert result.get("paths_checked") == [], (
            f"error result must populate paths_checked as []; got {result.get('paths_checked')!r}"
        )
        assert result.get("commits") == [], (
            f"error result must populate commits as []; got {result.get('commits')!r}"
        )


# ---------------------------------------------------------------------------
# [MEDIUM]: YAML-shape edge cases that must not silently fall through
# ---------------------------------------------------------------------------


class TestYamlEdgeCases:
    def test_string_scalar_surface_does_not_silently_fall_through(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """[MEDIUM] ``implementation_surface: "foo.py"`` (a YAML scalar instead
        of a list) is a plausible authoring mistake. The impl must not silently
        ignore it and fall through to the title-heuristic — either accept the
        scalar as a one-element list, or surface an error/warning.

        The story title here contains no path-like tokens, so the heuristic
        would silently yield ``status=skipped`` if the impl falls through.
        """
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2618
  start_date: '2026-05-04'
  status: active
  number: 2618
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
  - id: 151-S
    title: a story with no path-like text in the title
    points: 3
    status: backlog
    repos: pennyfarthing
    workflow: tdd
    implementation_surface: pennyfarthing-dist/src/pf/sprint/work.py
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-S",
            project_root=root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        paths = result.get("paths_checked") or []
        explicit_used = "pennyfarthing-dist/src/pf/sprint/work.py" in paths

        # Acceptable outcomes:
        #   (a) the scalar is accepted as a one-element list (paths_checked
        #       contains the path), OR
        #   (b) success=False with an error whose text mentions the type
        #       expectation (e.g., "must be a list", "expected list").
        # FORBIDDEN: success=True with status='skipped' and a warning that
        #            falsely claims no `implementation_surface` was provided —
        #            that's silently dropping the operator's explicit field
        #            with a misleading diagnostic.
        error = (result.get("error") or "").lower()
        type_diagnostic = any(
            kw in error for kw in ("must be a list", "expected list", "expected a list")
        )
        explicit_failure = result.get("success") is False and type_diagnostic

        assert explicit_used or explicit_failure, (
            "string-scalar implementation_surface must NOT silently fall back to "
            "the title-heuristic with a misleading 'no implementation_surface "
            "field' warning — the field WAS provided, just in the wrong shape. "
            "Either accept the scalar as a one-element list, or fail with "
            "success=False and an error mentioning the expected type. "
            f"got status={result.get('status')!r}, success={result.get('success')!r}, "
            f"paths_checked={paths}, warning={result.get('warning')!r}, "
            f"error={result.get('error')!r}"
        )

    def test_empty_repos_list_does_not_yield_literal_brackets(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """[MEDIUM] ``repos: []`` must not produce the literal string ``"[]"``
        as a repo name. The bug-shape: ``str([]).split(",")[0].strip()`` is
        ``"[]"``, which is truthy so the ``or "pennyfarthing"`` default never
        fires, and the eventual git failure surfaces a confusing path."""
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2618
  start_date: '2026-05-04'
  status: active
  number: 2618
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
  - id: 151-E
    title: empty repos list edge case
    points: 1
    status: backlog
    repos: []
    workflow: tdd
    implementation_surface:
      - foo.py
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-E",
            project_root=root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        # The smoking gun — '[]' must never appear in any user-visible field.
        error = result.get("error") or ""
        warning = result.get("warning") or ""
        assert "[]" not in error, (
            f"`repos: []` must never produce a literal '[]' in the error path — "
            f"got error={error!r}"
        )
        assert "[]" not in warning, (
            f"`repos: []` must never produce a literal '[]' in the warning path — "
            f"got warning={warning!r}"
        )
        # Successful resolution → base_branch must be a known default. Failed
        # resolution → error message must be coherent (no '[]' as we asserted).
        if result.get("success"):
            assert result.get("base_branch") in ("develop", "main"), (
                f"empty repos list, when accepted, must resolve to a known "
                f"default base branch, got base_branch={result.get('base_branch')!r}"
            )


# ---------------------------------------------------------------------------
# [MEDIUM]: CLI contract — int return codes, no SystemExit leak
# ---------------------------------------------------------------------------


class TestCliErrorContract:
    def test_cli_with_no_args_returns_int_not_systemexit(
        self, sprint_root: Path
    ) -> None:
        """[MEDIUM] ``staleness_cli([])`` must return an int exit code (2 — hard
        error), not propagate ``SystemExit`` from argparse. The signature
        promises ``-> int``; programmatic callers must be able to rely on it."""
        from pf.sprint.staleness import staleness_cli

        try:
            rc = staleness_cli([], project_root=sprint_root)
        except SystemExit as exc:
            pytest.fail(
                f"staleness_cli([]) raised SystemExit({exc.code!r}) instead of "
                "returning int — programmatic callers cannot rely on the contract"
            )
        assert rc == 2, (
            f"missing positional argument is a hard error → exit code 2, got {rc}"
        )

    def test_cli_hard_error_yields_exit_code_two(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """AC3 — hard errors (missing start_date, story not found, git failure)
        must map to CLI exit code 2 specifically, distinct from drift (1) and
        clean (0). This was missing from the previous suite."""
        broken_root = tmp_path / "broken"
        _write_yaml(
            broken_root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint X
  status: active
""",
        )
        _write_yaml(
            broken_root / "sprint" / "epic-151.yaml",
            """\
id: '151'
type: epic
status: backlog
stories: []
""",
        )
        from pf.sprint.staleness import staleness_cli

        rc = staleness_cli(
            ["151-5"],
            project_root=broken_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert rc == 2, (
            f"missing start_date is a hard error → exit code must be 2 "
            f"(distinct from 0 clean and 1 drift), got {rc}"
        )

    def test_cli_clean_yields_exit_code_zero(
        self, sprint_root: Path, impl_repo: Path
    ) -> None:
        """The third leg of the exit-code triad: clean must be 0 specifically."""
        from pf.sprint.staleness import staleness_cli

        rc = staleness_cli(
            ["151-5"],
            project_root=sprint_root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        assert rc == 0, (
            f"clean preflight must produce exit code 0 specifically, got {rc}"
        )


# ---------------------------------------------------------------------------
# [MEDIUM]: module docstring must not embed story/incident references
# ---------------------------------------------------------------------------


class TestModuleDocstring:
    def test_module_docstring_does_not_reference_specific_story_or_incident(self) -> None:
        """[MEDIUM] CLAUDE.md forbids referencing the current task, fix, or
        callers in code comments — they rot as the codebase evolves and belong
        in the PR description, not in the source. The module docstring must
        describe what the module *does*, not its caller history or origin
        incident."""
        import pf.sprint.staleness as staleness_module

        docstring = staleness_module.__doc__ or ""
        forbidden_substrings = [
            "Story 151-5",
            "(Story 151-5)",
            "151-3 incident",
            "PR #33",
        ]
        found = [s for s in forbidden_substrings if s in docstring]
        assert not found, (
            "module docstring must not reference specific stories, incidents, "
            "or PRs — these references rot as the code evolves and belong in "
            "the PR description, not the source. "
            f"Found forbidden substrings: {found}"
        )


# ---------------------------------------------------------------------------
# AC5 + [LOW]: heuristic must cover common config-file extensions
# ---------------------------------------------------------------------------


class TestPathHeuristicCoverage:
    def test_heuristic_picks_up_json_filenames(
        self, tmp_path: Path, impl_repo: Path
    ) -> None:
        """[LOW] Stories about ``package.json``, ``tsconfig.json``, etc. would
        currently yield zero heuristic matches and silently skip — the heuristic
        regex omits ``.json``. Add at minimum ``.json`` so JS/TS-ecosystem
        stories don't fall through."""
        root = tmp_path / "orch"
        _write_yaml(
            root / "sprint" / "current-sprint.yaml",
            """\
sprint:
  name: TO Sprint 2618
  start_date: '2026-05-04'
  status: active
  number: 2618
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
  - id: 151-J
    title: pin dependency in package.json
    points: 1
    status: backlog
    repos: pennyfarthing
    workflow: trivial
    type: chore
""",
        )
        from pf.sprint.staleness import check_story_staleness

        result = check_story_staleness(
            "151-J",
            project_root=root,
            repo_path_overrides={"pennyfarthing": impl_repo},
        )
        paths = result.get("paths_checked") or []
        assert any("package.json" in p for p in paths), (
            "heuristic must pick up `.json` filenames in story titles — "
            "JS/TS stories about package.json would otherwise silently skip. "
            f"got paths_checked={paths}, status={result.get('status')!r}"
        )
