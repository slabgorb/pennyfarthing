"""Tests for tiered context injection system.

Tests the --tier argument and tier-specific component loading for the prime command.

Story: PROJ-12797 - Python Prime Tier Support
Acceptance Criteria:
- AC1: --tier argument with choices FULL, REFRESH, HANDOFF, MINIMAL
- AC2: Tier-specific component loading per specification
- AC3: Compressed persona format (~100 tokens vs ~300 full)
- AC4: Default behavior unchanged (FULL when --tier not specified)
- AC5: Unit tests for all tier loading paths with >90% coverage
- AC6: Token reduction verified: REFRESH ~600, HANDOFF ~700, MINIMAL ~200
"""

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from pf import paths

# =============================================================================
# AC1: --tier CLI Argument Tests
# =============================================================================


class TestTierCLIArgument:
    """Tests for --tier CLI argument (AC1)."""

    def test_tier_argument_accepts_full(self, tmp_path: Path) -> None:
        """Test --tier FULL is accepted."""
        from pf.prime.cli import main

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "dev", "--tier", "FULL", "--no-workflow", "--no-register"])

        assert result == 0

    def test_tier_argument_accepts_refresh(self, tmp_path: Path) -> None:
        """Test --tier REFRESH is accepted."""
        from pf.prime.cli import main

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "dev", "--tier", "REFRESH", "--no-workflow", "--no-register"])

        assert result == 0

    def test_tier_argument_accepts_handoff(self, tmp_path: Path) -> None:
        """Test --tier HANDOFF is accepted."""
        from pf.prime.cli import main

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "dev", "--tier", "HANDOFF", "--no-workflow", "--no-register"])

        assert result == 0

    def test_tier_argument_accepts_minimal(self, tmp_path: Path) -> None:
        """Test --tier MINIMAL is accepted."""
        from pf.prime.cli import main

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "dev", "--tier", "MINIMAL", "--no-workflow", "--no-register"])

        assert result == 0

    def test_tier_argument_rejects_invalid_value(self, tmp_path: Path) -> None:
        """Test --tier rejects invalid values."""
        from pf.prime.cli import main

        with pytest.raises(SystemExit) as exc_info:
            main(["--tier", "INVALID"])

        # argparse exits with 2 for invalid arguments
        assert exc_info.value.code == 2

    def test_tier_argument_case_insensitive(self, tmp_path: Path) -> None:
        """Test --tier accepts lowercase values."""
        from pf.prime.cli import main

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            # Should accept lowercase
            result = main(["--agent", "dev", "--tier", "full", "--no-workflow", "--no-register"])

        assert result == 0


# =============================================================================
# AC2: Tier-Specific Component Loading Tests
# =============================================================================


class TestTierComponentLoading:
    """Tests for tier-specific component loading (AC2)."""

    def test_full_tier_loads_all_components(self, tmp_path: Path, capsys) -> None:
        """Test FULL tier loads all 10 components."""
        from pf.prime.cli import prime

        # Setup complete project structure
        self._setup_full_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="FULL",
                    no_workflow=True,
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # FULL should include all components
        assert "# Dev Agent" in captured.out  # agent-definition
        assert "# Agent Behavior Guide" in captured.out  # behavior-guide
        assert "patterns.md" in captured.out  # sidecars

    def test_refresh_tier_loads_dynamic_only(self, tmp_path: Path, capsys) -> None:
        """Test REFRESH tier loads only dynamic state (~600 tokens)."""
        from pf.prime.cli import prime

        # Setup
        self._setup_full_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="REFRESH",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # REFRESH should include:
        # - workflow-state
        # - sprint-context
        # - session-header
        # - Note about full context in history
        assert "Sprint" in captured.out  # sprint-context
        assert "Full context already in conversation history" in captured.out

        # REFRESH should NOT include:
        # - agent-definition
        # - behavior-guide
        # - sidecars
        assert "# Dev Agent" not in captured.out
        assert "# Agent Behavior Guide" not in captured.out

    def test_handoff_tier_loads_agent_essentials(self, tmp_path: Path, capsys, monkeypatch) -> None:
        """Test HANDOFF tier loads agent definition + compressed persona (~700 tokens)."""
        from pf.prime.cli import prime

        plugin_data = tmp_path / "plugin_data"
        plugin_data.mkdir()
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

        # Setup
        self._setup_full_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="HANDOFF",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # HANDOFF should include:
        # - workflow-state
        # - agent-definition
        # - persona-compressed
        # - Note about behavior guides in history
        assert "# Dev Agent" in captured.out
        assert "Behavior guides in conversation history" in captured.out

        # HANDOFF should use compressed persona, not full
        # Compressed format: <persona agent="dev" character="...">
        assert "<persona" in captured.out or "persona-compressed" in captured.out

        # HANDOFF should NOT include:
        # - behavior-guide
        # - sidecars
        # - domain-docs
        assert "# Agent Behavior Guide" not in captured.out

    def test_minimal_tier_loads_workflow_only(self, tmp_path: Path, capsys) -> None:
        """Test MINIMAL tier loads only workflow state (~200 tokens)."""
        from pf.prime.cli import prime

        # Setup
        self._setup_full_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="MINIMAL",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # MINIMAL should include:
        # - workflow-state
        # - Minimal context note
        assert "Minimal context" in captured.out or "conversation history" in captured.out

        # MINIMAL should NOT include:
        # - agent-definition
        # - persona
        # - behavior-guide
        # - sprint-context
        # - sidecars
        assert "# Dev Agent" not in captured.out
        assert "# Agent Behavior Guide" not in captured.out
        assert "patterns.md" not in captured.out

    def _setup_full_project(self, tmp_path: Path) -> None:
        """Set up a complete project structure for testing."""
        # .pennyfarthing directory
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Agent definition
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent\n\nDeveloper agent definition.")

        # Behavior guide
        guides_dir = pf_dir / "guides"
        guides_dir.mkdir()
        (guides_dir / "agent-behavior.md").write_text("# Agent Behavior Guide\n\nShared protocols.")

        # Sidecars
        sidecar_dir = pf_dir / "sidecars" / "dev"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Patterns\n\nDev patterns.")

        # Theme config
        cfg = paths.config_path(tmp_path)
        cfg.parent.mkdir(parents=True, exist_ok=True)
        cfg.write_text(yaml.dump({"theme": "test-theme"}))

        # Theme file
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test-theme.yaml").write_text(
            yaml.dump(
                {
                    "theme": {"name": "Test Theme", "user_title": "Developer"},
                    "agents": {
                        "dev": {
                            "character": "Test Developer",
                            "style": "Practical and efficient",
                            "role": "Implementation specialist",
                            "quote": "Ship it!",
                        }
                    },
                }
            )
        )

        # Sprint
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(
            yaml.dump({"sprint": {"number": 12, "goal": "Test sprint"}, "epics": []})
        )

        # Session
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "test-session.md").write_text("# Test Session\n\n- **Phase:** green")


# =============================================================================
# AC3: Compressed Persona Format Tests
# =============================================================================


class TestCompressedPersonaFormat:
    """Tests for compressed persona format (AC3)."""

    def test_compressed_persona_has_xml_structure(self, tmp_path: Path) -> None:
        """Test compressed persona uses XML format."""
        # Import will fail until function is implemented
        from pf.prime.models import Persona
        from pf.prime.persona import format_persona_compressed

        persona = Persona(
            character="Rosie the Riveter",
            style="Can-do wartime spirit, practical, determined",
            role="Implementation specialist",
            quote="We Can Do It!",
        )

        result = format_persona_compressed(persona, "test-theme", "dev")

        assert '<persona agent="dev"' in result
        assert 'character="Rosie the Riveter"' in result
        assert "</persona>" in result

    def test_compressed_persona_includes_voice(self, tmp_path: Path) -> None:
        """Test compressed persona includes voice element."""
        from pf.prime.models import Persona
        from pf.prime.persona import format_persona_compressed

        persona = Persona(
            character="Rosie the Riveter",
            style="Can-do wartime spirit, practical, determined",
            role="Implementation specialist",
        )

        result = format_persona_compressed(persona, "test-theme", "dev")

        assert "<voice>" in result
        assert "Can-do" in result

    def test_compressed_persona_includes_style(self, tmp_path: Path) -> None:
        """Test compressed persona includes style element."""
        from pf.prime.models import Persona
        from pf.prime.persona import format_persona_compressed

        persona = Persona(
            character="Rosie the Riveter",
            style="Direct, encouraging, efficiency-focused",
            role="Implementation specialist",
        )

        result = format_persona_compressed(persona, "test-theme", "dev")

        assert "<style>" in result

    def test_compressed_persona_includes_catchphrase_if_present(self, tmp_path: Path) -> None:
        """Test compressed persona includes catchphrase from quote."""
        from pf.prime.models import Persona
        from pf.prime.persona import format_persona_compressed

        persona = Persona(
            character="Rosie the Riveter",
            style="Practical",
            role="Dev",
            quote="We Can Do It!",
        )

        result = format_persona_compressed(persona, "test-theme", "dev")

        assert "<catchphrase>" in result
        assert "We Can Do It!" in result

    def test_compressed_persona_token_count(self, tmp_path: Path) -> None:
        """Test compressed persona is approximately 100 tokens (~400 chars)."""
        from pf.prime.models import Persona
        from pf.prime.persona import format_persona_compressed

        persona = Persona(
            character="Rosie the Riveter",
            style="Can-do wartime spirit, practical, determined",
            role="Implementation specialist",
            quote="We Can Do It!",
        )

        result = format_persona_compressed(persona, "test-theme", "dev")

        # Rough token estimate: ~4 chars per token
        # 100 tokens ≈ 400 chars
        # Allow some variance (50-600 chars for ~100 tokens)
        assert len(result) < 600, f"Compressed persona too long: {len(result)} chars"
        assert len(result) > 50, f"Compressed persona too short: {len(result)} chars"

    def test_full_persona_token_count(self, tmp_path: Path) -> None:
        """Test full persona is approximately 300 tokens (~1200 chars)."""
        from pf.prime.models import CrewMember, Persona
        from pf.prime.persona import format_persona_output

        persona = Persona(
            character="Rosie the Riveter",
            style="Can-do wartime spirit, practical, determined",
            role="Implementation specialist",
            quote="We Can Do It!",
            trait="Never gives up",
            motto="Victory through effort",
        )
        crew = [
            CrewMember(role="sm", character="Commander"),
            CrewMember(role="dev", character="Rosie"),
        ]

        result = format_persona_output(persona, "test-theme", "dev", crew, "Worker")

        # Full persona should be larger than compressed
        # ~300 tokens ≈ 1200 chars
        assert len(result) > 400, f"Full persona too short: {len(result)} chars"


# =============================================================================
# AC4: Default Behavior (Backward Compatibility) Tests
# =============================================================================


class TestDefaultBehavior:
    """Tests for default behavior / backward compatibility (AC4)."""

    def test_no_tier_argument_defaults_to_full(self, tmp_path: Path, capsys) -> None:
        """Test that omitting --tier defaults to FULL behavior."""
        from pf.prime.cli import prime

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent\n\nFull content here.")

        guides_dir = pf_dir / "guides"
        guides_dir.mkdir()
        (guides_dir / "agent-behavior.md").write_text("# Behavior Guide")

        sidecar_dir = pf_dir / "sidecars" / "dev"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Patterns")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                # No --tier argument
                result = prime(
                    agent_name="dev",
                    no_workflow=True,
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # Should behave like FULL tier - include all components
        assert "# Dev Agent" in captured.out
        assert "# Behavior Guide" in captured.out
        assert "patterns.md" in captured.out

    def test_explicit_full_tier_matches_default(self, tmp_path: Path, capsys) -> None:
        """Test that --tier FULL produces same output as default."""
        from pf.prime.cli import prime

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                # Run without tier
                result1 = prime(
                    agent_name="dev",
                    no_workflow=True,
                    no_register=True,
                    no_persona=True,
                    project_root=tmp_path,
                )
                output1 = capsys.readouterr().out

                # Run with explicit FULL
                result2 = prime(
                    agent_name="dev",
                    tier="FULL",
                    no_workflow=True,
                    no_register=True,
                    no_persona=True,
                    project_root=tmp_path,
                )
                output2 = capsys.readouterr().out

        assert result1 == result2 == 0
        assert output1 == output2

    def test_existing_flags_still_work_with_tier(self, tmp_path: Path, capsys) -> None:
        """Test existing flags (--quiet, --json, etc.) work with --tier."""
        import json

        from pf.prime.cli import prime

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = prime(
                agent_name="dev",
                tier="REFRESH",
                json_output=True,
                no_workflow=True,
                no_register=True,
                no_persona=True,
                project_root=tmp_path,
            )

        assert result == 0
        captured = capsys.readouterr()

        # Should be valid JSON
        data = json.loads(captured.out)
        assert "tier" in data or "agent_name" in data


# =============================================================================
# AC5: Coverage Tests (All Tier Loading Paths)
# =============================================================================


class TestTierLoadingPaths:
    """Tests for all tier loading paths (AC5)."""

    def test_full_tier_with_all_options(self, tmp_path: Path, monkeypatch) -> None:
        """Test FULL tier with all context sources available."""
        from pf.prime.tiers import ContextTier, load_tier_components

        plugin_data = tmp_path / "plugin_data"
        plugin_data.mkdir()
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

        # Setup complete project
        self._setup_complete_project(tmp_path)

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        # Should return all component types
        assert "workflow_state" in components
        assert "agent_definition" in components
        assert "persona" in components
        assert "behavior_guide" in components
        assert "sprint_context" in components
        assert "sidecars" in components

    def test_full_tier_with_missing_optional(self, tmp_path: Path) -> None:
        """Test FULL tier gracefully handles missing optional components."""
        from pf.prime.tiers import ContextTier, load_tier_components

        # Minimal setup - only agent definition
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        # Should have agent definition, gracefully handle missing others
        assert components.get("agent_definition") is not None
        # Missing components should be None or empty, not raise exceptions

    def test_refresh_tier_components(self, tmp_path: Path) -> None:
        """Test REFRESH tier returns correct component set."""
        from pf.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        components = load_tier_components(
            tier=ContextTier.REFRESH,
            agent_name="dev",
            project_root=tmp_path,
        )

        # REFRESH should include
        assert "workflow_state" in components
        assert "sprint_context" in components
        assert "session_header" in components

        # REFRESH should NOT include
        assert "agent_definition" not in components or components.get("agent_definition") is None
        assert "behavior_guide" not in components or components.get("behavior_guide") is None
        assert "sidecars" not in components or components.get("sidecars") is None

    def test_handoff_tier_components(self, tmp_path: Path, monkeypatch) -> None:
        """Test HANDOFF tier returns correct component set."""
        from pf.prime.tiers import ContextTier, load_tier_components

        plugin_data = tmp_path / "plugin_data"
        plugin_data.mkdir()
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

        self._setup_complete_project(tmp_path)

        components = load_tier_components(
            tier=ContextTier.HANDOFF,
            agent_name="dev",
            project_root=tmp_path,
        )

        # HANDOFF should include
        assert "workflow_state" in components
        assert "agent_definition" in components
        assert "persona_compressed" in components

        # HANDOFF should NOT include
        assert "behavior_guide" not in components or components.get("behavior_guide") is None
        assert "sidecars" not in components or components.get("sidecars") is None

    def test_minimal_tier_components(self, tmp_path: Path) -> None:
        """Test MINIMAL tier returns minimal component set."""
        from pf.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        components = load_tier_components(
            tier=ContextTier.MINIMAL,
            agent_name="dev",
            project_root=tmp_path,
        )

        # MINIMAL should include only workflow state
        assert "workflow_state" in components

        # MINIMAL should NOT include anything else
        assert "agent_definition" not in components or components.get("agent_definition") is None
        assert "persona" not in components or components.get("persona") is None
        assert "behavior_guide" not in components or components.get("behavior_guide") is None
        assert "sidecars" not in components or components.get("sidecars") is None

    def test_tier_enum_values(self) -> None:
        """Test ContextTier enum has all required values."""
        from pf.prime.tiers import ContextTier

        assert hasattr(ContextTier, "FULL")
        assert hasattr(ContextTier, "REFRESH")
        assert hasattr(ContextTier, "HANDOFF")
        assert hasattr(ContextTier, "MINIMAL")

    def test_tier_from_string(self) -> None:
        """Test converting string to ContextTier."""
        from pf.prime.tiers import ContextTier, tier_from_string

        assert tier_from_string("FULL") == ContextTier.FULL
        assert tier_from_string("REFRESH") == ContextTier.REFRESH
        assert tier_from_string("HANDOFF") == ContextTier.HANDOFF
        assert tier_from_string("MINIMAL") == ContextTier.MINIMAL

        # Case insensitive
        assert tier_from_string("full") == ContextTier.FULL
        assert tier_from_string("Refresh") == ContextTier.REFRESH

    def _setup_complete_project(self, tmp_path: Path) -> None:
        """Set up a complete project for component testing."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Agent
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        # Guides
        guides_dir = pf_dir / "guides"
        guides_dir.mkdir()
        (guides_dir / "agent-behavior.md").write_text("# Behavior")

        # Sidecars
        sidecar_dir = pf_dir / "sidecars" / "dev"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Patterns")

        # Theme
        cfg = paths.config_path(tmp_path)
        cfg.parent.mkdir(parents=True, exist_ok=True)
        cfg.write_text(yaml.dump({"theme": "test"}))
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test.yaml").write_text(
            yaml.dump({"agents": {"dev": {"character": "Dev", "style": "s", "role": "r"}}})
        )

        # Sprint
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(
            yaml.dump({"sprint": {"number": 12, "goal": "Test"}, "epics": []})
        )

        # Session
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "test-session.md").write_text("# Session\n\n- **Phase:** green")


# =============================================================================
# AC6: Token Reduction Verification Tests
# =============================================================================


class TestTokenReduction:
    """Tests for token reduction verification (AC6)."""

    def test_refresh_tier_under_800_tokens(self, tmp_path: Path, capsys) -> None:
        """Test REFRESH tier output is under 800 tokens (~3200 chars)."""
        from pf.prime.cli import prime

        # Setup with realistic content
        self._setup_realistic_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="REFRESH",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # ~600 tokens ≈ 2400 chars, allow up to 800 tokens ≈ 3200 chars
        assert len(captured.out) < 3200, (
            f"REFRESH tier too large: {len(captured.out)} chars (~{len(captured.out) // 4} tokens)"
        )

    def test_handoff_tier_under_900_tokens(self, tmp_path: Path, capsys) -> None:
        """Test HANDOFF tier output is under 900 tokens (~3600 chars)."""
        from pf.prime.cli import prime

        # Setup with realistic content
        self._setup_realistic_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="HANDOFF",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # ~700 tokens ≈ 2800 chars, allow up to 900 tokens ≈ 3600 chars
        assert len(captured.out) < 3600, (
            f"HANDOFF tier too large: {len(captured.out)} chars (~{len(captured.out) // 4} tokens)"
        )

    def test_minimal_tier_under_300_tokens(self, tmp_path: Path, capsys) -> None:
        """Test MINIMAL tier output is under 300 tokens (~1200 chars)."""
        from pf.prime.cli import prime

        # Setup with realistic content
        self._setup_realistic_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="MINIMAL",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # ~200 tokens ≈ 800 chars, allow up to 300 tokens ≈ 1200 chars
        assert len(captured.out) < 1200, (
            f"MINIMAL tier too large: {len(captured.out)} chars (~{len(captured.out) // 4} tokens)"
        )

    def test_full_tier_approximately_4000_tokens(self, tmp_path: Path, capsys) -> None:
        """Test FULL tier output is approximately 4000 tokens (~16000 chars)."""
        from pf.prime.cli import prime

        # Setup with realistic content
        self._setup_realistic_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="FULL",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # FULL should be significantly larger than other tiers
        # At minimum, should be larger than HANDOFF limit
        assert len(captured.out) > 3600, f"FULL tier too small: {len(captured.out)} chars"

    def test_tier_reduction_ratio(self, tmp_path: Path, capsys) -> None:
        """Test that reduced tiers are significantly smaller than FULL."""
        from pf.prime.cli import prime

        self._setup_realistic_project(tmp_path)

        sizes = {}
        for tier in ["FULL", "REFRESH", "HANDOFF", "MINIMAL"]:
            with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
                with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                    prime(
                        agent_name="dev",
                        tier=tier,
                        no_register=True,
                        project_root=tmp_path,
                    )
            sizes[tier] = len(capsys.readouterr().out)

        # REFRESH should be <20% of FULL
        assert sizes["REFRESH"] < sizes["FULL"] * 0.20, (
            f"REFRESH not reduced enough: {sizes['REFRESH']}/{sizes['FULL']} = {sizes['REFRESH'] / sizes['FULL']:.1%}"
        )

        # HANDOFF should be <25% of FULL
        assert sizes["HANDOFF"] < sizes["FULL"] * 0.25, (
            f"HANDOFF not reduced enough: {sizes['HANDOFF']}/{sizes['FULL']} = {sizes['HANDOFF'] / sizes['FULL']:.1%}"
        )

        # MINIMAL should be <10% of FULL
        assert sizes["MINIMAL"] < sizes["FULL"] * 0.10, (
            f"MINIMAL not reduced enough: {sizes['MINIMAL']}/{sizes['FULL']} = {sizes['MINIMAL'] / sizes['FULL']:.1%}"
        )

    def _setup_realistic_project(self, tmp_path: Path) -> None:
        """Set up a realistic project with typical content sizes."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Agent definition (~400 tokens = ~1600 chars)
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text(
            """# Developer Agent

<role>
Feature implementation, bug fixes, code quality
</role>

<critical>
- Write tests before implementation
- Follow existing patterns
- Keep changes focused
</critical>

<workflow>
1. Read story context from session
2. Implement to make tests pass
3. Refactor if needed
4. Hand off to reviewer
</workflow>

<skills>
- `/testing` - Run tests
- `/dev-patterns` - Common patterns
</skills>
"""
            + ("Additional context. " * 50)
        )

        # Behavior guide (~800 tokens = ~3200 chars)
        guides_dir = pf_dir / "guides"
        guides_dir.mkdir()
        (guides_dir / "agent-behavior.md").write_text(
            """# Agent Behavior Guide

<critical>
Session file is source of truth.
Never run tests directly.
Always emit handoff marker.
</critical>

## Workflow Reference

Standard: SM → TEA → Dev → Reviewer → SM

## Skills

- `/sprint` - Sprint management
- `/testing` - Test commands
- `/jira` - Jira operations

## Efficiency

- Parallelize independent operations
- Use subagents for specialized tasks
- Batch bash commands with &&
"""
            + ("Detailed behavior guidance. " * 80)
        )

        # Sidecars (~1200 tokens = ~4800 chars)
        sidecar_dir = pf_dir / "sidecars" / "dev"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text(
            """# Dev Patterns

## Common Patterns

### Error Handling
```typescript
try {
  await operation();
} catch (error) {
  logger.error('Operation failed', { error });
  throw new OperationError(error);
}
```

### Testing
```typescript
describe('Component', () => {
  it('should handle edge case', () => {
    expect(fn(null)).toBeUndefined();
  });
});
```
"""
            + ("Pattern documentation. " * 100)
        )

        (sidecar_dir / "gotchas.md").write_text(
            """# Dev Gotchas

1. Always read before write
2. Check symlinks before git add
3. Run tests before handoff
"""
            + ("Gotcha details. " * 50)
        )

        # Theme (~300 tokens = ~1200 chars for full persona)
        (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test-theme"}))
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test-theme.yaml").write_text(
            yaml.dump(
                {
                    "theme": {"name": "Test Theme", "user_title": "Developer"},
                    "agents": {
                        "dev": {
                            "character": "Rosie the Riveter",
                            "style": "Can-do wartime spirit, practical, determined, efficient, never gives up",
                            "role": "The implementation specialist who gets things done",
                            "quote": "We Can Do It!",
                            "trait": "Unwavering determination",
                            "motto": "Victory through effort and teamwork",
                        },
                        "sm": {"character": "Commander", "style": "s", "role": "r"},
                    },
                }
            )
        )

        # Sprint (~150 tokens)
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(
            yaml.dump(
                {
                    "sprint": {"number": 12, "goal": "Complete tier implementation"},
                    "epics": [
                        {"id": "epic-1", "stories": [{"id": "1-1", "status": "in_progress"}]}
                    ],
                }
            )
        )

        # Session (~200 tokens)
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "test-session.md").write_text("""# PROJ-12797: Python Prime Tier Support

## Story Context
- **ID:** PROJ-12797
- **Workflow:** tdd

## Workflow Phase
- **Phase:** green
- **Phase Owner:** dev
""")


# =============================================================================
# Integration Tests
# =============================================================================


class TestTierIntegration:
    """Integration tests for tier system."""

    def test_json_output_includes_tier(self, tmp_path: Path, capsys) -> None:
        """Test JSON output includes current tier."""
        import json

        from pf.prime.cli import prime

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = prime(
                agent_name="dev",
                tier="REFRESH",
                json_output=True,
                no_workflow=True,
                no_register=True,
                no_persona=True,
                project_root=tmp_path,
            )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        assert data.get("tier") == "REFRESH"

    def test_tier_with_workflow_detection(self, tmp_path: Path, capsys) -> None:
        """Test tier works correctly with workflow detection enabled."""
        from pf.prime.cli import prime

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(
            yaml.dump({"sprint": {"number": 12}, "epics": []})
        )

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="MINIMAL",
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()

        # Should include workflow state even in MINIMAL
        assert "Workflow State" in captured.out or "state:" in captured.out

    def test_tier_with_redirect_detection(self, tmp_path: Path, capsys) -> None:
        """Test tier works correctly with redirect detection."""
        from pf.prime.cli import prime

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "tea.md").write_text("# TEA Agent")

        # Workflow pointing to dev phase
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True)
        (workflows_dir / "tdd.yaml").write_text(
            yaml.dump({"workflow": {"phases": [{"name": "green", "agent": "dev"}]}})
        )

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "test-session.md").write_text("""# Test
- **Workflow:** tdd
- **Current Phase:** green
""")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = prime(
                agent_name="tea",
                tier="HANDOFF",
                no_register=True,
                no_persona=True,
                project_root=tmp_path,
            )

        assert result == 0
        captured = capsys.readouterr()

        # Should still detect redirect even in reduced tier
        assert "REDIRECT" in captured.out or "dev" in captured.out
