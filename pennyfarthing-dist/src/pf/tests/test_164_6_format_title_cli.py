"""Tests for pf git format-title CLI command (Story 164-6).

CWE-94 hardening: three agent markdown files previously interpolated shell
variables directly into `python -c` string literals for PR title formatting.
This test suite drives a new `pf git format-title` CLI command that accepts
arguments via argv (never via string interpolation), plus guard tests that
assert the vulnerable pattern is gone from the three docs.

Acceptance Criteria:
  AC1. `pf git format-title --jira-key KEY --title TITLE [--scope SCOPE]`
       exists, accepts all three args via argv, and prints the formatted title.
  AC2. Titles containing injection metacharacters (single quotes, double quotes,
       backticks, semi-colons, newlines, full Python payload strings) are
       returned as literal output — no code executed, no crash.
  AC3. The three markdown docs no longer contain the dangerous
       `python -c ... ${TITLE}` interpolation pattern for PR title formatting.
  AC4. The three markdown docs DO reference the safe `pf git format-title`
       invocation.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.cli import cli

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DIST_ROOT = Path(__file__).parents[3]  # pennyfarthing-dist/

# Exact paths of the three vulnerable docs (relative to pennyfarthing-dist/)
_VULNERABLE_DOCS: list[Path] = [
    DIST_ROOT / "agents" / "sm-finish.md",
    DIST_ROOT / "commands" / "pf-standalone.md",
    DIST_ROOT / "workflows" / "git-cleanup" / "steps" / "step-03-execute.md",
]

# Regex: shell-variable interpolated directly into a `format_pr_title(...)` call
# inside a `-c` string literal.  The exact dangerous shape is:
#   format_pr_title(jira_key='${JIRA_KEY}', title='${title}', ...)
# The tell is a single-quoted kwarg value that starts with `${` or `$`.
_DANGEROUS_PATTERN = re.compile(
    r"format_pr_title\([^)]*'\\?\$\{?[A-Z_a-z]\w*",
)

# The safe invocation string that should appear after the fix.
_SAFE_INVOCATION = "pf git format-title"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# ---------------------------------------------------------------------------
# AC1: Command exists and produces correct output
# ---------------------------------------------------------------------------


class TestFormatTitleCommandExists:
    """pf git format-title command must exist and be reachable."""

    def test_format_title_help_exits_zero(self, runner: CliRunner) -> None:
        """pf git format-title --help exits 0 and describes the command."""
        result = runner.invoke(cli, ["git", "format-title", "--help"])
        assert result.exit_code == 0, result.output
        assert "format-title" in result.output.lower() or "title" in result.output.lower()

    def test_format_title_basic_output(self, runner: CliRunner) -> None:
        """pf git format-title --jira-key KEY --title TITLE prints formatted title."""
        result = runner.invoke(
            cli,
            ["git", "format-title", "--jira-key", "PROJ-123", "--title", "add new feature"],
        )
        assert result.exit_code == 0, result.output
        assert "PROJ-123" in result.output
        assert "add new feature" in result.output

    def test_format_title_with_scope(self, runner: CliRunner) -> None:
        """pf git format-title with --scope includes scope in output."""
        result = runner.invoke(
            cli,
            [
                "git",
                "format-title",
                "--jira-key",
                "PROJ-456",
                "--title",
                "improve performance",
                "--scope",
                "git",
            ],
        )
        assert result.exit_code == 0, result.output
        assert "PROJ-456" in result.output
        assert "git" in result.output
        assert "improve performance" in result.output

    def test_format_title_without_scope_omits_parens(self, runner: CliRunner) -> None:
        """pf git format-title without --scope does not include empty parens."""
        result = runner.invoke(
            cli,
            ["git", "format-title", "--jira-key", "PROJ-789", "--title", "fix crash"],
        )
        assert result.exit_code == 0, result.output
        # Empty scope should collapse "()" out of the title
        assert "()" not in result.output

    def test_format_title_missing_jira_key_errors(self, runner: CliRunner) -> None:
        """pf git format-title with no --jira-key exits non-zero."""
        result = runner.invoke(cli, ["git", "format-title", "--title", "some title"])
        assert result.exit_code != 0

    def test_format_title_missing_title_errors(self, runner: CliRunner) -> None:
        """pf git format-title with no --title exits non-zero."""
        result = runner.invoke(cli, ["git", "format-title", "--jira-key", "PROJ-1"])
        assert result.exit_code != 0

    def test_format_title_appears_in_pf_git_help(self, runner: CliRunner) -> None:
        """pf git --help lists format-title in the command group."""
        result = runner.invoke(cli, ["git", "--help"])
        assert result.exit_code == 0, result.output
        assert "format-title" in result.output


# ---------------------------------------------------------------------------
# AC2: Injection neutralisation
# ---------------------------------------------------------------------------


INJECTION_PAYLOADS: list[tuple[str, str]] = [
    # (label, title_string)
    ("single_quote_close", "Test PR' extra"),
    ("single_quote_injection", "Test PR'; import os; os.system('echo pwned'); print('"),
    ("double_quote_injection", 'Test PR"; import os; os.system("echo pwned"); print("'),
    ("backtick_injection", "Test PR`id`extra"),
    ("newline_injection", "Test PR\nimport os\nos.system('id')"),
    ("full_python_payload", "'); import os; os.system('rm -rf /'); print('"),
    ("sys_exit_payload", "My PR'; import sys; sys.exit(1); print('title"),
    ("semicolon_chain", "Test PR; raise Exception('pwned')"),
    ("dollar_sign", "Costs $100 to fix"),
    ("backslash", "Test PR\\n payload"),
]


@pytest.mark.parametrize("label,payload_title", INJECTION_PAYLOADS, ids=[p[0] for p in INJECTION_PAYLOADS])
class TestInjectionNeutralisation:
    """All payload titles must be treated as literal strings — no code exec."""

    def test_payload_exits_zero(
        self, runner: CliRunner, label: str, payload_title: str
    ) -> None:
        """Command must exit 0 (not crash) when title contains payload chars."""
        result = runner.invoke(
            cli,
            ["git", "format-title", "--jira-key", "SEC-1", "--title", payload_title],
        )
        assert result.exit_code == 0, (
            f"[{label}] expected exit 0 but got {result.exit_code}.\n"
            f"Output: {result.output}\n"
            f"Exception: {result.exception}"
        )

    def test_payload_title_appears_literally_in_output(
        self, runner: CliRunner, label: str, payload_title: str
    ) -> None:
        """The payload title must appear verbatim in the formatted PR title output."""
        result = runner.invoke(
            cli,
            ["git", "format-title", "--jira-key", "SEC-1", "--title", payload_title],
        )
        # Strip trailing newline from output for comparison
        output = result.output.rstrip("\n")
        # The raw title must be embedded in the output as a literal substring.
        # Newlines in argv values arrive as literal \n chars through CliRunner.
        normalized_payload = payload_title.replace("\n", "\\n") if "\n" in payload_title else payload_title
        if "\n" in payload_title:
            # CliRunner passes the title as-is; output may contain literal newline
            assert payload_title in result.output or normalized_payload in result.output, (
                f"[{label}] payload title not found literally in output.\n"
                f"Output: {result.output!r}"
            )
        else:
            assert payload_title in result.output, (
                f"[{label}] payload title not found literally in output.\n"
                f"Output: {result.output!r}"
            )

    def test_payload_does_not_execute_os_commands(
        self, runner: CliRunner, label: str, payload_title: str
    ) -> None:
        """The command must NOT import os or execute arbitrary shell commands.

        We verify this by checking that no 'pwned', 'uid=', or 'root' marker
        (typical echo/id output) appears in the command output.
        """
        result = runner.invoke(
            cli,
            ["git", "format-title", "--jira-key", "SEC-1", "--title", payload_title],
        )
        lower_out = result.output.lower()
        # Only assert absence of execution markers when those markers are not
        # already present in the literal payload title itself (false-positive guard:
        # a payload like "...('echo pwned')..." contains "pwned" as literal text,
        # which appears in the output because the title is passed safely via argv).
        if "pwned" not in payload_title.lower():
            assert "pwned" not in lower_out, f"[{label}] 'pwned' found in output — code may have executed"
        if "uid=" not in payload_title.lower():
            assert "uid=" not in lower_out, f"[{label}] 'uid=' found in output — `id` may have executed"


# ---------------------------------------------------------------------------
# AC3 & AC4: Guard tests — docs must not contain the unsafe pattern
# ---------------------------------------------------------------------------


class TestDocumentGuards:
    """Assert the three markdown files have been hardened.

    These tests assert the TARGET (safe) state. They FAIL now (RED phase)
    because the docs still contain the dangerous interpolation; they will
    PASS after Dev updates the three files.
    """

    @pytest.mark.parametrize("doc_path", _VULNERABLE_DOCS, ids=[p.name for p in _VULNERABLE_DOCS])
    def test_doc_does_not_contain_python_dash_c_interpolation(
        self, doc_path: Path
    ) -> None:
        """Doc must not interpolate shell vars into a python -c string literal."""
        assert doc_path.exists(), f"Doc not found at expected path: {doc_path}"
        content = doc_path.read_text(encoding="utf-8")
        matches = _DANGEROUS_PATTERN.findall(content)
        assert not matches, (
            f"{doc_path.name} still contains dangerous `python -c '${{VAR}}'` interpolation "
            f"for PR title formatting.\n"
            f"Matched fragments: {matches!r}\n"
            "Fix: replace with `pf git format-title --jira-key ... --title ...`"
        )

    @pytest.mark.parametrize("doc_path", _VULNERABLE_DOCS, ids=[p.name for p in _VULNERABLE_DOCS])
    def test_doc_references_safe_format_title_invocation(
        self, doc_path: Path
    ) -> None:
        """Doc must reference the safe `pf git format-title` invocation."""
        assert doc_path.exists(), f"Doc not found at expected path: {doc_path}"
        content = doc_path.read_text(encoding="utf-8")
        assert _SAFE_INVOCATION in content, (
            f"{doc_path.name} does not yet reference `{_SAFE_INVOCATION}`.\n"
            "Fix: replace the `python -c` block with `pf git format-title --jira-key ... --title ...`"
        )
