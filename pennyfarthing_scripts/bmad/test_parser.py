"""Tests for BMAD markdown parser."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from pennyfarthing_scripts.bmad.parser import (
    BMAD_TO_PF_STATUS,
    PF_TO_BMAD_STATUS,
    discover_bmad_stories,
    map_bmad_to_pf,
    map_pf_to_bmad,
    parse_bmad_epic,
    parse_bmad_story,
)

# =============================================================================
# Sample BMAD content
# =============================================================================

SAMPLE_STORY = """\
# Story 2.1: OCSF Event Schema

Status: ready-for-dev
Story-Key: 2-1-ocsf-event-schema
Jira: DPGD-24 / DPGD-35
Epic: 2 - Core Event Ingestion & Storage
Date: 2026-02-17

## Story

As a **security engineer**,
I want **a standardized event schema based on OCSF**,
So that **all ingested events have consistent structure**.

## Acceptance Criteria

**AC-1: Schema Validation**
**Given** an incoming event
**When** it is ingested
**Then** it conforms to the OCSF schema

## Tasks / Subtasks

- [ ] Task 1: Define schema (AC: #1)
"""

SAMPLE_STORY_COMPLETED = """\
# Story 1.1: Initialize Cargo Workspace

Status: completed
Story-Key: 1-1-initialize-cargo-workspace
Jira: DPGD-10 / DPGD-15
Epic: 1 - Project Foundation & Developer Experience
Date: 2026-02-17

## Story

As a **developer**,
I want **a properly initialized Cargo workspace**,
So that **I can start developing**.

## Acceptance Criteria

**AC-1: Workspace Initialized**
**Given** a fresh clone
**When** I run cargo build
**Then** it succeeds
"""

SAMPLE_EPIC = """\
---
epicNumber: 2
title: "Core Event Ingestion & Storage"
phase: "MVP"
status: "draft"
storyCount: 15
frsAddressed: ["FR25-FR40"]
nfrsAddressed: ["NFR10-NFR15"]
---

# Epic 2: Core Event Ingestion & Storage

## Epic Goal

Enable high-throughput event ingestion with columnar storage.
"""


# =============================================================================
# Status Mapping
# =============================================================================


class TestStatusMapping:
    def test_bmad_to_pf_all_values(self):
        assert map_bmad_to_pf("draft") == "planning"
        assert map_bmad_to_pf("ready-for-dev") == "ready"
        assert map_bmad_to_pf("in-progress") == "in_progress"
        assert map_bmad_to_pf("in-review") == "in_progress"
        assert map_bmad_to_pf("completed") == "done"
        assert map_bmad_to_pf("blocked") == "backlog"

    def test_bmad_to_pf_unknown_defaults_to_planning(self):
        assert map_bmad_to_pf("unknown-status") == "planning"

    def test_bmad_to_pf_case_insensitive(self):
        assert map_bmad_to_pf("Ready-For-Dev") == "ready"
        assert map_bmad_to_pf("COMPLETED") == "done"

    def test_pf_to_bmad_all_values(self):
        assert map_pf_to_bmad("planning") == "draft"
        assert map_pf_to_bmad("ready") == "ready-for-dev"
        assert map_pf_to_bmad("in_progress") == "in-progress"
        assert map_pf_to_bmad("done") == "completed"
        assert map_pf_to_bmad("backlog") == "blocked"
        assert map_pf_to_bmad("canceled") == "completed"

    def test_pf_to_bmad_unknown_defaults_to_draft(self):
        assert map_pf_to_bmad("unknown") == "draft"

    def test_roundtrip_bmad_through_pf(self):
        """BMAD → PF → BMAD should preserve status (except in-review → in-progress → in-progress)."""
        for bmad_status, pf_status in BMAD_TO_PF_STATUS.items():
            roundtrip = map_pf_to_bmad(pf_status)
            # in-review maps to in_progress which maps back to in-progress (not in-review)
            if bmad_status == "in-review":
                assert roundtrip == "in-progress"
            else:
                assert roundtrip == bmad_status, f"Roundtrip failed for {bmad_status}"


# =============================================================================
# Story Parsing
# =============================================================================


class TestParseStory:
    def test_parse_basic_story(self, tmp_path: Path):
        story_file = tmp_path / "2-1-ocsf-event-schema.md"
        story_file.write_text(SAMPLE_STORY)

        result = parse_bmad_story(story_file)

        assert result["id"] == "2-1"
        assert result["title"] == "OCSF Event Schema"
        assert result["status"] == "ready"
        assert result["bmad_key"] == "2-1-ocsf-event-schema"
        assert result["bmad_status"] == "ready-for-dev"
        assert result["jira"] == "DPGD-24 / DPGD-35"
        assert result["epic_num"] == "2"
        assert result["points"] == 3
        assert "AC-1" in result["acceptance_criteria"]

    def test_parse_completed_story(self, tmp_path: Path):
        story_file = tmp_path / "1-1-initialize-cargo-workspace.md"
        story_file.write_text(SAMPLE_STORY_COMPLETED)

        result = parse_bmad_story(story_file)

        assert result["id"] == "1-1"
        assert result["status"] == "done"
        assert result["bmad_status"] == "completed"
        assert result["bmad_key"] == "1-1-initialize-cargo-workspace"

    def test_parse_story_with_missing_fields(self, tmp_path: Path):
        minimal = "# Story 5.3: Retry Logic\n\nSome content\n"
        story_file = tmp_path / "5-3-retry-logic.md"
        story_file.write_text(minimal)

        result = parse_bmad_story(story_file)

        # Should still parse with defaults
        assert result["status"] == "planning"
        assert result["bmad_status"] == "draft"
        assert result["points"] == 3


# =============================================================================
# Epic Parsing
# =============================================================================


class TestParseEpic:
    def test_parse_epic_with_frontmatter(self, tmp_path: Path):
        epic_file = tmp_path / "epic-02-event-ingestion.md"
        epic_file.write_text(SAMPLE_EPIC)

        result = parse_bmad_epic(epic_file)

        assert result["epicNumber"] == 2
        assert result["title"] == "Core Event Ingestion & Storage"
        assert result["phase"] == "MVP"
        assert result["status"] == "draft"
        assert result["storyCount"] == 15

    def test_parse_epic_without_frontmatter(self, tmp_path: Path):
        epic_file = tmp_path / "epic-99-something.md"
        epic_file.write_text("# Epic 99: Something\n\nNo frontmatter here.\n")

        result = parse_bmad_epic(epic_file)

        assert result["epicNumber"] == 0
        assert result["status"] == "draft"


# =============================================================================
# Discovery
# =============================================================================


class TestDiscovery:
    def test_discover_stories(self, tmp_path: Path):
        impl = tmp_path / "implementation-artifacts"
        impl.mkdir()

        (impl / "1-1-workspace.md").write_text(SAMPLE_STORY_COMPLETED)
        (impl / "2-1-schema.md").write_text(SAMPLE_STORY)
        # Meta files should be skipped
        (impl / "0-1-bmad-lifecycle.md").write_text("# Meta file\n")
        # Non-matching files should be skipped
        (impl / "readme.md").write_text("# Readme\n")

        stories = discover_bmad_stories(tmp_path)

        assert len(stories) == 2
        assert stories[0]["id"] == "1-1"
        assert stories[1]["id"] == "2-1"

    def test_discover_stories_empty_dir(self, tmp_path: Path):
        stories = discover_bmad_stories(tmp_path)
        assert stories == []

    def test_discover_epics(self, tmp_path: Path):
        epics_dir = tmp_path / "planning-artifacts" / "epics"
        epics_dir.mkdir(parents=True)

        (epics_dir / "epic-01-foundation.md").write_text(
            "---\nepicNumber: 1\ntitle: Foundation\nphase: MVP\nstatus: draft\nstoryCount: 5\n---\n"
        )
        (epics_dir / "epic-02-ingestion.md").write_text(SAMPLE_EPIC)
        (epics_dir / "index.md").write_text("# Index\n")

        from pennyfarthing_scripts.bmad.parser import discover_bmad_epics

        epics = discover_bmad_epics(tmp_path)

        assert len(epics) == 2
        assert epics[0]["epicNumber"] == 1
        assert epics[1]["epicNumber"] == 2
