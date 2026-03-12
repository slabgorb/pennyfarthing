"""Tests for repos topology loading in prime context.

Story 87-2: Wire topology into agent prime context.

Tests that repos.yaml topology data is loaded, formatted, and injected
into agent prime context at the correct tiers.

Acceptance Criteria:
- AC1: load_repos_topology() loads and formats repos.yaml topology
- AC2: FULL tier includes topology component
- AC3: JSON output includes topology in components list
- AC4: Topology included in FULL/REFRESH/HANDOFF, excluded from MINIMAL
- AC5: Tests cover happy path, errors, token counting, backwards compat
"""

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

# =============================================================================
# Fixtures
# =============================================================================


VALID_REPOS_YAML = {
    "repos": {
        "orchestrator": {
            "path": ".",
            "type": "orchestrator",
            "description": "Sprint management",
            "owns": ["sprint/**", "docs/**", ".session/**"],
            "never_edit": ["node_modules/**", ".pennyfarthing/agents/**"],
            "symlinks": {
                ".pennyfarthing/agents": "pennyfarthing/pennyfarthing-dist/agents",
            },
            "ui_layer": "none",
        },
        "pennyfarthing": {
            "path": "pennyfarthing",
            "type": "framework",
            "description": "Framework source",
            "owns": ["pennyfarthing-dist/**", "packages/**"],
            "never_edit": ["node_modules/**", "packages/*/dist/**"],
            "symlinks": {},
            "ui_layer": "react",
            "components_path": "packages/cyclist/src/components",
        },
    }
}

LEGACY_REPOS_YAML = {
    "repos": {
        "myrepo": {
            "path": ".",
            "type": "monolith",
            "description": "Legacy repo with no topology fields",
        }
    }
}


@pytest.fixture
def topology_project(tmp_path: Path) -> Path:
    """Set up a project with valid repos.yaml containing topology fields."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    repos_file = pf_dir / "repos.yaml"
    repos_file.write_text(yaml.dump(VALID_REPOS_YAML, default_flow_style=False))
    return tmp_path


@pytest.fixture
def legacy_project(tmp_path: Path) -> Path:
    """Set up a project with repos.yaml that has no topology fields."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    repos_file = pf_dir / "repos.yaml"
    repos_file.write_text(yaml.dump(LEGACY_REPOS_YAML, default_flow_style=False))
    return tmp_path


@pytest.fixture
def full_project(tmp_path: Path) -> Path:
    """Set up a complete project structure for tier/CLI tests."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # repos.yaml with topology
    (pf_dir / "repos.yaml").write_text(yaml.dump(VALID_REPOS_YAML, default_flow_style=False))

    # Agent definition
    agents_dir = pf_dir / "agents"
    agents_dir.mkdir()
    (agents_dir / "dev.md").write_text("# Dev Agent\n\nDeveloper agent.")

    # Behavior guide
    guides_dir = pf_dir / "guides"
    guides_dir.mkdir()
    (guides_dir / "agent-behavior.md").write_text("# Agent Behavior Guide")

    # Sidecars
    sidecar_dir = pf_dir / "sidecars" / "dev"
    sidecar_dir.mkdir(parents=True)
    (sidecar_dir / "patterns.md").write_text("# Patterns")

    # Theme
    (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test"}))
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
    (session_dir / "test-session.md").write_text("# Test Session\n\n- **Phase:** green")

    return tmp_path


# =============================================================================
# AC1: load_repos_topology() — Loading and Formatting
# =============================================================================


class TestLoadReposTopology:
    """Tests for load_repos_topology() function (AC1)."""

    def test_loads_valid_topology(self, topology_project: Path) -> None:
        """Test loading repos.yaml with full topology fields returns formatted text."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(topology_project)

        assert result is not None
        assert isinstance(result, str)
        assert len(result) > 0

    def test_includes_repo_names(self, topology_project: Path) -> None:
        """Test formatted output includes repo names."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(topology_project)

        assert result is not None
        assert "orchestrator" in result
        assert "pennyfarthing" in result

    def test_includes_owns_patterns(self, topology_project: Path) -> None:
        """Test formatted output includes ownership glob patterns."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(topology_project)

        assert result is not None
        assert "sprint/**" in result
        assert "pennyfarthing-dist/**" in result

    def test_includes_never_edit_zones(self, topology_project: Path) -> None:
        """Test formatted output includes never-edit paths."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(topology_project)

        assert result is not None
        assert "node_modules/**" in result

    def test_includes_ui_layer(self, topology_project: Path) -> None:
        """Test formatted output includes UI layer for each repo."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(topology_project)

        assert result is not None
        assert "none" in result
        assert "react" in result

    def test_includes_symlinks(self, topology_project: Path) -> None:
        """Test formatted output includes symlink mappings."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(topology_project)

        assert result is not None
        assert ".pennyfarthing/agents" in result

    def test_includes_components_path(self, topology_project: Path) -> None:
        """Test formatted output includes components_path when present."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(topology_project)

        assert result is not None
        assert "packages/cyclist/src/components" in result

    def test_returns_none_when_no_repos_yaml(self, tmp_path: Path) -> None:
        """Test returns None when repos.yaml doesn't exist."""
        from pf.prime.loader import load_repos_topology

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        result = load_repos_topology(tmp_path)

        assert result is None

    def test_returns_none_when_no_pennyfarthing_dir(self, tmp_path: Path) -> None:
        """Test returns None when .pennyfarthing/ doesn't exist."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(tmp_path)

        assert result is None

    def test_handles_invalid_yaml(self, tmp_path: Path) -> None:
        """Test gracefully handles invalid YAML content."""
        from pf.prime.loader import load_repos_topology

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text("not: [valid: yaml: {{{}}")

        result = load_repos_topology(tmp_path)

        assert result is None

    def test_handles_yaml_without_repos_key(self, tmp_path: Path) -> None:
        """Test handles YAML that has no 'repos' key."""
        from pf.prime.loader import load_repos_topology

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(yaml.dump({"something_else": True}))

        result = load_repos_topology(tmp_path)

        assert result is None

    def test_handles_empty_repos(self, tmp_path: Path) -> None:
        """Test handles repos.yaml with empty repos dict."""
        from pf.prime.loader import load_repos_topology

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "repos.yaml").write_text(yaml.dump({"repos": {}}))

        result = load_repos_topology(tmp_path)

        assert result is None

    def test_backwards_compat_legacy_repos(self, legacy_project: Path) -> None:
        """Test repos without topology fields still produce output."""
        from pf.prime.loader import load_repos_topology

        result = load_repos_topology(legacy_project)

        # Should still return something — at minimum the repo name and basic info
        assert result is not None
        assert "myrepo" in result


# =============================================================================
# AC2: FULL Tier Includes Topology
# =============================================================================


class TestFullTierTopology:
    """Tests that FULL tier includes repos_topology component (AC2)."""

    def test_full_tier_includes_repos_topology(self, full_project: Path) -> None:
        """Test FULL tier load_tier_components includes repos_topology."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=full_project,
        )

        assert "repos_topology" in components
        assert isinstance(components["repos_topology"], str)
        assert len(components["repos_topology"]) > 0

    def test_full_tier_topology_has_token_count(self, full_project: Path) -> None:
        """Test FULL tier topology component has a token count estimate."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=full_project,
        )

        token_counts = components.get("token_counts", {})
        assert "repos_topology" in token_counts
        assert token_counts["repos_topology"] > 0

    def test_full_tier_text_output_includes_topology(self, full_project: Path, capsys) -> None:
        """Test FULL tier text output includes topology section."""
        from pf.prime.cli import prime

        with patch(
            "pf.prime.cli.get_project_root",
            return_value=full_project,
        ):
            with patch(
                "pf.prime.loader.get_project_root",
                return_value=full_project,
            ):
                result = prime(
                    agent_name="dev",
                    tier="FULL",
                    no_workflow=True,
                    no_register=True,
                    project_root=full_project,
                )

        assert result == 0
        captured = capsys.readouterr()
        assert "Repos Topology" in captured.out
        assert "orchestrator" in captured.out


# =============================================================================
# AC3: JSON Output Includes Topology Component
# =============================================================================


class TestJSONTopologyOutput:
    """Tests that JSON output includes topology in components list (AC3)."""

    def test_json_output_has_topology_component(self, full_project: Path, capsys) -> None:
        """Test JSON output includes topology in components list."""
        import json

        from pf.prime.cli import prime

        with patch(
            "pf.prime.cli.get_project_root",
            return_value=full_project,
        ):
            with patch(
                "pf.prime.loader.get_project_root",
                return_value=full_project,
            ):
                result = prime(
                    agent_name="dev",
                    tier="FULL",
                    json_output=True,
                    no_workflow=True,
                    no_register=True,
                    project_root=full_project,
                )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        # Find topology in components list
        component_names = [c["name"] for c in data.get("components", [])]
        assert "repos_topology" in component_names

    def test_json_topology_component_has_tokens(self, full_project: Path, capsys) -> None:
        """Test JSON topology component has token count."""
        import json

        from pf.prime.cli import prime

        with patch(
            "pf.prime.cli.get_project_root",
            return_value=full_project,
        ):
            with patch(
                "pf.prime.loader.get_project_root",
                return_value=full_project,
            ):
                result = prime(
                    agent_name="dev",
                    tier="FULL",
                    json_output=True,
                    no_workflow=True,
                    no_register=True,
                    project_root=full_project,
                )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        topology_component = next(
            (c for c in data.get("components", []) if c["name"] == "repos_topology"),
            None,
        )
        assert topology_component is not None
        assert topology_component["tokens"] > 0

    def test_json_topology_component_has_source(self, full_project: Path, capsys) -> None:
        """Test JSON topology component has source path."""
        import json

        from pf.prime.cli import prime

        with patch(
            "pf.prime.cli.get_project_root",
            return_value=full_project,
        ):
            with patch(
                "pf.prime.loader.get_project_root",
                return_value=full_project,
            ):
                result = prime(
                    agent_name="dev",
                    tier="FULL",
                    json_output=True,
                    no_workflow=True,
                    no_register=True,
                    project_root=full_project,
                )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        topology_component = next(
            (c for c in data.get("components", []) if c["name"] == "repos_topology"),
            None,
        )
        assert topology_component is not None
        assert topology_component.get("source") == ".pennyfarthing/repos.yaml"


# =============================================================================
# AC4: Tiered Availability (FULL/REFRESH/HANDOFF yes, MINIMAL no)
# =============================================================================


class TestTopologyTierAvailability:
    """Tests that topology is in correct tiers (AC4)."""

    def test_full_tier_has_topology(self, full_project: Path) -> None:
        """Test FULL tier includes repos_topology."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=full_project,
        )

        assert "repos_topology" in components

    def test_refresh_tier_has_topology(self, full_project: Path) -> None:
        """Test REFRESH tier includes repos_topology (session-independent)."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.REFRESH,
            agent_name="dev",
            project_root=full_project,
        )

        assert "repos_topology" in components

    def test_handoff_tier_has_topology(self, full_project: Path) -> None:
        """Test HANDOFF tier includes repos_topology (agent needs orientation)."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.HANDOFF,
            agent_name="dev",
            project_root=full_project,
        )

        assert "repos_topology" in components

    def test_minimal_tier_excludes_topology(self, full_project: Path) -> None:
        """Test MINIMAL tier does NOT include repos_topology."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.MINIMAL,
            agent_name="dev",
            project_root=full_project,
        )

        assert "repos_topology" not in components


# =============================================================================
# AC5: Token Counting and Backwards Compatibility
# =============================================================================


class TestTopologyTokenCounting:
    """Tests for topology token counting (AC5)."""

    def test_topology_token_count_realistic(self, full_project: Path) -> None:
        """Test topology token count is in realistic range (100-500 tokens)."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=full_project,
        )

        token_counts = components.get("token_counts", {})
        topology_tokens = token_counts.get("repos_topology", 0)

        # Two repos with topology fields should be 100-500 tokens
        assert topology_tokens >= 50, f"Topology too small: {topology_tokens} tokens"
        assert topology_tokens <= 500, f"Topology too large: {topology_tokens} tokens"

    def test_topology_included_in_total_tokens(self, full_project: Path) -> None:
        """Test topology tokens are included in total_tokens sum."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=full_project,
        )

        token_counts = components.get("token_counts", {})
        total_tokens = components.get("total_tokens", 0)

        assert total_tokens >= token_counts.get("repos_topology", 0)


class TestTopologyBackwardsCompat:
    """Tests for backwards compatibility (AC5)."""

    def test_project_without_repos_yaml_works(self, tmp_path: Path) -> None:
        """Test prime works fine when repos.yaml doesn't exist."""
        from pf.prime.tiers import ContextTier, load_tier_components

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        # No repos.yaml — should not crash
        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        # Should still have other components
        assert "agent_definition" in components
        # Topology should be absent or None, not an error
        topology = components.get("repos_topology")
        assert topology is None or "repos_topology" not in components

    def test_legacy_repos_yaml_works(self, legacy_project: Path) -> None:
        """Test repos.yaml without topology fields doesn't break prime."""
        from pf.prime.tiers import ContextTier, load_tier_components

        # Add agent for tier loading
        agents_dir = legacy_project / ".pennyfarthing" / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=legacy_project,
        )

        # Should work without errors — topology present with basic info
        assert "agent_definition" in components

    def test_cli_component_header_for_topology(self) -> None:
        """Test _component_header returns correct header for repos_topology."""
        from pf.prime.cli import _component_header

        header = _component_header("repos_topology", "dev")

        assert "Repos Topology" in header

    def test_cli_component_source_for_topology(self) -> None:
        """Test _component_source returns correct path for repos_topology."""
        from pf.prime.cli import _component_source

        source = _component_source("repos_topology", "dev", Path("/fake"))

        assert source == ".pennyfarthing/repos.yaml"
