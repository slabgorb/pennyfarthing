"""Tests for consolidated agent validation — shell script behavior ported to Python.

Story: 141-20 (MSSCI-16154)
Legacy behavior captured from validate-agent-schema.sh and validate-subagent-frontmatter.sh.

Each test documents the shell script check it replaces and verifies the Python
adapter produces equivalent results.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.validate.adapters.agent import (
    classify_agent_files,
    validate_main_agent,
    validate_subagent,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_agent(tmp_path: Path, name: str, content: str) -> Path:
    """Write an agent file to tmp agents dir and return the dir."""
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir(exist_ok=True)
    (agents_dir / name).write_text(content)
    return agents_dir


def _minimal_main_agent(
    *,
    name: str = "dev",
    mindset_tag: str | None = "minimalist-discipline",
    extra: str = "",
    line_pad: int = 0,
) -> str:
    """Build a minimal valid main agent file.

    Has all required tags so tests can isolate individual check failures.
    line_pad inserts blank lines before the first <critical> to push it down.
    """
    padding = "\n" * line_pad
    mindset = ""
    if mindset_tag:
        mindset = f"<{mindset_tag}>\nStay focused.\n</{mindset_tag}>\n"

    return (
        f"# {name.title()} Agent - Description\n"
        f"{padding}"
        "<role>\nDoes things.\n</role>\n"
        "<critical>\nImportant stuff.\n</critical>\n"
        f"{mindset}"
        "<helpers>\n**Model:** haiku\n\n"
        "| Subagent | Purpose |\n|----------|--------|\n</helpers>\n"
        "<skills>\n- /pf-testing\n</skills>\n"
        "<on-activation>\nDo stuff.\n</on-activation>\n"
        "<exit>\nHandoff.\n</exit>\n"
        f"{extra}"
    )


def _minimal_subagent(*, name: str = "testing-runner") -> str:
    """Build a minimal valid subagent file."""
    return (
        "---\n"
        f"name: {name}\n"
        "description: Runs tests\n"
        "tools: [Bash, Read]\n"
        "model: haiku\n"
        "---\n"
        "<output>\nReturn results.\n</output>\n"
        "<arguments>\nREPOS: repo name\n</arguments>\n"
    )


# ===========================================================================
# Check 1: Mindset tag enforcement
# Legacy: validate-agent-schema.sh check_mindset_tag (lines 302-326)
# Each primary agent requires a specific mindset tag that must be closed.
# ===========================================================================

class TestMindsetTagEnforcement:
    """Legacy behavior from validate-agent-schema.sh MINDSET_TAGS (lines 85-96)."""

    MINDSET_MAP = {
        "sm": "coordination-discipline",
        "tea": "test-paranoia",
        "dev": "minimalist-discipline",
        "reviewer": "adversarial-mindset",
        "orchestrator": "systems-thinking",
        "architect": "pragmatic-restraint",
        "pm": "ruthless-prioritization",
        "devops": "automation-discipline",
        "tech-writer": "clarity-obsession",
        "ux-designer": "consistency-guardian",
    }

    @pytest.mark.parametrize("agent_name,tag", list(MINDSET_MAP.items()))
    def test_agent_with_correct_mindset_tag_passes(self, tmp_path, agent_name, tag):
        """Agent file with its required mindset tag should have no mindset error."""
        content = _minimal_main_agent(name=agent_name, mindset_tag=tag)
        agents_dir = _write_agent(tmp_path, f"{agent_name}.md", content)
        errors, warnings = validate_main_agent(agents_dir / f"{agent_name}.md", agents_dir)
        mindset_errors = [e for e in errors if "mindset" in e.lower() or "Missing mindset" in e]
        assert mindset_errors == [], f"Unexpected mindset errors: {mindset_errors}"

    @pytest.mark.parametrize("agent_name,tag", list(MINDSET_MAP.items()))
    def test_agent_missing_mindset_tag_errors(self, tmp_path, agent_name, tag):
        """Agent file missing its required mindset tag should produce an error."""
        content = _minimal_main_agent(name=agent_name, mindset_tag=None)
        agents_dir = _write_agent(tmp_path, f"{agent_name}.md", content)
        errors, warnings = validate_main_agent(agents_dir / f"{agent_name}.md", agents_dir)
        mindset_errors = [e for e in errors if "mindset" in e.lower() or tag in e.lower()]
        assert len(mindset_errors) > 0, f"Expected mindset error for {agent_name} missing <{tag}>"

    def test_agent_with_unclosed_mindset_tag_errors(self, tmp_path):
        """Mindset tag present but not closed should produce an error."""
        content = (
            "# Dev Agent - Description\n"
            "<role>\nDoes things.\n</role>\n"
            "<critical>\nImportant stuff.\n</critical>\n"
            "<minimalist-discipline>\nStay focused.\n"  # No closing tag!
            "<helpers>\n**Model:** haiku\n</helpers>\n"
            "<skills>\n- /pf-testing\n</skills>\n"
        )
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        errors, _ = validate_main_agent(agents_dir / "dev.md", agents_dir)
        mindset_errors = [e for e in errors if "mindset" in e.lower() or "minimalist-discipline" in e.lower()]
        assert len(mindset_errors) > 0, "Expected error for unclosed mindset tag"

    def test_agent_not_in_mindset_map_no_error(self, tmp_path):
        """Agents not in the mindset map (e.g., ba.md) should not require one."""
        content = _minimal_main_agent(name="ba", mindset_tag=None)
        agents_dir = _write_agent(tmp_path, "ba.md", content)
        errors, _ = validate_main_agent(agents_dir / "ba.md", agents_dir)
        mindset_errors = [e for e in errors if "mindset" in e.lower()]
        assert mindset_errors == [], f"ba.md should not require mindset tag: {mindset_errors}"


# ===========================================================================
# Check 2: Line-position check for <critical> (warning)
# Legacy: validate-agent-schema.sh check_best_practices (lines 233-236)
# First <critical> must appear at or before line 30.
# ===========================================================================

class TestCriticalLinePosition:
    """Legacy behavior from validate-agent-schema.sh line-position check."""

    def test_critical_within_threshold_no_warning(self, tmp_path):
        """<critical> at or before line 30 should produce no position warning."""
        # Default minimal agent has <critical> well within 30 lines
        content = _minimal_main_agent()
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        position_warnings = [w for w in warnings if "critical" in w.lower() and "line" in w.lower()]
        assert position_warnings == []

    def test_critical_after_line_30_warns(self, tmp_path):
        """<critical> appearing after line 30 should produce a warning."""
        # Push critical past line 30 with padding
        content = _minimal_main_agent(line_pad=30)
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        position_warnings = [w for w in warnings if "critical" in w.lower() and ("line" in w.lower() or "30" in w)]
        assert len(position_warnings) > 0, "Expected warning for <critical> after line 30"


# ===========================================================================
# Check 3: Line-position check for <on-activation> (warning)
# Legacy: validate-agent-schema.sh check_best_practices (lines 239-241)
# <on-activation> must appear at or before line 100.
# ===========================================================================

class TestOnActivationLinePosition:
    """Legacy behavior from validate-agent-schema.sh on-activation position check."""

    def test_on_activation_within_threshold_no_warning(self, tmp_path):
        """<on-activation> before line 100 should produce no position warning."""
        content = _minimal_main_agent()
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        position_warnings = [w for w in warnings if "on-activation" in w.lower() and "line" in w.lower()]
        assert position_warnings == []

    def test_on_activation_after_line_100_warns(self, tmp_path):
        """<on-activation> after line 100 should produce a warning."""
        # Push on-activation past line 100
        content = _minimal_main_agent(line_pad=100)
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        position_warnings = [w for w in warnings if "on-activation" in w.lower() and ("line" in w.lower() or "100" in w)]
        assert len(position_warnings) > 0, "Expected warning for <on-activation> after line 100"


# ===========================================================================
# Check 4: File length check (error)
# Legacy: validate-agent-schema.sh check_best_practices (lines 228-230)
# Files over 300 lines are errors.
# ===========================================================================

class TestFileLengthCheck:
    """Legacy behavior from validate-agent-schema.sh file length check."""

    def test_file_under_500_lines_no_error(self, tmp_path):
        """File with 500 or fewer lines should produce no length error."""
        content = _minimal_main_agent()
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        errors, _ = validate_main_agent(agents_dir / "dev.md", agents_dir)
        length_errors = [e for e in errors if "lines" in e.lower() and "max" in e.lower()]
        assert length_errors == []

    def test_file_over_500_lines_errors(self, tmp_path):
        """File over 500 lines should produce an error."""
        # Pad the file to exceed 500 lines
        padding = "\n".join(f"<!-- line {i} -->" for i in range(490))
        content = _minimal_main_agent(extra=f"<info>\n{padding}\n</info>\n")
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        errors, _ = validate_main_agent(agents_dir / "dev.md", agents_dir)
        length_errors = [e for e in errors if "line" in e.lower() and ("500" in e or "max" in e.lower())]
        assert len(length_errors) > 0, "Expected error for file over 500 lines"


# ===========================================================================
# Check 5: Orphan content check (error)
# Legacy: validate-agent-schema.sh check_all_content_in_tags (lines 359-392)
# Non-blank lines at depth 0 (not inside any tag) are errors.
# Line 1 (if heading) and blank lines are exempt.
# ===========================================================================

class TestOrphanContentCheck:
    """Legacy behavior from validate-agent-schema.sh orphan content detection."""

    def test_all_content_in_tags_no_error(self, tmp_path):
        """File with all content inside tags should have no orphan errors."""
        content = _minimal_main_agent()
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        errors, _ = validate_main_agent(agents_dir / "dev.md", agents_dir)
        orphan_errors = [e for e in errors if "orphan" in e.lower() or "outside" in e.lower() or "content outside" in e.lower()]
        assert orphan_errors == []

    def test_orphan_content_at_depth_zero_errors(self, tmp_path):
        """Non-blank lines outside any tag should produce an error."""
        content = (
            "# Dev Agent - Description\n"
            "<role>\nDoes things.\n</role>\n"
            "This line is orphan content!\n"
            "<critical>\nImportant stuff.\n</critical>\n"
            "<minimalist-discipline>\nStay focused.\n</minimalist-discipline>\n"
            "<helpers>\n**Model:** haiku\n</helpers>\n"
            "<skills>\n- /pf-testing\n</skills>\n"
        )
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        errors, _ = validate_main_agent(agents_dir / "dev.md", agents_dir)
        orphan_errors = [e for e in errors if "orphan" in e.lower() or "outside" in e.lower() or "content outside" in e.lower()]
        assert len(orphan_errors) > 0, "Expected error for content outside XML tags"

    def test_blank_lines_between_tags_no_error(self, tmp_path):
        """Blank lines between tags should not be flagged."""
        content = (
            "# Dev Agent - Description\n"
            "\n"
            "<role>\nDoes things.\n</role>\n"
            "\n"
            "<critical>\nImportant stuff.\n</critical>\n"
            "\n"
            "<minimalist-discipline>\nStay focused.\n</minimalist-discipline>\n"
            "<helpers>\n**Model:** haiku\n</helpers>\n"
            "<skills>\n- /pf-testing\n</skills>\n"
        )
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        errors, _ = validate_main_agent(agents_dir / "dev.md", agents_dir)
        orphan_errors = [e for e in errors if "orphan" in e.lower() or "outside" in e.lower()]
        assert orphan_errors == []

    def test_first_heading_line_exempt(self, tmp_path):
        """Line 1 starting with '# ' should not be flagged as orphan."""
        content = _minimal_main_agent()
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        errors, _ = validate_main_agent(agents_dir / "dev.md", agents_dir)
        orphan_errors = [e for e in errors if "orphan" in e.lower() or "outside" in e.lower()]
        assert orphan_errors == [], "First heading should be exempt from orphan check"


# ===========================================================================
# Check 6: Orphan content after last tag (warning)
# Legacy: validate-agent-schema.sh check_no_orphan_content (lines 277-300)
# Non-whitespace after the last closing </tag> is a warning.
# ===========================================================================

class TestOrphanContentAfterLastTag:
    """Legacy behavior from validate-agent-schema.sh post-tag content check."""

    def test_no_content_after_last_tag_no_warning(self, tmp_path):
        """Clean file with nothing after last closing tag should produce no warning."""
        content = _minimal_main_agent()
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        after_warnings = [w for w in warnings if "after" in w.lower() and "tag" in w.lower()]
        assert after_warnings == []

    def test_content_after_last_closing_tag_warns(self, tmp_path):
        """Non-whitespace after the last closing tag should produce a warning."""
        content = _minimal_main_agent() + "\nThis is trailing content outside all tags.\n"
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        after_warnings = [w for w in warnings if "after" in w.lower() and "tag" in w.lower()]
        assert len(after_warnings) > 0, "Expected warning for content after last closing tag"


# ===========================================================================
# Check 7: Checklist format check (warning)
# Legacy: validate-agent-schema.sh check_checklist_format (lines 191-218)
# Inside gate/handoff-gate/self-review/review-checklist tags, checklist
# items must match ^\s*-\s*\[\s*[x ]?\s*\]
# ===========================================================================

class TestChecklistFormatCheck:
    """Legacy behavior from validate-agent-schema.sh checklist format validation."""

    def test_valid_checklist_no_warning(self, tmp_path):
        """Properly formatted checklist items should produce no warning."""
        content = _minimal_main_agent(extra=(
            "<gate>\n"
            "- [ ] Check tests pass\n"
            "- [x] Review code\n"
            "- [ ] Verify coverage\n"
            "</gate>\n"
        ))
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        checklist_warnings = [w for w in warnings if "checklist" in w.lower() or "malformed" in w.lower()]
        assert checklist_warnings == []

    def test_malformed_checklist_warns(self, tmp_path):
        """Malformed checklist items should produce a warning."""
        content = _minimal_main_agent(extra=(
            "<gate>\n"
            "- [ ] Good item\n"
            "- [bad] Malformed checkbox\n"
            "- [] Missing space\n"
            "</gate>\n"
        ))
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        checklist_warnings = [w for w in warnings if "checklist" in w.lower() or "malformed" in w.lower()]
        assert len(checklist_warnings) > 0, "Expected warning for malformed checklist items"

    @pytest.mark.parametrize("tag", ["gate", "handoff-gate", "self-review", "review-checklist"])
    def test_checklist_checked_in_all_gate_tags(self, tmp_path, tag):
        """Checklist format should be checked in all gate-like tags."""
        content = _minimal_main_agent(extra=(
            f"<{tag}>\n"
            "- [bad] Malformed checkbox\n"
            f"</{tag}>\n"
        ))
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        checklist_warnings = [w for w in warnings if "checklist" in w.lower() or "malformed" in w.lower() or tag in w.lower()]
        assert len(checklist_warnings) > 0, f"Expected warning for malformed checklist in <{tag}>"


# ===========================================================================
# Check 8: Header format check (warning)
# Legacy: validate-agent-schema.sh check_header_format (lines 264-275)
# First line of primary agents must match ^# .+ Agent
# ===========================================================================

class TestHeaderFormatCheck:
    """Legacy behavior from validate-agent-schema.sh header format validation."""

    def test_valid_header_no_warning(self, tmp_path):
        """Header matching '# Name Agent - Description' should produce no warning."""
        content = _minimal_main_agent()  # Has "# Dev Agent - Description"
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        header_warnings = [w for w in warnings if "header" in w.lower()]
        assert header_warnings == []

    def test_invalid_header_warns(self, tmp_path):
        """Header not matching '# Name Agent' pattern should produce a warning."""
        content = (
            "# My Cool Tool\n"  # Missing "Agent" in header
            "<role>\nDoes things.\n</role>\n"
            "<critical>\nImportant stuff.\n</critical>\n"
            "<minimalist-discipline>\nStay focused.\n</minimalist-discipline>\n"
            "<helpers>\n**Model:** haiku\n</helpers>\n"
            "<skills>\n- /pf-testing\n</skills>\n"
        )
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        header_warnings = [w for w in warnings if "header" in w.lower()]
        assert len(header_warnings) > 0, "Expected warning for header missing 'Agent'"

    def test_no_header_line_warns(self, tmp_path):
        """File not starting with '# ' should produce a header warning."""
        content = (
            "<role>\nDoes things.\n</role>\n"
            "<critical>\nImportant stuff.\n</critical>\n"
            "<helpers>\n**Model:** haiku\n</helpers>\n"
            "<skills>\n- /pf-testing\n</skills>\n"
        )
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        header_warnings = [w for w in warnings if "header" in w.lower()]
        assert len(header_warnings) > 0, "Expected warning for missing header line"


# ===========================================================================
# Check 9: <parameters> with <helpers> (warning)
# Legacy: validate-agent-schema.sh check_parameters_section (lines 328-338)
# If <helpers> present, <parameters> should also be present.
# ===========================================================================

class TestParametersWithHelpers:
    """Legacy behavior from validate-agent-schema.sh parameters section check."""

    def test_helpers_with_parameters_no_warning(self, tmp_path):
        """File with both <helpers> and <parameters> should produce no warning."""
        content = _minimal_main_agent(extra=(
            "<parameters>\n## Subagent Parameters\n</parameters>\n"
        ))
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        param_warnings = [w for w in warnings if "parameters" in w.lower()]
        assert param_warnings == []

    def test_helpers_without_parameters_warns(self, tmp_path):
        """File with <helpers> but no <parameters> should produce a warning."""
        content = _minimal_main_agent()  # Has helpers but no parameters
        agents_dir = _write_agent(tmp_path, "dev.md", content)
        _, warnings = validate_main_agent(agents_dir / "dev.md", agents_dir)
        param_warnings = [w for w in warnings if "parameters" in w.lower()]
        assert len(param_warnings) > 0, "Expected warning for <helpers> without <parameters>"


# ===========================================================================
# Check 10: Subagent name matches filename (error)
# Legacy: validate-subagent-frontmatter.sh (lines 107-113)
# The `name` field in frontmatter must equal the filename without .md.
# ===========================================================================

class TestSubagentNameFilenameMatch:
    """Legacy behavior from validate-subagent-frontmatter.sh name check."""

    def test_name_matches_filename_no_error(self, tmp_path):
        """Subagent with name matching filename should produce no error."""
        content = _minimal_subagent(name="testing-runner")
        agents_dir = _write_agent(tmp_path, "testing-runner.md", content)
        errors, _ = validate_subagent(agents_dir / "testing-runner.md")
        name_errors = [e for e in errors if "mismatch" in e.lower() or "name" in e.lower()]
        # Filter out "Missing required frontmatter field: name" — we're checking mismatch
        name_errors = [e for e in name_errors if "mismatch" in e.lower()]
        assert name_errors == []

    def test_name_mismatches_filename_errors(self, tmp_path):
        """Subagent with name not matching filename should produce an error."""
        content = _minimal_subagent(name="wrong-name")
        agents_dir = _write_agent(tmp_path, "testing-runner.md", content)
        errors, _ = validate_subagent(agents_dir / "testing-runner.md")
        name_errors = [e for e in errors if "mismatch" in e.lower()]
        assert len(name_errors) > 0, "Expected error for name/filename mismatch"
