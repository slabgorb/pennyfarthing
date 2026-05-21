"""Validate per-role tool restrictions for native agent definitions (Story 143-12).

Epic: 143 (Native Subagent Migration)
Story: 143-12 — Validate per-role tool restrictions

Validates that native agent definitions in agents/native/ have correct
tool restrictions matching each role's intended capabilities:
- Read-only roles (reviewer, architect, pm, ba, ux-designer) must NOT have Write/Edit
- Write-capable roles (dev, tea, devops, orchestrator, tech-writer) MUST have Write/Edit
- All roles must have Read
- Only valid tool names are allowed
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.validate.adapters.agent import (
    READ_ONLY_ROLES,
    VALID_TOOLS,
    WRITE_ROLES,
    run,
    validate_native_agent,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_native(tmp_path: Path, name: str, content: str) -> Path:
    """Write a native agent file and return its path."""
    native_dir = tmp_path / "agents" / "native"
    native_dir.mkdir(parents=True, exist_ok=True)
    path = native_dir / f"{name}.md"
    path.write_text(content)
    return path


def _minimal_native(
    *,
    name: str = "dev",
    model: str = "opus",
    tools: list[str] | None = None,
) -> str:
    """Build a minimal valid native agent file."""
    if tools is None:
        tools = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent", "Skill"]
    tools_yaml = "\n".join(f"  - {t}" for t in tools)
    return (
        f"---\n"
        f"name: {name}\n"
        f"description: Test agent\n"
        f"model: {model}\n"
        f"allowed-tools:\n{tools_yaml}\n"
        f"---\n\n"
        f"# {name.title()} Agent\n"
    )


# ---------------------------------------------------------------------------
# Required frontmatter fields
# ---------------------------------------------------------------------------


class TestRequiredFields:
    """Native agents must have name, description, model, allowed-tools."""

    def test_valid_native_agent_passes(self, tmp_path: Path) -> None:
        path = _write_native(tmp_path, "dev", _minimal_native())
        errors, warnings = validate_native_agent(path)
        assert not errors

    def test_missing_frontmatter_errors(self, tmp_path: Path) -> None:
        path = _write_native(tmp_path, "dev", "# Dev Agent\nNo frontmatter.\n")
        errors, _ = validate_native_agent(path)
        assert any("Missing or invalid" in e for e in errors)

    def test_missing_allowed_tools_errors(self, tmp_path: Path) -> None:
        content = "---\nname: dev\ndescription: Test\nmodel: opus\n---\n# Dev\n"
        path = _write_native(tmp_path, "dev", content)
        errors, _ = validate_native_agent(path)
        assert any("allowed-tools" in e for e in errors)

    def test_missing_name_errors(self, tmp_path: Path) -> None:
        content = (
            "---\ndescription: Test\nmodel: opus\n"
            "allowed-tools:\n  - Read\n---\n# Dev\n"
        )
        path = _write_native(tmp_path, "dev", content)
        errors, _ = validate_native_agent(path)
        assert any("name" in e for e in errors)

    def test_missing_description_errors(self, tmp_path: Path) -> None:
        content = (
            "---\nname: dev\nmodel: opus\n"
            "allowed-tools:\n  - Read\n---\n# Dev\n"
        )
        path = _write_native(tmp_path, "dev", content)
        errors, _ = validate_native_agent(path)
        assert any("description" in e for e in errors)


# ---------------------------------------------------------------------------
# Model validation
# ---------------------------------------------------------------------------


class TestModelValidation:
    """Native agents should use opus model."""

    def test_opus_model_no_warning(self, tmp_path: Path) -> None:
        path = _write_native(tmp_path, "dev", _minimal_native(model="opus"))
        _, warnings = validate_native_agent(path)
        assert not any("model" in w.lower() for w in warnings)

    def test_non_opus_model_warns(self, tmp_path: Path) -> None:
        path = _write_native(tmp_path, "dev", _minimal_native(model="haiku"))
        _, warnings = validate_native_agent(path)
        assert any("opus" in w for w in warnings)


# ---------------------------------------------------------------------------
# Tool validation
# ---------------------------------------------------------------------------


class TestToolValidation:
    """All agents must have Read; only valid tool names allowed."""

    def test_missing_read_errors(self, tmp_path: Path) -> None:
        path = _write_native(
            tmp_path, "dev", _minimal_native(tools=["Write", "Edit", "Bash"])
        )
        errors, _ = validate_native_agent(path)
        assert any("Read" in e for e in errors)

    def test_unknown_tool_errors(self, tmp_path: Path) -> None:
        path = _write_native(
            tmp_path, "dev", _minimal_native(tools=["Read", "Write", "Edit", "FakeTool"])
        )
        errors, _ = validate_native_agent(path)
        assert any("FakeTool" in e for e in errors)

    def test_all_valid_tools_accepted(self, tmp_path: Path) -> None:
        path = _write_native(
            tmp_path, "dev", _minimal_native(tools=sorted(VALID_TOOLS))
        )
        errors, _ = validate_native_agent(path)
        assert not any("Unknown" in e for e in errors)

    def test_non_list_allowed_tools_errors(self, tmp_path: Path) -> None:
        content = (
            "---\nname: dev\ndescription: Test\nmodel: opus\n"
            "allowed-tools: Read\n---\n# Dev\n"
        )
        path = _write_native(tmp_path, "dev", content)
        errors, _ = validate_native_agent(path)
        assert any("YAML list" in e for e in errors)


# ---------------------------------------------------------------------------
# Read-only role restrictions
# ---------------------------------------------------------------------------


class TestReadOnlyRoles:
    """Read-only roles must NOT have Write or Edit."""

    @pytest.mark.parametrize("role", sorted(READ_ONLY_ROLES))
    def test_read_only_with_write_errors(self, tmp_path: Path, role: str) -> None:
        path = _write_native(
            tmp_path, role,
            _minimal_native(name=role, tools=["Read", "Write", "Bash", "Glob", "Grep"]),
        )
        errors, _ = validate_native_agent(path)
        assert any("Write" in e and "must not" in e for e in errors)

    @pytest.mark.parametrize("role", sorted(READ_ONLY_ROLES))
    def test_read_only_with_edit_errors(self, tmp_path: Path, role: str) -> None:
        path = _write_native(
            tmp_path, role,
            _minimal_native(name=role, tools=["Read", "Edit", "Bash", "Glob", "Grep"]),
        )
        errors, _ = validate_native_agent(path)
        assert any("Edit" in e and "must not" in e for e in errors)

    @pytest.mark.parametrize("role", sorted(READ_ONLY_ROLES))
    def test_read_only_without_write_edit_passes(self, tmp_path: Path, role: str) -> None:
        path = _write_native(
            tmp_path, role,
            _minimal_native(name=role, tools=["Read", "Bash", "Glob", "Grep", "Agent"]),
        )
        errors, _ = validate_native_agent(path)
        assert not errors


# ---------------------------------------------------------------------------
# Write-capable role restrictions
# ---------------------------------------------------------------------------


class TestWriteCapableRoles:
    """Write-capable roles MUST have Write and Edit."""

    @pytest.mark.parametrize("role", sorted(WRITE_ROLES))
    def test_write_role_missing_write_errors(self, tmp_path: Path, role: str) -> None:
        path = _write_native(
            tmp_path, role,
            _minimal_native(name=role, tools=["Read", "Edit", "Bash", "Glob", "Grep"]),
        )
        errors, _ = validate_native_agent(path)
        assert any("Write" in e and "must have" in e for e in errors)

    @pytest.mark.parametrize("role", sorted(WRITE_ROLES))
    def test_write_role_missing_edit_errors(self, tmp_path: Path, role: str) -> None:
        path = _write_native(
            tmp_path, role,
            _minimal_native(name=role, tools=["Read", "Write", "Bash", "Glob", "Grep"]),
        )
        errors, _ = validate_native_agent(path)
        assert any("Edit" in e and "must have" in e for e in errors)

    @pytest.mark.parametrize("role", sorted(WRITE_ROLES))
    def test_write_role_with_both_passes(self, tmp_path: Path, role: str) -> None:
        path = _write_native(
            tmp_path, role,
            _minimal_native(name=role, tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"]),
        )
        errors, _ = validate_native_agent(path)
        assert not errors


# ---------------------------------------------------------------------------
# Integration: run() includes native agents
# ---------------------------------------------------------------------------


class TestRunIncludesNative:
    """The run() function must validate native agents alongside main/subagents."""

    def test_run_reports_native_errors(self, tmp_path: Path) -> None:
        """A native agent with invalid tools shows up in the report."""
        # Create minimal dist structure
        dist = tmp_path / "pennyfarthing-dist"
        agents = dist / "agents"
        native = agents / "native"
        native.mkdir(parents=True)

        # Write a broken native agent (reviewer with Write tool)
        (native / "reviewer.md").write_text(
            _minimal_native(name="reviewer", tools=["Read", "Write", "Bash"])
        )

        # Mock get_dist_root to return our tmp dist
        import pf.validate.adapters.agent as agent_mod
        original = agent_mod.get_dist_root

        def mock_dist_root(project_root: Path) -> Path:
            return dist

        agent_mod.get_dist_root = mock_dist_root
        try:
            report = run(tmp_path)
            error_msgs = [d for d in report.details if "[ERROR]" in d and "native/" in d]
            assert len(error_msgs) > 0
            assert any("Write" in e for e in error_msgs)
        finally:
            agent_mod.get_dist_root = original

    def test_run_counts_valid_native(self, tmp_path: Path) -> None:
        """A valid native agent increments the passed count."""
        dist = tmp_path / "pennyfarthing-dist"
        agents = dist / "agents"
        native = agents / "native"
        native.mkdir(parents=True)

        (native / "dev.md").write_text(
            _minimal_native(name="dev", tools=["Read", "Write", "Edit", "Bash"])
        )

        import pf.validate.adapters.agent as agent_mod
        original = agent_mod.get_dist_root

        def mock_dist_root(project_root: Path) -> Path:
            return dist

        agent_mod.get_dist_root = mock_dist_root
        try:
            report = run(tmp_path)
            # At minimum, the native agent should pass
            native_errors = [d for d in report.details if "native/" in d and "[ERROR]" in d]
            assert not native_errors
        finally:
            agent_mod.get_dist_root = original


# ---------------------------------------------------------------------------
# Real native agent files validation
# ---------------------------------------------------------------------------


class TestRealNativeAgents:
    """Validate the actual native agent files in the repo."""

    @pytest.fixture()
    def native_dir(self) -> Path | None:
        """Find the real native agents directory."""
        from pf.common.config import get_dist_root
        candidates = [
            get_dist_root() / "agents" / "native",
        ]
        for d in candidates:
            if d.is_dir():
                return d
        return None

    def test_all_native_agents_have_allowed_tools(self, native_dir: Path | None) -> None:
        if native_dir is None:
            pytest.skip("native agents dir not found")
        import yaml as _yaml

        for agent_file in sorted(native_dir.glob("*.md")):
            content = agent_file.read_text()
            parts = content.split("---", 2)
            assert len(parts) >= 3, f"{agent_file.name} missing frontmatter"
            meta = _yaml.safe_load(parts[1])
            assert "allowed-tools" in meta, (
                f"{agent_file.name} missing 'allowed-tools' in frontmatter"
            )

    def test_all_native_agents_pass_validation(self, native_dir: Path | None) -> None:
        if native_dir is None:
            pytest.skip("native agents dir not found")

        for agent_file in sorted(native_dir.glob("*.md")):
            errors, _ = validate_native_agent(agent_file)
            assert not errors, f"{agent_file.name} has errors: {errors}"

    def test_read_only_agents_lack_write_edit(self, native_dir: Path | None) -> None:
        if native_dir is None:
            pytest.skip("native agents dir not found")
        import yaml as _yaml

        for role in READ_ONLY_ROLES:
            agent_file = native_dir / f"{role}.md"
            if not agent_file.exists():
                continue
            content = agent_file.read_text()
            parts = content.split("---", 2)
            meta = _yaml.safe_load(parts[1])
            tools = meta.get("allowed-tools", [])
            assert "Write" not in tools, f"{role} should not have Write"
            assert "Edit" not in tools, f"{role} should not have Edit"

    def test_write_agents_have_write_edit(self, native_dir: Path | None) -> None:
        if native_dir is None:
            pytest.skip("native agents dir not found")
        import yaml as _yaml

        for role in WRITE_ROLES:
            agent_file = native_dir / f"{role}.md"
            if not agent_file.exists():
                continue
            content = agent_file.read_text()
            parts = content.split("---", 2)
            meta = _yaml.safe_load(parts[1])
            tools = meta.get("allowed-tools", [])
            assert "Write" in tools, f"{role} should have Write"
            assert "Edit" in tools, f"{role} should have Edit"
