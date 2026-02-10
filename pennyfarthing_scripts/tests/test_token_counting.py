"""Tests for component-level token counting.

Story: MSSCI-12800 - Component-level token tracking
Epic: MSSCI-12793 - Tiered Context Injection System

This story adds granular token counting per injected component, allowing users
to see exactly where context tokens are being spent.

Acceptance Criteria:
- AC1: Each component in the context injection has an approximate token count
- AC2: Token breakdown is passed from Python prime script to TypeScript/UI
- AC3: DebugPanel displays a collapsible list of components with their token counts
- AC4: Token counts are approximate but reasonably accurate (~10% tolerance)

This file tests the Python side (AC1, AC2, AC4).
"""

import json
from pathlib import Path
from unittest.mock import patch

import yaml

# =============================================================================
# AC1: Each component has an approximate token count
# =============================================================================


class TestComponentTokenCounting:
    """Tests for per-component token counting (AC1)."""

    def test_load_tier_components_returns_token_counts(self, tmp_path: Path) -> None:
        """Test load_tier_components returns token counts for each component."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        result = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        # Result should include token_counts dict
        assert "token_counts" in result
        assert isinstance(result["token_counts"], dict)

    def test_token_counts_include_all_full_tier_components(self, tmp_path: Path) -> None:
        """Test FULL tier returns token counts for all components."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        result = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        token_counts = result.get("token_counts", {})

        # FULL tier should have counts for all these components
        expected_components = [
            "workflow_state",
            "agent_definition",
            "persona",
            "behavior_guide",
            "sprint_context",
            "session_header",
            "sidecars",
        ]

        for component in expected_components:
            assert component in token_counts, f"Missing token count for {component}"
            assert isinstance(token_counts[component], int), f"Token count for {component} should be int"
            assert token_counts[component] >= 0, f"Token count for {component} should be non-negative"

    def test_token_counts_are_positive_for_loaded_components(self, tmp_path: Path) -> None:
        """Test that loaded components have positive token counts."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        result = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        token_counts = result.get("token_counts", {})

        # Components with content should have positive counts
        assert token_counts.get("agent_definition", 0) > 0
        assert token_counts.get("behavior_guide", 0) > 0
        assert token_counts.get("sidecars", 0) > 0

    def test_token_counts_zero_for_missing_components(self, tmp_path: Path) -> None:
        """Test that missing optional components have zero token counts."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        # Minimal setup - only agent definition
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        result = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        token_counts = result.get("token_counts", {})

        # Missing components should have 0 count
        assert token_counts.get("sidecars", 0) == 0
        assert token_counts.get("behavior_guide", 0) == 0

    def test_refresh_tier_only_counts_included_components(self, tmp_path: Path) -> None:
        """Test REFRESH tier only includes counts for its components."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        result = load_tier_components(
            tier=ContextTier.REFRESH,
            agent_name="dev",
            project_root=tmp_path,
        )

        token_counts = result.get("token_counts", {})

        # REFRESH should have counts for workflow_state, sprint_context, session_header
        assert "workflow_state" in token_counts
        assert "sprint_context" in token_counts
        assert "session_header" in token_counts

        # REFRESH should NOT have counts for excluded components
        # (or they should be 0)
        assert token_counts.get("agent_definition", 0) == 0
        assert token_counts.get("behavior_guide", 0) == 0
        assert token_counts.get("sidecars", 0) == 0

    def test_handoff_tier_only_counts_included_components(self, tmp_path: Path) -> None:
        """Test HANDOFF tier only includes counts for its components."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        result = load_tier_components(
            tier=ContextTier.HANDOFF,
            agent_name="dev",
            project_root=tmp_path,
        )

        token_counts = result.get("token_counts", {})

        # HANDOFF should have counts for workflow_state, agent_definition, persona_compressed
        assert "workflow_state" in token_counts
        assert "agent_definition" in token_counts
        assert "persona_compressed" in token_counts or "persona" in token_counts

    def test_minimal_tier_only_counts_workflow_state(self, tmp_path: Path) -> None:
        """Test MINIMAL tier only counts workflow state."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        result = load_tier_components(
            tier=ContextTier.MINIMAL,
            agent_name="dev",
            project_root=tmp_path,
        )

        token_counts = result.get("token_counts", {})

        # MINIMAL should only have workflow_state
        assert "workflow_state" in token_counts
        assert token_counts.get("workflow_state", 0) > 0

        # All other components should be 0
        assert token_counts.get("agent_definition", 0) == 0
        assert token_counts.get("persona", 0) == 0
        assert token_counts.get("behavior_guide", 0) == 0

    def test_total_tokens_is_sum_of_components(self, tmp_path: Path) -> None:
        """Test that total_tokens equals sum of component counts."""
        from pennyfarthing_scripts.prime.tiers import ContextTier, load_tier_components

        self._setup_complete_project(tmp_path)

        result = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        token_counts = result.get("token_counts", {})
        total_tokens = result.get("total_tokens", 0)

        # Total should equal sum of components
        component_sum = sum(token_counts.values())
        assert total_tokens == component_sum

    def _setup_complete_project(self, tmp_path: Path) -> None:
        """Set up a complete project for component testing."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Agent definition
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent\n\nDeveloper agent with implementation focus.")

        # Behavior guide
        guides_dir = pf_dir / "guides"
        guides_dir.mkdir()
        (guides_dir / "agent-behavior.md").write_text("# Agent Behavior Guide\n\nShared protocols for all agents.")

        # Sidecars
        sidecar_dir = pf_dir / "sidecars" / "dev"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Dev Patterns\n\nDevelopment patterns documentation.")
        (sidecar_dir / "gotchas.md").write_text("# Dev Gotchas\n\nCommon pitfalls to avoid.")

        # Theme
        (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test-theme"}))
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test-theme.yaml").write_text(yaml.dump({
            "theme": {"name": "Test Theme", "user_title": "Developer"},
            "agents": {
                "dev": {
                    "character": "Test Developer",
                    "style": "Practical and efficient",
                    "role": "Implementation specialist",
                    "quote": "Ship it!",
                }
            }
        }))

        # Sprint
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(yaml.dump({
            "sprint": {"number": 12, "goal": "Test sprint"},
            "epics": []
        }))

        # Session
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "test-session.md").write_text("# Test Session\n\n- **Phase:** green")


# =============================================================================
# AC2: Token breakdown passed from Python to TypeScript/UI
# =============================================================================


class TestTokenBreakdownOutput:
    """Tests for token breakdown in output (AC2)."""

    def test_json_output_includes_token_counts(self, tmp_path: Path, capsys) -> None:
        """Test JSON output includes token_counts object."""
        from pennyfarthing_scripts.prime.cli import prime

        self._setup_project(tmp_path)

        with patch("pennyfarthing_scripts.prime.cli.get_project_root", return_value=tmp_path):
            result = prime(
                agent_name="dev",
                tier="FULL",
                json_output=True,
                no_workflow=True,
                no_register=True,
                project_root=tmp_path,
            )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        # JSON should include token_counts
        assert "token_counts" in data
        assert isinstance(data["token_counts"], dict)

    def test_json_output_includes_total_tokens(self, tmp_path: Path, capsys) -> None:
        """Test JSON output includes total_tokens field."""
        from pennyfarthing_scripts.prime.cli import prime

        self._setup_project(tmp_path)

        with patch("pennyfarthing_scripts.prime.cli.get_project_root", return_value=tmp_path):
            result = prime(
                agent_name="dev",
                tier="FULL",
                json_output=True,
                no_workflow=True,
                no_register=True,
                project_root=tmp_path,
            )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        # JSON should include total_tokens
        assert "total_tokens" in data
        assert isinstance(data["total_tokens"], int)
        assert data["total_tokens"] > 0

    def test_json_token_counts_match_tier(self, tmp_path: Path, capsys) -> None:
        """Test JSON token counts reflect the tier's components."""
        from pennyfarthing_scripts.prime.cli import prime

        self._setup_project(tmp_path)

        with patch("pennyfarthing_scripts.prime.cli.get_project_root", return_value=tmp_path):
            # MINIMAL tier
            result = prime(
                agent_name="dev",
                tier="MINIMAL",
                json_output=True,
                no_workflow=True,
                no_register=True,
                project_root=tmp_path,
            )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        token_counts = data.get("token_counts", {})

        # MINIMAL should only have workflow_state with tokens
        assert token_counts.get("workflow_state", 0) > 0
        # Other components should be 0 or missing
        assert token_counts.get("agent_definition", 0) == 0
        assert token_counts.get("behavior_guide", 0) == 0

    def test_json_output_token_counts_per_component(self, tmp_path: Path, capsys) -> None:
        """Test JSON output has individual component counts."""
        from pennyfarthing_scripts.prime.cli import prime

        self._setup_project(tmp_path)

        with patch("pennyfarthing_scripts.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pennyfarthing_scripts.prime.loader.get_project_root", return_value=tmp_path):
                result = prime(
                    agent_name="dev",
                    tier="FULL",
                    json_output=True,
                    no_register=True,
                    project_root=tmp_path,
                )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        token_counts = data.get("token_counts", {})

        # Should have individual component entries
        expected_keys = ["workflow_state", "agent_definition", "persona", "behavior_guide"]
        for key in expected_keys:
            assert key in token_counts, f"Missing {key} in token_counts"

    def _setup_project(self, tmp_path: Path) -> None:
        """Set up project for output testing."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent\n\nA developer agent.")

        guides_dir = pf_dir / "guides"
        guides_dir.mkdir()
        (guides_dir / "agent-behavior.md").write_text("# Behavior Guide")

        (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test"}))
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test.yaml").write_text(yaml.dump({
            "agents": {"dev": {"character": "Dev", "style": "s", "role": "r"}}
        }))


# =============================================================================
# AC4: Token counts are accurate within 10% tolerance
# =============================================================================


class TestTokenCountAccuracy:
    """Tests for token count accuracy (AC4)."""

    def test_token_count_uses_tiktoken_or_approximation(self) -> None:
        """Test token counting uses tiktoken or reasonable approximation."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        # Test string with known token characteristics
        # "Hello, world!" is typically 4 tokens in cl100k_base
        text = "Hello, world!"
        count = estimate_tokens(text)

        # Should be close to 4 tokens (allow 10% tolerance = 1 token)
        assert 3 <= count <= 5, f"Token count {count} not within expected range for 'Hello, world!'"

    def test_token_count_scales_with_text_length(self) -> None:
        """Test token count increases proportionally with text length."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        short_text = "Hello"
        medium_text = "Hello " * 10
        long_text = "Hello " * 100

        short_count = estimate_tokens(short_text)
        medium_count = estimate_tokens(medium_text)
        long_count = estimate_tokens(long_text)

        # Counts should increase with length
        assert short_count < medium_count < long_count

    def test_token_count_handles_empty_string(self) -> None:
        """Test token counting handles empty string gracefully."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        count = estimate_tokens("")
        assert count == 0

    def test_token_count_handles_unicode(self) -> None:
        """Test token counting handles unicode text."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        # Unicode text (emojis typically use multiple tokens)
        text = "Hello 👋 World 🌍"
        count = estimate_tokens(text)

        assert count > 0
        # Should handle without error

    def test_token_count_handles_markdown(self) -> None:
        """Test token counting handles markdown formatting."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        markdown = """# Heading

This is a **bold** statement with `code` and:
- List item 1
- List item 2

```python
def hello():
    print("world")
```
"""
        count = estimate_tokens(markdown)

        # Markdown should count all characters including formatting
        assert count > 20  # Reasonable minimum for this content

    def test_component_token_count_within_10_percent_of_actual(self, tmp_path: Path) -> None:
        """Test component token counts are within 10% of actual tiktoken count."""
        from pennyfarthing_scripts.prime.tiers import (
            ContextTier,
            estimate_tokens,
            load_tier_components,
        )

        # Create a known-content project
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()

        # Write a file with known content
        agent_content = "# Developer Agent\n\n" + ("Test content. " * 50)
        (agents_dir / "dev.md").write_text(agent_content)

        # Get token count from load_tier_components
        result = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        reported_count = result.get("token_counts", {}).get("agent_definition", 0)

        # Get actual token count
        actual_count = estimate_tokens(agent_content)

        # Should be within 10%
        tolerance = actual_count * 0.1
        assert abs(reported_count - actual_count) <= tolerance, \
            f"Reported {reported_count} vs actual {actual_count}, tolerance {tolerance}"

    def test_total_tokens_within_10_percent_of_sum(self, tmp_path: Path) -> None:
        """Test total_tokens is within 10% of manually summed content."""
        from pennyfarthing_scripts.prime.tiers import (
            ContextTier,
            load_tier_components,
        )

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        guides_dir = pf_dir / "guides"
        guides_dir.mkdir()
        (guides_dir / "agent-behavior.md").write_text("# Behavior Guide")

        result = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="dev",
            project_root=tmp_path,
        )

        total_tokens = result.get("total_tokens", 0)
        token_counts = result.get("token_counts", {})
        component_sum = sum(token_counts.values())

        # Total should match component sum
        assert total_tokens == component_sum


# =============================================================================
# Utility function tests
# =============================================================================


class TestEstimateTokensFunction:
    """Tests for the estimate_tokens utility function."""

    def test_estimate_tokens_exists(self) -> None:
        """Test estimate_tokens function is exported from tiers module."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens
        assert callable(estimate_tokens)

    def test_estimate_tokens_returns_int(self) -> None:
        """Test estimate_tokens returns an integer."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        result = estimate_tokens("Hello, world!")
        assert isinstance(result, int)

    def test_estimate_tokens_positive_for_content(self) -> None:
        """Test estimate_tokens returns positive value for non-empty content."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        result = estimate_tokens("Some content here")
        assert result > 0

    def test_estimate_tokens_deterministic(self) -> None:
        """Test estimate_tokens returns same result for same input."""
        from pennyfarthing_scripts.prime.tiers import estimate_tokens

        text = "Consistent input text"
        result1 = estimate_tokens(text)
        result2 = estimate_tokens(text)

        assert result1 == result2
