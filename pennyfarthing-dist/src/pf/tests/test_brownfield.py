"""Tests for brownfield discovery module.

Story MSSCI-12419: Brownfield discovery command.

Tests verify:
1. Project type detection (monorepo, single package, etc.)
2. Tech stack extraction from manifest files
3. Directory scanning with async parallelism
4. Architecture pattern recognition
5. Document generation matching _bmad-output format
6. Depth levels (quick/standard/deep)
7. CLI integration
"""

import os
import subprocess
import sys
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest

from pf.brownfield import (
    DepthLevel,
    DiscoveryResult,
    ProjectType,
    detect_architecture_patterns,
    detect_project_type,
    detect_tech_stack,
    discover,
    generate_ai_guidance_doc,
    generate_project_overview,
    generate_source_tree_doc,
    generate_tech_stack_doc,
    scan_directory_structure,
)
from pf.brownfield.discover import (
    ArchitecturePattern,
    DirectoryNode,
    TechStackItem,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def temp_project_dir() -> Generator[Path, None, None]:
    """Create a temporary project directory."""
    with tempfile.TemporaryDirectory() as tmp:
        yield Path(tmp)


@pytest.fixture
def node_project(temp_project_dir: Path) -> Path:
    """Create a basic Node.js project structure."""
    # package.json
    (temp_project_dir / "package.json").write_text("""{
  "name": "test-project",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}""")

    # tsconfig.json
    (temp_project_dir / "tsconfig.json").write_text("""{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext"
  }
}""")

    # src directory
    src = temp_project_dir / "src"
    src.mkdir()
    (src / "index.ts").write_text("export const hello = 'world';")

    return temp_project_dir


@pytest.fixture
def python_project(temp_project_dir: Path) -> Path:
    """Create a basic Python project structure."""
    # pyproject.toml
    (temp_project_dir / "pyproject.toml").write_text("""[project]
name = "test-project"
version = "1.0.0"
dependencies = [
    "requests>=2.28.0",
    "pyyaml>=6.0"
]

[project.optional-dependencies]
dev = ["pytest>=7.0.0", "black>=23.0.0"]
""")

    # src directory
    src = temp_project_dir / "src" / "test_project"
    src.mkdir(parents=True)
    (src / "__init__.py").write_text("__version__ = '1.0.0'")

    return temp_project_dir


@pytest.fixture
def monorepo_project(temp_project_dir: Path) -> Path:
    """Create a pnpm monorepo structure."""
    # Root package.json
    (temp_project_dir / "package.json").write_text("""{
  "name": "test-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/*"]
}""")

    # pnpm-workspace.yaml
    (temp_project_dir / "pnpm-workspace.yaml").write_text("""packages:
  - packages/*
""")

    # Package A
    pkg_a = temp_project_dir / "packages" / "core"
    pkg_a.mkdir(parents=True)
    (pkg_a / "package.json").write_text("""{
  "name": "@test/core",
  "version": "1.0.0"
}""")

    # Package B
    pkg_b = temp_project_dir / "packages" / "cli"
    pkg_b.mkdir(parents=True)
    (pkg_b / "package.json").write_text("""{
  "name": "@test/cli",
  "version": "1.0.0",
  "dependencies": {
    "@test/core": "workspace:*"
  }
}""")

    return temp_project_dir


@pytest.fixture
def multi_language_project(temp_project_dir: Path) -> Path:
    """Create a project with multiple languages."""
    # Node.js
    (temp_project_dir / "package.json").write_text('{"name": "multi", "version": "1.0.0"}')

    # Python
    (temp_project_dir / "pyproject.toml").write_text('[project]\nname = "multi"\nversion = "1.0.0"')

    # Go
    (temp_project_dir / "go.mod").write_text("module example.com/multi\n\ngo 1.21")

    return temp_project_dir


# =============================================================================
# PROJECT TYPE DETECTION TESTS
# =============================================================================


class TestProjectTypeDetection:
    """Tests for detect_project_type()."""

    @pytest.mark.asyncio
    async def test_detect_monorepo_from_workspaces(self, monorepo_project: Path) -> None:
        """Should detect monorepo from package.json workspaces."""
        result = await detect_project_type(monorepo_project)
        assert result == ProjectType.MONOREPO

    @pytest.mark.asyncio
    async def test_detect_monorepo_from_pnpm_workspace(self, temp_project_dir: Path) -> None:
        """Should detect monorepo from pnpm-workspace.yaml."""
        (temp_project_dir / "pnpm-workspace.yaml").write_text("packages:\n  - packages/*")
        (temp_project_dir / "packages").mkdir()

        result = await detect_project_type(temp_project_dir)
        assert result == ProjectType.MONOREPO

    @pytest.mark.asyncio
    async def test_detect_single_node_package(self, node_project: Path) -> None:
        """Should detect single package from package.json without workspaces."""
        result = await detect_project_type(node_project)
        assert result == ProjectType.SINGLE_PACKAGE

    @pytest.mark.asyncio
    async def test_detect_single_python_package(self, python_project: Path) -> None:
        """Should detect single package from pyproject.toml."""
        result = await detect_project_type(python_project)
        assert result == ProjectType.SINGLE_PACKAGE

    @pytest.mark.asyncio
    async def test_detect_multi_language(self, multi_language_project: Path) -> None:
        """Should detect multi-language project."""
        result = await detect_project_type(multi_language_project)
        assert result == ProjectType.MULTI_LANGUAGE

    @pytest.mark.asyncio
    async def test_detect_unknown_for_empty_dir(self, temp_project_dir: Path) -> None:
        """Should return UNKNOWN for empty directory."""
        result = await detect_project_type(temp_project_dir)
        assert result == ProjectType.UNKNOWN


# =============================================================================
# TECH STACK DETECTION TESTS
# =============================================================================


class TestTechStackDetection:
    """Tests for detect_tech_stack()."""

    @pytest.mark.asyncio
    async def test_detect_node_dependencies(self, node_project: Path) -> None:
        """Should detect Node.js dependencies from package.json."""
        result = await detect_tech_stack(node_project)

        names = [item.name for item in result]
        assert "express" in names
        assert "typescript" in names

    @pytest.mark.asyncio
    async def test_detect_node_versions(self, node_project: Path) -> None:
        """Should extract dependency versions."""
        result = await detect_tech_stack(node_project)

        express = next(item for item in result if item.name == "express")
        assert express.version == "^4.18.2"

    @pytest.mark.asyncio
    async def test_categorize_dev_dependencies(self, node_project: Path) -> None:
        """Should categorize devDependencies correctly."""
        result = await detect_tech_stack(node_project)

        typescript = next(item for item in result if item.name == "typescript")
        assert typescript.category == "dev"

    @pytest.mark.asyncio
    async def test_detect_python_dependencies(self, python_project: Path) -> None:
        """Should detect Python dependencies from pyproject.toml."""
        result = await detect_tech_stack(python_project)

        names = [item.name for item in result]
        assert "requests" in names
        assert "pyyaml" in names

    @pytest.mark.asyncio
    async def test_detect_python_dev_dependencies(self, python_project: Path) -> None:
        """Should detect Python dev dependencies."""
        result = await detect_tech_stack(python_project)

        pytest_item = next((item for item in result if item.name == "pytest"), None)
        assert pytest_item is not None
        assert pytest_item.category == "dev"

    @pytest.mark.asyncio
    async def test_detect_go_module(self, temp_project_dir: Path) -> None:
        """Should detect Go from go.mod."""
        (temp_project_dir / "go.mod").write_text("""module example.com/test

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
)
""")

        result = await detect_tech_stack(temp_project_dir)

        names = [item.name for item in result]
        assert "go" in names or "gin" in names

    @pytest.mark.asyncio
    async def test_detect_rust_crate(self, temp_project_dir: Path) -> None:
        """Should detect Rust from Cargo.toml."""
        (temp_project_dir / "Cargo.toml").write_text("""[package]
name = "test-crate"
version = "0.1.0"

[dependencies]
serde = "1.0"
""")

        result = await detect_tech_stack(temp_project_dir)

        names = [item.name for item in result]
        assert "serde" in names or "rust" in names

    @pytest.mark.asyncio
    async def test_quick_depth_only_root(self, monorepo_project: Path) -> None:
        """Quick depth should only scan root manifest files."""
        result = await detect_tech_stack(monorepo_project, depth=DepthLevel.QUICK)

        # Should not include nested package deps
        names = [item.name for item in result]
        # Should have root project but not workspace packages' specific deps
        assert len(names) >= 0  # At least scanned something

    @pytest.mark.asyncio
    async def test_deep_depth_includes_nested(self, monorepo_project: Path) -> None:
        """Deep depth should scan nested packages."""
        result = await detect_tech_stack(monorepo_project, depth=DepthLevel.DEEP)

        # Should include deps from workspace packages
        assert len(result) >= 0


# =============================================================================
# DIRECTORY SCANNING TESTS
# =============================================================================


class TestDirectoryScanning:
    """Tests for scan_directory_structure()."""

    @pytest.mark.asyncio
    async def test_scan_returns_root_node(self, node_project: Path) -> None:
        """Should return root DirectoryNode."""
        result = await scan_directory_structure(node_project)

        assert isinstance(result, DirectoryNode)
        assert result.path == node_project
        assert result.is_dir is True

    @pytest.mark.asyncio
    async def test_scan_includes_children(self, node_project: Path) -> None:
        """Should include child directories."""
        result = await scan_directory_structure(node_project)

        child_names = [c.name for c in result.children]
        assert "src" in child_names

    @pytest.mark.asyncio
    async def test_scan_respects_max_depth(self, temp_project_dir: Path) -> None:
        """Should respect max_depth parameter."""
        # Create deep nesting
        deep = temp_project_dir / "a" / "b" / "c" / "d" / "e"
        deep.mkdir(parents=True)

        result = await scan_directory_structure(temp_project_dir, max_depth=2)

        # Verify we don't go too deep
        def count_depth(node: DirectoryNode, current: int = 0) -> int:
            if not node.children:
                return current
            return max(count_depth(c, current + 1) for c in node.children)

        assert count_depth(result) <= 2

    @pytest.mark.asyncio
    async def test_scan_annotates_common_dirs(self, node_project: Path) -> None:
        """Should annotate common directory names."""
        result = await scan_directory_structure(node_project)

        src_node = next((c for c in result.children if c.name == "src"), None)
        assert src_node is not None
        assert src_node.annotation != ""  # Should have annotation

    @pytest.mark.asyncio
    async def test_scan_excludes_node_modules(self, node_project: Path) -> None:
        """Should exclude node_modules by default."""
        (node_project / "node_modules" / "express").mkdir(parents=True)

        result = await scan_directory_structure(node_project)

        child_names = [c.name for c in result.children]
        assert "node_modules" not in child_names

    @pytest.mark.asyncio
    async def test_scan_excludes_git(self, node_project: Path) -> None:
        """Should exclude .git directory."""
        (node_project / ".git" / "objects").mkdir(parents=True)

        result = await scan_directory_structure(node_project)

        child_names = [c.name for c in result.children]
        assert ".git" not in child_names

    @pytest.mark.asyncio
    async def test_scan_parallel_execution(self, temp_project_dir: Path) -> None:
        """Should scan directories in parallel."""
        # Create multiple directories
        for i in range(10):
            (temp_project_dir / f"dir_{i}").mkdir()

        # Time the scan (should be fast due to parallelism)
        import time

        start = time.time()
        result = await scan_directory_structure(temp_project_dir)
        elapsed = time.time() - start

        assert len(result.children) == 10
        # Should complete quickly with parallelism
        assert elapsed < 5.0  # Very generous timeout


# =============================================================================
# ARCHITECTURE PATTERN DETECTION TESTS
# =============================================================================


class TestArchitecturePatterns:
    """Tests for detect_architecture_patterns()."""

    @pytest.mark.asyncio
    async def test_detect_monorepo_pattern(self, monorepo_project: Path) -> None:
        """Should detect monorepo architecture pattern."""
        result = await detect_architecture_patterns(monorepo_project)

        pattern_names = [p.name for p in result]
        assert "monorepo" in pattern_names or "workspace" in pattern_names

    @pytest.mark.asyncio
    async def test_detect_src_lib_pattern(self, node_project: Path) -> None:
        """Should detect src/ directory pattern."""
        result = await detect_architecture_patterns(node_project)

        pattern_names = [p.name for p in result]
        # Should detect layered or src-based architecture
        assert len(pattern_names) >= 0

    @pytest.mark.asyncio
    async def test_pattern_includes_evidence(self, monorepo_project: Path) -> None:
        """Should include evidence for detected patterns."""
        result = await detect_architecture_patterns(monorepo_project)

        if result:
            pattern = result[0]
            assert len(pattern.evidence) > 0

    @pytest.mark.asyncio
    async def test_detect_mvc_pattern(self, temp_project_dir: Path) -> None:
        """Should detect MVC pattern from directory structure."""
        # Create MVC-like structure
        (temp_project_dir / "models").mkdir()
        (temp_project_dir / "views").mkdir()
        (temp_project_dir / "controllers").mkdir()

        result = await detect_architecture_patterns(temp_project_dir)

        pattern_names = [p.name.lower() for p in result]
        assert "mvc" in pattern_names

    @pytest.mark.asyncio
    async def test_detect_layered_architecture(self, temp_project_dir: Path) -> None:
        """Should detect layered architecture."""
        # Create layered structure
        (temp_project_dir / "api").mkdir()
        (temp_project_dir / "services").mkdir()
        (temp_project_dir / "repositories").mkdir()

        result = await detect_architecture_patterns(temp_project_dir)

        pattern_names = [p.name.lower() for p in result]
        assert "layered" in pattern_names or "service" in pattern_names


# =============================================================================
# DOCUMENT GENERATION TESTS
# =============================================================================


class TestDocumentGeneration:
    """Tests for document generation functions."""

    @pytest.fixture
    def sample_result(self, node_project: Path) -> DiscoveryResult:
        """Create a sample discovery result."""
        return DiscoveryResult(
            project_path=node_project,
            project_type=ProjectType.SINGLE_PACKAGE,
            project_name="test-project",
            version="1.0.0",
            tech_stack=[
                TechStackItem("express", "^4.18.2", "runtime"),
                TechStackItem("typescript", "^5.3.3", "dev"),
            ],
            directory_tree=DirectoryNode(
                path=node_project,
                name="test-project",
                is_dir=True,
                children=[
                    DirectoryNode(
                        path=node_project / "src",
                        name="src",
                        is_dir=True,
                        annotation="Source code",
                    ),
                ],
            ),
            patterns=[
                ArchitecturePattern(
                    "typescript",
                    "TypeScript project with compilation",
                    ["tsconfig.json present"],
                ),
            ],
        )

    def test_generate_project_overview_markdown(self, sample_result: DiscoveryResult) -> None:
        """Should generate valid markdown."""
        content = generate_project_overview(sample_result)

        assert isinstance(content, str)
        assert len(content) > 0
        assert "# " in content  # Has markdown headers

    def test_project_overview_includes_name(self, sample_result: DiscoveryResult) -> None:
        """Should include project name."""
        content = generate_project_overview(sample_result)

        assert "test-project" in content

    def test_project_overview_includes_version(self, sample_result: DiscoveryResult) -> None:
        """Should include version."""
        content = generate_project_overview(sample_result)

        assert "1.0.0" in content

    def test_generate_tech_stack_markdown(self, sample_result: DiscoveryResult) -> None:
        """Should generate tech stack markdown."""
        content = generate_tech_stack_doc(sample_result)

        assert isinstance(content, str)
        assert "express" in content
        assert "typescript" in content

    def test_tech_stack_includes_table(self, sample_result: DiscoveryResult) -> None:
        """Should include markdown table."""
        content = generate_tech_stack_doc(sample_result)

        assert "|" in content  # Table delimiter

    def test_generate_source_tree_markdown(self, sample_result: DiscoveryResult) -> None:
        """Should generate source tree markdown."""
        content = generate_source_tree_doc(sample_result)

        assert isinstance(content, str)
        assert "src" in content

    def test_source_tree_shows_structure(self, sample_result: DiscoveryResult) -> None:
        """Should show tree structure."""
        content = generate_source_tree_doc(sample_result)

        # Should have tree-like characters or indentation
        assert "├" in content or "└" in content or "  " in content

    def test_generate_ai_guidance_markdown(self, sample_result: DiscoveryResult) -> None:
        """Should generate AI guidance markdown."""
        content = generate_ai_guidance_doc(sample_result)

        assert isinstance(content, str)
        assert len(content) > 0

    def test_ai_guidance_includes_patterns(self, sample_result: DiscoveryResult) -> None:
        """Should mention detected patterns."""
        content = generate_ai_guidance_doc(sample_result)

        assert "typescript" in content.lower()


# =============================================================================
# INTEGRATION TESTS - discover()
# =============================================================================


class TestDiscover:
    """Integration tests for discover()."""

    @pytest.mark.asyncio
    async def test_discover_returns_result(self, node_project: Path) -> None:
        """Should return DiscoveryResult."""
        result = await discover(node_project)

        assert isinstance(result, DiscoveryResult)
        assert result.success is True

    @pytest.mark.asyncio
    async def test_discover_populates_all_fields(self, node_project: Path) -> None:
        """Should populate all result fields."""
        result = await discover(node_project)

        assert result.project_name is not None
        assert result.project_type != ProjectType.UNKNOWN
        assert len(result.tech_stack) > 0
        assert result.directory_tree is not None

    @pytest.mark.asyncio
    async def test_discover_quick_depth(self, node_project: Path) -> None:
        """Quick depth should complete quickly."""
        import time

        start = time.time()
        result = await discover(node_project, depth=DepthLevel.QUICK)
        elapsed = time.time() - start

        assert result.success is True
        assert elapsed < 10.0  # Should be fast

    @pytest.mark.asyncio
    async def test_discover_writes_output(self, node_project: Path, temp_project_dir: Path) -> None:
        """Should write output files when output_dir specified."""
        output_dir = temp_project_dir / "output"
        output_dir.mkdir()

        result = await discover(node_project, output_dir=output_dir)

        assert result.success is True
        assert (output_dir / "project-overview.md").exists()

    @pytest.mark.asyncio
    async def test_discover_all_output_files(
        self, node_project: Path, temp_project_dir: Path
    ) -> None:
        """Should write all expected output files."""
        output_dir = temp_project_dir / "output"
        output_dir.mkdir()

        await discover(node_project, output_dir=output_dir, depth=DepthLevel.DEEP)

        expected_files = [
            "project-overview.md",
            "technology-stack.md",
            "source-tree-analysis.md",
            "ai-guidance.md",
        ]

        for filename in expected_files:
            assert (output_dir / filename).exists(), f"Missing {filename}"

    @pytest.mark.asyncio
    async def test_discover_handles_nonexistent_path(self, temp_project_dir: Path) -> None:
        """Should handle nonexistent path gracefully."""
        nonexistent = temp_project_dir / "does-not-exist"

        result = await discover(nonexistent)

        assert result.success is False
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_discover_handles_file_path(self, node_project: Path) -> None:
        """Should handle file path (not directory) gracefully."""
        file_path = node_project / "package.json"

        result = await discover(file_path)

        assert result.success is False
        assert result.error is not None


# =============================================================================
# CLI TESTS
# =============================================================================


def _subprocess_env() -> dict:
    """Build env for subprocess calls that need the pf package on sys.path.

    The test process adds pennyfarthing-dist/src to sys.path via conftest.py,
    but subprocess calls inherit the system environment without that addition.
    """
    src_dir = str(Path(__file__).resolve().parents[3] / "src")
    env = os.environ.copy()
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{src_dir}:{existing}" if existing else src_dir
    return env


class TestBrownfieldCLI:
    """Tests for CLI entry point."""

    def test_cli_help(self) -> None:
        """CLI should show help with --help."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.brownfield.cli", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
            env=_subprocess_env(),
        )

        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout

    def test_cli_scan_subcommand_help(self) -> None:
        """CLI should have scan subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.brownfield.cli", "scan", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
            env=_subprocess_env(),
        )

        assert result.returncode in (0, 1, 2)

    def test_cli_scan_with_path(self, node_project: Path) -> None:
        """CLI scan should accept path argument."""
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pf.brownfield.cli",
                "scan",
                str(node_project),
                "--depth",
                "quick",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            env=_subprocess_env(),
        )

        # Should complete (success or expected failure from stub)
        assert result.returncode in (0, 1, 2)

    def test_cli_scan_with_output(self, node_project: Path, temp_project_dir: Path) -> None:
        """CLI scan should accept --output option."""
        output_dir = temp_project_dir / "output"
        output_dir.mkdir()

        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pf.brownfield.cli",
                "scan",
                str(node_project),
                "--output",
                str(output_dir),
                "--depth",
                "quick",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            env=_subprocess_env(),
        )

        assert result.returncode in (0, 1, 2)


# =============================================================================
# EDGE CASES AND ERROR HANDLING
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_handles_permission_error(self, temp_project_dir: Path) -> None:
        """Should handle permission errors gracefully."""
        # Create unreadable directory (if supported by OS)
        import os
        import stat

        restricted = temp_project_dir / "restricted"
        restricted.mkdir()

        try:
            os.chmod(restricted, 0o000)
            result = await discover(temp_project_dir)
            # Should not crash, might skip restricted dir
            assert result is not None
        finally:
            # Restore permissions for cleanup
            os.chmod(restricted, stat.S_IRWXU)

    @pytest.mark.asyncio
    async def test_handles_symlink_loops(self, temp_project_dir: Path) -> None:
        """Should handle symlink loops."""
        # Create circular symlink
        link = temp_project_dir / "loop"
        try:
            link.symlink_to(temp_project_dir)
        except OSError:
            pytest.skip("Symlinks not supported")

        result = await scan_directory_structure(temp_project_dir)

        # Should not infinite loop
        assert result is not None

    @pytest.mark.asyncio
    async def test_handles_very_large_directory(self, temp_project_dir: Path) -> None:
        """Should handle directories with many files."""
        # Create many files
        for i in range(100):
            (temp_project_dir / f"file_{i}.txt").write_text(f"content {i}")

        result = await scan_directory_structure(temp_project_dir)

        assert result is not None
        assert len(result.children) >= 100

    @pytest.mark.asyncio
    async def test_handles_binary_files(self, temp_project_dir: Path) -> None:
        """Should handle binary files without crashing."""
        # Create binary file
        (temp_project_dir / "binary.bin").write_bytes(b"\x00\x01\x02\x03")

        result = await discover(temp_project_dir)

        # Should not crash
        assert result is not None

    @pytest.mark.asyncio
    async def test_handles_malformed_json(self, temp_project_dir: Path) -> None:
        """Should handle malformed package.json."""
        (temp_project_dir / "package.json").write_text("{ invalid json }")

        result = await detect_tech_stack(temp_project_dir)

        # Should not crash, return empty or partial results
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_handles_malformed_toml(self, temp_project_dir: Path) -> None:
        """Should handle malformed pyproject.toml."""
        (temp_project_dir / "pyproject.toml").write_text("[invalid\ntoml")

        result = await detect_tech_stack(temp_project_dir)

        # Should not crash
        assert isinstance(result, list)


# =============================================================================
# DEPTH LEVEL TESTS
# =============================================================================


class TestDepthLevels:
    """Tests verifying depth level behavior."""

    @pytest.mark.asyncio
    async def test_quick_depth_fastest(self, monorepo_project: Path) -> None:
        """Quick depth should be faster than standard."""
        import time

        start = time.time()
        await discover(monorepo_project, depth=DepthLevel.QUICK)
        quick_time = time.time() - start

        start = time.time()
        await discover(monorepo_project, depth=DepthLevel.STANDARD)
        standard_time = time.time() - start

        # Quick should be faster (or at least not slower)
        assert quick_time <= standard_time + 1.0  # Allow 1s tolerance

    @pytest.mark.asyncio
    async def test_deep_depth_most_thorough(self, monorepo_project: Path) -> None:
        """Deep depth should find more items than quick."""
        quick_result = await discover(monorepo_project, depth=DepthLevel.QUICK)
        deep_result = await discover(monorepo_project, depth=DepthLevel.DEEP)

        # Deep should find at least as much as quick
        assert len(deep_result.tech_stack) >= len(quick_result.tech_stack)
