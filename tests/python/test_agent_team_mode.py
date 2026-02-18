"""
Tests for Story 86-14: Agent behavior — team-mode protocol.

Validates that agent definitions include proper team-mode sections
for Claude Code native Agent Teams integration.

Covers all 6 Acceptance Criteria:
  AC1: `agent-behavior.md` has `<team-mode>` section covering: team creation,
       teammate spawning, SendMessage communication, cleanup before handoff
  AC2: Lead agents know: create team on phase entry, spawn teammates per YAML,
       shut down teammates before exit protocol
  AC3: Teammate agents know: they're a teammate (not lead), communicate via
       SendMessage, go idle when done, respond to shutdown requests
  AC4: Exit protocol has team-mode branch: cleanup team THEN run normal handoff
  AC5: Reflector markers still used for inter-phase handoff (unchanged)
  AC6: SendMessage used for intra-phase teammate communication (new)

Run with: python -m pytest tests/python/test_agent_team_mode.py -v
"""

from pathlib import Path
from textwrap import dedent

import pytest

from pennyfarthing_scripts.validate.adapters.team_mode import (
    classify_team_mode_agents,
    extract_team_mode_section,
    run,
    validate_behavior_guide_team_mode,
    validate_communication_protocols,
    validate_exit_protocol_team_branch,
    validate_lead_agent_team_mode,
    validate_teammate_awareness,
)

# =============================================================================
# Fixtures — inline markdown strings
# =============================================================================

BEHAVIOR_GUIDE_COMPLETE = dedent("""\
    <critical>
    **Session file:** `.session/{story-id}-session.md`

    **Handoff:** Run `handoff-marker.sh {next_agent}` as ABSOLUTE LAST ACTION.
    </critical>

    <team-mode>
    ## Team Mode Protocol

    When a workflow phase has `team:` configuration, the phase agent acts as
    **team lead** and spawns teammates for parallel collaboration.

    ### Team Creation
    On phase entry, detect `team:` block in workflow YAML. Use `TeamCreate`
    to create a phase-scoped team.

    ### Teammate Spawning
    Spawn teammates via the Task tool with `team_name` parameter. Each
    teammate runs `pf agent start {agent}` for full Prime activation.

    ### Communication
    - **Inter-phase handoff:** Use Reflector markers (`<!-- CYCLIST:HANDOFF -->`)
      as before — unchanged.
    - **Intra-phase collaboration:** Use `SendMessage` for teammate communication.
      Never use markers for intra-phase messaging.

    ### Teammate Behavior
    Teammates know they are NOT the lead. They:
    - Communicate via SendMessage (DMs to lead or other teammates)
    - Go idle when their task is complete
    - Respond to shutdown requests with shutdown_response

    ### Cleanup Before Handoff
    Before starting exit protocol, the lead MUST:
    1. Send shutdown_request to all teammates
    2. Wait for shutdown_response from each
    3. Run TeamDelete to clean up the team
    4. Then proceed with normal handoff (resolve-gate → complete-phase → marker)
    </team-mode>

    ## Reflector

    <critical>
    **EVERY TURN MUST END WITH A CYCLIST MARKER.** Stop hook enforces this.

    | Situation | Marker |
    |-----------|--------|
    | Workflow handoff | `<!-- CYCLIST:HANDOFF:/agent -->` |
    | Everything else | `<!-- CYCLIST:CONTINUE -->` |
    </critical>

    <agent-exit-protocol>
    ## Exit Protocol

    1. Write assessment to session
    2. **If team is active:** Shut down all teammates → TeamDelete
    3. Spawn `handoff` subagent → returns `HANDOFF_RESULT`
    4. Run `handoff-marker.sh {next_agent}`
    5. Output result verbatim and EXIT
    </agent-exit-protocol>
""")

BEHAVIOR_GUIDE_NO_TEAM_MODE = dedent("""\
    <critical>
    **Session file:** `.session/{story-id}-session.md`
    </critical>

    ## Reflector

    <critical>
    **EVERY TURN MUST END WITH A CYCLIST MARKER.**

    | Situation | Marker |
    |-----------|--------|
    | Workflow handoff | `<!-- CYCLIST:HANDOFF:/agent -->` |
    </critical>

    <agent-exit-protocol>
    ## Exit Protocol

    1. Write assessment to session
    2. Spawn `handoff` subagent
    3. Run `handoff-marker.sh {next_agent}`
    </agent-exit-protocol>
""")

BEHAVIOR_GUIDE_EMPTY_TEAM_MODE = dedent("""\
    <team-mode>
    </team-mode>

    <critical>
    CYCLIST markers required.
    </critical>

    <agent-exit-protocol>
    ## Exit Protocol
    1. Handoff
    </agent-exit-protocol>
""")

BEHAVIOR_GUIDE_MISSING_TOPICS = dedent("""\
    <team-mode>
    ## Team Mode

    This section describes team mode but is incomplete.
    It only mentions TeamCreate for team creation.
    </team-mode>

    <critical>
    **CYCLIST markers required.**
    </critical>

    <agent-exit-protocol>
    ## Exit Protocol
    1. Handoff
    </agent-exit-protocol>
""")

LEAD_AGENT_COMPLETE = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <team-mode>
    ## Team Mode (Lead)

    When the workflow phase has a `team:` block, Dev acts as **lead** agent:

    1. **On phase entry:** Detect team config, create team with TeamCreate
    2. **Spawn teammates** per workflow YAML `teammates:` list
    3. **During phase:** Coordinate via SendMessage, implement features
    4. **Before exit:** Shut down all teammates before starting exit protocol

    Teammates are phase-scoped — created at phase start, destroyed at phase end.
    </team-mode>

    <exit>
    1. Write Dev Assessment
    2. If team active: shutdown teammates → TeamDelete
    3. Follow exit protocol
    </exit>
""")

LEAD_AGENT_NO_TEAM_MODE = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <exit>
    1. Write Dev Assessment
    2. Follow exit protocol
    </exit>
""")

LEAD_AGENT_EMPTY_TEAM_MODE = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <team-mode>
    </team-mode>
""")

LEAD_AGENT_NO_LEAD_REFERENCE = dedent("""\
    # Dev Agent - Developer
    <role>Feature implementation</role>

    <team-mode>
    ## Team Mode

    When the workflow phase has a `team:` block, create a team.
    Spawn teammates per workflow YAML. Shut down before exit.
    </team-mode>
""")

TEAMMATE_CONTENT_COMPLETE = dedent("""\
    <team-mode>
    ## Team Mode

    ### As Teammate
    When spawned as a teammate (not the lead), the agent:
    - Knows it is a teammate, not the lead agent
    - Communicates via SendMessage (DMs to lead or peers)
    - Goes idle when assigned task is complete
    - Responds to shutdown requests with shutdown_response

    ### As Lead
    When acting as lead, create team and spawn teammates.
    </team-mode>
""")

TEAMMATE_CONTENT_MISSING_TOPICS = dedent("""\
    <team-mode>
    ## Team Mode

    When spawned as a teammate, the agent communicates with the team.
    </team-mode>
""")

EXIT_PROTOCOL_WITH_TEAM = dedent("""\
    <agent-exit-protocol>
    ## Exit Protocol

    1. Write assessment to session
    2. **If team is active:** Shut down all teammates → TeamDelete
    3. Resolve gate
    4. Complete phase
    5. Run `handoff-marker.sh {next_agent}`
    6. EXIT
    </agent-exit-protocol>
""")

EXIT_PROTOCOL_WITHOUT_TEAM = dedent("""\
    <agent-exit-protocol>
    ## Exit Protocol

    1. Write assessment to session
    2. Resolve gate
    3. Complete phase
    4. Run `handoff-marker.sh {next_agent}`
    5. EXIT
    </agent-exit-protocol>
""")


# =============================================================================
# Helpers
# =============================================================================


@pytest.fixture
def project_dir(tmp_path: Path) -> Path:
    """Create a temporary project directory with guides and agents subdirs."""
    guides = tmp_path / "pennyfarthing-dist" / "guides"
    guides.mkdir(parents=True)
    agents = tmp_path / "pennyfarthing-dist" / "agents"
    agents.mkdir(parents=True)
    return tmp_path


def _write_guide(project_dir: Path, name: str, content: str) -> Path:
    """Write a guide fixture file."""
    p = project_dir / "pennyfarthing-dist" / "guides" / name
    p.write_text(content)
    return p


def _write_agent(project_dir: Path, name: str, content: str) -> Path:
    """Write an agent fixture file."""
    p = project_dir / "pennyfarthing-dist" / "agents" / name
    p.write_text(content)
    return p


# =============================================================================
# AC1: agent-behavior.md has <team-mode> section
# =============================================================================


class TestAC1BehaviorGuideTeamMode:
    """AC1: agent-behavior.md has <team-mode> section covering team creation,
    teammate spawning, SendMessage communication, cleanup before handoff."""

    def test_complete_guide_has_team_mode_section(self, project_dir: Path) -> None:
        """Behavior guide with <team-mode> section should pass validation."""
        path = _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)

        errors, warnings = validate_behavior_guide_team_mode(path)

        assert len(errors) == 0, f"Expected no errors, got: {errors}"

    def test_missing_team_mode_section_is_error(self, project_dir: Path) -> None:
        """Behavior guide without <team-mode> section should produce an error."""
        path = _write_guide(
            project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_NO_TEAM_MODE
        )

        errors, warnings = validate_behavior_guide_team_mode(path)

        assert any("team-mode" in e.lower() or "missing" in e.lower() for e in errors)

    def test_empty_team_mode_section_is_error(self, project_dir: Path) -> None:
        """Behavior guide with empty <team-mode> section should produce an error."""
        path = _write_guide(
            project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_EMPTY_TEAM_MODE
        )

        errors, warnings = validate_behavior_guide_team_mode(path)

        assert any("empty" in e.lower() for e in errors)

    def test_team_mode_covers_team_creation(self, project_dir: Path) -> None:
        """<team-mode> must mention TeamCreate or team creation."""
        path = _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)

        errors, _ = validate_behavior_guide_team_mode(path)

        creation_errors = [e for e in errors if "team_creation" in e]
        assert creation_errors == [], f"Should cover team creation: {creation_errors}"

    def test_team_mode_covers_spawning(self, project_dir: Path) -> None:
        """<team-mode> must mention spawning teammates."""
        path = _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)

        errors, _ = validate_behavior_guide_team_mode(path)

        spawn_errors = [e for e in errors if "spawning" in e]
        assert spawn_errors == [], f"Should cover spawning: {spawn_errors}"

    def test_team_mode_covers_sendmessage(self, project_dir: Path) -> None:
        """<team-mode> must mention SendMessage."""
        path = _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)

        errors, _ = validate_behavior_guide_team_mode(path)

        msg_errors = [e for e in errors if "sendmessage" in e]
        assert msg_errors == [], f"Should cover SendMessage: {msg_errors}"

    def test_team_mode_covers_cleanup(self, project_dir: Path) -> None:
        """<team-mode> must mention cleanup/TeamDelete."""
        path = _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)

        errors, _ = validate_behavior_guide_team_mode(path)

        cleanup_errors = [e for e in errors if "cleanup" in e]
        assert cleanup_errors == [], f"Should cover cleanup: {cleanup_errors}"

    def test_missing_topics_produce_errors(self, project_dir: Path) -> None:
        """Guide with incomplete <team-mode> should report missing topics."""
        path = _write_guide(
            project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_MISSING_TOPICS
        )

        errors, _ = validate_behavior_guide_team_mode(path)

        # Missing spawning, sendmessage, cleanup
        assert len(errors) >= 2, f"Expected multiple topic errors, got: {errors}"


# =============================================================================
# AC2: Lead agents know team creation, spawning, shutdown
# =============================================================================


class TestAC2LeadAgentBehavior:
    """AC2: Lead agents know: create team on phase entry, spawn teammates per
    YAML, shut down teammates before exit protocol."""

    def test_complete_lead_agent_passes(self, project_dir: Path) -> None:
        """Lead agent with all team-mode content should pass."""
        path = _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)

        errors, warnings = validate_lead_agent_team_mode(path)

        assert len(errors) == 0, f"Expected no errors, got: {errors}"

    def test_lead_agent_without_team_mode_is_error(self, project_dir: Path) -> None:
        """Lead agent without <team-mode> section should produce an error."""
        path = _write_agent(project_dir, "dev.md", LEAD_AGENT_NO_TEAM_MODE)

        errors, _ = validate_lead_agent_team_mode(path)

        assert any("missing" in e.lower() or "team-mode" in e.lower() for e in errors)

    def test_lead_agent_empty_team_mode_is_error(self, project_dir: Path) -> None:
        """Lead agent with empty <team-mode> should produce an error."""
        path = _write_agent(project_dir, "dev.md", LEAD_AGENT_EMPTY_TEAM_MODE)

        errors, _ = validate_lead_agent_team_mode(path)

        assert any("empty" in e.lower() for e in errors)

    def test_lead_agent_must_reference_lead_role(self, project_dir: Path) -> None:
        """Lead agent <team-mode> must mention 'lead' role."""
        path = _write_agent(project_dir, "dev.md", LEAD_AGENT_NO_LEAD_REFERENCE)

        errors, _ = validate_lead_agent_team_mode(path)

        assert any("lead" in e.lower() for e in errors)

    def test_lead_references_phase_entry(self, project_dir: Path) -> None:
        """Complete lead should reference phase entry for team creation."""
        path = _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)

        _, warnings = validate_lead_agent_team_mode(path)

        phase_warnings = [w for w in warnings if "phase_entry" in w]
        assert phase_warnings == [], f"Should cover phase entry: {phase_warnings}"

    def test_lead_references_spawn_teammates(self, project_dir: Path) -> None:
        """Complete lead should reference spawning teammates."""
        path = _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)

        _, warnings = validate_lead_agent_team_mode(path)

        spawn_warnings = [w for w in warnings if "spawn_per_yaml" in w]
        assert spawn_warnings == [], f"Should cover spawning: {spawn_warnings}"

    def test_lead_references_shutdown(self, project_dir: Path) -> None:
        """Complete lead should reference shutdown before exit."""
        path = _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)

        _, warnings = validate_lead_agent_team_mode(path)

        shutdown_warnings = [w for w in warnings if "shutdown_before_exit" in w]
        assert (
            shutdown_warnings == []
        ), f"Should cover shutdown: {shutdown_warnings}"

    def test_classify_lead_agents(self, project_dir: Path) -> None:
        """Agents with 'lead' in team-mode should be classified as leads."""
        _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)
        _write_agent(project_dir, "sm.md", LEAD_AGENT_NO_TEAM_MODE)

        agents_dir = project_dir / "pennyfarthing-dist" / "agents"
        leads, all_tm = classify_team_mode_agents(agents_dir)

        assert "dev.md" in [f.name for f in leads]
        assert "sm.md" not in [f.name for f in leads]


# =============================================================================
# AC3: Teammate agents know: teammate identity, SendMessage, idle, shutdown
# =============================================================================


class TestAC3TeammateAwareness:
    """AC3: Teammate agents know: they're a teammate (not lead), communicate via
    SendMessage, go idle when done, respond to shutdown requests."""

    def test_complete_teammate_content_passes(self) -> None:
        """Content with all teammate topics should pass."""
        errors, warnings = validate_teammate_awareness(TEAMMATE_CONTENT_COMPLETE)

        assert len(errors) == 0, f"Expected no errors, got: {errors}"

    def test_missing_teammate_topics_produce_errors(self) -> None:
        """Content missing teammate topics should produce errors."""
        errors, _ = validate_teammate_awareness(TEAMMATE_CONTENT_MISSING_TOPICS)

        # Should flag missing: idle, shutdown_response (at minimum)
        assert len(errors) >= 2, f"Expected multiple errors, got: {errors}"

    def test_teammate_knows_sendmessage(self) -> None:
        """Teammate content must reference SendMessage."""
        errors, _ = validate_teammate_awareness(TEAMMATE_CONTENT_COMPLETE)

        msg_errors = [e for e in errors if "sendmessage" in e]
        assert msg_errors == [], f"Should mention SendMessage: {msg_errors}"

    def test_teammate_knows_idle(self) -> None:
        """Teammate content must reference going idle."""
        errors, _ = validate_teammate_awareness(TEAMMATE_CONTENT_COMPLETE)

        idle_errors = [e for e in errors if "idle" in e]
        assert idle_errors == [], f"Should mention idle: {idle_errors}"

    def test_teammate_knows_shutdown(self) -> None:
        """Teammate content must reference shutdown response."""
        errors, _ = validate_teammate_awareness(TEAMMATE_CONTENT_COMPLETE)

        shutdown_errors = [e for e in errors if "shutdown" in e]
        assert shutdown_errors == [], f"Should mention shutdown: {shutdown_errors}"

    def test_no_team_mode_section_is_error(self) -> None:
        """Content without <team-mode> section should produce an error."""
        errors, _ = validate_teammate_awareness("# Just a plain agent\n<role>Test</role>")

        assert any("missing" in e.lower() for e in errors)


# =============================================================================
# AC4: Exit protocol has team-mode branch
# =============================================================================


class TestAC4ExitProtocolTeamBranch:
    """AC4: Exit protocol has team-mode branch: cleanup team THEN run normal handoff."""

    def test_exit_with_team_cleanup_passes(self) -> None:
        """Exit protocol mentioning team cleanup should pass."""
        errors, _ = validate_exit_protocol_team_branch(EXIT_PROTOCOL_WITH_TEAM)

        assert len(errors) == 0, f"Expected no errors, got: {errors}"

    def test_exit_without_team_cleanup_is_error(self) -> None:
        """Exit protocol without team cleanup should produce an error."""
        errors, _ = validate_exit_protocol_team_branch(EXIT_PROTOCOL_WITHOUT_TEAM)

        assert any("team" in e.lower() for e in errors)

    def test_missing_exit_protocol_is_error(self) -> None:
        """Content without <agent-exit-protocol> should produce an error."""
        errors, _ = validate_exit_protocol_team_branch("# No exit protocol here")

        assert any("agent-exit-protocol" in e.lower() for e in errors)

    def test_team_cleanup_before_handoff_ordering(self) -> None:
        """Team cleanup must appear before handoff marker in exit protocol."""
        # The complete exit protocol has TeamDelete before handoff-marker
        errors, _ = validate_exit_protocol_team_branch(EXIT_PROTOCOL_WITH_TEAM)

        assert len(errors) == 0, "Team cleanup should be validated as before handoff"


# =============================================================================
# AC5: Reflector markers still used for inter-phase handoff (unchanged)
# =============================================================================


class TestAC5ReflectorUnchanged:
    """AC5: Reflector markers still used for inter-phase handoff (unchanged)."""

    def test_reflector_section_still_present(self) -> None:
        """Behavior guide must still have CYCLIST marker documentation."""
        errors, _ = validate_communication_protocols(BEHAVIOR_GUIDE_COMPLETE)

        cyclist_errors = [e for e in errors if "cyclist" in e.lower() or "reflector" in e.lower()]
        assert cyclist_errors == [], f"Reflector should be present: {cyclist_errors}"

    def test_guide_without_markers_is_error(self) -> None:
        """Guide missing CYCLIST markers should produce an error."""
        content = dedent("""\
            <team-mode>
            ## Team Mode
            Use SendMessage for intra-phase communication.
            Inter-phase uses markers. Intra-phase uses SendMessage.
            </team-mode>
        """)

        errors, _ = validate_communication_protocols(content)

        assert any(
            "cyclist" in e.lower() or "reflector" in e.lower() or "marker" in e.lower()
            for e in errors
        ), f"Expected marker error, got: {errors}"


# =============================================================================
# AC6: SendMessage used for intra-phase teammate communication (new)
# =============================================================================


class TestAC6SendMessageCommunication:
    """AC6: SendMessage used for intra-phase teammate communication (new)."""

    def test_team_mode_references_sendmessage(self) -> None:
        """<team-mode> section must reference SendMessage for intra-phase comm."""
        errors, _ = validate_communication_protocols(BEHAVIOR_GUIDE_COMPLETE)

        msg_errors = [e for e in errors if "sendmessage" in e.lower()]
        assert msg_errors == [], f"Should reference SendMessage: {msg_errors}"

    def test_distinction_between_markers_and_sendmessage(self) -> None:
        """<team-mode> should distinguish inter-phase (markers) from intra-phase (SendMessage)."""
        _, warnings = validate_communication_protocols(BEHAVIOR_GUIDE_COMPLETE)

        distinction_warnings = [
            w for w in warnings if "inter-phase" in w.lower() or "intra-phase" in w.lower()
        ]
        assert (
            distinction_warnings == []
        ), f"Should distinguish protocols: {distinction_warnings}"

    def test_team_mode_without_sendmessage_is_error(self) -> None:
        """<team-mode> without SendMessage reference should produce an error."""
        content = dedent("""\
            <team-mode>
            ## Team Mode
            Communicate with teammates using messages.
            Inter-phase uses markers. Intra-phase uses direct messages.
            </team-mode>

            <critical>
            CYCLIST markers required.
            </critical>
        """)

        errors, _ = validate_communication_protocols(content)

        assert any("sendmessage" in e.lower() for e in errors)


# =============================================================================
# Full validator run()
# =============================================================================


class TestValidatorRun:
    """Integration: `run()` produces a ValidateReport."""

    def test_run_returns_validate_report(self, project_dir: Path) -> None:
        """run() should return a ValidateReport with validator='team-mode'."""
        _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)
        _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)

        report = run(project_dir, fix=False, strict=False)

        from pennyfarthing_scripts.validate import ValidateReport

        assert isinstance(report, ValidateReport)
        assert report.validator == "team-mode"

    def test_all_valid_files_pass(self, project_dir: Path) -> None:
        """Complete guide and lead agents should produce zero errors."""
        _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)
        _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)
        _write_agent(
            project_dir,
            "reviewer.md",
            dedent("""\
                # Reviewer Agent
                <role>Code review</role>

                <team-mode>
                ## Team Mode (Lead)

                When review phase has `team:` block, Reviewer is the **lead**:
                1. On phase entry: create team
                2. Spawn teammates per YAML
                3. Coordinate review via SendMessage
                4. Shut down teammates before exit protocol
                </team-mode>
            """),
        )

        report = run(project_dir, fix=False, strict=False)

        assert report.errors == 0, (
            f"Expected 0 errors, got {report.errors}:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )

    def test_missing_guide_produces_errors(self, project_dir: Path) -> None:
        """Missing behavior guide should produce errors."""
        # Don't write the guide — only agents
        _write_agent(project_dir, "dev.md", LEAD_AGENT_COMPLETE)

        report = run(project_dir, fix=False, strict=False)

        assert report.errors > 0

    def test_missing_lead_sections_produce_errors(self, project_dir: Path) -> None:
        """Lead agents without <team-mode> should produce errors."""
        _write_guide(project_dir, "agent-behavior.md", BEHAVIOR_GUIDE_COMPLETE)
        _write_agent(project_dir, "dev.md", LEAD_AGENT_NO_TEAM_MODE)

        report = run(project_dir, fix=False, strict=False)

        assert report.errors > 0


# =============================================================================
# Real file integration tests — these FAIL in RED state
# =============================================================================


class TestRealAgentFiles:
    """Integration: Validate actual agent files in pennyfarthing-dist.

    These tests verify the REAL files have been updated with <team-mode>
    sections. They will FAIL until Dev implements the changes (RED state).
    """

    def _get_project_root(self) -> Path:
        project_root = Path(__file__).resolve().parents[2]
        guides_dir = project_root / "pennyfarthing-dist" / "guides"
        if not guides_dir.is_dir():
            pytest.skip("pennyfarthing-dist/guides/ not found")
        return project_root

    def test_real_behavior_guide_has_team_mode(self) -> None:
        """Real agent-behavior.md must have <team-mode> section."""
        root = self._get_project_root()
        guide = root / "pennyfarthing-dist" / "guides" / "agent-behavior.md"

        content = guide.read_text()
        section = extract_team_mode_section(content)

        assert section is not None, (
            "agent-behavior.md missing <team-mode> section — "
            "Dev must add it per AC1"
        )

    def test_real_behavior_guide_team_mode_passes_validation(self) -> None:
        """Real behavior guide <team-mode> section must pass content validation."""
        root = self._get_project_root()
        guide = root / "pennyfarthing-dist" / "guides" / "agent-behavior.md"

        errors, _ = validate_behavior_guide_team_mode(guide)

        assert errors == [], (
            f"agent-behavior.md <team-mode> has errors: {errors}"
        )

    def test_real_dev_has_team_mode_lead(self) -> None:
        """Real dev.md must have <team-mode> section with lead behavior."""
        root = self._get_project_root()
        agent = root / "pennyfarthing-dist" / "agents" / "dev.md"

        errors, _ = validate_lead_agent_team_mode(agent)

        assert errors == [], (
            f"dev.md team-mode lead errors: {errors}"
        )

    def test_real_reviewer_has_team_mode_lead(self) -> None:
        """Real reviewer.md must have <team-mode> section with lead behavior."""
        root = self._get_project_root()
        agent = root / "pennyfarthing-dist" / "agents" / "reviewer.md"

        errors, _ = validate_lead_agent_team_mode(agent)

        assert errors == [], (
            f"reviewer.md team-mode lead errors: {errors}"
        )

    def test_real_exit_protocol_has_team_branch(self) -> None:
        """Real agent-behavior.md exit protocol must have team cleanup branch."""
        root = self._get_project_root()
        guide = root / "pennyfarthing-dist" / "guides" / "agent-behavior.md"

        content = guide.read_text()
        errors, _ = validate_exit_protocol_team_branch(content)

        assert errors == [], (
            f"Exit protocol missing team branch: {errors}"
        )

    def test_real_communication_protocols_documented(self) -> None:
        """Real behavior guide must document both markers and SendMessage."""
        root = self._get_project_root()
        guide = root / "pennyfarthing-dist" / "guides" / "agent-behavior.md"

        content = guide.read_text()
        errors, _ = validate_communication_protocols(content)

        assert errors == [], (
            f"Communication protocol errors: {errors}"
        )

    def test_real_full_validation_zero_errors(self) -> None:
        """Full team-mode validator produces zero errors on real files."""
        root = self._get_project_root()

        report = run(root, fix=False, strict=False)

        assert report.errors == 0, (
            f"Real files have {report.errors} team-mode errors:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )
