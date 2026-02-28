"""
Tests for Story 135-1: Create sprint findings aggregation script.

Tests the pf.findings.aggregate module — collect session files from sprint
archive, parse and aggregate R1-format findings across stories, detect
recurring patterns, and format output as markdown or JSON.

Run with: python -m pytest tests/python/test_sprint_findings_aggregation.py -v
"""

from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.findings.aggregate import (
    aggregate_findings,
    collect_session_files,
    detect_patterns,
    format_report,
)
from pf.findings.capture import parse_delivery_findings

# ---------------------------------------------------------------------------
# Fixtures: session file content with various findings states
# ---------------------------------------------------------------------------

SESSION_WITH_FINDINGS = textwrap.dedent("""\
    ---
    story_id: "99-1"
    jira_key: "MSSCI-99001"
    title: "Test story alpha"
    ---

    # 99-1: Test story alpha

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (blocking): Missing input validation for empty arrays. Affects `src/parser.py` (add guard clause). *Found by TEA during test design.*

    ### Dev (implementation)
    - **Improvement** (non-blocking): Could extract shared helper for reuse. Affects `src/utils.py` (extract common logic). *Found by Dev during implementation.*
""")

SESSION_WITH_SAME_PATH = textwrap.dedent("""\
    ---
    story_id: "99-2"
    jira_key: "MSSCI-99002"
    title: "Test story beta"
    ---

    # 99-2: Test story beta

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (non-blocking): Insufficient error messages for edge cases. Affects `src/parser.py` (improve error context). *Found by TEA during test design.*

    ### Reviewer (code review)
    - **Conflict** (blocking): API contract differs from documentation. Affects `docs/api.md` (update spec). *Found by Reviewer during code review.*
""")

SESSION_NO_FINDINGS = textwrap.dedent("""\
    ---
    story_id: "99-3"
    jira_key: "MSSCI-99003"
    title: "Test story gamma"
    ---

    # 99-3: Test story gamma

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - No upstream findings during test design.

    ### Dev (implementation)
    - No upstream findings during implementation.
""")

SESSION_NO_DELIVERY_SECTION = textwrap.dedent("""\
    ---
    story_id: "99-4"
    jira_key: "MSSCI-99004"
    title: "Old story without findings section"
    ---

    # 99-4: Old story without findings section

    ## SM Assessment
    Done.
""")

SPRINT_COMPLETED_YAML = textwrap.dedent("""\
    sprint:
      name: "TO Sprint 9999"
      number: 9999
      jira_sprint_id: 999
      jira_sprint_name: "TO Sprint 9999"
      goal: Test sprint
      start_date: '2026-01-01'
      end_date: '2026-01-14'
      status: active

    completed_epics:
      - MSSCI-99000
    completed_stories:
      - id: 99-1
        epic: MSSCI-99000
        title: Test story alpha
        points: 3
        completed: '2026-01-10'
      - id: 99-2
        epic: MSSCI-99000
        title: Test story beta
        points: 2
        completed: '2026-01-11'
      - id: 99-3
        epic: MSSCI-99000
        title: Test story gamma
        points: 1
        completed: '2026-01-12'
      - id: 99-4
        epic: MSSCI-99000
        title: Old story without findings section
        points: 1
        completed: '2026-01-13'
""")


# ---------------------------------------------------------------------------
# AC1: Script reads all archived sessions for a specified sprint
# ---------------------------------------------------------------------------


class TestCollectSessionFiles:
    """AC1: collect_session_files discovers session files from sprint archive."""

    def test_finds_sessions_from_completed_yaml(self, tmp_path):
        """Reads sprint-completed YAML and locates matching session files."""
        archive = tmp_path / "archive"
        archive.mkdir()

        # Write sprint completed file
        (archive / "sprint-9999-completed.yaml").write_text(SPRINT_COMPLETED_YAML)

        # Write session files (only 3 of 4 have files — tests graceful handling)
        (archive / "MSSCI-99001-session.md").write_text(SESSION_WITH_FINDINGS)
        (archive / "MSSCI-99002-session.md").write_text(SESSION_WITH_SAME_PATH)
        (archive / "MSSCI-99003-session.md").write_text(SESSION_NO_FINDINGS)
        # MSSCI-99004 deliberately missing — should not crash

        result = collect_session_files(archive, 9999)
        assert result["success"] is True
        sessions = result["data"]["sessions"]

        # Should find 3 sessions (the 4th has no file)
        assert len(sessions) == 3

        # Each session has required keys
        for s in sessions:
            assert "jira_key" in s
            assert "story_id" in s
            assert "path" in s
            assert Path(s["path"]).exists()

        # Check specific keys found
        jira_keys = {s["jira_key"] for s in sessions}
        assert "MSSCI-99001" in jira_keys
        assert "MSSCI-99002" in jira_keys
        assert "MSSCI-99003" in jira_keys

    def test_missing_sprint_completed_file(self, tmp_path):
        """Returns error when sprint-completed YAML doesn't exist."""
        archive = tmp_path / "archive"
        archive.mkdir()

        result = collect_session_files(archive, 8888)
        assert result["success"] is False
        assert "error" in result

    def test_empty_sprint_no_stories(self, tmp_path):
        """Handles sprint with no completed stories."""
        archive = tmp_path / "archive"
        archive.mkdir()

        empty_yaml = textwrap.dedent("""\
            sprint:
              name: "TO Sprint 7777"
              number: 7777
            completed_stories: []
        """)
        (archive / "sprint-7777-completed.yaml").write_text(empty_yaml)

        result = collect_session_files(archive, 7777)
        assert result["success"] is True
        assert len(result["data"]["sessions"]) == 0

    def test_story_id_extracted_from_yaml(self, tmp_path):
        """Story IDs are extracted from the completed YAML entries."""
        archive = tmp_path / "archive"
        archive.mkdir()

        (archive / "sprint-9999-completed.yaml").write_text(SPRINT_COMPLETED_YAML)
        (archive / "MSSCI-99001-session.md").write_text(SESSION_WITH_FINDINGS)

        result = collect_session_files(archive, 9999)
        assert result["success"] is True

        session_99_1 = [s for s in result["data"]["sessions"] if s["jira_key"] == "MSSCI-99001"]
        assert len(session_99_1) == 1
        assert session_99_1[0]["story_id"] == "99-1"


# ---------------------------------------------------------------------------
# AC2: Parses R1-format findings from each session
# ---------------------------------------------------------------------------


class TestAggregateFindings:
    """AC2: aggregate_findings parses and combines findings across sessions."""

    def _make_sessions(self, tmp_path, contents: dict[str, str]) -> list[dict]:
        """Helper: write session files and return session dicts."""
        sessions = []
        for jira_key, content in contents.items():
            path = tmp_path / f"{jira_key}-session.md"
            path.write_text(content)
            # Extract story_id from content
            import re
            m = re.search(r'story_id:\s*"([^"]+)"', content)
            story_id = m.group(1) if m else jira_key
            sessions.append({"jira_key": jira_key, "story_id": story_id, "path": path})
        return sessions

    def test_parses_findings_from_multiple_sessions(self, tmp_path):
        """Extracts R1-format findings from all provided sessions."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99001": SESSION_WITH_FINDINGS,
            "MSSCI-99002": SESSION_WITH_SAME_PATH,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True

        data = result["data"]
        # SESSION_WITH_FINDINGS has 2 findings, SESSION_WITH_SAME_PATH has 2 findings
        assert data["total"] == 4

    def test_findings_include_story_id(self, tmp_path):
        """Each finding dict includes the story_id it came from."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99001": SESSION_WITH_FINDINGS,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True

        for finding in result["data"]["findings"]:
            assert "story_id" in finding
            assert finding["story_id"] == "99-1"

    def test_skips_no_findings_entries(self, tmp_path):
        """Entries with 'No upstream findings' are excluded from aggregation."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99003": SESSION_NO_FINDINGS,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True
        assert result["data"]["total"] == 0
        assert result["data"]["findings"] == []

    def test_handles_session_without_delivery_section(self, tmp_path):
        """Sessions without ## Delivery Findings are handled gracefully."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99004": SESSION_NO_DELIVERY_SECTION,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True
        assert result["data"]["total"] == 0

    def test_blocking_count_tracked(self, tmp_path):
        """Blocking findings are counted separately."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99001": SESSION_WITH_FINDINGS,
            "MSSCI-99002": SESSION_WITH_SAME_PATH,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True

        # 1 blocking in session 1 (Gap blocking), 1 blocking in session 2 (Conflict blocking)
        assert result["data"]["blocking_count"] == 2

    def test_empty_sessions_list(self, tmp_path):
        """Empty sessions list produces zero findings."""
        result = aggregate_findings([])
        assert result["success"] is True
        assert result["data"]["total"] == 0


# ---------------------------------------------------------------------------
# AC3: Aggregates findings with cross-story grouping
# ---------------------------------------------------------------------------


class TestCrossStoryGrouping:
    """AC3: Findings are grouped by type, path, and agent."""

    def _make_sessions(self, tmp_path, contents: dict[str, str]) -> list[dict]:
        sessions = []
        for jira_key, content in contents.items():
            path = tmp_path / f"{jira_key}-session.md"
            path.write_text(content)
            import re
            m = re.search(r'story_id:\s*"([^"]+)"', content)
            story_id = m.group(1) if m else jira_key
            sessions.append({"jira_key": jira_key, "story_id": story_id, "path": path})
        return sessions

    def test_grouped_by_type(self, tmp_path):
        """by_type groups findings under Gap, Conflict, Improvement, Question."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99001": SESSION_WITH_FINDINGS,
            "MSSCI-99002": SESSION_WITH_SAME_PATH,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True

        by_type = result["data"]["by_type"]
        assert "Gap" in by_type
        assert len(by_type["Gap"]) == 2  # one from each session
        assert "Improvement" in by_type
        assert len(by_type["Improvement"]) == 1
        assert "Conflict" in by_type
        assert len(by_type["Conflict"]) == 1

    def test_grouped_by_path(self, tmp_path):
        """by_path groups findings that affect the same file."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99001": SESSION_WITH_FINDINGS,
            "MSSCI-99002": SESSION_WITH_SAME_PATH,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True

        by_path = result["data"]["by_path"]
        # Both sessions have findings affecting src/parser.py
        assert "src/parser.py" in by_path
        assert len(by_path["src/parser.py"]) == 2

    def test_grouped_by_agent(self, tmp_path):
        """by_agent groups findings by which agent reported them."""
        sessions = self._make_sessions(tmp_path, {
            "MSSCI-99001": SESSION_WITH_FINDINGS,
            "MSSCI-99002": SESSION_WITH_SAME_PATH,
        })

        result = aggregate_findings(sessions)
        assert result["success"] is True

        by_agent = result["data"]["by_agent"]
        assert "TEA" in by_agent
        assert len(by_agent["TEA"]) == 2  # one per session
        assert "Dev" in by_agent
        assert len(by_agent["Dev"]) == 1
        assert "Reviewer" in by_agent
        assert len(by_agent["Reviewer"]) == 1


# ---------------------------------------------------------------------------
# AC4: Identifies recurring patterns (same path/type across stories)
# ---------------------------------------------------------------------------


class TestDetectPatterns:
    """AC4: detect_patterns finds recurring path+type combos across stories."""

    def test_detects_same_path_and_type_across_stories(self):
        """Same path+type in 2+ stories = recurring pattern."""
        aggregated = {
            "findings": [
                {"type": "Gap", "path": "src/parser.py", "story_id": "99-1",
                 "urgency": "blocking", "description": "d1", "agent": "TEA", "phase": "test design"},
                {"type": "Gap", "path": "src/parser.py", "story_id": "99-2",
                 "urgency": "non-blocking", "description": "d2", "agent": "TEA", "phase": "test design"},
                {"type": "Improvement", "path": "src/utils.py", "story_id": "99-1",
                 "urgency": "non-blocking", "description": "d3", "agent": "Dev", "phase": "implementation"},
            ],
            "by_type": {},
            "by_path": {},
            "by_agent": {},
            "total": 3,
            "blocking_count": 1,
        }

        result = detect_patterns(aggregated)
        assert result["success"] is True

        patterns = result["data"]["patterns"]
        # Only src/parser.py + Gap appears in 2 stories
        assert result["data"]["pattern_count"] >= 1

        parser_pattern = [p for p in patterns if p["path"] == "src/parser.py" and p["type"] == "Gap"]
        assert len(parser_pattern) == 1
        assert parser_pattern[0]["count"] == 2
        assert set(parser_pattern[0]["stories"]) == {"99-1", "99-2"}

    def test_no_patterns_when_all_unique(self):
        """No patterns detected when each path+type appears in only one story."""
        aggregated = {
            "findings": [
                {"type": "Gap", "path": "src/a.py", "story_id": "99-1",
                 "urgency": "blocking", "description": "d1", "agent": "TEA", "phase": "test design"},
                {"type": "Improvement", "path": "src/b.py", "story_id": "99-2",
                 "urgency": "non-blocking", "description": "d2", "agent": "Dev", "phase": "implementation"},
            ],
            "by_type": {},
            "by_path": {},
            "by_agent": {},
            "total": 2,
            "blocking_count": 1,
        }

        result = detect_patterns(aggregated)
        assert result["success"] is True
        assert result["data"]["pattern_count"] == 0
        assert result["data"]["patterns"] == []

    def test_empty_findings(self):
        """No patterns from empty findings."""
        aggregated = {
            "findings": [],
            "by_type": {},
            "by_path": {},
            "by_agent": {},
            "total": 0,
            "blocking_count": 0,
        }

        result = detect_patterns(aggregated)
        assert result["success"] is True
        assert result["data"]["pattern_count"] == 0

    def test_same_path_different_types_not_pattern(self):
        """Same path but different types are NOT a pattern."""
        aggregated = {
            "findings": [
                {"type": "Gap", "path": "src/parser.py", "story_id": "99-1",
                 "urgency": "blocking", "description": "d1", "agent": "TEA", "phase": "test design"},
                {"type": "Improvement", "path": "src/parser.py", "story_id": "99-2",
                 "urgency": "non-blocking", "description": "d2", "agent": "Dev", "phase": "implementation"},
            ],
            "by_type": {},
            "by_path": {},
            "by_agent": {},
            "total": 2,
            "blocking_count": 1,
        }

        result = detect_patterns(aggregated)
        assert result["success"] is True
        assert result["data"]["pattern_count"] == 0


# ---------------------------------------------------------------------------
# AC5: Outputs structured aggregation report (markdown + JSON)
# ---------------------------------------------------------------------------


class TestFormatReport:
    """AC5: format_report produces markdown or JSON output."""

    SAMPLE_AGGREGATED = {
        "findings": [
            {"type": "Gap", "urgency": "blocking", "description": "Missing validation",
             "path": "src/parser.py", "what_changes": "add guard", "agent": "TEA",
             "phase": "test design", "story_id": "99-1"},
            {"type": "Improvement", "urgency": "non-blocking", "description": "Extract helper",
             "path": "src/utils.py", "what_changes": "extract logic", "agent": "Dev",
             "phase": "implementation", "story_id": "99-1"},
        ],
        "by_type": {"Gap": [{}], "Improvement": [{}]},
        "by_path": {"src/parser.py": [{}], "src/utils.py": [{}]},
        "by_agent": {"TEA": [{}], "Dev": [{}]},
        "total": 2,
        "blocking_count": 1,
    }

    SAMPLE_PATTERNS = {
        "patterns": [],
        "pattern_count": 0,
    }

    def test_markdown_output(self):
        """Markdown format produces readable report with sections."""
        result = format_report(self.SAMPLE_AGGREGATED, self.SAMPLE_PATTERNS, "markdown")
        assert result["success"] is True
        assert result["data"]["format"] == "markdown"

        output = result["data"]["output"]
        assert "# Sprint Findings" in output or "## Sprint Findings" in output
        assert "Gap" in output
        assert "Improvement" in output
        assert "src/parser.py" in output

    def test_json_output(self):
        """JSON format produces valid parseable JSON."""
        result = format_report(self.SAMPLE_AGGREGATED, self.SAMPLE_PATTERNS, "json")
        assert result["success"] is True
        assert result["data"]["format"] == "json"

        # Must be valid JSON
        parsed = json.loads(result["data"]["output"])
        assert "findings" in parsed or "total" in parsed

    def test_markdown_includes_blocking_summary(self):
        """Markdown report highlights blocking findings."""
        result = format_report(self.SAMPLE_AGGREGATED, self.SAMPLE_PATTERNS, "markdown")
        assert result["success"] is True
        output = result["data"]["output"]
        assert "blocking" in output.lower() or "BLOCKING" in output

    def test_markdown_includes_patterns_when_present(self):
        """Markdown report includes recurring patterns section."""
        patterns_with_data = {
            "patterns": [
                {"path": "src/parser.py", "type": "Gap", "stories": ["99-1", "99-2"], "count": 2}
            ],
            "pattern_count": 1,
        }
        result = format_report(self.SAMPLE_AGGREGATED, patterns_with_data, "markdown")
        assert result["success"] is True
        output = result["data"]["output"]
        assert "pattern" in output.lower() or "recurring" in output.lower()
        assert "src/parser.py" in output

    def test_invalid_format_returns_error(self):
        """Unknown format returns error result."""
        result = format_report(self.SAMPLE_AGGREGATED, self.SAMPLE_PATTERNS, "xml")
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# AC6: Handles sprints with zero findings gracefully
# ---------------------------------------------------------------------------


class TestZeroFindings:
    """AC6: All functions handle zero-findings sprints without crashing."""

    def test_aggregate_zero_findings(self, tmp_path):
        """Sprint where all sessions have 'No upstream findings'."""
        path = tmp_path / "MSSCI-99003-session.md"
        path.write_text(SESSION_NO_FINDINGS)

        sessions = [{"jira_key": "MSSCI-99003", "story_id": "99-3", "path": path}]
        result = aggregate_findings(sessions)
        assert result["success"] is True
        assert result["data"]["total"] == 0
        assert result["data"]["blocking_count"] == 0

    def test_detect_patterns_zero_findings(self):
        """Pattern detection with zero findings returns empty patterns."""
        aggregated = {
            "findings": [],
            "by_type": {},
            "by_path": {},
            "by_agent": {},
            "total": 0,
            "blocking_count": 0,
        }
        result = detect_patterns(aggregated)
        assert result["success"] is True
        assert result["data"]["pattern_count"] == 0

    def test_format_report_zero_findings_markdown(self):
        """Markdown report for zero findings is non-empty and sensible."""
        aggregated = {
            "findings": [],
            "by_type": {},
            "by_path": {},
            "by_agent": {},
            "total": 0,
            "blocking_count": 0,
        }
        patterns = {"patterns": [], "pattern_count": 0}

        result = format_report(aggregated, patterns, "markdown")
        assert result["success"] is True
        output = result["data"]["output"]
        assert len(output) > 0
        # Should indicate no findings
        assert "no findings" in output.lower() or "0" in output


# ---------------------------------------------------------------------------
# AC7: Integration — end-to-end collect → aggregate → detect → format
# ---------------------------------------------------------------------------


class TestEndToEnd:
    """AC7: Full pipeline from session files to formatted report."""

    def test_full_pipeline_with_findings(self, tmp_path):
        """Collect → aggregate → detect patterns → format markdown."""
        archive = tmp_path
        (archive / "sprint-9999-completed.yaml").write_text(SPRINT_COMPLETED_YAML)
        (archive / "MSSCI-99001-session.md").write_text(SESSION_WITH_FINDINGS)
        (archive / "MSSCI-99002-session.md").write_text(SESSION_WITH_SAME_PATH)
        (archive / "MSSCI-99003-session.md").write_text(SESSION_NO_FINDINGS)

        # Step 1: Collect
        collect_result = collect_session_files(archive, 9999)
        assert collect_result["success"] is True
        sessions = collect_result["data"]["sessions"]
        assert len(sessions) >= 2

        # Step 2: Aggregate
        agg_result = aggregate_findings(sessions)
        assert agg_result["success"] is True
        assert agg_result["data"]["total"] == 4  # 2 from each of 2 sessions with findings

        # Step 3: Detect patterns
        pat_result = detect_patterns(agg_result["data"])
        assert pat_result["success"] is True
        # src/parser.py + Gap appears in both stories
        assert pat_result["data"]["pattern_count"] >= 1

        # Step 4: Format
        fmt_result = format_report(agg_result["data"], pat_result["data"], "markdown")
        assert fmt_result["success"] is True
        assert len(fmt_result["data"]["output"]) > 0

    def test_full_pipeline_zero_findings(self, tmp_path):
        """Pipeline with only no-findings sessions produces clean report."""
        archive = tmp_path

        minimal_yaml = textwrap.dedent("""\
            sprint:
              name: "TO Sprint 6666"
              number: 6666
            completed_stories:
              - id: 99-3
                epic: MSSCI-99000
                title: Test
                points: 1
                completed: '2026-01-12'
        """)
        (archive / "sprint-6666-completed.yaml").write_text(minimal_yaml)
        (archive / "MSSCI-99003-session.md").write_text(SESSION_NO_FINDINGS)

        collect_result = collect_session_files(archive, 6666)
        assert collect_result["success"] is True

        agg_result = aggregate_findings(collect_result["data"]["sessions"])
        assert agg_result["success"] is True
        assert agg_result["data"]["total"] == 0

        pat_result = detect_patterns(agg_result["data"])
        assert pat_result["success"] is True
        assert pat_result["data"]["pattern_count"] == 0

        fmt_result = format_report(agg_result["data"], pat_result["data"], "markdown")
        assert fmt_result["success"] is True
