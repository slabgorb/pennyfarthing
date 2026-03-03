"""
Tests for MSSCI-14672: Bell mode observation injection (Story 95-7).

Verifies the PostToolUse bell mode hook can detect and inject tandem
observations from backseat agents into the primary agent's context.

AC1: PostToolUse hook checks tandem observation file mtime for new content
AC2: Injects observations as bell messages: [Tandem] {persona_name}: {observation_summary}
AC3: Primary agent surfaces observations in own voice, attributing to backseat persona
AC4: No bell mode schema changes required
AC5: Injection completes within existing hook time budget (NFR2)
AC6: Both bash and Python hook implementations updated

Run with: python -m pytest tests/python/test_bellmode_tandem_injection.py -v
"""

import json
import sys
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.bellmode_hook import (  # noqa: E402
    check_tandem_files,
    format_tandem_message,
    get_latest_observation,
    get_tandem_mtime,
    read_tandem_observations,
    save_tandem_mtime,
)
from pf.hooks import HookResponse  # noqa: E402

# =============================================================================
# Fixtures
# =============================================================================


SAMPLE_OBSERVATION_FILE = """\
# Tandem Observations: 95-7
**Observer:** reviewer (The Queen of Hearts)
**Phase:** green
**Started:** 2026-02-10T14:30:00Z

---

## [14:32] Observation
**Trigger:** tool_use: Edit
The error handling in bellmode_hook.py swallows exceptions silently.
Consider logging to stderr at minimum.

---

## [14:35] Observation
**Trigger:** context_watch: test strategy
The test fixtures don't cover the case where tandem files exist
but bell mode is disabled. This should be a no-op.

---
"""

SAMPLE_OBSERVATION_SINGLE = """\
# Tandem Observations: 95-7
**Observer:** tea (The Caterpillar)
**Phase:** red
**Started:** 2026-02-10T14:00:00Z

---

## [14:05] Observation
**Trigger:** file_watch: src/hooks.py
The hooks module lacks type annotations for the new tandem functions.

---
"""

SAMPLE_OBSERVATION_EMPTY_HEADER_ONLY = """\
# Tandem Observations: 95-7
**Observer:** architect (The White Queen)
**Phase:** green
**Started:** 2026-02-10T15:00:00Z

---
"""


@pytest.fixture()
def tmp_project(tmp_path):
    """Create a temporary project directory with .pennyfarthing marker."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    return tmp_path


@pytest.fixture()
def bell_enabled_project(tmp_project):
    """Project with bell mode enabled."""
    config = tmp_project / ".pennyfarthing" / "config.local.yaml"
    config.write_text("workflow:\n  bell_mode: true\n")
    return tmp_project


@pytest.fixture()
def tandem_file(tmp_project):
    """Create a tandem observation file."""
    obs_file = tmp_project / ".session" / "95-7-tandem-reviewer.md"
    obs_file.write_text(SAMPLE_OBSERVATION_FILE)
    return obs_file


@pytest.fixture()
def single_observation_file(tmp_project):
    """Create a tandem observation file with a single entry."""
    obs_file = tmp_project / ".session" / "95-7-tandem-tea.md"
    obs_file.write_text(SAMPLE_OBSERVATION_SINGLE)
    return obs_file


@pytest.fixture()
def empty_observation_file(tmp_project):
    """Create a tandem observation file with only headers (no entries)."""
    obs_file = tmp_project / ".session" / "95-7-tandem-architect.md"
    obs_file.write_text(SAMPLE_OBSERVATION_EMPTY_HEADER_ONLY)
    return obs_file


# =============================================================================
# AC1: Mtime-based new content detection
# =============================================================================


class TestMtimeTracking:
    """AC1: PostToolUse hook checks tandem observation file mtime for new content."""

    def test_detects_new_tandem_file(self, tmp_project, tandem_file):
        """New tandem file (no mtime sidecar) should be detected as new content."""
        results = check_tandem_files(tmp_project)
        assert len(results) > 0, "Should detect the new tandem file"

    def test_skips_unchanged_tandem_file(self, tmp_project, tandem_file):
        """Tandem file with matching mtime sidecar should be skipped."""
        # Record the current mtime
        current_mtime = tandem_file.stat().st_mtime
        save_tandem_mtime(tmp_project, "reviewer", current_mtime)

        results = check_tandem_files(tmp_project)
        assert len(results) == 0, "Should skip file with matching mtime"

    def test_detects_modified_tandem_file(self, tmp_project, tandem_file):
        """Tandem file modified after mtime was recorded should be detected."""
        # Record an old mtime
        save_tandem_mtime(tmp_project, "reviewer", 0.0)

        results = check_tandem_files(tmp_project)
        assert len(results) > 0, "Should detect the modified tandem file"

    def test_mtime_sidecar_location(self, tmp_project, tandem_file):
        """Mtime sidecar should be stored at .session/.tandem-mtime-{agent}."""
        save_tandem_mtime(tmp_project, "reviewer", 123.456)
        sidecar = tmp_project / ".session" / ".tandem-mtime-reviewer"
        assert sidecar.exists(), "Mtime sidecar should exist at expected path"

    def test_get_tandem_mtime_returns_zero_when_no_sidecar(self, tmp_project):
        """get_tandem_mtime should return 0.0 when no sidecar file exists."""
        mtime = get_tandem_mtime(tmp_project, "reviewer")
        assert mtime == 0.0, "Should return 0.0 when no sidecar exists"

    def test_save_and_read_mtime_roundtrip(self, tmp_project):
        """save_tandem_mtime and get_tandem_mtime should roundtrip correctly."""
        save_tandem_mtime(tmp_project, "tea", 1707580000.123)
        result = get_tandem_mtime(tmp_project, "tea")
        assert result == pytest.approx(1707580000.123), "Mtime should roundtrip"

    def test_updates_mtime_after_reading(self, tmp_project, tandem_file):
        """check_tandem_files should update mtime sidecar after reading."""
        check_tandem_files(tmp_project)
        sidecar = tmp_project / ".session" / ".tandem-mtime-reviewer"
        assert sidecar.exists(), "Sidecar should be created after check"

        saved_mtime = get_tandem_mtime(tmp_project, "reviewer")
        file_mtime = tandem_file.stat().st_mtime
        assert saved_mtime == pytest.approx(file_mtime), "Saved mtime should match file"


# =============================================================================
# AC2: Message formatting
# =============================================================================


class TestMessageFormatting:
    """AC2: Injects observations as bell messages: [Tandem] {persona_name}: {observation_summary}."""

    def test_format_tandem_message_basic(self):
        """Format should be [Tandem] {persona}: {summary}."""
        result = format_tandem_message("The Queen of Hearts", "The error handling swallows exceptions silently.")
        assert result == "[Tandem] The Queen of Hearts: The error handling swallows exceptions silently."

    def test_format_tandem_message_preserves_persona_name(self):
        """Persona name should be preserved exactly as given."""
        result = format_tandem_message("The Caterpillar", "Missing type annotations.")
        assert "[Tandem] The Caterpillar:" in result

    def test_get_latest_observation_returns_last_entry(self):
        """get_latest_observation should return the most recent entry from the file."""
        obs = get_latest_observation(SAMPLE_OBSERVATION_FILE)
        assert obs is not None
        assert "test fixtures" in obs["text"].lower() or "tandem files" in obs["text"].lower(), (
            f"Should return latest observation, got: {obs['text']}"
        )

    def test_get_latest_observation_extracts_persona(self):
        """get_latest_observation should extract the persona name from the header."""
        obs = get_latest_observation(SAMPLE_OBSERVATION_FILE)
        assert obs is not None
        assert obs["persona"] == "The Queen of Hearts"

    def test_get_latest_observation_single_entry(self):
        """Should work with a file containing a single observation."""
        obs = get_latest_observation(SAMPLE_OBSERVATION_SINGLE)
        assert obs is not None
        assert "type annotations" in obs["text"].lower()
        assert obs["persona"] == "The Caterpillar"

    def test_get_latest_observation_empty_file(self):
        """Should return None for a file with headers but no observation entries."""
        obs = get_latest_observation(SAMPLE_OBSERVATION_EMPTY_HEADER_ONLY)
        assert obs is None, "Should return None for file with no observations"

    def test_read_tandem_observations_finds_files(self, tmp_project, tandem_file):
        """read_tandem_observations should find .session/*-tandem-*.md files."""
        files = read_tandem_observations(tmp_project)
        assert len(files) == 1
        assert "reviewer" in str(files[0])

    def test_read_tandem_observations_returns_empty_when_no_files(self, tmp_project):
        """read_tandem_observations should return empty list when no tandem files exist."""
        files = read_tandem_observations(tmp_project)
        assert files == []


# =============================================================================
# AC3: Output format for primary agent
# =============================================================================


class TestOutputFormat:
    """AC3: Primary agent surfaces observations via additionalContext."""

    def test_hook_output_uses_additional_context(self):
        """Tandem injection should use the existing additionalContext field."""
        response = HookResponse(
            event_name="PostToolUse",
            additional_context="[Tandem] The Queen of Hearts: Missing error handling in hook.",
        )
        output = json.loads(response.to_json())

        assert output["hookSpecificOutput"]["hookEventName"] == "PostToolUse"
        assert "[Tandem]" in output["hookSpecificOutput"]["additionalContext"]

    def test_tandem_message_prefixed_differently_from_bell(self):
        """Tandem messages use [Tandem] prefix, not 'User feedback:'."""
        msg = format_tandem_message("The Caterpillar", "Test observation")
        assert msg.startswith("[Tandem]"), "Should start with [Tandem] prefix"
        assert not msg.startswith("User feedback:"), "Should NOT use bell queue prefix"


# =============================================================================
# AC4: No bell mode schema changes
# =============================================================================


class TestNoSchemaChanges:
    """AC4: No bell mode schema changes required."""

    def test_hook_response_has_no_new_fields(self):
        """HookResponse should not have any new tandem-specific fields."""
        response = HookResponse(event_name="PostToolUse")
        json_output = json.loads(response.to_json())

        # The only keys should be the existing ones
        hook_output = json_output["hookSpecificOutput"]
        allowed_keys = {
            "hookEventName",
            "permissionDecision",
            "permissionDecisionReason",
            "updatedInput",
            "additionalContext",
        }
        actual_keys = set(hook_output.keys())
        unexpected = actual_keys - allowed_keys
        assert not unexpected, f"Unexpected new fields in HookResponse: {unexpected}"

    def test_tandem_uses_same_additional_context_field(self):
        """Tandem injection reuses the additionalContext field from bell mode."""
        # Bell mode message
        bell_response = HookResponse(
            event_name="PostToolUse",
            additional_context="User feedback: hello",
        )
        # Tandem message
        tandem_response = HookResponse(
            event_name="PostToolUse",
            additional_context="[Tandem] The Caterpillar: observation text",
        )

        bell_output = json.loads(bell_response.to_json())
        tandem_output = json.loads(tandem_response.to_json())

        # Both should have identical structure (only content differs)
        assert bell_output["hookSpecificOutput"].keys() == tandem_output["hookSpecificOutput"].keys()


# =============================================================================
# AC5: Within hook time budget (NFR2)
# =============================================================================


class TestHookTimeBudget:
    """AC5: Injection completes within existing hook time budget."""

    def test_no_tandem_files_fast_exit(self, tmp_project):
        """When no tandem files exist, check_tandem_files should return immediately."""
        start = time.perf_counter()
        results = check_tandem_files(tmp_project)
        elapsed = time.perf_counter() - start

        assert results == []
        assert elapsed < 0.1, f"No-tandem fast path took {elapsed:.3f}s, should be < 0.1s"

    def test_tandem_works_without_bell_mode(self, tmp_project, tandem_file):
        """Tandem injection works without bell_mode enabled — no config required."""
        results = check_tandem_files(tmp_project)
        assert len(results) > 0, "Tandem should work without bell_mode config"

    def test_parsing_single_observation_file_within_budget(
        self, tmp_project, tandem_file
    ):
        """Parsing a single tandem observation file should complete quickly."""
        start = time.perf_counter()
        check_tandem_files(tmp_project)
        elapsed = time.perf_counter() - start

        assert elapsed < 0.5, f"Single file parse took {elapsed:.3f}s, should be < 0.5s"


# =============================================================================
# AC6: Both bash and Python implementations
# =============================================================================


class TestDualImplementation:
    """AC6: Both bash and Python hook implementations updated."""

    def test_python_bellmode_hook_has_tandem_functions(self):
        """bellmode_hook.py should export tandem-related functions."""
        from pf import bellmode_hook

        assert hasattr(bellmode_hook, "check_tandem_files"), "Missing check_tandem_files"
        assert hasattr(bellmode_hook, "read_tandem_observations"), "Missing read_tandem_observations"
        assert hasattr(bellmode_hook, "get_latest_observation"), "Missing get_latest_observation"
        assert hasattr(bellmode_hook, "format_tandem_message"), "Missing format_tandem_message"

    def test_bash_hook_is_shim_to_python(self):
        """bell-mode-hook.sh should be a shim delegating to pf hooks bell-mode."""
        bash_hook = (
            PROJECT_ROOT / "pennyfarthing-dist" / "scripts" / "hooks" / "bell-mode-hook.sh"
        )
        assert bash_hook.exists(), "bell-mode-hook.sh should exist"
        content = bash_hook.read_text()
        assert "pf hooks bell-mode" in content, (
            "bell-mode-hook.sh should delegate to pf hooks bell-mode"
        )

    def test_python_hook_contains_tandem_check(self):
        """Python bell_mode.py should contain tandem observation logic."""
        hook_source = (
            PROJECT_ROOT / "pf" / "hooks" / "bell_mode.py"
        ).read_text()
        assert "tandem" in hook_source.lower(), (
            "hooks/bell_mode.py should contain tandem observation logic"
        )

    def test_python_hook_checks_tandem_mtime(self):
        """Python hook should check tandem file mtime."""
        hook_source = (
            PROJECT_ROOT / "pf" / "hooks" / "bell_mode.py"
        ).read_text()
        assert "mtime" in hook_source.lower(), (
            "hooks/bell_mode.py should check file mtime for tandem observations"
        )

    def test_python_hook_formats_tandem_prefix(self):
        """Python hook should format with [Tandem] prefix."""
        hook_source = (
            PROJECT_ROOT / "pf" / "hooks" / "bell_mode.py"
        ).read_text()
        assert "[Tandem]" in hook_source, "hooks/bell_mode.py should use [Tandem] prefix format"


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Edge cases and error conditions for tandem injection."""

    def test_malformed_observation_file_does_not_crash(self, tmp_project):
        """Malformed tandem file should be handled gracefully."""
        bad_file = tmp_project / ".session" / "95-7-tandem-bad.md"
        bad_file.write_text("this is not a valid observation file\nrandom content")

        # Should not raise
        results = check_tandem_files(tmp_project)
        # May return empty or skip the file — either is acceptable
        assert isinstance(results, list)

    def test_concurrent_write_does_not_corrupt_mtime(self, tmp_project):
        """Writing mtime for different agents should not interfere."""
        save_tandem_mtime(tmp_project, "reviewer", 100.0)
        save_tandem_mtime(tmp_project, "tea", 200.0)

        assert get_tandem_mtime(tmp_project, "reviewer") == pytest.approx(100.0)
        assert get_tandem_mtime(tmp_project, "tea") == pytest.approx(200.0)

    def test_missing_session_directory(self, tmp_project):
        """Should handle missing .session directory gracefully."""
        session_dir = tmp_project / ".session"
        if session_dir.exists():
            import shutil
            shutil.rmtree(session_dir)

        # No .session dir — should return empty, not crash
        files = read_tandem_observations(tmp_project)
        assert files == []

    def test_multiple_tandem_files_returns_all(self, tmp_project):
        """Multiple backseat agents = multiple tandem files, all detected."""
        session_dir = tmp_project / ".session"
        (session_dir / "95-7-tandem-reviewer.md").write_text(SAMPLE_OBSERVATION_FILE)
        (session_dir / "95-7-tandem-tea.md").write_text(SAMPLE_OBSERVATION_SINGLE)

        files = read_tandem_observations(tmp_project)
        assert len(files) == 2, f"Should find 2 tandem files, found {len(files)}"
