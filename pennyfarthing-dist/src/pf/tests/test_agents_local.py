"""Tests for agents-local/ directory support in agent loader.

Story 150-1: Add agents-local/ directory with loader priority over agents/

Acceptance Criteria:
1. Create .pennyfarthing/agents-local/ directory structure as a protected location
2. Update pf init to preserve existing agents-local/ files without overwriting
3. Modify load_agent_definition() to check agents-local/{name}.md BEFORE agents/{name}.md
4. Loader fallback: agents-local/{name}.md → agents/{name}.md → not found
5. All agent loading operations respect the new priority order
6. Custom agents in agents-local/ receive full priming treatment (persona, sidecars, skills)
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from pf.prime.loader import load_agent_definition


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def project_with_agents(tmp_path: Path) -> Path:
    """Create a project structure with both agents/ and agents-local/ dirs."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Standard agents directory (simulates symlinked from pennyfarthing-dist)
    agents_dir = pf_dir / "agents"
    agents_dir.mkdir()
    (agents_dir / "dev.md").write_text("# Dev Agent (built-in)\nBuilt-in dev agent")
    (agents_dir / "tea.md").write_text("# TEA Agent (built-in)\nBuilt-in tea agent")
    (agents_dir / "sm.md").write_text("# SM Agent (built-in)\nBuilt-in sm agent")

    # agents-local directory (consumer overrides/custom agents)
    agents_local_dir = pf_dir / "agents-local"
    agents_local_dir.mkdir()

    return tmp_path


@pytest.fixture()
def project_with_local_override(project_with_agents: Path) -> Path:
    """Project where agents-local/ overrides a built-in agent."""
    local_dir = project_with_agents / ".pennyfarthing" / "agents-local"
    (local_dir / "dev.md").write_text(
        "# Dev Agent (custom override)\nCustom dev agent with extra duties"
    )
    return project_with_agents


@pytest.fixture()
def project_with_custom_agent(project_with_agents: Path) -> Path:
    """Project with a custom agent in agents-local/ that doesn't exist in agents/."""
    local_dir = project_with_agents / ".pennyfarthing" / "agents-local"
    (local_dir / "data-engineer.md").write_text(
        "# Data Engineer Agent\n<role>Data pipeline management</role>"
    )
    return project_with_agents


# ---------------------------------------------------------------------------
# AC 3: load_agent_definition() checks agents-local/ BEFORE agents/
# ---------------------------------------------------------------------------


class TestAgentsLocalPriority:
    """AC 3: agents-local/ has priority over agents/ in the loader."""

    def test_local_override_takes_priority(self, project_with_local_override: Path) -> None:
        """When both agents-local/dev.md and agents/dev.md exist,
        the loader MUST return the local version."""
        result = load_agent_definition("dev", project_with_local_override)
        assert result is not None
        assert "custom override" in result
        assert "built-in" not in result.lower() or "custom override" in result

    def test_local_override_content_is_complete(self, project_with_local_override: Path) -> None:
        """Local override returns the FULL content of agents-local/ file,
        not a merge of local + built-in."""
        result = load_agent_definition("dev", project_with_local_override)
        assert result is not None
        assert result == "# Dev Agent (custom override)\nCustom dev agent with extra duties"


# ---------------------------------------------------------------------------
# AC 4: Fallback chain — agents-local/ → agents/ → not found
# ---------------------------------------------------------------------------


class TestAgentsLocalFallback:
    """AC 4: Loader falls back from agents-local/ to agents/ to None."""

    def test_falls_back_to_builtin_when_no_local(self, project_with_agents: Path) -> None:
        """Agent in agents/ but NOT in agents-local/ → returns built-in."""
        result = load_agent_definition("tea", project_with_agents)
        assert result is not None
        assert "built-in" in result.lower()

    def test_returns_none_when_agent_not_found(self, project_with_agents: Path) -> None:
        """Agent not in agents-local/ or agents/ → returns None."""
        with patch("pf.prime.loader.get_dist_root", return_value=None):
            result = load_agent_definition("nonexistent", project_with_agents)
        assert result is None

    def test_custom_agent_only_in_local(self, project_with_custom_agent: Path) -> None:
        """Agent in agents-local/ but NOT in agents/ → returns local."""
        result = load_agent_definition("data-engineer", project_with_custom_agent)
        assert result is not None
        assert "Data Engineer" in result


# ---------------------------------------------------------------------------
# AC 5: All agent loading operations respect priority order
# ---------------------------------------------------------------------------


class TestAllLoadingOperationsRespectPriority:
    """AC 5: The priority order is respected across all code paths."""

    def test_dist_root_fallback_still_works(self, tmp_path: Path) -> None:
        """When agents-local/ and agents/ both miss, dist_root is still tried."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "agents-local").mkdir()
        (pf_dir / "agents").mkdir()

        # Create dist_root with the agent
        dist_root = tmp_path / "pennyfarthing-dist"
        agents_dist = dist_root / "agents"
        agents_dist.mkdir(parents=True)
        (agents_dist / "reviewer.md").write_text("# Reviewer (dist)")

        with patch("pf.prime.loader.get_dist_root", return_value=dist_root):
            result = load_agent_definition("reviewer", tmp_path)

        assert result is not None
        assert "Reviewer (dist)" in result

    def test_local_beats_dist_root(self, tmp_path: Path) -> None:
        """agents-local/ takes priority over pennyfarthing-dist/agents/ too."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        local_dir = pf_dir / "agents-local"
        local_dir.mkdir()
        (local_dir / "reviewer.md").write_text("# Reviewer (local)")

        (pf_dir / "agents").mkdir()
        (pf_dir / "agents" / "reviewer.md").write_text("# Reviewer (builtin)")

        dist_root = tmp_path / "pennyfarthing-dist"
        agents_dist = dist_root / "agents"
        agents_dist.mkdir(parents=True)
        (agents_dist / "reviewer.md").write_text("# Reviewer (dist)")

        with patch("pf.prime.loader.get_dist_root", return_value=dist_root):
            result = load_agent_definition("reviewer", tmp_path)

        assert result is not None
        assert "Reviewer (local)" in result

    def test_builtin_beats_dist_root(self, tmp_path: Path) -> None:
        """agents/ (symlinked) still takes priority over dist_root fallback."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "agents-local").mkdir()  # empty local dir
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "reviewer.md").write_text("# Reviewer (builtin)")

        dist_root = tmp_path / "pennyfarthing-dist"
        agents_dist = dist_root / "agents"
        agents_dist.mkdir(parents=True)
        (agents_dist / "reviewer.md").write_text("# Reviewer (dist)")

        with patch("pf.prime.loader.get_dist_root", return_value=dist_root):
            result = load_agent_definition("reviewer", tmp_path)

        assert result is not None
        assert "Reviewer (builtin)" in result

    def test_missing_agents_local_dir_is_not_error(self, tmp_path: Path) -> None:
        """Project without agents-local/ directory still loads agents normally."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent (built-in)")
        # No agents-local/ directory at all

        result = load_agent_definition("dev", tmp_path)
        assert result is not None
        assert "Dev Agent" in result


# ---------------------------------------------------------------------------
# AC 1: .pennyfarthing/agents-local/ as protected directory structure
# ---------------------------------------------------------------------------


class TestAgentsLocalDirectoryStructure:
    """AC 1: agents-local/ exists as a protected directory, like gates-local/."""

    def test_agents_local_is_not_in_content_dirs(self) -> None:
        """agents-local/ must NOT appear in _CONTENT_DIRS — it's user-owned,
        not framework-managed. pf init must not copy/overwrite it."""
        from pf.init.core import _CONTENT_DIRS

        assert "agents-local" not in _CONTENT_DIRS

    def test_agents_local_is_not_in_dogfooding_symlinks(self) -> None:
        """agents-local/ must NOT be a dogfooding symlink target.
        It's a local-only directory, never symlinked to pennyfarthing-dist/."""
        from pf.init.core import _DOGFOODING_SYMLINKS

        for link_path, target in _DOGFOODING_SYMLINKS.items():
            assert "agents-local" not in link_path, (
                f"agents-local/ must not be a dogfooding symlink: {link_path} → {target}"
            )
            assert "agents-local" not in target, (
                f"agents-local/ must not be a dogfooding symlink target: {link_path} → {target}"
            )


# ---------------------------------------------------------------------------
# AC 2: pf init preserves existing agents-local/ files
# ---------------------------------------------------------------------------


class TestPfInitPreservesAgentsLocal:
    """AC 2: pf init must not overwrite agents-local/ contents."""

    def test_init_creates_agents_local_directory(self, tmp_path: Path) -> None:
        """pf init should create .pennyfarthing/agents-local/ if it doesn't exist."""
        from pf.init.core import _PENNYFARTHING_DIRS

        # agents-local should be in the list of directories pf init creates
        assert any("agents-local" in d for d in _PENNYFARTHING_DIRS), (
            "agents-local must be in _PENNYFARTHING_DIRS so pf init creates it"
        )

    def test_init_preserves_existing_local_agent(self, tmp_path: Path) -> None:
        """Running pf init when agents-local/ already has files must NOT
        delete or overwrite those files."""
        from pf.init.core import init_project

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        local_dir = pf_dir / "agents-local"
        local_dir.mkdir()
        custom_agent = local_dir / "my-agent.md"
        custom_agent.write_text("# My Custom Agent\nDo not overwrite me")

        # Create minimal dist_root for init
        dist_root = tmp_path / "pennyfarthing-dist"
        dist_root.mkdir()
        (dist_root / "agents").mkdir()
        (dist_root / "commands").mkdir()
        (dist_root / "skills").mkdir()

        # Run init — it should preserve agents-local/my-agent.md
        init_project(tmp_path, dist_root)

        assert custom_agent.exists(), "pf init deleted the custom agent file"
        content = custom_agent.read_text()
        assert "Do not overwrite me" in content, "pf init overwrote the custom agent content"


# ---------------------------------------------------------------------------
# AC 6: Custom agents receive full priming treatment
# ---------------------------------------------------------------------------


class TestCustomAgentFullPriming:
    """AC 6: Custom agents in agents-local/ get persona, sidecars, skills."""

    def test_custom_agent_loaded_by_prime(self, project_with_custom_agent: Path) -> None:
        """A custom agent defined in agents-local/ must be loadable
        by the prime system, same as built-in agents."""
        result = load_agent_definition("data-engineer", project_with_custom_agent)
        assert result is not None
        assert "<role>" in result, (
            "Custom agent must have standard agent markdown structure"
        )

    def test_sidecars_work_for_custom_agent(self, project_with_custom_agent: Path) -> None:
        """Sidecars (patterns, gotchas, decisions) load for custom agents too."""
        from pf.prime.loader import load_sidecars

        # Create sidecar files for the custom agent
        sidecar_dir = (
            project_with_custom_agent / ".pennyfarthing" / "sidecars" / "data-engineer"
        )
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Data Engineer Patterns\nETL best practices")
        (sidecar_dir / "gotchas.md").write_text("# Data Engineer Gotchas\nWatch for schema drift")

        sidecars = load_sidecars("data-engineer", project_with_custom_agent)
        assert "patterns.md" in sidecars
        assert "gotchas.md" in sidecars
        assert "ETL best practices" in sidecars["patterns.md"]
        assert "schema drift" in sidecars["gotchas.md"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestAgentsLocalEdgeCases:
    """Edge cases and boundary conditions for agents-local/ support."""

    def test_empty_agents_local_dir(self, tmp_path: Path) -> None:
        """Empty agents-local/ directory doesn't break anything."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "agents-local").mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev (built-in)")

        result = load_agent_definition("dev", tmp_path)
        assert result is not None
        assert "Dev (built-in)" in result

    def test_agents_local_with_subdirectories(self, tmp_path: Path) -> None:
        """agents-local/ may contain subdirectories (e.g., templates/) that
        should not interfere with agent lookup."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        local_dir = pf_dir / "agents-local"
        local_dir.mkdir()
        (local_dir / "templates").mkdir()
        (local_dir / "my-agent.md").write_text("# My Agent")

        result = load_agent_definition("my-agent", tmp_path)
        assert result is not None
        assert "My Agent" in result

    def test_agent_name_with_hyphens(self, project_with_custom_agent: Path) -> None:
        """Agent names with hyphens (e.g., 'data-engineer') resolve correctly."""
        result = load_agent_definition("data-engineer", project_with_custom_agent)
        assert result is not None

    def test_local_agent_file_is_empty(self, tmp_path: Path) -> None:
        """An empty file in agents-local/ returns empty string, not None.
        The file EXISTS — it's just empty. None means not found."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        local_dir = pf_dir / "agents-local"
        local_dir.mkdir()
        (local_dir / "empty-agent.md").write_text("")

        result = load_agent_definition("empty-agent", tmp_path)
        # The file exists and was read — result should be the empty string
        assert result is not None
        assert result == ""

    def test_three_tier_fallback_order(self, tmp_path: Path) -> None:
        """Complete fallback chain: agents-local → agents → dist_root → None.
        Each tier only checked if the previous missed."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "agents-local").mkdir()
        (pf_dir / "agents").mkdir()

        dist_root = tmp_path / "pennyfarthing-dist"
        (dist_root / "agents").mkdir(parents=True)

        with patch("pf.prime.loader.get_dist_root", return_value=dist_root):
            # No agent anywhere → None
            assert load_agent_definition("ghost", tmp_path) is None

            # Only in dist_root
            (dist_root / "agents" / "ghost.md").write_text("dist")
            assert load_agent_definition("ghost", tmp_path) == "dist"

            # Add to agents/ → agents/ wins over dist_root
            (pf_dir / "agents" / "ghost.md").write_text("builtin")
            assert load_agent_definition("ghost", tmp_path) == "builtin"

            # Add to agents-local/ → agents-local/ wins over all
            (pf_dir / "agents-local" / "ghost.md").write_text("local")
            assert load_agent_definition("ghost", tmp_path) == "local"


# ---------------------------------------------------------------------------
# Rule enforcement: Python lang-review checklist
# ---------------------------------------------------------------------------


class TestRuleEnforcement:
    """Tests derived from Python lang-review rules applicable to this story."""

    def test_load_agent_definition_has_type_annotations(self) -> None:
        """Rule #3: Public functions must have type annotations.
        load_agent_definition() must annotate params and return type."""
        import inspect

        sig = inspect.signature(load_agent_definition)

        # Return annotation must exist
        assert sig.return_annotation is not inspect.Parameter.empty, (
            "load_agent_definition() must have a return type annotation"
        )

        # Parameters must be annotated
        for name, param in sig.parameters.items():
            assert param.annotation is not inspect.Parameter.empty, (
                f"Parameter '{name}' of load_agent_definition() must be type-annotated"
            )

    def test_loader_uses_pathlib_not_string_paths(self) -> None:
        """Rule #5: Path handling must use pathlib, not string concatenation."""
        import inspect

        source = inspect.getsource(load_agent_definition)
        # Should not use os.path.join for path construction
        assert "os.path.join" not in source, (
            "load_agent_definition() should use pathlib.Path, not os.path.join"
        )
        # Should not use string concatenation for paths
        assert '+ "/"' not in source and "+ '/' " not in source, (
            "load_agent_definition() should use Path / operator, not string concatenation"
        )
