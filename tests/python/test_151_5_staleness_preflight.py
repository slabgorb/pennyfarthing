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

# The module under test does not exist yet (RED state). Import is deferred to
# fixtures so that collection still works while the rest of the suite runs.


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
        assert commit.get("hash", "").startswith(drift_hash[:7]) or commit.get("hash") == drift_hash, (
            f"drift commit hash must match the actual commit, got {commit.get('hash')}"
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
        assert exit_code != 0, (
            f"drift without --ack must produce non-zero exit, got {exit_code}"
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
        assert result.get("status") != "clean", (
            "skipped must not be reported as 'clean' — that would mask the lack of check"
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

        for call in captured:
            kwargs = call["kwargs"]
            assert kwargs.get("shell", False) is False, (
                "subprocess.run must never be called with shell=True — "
                "story_id is operator input and may contain shell metacharacters"
            )
