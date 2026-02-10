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
            },
            "acceptance_criteria": {
                "total": self.acceptance_criteria.total,
                "checked": self.acceptance_criteria.checked,
            },
        }

        if self.jira.skipped:
            result["jira_skipped"] = True
            result["jira"] = {"skipped": True}
        else:
            result["jira"] = {
                "current": self.jira.current,
                "key": self.jira.key,
            }

        if self.issues:
            result["issues"] = [
                {"severity": i.severity, "issue": i.issue, "fix": i.fix}
                for i in self.issues
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


async def check_pr_status(branch: str, repo: str | None = None) -> PRStatus:
    """Check PR status via gh CLI."""
    result = PRStatus()

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
            result.error = stderr.decode().strip() or "PR not found"

    except Exception as e:
        result.error = str(e)

    return result


async def check_lint(project_root: Path | None = None) -> LintResult:
    """Run npm run lint."""
    result = LintResult()

    cwd = project_root or Path.cwd()

    try:
        proc = await asyncio.create_subprocess_exec(
            "npm", "run", "lint",
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

    try:
        # Use --raw for JSON output (much easier to parse)
        proc = await asyncio.create_subprocess_exec(
            "jira", "issue", "view", jira_key, "--raw",
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


async def check_acceptance_criteria(story_id: str, project_root: Path | None = None) -> AcceptanceCriteria:
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
            issues.append(PreflightIssue(
                severity="critical",
                issue="No PR found for branch",
                fix="Create PR with: gh pr create",
            ))
        else:
            warnings.append(f"PR check failed: {pr.error}")
    elif not pr.merged:
        if pr.state == "OPEN":
            issues.append(PreflightIssue(
                severity="critical",
                issue="PR is still open (not merged)",
                fix="Merge the PR before finishing",
            ))
        elif pr.state == "CLOSED":
            issues.append(PreflightIssue(
                severity="critical",
                issue="PR was closed without merging",
                fix="Reopen and merge, or create new PR",
            ))

    # Check lint
    if lint.error and not lint.clean:
        issues.append(PreflightIssue(
            severity="critical",
            issue="Lint check failed",
            fix="Run 'npm run lint' and fix errors",
        ))

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
        issues.append(PreflightIssue(
            severity="critical",
            issue=f"{len(acceptance.unchecked)} unchecked acceptance criteria",
            fix=f"Complete: {acceptance.unchecked[0]}" if acceptance.unchecked else None,
        ))

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

    # Build list of checks to run
    checks = [
        check_pr_status(branch, repo),
        check_lint(root),
        check_acceptance_criteria(story_id, root),
    ]

    # Conditionally add Jira check
    if jira_key:
        checks.append(check_jira_status(jira_key))

    # Run all checks in parallel
    results = await asyncio.gather(*checks, return_exceptions=True)

    # Unpack results
    pr_result = results[0] if not isinstance(results[0], Exception) else PRStatus(error=str(results[0]))
    lint_result = results[1] if not isinstance(results[1], Exception) else LintResult(error=str(results[1]))
    acceptance_result = results[2] if not isinstance(results[2], Exception) else AcceptanceCriteria(error=str(results[2]))

    # Handle Jira result
    if jira_key:
        jira_result = results[3] if not isinstance(results[3], Exception) else JiraStatus(error=str(results[3]))
    else:
        jira_result = JiraStatus(skipped=True)

    # Aggregate and return
    return aggregate_results(
        story_id=story_id,
        pr=pr_result,
        lint=lint_result,
        jira=jira_result,
        acceptance=acceptance_result,
    )
