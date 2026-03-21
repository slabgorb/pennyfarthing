"""Tests for dead script removal (story 141-15, PROJ-16149).

Verifies that deprecated shell/Python scripts that duplicate pf CLI
commands have been deleted and all references cleaned up.

AC 1: Listed scripts deleted, dead functions removed
AC 2: No remaining callers reference deleted scripts
AC 3: pf CLI equivalents still work
"""

import re
import subprocess
from pathlib import Path

# pennyfarthing-dist root (src/pf/tests -> src/pf -> src -> pennyfarthing-dist)
_DIST = Path(__file__).resolve().parents[3]
_SCRIPTS = _DIST / "scripts"


def _read_text(path: Path) -> str:
    """Read file as text, returning empty string if missing."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


# ---------------------------------------------------------------------------
# AC 1: Dead scripts deleted
# ---------------------------------------------------------------------------


class TestDeadScriptsDeleted:
    """AC 1: Deprecated scripts must not exist."""

    DEAD_SCRIPTS = [
        _SCRIPTS / "misc" / "backlog.sh",
        _SCRIPTS / "workflow" / "get-workflow-type.py",
        _SCRIPTS / "core" / "check-context.sh",
        _SCRIPTS / "misc" / "validate-subagent-frontmatter.sh",
        _SCRIPTS / "validation" / "validate-agent-schema.sh",
    ]

    def test_dead_scripts_deleted(self) -> None:
        """All four dead scripts should be deleted."""
        survivors = [str(p.relative_to(_DIST)) for p in self.DEAD_SCRIPTS if p.exists()]
        assert not survivors, f"Dead scripts should be deleted: {survivors}"


class TestOutputPersonaRemoved:
    """AC 1: output_persona() function removed from agent-session.sh."""

    def test_no_output_persona_function(self) -> None:
        """agent-session.sh should not contain output_persona."""
        content = _read_text(_SCRIPTS / "core" / "agent-session.sh")
        assert "output_persona" not in content, (
            "output_persona() still exists in agent-session.sh — it should be removed"
        )


# ---------------------------------------------------------------------------
# AC 2: No remaining references to deleted scripts in distributed files
# ---------------------------------------------------------------------------


_DEAD_SCRIPT_RE = re.compile(
    r"backlog\.sh|get-workflow-type\.py|check-context\.sh|validate-subagent-frontmatter\.sh|validate-agent-schema\.sh"
)

# Files that are allowed to reference the dead scripts (test files, sprint context)
_ALLOWED_REFERRERS = {
    "src/pf/tests/test_dead_scripts.py",
    "src/pf/tests/test_wrapper_removal.py",
    "src/pf/tests/test_141_20_agent_validator.py",
}


class TestNoStaleReferences:
    """AC 2: No distributed files reference deleted scripts."""

    SCAN_EXTENSIONS = {".sh", ".py", ".md", ".yaml", ".yml", ".ts", ".tsx", ".js", ".mjs"}

    def test_no_references_in_distributed_files(self) -> None:
        """No file in pennyfarthing-dist/ should reference deleted scripts."""
        violations = []
        for ext in self.SCAN_EXTENSIONS:
            for path in _DIST.rglob(f"*{ext}"):
                rel = str(path.relative_to(_DIST))
                if rel in _ALLOWED_REFERRERS:
                    continue
                # Skip build artifacts and bundled server
                if (
                    "build/" in rel
                    or "node_modules/" in rel
                    or "__pycache__" in rel
                    or "_dist/" in rel
                ):
                    continue
                content = _read_text(path)
                matches = _DEAD_SCRIPT_RE.findall(content)
                if matches:
                    violations.append(f"{rel}: {matches}")
        assert not violations, "Stale references to deleted scripts found:\n" + "\n".join(
            f"  - {v}" for v in violations
        )


# ---------------------------------------------------------------------------
# AC 3: pf CLI equivalents still work
# ---------------------------------------------------------------------------


class TestPfCliEquivalentsWork:
    """AC 3: pf CLI commands that replace deleted scripts still function."""

    def test_pf_sprint_backlog(self) -> None:
        """pf sprint backlog should exit 0."""
        result = subprocess.run(
            ["pf", "sprint", "backlog"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, f"pf sprint backlog failed: {result.stderr}"

    def test_pf_backlog_alias(self) -> None:
        """pf backlog (sugar alias) should exit 0."""
        result = subprocess.run(
            ["pf", "backlog"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, f"pf backlog failed: {result.stderr}"

    def test_pf_workflow_type(self) -> None:
        """pf workflow type tdd should return non-empty output."""
        result = subprocess.run(
            ["pf", "workflow", "type", "tdd"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, f"pf workflow type tdd failed: {result.stderr}"
        assert result.stdout.strip(), "pf workflow type tdd returned empty output"

    def test_pf_validate_agent(self) -> None:
        """pf validate agent should exit 0."""
        result = subprocess.run(
            ["pf", "validate", "agent"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, f"pf validate agent failed: {result.stderr}"
