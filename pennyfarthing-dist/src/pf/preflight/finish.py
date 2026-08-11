"""
Async preflight checks for story finish.

Runs all checks in parallel using asyncio.gather() to guarantee
concurrent execution regardless of model behavior.
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PreflightIssue:
    """A blocking issue found during preflight."""

    severity: str  # "critical" or "warning"
    issue: str
    fix: str | None = None


@dataclass
class PRStatus:
    """PR status from GitHub."""

    state: str | None = None
    merged: bool = False
    mergeable: str | None = None
    url: str | None = None
    error: str | None = None


@dataclass
class LintResult:
    """Lint check result."""

    clean: bool = False
    output: str = ""
    error: str | None = None
    command: str = ""  # the linter actually run (e.g. "ruff check ."), for truthful remediation
    skipped: bool = False  # True when no lintable project was found — "not checked" != "passed" (SOUL #10)

    def __post_init__(self) -> None:
        if self.skipped and (self.error is not None or not self.clean):
            raise ValueError(
                "LintResult: skipped=True requires clean=True and error=None "
                "(skipped means 'not checked', not 'checked and failed')"
            )


@dataclass
class JiraStatus:
    """Jira issue status."""

    current: str | None = None
    key: str | None = None
    error: str | None = None
    skipped: bool = False


@dataclass
class AcceptanceCriteria:
    """Acceptance criteria check result."""

    total: int = 0
    checked: int = 0
    unchecked: list[str] = field(default_factory=list)
    error: str | None = None


@dataclass
class PreflightResult:
    """Aggregated preflight check results."""

    status: str  # "success" or "blocked"
    ready_to_finish: bool
    story_id: str
    pr: PRStatus = field(default_factory=PRStatus)
    lint: LintResult = field(default_factory=LintResult)
    jira: JiraStatus = field(default_factory=JiraStatus)
    acceptance_criteria: AcceptanceCriteria = field(default_factory=AcceptanceCriteria)
    issues: list[PreflightIssue] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON output."""
        result: dict[str, Any] = {
            "status": self.status,
            "ready_to_finish": self.ready_to_finish,
            "story_id": self.story_id,
            "pr": {
                "state": self.pr.state,
                "merged": self.pr.merged,
                "mergeable": self.pr.mergeable,
                "url": self.pr.url,
            },
            "lint": {
                "clean": self.lint.clean,
                "skipped": self.lint.skipped,
            },
            "acceptance_criteria": {
                "total": self.acceptance_criteria.total,
                "checked": self.acceptance_criteria.checked,
            },
        }

        if self.jira.skipped:
            result["jira"] = {"skipped": True}
        else:
            result["jira"] = {
                "current": self.jira.current,
                "key": self.jira.key,
            }

        if self.issues:
            result["issues"] = [
                {"severity": i.severity, "issue": i.issue, "fix": i.fix} for i in self.issues
            ]

        if self.warnings:
            result["warnings"] = self.warnings

        # Add next_steps based on status
        if self.ready_to_finish:
            result["next_steps"] = [
                "Preflight passed. Run finish-story.sh to complete.",
                f"Command: .pennyfarthing/scripts/workflow/finish-story.sh {self.story_id}",
                "Then commit and push sprint archive changes.",
            ]
        else:
            result["next_steps"] = [
                f"Cannot finish. {len(self.issues)} blocking issue(s).",
            ]
            for issue in self.issues[:3]:  # Show first 3
                result["next_steps"].append(f"- {issue.issue}")
                if issue.fix:
                    result["next_steps"].append(f"  Fix: {issue.fix}")

        return result


def _reject_option_like(value: str, kind: str) -> str | None:
    """Guard a value that is passed to a subprocess as a *positional* argument.

    ``check_pr_status`` and ``check_jira_status`` pass ``branch``/``jira_key`` as
    bare positionals to ``gh``/``jira``. A value beginning with ``-`` is parsed by
    the CLI as an *option*, not an operand — argument injection (CWE-88). Git
    forbids leading-dash branch names and PR refs/Jira keys never start with
    ``-``, so an option-shaped value here is always invalid. Return a truthful
    error string to surface (return-don't-throw, SOUL #10) rather than launching
    the subprocess; return ``None`` when the value is safe.
    """
    if not value or not value.strip():
        return f"Refusing empty {kind}: {value!r}"
    if value.startswith("-"):
        return f"Refusing option-like {kind}: {value!r} (possible argument injection)"
    return None


async def _lookup_merged_pr_by_branch(branch: str, repo: str | None) -> dict[str, Any] | None:
    """Find a merged PR by head branch.

    Used when ``gh pr view <branch>`` reports no PR: a merged PR whose head
    branch was deleted (the normal post-merge state) is invisible to
    ``gh pr view`` but still discoverable via ``gh pr list --state merged``.
    Mirrors the head-branch resolution used by story 155-1's finish flow.
    Returns the first merged PR record, or ``None`` if none is found.
    """
    # Belt-and-suspenders guard: branch is passed as a bare positional to
    # `gh pr list --head <branch>` — an option-shaped value would be parsed
    # as a flag (CWE-88). Guard independently of check_pr_status's guard so
    # direct callers are also protected.
    if _reject_option_like(branch, "branch") is not None:
        return None

    cmd = [
        "gh",
        "pr",
        "list",
        "--state",
        "merged",
        "--head",
        branch,
        "--json",
        "number,state,mergedAt,url",
    ]
    if repo:
        cmd.extend(["--repo", repo])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            return None
        data = json.loads(stdout.decode() or "[]")
    except (OSError, json.JSONDecodeError):
        # Fallback lookup failed — let the caller surface the original error.
        return None

    for pr in data:
        if pr.get("state") == "MERGED" or pr.get("mergedAt"):
            return pr
    return None


async def check_pr_status(branch: str, repo: str | None = None) -> PRStatus:
    """Check PR status via gh CLI."""
    result = PRStatus()

    # Guard: branch is passed to `gh pr view` as a bare positional — an
    # option-shaped value would be parsed as a flag (argument injection, CWE-88).
    guard_error = _reject_option_like(branch, "branch")
    if guard_error:
        result.error = guard_error
        return result

    # Note: 'merged' is not a valid field, use 'mergedAt' instead
    cmd = ["gh", "pr", "view", branch, "--json", "state,mergedAt,mergeable,url"]
    if repo:
        cmd.extend(["--repo", repo])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode == 0:
            data = json.loads(stdout.decode())
            result.state = data.get("state")
            # PR is merged if mergedAt is non-null
            result.merged = data.get("mergedAt") is not None
            result.mergeable = data.get("mergeable")
            result.url = data.get("url")
        else:
            err = stderr.decode().strip()
            # A merged PR whose head branch was deleted reads as "no pull
            # requests found for branch". Before treating that as a blocking
            # "No PR found", fall back to a head-branch merged-PR lookup — a
            # merged PR must not false-block finish.
            if "no pull requests found" in err.lower():
                merged_pr = await _lookup_merged_pr_by_branch(branch, repo)
                if merged_pr is not None:
                    result.state = "MERGED"
                    result.merged = True
                    result.url = merged_pr.get("url")
                    return result
            result.error = err or "PR not found"

    except Exception as e:
        result.error = str(e)

    return result


def _detect_lint_command(project_root: Path) -> list[str] | None:
    """Choose the lint command from the project layout.

    - ``package.json`` present → Node project → ``npm run lint``
    - else ``pyproject.toml`` present → Python project → ``ruff check .``
    - else → no lintable project at this root → ``None`` (skip, treated as clean)

    Historically ``check_lint`` hardcoded ``npm run lint`` regardless of
    language, which false-blocked finish on the Python-only orchestrator root
    (ADR-0034): the root has no npm lint script, so the check failed. Detecting
    the language from the layout removes that false-block without depending on
    the (stale) ``repos.yaml`` language field.
    """
    if (project_root / "package.json").exists():
        return ["npm", "run", "lint"]
    if (project_root / "pyproject.toml").exists():
        return ["ruff", "check", "."]
    return None


async def check_lint(project_root: Path | None = None) -> LintResult:
    """Run the project's linter (language-aware)."""
    result = LintResult()

    cwd = project_root or Path.cwd()

    # `_detect_lint_command` stats the filesystem (Path.exists) — blocking I/O.
    # Offload it to a worker thread so it does not stall the event loop
    # (no blocking stat on the async loop thread).
    lint_cmd = await asyncio.to_thread(_detect_lint_command, cwd)
    if lint_cmd is None:
        # No lintable project at this root — absence of lint is not a failure,
        # but it is "not checked", not "checked and clean". Report it truthfully
        # as skipped so it cannot masquerade as a genuine pass (SOUL #10).
        # Construct in one shot so __post_init__ validates the invariant.
        return LintResult(clean=True, skipped=True)

    result.command = " ".join(lint_cmd)

    try:
        proc = await asyncio.create_subprocess_exec(
            *lint_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        stdout, stderr = await proc.communicate()

        result.output = stdout.decode() + stderr.decode()
        result.clean = proc.returncode == 0

        if not result.clean:
            result.error = "Lint errors found"

    except Exception as e:
        result.error = str(e)

    return result


async def check_jira_status(jira_key: str) -> JiraStatus:
    """Check Jira issue status."""
    result = JiraStatus(key=jira_key)

    # Guard: jira_key is passed to `jira issue view` as a bare positional — an
    # option-shaped value would be parsed as a flag (argument injection, CWE-88).
    guard_error = _reject_option_like(jira_key, "jira key")
    if guard_error:
        result.error = guard_error
        return result

    try:
        # Use --raw for JSON output (much easier to parse)
        proc = await asyncio.create_subprocess_exec(
            "jira",
            "issue",
            "view",
            jira_key,
            "--raw",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode == 0:
            data = json.loads(stdout.decode())
            # Status is at fields.status.name
            result.current = data.get("fields", {}).get("status", {}).get("name")
        else:
            result.error = stderr.decode().strip() or "Failed to fetch Jira issue"

    except json.JSONDecodeError as e:
        result.error = f"Failed to parse Jira JSON: {e}"
    except Exception as e:
        result.error = str(e)

    return result


async def check_acceptance_criteria(
    story_id: str, project_root: Path | None = None
) -> AcceptanceCriteria:
    """Check acceptance criteria from session file."""
    result = AcceptanceCriteria()

    root = project_root or Path.cwd()
    session_file = root / ".session" / f"{story_id}-session.md"

    try:
        if not session_file.exists():
            result.error = f"Session file not found: {session_file}"
            return result

        content = session_file.read_text()

        # Find all checkbox patterns: - [ ] or - [x]
        checked_pattern = re.compile(r"^\s*-\s*\[x\]", re.MULTILINE | re.IGNORECASE)
        unchecked_pattern = re.compile(r"^\s*-\s*\[ \]\s*(.+)$", re.MULTILINE)

        checked_matches = checked_pattern.findall(content)
        unchecked_matches = unchecked_pattern.findall(content)

        result.checked = len(checked_matches)
        result.total = result.checked + len(unchecked_matches)
        result.unchecked = [m.strip() for m in unchecked_matches]

    except Exception as e:
        result.error = str(e)

    return result


def aggregate_results(
    story_id: str,
    pr: PRStatus,
    lint: LintResult,
    jira: JiraStatus,
    acceptance: AcceptanceCriteria,
) -> PreflightResult:
    """Aggregate check results into final preflight result."""
    issues: list[PreflightIssue] = []
    warnings: list[str] = []

    # Check PR status
    if pr.error:
        if "no pull requests found" in pr.error.lower():
            issues.append(
                PreflightIssue(
                    severity="critical",
                    issue="No PR found for branch",
                    fix="Create PR with: gh pr create",
                )
            )
        else:
            warnings.append(f"PR check failed: {pr.error}")
    elif not pr.merged:
        if pr.mergeable == "CONFLICTING":
            # A conflicting PR cannot simply be merged — it needs a rebase first.
            # Surfacing the generic "merge the PR" here is misleading and is the
            # exact false-green that lets a CONFLICTING finish slip through (gh #113).
            issues.append(
                PreflightIssue(
                    severity="critical",
                    issue="PR has merge conflicts (not mergeable)",
                    fix="Rebase the PR on its base branch and resolve the conflicts before finishing",
                )
            )
        elif pr.state == "OPEN":
            issues.append(
                PreflightIssue(
                    severity="critical",
                    issue="PR is still open (not merged)",
                    fix="Merge the PR before finishing",
                )
            )
        elif pr.state == "CLOSED":
            issues.append(
                PreflightIssue(
                    severity="critical",
                    issue="PR was closed without merging",
                    fix="Reopen and merge, or create new PR",
                )
            )

    # Check lint
    if lint.error and not lint.clean:
        lint_fix = (
            f"Run '{lint.command}' and fix errors"
            if lint.command
            else "Run the project's linter and fix errors"
        )
        issues.append(
            PreflightIssue(
                severity="critical",
                issue="Lint check failed",
                fix=lint_fix,
            )
        )

    # Check Jira (if not skipped)
    if not jira.skipped:
        if jira.error:
            warnings.append(f"Jira check failed: {jira.error}")
        elif jira.current and jira.current.lower() == "done":
            warnings.append("Jira issue already marked as Done")

    # Check acceptance criteria
    if acceptance.error:
        warnings.append(f"Acceptance criteria check failed: {acceptance.error}")
    elif acceptance.unchecked:
        issues.append(
            PreflightIssue(
                severity="critical",
                issue=f"{len(acceptance.unchecked)} unchecked acceptance criteria",
                fix=f"Complete: {acceptance.unchecked[0]}" if acceptance.unchecked else None,
            )
        )

    # Determine overall status
    ready = len(issues) == 0
    status = "success" if ready else "blocked"

    return PreflightResult(
        status=status,
        ready_to_finish=ready,
        story_id=story_id,
        pr=pr,
        lint=lint,
        jira=jira,
        acceptance_criteria=acceptance,
        issues=issues,
        warnings=warnings,
    )


async def run_finish_preflight(
    story_id: str,
    branch: str,
    jira_key: str | None = None,
    repo: str | None = None,
    project_root: Path | None = None,
) -> PreflightResult:
    """
    Run all finish preflight checks in parallel.

    Args:
        story_id: Story identifier (e.g., "31-10")
        branch: Feature branch name
        jira_key: Jira issue key (optional, skips Jira checks if absent)
        repo: Repository name for PR lookup (optional)
        project_root: Project root path (defaults to cwd)

    Returns:
        PreflightResult with aggregated check results
    """
    root = Path(project_root) if project_root else Path.cwd()

    # Step 1: PR check runs first so the unmerged-branch-no-PR signal can surface
    # at preflight entry, before the remaining checks launch (155-34 / AC5).
    pr_result = await check_pr_status(branch, repo)

    early_warnings: list[str] = []
    if pr_result.error and "no pull requests found" in pr_result.error.lower():
        early_warnings.append(
            "Branch is unmerged and no pull request was found; "
            "finish will be blocked until a PR is created or merged."
        )

    # Step 2: Run remaining checks in parallel
    checks = [
        check_lint(root),
        check_acceptance_criteria(story_id, root),
    ]

    # Conditionally add Jira check
    if jira_key:
        checks.append(check_jira_status(jira_key))

    results = await asyncio.gather(*checks, return_exceptions=True)

    # Unpack results
    lint_result = (
        results[0] if not isinstance(results[0], Exception) else LintResult(error=str(results[0]))
    )
    acceptance_result = (
        results[1]
        if not isinstance(results[1], Exception)
        else AcceptanceCriteria(error=str(results[1]))
    )

    # Handle Jira result
    if jira_key:
        jira_result = (
            results[2]
            if not isinstance(results[2], Exception)
            else JiraStatus(error=str(results[2]))
        )
    else:
        jira_result = JiraStatus(skipped=True)

    # Aggregate then prepend any early preflight-entry warnings
    preflight = aggregate_results(
        story_id=story_id,
        pr=pr_result,
        lint=lint_result,
        jira=jira_result,
        acceptance=acceptance_result,
    )
    if early_warnings:
        preflight.warnings = early_warnings + preflight.warnings
    return preflight
