"""Tests for story 155-5: sm-finish preflight false-blocks.

Story: 155-5 — "sm-finish preflight false-blocks: stale repos.yaml
language:javascript drives npm lint on Python-only root; 'No PR found' on
already-merged PRs."

TDD RED phase: these tests describe the *correct* behavior and fail against the
current ``pf.preflight.finish``. Two independent false-blocks, each blocking a
legitimate finish:

1. **npm lint on a Python-only root.** ``check_lint`` (finish.py L169-195)
   hardcodes ``npm run lint`` regardless of the project language. On the
   Python-only orchestrator root (ADR-0034) there is no npm lint script, so the
   check fails and preflight blocks. Correct behavior: on a Python project the
   lint check must use Python tooling (ruff) — never npm — and must reflect that
   tool's result. (The stale ``.pennyfarthing/repos.yaml`` ``language: javascript``
   is the orchestrator-side config half of this bug; the code half — the only
   part unit-testable from the framework repo — is that ``check_lint`` ignores
   language entirely and always runs npm.)

2. **"No PR found" on an already-merged PR.** ``check_pr_status`` (L136-166)
   runs only ``gh pr view <branch>``. Once a merged PR's head branch is deleted
   (the normal post-merge state), ``gh pr view <branch>`` returns "no pull
   requests found"; ``aggregate_results`` (L275-283) then raises a *critical*
   "No PR found for branch" block. A PR that actually merged must PASS.

   Verification contract for Dev (GREEN): when ``gh pr view <branch>`` reports no
   PR, fall back to a head-branch lookup of merged PRs — consistent with the
   existing out-of-band resolution in story 155-1
   (``gh pr list --head <branch>``) — and treat a found merged PR as
   ``merged=True`` with no error.

Both fixes carry an over-reach guard: a project that is genuinely npm must still
lint with npm, and a branch with *no* PR at all (never merged) must still block.

Async subprocess is faked by patching both ``asyncio.create_subprocess_exec`` and
``asyncio.create_subprocess_shell`` so the tests are robust to whether Dev shells
out via exec or shell. ``asyncio_mode = "auto"`` (pyproject.toml) runs the
``async def`` tests directly.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from pf.preflight.finish import (
    check_lint,
    check_pr_status,
    run_finish_preflight,
)

# =============================================================================
# Async subprocess fake
# =============================================================================


class _FakeProc:
    """Stand-in for an asyncio subprocess with a canned result."""

    def __init__(self, returncode: int = 0, stdout: bytes = b"", stderr: bytes = b""):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout, self._stderr


class _Recorder:
    """Dispatch fake for create_subprocess_exec / create_subprocess_shell.

    ``dispatch(tokens)`` receives the command as a list of string tokens and
    returns a ``_FakeProc``. Every invocation's command line is recorded on
    ``cmdlines`` for assertions.
    """

    def __init__(self, dispatch):
        self._dispatch = dispatch
        self.cmdlines: list[str] = []

    async def exec(self, *cmd, **kwargs):
        tokens = [str(c) for c in cmd]
        self.cmdlines.append(" ".join(tokens))
        return self._dispatch(tokens)

    async def shell(self, cmd, **kwargs):
        text = str(cmd)
        self.cmdlines.append(text)
        return self._dispatch(text.split())


def _patched(recorder: _Recorder):
    """Patch both exec and shell subprocess launchers with the recorder."""
    return patch.multiple(
        "asyncio",
        create_subprocess_exec=recorder.exec,
        create_subprocess_shell=recorder.shell,
    )


def _ran_npm(recorder: _Recorder) -> bool:
    return any("npm" in line.split() for line in recorder.cmdlines)


# =============================================================================
# Fixtures — a Python-only project layout
# =============================================================================

PYTHON_REPOS_YAML = """\
repos:
  orchestrator:
    path: .
    type: orchestrator
    language: python
    lint_command: ruff check .
    default_branch: main
"""


def _make_python_project(root: Path) -> Path:
    """A project that reads as Python by every reasonable signal.

    - ``pyproject.toml`` present, ``package.json`` ABSENT (file-based detection)
    - ``.pennyfarthing/repos.yaml`` declares the root repo ``language: python``
      (config-based detection)
    """
    (root / "pyproject.toml").write_text("[project]\nname = 'demo'\nversion = '0'\n")
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir(exist_ok=True)
    (pf_dir / "repos.yaml").write_text(PYTHON_REPOS_YAML)
    return root


def _write_session(root: Path, story_id: str) -> Path:
    """Session file with zero unchecked acceptance criteria (no AC block)."""
    session_dir = root / ".session"
    session_dir.mkdir(exist_ok=True)
    path = session_dir / f"{story_id}-session.md"
    path.write_text(
        f"---\nstory_id: \"{story_id}\"\nworkflow: \"tdd\"\n---\n\n"
        f"# Story {story_id}\n\n## Acceptance Criteria\n- [x] done\n"
    )
    return path


# =============================================================================
# Bug 1 — npm lint on a Python-only root
# =============================================================================


class TestLintDoesNotRunNpmOnPythonProject:
    """``check_lint`` must not shell out to npm on a Python project."""

    @pytest.mark.asyncio
    async def test_check_lint_does_not_invoke_npm_on_python_project(self, tmp_path: Path) -> None:
        _make_python_project(tmp_path)
        # Everything the linter runs succeeds — we only care WHICH tool runs.
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"ok"))

        with _patched(recorder):
            await check_lint(tmp_path)

        assert not _ran_npm(recorder), (
            "check_lint shelled out to npm on a Python-only project — "
            f"commands: {recorder.cmdlines}. Preflight must use Python tooling "
            "(ruff), not npm (ADR-0034)."
        )
        # Positive proof: ruff actually ran. Without this, the test passes even
        # if linting is silently disabled for Python (detection → None → skip).
        assert any("ruff" in line for line in recorder.cmdlines), (
            "check_lint did not run the Python linter (ruff) on a Python project "
            f"— linting was silently skipped. commands: {recorder.cmdlines}"
        )

    @pytest.mark.asyncio
    async def test_check_lint_reports_clean_when_python_linter_passes(
        self, tmp_path: Path
    ) -> None:
        _make_python_project(tmp_path)

        def dispatch(tokens):
            # npm has no lint script on this root — it would fail, as in prod.
            if tokens and "npm" in tokens:
                return _FakeProc(returncode=1, stderr=b"npm ERR! Missing script: lint")
            # The Python linter (ruff) is clean.
            return _FakeProc(returncode=0, stdout=b"All checks passed!")

        recorder = _Recorder(dispatch)
        with _patched(recorder):
            result = await check_lint(tmp_path)

        assert result.clean is True, (
            "The Python linter passed but check_lint reported not-clean — it ran "
            f"the wrong tool. commands: {recorder.cmdlines}"
        )
        assert not _ran_npm(recorder), (
            f"check_lint still ran npm on a Python project: {recorder.cmdlines}"
        )
        # Positive proof: the clean result came from ruff actually running, not
        # from lint being silently skipped.
        assert any("ruff" in line for line in recorder.cmdlines), (
            "check_lint reported clean without running the Python linter (ruff) "
            f"— lint was silently skipped. commands: {recorder.cmdlines}"
        )
        assert result.command == "ruff check .", (
            f"LintResult.command should record the linter actually run, got {result.command!r}"
        )


class TestLintOverReachGuard:
    """The fix must not break genuinely-npm projects."""

    @pytest.mark.asyncio
    async def test_check_lint_still_uses_npm_on_a_node_project(self, tmp_path: Path) -> None:
        # A real Node project: package.json with a lint script, no pyproject.toml.
        (tmp_path / "package.json").write_text(
            json.dumps({"name": "demo", "scripts": {"lint": "eslint ."}})
        )
        recorder = _Recorder(lambda tokens: _FakeProc(returncode=0, stdout=b"ok"))

        with _patched(recorder):
            await check_lint(tmp_path)

        assert _ran_npm(recorder), (
            "check_lint must still run npm lint on a genuine Node project — the "
            f"Python fix over-reached. commands: {recorder.cmdlines}"
        )


class TestLintFailureRemediationNamesRealLinter:
    """A Python ruff failure must not tell the user to 'Run npm run lint'.

    Regression guard for the incomplete-fix the reviewer caught: making
    ``check_lint`` language-aware is pointless if ``aggregate_results`` still
    emits npm-specific remediation text on a Python lint failure — that is the
    story's own npm-on-Python bug, relocated into the recovery guidance.
    """

    @pytest.mark.asyncio
    async def test_python_lint_failure_remediation_names_ruff_not_npm(
        self, tmp_path: Path
    ) -> None:
        _make_python_project(tmp_path)
        _write_session(tmp_path, "155-5")

        merged = [{"number": 1, "state": "MERGED", "mergedAt": "2026-06-30T00:00:00Z"}]

        def dispatch(tokens):
            if "view" in tokens:
                return _FakeProc(returncode=1, stderr=b"no pull requests found for branch")
            if "list" in tokens:  # merged PR so only the lint failure blocks
                return _FakeProc(returncode=0, stdout=json.dumps(merged).encode())
            if tokens and "npm" in tokens:
                return _FakeProc(returncode=1, stderr=b"npm ERR")
            # ruff fails
            return _FakeProc(returncode=1, stdout=b"demo.py:1:1: E501 line too long")

        recorder = _Recorder(dispatch)
        with _patched(recorder):
            result = await run_finish_preflight(
                story_id="155-5",
                branch="feat/155-5",
                repo="x/y",
                project_root=tmp_path,
            )

        lint_issues = [i for i in result.issues if i.issue == "Lint check failed"]
        assert lint_issues, (
            f"expected a lint-failure issue, got {[i.issue for i in result.issues]}"
        )
        fix = lint_issues[0].fix or ""
        assert "npm" not in fix, (
            f"Python lint failure emitted npm remediation guidance: {fix!r} — the "
            "story's npm-on-Python bug survived in the recovery text."
        )
        assert "ruff" in fix, (
            f"remediation should name the real linter that ran (ruff), got {fix!r}"
        )


# =============================================================================
# Bug 2 — "No PR found" on an already-merged PR (branch deleted post-merge)
# =============================================================================


def _merged_pr_dispatch(*, listed: list[dict] | None, view_rc: int = 1):
    """Dispatch: ``gh pr view`` reports no PR (branch deleted); ``gh pr list``
    returns ``listed`` (merged PRs found by head branch)."""
    listed_payload = json.dumps(listed if listed is not None else [])

    def dispatch(tokens):
        if "view" in tokens:
            return _FakeProc(
                returncode=view_rc,
                stderr=b'no pull requests found for branch "feat/155-5"',
            )
        if "list" in tokens:
            return _FakeProc(returncode=0, stdout=listed_payload.encode())
        return _FakeProc(returncode=0)

    return dispatch


class TestPrStatusDetectsMergedDeletedBranch:
    """A merged PR whose branch was deleted must be detected as merged."""

    @pytest.mark.asyncio
    async def test_check_pr_status_detects_merged_pr_when_branch_deleted(self) -> None:
        merged = [
            {
                "number": 42,
                "state": "MERGED",
                "mergedAt": "2026-06-30T00:00:00Z",
                "url": "https://github.com/x/y/pull/42",
            }
        ]
        recorder = _Recorder(_merged_pr_dispatch(listed=merged))

        with _patched(recorder):
            result = await check_pr_status("feat/155-5", repo="x/y")

        assert result.merged is True, (
            "A merged PR whose head branch was deleted was not detected as "
            f"merged (got merged={result.merged}, error={result.error!r}). This "
            "is the 'No PR found' false-block on an already-merged PR — "
            "check_pr_status must fall back to a head-branch merged-PR lookup."
        )
        assert result.error is None, (
            f"A merged PR must not carry a blocking error, got {result.error!r}"
        )

    @pytest.mark.asyncio
    async def test_preflight_does_not_block_merged_pr_with_deleted_branch(
        self, tmp_path: Path
    ) -> None:
        _make_python_project(tmp_path)
        _write_session(tmp_path, "155-5")

        merged = [{"number": 42, "state": "MERGED", "mergedAt": "2026-06-30T00:00:00Z"}]

        def dispatch(tokens):
            if "view" in tokens:
                return _FakeProc(returncode=1, stderr=b"no pull requests found for branch")
            if "list" in tokens:
                return _FakeProc(returncode=0, stdout=json.dumps(merged).encode())
            # lint (whatever tool) is clean
            return _FakeProc(returncode=0, stdout=b"ok")

        recorder = _Recorder(dispatch)
        with _patched(recorder):
            result = await run_finish_preflight(
                story_id="155-5",
                branch="feat/155-5",
                repo="x/y",
                project_root=tmp_path,
            )

        issue_text = [i.issue for i in result.issues]
        assert not any("No PR found" in t for t in issue_text), (
            "Merged PR (branch deleted) was false-blocked as 'No PR found': "
            f"{issue_text}"
        )
        assert result.pr.merged is True, (
            f"Preflight did not recognise the merged PR (issues: {issue_text})"
        )


class TestPrStatusOverReachGuard:
    """The fix must not let a genuinely-missing PR slip through."""

    @pytest.mark.asyncio
    async def test_check_pr_status_genuinely_missing_pr_still_flags(self) -> None:
        # gh pr view → no PR, AND gh pr list → no merged PR either.
        recorder = _Recorder(_merged_pr_dispatch(listed=[]))

        with _patched(recorder):
            result = await check_pr_status("feat/never-existed", repo="x/y")

        assert result.merged is False, (
            "A branch with no merged PR must not be reported as merged — the "
            "fix over-reached and would let unmerged finishes through."
        )
        assert result.error is not None, (
            "A genuinely missing PR must still surface an error so preflight can "
            "block."
        )

    @pytest.mark.asyncio
    async def test_preflight_still_blocks_when_pr_genuinely_missing(
        self, tmp_path: Path
    ) -> None:
        _make_python_project(tmp_path)
        _write_session(tmp_path, "155-5")

        def dispatch(tokens):
            if "view" in tokens:
                return _FakeProc(returncode=1, stderr=b"no pull requests found for branch")
            if "list" in tokens:
                return _FakeProc(returncode=0, stdout=b"[]")
            return _FakeProc(returncode=0, stdout=b"ok")

        recorder = _Recorder(dispatch)
        with _patched(recorder):
            result = await run_finish_preflight(
                story_id="155-5",
                branch="feat/never-existed",
                repo="x/y",
                project_root=tmp_path,
            )

        assert result.ready_to_finish is False, (
            "A finish with no merged PR at all must still be blocked — the "
            "merged-PR fallback must not turn every missing PR into a pass."
        )
        assert any("No PR found" in i.issue for i in result.issues), (
            f"Expected a 'No PR found' block for a genuinely missing PR, got: "
            f"{[i.issue for i in result.issues]}"
        )

    @pytest.mark.asyncio
    async def test_check_pr_status_surfaces_error_when_fallback_lookup_fails(self) -> None:
        # gh pr view → no PR; the fallback gh pr list ITSELF fails (auth/rate-limit).
        def dispatch(tokens):
            if "view" in tokens:
                return _FakeProc(returncode=1, stderr=b'no pull requests found for branch "x"')
            if "list" in tokens:
                return _FakeProc(returncode=1, stderr=b"gh: authentication required")
            return _FakeProc(returncode=0)

        recorder = _Recorder(dispatch)
        with _patched(recorder):
            result = await check_pr_status("feat/x", repo="x/y")

        assert result.merged is False, "a failed fallback lookup must not report merged"
        assert result.error is not None, (
            "when the fallback lookup itself fails, the original 'no PR found' error "
            "must still surface (fail safe) — not be swallowed into a pass"
        )

    @pytest.mark.asyncio
    async def test_check_pr_status_survives_malformed_gh_list_json(self) -> None:
        # gh pr list returns rc=0 but non-JSON garbage → must degrade, not crash.
        def dispatch(tokens):
            if "view" in tokens:
                return _FakeProc(returncode=1, stderr=b"no pull requests found for branch")
            if "list" in tokens:
                return _FakeProc(returncode=0, stdout=b"not json <<<")
            return _FakeProc(returncode=0)

        recorder = _Recorder(dispatch)
        with _patched(recorder):
            result = await check_pr_status("feat/x", repo="x/y")

        assert result.merged is False
        assert result.error is not None, (
            "malformed gh output must degrade to the original blocking error, not crash"
        )
